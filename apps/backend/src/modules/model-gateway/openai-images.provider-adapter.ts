import type {
  ProviderAdapter,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";

const defaultEndpoint = "https://api.openai.com/v1/images/generations";
const defaultModel = "gpt-image-2";
const defaultSize = "1024x1536";

export class OpenAIImagesProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      model?: string;
      endpoint?: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async submit(
    input: ProviderSubmissionInput,
  ): Promise<ProviderSubmissionResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const response = await fetchImpl(this.config.endpoint ?? defaultEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model ?? defaultModel,
        prompt: buildPrompt(input),
        size: defaultSize,
      }),
    });

    if (!response.ok) {
      throw new Error(`openai_images_${response.status}`);
    }

    const payload = (await response.json()) as {
      created?: number;
      data?: Array<{
        b64_json?: string;
        revised_prompt?: string;
      }>;
    };

    if (!Array.isArray(payload.data) || payload.data.length < 1) {
      throw new Error("openai_images_invalid_response");
    }

    return {
      externalRequestId:
        response.headers.get("x-request-id") ?? input.providerRequestId,
      status: "succeeded",
      redactedResponse: {
        model: this.config.model ?? defaultModel,
        imageCount: payload.data.length,
        created: payload.created ?? null,
        revisedPrompt: payload.data[0]?.revised_prompt ?? null,
      },
    };
  }
}

function buildPrompt(input: ProviderSubmissionInput) {
  const payload = input.redactedPayload;
  const prompt =
    typeof payload.prompt === "string" && payload.prompt.trim().length > 0
      ? payload.prompt.trim()
      : undefined;

  if (prompt) {
    return prompt;
  }

  const title =
    typeof payload.title === "string" && payload.title.trim().length > 0
      ? payload.title.trim()
      : "Untitled shot";
  const shotId =
    typeof payload.shotId === "string" && payload.shotId.trim().length > 0
      ? payload.shotId.trim()
      : "unknown-shot";
  const contentRevision =
    typeof payload.contentRevision === "number"
      ? String(payload.contentRevision)
      : "unknown";

  return [
    `Storyboard frame for "${title}".`,
    `Shot ID: ${shotId}.`,
    `Content revision: ${contentRevision}.`,
    "Generate a polished vertical comic frame with strong visual consistency.",
  ].join(" ");
}
