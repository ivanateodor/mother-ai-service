import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export type Chunk = {
  id: string;
  docId: string;
  source: string;         // filename or URL
  text: string;
  embedding: number[];
};

// super simple in-memory store (replace with pgvector later)
const CHUNKS: Chunk[] = [];

export function simpleChunk(text: string, maxChars = 1200): string[] {
  // naive split by paragraphs, then merge up to ~maxChars
  const paras = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const out: string[] = [];
  let buf = "";
  for (const p of paras) {
    if ((buf + "\n\n" + p).length > maxChars) { if (buf) out.push(buf); buf = p; }
    else buf = buf ? buf + "\n\n" + p : p;
  }
  if (buf) out.push(buf);
  return out;
}

export async function embedTextBatch(chunks: string[]): Promise<number[][]> {
  if (chunks.length === 0) return [];
  const res = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: chunks
  });
  return res.data.map(d => d.embedding as number[]);
}

export async function upsertDocument({ docId, source, text }: { docId: string; source: string; text: string; }) {
  const parts = simpleChunk(text);
  const vecs = await embedTextBatch(parts);
  parts.forEach((t, i) => {
    CHUNKS.push({
      id: `${docId}:${i}`,
      docId,
      source,
      text: t,
      embedding: vecs[i]
    });
  });
  return parts.length;
}

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

export async function retrieve(query: string, k = 5) {
  const q = (await openai.embeddings.create({ model: "text-embedding-3-large", input: query })).data[0].embedding as number[];
  const scored = CHUNKS.map(c => ({ c, score: cosine(q, c.embedding) }));
  scored.sort((x,y)=> y.score - x.score);
  return scored.slice(0, k).map(s => s.c);
}

// helper to build a context block + lightweight citations
export function toContext(chunks: Chunk[]) {
  const refs = chunks.map((c, i)=> `[${i+1}] ${c.source}`).join("\n");
  const ctx  = chunks.map((c, i)=> `# [${i+1}] ${c.source}\n${c.text}`).join("\n\n---\n\n");
  return { refs, ctx };
}
