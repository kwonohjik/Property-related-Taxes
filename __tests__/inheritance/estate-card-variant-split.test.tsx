/**
 * PR-D variant 본체 분리 — pickBodyVariant + variant 렌더 anchor
 *
 * Plan estate-card-followup-phase2 §FU-1·Design §4.2
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  pickBodyVariant,
  EstateBodySimple,
  EstateBodyRealEstate,
  EstateBodyDeposit,
  EstateBodyFinancial,
} from "@/components/calc/inheritance/estate-card/variants";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { SupportedCategory } from "@/components/calc/inheritance/estate-card/variants/types";

afterEach(() => cleanup());

function makeItem(category: SupportedCategory): EstateItem {
  return {
    id: `t-${category}`,
    category,
    name: "테스트",
  };
}

// ============================================================
// pickBodyVariant 매핑 매트릭스 (7 카테고리)
// ============================================================

describe("pickBodyVariant — 7 SupportedCategory 매핑", () => {
  it("real_estate_land → EstateBodyRealEstate", () => {
    expect(pickBodyVariant("real_estate_land")).toBe(EstateBodyRealEstate);
  });

  it("real_estate_building → EstateBodyRealEstate", () => {
    expect(pickBodyVariant("real_estate_building")).toBe(EstateBodyRealEstate);
  });

  it("real_estate_apartment → EstateBodyRealEstate", () => {
    expect(pickBodyVariant("real_estate_apartment")).toBe(EstateBodyRealEstate);
  });

  it("deposit → EstateBodyDeposit", () => {
    expect(pickBodyVariant("deposit")).toBe(EstateBodyDeposit);
  });

  it("cash → EstateBodySimple", () => {
    expect(pickBodyVariant("cash")).toBe(EstateBodySimple);
  });

  it("financial → EstateBodyFinancial (§63④ 예금 평가)", () => {
    expect(pickBodyVariant("financial")).toBe(EstateBodyFinancial);
  });

  it("other → EstateBodySimple", () => {
    expect(pickBodyVariant("other")).toBe(EstateBodySimple);
  });
});

// ============================================================
// variant 렌더 + testid + 본체 필드 노출 매트릭스
// ============================================================

describe("EstateBodySimple — cash/other 본체 (financial은 EstateBodyFinancial로 이동)", () => {
  it("cash → 자산명 + 현금 금액, 감정가 미노출", () => {
    render(
      <EstateBodySimple
        item={makeItem("cash")}
        onUpdate={() => {}}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(screen.getByTestId("estate-body-variant-simple-t-cash")).toBeInTheDocument();
    expect(screen.getByText("자산 명칭")).toBeInTheDocument();
    expect(screen.getByText("현금 금액")).toBeInTheDocument();
    // 감정평가액 미노출
    expect(screen.queryByText("감정평가액")).toBeNull();
  });

  it("financial → EstateBodyFinancial 렌더 (§63④ 예금·저금·적금 평가 섹션)", () => {
    // financial은 EstateBodySimple이 아닌 EstateBodyFinancial로 라우팅됨
    render(
      <EstateBodyFinancial
        item={makeItem("financial")}
        onUpdate={() => {}}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(screen.getByTestId("estate-body-variant-financial-t-financial")).toBeInTheDocument();
    // §63④ 잔액평가 기본 — "예금·저금·적금 평가" 섹션 타이틀 및 잔액 필드
    expect(screen.getByText("예금·저금·적금 평가")).toBeInTheDocument();
    // 감정평가액 미노출 (예금 카테고리에는 없음)
    expect(screen.queryByText("감정평가액")).toBeNull();
  });

  it("other → 시가 + 감정평가액 input 노출", () => {
    render(
      <EstateBodySimple
        item={makeItem("other")}
        onUpdate={() => {}}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(screen.getByText("시가 (매매·수용·경매가액)")).toBeInTheDocument();
    expect(screen.getByText("감정평가액")).toBeInTheDocument();
  });
});

describe("EstateBodyDeposit — 전세보증금", () => {
  it("자산명 + 임대보증금 + §22 미적용 hint", () => {
    render(
      <EstateBodyDeposit
        item={makeItem("deposit")}
        onUpdate={() => {}}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(
      screen.getByTestId("estate-body-variant-deposit-t-deposit"),
    ).toBeInTheDocument();
    expect(screen.getByText("자산 명칭")).toBeInTheDocument();
    expect(screen.getByText("임대보증금")).toBeInTheDocument();
    expect(screen.getByText(/전세보증금/)).toBeInTheDocument();
  });
});

describe("EstateBodyRealEstate — 부동산 3종", () => {
  it("real_estate_land → AddressSearch + 임대보증금 input 미노출 [UV2-1]", () => {
    render(
      <EstateBodyRealEstate
        item={makeItem("real_estate_land")}
        onUpdate={() => {}}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(
      screen.getByTestId("estate-body-variant-realestate-t-real_estate_land"),
    ).toBeInTheDocument();
    // 토지는 임대보증금 input 미노출 — "임대보증금 (세입자 있는 경우)" 라벨 부재
    expect(screen.queryByText("임대보증금 (세입자 있는 경우)")).toBeNull();
  });

  it("real_estate_apartment → 임대보증금 input 노출 (advanced ON 또는 leaseDeposit 사전세팅) [UX3-Issue3 정정]", () => {
    // 변경(2026-05-29 UX3): 시가·감정가·임대보증금·저당권은 advanced 토글 children으로 이동.
    // 자동 ON 조건: marketValue/appraisedValue/leaseDeposit/mortgageAmount 중 하나라도 > 0.
    // 사전 leaseDeposit 세팅으로 자동 ON 검증.
    render(
      <EstateBodyRealEstate
        item={{
          ...makeItem("real_estate_apartment"),
          leaseDeposit: 100_000_000,
        }}
        onUpdate={() => {}}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(screen.getByText("임대보증금 (세입자 있는 경우)")).toBeInTheDocument();
  });

  it("fishing 자산 → AddressSearch 라벨 '선적지·어장 연안 검색'", () => {
    const item: EstateItem = {
      ...makeItem("real_estate_land"),
      farmingCategory: "fishing_vessel",
    };
    render(
      <EstateBodyRealEstate
        item={item}
        onUpdate={() => {}}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(screen.getByText(/선적지·어장 연안 검색/)).toBeInTheDocument();
  });
});
