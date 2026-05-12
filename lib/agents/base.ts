import Anthropic from '@anthropic-ai/sdk';

export interface AgentStatusUpdate {
  stage: string;
  message: string;
  progress?: number;
}

export type AgentStatusCallback = (update: AgentStatusUpdate) => void;

export interface ModelPricing {
  /** USD per 1M input tokens */
  inputPerMTok: number;
  /** USD per 1M output tokens */
  outputPerMTok: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AgentCallOptions {
  model: string;
  systemPrompt: string;
  userMessage: string;
  tool: ToolDefinition;
  pricing: ModelPricing;
  maxTokens?: number;
}

export interface AgentCallResult<TToolInput> {
  output: TToolInput;
  costUsd: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

const DEFAULT_MAX_RETRIES = 3;
const RETRYABLE_STATUSES = new Set<number>([429, 529]);

export abstract class BaseAgent {
  protected readonly client: Anthropic;
  protected readonly onUpdate: AgentStatusCallback | undefined;

  /** Subclasses set this for log prefixing. */
  protected abstract readonly logPrefix: string;

  constructor(opts: { onUpdate?: AgentStatusCallback } = {}) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set. Add it to .env and reload the test runner.',
      );
    }
    this.client = new Anthropic({ apiKey });
    this.onUpdate = opts.onUpdate;
  }

  protected emit(update: AgentStatusUpdate): void {
    if (this.onUpdate) this.onUpdate(update);
    const progressSuffix =
      typeof update.progress === 'number' ? ` (${Math.round(update.progress * 100)}%)` : '';
    console.log(`${this.logPrefix} ${update.stage}: ${update.message}${progressSuffix}`);
  }

  /**
   * Call the Anthropic Messages API and force the response through a single tool.
   * Retries on 429/529 with exponential backoff (1s, 2s, 4s). All other errors
   * propagate to the caller.
   */
  protected async callWithTool<TToolInput>(
    opts: AgentCallOptions,
  ): Promise<AgentCallResult<TToolInput>> {
    const startedAt = Date.now();

    const response = await this.withRetry(() =>
      this.client.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 8_192,
        system: opts.systemPrompt,
        tools: [
          {
            name: opts.tool.name,
            description: opts.tool.description,
            // The SDK type for input_schema is narrow; our JSON Schema is the
            // source of truth and matches Anthropic's expected shape.
            input_schema: opts.tool.inputSchema as never,
          },
        ],
        tool_choice: { type: 'tool', name: opts.tool.name },
        messages: [{ role: 'user', content: opts.userMessage }],
      }),
    );

    const latencyMs = Date.now() - startedAt;

    const toolUseBlock = response.content.find(
      (block) => block.type === 'tool_use' && block.name === opts.tool.name,
    );
    if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
      throw new Error(
        `${this.logPrefix} model did not return a "${opts.tool.name}" tool_use block ` +
          `(stop_reason=${response.stop_reason ?? 'unknown'})`,
      );
    }

    const output = toolUseBlock.input as TToolInput;
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd =
      (inputTokens / 1_000_000) * opts.pricing.inputPerMTok +
      (outputTokens / 1_000_000) * opts.pricing.outputPerMTok;

    return {
      output,
      costUsd,
      latencyMs,
      inputTokens,
      outputTokens,
      stopReason: response.stop_reason ?? null,
    };
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= DEFAULT_MAX_RETRIES; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const status = (err as { status?: number }).status;
        const isRetryable = typeof status === 'number' && RETRYABLE_STATUSES.has(status);
        if (!isRetryable || attempt === DEFAULT_MAX_RETRIES) {
          throw err;
        }
        const waitMs = Math.pow(2, attempt) * 1_000;
        this.emit({
          stage: 'retry',
          message: `HTTP ${status} from Anthropic; backing off ${waitMs}ms (attempt ${attempt + 1}/${DEFAULT_MAX_RETRIES})`,
        });
        await sleep(waitMs);
      }
    }
    throw lastErr;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
