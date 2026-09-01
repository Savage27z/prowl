// AI reasoning wrapper — connects to OpenRouter for DeepSeek
// AI model wrapper — uses OpenRouter for model access
// Default: DeepSeek (cheap and good for investigation reasoning)

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat';

export async function callAI(
  prompt: string,
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
  }
): Promise<string> {
  const model = options?.model || OPENROUTER_MODEL;
  const systemPrompt = options?.systemPrompt || 'You are a crypto forensic investigator working for Prowl, an AI investigation swarm that traces stolen crypto on Base. Be concise and precise.';

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://prowl.app',
        'X-Title': 'Prowl Investigation Agent',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        max_tokens: options?.maxTokens || 500,
        temperature: options?.temperature || 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[AI] OpenRouter error: ${response.status} — ${error}`);
      return `AI analysis unavailable (${response.status})`;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No analysis generated.';
  } catch (error) {
    console.error('[AI] Error calling OpenRouter:', error);
    return 'AI analysis unavailable — connection error.';
  }
}
