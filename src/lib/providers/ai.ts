import type { AiMessage, AiProvider, ProviderHealth } from "./types";

/**
 * Optional AI provider.
 *
 * DashIntel's numbers never come from a language model — the profit, offer and
 * tax engines are deterministic. The model is used only to *phrase* insights
 * from data that has already been computed, and only when the operator has
 * configured a key.
 *
 * When no key is present the provider reports `not_configured` and the app
 * falls back to the deterministic, template-based insight writer. It never
 * fabricates a model response.
 */

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export class OpenAiCompatibleProvider implements AiProvider {
  readonly key = "openai-compatible";
  readonly name: string;
  readonly requiresKey = true;
  readonly model: string | null;

  private readonly apiKey: string | null;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = process.env.AI_API_KEY?.trim() || null;
    this.baseUrl = process.env.AI_BASE_URL?.trim() || DEFAULT_BASE_URL;
    this.model = process.env.AI_MODEL?.trim() || null;
    this.name = process.env.AI_PROVIDER_NAME?.trim() || "OpenAI-compatible";
  }

  get configured(): boolean {
    return this.apiKey !== null && this.model !== null;
  }

  async complete(system: string, user: string): Promise<string> {
    if (!this.configured) {
      throw new Error("AI provider is not configured");
    }
    const messages: AiMessage[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          messages,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error("empty completion");
      return content.trim();
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.configured) {
      return {
        key: this.key,
        name: this.name,
        status: "not_configured",
        detail:
          "No AI key set. DashIntel still works — insights are written by the deterministic template engine.",
        capability: "Natural-language phrasing of already-computed insights",
        requiresKey: this.requiresKey,
        checkedAt,
      };
    }
    return {
      key: this.key,
      name: `${this.name} (${this.model})`,
      status: "connected",
      detail: "Configured. Used only to phrase insights; all numbers come from the deterministic engines.",
      capability: "Natural-language phrasing of already-computed insights",
      requiresKey: this.requiresKey,
      checkedAt,
      latencyMs: null,
    };
  }
}

export const aiProvider: AiProvider = new OpenAiCompatibleProvider();
