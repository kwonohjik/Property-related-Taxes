/**
 * CorporateNonBusinessAssetsSection UI anchor (UI-C)
 *
 * 법령: 시행령 §15⑤2호 + §16⑤2호
 * 계획서: docs/00-pm/inheritance-farming-ui-integration.plan.md §2-4
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { CorporateNonBusinessAssetsSection } from "@/components/calc/inheritance/CorporateNonBusinessAssetsSection";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(() => cleanup());

function makeItem(over: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "s1",
    category: "unlisted_stock",
    name: "테스트 법인 주식",
    marketValue: 1_000_000_000,
    ...over,
  };
}

describe("[FNB-UI] CorporateNonBusinessAssetsSection — 통합 anchor", () => {
  it("FNB-UI-1: corporate_stock 미선택 → 컴포넌트 미렌더", () => {
    const { container } = render(
      <CorporateNonBusinessAssetsSection
        item={makeItem({ farmingCategory: undefined, familyBusinessCategory: undefined })}
        onUpdate={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("FNB-UI-2a: farmingCategory='corporate_stock' → 5필드 + totalAssets 노출", () => {
    render(
      <CorporateNonBusinessAssetsSection
        item={makeItem({ farmingCategory: "corporate_stock" })}
        onUpdate={() => {}}
      />,
    );
    // 헤더 노출
    expect(
      screen.queryByText(/법인 사업무관자산 차감/),
    ).not.toBeNull();
    // 5필드 라벨 노출 (multiple matches 가능 — queryAllByText)
    expect(screen.queryAllByText(/가\. 비사업용토지/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/나\. 임대부동산/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/다\. 임직원 외 대여금/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/라\. 과다보유현금/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/마\. 영업무관 금융상품/).length).toBeGreaterThan(0);
    // totalAssets 입력 라벨
    expect(screen.queryByText(/법인 총자산 \(분모\)/)).not.toBeNull();
  });

  it("FNB-UI-2b: familyBusinessCategory='corporate_stock' → 동일 컴포넌트 노출", () => {
    render(
      <CorporateNonBusinessAssetsSection
        item={makeItem({ familyBusinessCategory: "corporate_stock" })}
        onUpdate={() => {}}
      />,
    );
    expect(
      screen.queryByText(/법인 사업무관자산 차감/),
    ).not.toBeNull();
  });

  it("FNB-UI-3: totalAssets + nonBusinessAssets 입력 → 차감 미리보기 카드 노출", () => {
    render(
      <CorporateNonBusinessAssetsSection
        item={makeItem({
          farmingCategory: "corporate_stock",
          corporateTotalAssets: 2_000_000_000,
          corporateNonBusinessAssets: { nonBusinessLand: 1_000_000_000 },
        })}
        onUpdate={() => {}}
      />,
    );
    // 미리보기 카드 노출
    expect(screen.queryByText(/차감 미리보기/)).not.toBeNull();
    // 사업자산 비율 50%
    expect(screen.queryByText(/사업자산 비율 50\.00%/)).not.toBeNull();
  });

  it("FNB-UI-4: totalAssets 미입력 → 미리보기 미노출 (legacy)", () => {
    render(
      <CorporateNonBusinessAssetsSection
        item={makeItem({
          farmingCategory: "corporate_stock",
          // corporateTotalAssets 미입력
          corporateNonBusinessAssets: { nonBusinessLand: 500_000_000 },
        })}
        onUpdate={() => {}}
      />,
    );
    expect(screen.queryByText(/차감 미리보기/)).toBeNull();
  });
});
