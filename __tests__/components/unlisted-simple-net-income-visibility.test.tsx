/**
 * UnlistedStockSimpleFields — §54④ 순손익가치 입력 조건부 노출
 *
 * 사용자 시나리오: 비상장 간이평가에서 "순자산가치만 적용 §54④" 토글 ON 시
 *   - 1·2호(§55③ 영업권 배제): 순손익가치 입력 섹션 숨김
 *   - 3·5호(단서 조건부): 순손익가치 입력 섹션 표시 + amber 안내 카드
 *   - 6호(잔여 존속기한 3년): 순손익가치 입력 섹션 표시 + 영업권 안내 카드
 *   - undefined(본칙 §54①): 순손익가치 입력 섹션 표시
 *
 * 🔴 **2026-09-11(IG-087) 계약 반전 — 6호는 「숨김」이 아니다.**
 *
 * 종전 이 파일은 6호를 1·2호와 묶어 「무조건 순자산 → 숨김」으로 단언했고, 그 단언이
 * **결함을 지키고 있었다**. 「최종 평가액이 순자산가치인가」와 「순손익 입력이 필요한가」는
 * 다른 질문이다 — 6호의 순자산가치에는 §59② 영업권이 가산되고(엔진
 * `mapToNetAssetOnlyReason`이 6호를 `undefined`로 매핑 = §55③ 배제 대상 아님),
 * 영업권의 분자는 3년치 순손익이다(`resolveWeightedNetIncome3yForGoodwill`).
 * 3칸을 숨기면 영업권이 항상 0이 되어 평가액이 과소 산정됐다.
 *
 * 엔진 분기와 단일 진실 (lib/tax-engine/property-valuation-stock.ts — §55③ 배제는 1·2·3호).
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { UnlistedStockSimpleFields } from "@/components/calc/UnlistedStockSimpleFields";
import type { EstateItem, UnlistedAssetValueOnlyReason } from "@/lib/tax-engine/types/inheritance-gift.types";

function makeItem(reason: UnlistedAssetValueOnlyReason | undefined): EstateItem {
  return {
    id: "u-1",
    category: "unlisted_stock",
    name: "테스트법인",
    unlistedStockData: {
      totalShares: 10_000,
      ownedShares: 5_000,
      weightedNetIncome: 0,
      netIncomeY1: 0,
      netIncomeY2: 0,
      netIncomeY3: 0,
      netAssetValue: 0,
      capitalizationRate: 0.1,
      assetValueOnlyReason: reason,
    },
  };
}

function renderWith(reason: UnlistedAssetValueOnlyReason | undefined) {
  return render(
    <UnlistedStockSimpleFields
      item={makeItem(reason)}
      onUpdate={() => {}}
      mode="inheritance"
      valuationDate={undefined}
    />,
  );
}

describe("UnlistedStockSimpleFields — §54④ 순손익가치 입력 조건부 노출", () => {
  afterEach(() => cleanup());

  it("undefined (본칙 §54①) → 순손익가치 입력 섹션 표시", () => {
    renderWith(undefined);
    expect(screen.getByTestId("simple-section-net-income")).toBeInTheDocument();
    expect(screen.queryByTestId("simple-net-income-conditional-notice")).toBeNull();
  });

  it("1호 liquidation (§55③ 영업권 배제) → 순손익가치 입력 섹션 숨김", () => {
    renderWith("liquidation");
    expect(screen.queryByTestId("simple-section-net-income")).toBeNull();
  });

  it("2호 lt3y (§55③ 영업권 배제) → 순손익가치 입력 섹션 숨김", () => {
    renderWith("lt3y");
    expect(screen.queryByTestId("simple-section-net-income")).toBeNull();
  });

  it("🔴 6호 remaining_3y → 표시 + 영업권 안내 (IG-087 계약 반전)", () => {
    renderWith("remaining_3y");
    expect(screen.getByTestId("simple-section-net-income")).toBeInTheDocument();
    const notice = screen.getByTestId("simple-net-income-goodwill-notice");
    expect(notice).toBeInTheDocument();
    expect(notice.textContent).toContain("6호");
    // 3·5호 단서 안내와는 다른 카드다
    expect(screen.queryByTestId("simple-net-income-conditional-notice")).toBeNull();
  });

  it("3호 real_estate_80 (단서 조건부) → 표시 + amber 안내 노출", () => {
    renderWith("real_estate_80");
    expect(screen.getByTestId("simple-section-net-income")).toBeInTheDocument();
    const notice = screen.getByTestId("simple-net-income-conditional-notice");
    expect(notice).toBeInTheDocument();
    expect(notice.textContent).toContain("3호");
  });

  it("5호 stock_80 (단서 조건부) → 표시 + amber 안내 노출", () => {
    renderWith("stock_80");
    expect(screen.getByTestId("simple-section-net-income")).toBeInTheDocument();
    const notice = screen.getByTestId("simple-net-income-conditional-notice");
    expect(notice).toBeInTheDocument();
    expect(notice.textContent).toContain("5호");
  });
});
