/**
 * RtmsSimilarSalesModal — taxType 분기(transfer 확장 + 물건종류 라디오) RTL (Part B·C)
 *
 * Plan: docs/01-plan/features/rtms-similar-sales-expansion.plan.md §4·§5
 * 검증:
 *   - transfer: 물건종류 라디오(아파트·연립다세대·오피스텔) + "취득일" 라벨 +
 *               평가기간 "취득일 전후 3개월" + 신고일(§49④) 카드 숨김 + §176의2③1호 인용
 *   - inheritance: 신고일(§49④) 카드 표시 + 평가기준일 라벨
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { RtmsSimilarSalesModal } from "@/components/calc/inheritance/estate-card/variants/RtmsSimilarSalesModal";

afterEach(() => cleanup());

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  aptName: "기흥역센트럴푸르지오",
  sigunguCode: "41463",
  targetExclusiveAreaM2: 84.97,
  valuationDate: "2020-01-01",
  onSelect: vi.fn(),
};

describe("[RTMS-MODAL] taxType 분기 + 물건종류 라디오", () => {
  it("RM-1: transfer — 물건종류 라디오 3종 + 취득일 라벨 + 3개월 평가기간 + §176의2③1호", () => {
    render(<RtmsSimilarSalesModal {...baseProps} taxType="transfer" />);

    // 물건종류 라디오 (공동주택 계열)
    expect(screen.getByText("아파트")).toBeTruthy();
    expect(screen.getByText("연립·다세대")).toBeTruthy();
    expect(screen.getByText("오피스텔")).toBeTruthy();

    // 취득일 라벨 + 평가기간 + 법령 인용
    expect(screen.getByText("(취득일)")).toBeTruthy();
    expect(screen.getByText(/취득일 전후 3개월/)).toBeTruthy();
    expect(screen.getByText(/§176의2③1호/)).toBeTruthy();

    // 신고일(§49④) 카드는 transfer 에서 숨김
    expect(screen.queryByText(/신고일 \(선택 — §49④\)/)).toBeNull();
  });

  it("RM-2: inheritance — 신고일(§49④) 카드 표시 + 평가기준일 라벨", () => {
    render(<RtmsSimilarSalesModal {...baseProps} taxType="inheritance" />);

    expect(screen.getByText("(평가기준일)")).toBeTruthy();
    expect(screen.getByText(/신고일 \(선택 — §49④\)/)).toBeTruthy();
    // 물건종류 라디오는 전 세목 공통 노출
    expect(screen.getByText("연립·다세대")).toBeTruthy();
  });
});
