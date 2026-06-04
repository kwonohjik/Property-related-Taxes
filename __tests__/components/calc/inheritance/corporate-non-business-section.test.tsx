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

  // ── PR-3-b: 과다현금 자동산정 + 제외 단서 시기 가드 ──

  it("FNB-UI-5: 자동산정 토글 ON(cashByYearEnd=[]) → 보유현금·5년 현금 입력 노출", () => {
    render(
      <CorporateNonBusinessAssetsSection
        item={makeItem({
          familyBusinessCategory: "corporate_stock",
          corporateNonBusinessAssets: { cashByYearEnd: [] },
        })}
        onUpdate={() => {}}
        deathDate="2025-03-01"
      />,
    );
    expect(screen.queryByText(/상속개시일 현재 보유현금/)).not.toBeNull();
    expect(screen.queryByText(/직전 5개 사업연도 말 현금/)).not.toBeNull();
  });

  it("FNB-UI-6: 2024 상속 → 제외 단서 입력칸 미노출 + 토글 150% 표기", () => {
    render(
      <CorporateNonBusinessAssetsSection
        item={makeItem({ familyBusinessCategory: "corporate_stock" })}
        onUpdate={() => {}}
        deathDate="2024-06-01"
      />,
    );
    expect(screen.queryByText(/사택 제외분/)).toBeNull();
    expect(screen.queryByText(/학자금·전세금 제외분/)).toBeNull();
    expect(screen.queryAllByText(/150% 초과분/).length).toBeGreaterThan(0);
  });

  it("FNB-UI-7: 2025.2.28+ 상속 → 제외 단서 입력칸 노출 + 200% 표기", () => {
    render(
      <CorporateNonBusinessAssetsSection
        item={makeItem({ familyBusinessCategory: "corporate_stock" })}
        onUpdate={() => {}}
        deathDate="2025-03-01"
      />,
    );
    expect(screen.queryByText(/사택 제외분/)).not.toBeNull();
    expect(screen.queryByText(/학자금·전세금 제외분/)).not.toBeNull();
    expect(screen.queryAllByText(/200% 초과분/).length).toBeGreaterThan(0);
  });

  it("FNB-UI-8: 자동산정 미리보기 — 보유현금·5년현금 입력 시 자동산정 산식 노출", () => {
    render(
      <CorporateNonBusinessAssetsSection
        item={makeItem({
          familyBusinessCategory: "corporate_stock",
          corporateTotalAssets: 100_000_000_000,
          corporateNonBusinessAssets: {
            currentCash: 50_000_000_000,
            cashByYearEnd: [10_000_000_000, 10_000_000_000, 10_000_000_000],
          },
        })}
        onUpdate={() => {}}
        deathDate="2025-03-01"
      />,
    );
    expect(screen.queryByText(/과다현금 자동산정/)).not.toBeNull();
    expect(screen.queryByText(/차감 미리보기/)).not.toBeNull();
  });
});
