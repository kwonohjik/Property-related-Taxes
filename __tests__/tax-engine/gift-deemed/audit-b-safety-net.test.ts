/**
 * 발견 단위 폐쇄 감사 B군 — 「구별력 0」 축에 단언을 넣는다.
 *
 * 이 파일의 대상은 **코드가 틀린 것들이 아니다.** 값은 전부 맞다. 문제는 그 값을 틀리게 바꿔도
 * 저장소의 어떤 게이트도 빨개지지 않는다는 것이다 — 조문 임계·음수 가드·원 미만 절사·조기반환
 * 블록이 그렇다. SC-6-b의 경우 두 뮤테이션을 동시에 적용한 채 vitest **전건 21,346건이 초록**이었다.
 *
 * ⚠️ 그래서 이 파일의 단언은 **경계값과 리터럴**로 쓴다.
 *    - 경계는 「지정값 ±1 동등성」으로 잡는다(범위 단언은 `>=`↔`>` 뒤집기를 놓친다).
 *    - 절사는 엔진과 같은 유도식(`Math.floor(finalTax * 3 / 100)`)으로 쓰지 않는다 —
 *      그건 echo라서 floor↔ceil을 구별하지 못한다. **리터럴**을 박는다.
 */
import { describe, it, expect } from "vitest";
import { calcSpecificCorpGift, calcSpecificCorpGiftMulti } from "@/lib/tax-engine/gift-deemed/specific-corp";
import { calcRelatedCorpGift } from "@/lib/tax-engine/gift-deemed/related-corp";
import type { SpecificCorpInput, RelatedCorpInput } from "@/lib/tax-engine/gift-deemed/types";

const SC_TX = {
  transactionDate: "2025-12-31",
  counterparty: "ruling_shareholder" as const,
  transactionType: "gratuitous" as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// SC-6-b — §34의5⑤ 「1억원 이상」 경계
// ─────────────────────────────────────────────────────────────────────────────

const ABSOLUTE_THRESHOLD = 100_000_000;

function scSingle(benefit: number) {
  return calcSpecificCorpGift({
    ...SC_TX,
    transactionBenefit: benefit,
    corporateTax: 0,
    ownershipRatio: { numer: 1, denom: 1 }, // 100% → gain = corpProfit
    controllingGroupRatio: { numer: 1, denom: 1 },
  } as unknown as SpecificCorpInput);
}

function scRoster(benefit: number, corporateTax = 0) {
  return calcSpecificCorpGiftMulti({
    ...SC_TX,
    transactionBenefit: benefit,
    corporateTax,
    totalShares: 100_000,
    shareholders: [
      { id: "1", name: "갑", relation: "lineal_descendant", shares: 100_000, totalShares: 100_000, isDonor: false, isRelated: true },
    ],
  } as unknown as SpecificCorpInput).specificCorpMulti!;
}

describe("SC-6-b — §34의5⑤ 1억원 경계 (「이상」이므로 정확히 1억은 과세된다)", () => {
  it("[B-0] single — 정확히 100,000,000원이면 **과세된다** (`>=`를 `>`로 바꾸면 여기서 빨개진다)", () => {
    const r = scSingle(ABSOLUTE_THRESHOLD);
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(100_000_000);
    expect(r.exclusionReason).toBeUndefined();
  });

  it("[B-1] single — 1원 모자란 99,999,999원이면 제외된다 (짝 — 경계의 반대편)", () => {
    const r = scSingle(ABSOLUTE_THRESHOLD - 1);
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toContain("1억원 미만");
  });

  it("[B-2] roster — 정확히 100,000,000원이면 과세된다 (`<`를 `<=`로 바꾸면 빨개진다)", () => {
    const m = scRoster(ABSOLUTE_THRESHOLD);
    expect(m.donees[0].gain).toBe(100_000_000);
    expect(m.donees[0].isTaxable).toBe(true);
    expect(m.donees[0].nonTaxableReason).toBeUndefined();
  });

  it("[B-3] roster — 99,999,999원이면 below_threshold 로 빠진다 (짝)", () => {
    const m = scRoster(ABSOLUTE_THRESHOLD - 1);
    expect(m.donees[0].gain).toBe(99_999_999);
    expect(m.donees[0].isTaxable).toBe(false);
    expect(m.donees[0].nonTaxableReason).toBe("below_threshold");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SC-6-e — 특정법인의 이익 음수 가드
// ─────────────────────────────────────────────────────────────────────────────

describe("SC-6-e — 법인세 상당액이 거래이익을 넘으면 「특정법인의 이익」은 0이다 (음수 금지)", () => {
  it("[B-4] roster — 음수 가드를 지우면 화면에 음수 이익이 그대로 나간다", () => {
    // roster+direct 모드는 `corporateTax`를 임의 금액으로 받는다(⑧이 값 자체를 제한하지 않는다).
    // `Math.max(0, …)`를 지우면 `corpProfit = -500,000,000`이 되어 결과뷰 요약·주주별 계산식·
    // breakdown 세 곳에 음수가 노출된다.
    const m = scRoster(1_000_000_000, 1_500_000_000);
    expect(m.corpProfit).toBe(0);
    expect(m.donees[0].gain).toBe(0);
  });

  it("[B-5] single — 같은 입력에서 증여의제이익 echo도 0이다", () => {
    // single 쪽 가드는 사용자에게 직접 보이지 않는 방어코드다 — 관측 지점이 `thresholdEcho`뿐이라
    // 그것을 단언한다. 「보이지 않으니 안 잰다」로 두면 조용히 음수가 흐른다.
    const r = calcSpecificCorpGift({
      ...SC_TX,
      transactionBenefit: 1_000_000_000,
      corporateTax: 1_500_000_000,
      ownershipRatio: { numer: 1, denom: 1 },
      controllingGroupRatio: { numer: 1, denom: 1 },
    } as unknown as SpecificCorpInput);
    expect(r.thresholdEcho?.gain).toBe(0);
    expect(r.deemedGiftValue).toBe(0);
    // breakdown의 「특정법인의 이익」 행도 0이다 (별도 가드 — 함께 고정한다)
    expect(r.breakdown[2]?.amount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SC-6-g — §69 신고세액공제의 «원 미만 절사» 축
// ─────────────────────────────────────────────────────────────────────────────

describe("SC-6-g — §69 신고세액공제는 원 미만을 **절사**한다 (반올림·올림이 아니다)", () => {
  // 🔴 기존 유일 픽스처는 finalTax가 100의 배수라 3%가 나누어떨어졌다 —
  //    floor를 ceil로 바꿔도 전건이 초록이었다. 주식수를 60,001로 한 칸 틀면 나누어떨어지지 않는다.
  //    주식수는 자유 숫자 입력(`SpecificCorpShareholderTable`)이라 UI 도달 경로도 열려 있다.
  const m = calcSpecificCorpGiftMulti({
    ...SC_TX,
    transactionBenefit: 3_000_000_000,
    corporateTaxComputed: 780_000_000,
    corporateTaxCredit: 0,
    annualIncome: 4_000_000_000,
    totalShares: 100_000,
    shareholders: [
      { id: "1", name: "갑", relation: "lineal_descendant", shares: 60_001, totalShares: 100_000, isDonor: false, isRelated: true },
    ],
  } as unknown as SpecificCorpInput).specificCorpMulti!;

  it("[B-6] finalTax가 100의 배수가 아닌 픽스처 — 전제 확인", () => {
    expect(m.donees[0].limitCalc?.finalTax).toBe(209_006_150);
    expect(209_006_150 % 100).not.toBe(0); // 3%가 나누어떨어지지 않는다
  });

  it("[B-7] 공제액은 6,270,184원 — **리터럴**로 박는다 (엔진 산식 재유도 금지)", () => {
    // `Math.floor(finalTax * 3 / 100)`으로 쓰면 엔진과 같은 식이라 floor↔ceil을 구별하지 못한다.
    // ceil이면 6,270,185가 된다 — 1원 차이가 이 단언의 존재 이유다.
    expect(m.donees[0].limitCalc?.filingCredit).toBe(6_270_184);
    expect(m.donees[0].limitCalc?.selfPayTax).toBe(202_735_966);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RC-6-g — §45의3 과세요건 미충족 조기반환 블록
// ─────────────────────────────────────────────────────────────────────────────

describe("RC-6-g — 과세요건 미충족 조기반환이 내보내는 7개 필드", () => {
  // 🔴 이 블록은 엔진 테스트 픽스처 3종·E2E 1종 어디에서도 실행되지 않았다 —
  //    전부 과세요건을 «충족»하는 입력이었다. 조기반환은 하류 단계를 통째로 건너뛰므로
  //    한 필드만 어긋나도 마법사 이관·합산배제까지 조용히 틀린다.
  const r = calcRelatedCorpGift({
    enterpriseSize: "small", // 정상거래비율 50%
    totalSales: 100_000_000_000,
    preTaxAdjOperatingIncome: 10_000_000_000,
    taxableIncome: 10_000_000_000,
    corporateTaxNet: 2_000_000_000,
    fiscalYearEndDate: "2025-12-31",
    intermediaryCorps: [],
    shareholders: [
      { id: "gap", name: "갑", relation: "self", directRatio: { numer: 60, denom: 100 }, isCorporate: false },
      { id: "etc", name: "기타", relation: "other", directRatio: { numer: 40, denom: 100 }, isCorporate: false },
    ],
    salesPartners: [
      { id: "s1", name: "특수법인", salesAmount: 40_000_000_000, isRelated: true }, // 40% ≤ 50%
      { id: "s2", name: "기타", salesAmount: 60_000_000_000, isRelated: false },
    ],
  } as unknown as RelatedCorpInput);

  it("[B-8] 전제 — 거래비율 40%가 정상거래비율 50% 이하라 요건을 충족하지 않는다", () => {
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toContain("정상거래비율 이하");
    expect(r.exclusionReason).toContain("§45의3①1호가목");
  });

  it("[B-9] 합산배제 축 — 이 두 필드가 마법사 이관의 §55①2호 분기를 가른다", () => {
    // 뮤테이션 생존 구간이었다. `aggregationExcluded`를 false로 바꾸면 증여세 마법사가
    // 0원짜리 의제이익을 «일반 합산»으로 넣는다.
    expect(r.aggregationExcluded).toBe(true);
    expect(r.aggExclClass).toBe("deemed_profit");
  });

  it("[B-10] 수량 축 — baseAfterTaxProfit·recipientBreakdown·breakdown", () => {
    expect(r.baseAfterTaxProfit).toBe(0);
    expect(r.recipientBreakdown).toEqual([]);
    // breakdown은 **비어 있지 않다** — 요건 판정 근거 2행을 싣는다.
    // 「[]일 것」으로 적으면 실제 동작과 어긋나 회귀를 못 잡는다.
    expect(r.breakdown.map((b) => [b.label, b.amount])).toEqual([
      ["특수관계법인 매출 합계", 40_000_000_000],
      ["과세제외매출액(§⑩)", 0],
    ]);
  });
});
