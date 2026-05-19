// OpenRouter — OpenAI-compatible chat completions. Lets us swap models via env.
// Defaults to Gemini 2.5 Flash via OpenRouter: cheap and strong with Polish.
// Pick another model by setting OPENROUTER_MODEL.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `Jesteś asystentem prawnym. Streszczasz polskie publikacje urzędowe (komunikaty, ustawy, decyzje, projekty) dla profesjonalisty.
Reguły:
- Odpowiadaj WYŁĄCZNIE po polsku.
- 3-5 punktów (każdy 1 zdanie, konkretny, bez wody).
- Najważniejszy fakt na pierwszym miejscu (kto/co/kiedy/skutek).
- Pomiń elementy redakcyjne (nawigacja, stopka, ciasteczka).
- Nie zmyślaj — jeśli czegoś nie ma w tekście, pomiń.
- Format wyjścia: zwykły markdown z listą punktowaną (-).`;

export type SummarizeInput = {
  title: string;
  sourceName: string;
  url: string;
  publishedAt?: string | null;
  bodyText: string;
};

export async function summarize(input: SummarizeInput): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  const userPrompt = [
    `Źródło: ${input.sourceName}`,
    `Tytuł: ${input.title}`,
    input.publishedAt ? `Data: ${input.publishedAt}` : null,
    `URL: ${input.url}`,
    ``,
    `Treść:`,
    input.bodyText,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      // OpenRouter analytics — optional, helpful for spend attribution.
      "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://unilex.local",
      "X-Title": "Unilex",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 600,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const summary = json.choices?.[0]?.message?.content?.trim();
  if (!summary) throw new Error("OpenRouter returned no content");
  return summary;
}

export const SUMMARIZER_LABEL = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
