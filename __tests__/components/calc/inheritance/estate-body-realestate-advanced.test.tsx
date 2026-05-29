/**
 * estate-body-realestate-advanced — Issue 3 Pre-Do anchor
 *
 * Plan: docs/02-design/features/estate-card-input-ux-3fix.plan.md (v2)
 *
 * 검증:
 *   AC-10 빈 자산 카드 → 시가·감정가·임대보증금·저당권 input 비노출 (advanced OFF)
 *   AC-11 advanced 토글 ON → 4개 input 노출
 *   AC-12 시가 입력 후 advanced OFF 클릭 → store(item.marketValue) 보존 (비파괴)
 *   AC-13 marketValue 사전 세팅 → mount 시 자동 ON
 *   AC-15 mortgageAmount > 0 + showCollateralDeductToggle=true → §14 토글 advanced 안쪽
 *   AC-16 advanced OFF → §14 토글도 함께 숨김 (외곽 표시 0)
 *
 * 현행 코드 기준 RED 예상:
 *   - AC-10·11·13: advanced 토글 자체가 없음 → RED (4개 input 항상 노출)
 *   - AC-15·16: §14 토글이 EstateBodySection 외부 sibling으로 항상 표시 → RED
 *   - AC-12: 비파괴는 advanced 토글 OFF 시 input umount만 → store 변경 0
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

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

/** advanced 토글 안 4개 input 노출 여부를 라벨 텍스트로 확인 */
function advancedFieldsVisible(): {
  market: boolean;
  appraised: boolean;
  lease: boolean;
  mortgage: boolean;
} {
  return {
    market: screen.queryByText(/시가 \(매매·수용·경매가액\)/) !== null,
    appraised: screen.queryByText(/^감정평가액$/) !== null,
    lease: screen.queryByText(/임대보증금 \(세입자 있는 경우\)/) !== null,
    mortgage: screen.queryByText(/저당권 등에 의해 담보된 채권액/) !== null,
  };
}

describe("[UX3-AC10..16] EstateBodyRealEstate advanced 토글", () => {
  it("AC-10: 빈 자산 카드 → 시가·감정가·임대보증금·저당권 모두 비노출", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem()}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    const v = advancedFieldsVisible();
    expect(v.market).toBe(false);
    expect(v.appraised).toBe(false);
    expect(v.lease).toBe(false);
    expect(v.mortgage).toBe(false);
  });

  it("AC-11: advanced 토글 ON → 4개 input 노출", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem()}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    // advanced 토글 — title "시가·감정가·임대보증금·저당권 입력"
    const advancedToggle = screen.getByRole("switch", {
      name: /시가·감정가·임대보증금·저당권 입력/,
    });
    fireEvent.click(advancedToggle);
    const v = advancedFieldsVisible();
    expect(v.market).toBe(true);
    expect(v.appraised).toBe(true);
    expect(v.lease).toBe(true); // apartment이므로 노출
    expect(v.mortgage).toBe(true);
  });

  it("AC-13: marketValue 사전 세팅 → 자동 ON", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem({ marketValue: 1_000_000 })}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    const v = advancedFieldsVisible();
    expect(v.market).toBe(true);
    expect(v.appraised).toBe(true);
    expect(v.lease).toBe(true);
    expect(v.mortgage).toBe(true);
  });

  it("AC-13b: appraisedValue·leaseDeposit·mortgageAmount 중 하나만 있어도 자동 ON", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem({ mortgageAmount: 500_000 })}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    expect(advancedFieldsVisible().mortgage).toBe(true);
  });

  it("AC-14: real_estate_land → 임대보증금 advanced 펼침에서도 비노출", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem({ category: "real_estate_land" })}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={false}
        mode="inheritance"
      />,
    );
    // advanced ON
    fireEvent.click(
      screen.getByRole("switch", { name: /시가·감정가·임대보증금·저당권 입력/ }),
    );
    expect(advancedFieldsVisible().market).toBe(true);
    expect(advancedFieldsVisible().lease).toBe(false); // land 카테고리이므로 비노출
  });

  it("AC-15: mortgageAmount > 0 + showCollateralDeductToggle=true + advanced ON → §14 토글 노출", () => {
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem({ mortgageAmount: 500_000 })}
        onUpdate={vi.fn()}
        showCollateralDeductToggle={true}
        mode="inheritance"
      />,
    );
    // mortgageAmount > 0이므로 advanced 자동 ON 상태 — §14 토글이 advanced 안쪽에 있어야 함
    expect(
      screen.queryByText(/이 담보채무를 §14 부채로 자동 공제/),
    ).not.toBeNull();
  });

  it("AC-16: advanced OFF → §14 토글도 함께 숨김 (외곽 노출 0)", () => {
    // 빈 자산이지만 showCollateralDeductToggle=true로 강제 — 외곽에 §14 토글 노출되면 안 됨
    render(
      <EstateBodyRealEstate
        item={makeRealEstateItem()} // 모든 값 0 → advanced OFF
        onUpdate={vi.fn()}
        showCollateralDeductToggle={true}
        mode="inheritance"
      />,
    );
    expect(
      screen.queryByText(/이 담보채무를 §14 부채로 자동 공제/),
    ).toBeNull();
  });
});
