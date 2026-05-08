export const capabilities = {
  projectCreate: "project:create",
  projectEdit: "project:edit",
  generationStart: "generation:start",
  exportCreate: "export:create",
  billingPurchase: "billing:purchase",
  billingRefund: "billing:refund",
  opsSettle: "ops:settle",
} as const;

export type Capability = (typeof capabilities)[keyof typeof capabilities];

export const p0Capabilities = Object.values(capabilities);
