/**
 * AI-assistance abstraction (spec section 37, Phase 4: "AI customer
 * support"). This is genuine model access, not a canned-response bot —
 * but it's optional and clearly gated: it only activates when
 * ANTHROPIC_API_KEY is set in the environment (see .env.example). With
 * no key configured, callers get a clear "AI support isn't configured"
 * response rather than a silently fake answer.
 */

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIProvider {
  readonly name: string;
  chat(messages: AIMessage[], systemPrompt: string): Promise<string>;
}
