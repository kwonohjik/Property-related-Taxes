/**
 * §101② 증여 후 우회양도 판정 — 폼 → 요청 본문(④) · 클라이언트 → `/api/calc/gift-resale-101-2`(⑬)
 *
 * 계획서: `docs/00-pm/transfer-101-2-gift-resale.plan.md` §5.2·§5.4
 * 미입력(`""`·`null`)은 Zod가 거부하는 값(`undefined`)으로 보낸다 — 자동 보정 없음.
 * 화면은 ⑧(`validateGiftResale`)이 빈 배열일 때만 부른다.
 */
import type { GiftResaleFormState } from "./gift-resale-101-2-form";
import type { GiftResaleRequestBody } from "@/lib/validators/gift-resale-101-2-input";
import type { GiftResaleResult } from "@/lib/tax-engine/gift-resale-101-2";

/** JSON을 거친 결과 — `deadline`은 ISO 문자열로 온다 */
export type GiftResaleResponse = Omit<GiftResaleResult, "deadline"> & { deadline: string };

const orUndef = <T>(v: T | "" | null): T | undefined => (v === "" || v === null ? undefined : v);

export function toGiftResaleRequestBody(form: GiftResaleFormState): Partial<GiftResaleRequestBody> {
  return {
    relation: orUndef(form.relation),
    giftRegistryDate: orUndef(form.giftRegistryDate),
    transferDate: orUndef(form.transferDate),
    substantiveAttribution: orUndef(form.substantiveAttribution),
    isBurdenedGift: form.isBurdenedGift,
    donorDeceasedAtTransfer: form.donorDeceasedAtTransfer,
    donorHasOtherTransfersSameYear: form.donorHasOtherTransfersSameYear,
    doneeHasOtherTransfersSameYear: form.doneeHasOtherTransfersSameYear,
    giftTaxIncludesOtherAssets: form.giftTaxIncludesOtherAssets,
    giftTaxCalculated: orUndef(form.giftTaxCalculated),
    giftTaxCreditsAndReductions: orUndef(form.giftTaxCreditsAndReductions),
    doneeTransferDeterminedTax: orUndef(form.doneeTransferDeterminedTax),
    donorTransferDeterminedTax: orUndef(form.donorTransferDeterminedTax),
  };
}

export async function callGiftResaleAPI(form: GiftResaleFormState): Promise<GiftResaleResponse> {
  const res = await fetch("/api/calc/gift-resale-101-2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toGiftResaleRequestBody(form)),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data as GiftResaleResponse;
}
