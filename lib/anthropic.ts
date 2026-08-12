import Anthropic from '@anthropic-ai/sdk';

// Server-only client. Used by the inherited Assignment 5B "Generate Response
// Brief" route, and by the Assignment 6 post-spill review drafting and
// routing-agent calls below.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const CLAUDE_MODEL = 'claude-sonnet-5';

export function textFromMessage(msg: Anthropic.Messages.Message): string {
  return msg.content
    .map((c) => (c.type === 'text' ? c.text : ''))
    .join('\n')
    .trim();
}

// Claude is asked for raw JSON but sometimes wraps it in a markdown fence
// anyway -- strip that before parsing rather than silently swallowing a
// parse failure (a bad parse should surface as a clear 500, never as
// invented/guessed review content).
export function parseJsonResponse(text: string): any {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(stripped);
}

// Calls Claude and parses the reply as JSON, retrying once (with the same
// prompt) if the first reply comes back malformed -- a stray trailing comma
// or quoting slip in an otherwise-correct generation shouldn't need a human
// to notice and manually re-trigger the request. Still throws (surfacing a
// clear error) if the retry also fails to parse.
export async function callClaudeForJson(prompt: string, maxTokens: number): Promise<any> {
  let lastErr: any;
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    try {
      return parseJsonResponse(textFromMessage(msg));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
