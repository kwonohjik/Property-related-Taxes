/**
 * estate-body-realestate-advanced — 평가 아코디언 + 보충적 평가·담보·임대 토글 게이트
 *
 * Plan: docs/01-plan/estate-valuation-collateral-toggle.plan.md
 *
 * 구조(2026-06-09 토글 전환):
 *   - 시가·감정가액·매매사례가액 = 아코디언 3 (각 ToggleCard, 값>0 자동 펼침)
 *   - 보충적 평가 = ToggleCard(emerald). standardPrice>0 이면 초기 ON(비파괴), 아니면 OFF.
 *   - 담보·임대(임대보증금·저당권·신용보증·§14·§23의2) = ToggleCard(amber).
 *     leaseDeposit·monthlyRent·mortgageAmount·creditGuaranteeAmount·deductSecuredClaimAsDebt·
 *     isCohabitantHouse 중 하나라도 truthy면 초기 ON(비파괴), 아니면 OFF.
 *
 * 검증:
 *   VAC-1   아코디언 헤더(switch) 3개 항상 노출 (시가·감정가액·매매사례가액)
 *   VAC-4·5 marketValue·similarSalesValue 사전 세팅 → 해당 아코디언 자동 펼침
 *   A-1·2·3 보충적 평가 토글 게이트 (OFF 미렌더 / 값>0 초기 ON / title 항상 노출)
 *   B-1~4   담보·임대 토글 게이트 (OFF 접힘 / 값·설정 주입 시 초기 ON)
 *   VAC-2/3 저당권·임대보증금: 담보·임대 ON 시 노출 (apartment / land 분기)
 *   CL-1~5  §14·월 임대료·신용보증 (담보·임대 ON 전제)
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { EstateBodyRealEstate } from "@/components/calc/inheritance/estate-card/variants/EstateBodyRealEstate";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(() => cleanup());

function makeRealEstateItem(over: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "re1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    ...over,
  } as EstateItem;
}

describe("[VAC·CL] EstateBodyRealEstate 평가 아코디언 + 보충적 평가·담보·임대 토글", () => {
  it("VAC-1: 시가·감정가액·매매사례가액 아코디언 헤더(switch) 3개 항상 노출", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem()}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(
      screen.getByRole("switch", { name: /시가 \(매매·수용·경매가액\)/ }),
    ).toBeTruthy();
    expect(screen.getByRole("switch", { name: /감정평가액/ })).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: /매매사례가액 \(유사매매사례\)/ }),
    ).toBeTruthy();
  });

  it("VAC-4: marketValue 사전 세팅 → 시가 아코디언 자동 펼침 (input 값 노출)", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem({ marketValue: 1_000_000 })}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(screen.getAllByDisplayValue("1,000,000").length).toBeGreaterThan(0);
  });

  it("VAC-5: similarSalesValue 사전 세팅 → 매매사례 아코디언 자동 펼침", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem({ similarSalesValue: 2_000_000 })}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(screen.getAllByDisplayValue("2,000,000").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("switch", { name: /매매사례가액 \(유사매매사례\)/ }),
    ).toBeTruthy();
  });

  // ── 보충적 평가 토글 게이트 ──────────────────────────────────────
  it("A-1: standardPrice 미입력 → 보충적 평가 토글 OFF, 입력 children 미렌더", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem()}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    // children(StandardPriceInput) 미렌더 — 공시가격 자동 조회 안내 부재
    expect(screen.queryByText(/공시가격 자동 조회는 상단/)).toBeNull();
  });

  it("A-2: standardPrice > 0 → 보충적 평가 초기 ON, 입력 children 렌더", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem({ standardPrice: 300_000_000 })}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(screen.queryByText(/공시가격 자동 조회는 상단/)).not.toBeNull();
  });

  it("A-3: 보충적 평가 토글 OFF여도 title 라벨(switch)은 항상 노출", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem()}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(
      screen.getByRole("switch", {
        name: /보충적 평가방법 \(주택: 공동·개별주택가격\)/,
      }),
    ).toBeTruthy();
  });

  // ── 담보·임대 토글 게이트 ────────────────────────────────────────
  it("B-1: 담보·임대 값 0 → 토글 OFF(접힘), 저당권 input 미렌더 / 토글 switch는 노출", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem()}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(screen.queryByText(/저당권 등에 의해 담보된 채권액/)).toBeNull();
    expect(
      screen.getByRole("switch", {
        name: /담보·임대 \(§66 평가 하한 · §14 채무공제\)/,
      }),
    ).toBeTruthy();
  });

  it("B-2: mortgageAmount > 0 → 담보·임대 초기 ON, 저당권 input 렌더", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem({ mortgageAmount: 500_000 })}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(
      screen.queryByText(/저당권 등에 의해 담보된 채권액/),
    ).not.toBeNull();
  });

  it("B-3: isCohabitantHouse=true → 담보·임대 초기 ON, §23의2 동거주택 토글 노출", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem({ isCohabitantHouse: true })}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        hasCohabitantChild
        mode="inheritance"
      />,
    );
    expect(screen.getByTestId("cohabit-house-toggle-re1")).toBeTruthy();
  });

  it("B-4: deductSecuredClaimAsDebt=true → 담보·임대 초기 ON, §14 토글 노출", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem({ deductSecuredClaimAsDebt: true })}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={true}
        mode="inheritance"
      />,
    );
    expect(
      screen.queryByText(/이 담보채무를 §14 부채로 자동 공제/),
    ).not.toBeNull();
  });

  // ── 담보·임대 ON 전제 분기 (값 주입으로 카드 펼침) ──────────────────
  it("VAC-2: 담보·임대 ON → apartment 임대보증금 노출", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem({ mortgageAmount: 500_000 })}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(
      screen.queryByText(/임대보증금 \(세입자 있는 경우\)/),
    ).not.toBeNull();
  });

  it("VAC-3b: 담보·임대 ON + land → 임대보증금 비노출 (D-UI1)", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem({
          category: "real_estate_land",
          mortgageAmount: 500_000,
        })}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(screen.queryByText(/임대보증금 \(세입자 있는 경우\)/)).toBeNull();
  });

  it("CL-1: 담보·임대 ON + showCollateralDeductToggle=true → §14 토글 노출", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem({ mortgageAmount: 500_000 })}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={true}
        mode="inheritance"
      />,
    );
    expect(
      screen.queryByText(/이 담보채무를 §14 부채로 자동 공제/),
    ).not.toBeNull();
  });

  it("CL-2: 담보·임대 ON + showCollateralDeductToggle=false → §14 토글 미노출", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem({ mortgageAmount: 500_000 })}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(
      screen.queryByText(/이 담보채무를 §14 부채로 자동 공제/),
    ).toBeNull();
  });

  it("CL-3: 담보·임대 ON + apartment → 월 임대료 칸 노출 (§61⑤)", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem({ mortgageAmount: 500_000 })}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(screen.queryByText(/월 임대료/)).not.toBeNull();
  });

  it("CL-4: 담보·임대 ON + land → 월 임대료 칸 비노출 (주택 한정 D-UI1)", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem({
          category: "real_estate_land",
          mortgageAmount: 500_000,
        })}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(screen.queryByText(/월 임대료/)).toBeNull();
  });

  it("CL-5: 담보·임대 ON + land → 신용보증기관 보증액 칸 노출 (§63②)", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem({
          category: "real_estate_land",
          mortgageAmount: 500_000,
        })}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(screen.queryByText(/신용보증기관 보증액/)).not.toBeNull();
  });
});
