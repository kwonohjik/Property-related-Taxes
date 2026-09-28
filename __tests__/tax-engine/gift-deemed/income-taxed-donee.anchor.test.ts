/**
 * 「상증법」§4의2③ — 수증자에게 소득세·법인세가 부과되면 증여세를 부과하지 않는다 (7-16).
 *
 * 원문(현행 MST 276123):
 *   ③ 「제1항의 증여재산에 대하여 수증자에게 「소득세법」에 따른 소득세 또는 「법인세법」에 따른 법인세가
 *      부과되는 경우에는 증여세를 부과하지 아니한다. 소득세 또는 법인세가 「소득세법」, 「법인세법」 또는
 *      다른 법률에 따라 비과세되거나 감면되는 경우에도 또한 같다.」
 *
 * 법이 ③을 배제하는 곳(상증법 전문 111개 조문 대조 — 「제4조의2제3항」 인용은 §41의2 하나):
 *   §41의2① 「제4조의2제3항에도 불구하고」 — 초과배당은 자체 방식(소득세 상당액 공제)이다.
 *   §45의2 — ②가 「제1항에도 불구하고」 실제소유자에게 납세의무를 지운다. ③은 「제1항의 증여재산」이 전제다.
 *
 * 범위(사용자 결정 2026-09-28): 수증자 1명(한 묶음) 입력만. 명부 모드는 이번에 반영하지 않는다.
 */
import { describe, it, expect } from "vitest";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { incomeTaxedDoneeGateApplies } from "@/lib/tax-engine/gift-deemed/taxpayer-gate";
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/gift-deemed-input-types";
import { INCOME_TAXED_APPLIED as APPLIED, INCOME_TAXED_OUT_OF_SCOPE as OUT } from "./income-taxed-donee.fixture";

const on = (i: DeemedGiftInput) => ({ ...i, doneeIncomeOrCorporateTaxed: true }) as DeemedGiftInput;
const DEFINED_TERM = /증여재산가액|증여추정가액|증여의제이익/;
const REASON = /§4의2③/;

describe("§4의2③ — 판정", () => {
  it.each(Object.keys(APPLIED))("[ITD-0] %s — 게이트가 걸린다", (k) => {
    expect(incomeTaxedDoneeGateApplies(APPLIED[k])).toBe(true);
  });

  it.each(Object.keys(OUT))("[ITD-0b] 긍정 짝: %s(명부) — 걸리지 않는다", (k) => {
    expect(incomeTaxedDoneeGateApplies(OUT[k])).toBe(false);
  });

  it("[ITD-0c] 긍정 짝: 법이 ③을 배제한 §41의2·②가 가져간 §45의2·명부뿐인 §45의3은 밖이다", () => {
    for (const type of ["excess_dividend", "nominee_trust", "related_corp"])
      expect(incomeTaxedDoneeGateApplies({ type } as DeemedGiftInput)).toBe(false);
  });
});

describe("§4의2③ — 결과", () => {
  it.each(Object.keys(APPLIED))("[ITD-1] %s — 켜면 과세 제외, 사유 ③, 금액은 「제외 전」", (k) => {
    const base = calcDeemedGift(APPLIED[k]);
    expect(base.applied).toBe(true); // 전제
    const r = calcDeemedGift(on(APPLIED[k]));
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toMatch(REASON);
    expect(r.breakdown.some((b) => DEFINED_TERM.test(b.label))).toBe(false);
    expect(r.breakdown.filter((b) => b.label.includes("제외 전")).some((b) => b.amount === base.deemedGiftValue)).toBe(true);
  });

  it.each(Object.keys(APPLIED))("[ITD-2] 긍정 짝: %s — 끄면 종전 그대로", (k) => {
    const base = calcDeemedGift(APPLIED[k]);
    const off = calcDeemedGift({ ...APPLIED[k], doneeIncomeOrCorporateTaxed: false } as DeemedGiftInput);
    expect(off.deemedGiftValue).toBe(base.deemedGiftValue);
    expect(off.applied).toBe(true);
  });

  it.each(Object.keys(APPLIED))("[ITD-3] 긍정 짝: %s — 키는 있고 값이 undefined면 과세 유지(미입력 = 부과 안 됨)", (k) => {
    const r = calcDeemedGift({ ...APPLIED[k], doneeIncomeOrCorporateTaxed: undefined } as DeemedGiftInput);
    expect(r.applied).toBe(true);
  });

  it.each(Object.keys(OUT))("[ITD-4] 긍정 짝: %s(명부) — 켜도 무변화", (k) => {
    const base = calcDeemedGift(OUT[k]);
    expect(calcDeemedGift(on(OUT[k])).deemedGiftValue).toBe(base.deemedGiftValue);
  });

  it("[ITD-5] §45의5 — 제외되면 한도 계산(결정세액)을 남기지 않는다", () => {
    const base = calcDeemedGift(APPLIED.specific_corp_single);
    expect(base.specificCorpLimit).toBeDefined(); // 전제
    expect(calcDeemedGift(on(APPLIED.specific_corp_single)).specificCorpLimit).toBeUndefined();
  });

  it("[ITD-6] 요건 불성립으로 이미 미적용이면 엔진 자신의 사유를 덮지 않는다", () => {
    const below = { type: "org_change", subType: "value_change", baseValue: 1_000_000_000, preValue: 1_000_000_000, postValue: 1_010_000_000 } as DeemedGiftInput;
    const base = calcDeemedGift(below);
    expect(base.applied).toBe(false);
    expect(calcDeemedGift(on(below)).exclusionReason).toBe(base.exclusionReason);
  });

  it("[ITD-7] ⑥ 표지는 제외돼도 남는다 — 다른 축이다", () => {
    expect(calcDeemedGift(on(APPLIED.bargain_transfer)).donorJointLiabilityExempt).toBe(true);
    expect(calcDeemedGift(on(APPLIED.insurance)).donorJointLiabilityExempt).toBe(false);
  });
});
