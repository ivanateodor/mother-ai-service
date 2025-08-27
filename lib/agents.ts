// Simple agent functions (replace with real LLM calls/RAG when ready)
export async function veritasAsk({ question, guestId }: { question: string; guestId?: string }) {
  return { answer: `Follow-up on "${question}": What was the exact turning point, and what did you do first?` };
}
export async function trendBrief({ topic }: { topic: string }) {
  return { signal: "🔥", summary: `Buzz on "${topic}" is rising.`, action: "Post a 2-min clip + thread.", invite: "Got counter-data?" };
}
