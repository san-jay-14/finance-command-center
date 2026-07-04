// Intent router (build-order step 4, extended in step 6 for non-stock asset
// classes). Text input only, no guardrails yet. log_transaction logs
// directly — no broker execution, no tax/affordability checks, no
// confirm-before-execute flow. Those are later, explicitly deferred steps.
import Anthropic from "npm:@anthropic-ai/sdk";
import { corsHeaders, json } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";

type AdminClient = ReturnType<typeof createAdminClient>;

const SYSTEM_PROMPT = `You are the intent router for a personal finance assistant. Given the user's message, call exactly one tool:

- log_transaction: the user is stating they bought or sold something and gave enough detail to log it (asset class, action, and quantity at minimum). Estimate "amount" (total transaction value) from what they said if possible. For gold/real_estate/other/mutual_fund, include asset_name — a short label for what was bought (e.g. "flat", "car", "Gold"). For mutual funds, include scheme_code if the user gives one (an MFAPI.in scheme code); if they don't, omit it — a NAV can't be looked up without it.
- update_asset_value: the user is stating a NEW current worth for something they already own (e.g. "my flat is now worth 55 lakh") — this revises a stored estimate, it is not a new purchase. Only valid for real_estate and other.
- render_ui: the user is asking a question best answered with a chart or visualization rather than a text answer.
- ask_clarification: a required detail is genuinely missing or ambiguous (e.g. "sell some TSLA" doesn't say how many shares). Ask one short, specific question.

Do not discuss broker order execution, taxes, or affordability — none of that is implemented yet. Just route the intent.`;

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

const DEFAULT_ASSET_NAMES: Record<string, string> = {
  gold: "Gold",
};

function symbolForAsset(assetClass: string, schemeCode?: string): string | null {
  if (assetClass === "gold") return "GOLD";
  if (assetClass === "mutual_fund") return schemeCode ?? null;
  return null; // real_estate / other: matched by name, not symbol
}

async function findOrCreateAsset(
  supabase: AdminClient,
  userId: string,
  assetClass: string,
  assetName: string,
  symbol: string | null,
): Promise<{ id: string; created: boolean }> {
  let query = supabase.from("assets").select("id").eq("user_id", userId).eq("asset_class", assetClass);
  query = symbol ? query.eq("symbol", symbol) : query.ilike("name", assetName);
  const { data: existing, error: findError } = await query.limit(1);
  if (findError) throw new Error(findError.message);
  if (existing && existing.length > 0) {
    return { id: existing[0].id, created: false };
  }

  const { data: created, error: createError } = await supabase
    .from("assets")
    .insert({ user_id: userId, broker_connection_id: null, symbol, name: assetName, asset_class: assetClass })
    .select("id")
    .single();
  if (createError) throw new Error(createError.message);
  return { id: created.id, created: true };
}

// One lot per asset, same simplification as the relay's holdings sync — real
// per-trade FIFO lots are a tax-engine (build-order step 8) concern.
async function upsertLotForPurchase(supabase: AdminClient, assetId: string, quantity: number, amount: number): Promise<void> {
  const { data: existingLot, error: findError } = await supabase
    .from("lots")
    .select("id, quantity, buy_price")
    .eq("asset_id", assetId)
    .limit(1);
  if (findError) throw new Error(findError.message);

  if (existingLot && existingLot.length > 0) {
    const lot = existingLot[0];
    const oldQuantity = Number(lot.quantity);
    const oldInvested = oldQuantity * Number(lot.buy_price);
    const newQuantity = oldQuantity + quantity;
    const newInvested = oldInvested + amount;
    const newBuyPrice = newQuantity !== 0 ? newInvested / newQuantity : amount;
    const { error: updateError } = await supabase
      .from("lots")
      .update({ quantity: newQuantity, buy_price: newBuyPrice })
      .eq("id", lot.id);
    if (updateError) throw new Error(updateError.message);
  } else {
    const buyPrice = quantity !== 0 ? amount / quantity : amount;
    const { error: insertError } = await supabase.from("lots").insert({
      asset_id: assetId,
      quantity,
      buy_price: buyPrice,
      buy_date: new Date().toISOString().slice(0, 10),
    });
    if (insertError) throw new Error(insertError.message);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  let body: { message?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { message, user_id } = body;
  if (!message || !user_id) {
    return json({ error: "message and user_id are required" }, 400);
  }

  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) {
    return json({ error: "ANTHROPIC_API_KEY is not configured as a project secret" }, 500);
  }

  const supabase = createAdminClient();
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  // Check pending_intents first — a short reply like "5" should resolve
  // against the earlier question, not get parsed as a fresh command.
  const { data: pendingRows, error: pendingError } = await supabase
    .from("pending_intents")
    .select("id, question, context")
    .eq("user_id", user_id)
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
    system: SYSTEM_PROMPT,
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

      // Stock assets are created/synced by the relay service, not here (see
      // relay-service/app/holdings_sync.py) — unchanged from the previous step.
      // "sell" against these classes isn't handled yet (out of scope for this
      // step); it still logs a transaction row, just without asset linkage.
      if (assetClass !== "stock" && (action === "buy" || action === "manual_entry")) {
        try {
          const symbol = symbolForAsset(assetClass, schemeCode);
          const asset = await findOrCreateAsset(supabase, user_id, assetClass, assetName, symbol);
          assetId = asset.id;
          if (asset.created && (assetClass === "real_estate" || assetClass === "other")) {
            await supabase.from("assets").update({ manual_current_value: amount }).eq("id", asset.id);
          }
          await upsertLotForPurchase(supabase, assetId, quantity, amount);
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : String(err) }, 500);
        }
      }

      const { data, error } = await supabase
        .from("transactions")
        .insert({ user_id, asset_id: assetId, action, quantity, amount, source: "manual" })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({
        tool: "log_transaction",
        message: `Logged: ${action} ${quantity} ${assetName} (${assetClass}), amount ~${amount}.`,
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
        .eq("user_id", user_id)
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
    case "render_ui": {
      return json({ tool: "render_ui", component: input.component, data: input.data });
    }
    case "ask_clarification": {
      const { data, error } = await supabase
        .from("pending_intents")
        .insert({
          user_id,
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
