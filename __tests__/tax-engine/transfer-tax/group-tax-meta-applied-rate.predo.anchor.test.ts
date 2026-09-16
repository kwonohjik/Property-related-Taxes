/**
 * Pre-Do anchor — 그룹 표시 메타가 **합산에 실제 적용된 세율·누진공제**여야 한다
 *
 * 계획서: `docs/00-pm/group-tax-meta-applied-rate.plan.md`
 *
 * ## 제보 (사용자 화면 2건, 2026-09-16)
 *
 * 신고서 표의 **세율구분 코드가 두 자산 모두 `1-10`**(§104①1호 일반누진)인데, 상세명세서는
 * 「**적용 호가 둘 이상**이라 단일 산식으로 표시할 수 없습니다(최고세율 38%)」라고 말했다.
 * 같은 화면이 스스로 모순이다.
 *
 * ## 검산 — 엔진은 맞았다
 *
 *   합계   399,400,000 × 40% − 25,940,000(§55 3억~5억) = 133,820,000   ← 표시값과 원 단위 일치
 *   자산1  (91,400,000 + 19,940,000) / 0.38 = 293,000,000              ← standalone 참고치
 *   자산2  (21,800,000 + 15,440,000) / 0.35 = 106,400,000
 *          293,000,000 + 106,400,000 = 399,400,000
 *
 * 같은 호 두 자산을 **합산해 1회 누진 적용**한 것이 맞다(§104⑤2호 **단서**).
 *
 * ## 틀린 것은 메타다
 *
 * 누진 호 경로는 `calcTax(합산과세표준)`으로 세액을 만들면서 **`.calculatedTax`만 취하고**
 * `appliedRate`(40%)·`progressiveDeduction`(25,940,000)을 버린다. 그 자리에 **파트별
 * standalone 최고세율**(38%)과 리터럴 **0**을 싣는다.
 * ⇒ `GroupTaxResult.progressiveDeduction`은 **값이 실린 적이 없다**(리터럴 0 두 곳뿐).
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";

const rates = makeMockRates();

/** 일반누진(§104①1호) 자산 — 보유 2.5년(단기 아님 · 장특공제 0%) · 중과 없음 */
function plainAsset(propertyId: string, gain: number): TransferTaxItemInput {
  const base = baseTransferInput();
  return {
    ...(base as unknown as TransferTaxItemInput),
    propertyId,
    propertyLabel: propertyId,
    propertyType: "land",
    transferPrice: 1_000_000_000 + gain,
    acquisitionPrice: 1_000_000_000,
    acquisitionDate: new Date("2019-01-01"),
    transferDate: new Date("2021-07-01"),
    isOneHousehold: false,
    isRegulatedArea: false,
    householdHousingCount: 1,
    expenses: 0,
  };
}

/** 제보 화면 그대로 — 과세표준 293,000,000 + 106,400,000 = 399,400,000 */
function runReported() {
  const input: AggregateTransferInput = {
    taxYear: 2021,
    annualBasicDeductionUsed: 2_500_000, // 기본공제 소진 → 과세표준 = 소득금액
    properties: [plainAsset("A", 293_000_000), plainAsset("B", 106_400_000)],
  };
  return calculateTransferTaxAggregate(input, rates);
}

describe("A-0. 제보 상황이 실제로 재현된다 (V-1)", () => {
  const r = runReported();

  it("세율군은 하나(일반 누진)이고 합산 과세표준이 399,400,000이다", () => {
    expect(r.groupTaxes).toHaveLength(1);
    expect(r.groupTaxes[0].groupTaxBase).toBe(399_400_000);
  });

  it("산출세액은 합산 과세표준에 40%를 적용한 값이다", () => {
    expect(r.groupTaxes[0].groupCalculatedTax).toBe(133_820_000);
    expect(r.calculatedTax).toBe(133_820_000);
  });
});

describe("A-1. 그룹 메타는 «합산에 실제 적용된» 세율·누진공제다", () => {
  it("🔴 세율 40% — 파트별 standalone 최고세율(38%)이 아니다", () => {
    expect(runReported().groupTaxes[0].appliedRate).toBe(0.4);
  });

  it("🔴 누진공제 25,940,000 — 0이 아니다", () => {
    expect(runReported().groupTaxes[0].progressiveDeduction).toBe(25_940_000);
  });
});

describe("A-2. 🔒 세액은 바뀌지 않는다 — 표시 메타만 고친다", () => {
  const r = runReported();

  it("그룹 산출세액·총 산출세액·결정세액 모두 종전 값", () => {
    expect(r.groupTaxes[0].groupCalculatedTax).toBe(133_820_000);
    expect(r.calculatedTax).toBe(133_820_000);
    expect(r.determinedTax).toBe(133_820_000);
  });

  it("자산별 standalone 참고치도 그대로 (신고서 표의 자산 열)", () => {
    const refs = r.properties.map((p) => p.refCalculatedTax);
    expect(refs).toEqual([91_400_000, 21_800_000]);
  });
});

describe("A-3. 항등식 — 메타로 값을 재현할 수 있다", () => {
  it("floor(과세표준 × 세율) − 누진공제 === 산출세액", () => {
    const g = runReported().groupTaxes[0];
    expect(Math.floor(g.groupTaxBase * g.appliedRate) - g.progressiveDeduction).toBe(
      g.groupCalculatedTax,
    );
  });
});

describe("A-4. 세율군이 갈려도 각 군의 메타가 자기 세액을 재현한다", () => {
  /** 비사업용 토지(§104①8호)는 별도 세율군 — 일반 토지(1호)와 군이 갈린다 */
  function runTwoGroups() {
    const nbl = {
      ...plainAsset("NBL", 300_000_000),
      isNonBusinessLand: true,
    } as unknown as TransferTaxItemInput;
    return calculateTransferTaxAggregate(
      {
        taxYear: 2021,
        annualBasicDeductionUsed: 2_500_000,
        properties: [plainAsset("A", 200_000_000), nbl],
      },
      rates,
    );
  }

  it("세율군이 둘로 갈린다", () => {
    expect(runTwoGroups().groupTaxes.length).toBeGreaterThan(1);
  });

  /**
   * 🔒 **세액 불변** — 각 군이 **파트 1개**라 승계가 `bucket.length === 1` 갈래를 탄다.
   *    그 갈래는 메타를 얻으려고 `calcTax`를 한 번 더 부르므로, 세액이 그 호출에 물들지
   *    않는지 **수치로** 고정한다(그 단언이 없으면 세액을 망가뜨려도 불변식 단언이 통과한다 —
   *    실제로 뮤테이션 「bucketTax = 999」가 구별력 0이었다).
   */
  it("🔒 각 군의 세액은 손대지 않는다", () => {
    const r = runTwoGroups();
    const byGroup = Object.fromEntries(r.groupTaxes.map((g) => [g.group, g]));
    // 일반 누진   200,000,000 × 38% − 19,940,000 =  56,060,000
    expect(byGroup.progressive.groupCalculatedTax).toBe(56_060_000);
    expect(byGroup.progressive.appliedRate).toBe(0.38);
    expect(byGroup.progressive.progressiveDeduction).toBe(19_940_000);
    // 비사업용토지 300,000,000 × 48%(38% + 10%p) − 19,940,000 = 124,060,000
    expect(byGroup.non_business_land.groupCalculatedTax).toBe(124_060_000);
    expect(byGroup.non_business_land.appliedRate).toBe(0.48);
    expect(byGroup.non_business_land.progressiveDeduction).toBe(19_940_000);
    expect(r.calculatedTax).toBe(180_120_000);
  });

  /**
   * 🔑 **불변식** — 그룹 메타는 둘 중 하나여야 한다:
   *   ① 자기 산출세액을 **재현한다**(닫힌 산식이 참) 또는
   *   ② `progressiveDeduction === 0`(표시 불가를 명시 — 소비부가 서술문으로 분기)
   * 「재현하지 못하는 0이 아닌 누진공제」는 **화면에 거짓 등식을 만든다**.
   */
  it("🔑 모든 그룹에서 (항등식 성립) 또는 (누진공제 0)", () => {
    for (const g of [...runTwoGroups().groupTaxes, ...runReported().groupTaxes]) {
      const holds =
        Math.floor(g.groupTaxBase * g.appliedRate) - g.progressiveDeduction ===
        g.groupCalculatedTax;
      expect(holds || g.progressiveDeduction === 0).toBe(true);
    }
  });
});

describe("A-5. 단일세율 호(단기보유)는 누진공제 0이 «사실»이다", () => {
  it("보유 1년 미만 단기 자산 그룹의 누진공제는 0", () => {
    const shortTerm = {
      ...plainAsset("ST", 200_000_000),
      acquisitionDate: new Date("2021-03-01"),
      transferDate: new Date("2021-09-01"), // 6개월 → 단기
    } as unknown as TransferTaxItemInput;
    const r = calculateTransferTaxAggregate(
      { taxYear: 2021, annualBasicDeductionUsed: 2_500_000, properties: [shortTerm] },
      rates,
    );
    const g = r.groupTaxes.find((x) => x.group === "short_term");
    expect(g).toBeDefined();
    expect(g!.progressiveDeduction).toBe(0);
  });
});

/**
 * 🔑 **두 가드가 서로를 가린다 — 뮤테이션 해석 주의**
 *
 * 승계는 두 조건이 함께 지킨다:
 *   ① `clauseGroups.size === 1` — 버킷이 하나일 때만 후보를 만든다(의미론적 게이트)
 *   ② 항등식 검산 — 그 후보가 그룹 세액을 재현할 때만 채택한다(표시 정직성 게이트)
 *
 * 실측: ①만 지우면 ②가 막고, ②만 지우면 ①이 막아 **각각의 뮤테이션은 구별력 0**이다.
 * **둘을 동시에** 지워야 아래 A-6가 빨개진다 — 부분 비사토에 거짓 누진공제가 실린다.
 * 「단독 뮤테이션이 통과했다」를 「그 가드가 불필요하다」로 읽으면 안 된다
 * (memory `feedback_mutation_masked_by_second_override`).
 */
describe("A-6. 한 그룹 안에서 «버킷이 갈리면» 승계하지 않는다", () => {
  /**
   * **부분 비사업용 토지** — 한 자산이 배율 초과분(§104①8호 파트)과 그 밖(1호 파트)으로
   * 갈려 **같은 그룹 안에 버킷이 둘**이 된다. 그때 그룹 산출세액은 **버킷별 합계**라
   * 닫힌 산식이 성립하지 않는다 ⇒ 종전 규약(누진공제 0)을 유지해야 한다.
   *
   * 🔑 이 fixture가 없으면 「버킷이 하나일 때만 승계한다」는 조건이 **한 번도 시험되지 않는다**.
   */
  function runPartialNbl() {
    const partial = {
      ...plainAsset("P", 400_000_000),
      isNonBusinessLand: true,
      nonBusinessLandAreaRatio: 0.5,
    } as unknown as TransferTaxItemInput;
    return calculateTransferTaxAggregate(
      { taxYear: 2021, annualBasicDeductionUsed: 2_500_000, properties: [partial] },
      rates,
    );
  }

  it("누진공제는 0으로 남는다 — 닫힌 산식이 성립하지 않는다", () => {
    const g = runPartialNbl().groupTaxes[0];
    expect(g.progressiveDeduction).toBe(0);
    // 400,000,000 × 48% − 0 = 192,000,000 ≠ 132,120,000 → 닫힌 산식은 거짓이다
    expect(Math.floor(g.groupTaxBase * g.appliedRate) - g.progressiveDeduction).not.toBe(
      g.groupCalculatedTax,
    );
  });

  it("🔒 세액은 손대지 않는다", () => {
    const g = runPartialNbl().groupTaxes[0];
    expect(g.groupTaxBase).toBe(400_000_000);
    expect(g.groupCalculatedTax).toBe(132_120_000);
  });
});

describe("A-7. 결선 — 제보 화면이 실제로 «닫힌 산식»을 인쇄한다", () => {
  /**
   * 엔진 → 어댑터(`aggregateToFilingResult`) → 상세명세서 빌더까지 **한 줄로** 확인한다.
   * 그룹 메타만 고쳐도 표시가 따라오지 않으면 사용자에게는 아무것도 바뀌지 않는다
   * (memory `feedback_fixed_layer_vs_consumed_layer`).
   */
  it("「과세표준 × 세율(40%) − 누진공제 25,940,000」이 찍힌다", () => {
    const r = runReported();
    const items = buildStatementItems(
      aggregateToFilingResult(r),
      undefined,
      undefined,
      { properties: r.properties, aggregated: r } as unknown as AggregateMeta,
      undefined,
    );
    const f = String(items.get("calculatedTax")?.formula ?? "");
    expect(f).toContain("과세표준 × 세율(40%)");
    expect(f).toContain("25,940,000");
    // 종전 화면의 거짓 서술이 사라진다
    expect(f).not.toContain("적용 호가 둘 이상");
  });
});
