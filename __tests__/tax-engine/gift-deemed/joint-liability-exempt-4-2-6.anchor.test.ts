import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseGift } from "@/lib/tax-engine/gift-deemed/capital-increase";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import { calcConvertibleStockGift } from "@/lib/tax-engine/gift-deemed/convertible-stock";
import { calcInsuranceGift } from "@/lib/tax-engine/gift-deemed/insurance";
import { buildGiftWizardPrefill } from "@/lib/calc/gift-deemed-api";
import { buildGiftTaxInput } from "@/lib/calc/gift-api";
import { INITIAL_FORM } from "@/components/calc/gift-tax-form-shared";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import type { CapitalIncreaseInput } from "@/lib/tax-engine/gift-deemed/types";

/**
 * #97·#71 — 「상증법」§4의2⑥ 단서 증여자 연대납부의무 **면제 표지**.
 *
 *   §4의2⑥ 「증여자는 … 수증자가 납부할 증여세를 연대하여 납부할 의무가 있다.
 *           **다만, … 제35조부터 제39조까지, …에 해당하는 경우는 제외한다.**」
 *
 * §39는 「제35조부터 제39조까지」에 들어 있고 **조건 없이** 배제된다 — 단서에서 조건부
 * 괄호가 붙은 것은 제48조뿐이다. ⇒ §39 3경로(단건·cap-table·전환주식) 전부 표지가 선다.
 *
 * ⚠️ **계산 결과와 무관한 상수 표지**다. 배제(§4의2①③·④)로 과세분이 0이 되어도
 *    「그 증여에 연대납부의무가 없다」는 사실은 그대로다 ⇒ 표지도 그대로 남는다.
 *
 * 🔴 **열거 밖 유형에 세우면 안 된다** — §33(신탁이익)·§34(보험금)·§43·§44·§45의2(명의신탁)는
 *    단서 열거에 **없다**. 세우면 화면이 「연대납부의무 없음」이라고 **거짓 고지**한다.
 */

const LOW: CapitalIncreaseInput = {
  direction: "low",
  subType: "forfeited_realloc",
  preIssuePrice: 10_000,
  preIssueShares: 100_000,
  newSharePrice: 5_000,
  issuedShares: 50_000,
  forfeitedShares: 10_000,
};

describe("[JL] §4의2⑥ 단서 — 증여자 연대납부의무 면제 표지", () => {
  it("[JL-1] §39 단건 저가 — 표지가 선다", () => {
    const r = calcCapitalIncreaseGift(LOW);
    expect(r.deemedGiftValue).toBe(33_330_000); // 기준선이 살아 있음을 함께 고정
    expect(r.donorJointLiabilityExempt).toBe(true);
  });

  it("[JL-2] §39 단건 고가 — 표지가 선다", () => {
    const r = calcCapitalIncreaseGift({
      direction: "high",
      subType: "no_realloc",
      preIssuePrice: 10_000,
      preIssueShares: 100_000,
      newSharePrice: 20_000,
      issuedShares: 20_000,
      forfeitedShares: 30_000,
      relatedAcquiredShares: 15_000,
      ratioDenomShares: 50_000,
    });
    expect(r.donorJointLiabilityExempt).toBe(true);
  });

  // 배제와 면제는 **다른 축**이다 — 과세분이 0이어도 「연대납부의무가 없다」는 사실은 남는다.
  it("[JL-3] 배제 경로(영리법인 수증자)에서도 표지는 남는다", () => {
    const r = calcCapitalIncreaseGift({ ...LOW, doneeIsForProfitCorp: true });
    expect(r.applied).toBe(false);
    expect(r.donorJointLiabilityExempt).toBe(true);
  });

  it("[JL-4] §39 cap-table — 표지가 선다", () => {
    const r = calcCapitalIncreaseAllocation({
      direction: "low",
      preIssuePrice: 12_000,
      newSharePrice: 10_000,
      shareholders: [
        { id: "갑", name: "갑", preShares: 200_000, entitledShares: 200_000, subscribedShares: 0, reallocatedShares: 0, relatedTo: ["을"] },
        { id: "을", name: "을", preShares: 100_000, entitledShares: 100_000, subscribedShares: 200_000, reallocatedShares: 100_000, relatedTo: ["갑"] },
      ],
    });
    expect(r.donorJointLiabilityExempt).toBe(true);
  });

  it("[JL-5] §39①3호 전환주식 — 정상·배제 양쪽에서 표지가 선다", () => {
    const leg = (newSharePrice: number): CapitalIncreaseInput => ({
      direction: "low",
      preIssuePrice: 20_000,
      preIssueShares: 100_000,
      newSharePrice,
      issuedShares: 100_000,
      forfeitedShares: 100_000,
    });
    const normal = calcConvertibleStockGift({ atConversion: leg(10_000), atIssuance: leg(14_000) });
    expect(normal.deemedGiftValue).toBe(200_000_000);
    expect(normal.donorJointLiabilityExempt).toBe(true);

    const excluded = calcConvertibleStockGift({
      atConversion: { ...leg(10_000), doneeIsForProfitCorp: true },
      atIssuance: leg(14_000),
    });
    expect(excluded.applied).toBe(false);
    expect(excluded.donorJointLiabilityExempt).toBe(true);
  });

  // 🔴 긍정 짝 — 이 단언이 없으면 「전부 true로 세우기」가 초록으로 통과한다.
  it("[JL-6] 긍정 짝 — §34 보험금은 단서 열거 밖이라 표지가 서지 않는다", () => {
    const r = calcInsuranceGift({
      caseType: "non_payer",
      insuranceProceeds: 100_000_000,
      totalPremiumPaid: 10_000_000,
      relevantPremium: 6_000_000,
      isInheritanceInsurance: false,
    });
    expect(r.deemedGiftValue).toBe(60_000_000); // 계산 자체는 살아 있다
    expect(r.donorJointLiabilityExempt).toBeUndefined();
  });

  // ── prefill — 엔진 표지가 EstateItem 행별 표지로 이어져야 잠금(#71)이 가능하다 ──
  const formOf = (patch: Partial<DeemedFormState>): DeemedFormState => ({
    ...INITIAL_DEEMED,
    giftDate: "2025-03-15",
    ...patch,
  });

  it("[JL-7] prefill이 표지를 EstateItem으로 옮긴다", () => {
    const prefill = buildGiftWizardPrefill(
      formOf({ type: "capital_increase" }),
      calcCapitalIncreaseGift(LOW),
    );
    expect(prefill.giftItems?.length).toBeGreaterThan(0);
    expect(prefill.giftItems?.every((g) => g.isJointLiabilityExemptGift === true)).toBe(true);
  });

  it("[JL-8] 긍정 짝 — 표지 없는 결과는 EstateItem에도 붙지 않는다", () => {
    const prefill = buildGiftWizardPrefill(
      formOf({ type: "insurance" }),
      calcInsuranceGift({
        caseType: "non_payer",
        insuranceProceeds: 100_000_000,
        totalPremiumPaid: 10_000_000,
        relevantPremium: 6_000_000,
        isInheritanceInsurance: false,
      }),
    );
    expect(prefill.giftItems?.length).toBeGreaterThan(0);
    expect(prefill.giftItems?.some((g) => g.isJointLiabilityExemptGift === true)).toBe(false);
  });
});

/**
 * ④ API 변환 — 3중 패턴의 **두 번째 다리**.
 *
 * ⑤가 화면에서 토글을 잠가도 폼 값이 `true`로 남아 있을 수 있다(sessionStorage 복원,
 * 항목을 나중에 추가하는 순서 등). 그때 ④가 그대로 엔진에 보내면 화면과 계산이 갈린다.
 * KM9(④ fallback 제거) 뮤테이션이 **전건 초록으로 살아남아** 이 공백이 드러났다.
 */
describe("[JL-API] ④ 변환도 같은 술어를 쓴다", () => {
  const exempt = {
    id: "a",
    category: "other" as const,
    name: "증자이익(§39)",
    marketValue: 100_000_000,
    isJointLiabilityExemptGift: true as const,
  };
  const plain = { id: "b", category: "financial" as const, name: "예금", marketValue: 50_000_000 };

  it("[JL-API-1] 전부 면제 유형이면 폼 값이 true여도 false로 보낸다", () => {
    const input = buildGiftTaxInput({
      ...INITIAL_FORM,
      donorPaysGiftTax: true,
      donorHasJointLiability: true,
      giftItems: [exempt],
      stockItems: [],
    });
    expect(input.donorHasJointLiability).toBe(false);
  });

  // 긍정 짝 — 일반 증여가 섞이면 사용자의 선택을 그대로 보낸다. 이 단언이 없으면
  //   「항상 false로 보내기」가 위 테스트만으로 초록이 된다.
  it("[JL-API-2] 긍정 짝 — 혼합이면 폼 값을 그대로 보낸다", () => {
    const input = buildGiftTaxInput({
      ...INITIAL_FORM,
      donorPaysGiftTax: true,
      donorHasJointLiability: true,
      giftItems: [exempt, plain],
      stockItems: [],
    });
    expect(input.donorHasJointLiability).toBe(true);
  });
});
