// Intent router (build-order step 4): text input only, mutate/query intents,
// no guardrails yet. log_transaction logs directly — no broker execution,
// no tax/affordability checks, no confirm-before-execute flow. Those are
// later, explicitly deferred steps.
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are the intent router for a personal finance assistant. Given the user's message, call exactly one tool:

- log_transaction: the user is stating they bought or sold something and gave enough detail to log it (asset class, action, and quantity at minimum). Estimate "amount" (total transaction value) from what they said if possible.
- render_ui: the user is asking a question best answered with a chart or visualization rather than a text answer.
- ask_clarification: a required detail is genuinely missing or ambiguous (e.g. "sell some TSLA" doesn't say how many shares). Ask one short, specific question.

Do not discuss broker order execution, taxes, or affordability — none of that is implemented yet. Just route the intent.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "log_transaction",
    description:
      "Log a buy/sell/manual_entry transaction directly into the transactions table. No broker execution, no guardrails — just a direct log entry.",
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
          description: "Quantity transacted, e.g. number of shares or grams",
        },
        amount: {
          type: "number",
          description:
            "Total monetary value of the transaction (quantity * price). Best estimate if not explicitly stated.",
        },
      },
      required: ["asset_class", "action", "quantity"],
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
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

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
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
      const { data, error } = await supabase
        .from("transactions")
        .insert({
          user_id,
          asset_id: null,
          action: input.action,
          quantity: input.quantity,
          amount: input.amount ?? 0,
          source: "manual",
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({
        tool: "log_transaction",
        message: `Logged: ${input.action} ${input.quantity} (${input.asset_class}), amount ~${input.amount ?? 0}.`,
        transaction: data,
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
