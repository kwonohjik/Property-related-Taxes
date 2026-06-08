/**
 * estate-body-realestate-advanced — 평가 아코디언 + 담보·임대 상시 (2026-06-08 재편)
 *
 * Plan: docs/02-design/features/inheritance-real-estate-valuation-accordion.{plan,ui.design}.md
 *
 * 구조 변경(D-1·D-3·D-6 안 가):
 *   - 시가·감정가액·매매사례가액 = 아코디언 3 (각 ToggleCard, 값>0 자동 펼침)
 *   - 임대보증금·저당권·§14·§23의2 = CollateralLeaseFields 상시 노출 (평가방식과 직교)
 *
 * 검증:
 *   VAC-1  아코디언 헤더(switch) 3개 항상 노출 (시가·감정가액·매매사례가액)
 *   VAC-2  저당권은 상시 노출 (값 0이어도)
 *   VAC-3  임대보증금: apartment 상시 노출 / land 비노출
 *   VAC-4  marketValue 사전 세팅 → 시가 아코디언 자동 펼침 (input 값 노출)
 *   VAC-5  similarSalesValue 사전 세팅 → 매매사례 아코디언 자동 펼침
 *   CL-1   showCollateralDeductToggle=true → §14 토글 상시 노출
 *   CL-2   showCollateralDeductToggle=false → §14 토글 미노출
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

describe("[VAC·CL] EstateBodyRealEstate 평가 아코디언 + 담보·임대 상시", () => {
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

  it("VAC-2: 저당권은 상시 노출 (값 0이어도)", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem()}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(
      screen.queryByText(/저당권 등에 의해 담보된 채권액/),
    ).not.toBeNull();
  });

  it("VAC-3a: apartment → 임대보증금 상시 노출", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem()}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(
      screen.queryByText(/임대보증금 \(세입자 있는 경우\)/),
    ).not.toBeNull();
  });

  it("VAC-3b: land → 임대보증금 비노출", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem({ category: "real_estate_land" })}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(screen.queryByText(/임대보증금 \(세입자 있는 경우\)/)).toBeNull();
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
    // 자동 펼침 → CurrencyInput display "1,000,000"
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

  it("CL-1: showCollateralDeductToggle=true → §14 토글 상시 노출", () => {
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

  it("CL-2: showCollateralDeductToggle=false → §14 토글 미노출", () => {
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
});
