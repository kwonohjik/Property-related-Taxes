import { describe, it, expect } from "vitest";
import { buildGiftWizardPrefill } from "@/lib/calc/gift-deemed-prefill";
import { buildGiftTaxInput } from "@/lib/calc/gift-api";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import { INITIAL_FORM } from "@/components/calc/gift-tax-form-shared";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import { INITIAL_DEEMED } from "@/components/calc/deemed-gift/deemed-form-state";
import type { DeemedFormState } from "@/components/calc/deemed-gift/deemed-form-state";
import type { FormState } from "@/components/calc/gift-tax-form-shared";
import type { DeemedGiftAnyResult } from "@/lib/tax-engine/gift-deemed/types";

/**
 * 1-D — 증여세 마법사 이관의 **증여자 축**과 **수증자 축** (리뷰 #1·#6·#18·#28·#27)
 *
 * 「상증법」§53은 「거주자가 **다음 각 호의 어느 하나에 해당하는 사람으로부터** 증여를 받은
 * 경우에는 …」이라는 **한정 열거 요건규정**이다. §39의 증여자는 신주인수권을 포기한 주주이거나
 * 균등 배정분에 미달하게 배정받은 다른 주주이며, 수증자의 직계존속인 경우가 **오히려 예외**다
 * (나목의 특수관계인은 「상증령」§2의2①상 사용인·임원·출자법인 등 비친족 범주를 다수 포함한다).
 *
 * 그런데 `buildGiftWizardPrefill`의 **어느 분기도 `donor`를 싣지 않아** 마법사가
 * `INITIAL_FORM.donor = "father"`를 그대로 들고 §53 제2호 5천만원 공제를 적용했다.
 * ⑧에는 차단 게이트가 **이미 있었지만**(`gift-tax-form-validate.ts:35`) 기본값이
 * 「선택 완료 상태」라 도달하지 못했다 — 「묻지 않고 붙는다」가 아니라 **「틀린 기본값이
 * 조용히 선택돼 있다」**가 정확한 서술이다.
 *
 * ⚠️ `donor: undefined`는 동작하지 않는다 — 이관 경로가 `JSON.stringify` → sessionStorage →
 *    `JSON.parse`라 값이 `undefined`인 키는 **삭제**되고 병합 후 `"father"`가 그대로 남는다.
 *    아래 `merged()`가 그 왕복을 그대로 재현한다.
 */

const dform = (o: Partial<DeemedFormState> = {}): DeemedFormState => ({
  ...INITIAL_DEEMED,
  giftDate: "2026-03-02",
  ...o,
});

/** 이관 실제 경로 재현 — JSON 왕복(undefined 키 소실)을 포함한다 */
function merged(p: Partial<FormState>): FormState {
  const roundtrip = JSON.parse(JSON.stringify(p)) as Partial<FormState>;
  return { ...INITIAL_FORM, ...roundtrip };
}

const SINGLE_RESULT = {
  type: "capital_increase",
  applied: true,
  deemedGiftValue: 100_000_000,
  breakdown: [],
  legalBasis: "상증법 §39",
} as unknown as DeemedGiftAnyResult;

/** 교재 사례3 구조 — 과세 수증자 2명(을 200,000,000 · 병 400,000,000) */
function allocResult() {
  return calcCapitalIncreaseAllocation({
    direction: "low",
    preIssuePrice: 30_000,
    newSharePrice: 10_000,
    shareholders: [
      { id: "갑", name: "갑", preShares: 60_000, entitledShares: 60_000, subscribedShares: 0, reallocatedShares: 0, relatedTo: ["을", "병"] },
      { id: "을", name: "을", preShares: 30_000, entitledShares: 30_000, subscribedShares: 50_000, reallocatedShares: 20_000, relatedTo: ["갑"] },
      { id: "병", name: "병", preShares: 0, entitledShares: 0, subscribedShares: 40_000, reallocatedShares: 40_000, relatedTo: ["갑"] },
      { id: "소액주주", name: "소액주주", preShares: 10_000, entitledShares: 10_000, subscribedShares: 10_000, reallocatedShares: 0, relatedTo: [] },
    ],
  });
}

describe("[PF-S39-DONOR] #1 증여자 축이 이관되지 않아 §53 제2호가 묻지 않고 붙는다", () => {
  it("[PF-S39-DONOR-BLOCK-SINGLE] 단건 — 병합 후 ⑧이 증여자 미선택을 차단한다", () => {
    const p = buildGiftWizardPrefill(dform({ type: "capital_increase" }), SINGLE_RESULT);
    expect(validateStep(0, merged(p))).toBe("증여자를 선택하세요.");
  });

  it("[PF-S39-DONOR-BLOCK-ALLOC] cap-table — 같은 차단이 걸린다", () => {
    const p = buildGiftWizardPrefill(dform({ type: "capital_increase_allocation" }), allocResult());
    expect(validateStep(0, merged(p))).toBe("증여자를 선택하세요.");
  });

  it("[PF-S39-DONOR-TAX] 차단하지 않으면 3,880,000이 조용히 덜 나온다 (세액 단계 관측)", () => {
    const p = buildGiftWizardPrefill(dform({ type: "capital_increase" }), SINGLE_RESULT);
    const base = merged(p);
    // 기본값 「부」가 그대로 남았을 때 — §53 제2호 5천만원
    const asFather = calcGiftTax(buildGiftTaxInput({ ...base, donor: "father" })).finalTax;
    // 사용자가 실제 관계(기타친족)를 고른 경우 — §53 제4호 1천만원
    const asOther = calcGiftTax(buildGiftTaxInput({ ...base, donor: "other_relative" })).finalTax;
    expect(asFather).toBe(4_850_000);
    expect(asOther).toBe(8_730_000);
    expect(asOther - asFather).toBe(3_880_000);
  });

  it("[PF-S39-DONOR-KEEP] 긍정 짝 — 증여자를 고르면 그대로 통과한다", () => {
    const p = buildGiftWizardPrefill(dform({ type: "capital_increase" }), SINGLE_RESULT);
    expect(validateStep(0, { ...merged(p), donor: "other_relative" })).toBeNull();
  });
});

describe("[PF-S39-ALLOC-DONEE] #18·#28 cap-table 수증자별 독립 납세의무", () => {
  // 「상증법」§4의2①·§68① — 증여세는 **수증자별**로 납세의무가 성립하고 신고도 수증자별이다.
  // 마법사 세션 1개 = 신고 1건이므로 전원을 한 세션에 합치면 누진구간이 올라가고
  // §53 공제가 1회만 적용된다. 형제 4개 분기(§39의2·§39의3 고가·§45의3·§45의5)는 이미
  // 「선택된 1명만 이관」으로 고쳐져 있고 이 분기만 비대칭이었다.
  it("[PF-S39-ALLOC-ONE] 선택된 1명만 이관한다 (index 0 → 을 200,000,000)", () => {
    const p = buildGiftWizardPrefill(dform({ type: "capital_increase_allocation" }), allocResult());
    expect(p.giftItems).toHaveLength(1);
    expect(p.giftItems?.[0].marketValue).toBe(200_000_000);
    expect(p.giftItems?.[0].name).toContain("을");
  });

  it("[PF-S39-ALLOC-INDEX] index 1 → 병 400,000,000", () => {
    const p = buildGiftWizardPrefill(
      dform({ type: "capital_increase_allocation", ciAllocSelectedDoneeIndex: 1 }),
      allocResult(),
    );
    expect(p.giftItems).toHaveLength(1);
    expect(p.giftItems?.[0].marketValue).toBe(400_000_000);
    expect(p.giftItems?.[0].name).toContain("병");
  });

  it("[PF-S39-ALLOC-OVERFLOW] 범위 밖 인덱스는 첫 과세 수증자로 되돌린다 (결과뷰 드롭다운과 같은 술어)", () => {
    const p = buildGiftWizardPrefill(
      dform({ type: "capital_increase_allocation", ciAllocSelectedDoneeIndex: 9 }),
      allocResult(),
    );
    expect(p.giftItems?.[0].marketValue).toBe(200_000_000);
  });

  it("[PF-S39-ALLOC-TAX] 합산 이관이 24,250,000 과다였다 (세액 단계 관측)", () => {
    const r = allocResult();
    // 이관 항목은 prefill이 만든 것 그대로 쓴다 — §47① 합산배제 플래그까지 실제와 같아야
    // 세액이 같은 스트림에서 나온다(손으로 만든 항목은 플래그가 없어 다른 값이 된다).
    const itemAt = (i: number) =>
      buildGiftWizardPrefill(
        dform({ type: "capital_increase_allocation", ciAllocSelectedDoneeIndex: i }),
        r,
      ).giftItems![0];
    const tax = (items: FormState["giftItems"]) =>
      calcGiftTax(
        buildGiftTaxInput({ ...INITIAL_FORM, giftDate: "2026-03-02", donor: "father", giftItems: items }),
      ).finalTax;

    const one = itemAt(0);
    const two = itemAt(1);
    expect(tax([one, two])).toBe(101_850_000); // 종전: 한 세션 합산 — 누진구간 상승 + §53 1회
    expect(tax([one])).toBe(19_400_000);
    expect(tax([two])).toBe(58_200_000);
    expect(tax([one, two]) - (tax([one]) + tax([two]))).toBe(24_250_000);
  });
});
