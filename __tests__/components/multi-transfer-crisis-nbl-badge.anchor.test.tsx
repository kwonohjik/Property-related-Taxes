/**
 * anchor — 다건 결과 세율군 배지: 부칙 §9270호 §14① 중과배제 보조 표기
 *
 * ## 왜 필요한가 (PR#1020의 누락 보완, 2026-08-04)
 *
 * PR#1020(`ff8d8232`)이 `classifyRateGroup`에 `!result.nblSurchargeExcluded`를 추가해,
 * 위기취득(2009.3.16~2012.12.31) 비사업용 토지의 `rateGroup`을 `non_business_land` →
 * **`progressive`** 로 바꿨다. 세율군으로는 정확하다 — 중과세율이 배제되면 해당 호 자체가
 * §104①1호이기 때문이다(`legal-codes/surcharge-transition.ts:41` ·
 * 기획재정부 재산세제과-1422 · 서울행정법원 2024구단72950).
 *
 * 그러나 **결과 화면 배지는 그 변경을 따라가지 않았다**. 배지가 「일반 누진」으로만 뜨면
 * 사용자는 "비사업용 판정이 안 됐다"로 읽는다 — 실제로는 자산이 여전히 비사업용 토지이고
 * 장특공제도 표1이 유지된다. 엔진 판정과 화면 표시가 어긋나는 전형적 드리프트다
 * (`feedback_engine_result_display_drift` ★★★).
 *
 * ⇒ `nblSurchargeExcluded` 보조 배지로 배제 사유를 함께 노출한다.
 *
 * ## 고정하는 계약
 *  1. 위기취득 배제 건: 세율군 배지 「일반 누진」 + 보조 배지 「부칙 §14① 중과배제」
 *  2. 일반 비사업용 토지: 「비사업용 토지」 배지만, 보조 배지 없음
 *  3. 보조 배지는 `nblSurchargeExcluded`에만 반응한다(비과세 배지와 독립)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PropertyBreakdownAccordion } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";

// RTL cleanup은 프로젝트 규약상 수동 등록 (memory feedback_rtl_manual_cleanup_required)
afterEach(() => cleanup());

/** 최소 fixture — 배지 판정에 필요한 필드만 채우고 나머지는 0으로 둔다. */
function makeBreakdown(over: Partial<PerPropertyBreakdown> = {}): PerPropertyBreakdown {
  return {
    propertyId: "p1",
    propertyLabel: "비사업용 토지 A",
    rateGroup: "progressive",
    transferPrice: 600_000_000,
    acquisitionPrice: 200_000_000,
    necessaryExpense: 0,
    capitalExpenditureForDisplay: 0,
    transferGain: 400_000_000,
    longTermHoldingDeduction: 0,
    income: 400_000_000,
    lossOffsetFromSameGroup: 0,
    lossOffsetFromOtherGroup: 0,
    incomeAfterOffset: 400_000_000,
    incomeDeductionReducible: 0,
    allocatedBasicDeduction: 0,
    taxBaseShare: 280_000_000,
    appliedRate: 0.38,
    progressiveDeduction: 0,
    determinedTax: 0,
    steps: [],
    isExempt: false,
    ...over,
  } as PerPropertyBreakdown;
}

describe("다건 결과 배지 — 부칙 §14① 중과배제 (PR#1020 표시 보완)", () => {
  it("위기취득 배제 건: 「일반 누진」 + 「부칙 §14① 중과배제」가 함께 뜬다", () => {
    render(
      <PropertyBreakdownAccordion
        breakdown={makeBreakdown({ rateGroup: "progressive", nblSurchargeExcluded: true })}
      />,
    );
    expect(screen.getByText("일반 누진")).toBeInTheDocument();
    expect(screen.getByText("부칙 §14① 중과배제")).toBeInTheDocument();
  });

  it("일반 비사업용 토지: 「비사업용 토지」만, 보조 배지 없음", () => {
    render(
      <PropertyBreakdownAccordion
        breakdown={makeBreakdown({ rateGroup: "non_business_land" })}
      />,
    );
    expect(screen.getByText("비사업용 토지")).toBeInTheDocument();
    expect(screen.queryByText("부칙 §14① 중과배제")).not.toBeInTheDocument();
  });

  it("배제 플래그가 없으면 progressive여도 보조 배지가 없다", () => {
    render(
      <PropertyBreakdownAccordion breakdown={makeBreakdown({ rateGroup: "progressive" })} />,
    );
    expect(screen.getByText("일반 누진")).toBeInTheDocument();
    expect(screen.queryByText("부칙 §14① 중과배제")).not.toBeInTheDocument();
  });

  it("보조 배지는 비과세 배지와 독립이다", () => {
    render(
      <PropertyBreakdownAccordion
        breakdown={makeBreakdown({ nblSurchargeExcluded: true, isExempt: true })}
      />,
    );
    expect(screen.getByText("부칙 §14① 중과배제")).toBeInTheDocument();
    expect(screen.getByText("비과세")).toBeInTheDocument();
  });
});
