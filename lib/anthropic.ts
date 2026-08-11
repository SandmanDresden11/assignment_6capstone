import Anthropic from '@anthropic-ai/sdk';

// Server-only client. Used exclusively by the on-demand "Generate Response
// Brief" route -- this is the agentic step from the Assignment 5A design.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const CLAUDE_MODEL = 'claude-sonnet-5';
