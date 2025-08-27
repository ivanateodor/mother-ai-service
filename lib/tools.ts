export const tools = [
  { type: "function", function: {
    name: "call_veritas",
    description: "Ask Veritas (journalist) for a follow-up.",
    parameters: { type: "object", properties: { question: { type: "string" }, guestId: { type: "string" } }, required: ["question"] }
  }},
  { type: "function", function: {
    name: "call_trend",
    description: "Get a concise trend brief.",
    parameters: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] }
  }}
] as const;
