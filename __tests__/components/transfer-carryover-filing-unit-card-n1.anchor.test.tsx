/**
 * @vitest-environment jsdom
 *
 * anchor: 이월과세 비교 카드는 **판정에 실제로 쓰인 단위**를 표시한다 (N-1)
 *
 * ## 왜 필요한가 — 화면이 자기모순이 될 수 있었다
 *
 * §97의2②3호 비교는 「양도소득 **결정세액**」(§92③2호)으로 하는데, 그것은 신고단위 개념이다.
 * 다건 신고에서는 그 자산만 떼어낸 A·B 금액과 판정이 **갈릴 수 있다** — A/B 전환이 세율군을
 * 바꿔 다른 자산과의 §104⑤ 누진 합산이 함께 움직이기 때문이다(엔진 anchor
 * `aggregate-carryover-filing-unit-n1.anchor.test.ts` 실측 7/300).
 *
 * 그때 카드가 종전처럼 「✓ 채택 (**더 큰 세액**)」 배지와 「신고세액 = **max(A, B)**」를 그대로
 * 띄우면, **작은 금액에 「더 큰 세액」 배지가 붙는** 화면이 나온다. 사용자는 이것을 계산 오류로
 * 읽는다(실제로는 정상이다).
 *
 * ⇒ `filingUnitComparison`이 실려 오면 **판정 근거를 신고 전체 두 금액으로** 보여주고,
 *   자산별 문구(「더 큰 세액」·`max(A,B)`)는 **내린다**.
 *
 * ## 케이스
 * - C-1 단건(비교값 없음) — 종전 문구 유지(`max(A, B)` · 「더 큰 세액」)
 * - C-2 다건(비교값 있음) — 신고 전체 두 금액 노출 + 자산별 문구 제거
 * - C-3 **A가 작은데 A 채택** — 이 조합에서 카드가 모순 문구를 내지 않는다
 * - C-4 비교과세 배제 문구에 신고단위 기준임이 드러난다
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CarryoverComparisonCard } from "@/components/calc/results/transfer/CarryoverComparisonCard";
import type { CarryoverTaxationDetail } from "@/lib/tax-engine/types/transfer-carryover.types";

afterEach(cleanup);

/** 자산별 문구 — 다건에서는 사라져야 한다. */
const ASSET_SCOPE_MARK = /신고세액 = max\(A, B\)/;
const BIGGER_TAX_BADGE = /채택 \(더 큰 세액\)/;
/** 신고단위 판정 근거 블록의 판별 문구. */
const FILING_UNIT_MARK = /신고 전체 결정세액 비교/;

function makeDetail(over: Partial<CarryoverTaxationDetail> = {}): CarryoverTaxationDetail {
  return {
    isEligible: true,
    applicablePeriodYears: 10,
    scenarioA: {
      acquisitionPrice: 100_000_000,
      holdingPeriodYears: 16,
      giftTaxAddedToExpense: 0,
      giftTaxLimitApplied: false,
      giftTaxLimitCap: 0,
      donorCapexAddedToExpense: 0,
      donorCapexGuardApplied: false,
      effectiveCapex: 0,
      transferGain: 900_000_000,
      determinedTax: 228_660_000,
    },
    scenarioB: {
      acquisitionPrice: 500_000_000,
      holdingPeriodYears: 0,
      transferGain: 500_000_000,
      determinedTax: 250_000_000,
    },
    adoptedScenario: "A",
    comparisonExclusion: false,
    ...over,
  };
}

describe("N-1 · 이월과세 비교 카드 표시 단위", () => {
  it("C-1: 단건 — 종전 문구(max(A,B) · 「더 큰 세액」)를 그대로 쓴다", () => {
    // 단건에서는 A·B 두 금액이 곧 신고 전체 결정세액이라 종전 표기가 옳다.
    render(<CarryoverComparisonCard detail={makeDetail({ adoptedScenario: "B" })} />);
    expect(screen.getByText(ASSET_SCOPE_MARK)).toBeTruthy();
    expect(screen.getByText(BIGGER_TAX_BADGE)).toBeTruthy();
    expect(screen.queryByText(FILING_UNIT_MARK)).toBeNull();
  });

  it("C-2: 다건 — 신고 전체 두 금액을 판정 근거로 보여준다", () => {
    render(
      <CarryoverComparisonCard
        detail={makeDetail({
          filingUnitComparison: {
            determinedTaxWithCarryover: 378_810_000,
            determinedTaxWithout: 366_810_000,
          },
        })}
      />,
    );
    expect(screen.getByText(FILING_UNIT_MARK)).toBeTruthy();
    expect(screen.getByText("378,810,000")).toBeTruthy();
    expect(screen.getByText("366,810,000")).toBeTruthy();
  });

  it("C-3: 🔴 A가 작은데 A를 채택한 조합에서 모순 문구를 내지 않는다", () => {
    const detail = makeDetail({
      adoptedScenario: "A",
      filingUnitComparison: {
        determinedTaxWithCarryover: 378_810_000,
        determinedTaxWithout: 366_810_000,
      },
    });
    // 전제 확인 — 자산별로는 A(228,660,000) < B(250,000,000)다.
    expect(detail.scenarioA.determinedTax).toBeLessThan(detail.scenarioB.determinedTax);

    render(<CarryoverComparisonCard detail={detail} />);
    expect(screen.queryByText(BIGGER_TAX_BADGE)).toBeNull(); // 「더 큰 세액」 배지 금지
    expect(screen.queryByText(ASSET_SCOPE_MARK)).toBeNull(); // max(A,B) 문구 금지
    expect(screen.getByText(FILING_UNIT_MARK)).toBeTruthy();
  });

  it("C-4: 비교과세 배제 문구는 신고단위 기준임을 밝힌다", () => {
    render(
      <CarryoverComparisonCard
        detail={makeDetail({
          adoptedScenario: "B",
          comparisonExclusion: true,
          exclusionReason: "tax_comparison",
          filingUnitComparison: {
            determinedTaxWithCarryover: 90_000_000,
            determinedTaxWithout: 100_000_000,
          },
        })}
      />,
    );
    expect(screen.getByText(/신고 전체 결정세액 기준/)).toBeTruthy();
  });
});
