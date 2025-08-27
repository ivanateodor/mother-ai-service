import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import OpenAI from "openai";
import { tools } from "./lib/tools.js";
import { veritasAsk, trendBrief } from "./lib/agents.js";

const app = express();
app.use(express.json());

// allow only your WordPress domain(s)
const ALLOW_ORIGINS = (process.env.ALLOW_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin: string | undefined, cb) {
      if (!origin || ALLOW_ORIGINS.includes(origin)) cb(null, true);
      else cb(null, false);
    },
    credentials: false,
  })
);

const WIDGET_TOKEN = process.env.WIDGET_TOKEN || "";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

app.post("/api/ask", async (req: Request, res: Response) => {
  if (WIDGET_TOKEN && req.headers.authorization !== `Bearer ${WIDGET_TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const message: string = (req.body?.message as string) ?? "";

  // 1) Mother decides + may call a tool
  const first = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are Mother AI. If interviews/guests → call_veritas; if trends/signals → call_trend; else answer concisely.",
      },
      { role: "user", content: message },
    ],
    tools,              // now mutable & correctly typed
    tool_choice: "auto",
  });

  const choice = first.choices[0];

  // 2) Execute tool if requested
  if (choice.message.tool_calls?.length) {
    const tc = choice.message.tool_calls[0];
    const args = JSON.parse(tc.function.arguments || "{}");

    let toolResult: any = null;
    if (tc.function.name === "call_veritas") toolResult = await veritasAsk(args);
    if (tc.function.name === "call_trend")  toolResult = await trendBrief(args);

    // 3) Send tool result back for synthesis
    const second = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Mother AI. Synthesize one helpful answer. If trend brief, render Signal/Summary/Action/Invite.",
        },
        { role: "user", content: message },
        choice.message,
        { role: "tool", tool_call_id: tc.id, content: JSON.stringify(toolResult) },
      ],
    });

    return res.json({ text: second.choices[0]?.message?.content ?? "" });
  }

  // 4) No tool used
  return res.json({ text: choice.message.content ?? "" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Mother AI listening on :${port}`));
