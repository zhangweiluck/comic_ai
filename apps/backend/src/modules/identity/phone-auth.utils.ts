import { createHash, randomInt, randomUUID } from "node:crypto";

export function normalizeCnPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const mainland = digits.startsWith("86") ? digits.slice(2) : digits;

  if (!/^1\d{10}$/.test(mainland)) {
    throw new Error("invalid_phone");
  }

  return `+86${mainland}`;
}

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateVerificationCode(): string {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

export function generateIdentityId(): string {
  return randomUUID();
}

export function maskCnPhone(phoneE164: string): string {
  const mainland = phoneE164.slice(3);
  return `${mainland.slice(0, 3)}****${mainland.slice(-4)}`;
}
