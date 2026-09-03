import type { AIProvider } from "./AIProvider";
import { AnthropicProvider } from "./AnthropicProvider";

/**
 * Returns null when no AI provider is configured, rather than a fake
 * stand-in — callers must handle the null case explicitly and tell the
 * user AI assistance isn't set up (see /api/ai/support), instead of
 * silently degrading to a canned response that looks AI-generated but
 * isn't.
 */
export function getAIProvider(): AIProvider | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new AnthropicProvider(apiKey);
}
