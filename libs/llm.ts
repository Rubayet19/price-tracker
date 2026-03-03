import OpenAI from "openai";

const MODEL = "gpt-4o-mini";
const MAX_TOKENS = 800;
const TEMPERATURE = 0.4;
const TIMEOUT_MS = 15_000;

// gpt-4o-mini pricing (per 1M tokens)
const INPUT_COST_PER_MILLION = 0.15;
const OUTPUT_COST_PER_MILLION = 0.60;

export interface StructuredCompletionResult {
  parsed: Record<string, unknown>;
  promptTokens: number;
  completionTokens: number;
  totalCostUsd: number;
}

const getClient = (): OpenAI | null => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new OpenAI({ apiKey, timeout: TIMEOUT_MS });
};

const calculateCost = (promptTokens: number, completionTokens: number): number => {
  const inputCost = (promptTokens / 1_000_000) * INPUT_COST_PER_MILLION;
  const outputCost = (completionTokens / 1_000_000) * OUTPUT_COST_PER_MILLION;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
};

export const generateStructuredCompletion = async (
  systemPrompt: string,
  userPrompt: string
): Promise<StructuredCompletionResult | null> => {
  const client = getClient();
  if (!client) {
    return null;
  }

  const response = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return null;
  }

  const parsed = JSON.parse(content) as Record<string, unknown>;
  const promptTokens = response.usage?.prompt_tokens ?? 0;
  const completionTokens = response.usage?.completion_tokens ?? 0;

  return {
    parsed,
    promptTokens,
    completionTokens,
    totalCostUsd: calculateCost(promptTokens, completionTokens),
  };
};
