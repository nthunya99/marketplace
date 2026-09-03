import type { AIProvider, AIMessage } from "./AIProvider";

/**
 * Real integration with Anthropic's Messages API. Activated only when
 * ANTHROPIC_API_KEY is present in the environment — this file makes an
 * actual outbound HTTPS call, it does not simulate one. Uses a small,
 * fast model since this is answering short support/search-assist
 * questions grounded in context the caller assembles, not doing open-
 * ended generation.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(messages: AIMessage[], systemPrompt: string): Promise<string> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-latest",
        max_tokens: 600,
        system: systemPrompt,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Anthropic API error (${response.status}): ${text.slice(0, 300)}`);
    }

    const data = await response.json();
    const textBlock = data.content?.find((b: any) => b.type === "text");
    return textBlock?.text ?? "";
  }
}
