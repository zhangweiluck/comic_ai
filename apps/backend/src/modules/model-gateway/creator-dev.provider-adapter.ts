import type {
  ProviderAdapter,
  ProviderSubmissionInput,
  ProviderSubmissionResult,
} from "./provider-adapter.contract.ts";

export class CreatorDevProviderAdapter implements ProviderAdapter {
  async submit(
    input: ProviderSubmissionInput,
  ): Promise<ProviderSubmissionResult> {
    return {
      externalRequestId: `external-${input.providerRequestId}`,
      status: "accepted",
      redactedResponse: {
        accepted: true,
        providerName: input.providerName,
        providerOperation: input.providerOperation,
        requestKey: input.requestKey,
      },
    };
  }
}

export function createCreatorDevProviderAdapter(): ProviderAdapter {
  return new CreatorDevProviderAdapter();
}
