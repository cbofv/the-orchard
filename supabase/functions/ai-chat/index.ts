// The Orchard: AI tutor (Supabase Edge Function "ai-chat").
// The Claude API key lives only here, as a Supabase secret, and never reaches
// the browser. Only signed-in users can call it, with a daily message limit.
//
// Secrets (Edge Functions -> Secrets):
//   ANTHROPIC_API_KEY  required
//   AI_DAILY_LIMIT     optional, messages per person per day (default 40)
import Anthropic from "npm:@anthropic-ai/sdk@1.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const MODEL = "claude-opus-5-5";
const DAILY_LIMIT = Math.max(1, Number(Deno.env.get("AI_DAILY_LIMIT") ?? "40") || 40);
const MAX_TURNS = 30; // most recent messages sent to Claude
const MAX_CHARS = 6000; // per message

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SYSTEM = `You are the AI tutor inside The Orchard, a revision app for a UK secondary-school student preparing for their GCSEs (AQA unless they say otherwise).

How to help:
- Teach for understanding and memory. Explain clearly at GCSE level, then check understanding with a quick question when it helps.
- When asked to quiz or test, ask one question at a time, wait for the answer, then mark it the way an examiner would and give the model answer.
- For exam-style questions, show how marks are earned (command words, mark-scheme points, AO1/AO2/AO3 where relevant).
- For maths and science, work step by step and show working. Use plain text maths (e.g. x^2, sqrt(5), 3/4) because the chat shows plain text and simple markdown only.
- Keep replies focused and reasonably short; use short paragraphs, bullet points and **bold** for key terms. Avoid tables and headings.
- Help with coursework and homework by explaining, giving feedback and asking guiding questions, rather than writing work for them to hand in as their own.
- If you are not sure a fact matches their exact specification, say so and suggest checking the spec or their teacher.
- Be warm and encouraging. If the student seems stressed or mentions anything about their wellbeing or safety, respond kindly and encourage them to talk to a trusted adult, teacher or school counsellor; in the UK they can also contact Childline on 0800 1111.`;

function clean(s: unknown, max: number) {
  return typeof s === "string" ? s.slice(0, max) : "";
}

function contextNote(ctx: Record<string, unknown> | undefined, name: string) {
  const lines: string[] = [];
  if (name) lines.push(`The student's first name is ${clean(name, 40)}.`);
  const subjects = Array.isArray(ctx?.subjects) ? ctx!.subjects.slice(0, 20).map((s) => clean(s, 60)).filter(Boolean) : [];
  if (subjects.length) lines.push(`Their subjects: ${subjects.join(", ")}.`);
  const exams = Array.isArray(ctx?.exams) ? ctx!.exams.slice(0, 8).map((s) => clean(s, 120)).filter(Boolean) : [];
  if (exams.length) lines.push(`Their next exams: ${exams.join("; ")}.`);
  const today = clean(ctx?.today, 20);
  if (today) lines.push(`Today's date is ${today}.`);
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json(500, { error: "The AI tutor isn’t set up yet (missing API key)." });

  // Who is asking?
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth?.user) return json(401, { error: "Please sign in again." });
  const user = auth.user;

  let body: { messages?: Array<{ role: string; content: string }>; context?: Record<string, unknown> };
  try { body = await req.json(); } catch { return json(400, { error: "Bad request." }); }

  // Validate the conversation: alternating turns, starting and ending with the student.
  const raw = Array.isArray(body.messages) ? body.messages.slice(-MAX_TURNS) : [];
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of raw) {
    const role = m?.role === "assistant" ? "assistant" : m?.role === "user" ? "user" : null;
    const content = clean(m?.content, MAX_CHARS).trim();
    if (!role || !content) continue;
    if (!messages.length && role !== "user") continue;
    if (messages.length && messages[messages.length - 1].role === role) {
      messages[messages.length - 1] = { role, content: `${messages[messages.length - 1].content}\n\n${content}` };
    } else messages.push({ role, content });
  }
  if (!messages.length || messages[messages.length - 1].role !== "user") return json(400, { error: "Type a message first." });

  // Daily limit, counted atomically in the database.
  const { data: remaining, error: quotaErr } = await admin.rpc("ai_take_quota", { uid: user.id, day_limit: DAILY_LIMIT });
  if (quotaErr) return json(500, { error: "The AI tutor isn’t set up yet (run supabase-ai-setup.sql)." });
  if (remaining === null || remaining < 0) {
    return json(429, { error: `You’ve used today’s ${DAILY_LIMIT} AI messages. They reset at midnight (UTC).` });
  }

  const name = String(user.user_metadata?.name ?? "").split(" ")[0];
  const note = contextNote(body.context, name);
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: SYSTEM }];
  if (note) system.push({ type: "text", text: note });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        const s = anthropic.beta.messages.stream({
          model: MODEL,
          max_tokens: 8000, // cost cap for a chat reply
          system,
          messages,
          output_config: { effort: "medium" },
          cache_control: { type: "ephemeral" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          metadata: { user_id: user.id },
        });
        for await (const event of s) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") send({ t: event.delta.text });
        }
        const final = await s.finalMessage();
        if (final.stop_reason === "refusal") send({ t: "\n\nSorry, I can’t help with that one. Try asking it a different way, or ask your teacher." });
        else if (final.stop_reason === "max_tokens") send({ t: "\n\n(I ran out of space there. Ask me to carry on.)" });
        send({ done: true, remaining });
      } catch (e) {
        let msg = "The AI tutor hit a problem. Please try again.";
        if (e instanceof Anthropic.RateLimitError) msg = "The AI tutor is busy right now. Please try again in a minute.";
        else if (e instanceof Anthropic.AuthenticationError) msg = "The AI tutor’s API key isn’t working. Check the ANTHROPIC_API_KEY secret.";
        else if (e instanceof Anthropic.APIError && e.status === 400 && /credit|billing/i.test(e.message)) msg = "The AI tutor’s Claude account is out of credit.";
        else if (e instanceof Anthropic.APIError) console.error("Claude API error", e.status, e.message);
        else console.error(e);
        // Give the message back: this one didn't count.
        await admin.rpc("ai_refund_quota", { uid: user.id }).then(() => {}, () => {});
        send({ error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { ...CORS, "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
});
