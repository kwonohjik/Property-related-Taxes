/**
 * DeductionLimitNoticeCard UI anchor (2026-05-22)
 *
 * 엔진 §24 종합한도 발동 시 결과 카드에 노출되는 안내 카드 검증.
 * - 발동 시: amber 카드 + 4행 내역 + 산식 안내
 * - 미발동 시: null (자동 숨김)
 *
 * 매칭 정책: breakdown 라벨 .includes("한도 초과") (memory feedback_korean_law_82_vs_81_2_drift 폴백 정책 동일)
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { DeductionLimitNoticeCard } from "@/components/calc/inheritance/DeductionLimitNoticeCard";
import type { CalculationStep } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(() => cleanup());

describe("DeductionLimitNoticeCard", () => {
  it("[U-1] 한도 발동 — 4행 내역 + 산식 안내 노출", () => {
    const breakdown: CalculationStep[] = [
      { label: "공제 소계", amount: 7_000_000_000 },
      {
        label: "§24 종합한도 (과세가액 8,775,000,000 - 사전증여 500,000,000)",
        amount: 5_965_000_000,
      },
      { label: "한도 초과 — 종합한도 적용", amount: 5_965_000_000 },
      { label: "최종 상속공제액", amount: 5_965_000_000 },
    ];

    render(<DeductionLimitNoticeCard breakdown={breakdown} />);

    // 카드 testid 노출
    expect(screen.getByTestId("deduction-limit-notice")).toBeDefined();
    // 헤더 텍스트
    expect(screen.getByText(/§24 종합한도 적용/)).toBeDefined();
    // 4행 내역 모두 노출 (원단위 표시)
    expect(screen.getByText(/7,000,000,000원/)).toBeDefined(); // 공제 신청 합계 (rawTotal)
    expect(screen.getAllByText(/5,965,000,000원/).length).toBeGreaterThanOrEqual(2); // ceiling + capped
    expect(screen.getByText(/1,035,000,000원/)).toBeDefined(); // 미적용 차감
    // 산식 안내 (법령 인용)
    expect(screen.getByText(/상속세및증여세법 §24/)).toBeDefined();
  });

  it("[U-2] 한도 미발동 — 카드 자동 숨김 (null 반환)", () => {
    const breakdown: CalculationStep[] = [
      { label: "공제 소계", amount: 3_000_000_000 },
      {
        label: "§24 종합한도 (과세가액 5,000,000,000 - 사전증여 0)",
        amount: 5_000_000_000,
      },
      // "한도 초과" 라인 없음 (wasCapped=false)
      { label: "최종 상속공제액", amount: 3_000_000_000 },
    ];

    const { container } = render(<DeductionLimitNoticeCard breakdown={breakdown} />);

    // 카드 미렌더
    expect(screen.queryByTestId("deduction-limit-notice")).toBeNull();
    // 컨테이너가 비어있음
    expect(container.firstChild).toBeNull();
  });

  it("[U-3] ceiling 라인 누락 시 fallback — limitLine.amount 사용", () => {
    // 엔진 라벨 변경으로 "§24 종합한도" 매칭 실패 시에도 안전
    const breakdown: CalculationStep[] = [
      { label: "공제 소계", amount: 6_000_000_000 },
      { label: "한도 초과 — 종합한도 적용", amount: 4_000_000_000 },
    ];

    render(<DeductionLimitNoticeCard breakdown={breakdown} />);

    expect(screen.getByTestId("deduction-limit-notice")).toBeDefined();
    expect(screen.getByText(/6,000,000,000원/)).toBeDefined(); // rawTotal
    expect(screen.getAllByText(/4,000,000,000원/).length).toBeGreaterThanOrEqual(2); // ceiling fallback + capped
    expect(screen.getByText(/2,000,000,000원/)).toBeDefined(); // 미적용 차감
  });
});
