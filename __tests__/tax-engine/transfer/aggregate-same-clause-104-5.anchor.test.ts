/**
 * anchor: 다건 §104⑤2호 **단서** — 「동일 호 + 적용세율 둘 이상」은 **합산 후 호별 MAX** (P9 / D-11)
 *
 * 계획서: docs/02-design/features/transfer-104-5-proviso-mixed-use-rate-gaps.plan.md
 *   §D-11 · §1.2(정본은 단서를 절반만 구현) · §1.6(교재 사례1·2) · §4.7(설계) · §5 #20~#21
 *
 * [법령 — §104⑤2호 **단서**, MST 280405 · 시행 2026-07-01]
 *   "다만, 둘 이상의 자산에 대하여 제1항 각 호, 제4항 각 호 및 **제7항 각 호**에 따른 세율 중
 *    **동일한 호의 세율이 적용되고, 그 적용세율이 둘 이상인 경우** 해당 자산에 대해서는
 *    각 자산의 양도소득과세표준을 **합산한 것에 대하여** 제1항·제4항 또는 제7항의 각 해당
 *    호별 세율을 적용하여 산출한 세액 중에서 **큰 산출세액**의 합계액으로 한다."
 *
 * 실무 교재 사례2가 이를 명시적으로 경고한다:
 *   "B주택과 C주택 **별도로** 단기세율 및 3주택 중과세율을 비교하는 것이 아니라,
 *    3주택 중과세율 적용 시 B·C 과세표준을 **합산한 금액**에 대해 중과세율을 적용하여
 *    단기보유 세율을 적용한 산출세액과 비교한다."
 *
 * ── 단서의 요건은 **둘**이다 ────────────────────────────────────────────
 *   ⓐ 동일한 호의 세율이 적용되고   ⓑ 그 적용세율이 둘 이상인 경우
 * 정본은 ⓐ만 구현했다(`mixedTier` → 동일 호 합산). ⓑ가 D-11이다.
 *
 * ⚠️ **(a)호가 다른 경우와 반드시 구분**한다 — 1년 미만 50% + 1~2년 40%처럼 **호 자체가
 *   다르면** 단서가 아니라 **본문**(자산별 산출세액 합)이 맞다. ⑦1호(+20%p)와 ⑦3호(+30%p)
 *   혼재도 마찬가지이며, 2026-07-29 R7 감사가 고친 것이 바로 그 케이스다.
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const D = (s: string) => new Date(s);

function item(id: string, o: Partial<TransferTaxItemInput>): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    transferDate: D("2026-06-01"),
    isOneHousehold: false,
    ...o,
  };
}

/** 사업용 토지 — 11년 보유·차익 1억 (§104①1호 누진 그룹) */
const LAND_A = item("A", {
  propertyType: "land",
  acquisitionDate: D("2015-01-01"),
  acquisitionPrice: 0,
  transferPrice: 100_000_000,
  householdHousingCount: 3,
  isRegulatedArea: false,
  isNonBusinessLand: false,
});

/** 조정대상지역 3주택 중과 대상 주택 */
function house(id: string, gain: number, acq: string, houseCount = 3): TransferTaxItemInput {
  return item(id, {
    propertyType: "housing",
    acquisitionDate: D(acq),
    acquisitionPrice: 0,
    transferPrice: gain,
    householdHousingCount: houseCount,
    isRegulatedArea: true,
  });
}

function run(properties: TransferTaxItemInput[]) {
  const input: AggregateTransferInput = {
    taxYear: 2026,
    annualBasicDeductionUsed: 2_500_000, // 기본공제 소진 → 과세표준 = 양도소득금액
    properties,
  };
  return calculateTransferTaxAggregate(input, mockRates);
}

describe("P9 / D-11 — 동일 호·복수 세율은 합산 후 호별 MAX", () => {
  it("B-28: 교재 사례2 구조 — B·C가 ⑦3호 + ①2호 동시 해당, 자산별 승자가 갈린다", () => {
    // 2024-12-01 취득 → 2026-06-01 양도 = **1년 6개월**(§104①2호 구간) · 둘 다 조정 3주택(⑦3호).
    //
    // 개별로 보면 승자가 갈린다:
    //   B 1.5억: 단기 60% 90,000,000  >  중과 누진+30% 82,060,000  → 단기 승
    //   C 2.5억: 단기 60% 150,000,000 <  중과 누진+30% 150,060,000 → 중과 승
    //   ⇒ 종전 엔진은 여기서 `rate`가 갈려 **자산별 합** 240,060,000을 냈다.
    //
    // 단서대로 **합산 4억**에 호별 세율을 적용하면:
    //   §104①2호 60%        → 240,000,000
    //   §104⑦3호 누진+30%p  → 134,060,000 + 120,000,000 = 254,060,000  ← 큰 것
    //   ⇒ B·C 부분 254,060,000 (교재 사례2와 동일)
    //
    // A토지(11년 보유 → 장특 22% → 소득 78,000,000) 누진 12,960,000을 더해 267,020,000.
    const r = run([LAND_A, house("B", 150_000_000, "2024-12-01"), house("C", 250_000_000, "2024-12-01")]);
    expect(r.calculatedTax).toBe(267_020_000);

    // 종전 240,060,000 + 12,960,000 = 253,020,000 (14,000,000 과소)
    expect(r.calculatedTax).toBeGreaterThan(253_020_000);
  });
});

describe("P9 회귀 — (a)호가 다른 경우는 **본문**(자산별 합) 유지", () => {
  it("B-29: 교재 사례1 구조 — 2년 이상·동일 중과세율이면 종전대로 합산 1회", () => {
    // 보유 2년 이상이라 §104⑦ 후단(단기 비교)이 없다 ⇒ 승자가 갈릴 여지 자체가 없고,
    // 종전에도 `mixedTier`가 꺼져 합산 1회로 계산됐다. **불변**을 고정한다.
    const r = run([
      LAND_A,
      house("B", 300_000_000, "2015-01-01"),
      house("C", 500_000_000, "2015-01-01"),
    ]);
    expect(r.calculatedTax).toBe(553_020_000);
  });

  it("B-29b: **단기 구간이 다르면**(1년 미만 + 1~2년) 호가 달라 자산별 합 유지", () => {
    // §104①3호(1년 미만 70%)와 §104①2호(1~2년 60%)는 **다른 호**다 → 단서 미해당.
    // 합산 1회로 묶으면 대표세율 하나가 전체에 적용돼 오답이 된다(R7 감사가 고친 유형).
    const r = run([
      house("B", 150_000_000, "2025-12-01"), // 6개월 → 3호
      house("C", 250_000_000, "2024-12-01"), // 1년 6개월 → 2호
    ]);
    expect(r.calculatedTax).toBe(255_060_000);
  });

  it("B-29c: **⑦1호(2주택) + ⑦3호(3주택)** 혼재는 자산별 합 유지 (R7 감사 회귀)", () => {
    // 가산율이 20%p / 30%p로 갈리는 것은 **호가 다르기** 때문이다. 합산 1회로 되돌리면
    // 그룹 대표세율이 전체에 적용돼 입력 순서 의존이 되살아난다(2026-07-29 정정).
    const r = run([
      house("B", 300_000_000, "2015-01-01", 2), // ⑦1호 +20%p
      house("C", 500_000_000, "2015-01-01", 3), // ⑦3호 +30%p
    ]);
    expect(r.calculatedTax).toBe(478_120_000);
  });
});
