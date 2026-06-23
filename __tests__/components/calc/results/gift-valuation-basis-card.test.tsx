/**
 * GiftValuationBasisCard — 증여재산 평가 산출근거 카드 렌더 회귀.
 *
 * 계획서: docs/00-pm/gift-valuation-basis-display.plan.md
 * breakdown 은 엔진 evaluateEstateItem 실측값을 그대로 사용 (dual-truth 0).
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { GiftValuationBasisCard } from "@/components/calc/results/GiftValuationBasisCard";
import { evaluateEstateItem } from "@/lib/tax-engine/property-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(() => cleanup());

/** 이미지 사례 — 상업용 건물(임대+공실) §61⑤ */
const buildingItem = {
  id: "p1",
  category: "real_estate_building",
  name: "빌딩",
  standardPrice: 336_240_000,
  appurtenantLandStandardPrice: 330_000_000,
  monthlyRent: 24_000_000,
  leaseDeposit: 500_000_000,
  totalBuildingArea: 720,
  vacantBuildingArea: 180,
  vacantBuildingStandardPrice: 84_060_000,
} as unknown as EstateItem;

describe("GiftValuationBasisCard", () => {
  it("상업용 건물 — 자산명·최종 평가액·breakdown 단계 표시", () => {
    const vr = evaluateEstateItem(buildingItem);
    render(
      <GiftValuationBasisCard
        valuationResults={[vr]}
        estateItems={[buildingItem]}
      />,
    );

    // 자산명 (내부 id 미노출)
    expect(screen.getByText("빌딩")).toBeInTheDocument();
    expect(screen.queryByText(/p1/)).not.toBeInTheDocument();

    // 최종 평가액 + breakdown 단계 (접힘이어도 print용으로 DOM 존재)
    expect(screen.getAllByText("3,066,560,000").length).toBeGreaterThan(0);
    expect(
      screen.getByText("§61⑤ 임대료환산가액 (임대분)"),
    ).toBeInTheDocument();
    expect(screen.getByText("미임대분 토지 기준시가 (면적안분)")).toBeInTheDocument();
    expect(screen.getByText("2,900,000,000")).toBeInTheDocument();
    expect(screen.getByText("82,500,000")).toBeInTheDocument();
  });

  it("펼침 토글 클릭 — 자산행 헤더 버튼 aria-expanded 전환", () => {
    const vr = evaluateEstateItem(buildingItem);
    render(
      <GiftValuationBasisCard
        valuationResults={[vr]}
        estateItems={[buildingItem]}
      />,
    );
    // 자산명(좌)+평가액·▼(우) 전체폭 헤더 버튼 — 증여 명세서·건물 계산서와 동일 서식
    const toggle = screen.getByRole("button", { name: /빌딩/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("자산명 미입력 — 재산종류 라벨로 fallback (id 미노출)", () => {
    const noName = { ...buildingItem, id: "x9", name: "" } as EstateItem;
    const vr = evaluateEstateItem(noName);
    render(
      <GiftValuationBasisCard valuationResults={[vr]} estateItems={[noName]} />,
    );
    // 빈 이름 → 카테고리 라벨(건물 류) 노출, id "x9"는 미노출
    expect(screen.queryByText(/x9/)).not.toBeInTheDocument();
  });

  it("valuationResults 비어있으면 렌더하지 않음", () => {
    const { container } = render(
      <GiftValuationBasisCard valuationResults={[]} estateItems={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
