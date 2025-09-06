import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import OpenAI from "openai";
import { tools } from "./lib/tools.js";
import { veritasAsk, trendBrief } from "./lib/agents.js";
import { retrieve, toContext } from "./lib/rag.js";


const app = express();
app.use(express.json());

// allow only your WordPress domain(s)
const ALLOW_ORIGINS = (process.env.ALLOW_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin || ALLOW_ORIGINS.includes(origin)) callback(null, true);
    else callback(null, false);
  },
  credentials: false,
  // allow the headers your widget sends
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["POST", "OPTIONS", "GET"]
};

app.use(cors(corsOptions));

// health route so visiting "/" shows something
app.get("/", (_req: Request, res: Response) => {
  res.type("text/plain").send("Mother AI is live. POST /api/ask");
});

// explicit preflight handler (helps with some hosts/proxies)
app.options("/api/ask", cors(corsOptions));

const WIDGET_TOKEN = process.env.WIDGET_TOKEN || "";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

app.post("/api/ask", async (req: Request, res: Response) => {
  if (WIDGET_TOKEN && req.headers.authorization !== `Bearer ${WIDGET_TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const message: string = (req.body?.message as string) ?? "";

  const first = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are Mother AI. If interviews/guests → call_veritas; if trends/signals → call_trend; else answer concisely." },
      { role: "user", content: message }
    ],
    tools,
    tool_choice: "auto"
  });

  const choice = first.choices[0];

  if (choice.message.tool_calls?.length) {
    const tc = choice.message.tool_calls[0];
    const args = JSON.parse(tc.function.arguments || "{}");

    let toolResult: any = null;
    if (tc.function.name === "call_veritas") toolResult = await veritasAsk(args);
    if (tc.function.name === "call_trend")  toolResult = await trendBrief(args);

    const second = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are Mother AI. Synthesize one helpful answer. If trend brief, render Signal/Summary/Action/Invite." },
        { role: "user", content: message },
        choice.message,
        { role: "tool", tool_call_id: tc.id, content: JSON.stringify(toolResult) }
      ]
    });

    return res.json({ text: second.choices[0]?.message?.content ?? "" });
  }

  return res.json({ text: choice.message.content ?? "" });
});

// 1) simple loader (POST /api/docs) for plain text
app.post("/api/docs", async (req: Request, res: Response) => {
  const { docId, source, text } = req.body ?? {};
  if (!docId || !text) return res.status(400).json({ error: "docId and text are required" });
  const n = await upsertDocument({ docId, source: source || docId, text });
  res.json({ ok: true, chunks: n });
});

// (optional) test retrieval
app.get("/api/search", async (req: Request, res: Response) => {
  const q = String(req.query.q || "");
  const hits = await retrieve(q, 5);
  res.json({ q, hits: hits.map(h => ({ id: h.id, source: h.source, text: h.text.slice(0,200)+"..." })) });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Mother AI listening on :${port}`));
