/**
 * anchor #100 — 증여이익 → 증여세 마법사 이관 항목에 **출처(사실관계)** 를 싣는다.
 *
 * 설계: docs/00-pm/gift39-72-100-103-deemed-history.plan.md (PR ②)
 *
 * 「상증령」§29②1호는 (가 − 나) × 다의 **곱**이라 인자 조합이 달라도 금액이 같을 수 있다.
 * 종전 이관 payload는 금액만 실어, 완전히 다른 두 증자(A·B)가 문자 단위로 같은 payload가 됐고
 * 증여세 이력이 contentHash로 **1건에 합쳐졌다**(리뷰 I-gift-tax-handoff.md:249 실측 `created:false`).
 *
 * ⚠️ `sourceCalculationId`만으로는 풀리지 않는다 — `content-hash.ts` `VOLATILE_ID_KEY`가 `…Id` 키
 *    값을 해시에서 토큰화한다. 사실(엔진 입력)이 inputData에 있어야 해시가 갈린다.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { calculationRepository, resetLocalDB } from "@/lib/storage";
import { buildGiftWizardPrefill } from "@/lib/calc/gift-deemed-prefill";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/deemed-form-state";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";
import type { DeemedGiftAnyResult } from "@/lib/tax-engine/gift-deemed/types";

const A: DeemedFormState = {
  ...INITIAL_DEEMED, type: "capital_increase", giftDate: "2026-03-02",
  ciPrePrice: "10,000", ciPreShares: "100,000", ciNewPrice: "5,000", ciIssuedShares: "100,000", ciForfeitedShares: "40,000",
};
const B: DeemedFormState = {
  ...INITIAL_DEEMED, type: "capital_increase", giftDate: "2026-03-02",
  ciPrePrice: "20,000", ciPreShares: "50,000", ciNewPrice: "10,000", ciIssuedShares: "50,000", ciForfeitedShares: "20,000",
};
const engine = (f: DeemedFormState) =>
  calcDeemedGift({
    type: "capital_increase",
    preIssuePrice: Number(f.ciPrePrice.replace(/,/g, "")), preIssueShares: Number(f.ciPreShares.replace(/,/g, "")),
    newSharePrice: Number(f.ciNewPrice.replace(/,/g, "")), issuedShares: Number(f.ciIssuedShares.replace(/,/g, "")),
    forfeitedShares: Number(f.ciForfeitedShares.replace(/,/g, "")),
  });

/** 이관 실제 경로 — JSON 왕복 후 마법사 초기폼에 병합(GiftTaxForm 마운트 수신과 같은 순서) */
const giftForm = (p: Partial<FormState>): FormState => ({ ...INITIAL_FORM, ...(JSON.parse(JSON.stringify(p)) as Partial<FormState>) });

/** 두 이관이 같은 증여세 결과를 낳을 때(금액·날짜·관계가 같으면 그렇다) 이력이 몇 건이 되는가 */
async function saveGift(form: FormState) {
  return calculationRepository.saveOrUpdateByBusinessKey({
    taxType: "gift", title: "증여세", inputData: form as unknown as Record<string, unknown>,
    resultData: { finalTax: 12_345 }, taxLawVersion: "2026-03-02", linkedCalculationId: null, clientId: null,
  });
}

describe("#100 이관 출처", () => {
  beforeEach(async () => { await resetLocalDB(); });

  it("[PV-0] 전제 — A·B는 인자가 전혀 다른데 증여이익이 같다(100,000,000)", () => {
    expect(engine(A).deemedGiftValue).toBe(100_000_000);
    expect(engine(B).deemedGiftValue).toBe(100_000_000);
  });

  it("[PV-1] 이관 항목이 엔진 입력을 출처로 싣는다 — A·B의 항목이 갈린다", () => {
    const itemA = buildGiftWizardPrefill(A, engine(A)).giftItems![0];
    const itemB = buildGiftWizardPrefill(B, engine(B)).giftItems![0];
    expect(itemA.deemedSource?.type).toBe("capital_increase");
    expect(itemA.deemedSource?.input).toMatchObject({ preIssuePrice: 10_000, forfeitedShares: 40_000 });
    expect(itemB.deemedSource?.input).toMatchObject({ preIssuePrice: 20_000, forfeitedShares: 20_000 });
  });

  it("[PV-2] 🔴 A·B를 따로 이관해 저장하면 증여세 이력이 **2건**이다(종전 1건으로 합쳐짐)", async () => {
    const s1 = await saveGift(giftForm(buildGiftWizardPrefill(A, engine(A))));
    const s2 = await saveGift(giftForm(buildGiftWizardPrefill(B, engine(B))));
    expect(s1.created).toBe(true);
    expect(s2.created).toBe(true);
    expect(s2.id).not.toBe(s1.id);
  });

  it("[PV-3] 짝 — 같은 A를 두 번 이관하면 1건(자동 dedup 유지)", async () => {
    const s1 = await saveGift(giftForm(buildGiftWizardPrefill(A, engine(A))));
    const s2 = await saveGift(giftForm(buildGiftWizardPrefill(A, engine(A))));
    expect(s2.created).toBe(false);
    expect(s2.id).toBe(s1.id);
  });

  it("[PV-4] 출처 record id(R12) — 주어지면 싣고, 없으면 키 자체가 없다", () => {
    const withId = buildGiftWizardPrefill(A, engine(A), "rec-9").giftItems![0];
    const without = buildGiftWizardPrefill(A, engine(A)).giftItems![0];
    expect(withId.deemedSource?.sourceCalculationId).toBe("rec-9");
    expect(without.deemedSource && "sourceCalculationId" in without.deemedSource).toBe(false);
  });

  it("[PV-5] cap-table(수증자 선택 분기)도 출처를 싣는다 — 출구 한 곳에서 붙인다", () => {
    const form: DeemedFormState = { ...INITIAL_DEEMED, type: "capital_increase_allocation", giftDate: "2026-03-02" };
    const result = calcCapitalIncreaseAllocation({
      direction: "high", preIssuePrice: 10_000, newSharePrice: 30_000,
      shareholders: [
        { id: "sh-1", name: "갑", preShares: 50_000, entitledShares: 50_000, subscribedShares: 80_000, reallocatedShares: 30_000 },
        { id: "sh-2", name: "병", preShares: 30_000, entitledShares: 30_000, subscribedShares: 0, reallocatedShares: 0, relatedTo: ["sh-1"] },
      ],
    }) as unknown as DeemedGiftAnyResult;
    const item = buildGiftWizardPrefill(form, result).giftItems![0];
    expect(item.deemedSource?.type).toBe("capital_increase_allocation");
  });

  it("[PV-6] 항목이 여럿인 분기(§33 신탁이익 원본권·수익권)는 **모든** 항목에 출처가 붙는다", () => {
    const form: DeemedFormState = { ...INITIAL_DEEMED, type: "trust_benefit", giftDate: "2026-03-02" };
    const result = {
      type: "trust_benefit", applied: true, deemedGiftValue: 30_000_000, breakdown: [], legalBasis: "상증법 §33",
      subGifts: [
        { right: "principal", value: 10_000_000, lawRef: "§33" },
        { right: "income", value: 20_000_000, lawRef: "§33" },
      ],
    } as unknown as DeemedGiftAnyResult;
    const items = buildGiftWizardPrefill(form, result, "rec-7").giftItems!;
    expect(items).toHaveLength(2);
    for (const it of items) {
      expect(it.deemedSource?.type).toBe("trust_benefit");
      expect(it.deemedSource?.sourceCalculationId).toBe("rec-7");
    }
  });
});
