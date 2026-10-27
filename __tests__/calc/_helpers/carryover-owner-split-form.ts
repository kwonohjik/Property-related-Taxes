/**
 * 자산 단위 이월과세 × 소유자 분리(토지만·건물만) 시료 — 계획서 `docs/02-design/features/carryover-owner-split-display-gift-tax.plan.md` §1·§2.
 *
 * 증여자 2015-06-01 취득 · 증여 등기 2023-03-01 · 평가액 9억 · 양도 2025-06-30 12억 · 기준시가 토지 2.4억 : 건물 3.6억(양도시 5.6억 : 8.4억).
 * ⚠️ 호출하는 테스트 파일이 `@/lib/db/tax-rates`·`@/lib/api/rate-limit`을 mock해야 한다(`postTransfer`가 route를 직접 부른다).
 */
import { captureBody } from "./redev-one-house-route";
import { postTransfer } from "./redev-one-house-route";
import { cAsset } from "./split-carryover-c-form";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const STD = {
  acquisitionArea: "100", transferArea: "100", standardPricePerSqmAtTransfer: "5600000", buildingStandardPriceAtTransfer: "840000000",
  standardPricePerSqmAtAcq: "2400000", standardPriceAtAcq: "480000000", buildingStandardPriceAtAcq: "360000000", standardPriceAtTransfer: "1400000000",
};
const c0 = cAsset() as unknown as Loose;

/** 증여자 취득가액 모름(일반 환산 — 증여자 취득 당시 3억 · 양도시 14억) */
export const ESTIMATED: Loose = {
  ...c0, ...STD, carryoverDonorSplit: false, landAcquisitionPrice: "", buildingAcquisitionPrice: "", saleSplitMode: "apportioned",
  landTransferPrice: "", buildingTransferPrice: "", landStandardPriceAtTransfer: "", acquisitionDate: "2023-03-01",
  // V-3′ 토지만 본인 주택의 건물 소유자 세대(⑧·⑫ 필수) — 이 시료는 1세대1주택이 아니라 세액과 무관하다. 토지만 본인일 때만 전송된다.
  buildingOwnerSameHousehold: true,
  carryover: {
    ...c0.carryover, donorAcquisitionPrice: "", useEstimatedAcquisition: true, estimationMode: "general",
    donorStandardPriceAtAcquisition: "300,000,000", donorStandardPriceAtTransfer: "1,400,000,000", giftDateValuation: "900,000,000",
  },
};
/** 증여자 취득가액 앎(3억) */
export const KNOWN: Loose = { ...ESTIMATED, carryover: { ...ESTIMATED.carryover, useEstimatedAcquisition: false, estimationMode: null, donorAcquisitionPrice: "300,000,000" } };
/** 증여세 상당액(산출세액·상당액 같은 값) */
export const withGift = (a: Loose, amount: string): Loose => ({ ...a, carryover: { ...a.carryover, giftTaxCalculated: amount, giftTaxAmount: amount } });

const HH = {
  transferDate: "2025-06-30", filingDate: "2025-08-31", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
export const ownerSplitForm = (a: Loose): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), { ...HH, contractTotalPrice: "1200000000", assets: [{ ...makeDefaultAsset(1), ...a } as AssetForm] }) as TransferFormData;

/** 폼 → ④ → route → 엔진. */
export async function runOwnerSplit(a: Loose) {
  const form = ownerSplitForm(a);
  const r = await postTransfer((await captureBody(form)) as Loose);
  return { form, status: r.status, result: r.result as Loose | undefined };
}
