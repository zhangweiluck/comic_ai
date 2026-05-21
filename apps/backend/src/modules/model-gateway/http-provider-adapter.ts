import type {
  ProviderAdapter,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";

export class HttpProviderAdapter implements ProviderAdapter {
  constructor(
    private readonly config: {
      endpoint: string;
      apiKey?: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async submit(
    input: ProviderSubmissionInput,
  ): Promise<ProviderSubmissionResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const response = await fetchImpl(this.resolveSubmitUrl(), {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`provider_http_${response.status}`);
    }

    const payload = (await response.json()) as Partial<ProviderSubmissionResult>;
    if (
      !payload.externalRequestId ||
      !payload.status ||
      !["accepted", "running", "succeeded"].includes(payload.status)
    ) {
      throw new Error("provider_http_invalid_response");
    }

    return {
      externalRequestId: payload.externalRequestId,
      status: payload.status,
      redactedResponse: payload.redactedResponse ?? {},
    };
  }

  private resolveSubmitUrl() {
    return this.config.endpoint.replace(/\/+$/, "") + "/submit";
  }

  private buildHeaders() {
    return {
      "content-type": "application/json",
      ...(this.config.apiKey
        ? { authorization: `Bearer ${this.config.apiKey}` }
        : {}),
    };
  }
}
