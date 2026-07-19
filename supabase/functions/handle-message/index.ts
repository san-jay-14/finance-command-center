// Intent router (build-order step 4, extended in step 6 for non-stock asset
// classes, step 7 for recurring contribution rules, step 9 for the
// affordability engine). Text input only, no guardrails yet. log_transaction
// logs directly — no broker execution, no confirm-before-execute flow. Those
// are later, explicitly deferred steps (tax engine, step 8, is on hold too).
import Anthropic from "npm:@anthropic-ai/sdk";
import {
  DEFAULT_ASSET_NAMES,
  findExistingAsset,
  findOrCreateAsset,
  reduceLotForSale,
  symbolForAsset,
  upsertLotForPurchase,
} from "../_shared/assets.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { advanceDate, today } from "../_shared/dates.ts";
import { broadcastRealtime } from "../_shared/realtimeBroadcast.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";

// Per-owner topic (PROJECT_BRIEF_demo_and_connect.md step 9 write-path
// safety pass) — was a single global "transactions" string, which meant
// every connected browser tab (any visitor) got toasted for every other
// visitor's voice-logged activity. ownerId is interpolated in per request.
function transactionsTopic(ownerId: string): string {
  return `transactions:${ownerId}`;
}

function buildSystemPrompt(todayStr: string, openWindowTitles: string[]): string {
  const openWindowsLine =
    openWindowTitles.length > 0
      ? `Currently open windows on screen (exact titles): ${openWindowTitles.map((t) => `"${t}"`).join(", ")}.`
      : "There are currently no windows open on screen.";

  return `You are the intent router for a personal finance assistant. Today's date is ${todayStr}. ${openWindowsLine} Given the user's message, call exactly one tool:

- log_transaction: the user is stating they bought or sold something and gave enough detail to log it (asset class, action, and quantity at minimum). Estimate "amount" (total transaction value) from what they said if possible. For gold/real_estate/other/mutual_fund, include asset_name — a short label for what was bought (e.g. "flat", "car", "Gold"). For mutual funds, include scheme_code if the user gives one (an MFAPI.in scheme code); if they don't, omit it — a NAV can't be looked up without it.
- update_asset_value: the user is stating a NEW current worth for something they already own (e.g. "my flat is now worth 55 lakh") — this revises a stored estimate, it is not a new purchase. Only valid for real_estate and other.
- create_recurring_rule: the user is setting up a STANDING recurring contribution (e.g. "I'm investing 3k in gold every month"), not a one-time purchase. The actual purchase happens later on schedule, not immediately.
- update_financial_profile: the user is stating a fact about their income, expenses, or existing EMI obligations (e.g. "my monthly income is 1.2 lakh", "my monthly expenses are 40k", "I have an existing EMI of 15000"). Only set the field(s) they actually stated.
- check_affordability: the user is asking whether they can afford a purchase (e.g. "can I afford an 8 lakh car", "can I afford this in cash", "...with a 15000 monthly EMI"). If they mention financing/EMI, pass new_emi; if it's cash, omit it.
- run_backtest: the user is asking a hypothetical "what if I had invested X" question (e.g. "if I had invested 5000 rupees monthly in TSLA for the last year, what would it be worth now", "if I had put 50000 rupees in NVDA a year ago"). Resolve the natural-language timeframe into concrete from_date/to_date (ISO yyyy-mm-dd) yourself using today's date above. "every month"/"monthly"/"SIP" language means strategy_type='monthly_sip'; a single one-time amount means strategy_type='lump_sum'. Only these two strategies exist — don't invent others.
- show_price_chart: the user just wants to see a symbol's real price history, e.g. "show me TSLA's chart", "how has NVDA been doing this month" — NOT an investment simulation (that's run_backtest) and NOT a two-symbol comparison (that's render_ui's comparison_chart). Resolve the timeframe into concrete from_date/to_date yourself; if no timeframe is mentioned, default to the last 3 months.
- render_ui: the user is asking a question best answered with a chart or visualization rather than a text answer.
- close_window: the user wants to close one or more specific open windows (e.g. "close the asset distribution", "close that chart"). Match their words against the exact open window titles listed above and pass back only the exact titles that match — if several open windows plausibly match what they said, include all of them. Never invent a title that isn't in the open list.
- close_all_windows: the user wants to close everything currently open (e.g. "close all", "close everything").
- show_activity_history: the user wants to see their full transaction/activity history (e.g. "show my activity history", "what have I bought recently").
- ask_clarification: a required detail is genuinely missing or ambiguous (e.g. "sell some TSLA" doesn't say how many shares). Ask one short, specific question.

Do not discuss broker order execution or taxes — the tax engine isn't implemented yet. Just route the intent.`;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "log_transaction",
    description:
      "Log a buy/sell/manual_entry transaction. For non-stock classes (mutual_fund, gold, real_estate, other) this also creates the asset/lot if it doesn't exist yet, or adds to it if it does.",
    input_schema: {
      type: "object",
      properties: {
        asset_class: {
          type: "string",
          enum: ["stock", "mutual_fund", "gold", "real_estate", "other"],
          description: "Asset class of what was transacted",
        },
        action: {
          type: "string",
          enum: ["buy", "sell", "manual_entry"],
        },
        quantity: {
          type: "number",
          description: "Quantity transacted, e.g. number of shares, fund units, or grams. Use 1 for real_estate/other.",
        },
        amount: {
          type: "number",
          description:
            "Total monetary value of the transaction (quantity * price). Best estimate if not explicitly stated.",
        },
        asset_name: {
          type: "string",
          description:
            "Short label for the asset, used for mutual_fund/gold/real_estate/other (e.g. 'flat', 'car', 'Gold'). Not needed for stock.",
        },
        scheme_code: {
          type: "string",
          description: "MFAPI.in scheme code, only for mutual_fund purchases where the user gave/implied one.",
        },
      },
      required: ["asset_class", "action", "quantity"],
    },
  },
  {
    name: "update_asset_value",
    description:
      "Update the stored current value of an existing manually-priced asset (real_estate or other) when the user states a new estimate. Does not log a transaction — just revises the stored value.",
    input_schema: {
      type: "object",
      properties: {
        asset_class: { type: "string", enum: ["real_estate", "other"] },
        asset_name: { type: "string", description: "Name/label identifying which asset, e.g. 'flat', 'car'" },
        new_value: { type: "number" },
      },
      required: ["asset_class", "asset_name", "new_value"],
    },
  },
  {
    name: "create_recurring_rule",
    description:
      "Create a standing recurring contribution rule, e.g. 'I'm investing 3k in gold every month'. This only schedules the rule — the purchase itself happens later when process-recurring-rules runs, not immediately.",
    input_schema: {
      type: "object",
      properties: {
        asset_class: { type: "string", enum: ["stock", "mutual_fund", "gold", "real_estate", "other"] },
        amount: { type: "number", description: "Amount to contribute each period" },
        frequency: { type: "string", enum: ["daily", "weekly", "monthly"] },
      },
      required: ["asset_class", "amount", "frequency"],
    },
  },
  {
    name: "update_financial_profile",
    description:
      "Update the user's financial profile (monthly income, monthly expenses, and/or existing EMI obligations). Only include the field(s) the user actually stated.",
    input_schema: {
      type: "object",
      properties: {
        monthly_income: { type: "number" },
        monthly_expenses: { type: "number" },
        existing_emis: { type: "number", description: "Total existing monthly EMI obligations" },
      },
    },
  },
  {
    name: "check_affordability",
    description:
      "Check whether the user can afford a purchase: runs an emergency-fund check, an FOIR/40% check (only if financed), and shows an opportunity-cost note.",
    input_schema: {
      type: "object",
      properties: {
        item_description: { type: "string", description: "Short description of the purchase, e.g. 'a car'" },
        cost: { type: "number" },
        new_emi: { type: "number", description: "Monthly EMI if financed. Omit entirely for a cash purchase." },
      },
      required: ["item_description", "cost"],
    },
  },
  {
    name: "run_backtest",
    description:
      "Simulate a hypothetical past investment: 'lump_sum' (invest once at the start of the range) or 'monthly_sip' (invest every month across the range) using real historical prices. Returns total invested, current value, and return.",
    input_schema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "NSE/BSE trading symbol, e.g. 'TSLA', 'NVDA', 'COALINDIA'" },
        strategy_type: { type: "string", enum: ["lump_sum", "monthly_sip"] },
        amount: { type: "number", description: "Amount invested once (lump_sum) or per month (monthly_sip)" },
        from_date: { type: "string", description: "Start of the backtest range, ISO yyyy-mm-dd" },
        to_date: { type: "string", description: "End of the backtest range, ISO yyyy-mm-dd (usually today)" },
      },
      required: ["symbol", "strategy_type", "amount", "from_date", "to_date"],
    },
  },
  {
    name: "show_price_chart",
    description:
      "Show a real candlestick price chart for a single symbol — not an investment simulation (run_backtest) and not a two-symbol comparison (render_ui's comparison_chart).",
    input_schema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "NSE/BSE trading symbol, e.g. 'TSLA', 'NVDA', 'COALINDIA'" },
        from_date: { type: "string", description: "Start of the range, ISO yyyy-mm-dd. Default to 3 months ago if unspecified." },
        to_date: { type: "string", description: "End of the range, ISO yyyy-mm-dd (usually today)" },
      },
      required: ["symbol", "from_date", "to_date"],
    },
  },
  {
    name: "render_ui",
    description:
      "Render a chart/visualization in the app's central canvas by returning a structured component spec. Known components: comparison_chart, asset_distribution, portfolio_summary, affordability_result.",
    input_schema: {
      type: "object",
      properties: {
        component: {
          type: "string",
          enum: ["comparison_chart", "asset_distribution", "portfolio_summary", "affordability_result"],
        },
        data: {
          type: "object",
          description: "Component-specific data payload, e.g. {symbols:[...], range:'6M'} for comparison_chart",
        },
      },
      required: ["component", "data"],
    },
  },
  {
    name: "close_window",
    description:
      "Close one or more currently open windows by exact title, e.g. 'close the asset distribution'. Pass back the exact title string(s) from the open-windows list given in the system prompt — never a title that isn't currently open.",
    input_schema: {
      type: "object",
      properties: {
        titles: {
          type: "array",
          items: { type: "string" },
          description: "Exact title(s), copied verbatim from the currently-open-windows list, to close.",
        },
      },
      required: ["titles"],
    },
  },
  {
    name: "close_all_windows",
    description: "Close every currently open window, e.g. 'close all' or 'close everything'.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "show_activity_history",
    description: "Show the user's full transaction/activity history in a window, e.g. 'show my activity history'.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "ask_clarification",
    description:
      "Ask the user a short clarifying question when their command is ambiguous instead of guessing a missing required detail.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string" },
      },
      required: ["question"],
    },
  },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  // Requires a real signed-in session (PROJECT_BRIEF_demo_and_connect.md
  // step 9) — previously took a client-supplied user_id and wrote straight
  // into the founder's single legacy dataset regardless of who or what mode
  // was asking. ownerId is always derived from the verified JWT below,
  // never trusted from the request body.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header — sign in to use the voice assistant" }, 401);
  }

  let body: { message?: string; open_window_titles?: string[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { message, open_window_titles: openWindowTitles = [] } = body;
  if (!message) {
    return json({ error: "message is required" }, 400);
  }

  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) {
    return json({ error: "ANTHROPIC_API_KEY is not configured as a project secret" }, 500);
  }

  const supabase = createAdminClient();

  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !userData.user) {
    return json({ error: "Invalid or expired session" }, 401);
  }
  const ownerId = userData.user.id;

  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  // Check pending_intents first — a short reply like "5" should resolve
  // against the earlier question, not get parsed as a fresh command.
  const { data: pendingRows, error: pendingError } = await supabase
    .from("pending_intents")
    .select("id, question, context")
    .eq("owner_id", ownerId)
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(1);

  if (pendingError) {
    return json({ error: pendingError.message }, 500);
  }

  const pending = pendingRows?.[0] ?? null;

  const userContent = pending
    ? `Earlier you asked for clarification on an ambiguous command: "${pending.context?.original_message ?? ""}"\n` +
      `Your clarifying question was: "${pending.question}"\n` +
      `The user's reply is: "${message}"\n` +
      `Resolve the original command using this reply — it answers your question, it is not a new unrelated command.`
    : message;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    system: buildSystemPrompt(today(), openWindowTitles),
    tools: TOOLS,
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );

  if (!toolUse) {
    const textBlock = response.content.find((b) => b.type === "text");
    return json({
      tool: null,
      message: textBlock && "text" in textBlock ? textBlock.text : "Claude did not call a tool.",
    });
  }

  // The pending intent has now been consumed as context for this turn.
  if (pending) {
    await supabase.from("pending_intents").update({ resolved: true }).eq("id", pending.id);
  }

  const input = toolUse.input as Record<string, unknown>;

  switch (toolUse.name) {
    case "log_transaction": {
      const assetClass = input.asset_class as string;
      const action = input.action as string;
      const quantity = Number(input.quantity ?? 0);
      const amount = Number(input.amount ?? 0);
      const assetName = (input.asset_name as string | undefined) ?? DEFAULT_ASSET_NAMES[assetClass] ?? assetClass;
      const schemeCode = input.scheme_code as string | undefined;

      let assetId: string | null = null;
      let sellNote = "";

      // Stock assets are created/synced by the relay service, not here (see
      // relay-service/app/holdings_sync.py) — "sell" against stocks happens
      // via the real broker, not this manual path.
      if (assetClass !== "stock" && (action === "buy" || action === "manual_entry")) {
        try {
          const symbol = symbolForAsset(assetClass, schemeCode);
          const asset = await findOrCreateAsset(supabase, ownerId, assetClass, assetName, symbol);
          assetId = asset.id;
          if (asset.created && (assetClass === "real_estate" || assetClass === "other")) {
            await supabase.from("assets").update({ manual_current_value: amount }).eq("id", asset.id);
          }
          await upsertLotForPurchase(supabase, assetId, quantity, amount);
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : String(err) }, 500);
        }
      } else if (assetClass !== "stock" && action === "sell") {
        try {
          const symbol = symbolForAsset(assetClass, schemeCode);
          const existingId = await findExistingAsset(supabase, ownerId, assetClass, assetName, symbol);
          if (existingId) {
            assetId = existingId;
            await reduceLotForSale(supabase, existingId, quantity);
          } else {
            sellNote = ` (no matching ${assetName} holding found — logged without linking it to an asset)`;
          }
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : String(err) }, 500);
        }
      }

      const { data, error } = await supabase
        .from("transactions")
        .insert({ owner_id: ownerId, asset_id: assetId, action, quantity, amount, source: "voice" })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);

      await broadcastRealtime(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        transactionsTopic(ownerId),
        "new",
        { action, quantity, amount, asset_name: assetName, asset_class: assetClass, source: "voice" },
      );

      return json({
        tool: "log_transaction",
        message: `Logged: ${action} ${quantity} ${assetName} (${assetClass}), amount ~${amount}.${sellNote}`,
        transaction: data,
      });
    }
    case "update_asset_value": {
      const assetClass = input.asset_class as string;
      const assetName = input.asset_name as string;
      const newValue = Number(input.new_value);

      const { data: existing, error: findError } = await supabase
        .from("assets")
        .select("id, name")
        .eq("owner_id", ownerId)
        .eq("asset_class", assetClass)
        .ilike("name", `%${assetName}%`)
        .limit(1);

      if (findError) return json({ error: findError.message }, 500);
      if (!existing || existing.length === 0) {
        return json({
          tool: "update_asset_value",
          message: `I couldn't find an existing ${assetClass} asset matching "${assetName}" to update.`,
        });
      }

      const { error: updateError } = await supabase
        .from("assets")
        .update({ manual_current_value: newValue })
        .eq("id", existing[0].id);
      if (updateError) return json({ error: updateError.message }, 500);

      return json({
        tool: "update_asset_value",
        message: `Updated ${existing[0].name} to ₹${newValue.toLocaleString("en-IN")}.`,
      });
    }
    case "create_recurring_rule": {
      const assetClass = input.asset_class as string;
      const amount = Number(input.amount);
      const frequency = input.frequency as string;
      const assetName = DEFAULT_ASSET_NAMES[assetClass] ?? assetClass;

      // Deliberately does NOT create the asset now — only on first actual
      // run (process-recurring-rules), per the spec. If one already exists,
      // link it now so projections/valuation can use it immediately.
      let assetId: string | null = null;
      try {
        assetId =
          assetClass !== "stock"
            ? await findExistingAsset(supabase, ownerId, assetClass, assetName, symbolForAsset(assetClass))
            : null;
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }

      const nextRunDate = advanceDate(today(), frequency);

      const { data, error } = await supabase
        .from("recurring_rules")
        .insert({
          owner_id: ownerId,
          asset_class: assetClass,
          asset_id: assetId,
          amount,
          frequency,
          next_run_date: nextRunDate,
          active: true,
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);

      return json({
        tool: "create_recurring_rule",
        message: `Set up a recurring ${frequency} contribution of ₹${amount} to ${assetName}. First run: ${nextRunDate}.`,
        rule: data,
      });
    }
    case "update_financial_profile": {
      const updates: Record<string, number> = {};
      if (input.monthly_income != null) updates.monthly_income = Number(input.monthly_income);
      if (input.monthly_expenses != null) updates.monthly_expenses = Number(input.monthly_expenses);
      if (input.existing_emis != null) updates.existing_emis = Number(input.existing_emis);

      if (Object.keys(updates).length === 0) {
        return json({ tool: "update_financial_profile", message: "I didn't catch a value to update." });
      }

      const { data: existing, error: findError } = await supabase
        .from("financial_profile")
        .select("id")
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (findError) return json({ error: findError.message }, 500);

      const result = existing
        ? await supabase.from("financial_profile").update(updates).eq("owner_id", ownerId).select().single()
        : await supabase.from("financial_profile").insert({ owner_id: ownerId, ...updates }).select().single();
      if (result.error) return json({ error: result.error.message }, 500);

      const parts = Object.entries(updates)
        .map(([k, v]) => `${k.replace(/_/g, " ")}=₹${Number(v).toLocaleString("en-IN")}`)
        .join(", ");
      return json({
        tool: "update_financial_profile",
        message: `Updated your financial profile: ${parts}.`,
        profile: result.data,
      });
    }
    case "check_affordability": {
      const itemDescription = input.item_description as string;
      const cost = Number(input.cost);
      const newEmi = input.new_emi != null ? Number(input.new_emi) : undefined;

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const affordabilityRes = await fetch(`${supabaseUrl}/functions/v1/check-affordability`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
        body: JSON.stringify({ owner_id: ownerId, purchase_amount: cost, new_emi: newEmi }),
      });
      const affordabilityResult = await affordabilityRes.json();
      if (!affordabilityRes.ok) {
        return json({ error: affordabilityResult.error ?? "check-affordability call failed" }, 500);
      }

      // Ask Claude to narrate the result naturally instead of dumping raw numbers.
      const narration = await anthropic.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1024,
        thinking: { type: "adaptive" },
        system:
          "You just ran an affordability check for the user's purchase. Explain which checks passed/failed and by how much, mention the opportunity cost as informational context (never as a pass/fail), and let them decide — don't just answer yes/no. Be concise and specific with rupee amounts.",
        messages: [
          {
            role: "user",
            content:
              `The user asked: "can I afford ${itemDescription} (₹${cost})` +
              `${newEmi ? ` with a ₹${newEmi}/month EMI` : " in cash"}?"\n\n` +
              `Affordability check result:\n${JSON.stringify(affordabilityResult, null, 2)}\n\n` +
              `Summarize this for the user in plain language.`,
          },
        ],
      });
      const narrationBlock = narration.content.find((b) => b.type === "text");
      const summary = narrationBlock && "text" in narrationBlock ? narrationBlock.text : "Here's your affordability check.";

      return json({ tool: "check_affordability", message: summary, result: affordabilityResult });
    }
    case "run_backtest": {
      const symbol = input.symbol as string;
      const strategyType = input.strategy_type as string;
      const amount = Number(input.amount);
      const fromDate = input.from_date as string;
      const toDate = input.to_date as string;

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const backtestRes = await fetch(`${supabaseUrl}/functions/v1/run-backtest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
        body: JSON.stringify({ symbol, strategy_type: strategyType, amount, from_date: fromDate, to_date: toDate }),
      });
      const backtestResult = await backtestRes.json();
      if (!backtestRes.ok) {
        return json({ error: backtestResult.error ?? "run-backtest call failed" }, 500);
      }

      // Ask Claude to narrate the result naturally instead of dumping raw numbers.
      const narration = await anthropic.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1024,
        thinking: { type: "adaptive" },
        system:
          "You just ran a backtest simulating a hypothetical past investment. Explain total invested, current value, and the return (absolute and %) in plain language, using real historical prices. Be concise and specific with rupee amounts.",
        messages: [
          {
            role: "user",
            content:
              `The user asked a hypothetical "what if I had invested" question about ${symbol} ` +
              `(${strategyType === "monthly_sip" ? `₹${amount}/month` : `₹${amount} lump sum`} from ${fromDate} to ${toDate}).\n\n` +
              `Backtest result:\n${JSON.stringify(backtestResult, null, 2)}\n\n` +
              `Summarize this for the user in plain language.`,
          },
        ],
      });
      const narrationBlock = narration.content.find((b) => b.type === "text");
      const summary = narrationBlock && "text" in narrationBlock ? narrationBlock.text : "Here's your backtest result.";

      return json({ tool: "run_backtest", message: summary, result: backtestResult });
    }
    case "show_price_chart": {
      const symbol = input.symbol as string;
      const fromDate = input.from_date as string;
      const toDate = input.to_date as string;

      const relayBaseUrl = Deno.env.get("RELAY_BASE_URL");
      if (!relayBaseUrl) {
        return json({ error: "RELAY_BASE_URL is not configured as a project secret" }, 500);
      }
      const relaySecret = Deno.env.get("RELAY_SHARED_SECRET");

      // Same relay /historical read-through cache built for run_backtest (Part
      // B) — no duplicate fetching/caching logic, just a different consumer.
      const params = new URLSearchParams({ symbol, interval: "ONE_DAY", from_date: fromDate, to_date: toDate });
      const historicalRes = await fetch(`${relayBaseUrl}/historical?${params}`, {
        headers: relaySecret ? { Authorization: `Bearer ${relaySecret}` } : {},
      });
      const historicalBody = await historicalRes.json();
      if (!historicalRes.ok) {
        return json({ error: historicalBody.detail ?? historicalBody.error ?? "relay /historical call failed" }, 500);
      }

      const candles = (historicalBody.candles ?? []) as { candle_date: string; close: number }[];
      if (candles.length === 0) {
        return json({
          tool: "show_price_chart",
          message: `I couldn't find any historical data for ${symbol} between ${fromDate} and ${toDate}.`,
        });
      }

      // Computed directly rather than via a second Claude call — precise
      // percentage math shouldn't be left to an LLM, and the point of this
      // summary is exactly the number, not a narrative (speak the change, not
      // the whole chart).
      const first = candles[0];
      const last = candles[candles.length - 1];
      const pctChange = ((Number(last.close) - Number(first.close)) / Number(first.close)) * 100;
      const direction = pctChange >= 0 ? "up" : "down";
      const timeframeDays = Math.round(
        (new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60 * 24),
      );
      const timeframeLabel = timeframeDays >= 60 ? `${Math.round(timeframeDays / 30)} months` : `${timeframeDays} days`;
      const chartMessage = `${symbol} is ${direction} ${Math.abs(pctChange).toFixed(1)}% over the last ${timeframeLabel}.`;

      return json({
        tool: "show_price_chart",
        message: chartMessage,
        result: { symbol, from_date: fromDate, to_date: toDate, candles },
      });
    }
    case "render_ui": {
      return json({ tool: "render_ui", component: input.component, data: input.data });
    }
    case "close_window": {
      const titles = (input.titles as string[] | undefined) ?? [];
      return json({
        tool: "close_window",
        message: titles.length > 0 ? `Closed ${titles.length} window${titles.length === 1 ? "" : "s"}.` : "I couldn't find a matching open window.",
        titles,
      });
    }
    case "close_all_windows": {
      return json({ tool: "close_all_windows", message: "Closing everything." });
    }
    case "show_activity_history": {
      // Same shape as get-dashboard's activity list, just a higher limit —
      // this is the source for the full-history floating window now that
      // the permanent activity column is gone in favor of toast + on-demand.
      const { data: transactions, error: txnError } = await supabase
        .from("transactions")
        .select("id, action, quantity, amount, source, created_at, assets(name, asset_class, symbol)")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (txnError) return json({ error: txnError.message }, 500);

      const activity = (transactions ?? []).map((t) => {
        const asset = t.assets as { name?: string; asset_class?: string; symbol?: string } | null;
        return {
          id: t.id,
          action: t.action,
          quantity: t.quantity !== null ? Number(t.quantity) : null,
          amount: Number(t.amount),
          source: t.source,
          created_at: t.created_at,
          asset_name: asset?.name ?? null,
          asset_class: asset?.asset_class ?? null,
          symbol: asset?.symbol ?? null,
        };
      });

      return json({ tool: "show_activity_history", message: "Here's your activity history.", activity });
    }
    case "ask_clarification": {
      const { data, error } = await supabase
        .from("pending_intents")
        .insert({
          owner_id: ownerId,
          context: { original_message: message },
          question: input.question,
          resolved: false,
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ tool: "ask_clarification", message: input.question, pending_intent: data });
    }
    default:
      return json({ error: `Unknown tool: ${toolUse.name}` }, 500);
  }
});
