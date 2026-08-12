/**
 * anchor: 부담부증여 기준시가 모드 「취득시 기준시가」 입력 경로 (O-1 결함 수정)
 *
 * ## 무엇을 잡는가
 *
 * 이 칸이 없으면 `standardPriceAtAcq`가 0으로 엔진에 실려 **취득가액이 0**이 된다
 * (실측: 양도차익 257,500,000원 과대 · 개산공제도 0). validate도 기준시가 모드는 검사하지
 * 않았으므로 **아무도 알려주지 않는** 과대과세였다.
 *
 * 노출 범위가 정확해야 한다 — 넓히면 `general_building`에 조용히 무시되는 칸이 생기고
 * (엔진은 gb* 만 쓴다), 좁히면 결함이 되살아난다.
 *
 * 설계: docs/02-design/features/burdened-gift-acq-std-price-input-path.plan.md §5 D-1
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { AssetSectionTransfer } from "@/components/calc/transfer/asset-sections/AssetSectionTransfer";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const TITLE = "취득시 기준시가";

function renderSection(over: Partial<AssetForm>, onChange = () => {}) {
  const asset: AssetForm = {
    ...makeDefaultAsset(1),
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard",
    acquisitionDate: "2015-01-01",
    ...over,
  };
  return render(
    <AssetSectionTransfer
      asset={asset}
      onChange={onChange}
      bundledSaleMode="apportioned"
      transferDate="2025-03-15"
    />,
  );
}

/**
 * 취득시 기준시가 카드 — 안내문에도 같은 낱말이 있어 텍스트가 아닌 `data-testid`로 찾는다
 * (`CurrencyInput`은 `hideLabel`일 때만 aria-label을 달아 `getByLabelText`가 닿지 않는다).
 */
const acqCard = () => screen.queryByTestId("bg-acq-std-price");

describe("I-1 대상 자산 4종에서 렌더된다", () => {
  it.each(["housing", "building", "land", "commercial_building"] as const)("%s", (assetKind) => {
    renderSection({ assetKind });
    expect(acqCard()).not.toBeNull();
  });
});

describe("I-2/I-3 미렌더 조건", () => {
  it("I-2 general_building — 전용 입력(gbAcqBuildingValue)이 따로 있다", () => {
    renderSection({ assetKind: "general_building" });
    expect(acqCard()).toBeNull();
  });

  it("I-3 시가 모드 — K-4/K-5가 별도 축을 쓴다", () => {
    renderSection({ assetKind: "housing", bgValuationMode: "sangjeungbeop_market" });
    expect(acqCard()).toBeNull();
  });

  it("일반 양도 — 환산 모드에서 CompanionAcqPurchaseBlock이 받는다(중복 입력 금지)", () => {
    renderSection({ assetKind: "housing", transferType: "regular" });
    expect(acqCard()).toBeNull();
  });
});

describe("I-4 🔴 구별력 — 이 칸이 standardPriceAtAcq에 쓴다", () => {
  it("입력하면 그 필드로 patch가 나간다 (다른 필드에 쓰면 무의미한 칸)", () => {
    const onChange = vi.fn();
    renderSection({ assetKind: "housing" }, onChange);
    const card = acqCard();
    expect(card).not.toBeNull();
    // housing은 총액 직접입력(단가·면적 칸 없음) — 카드 안 입력이 하나다
    const input = within(card!).getByRole("textbox");
    fireEvent.change(input, { target: { value: "500000000" } });
    const patches = onChange.mock.calls.map((c) => c[0]);
    expect(patches.some((p) => "standardPriceAtAcq" in p)).toBe(true);
  });
});

/**
 * ③ 취득정보 안내 문구 — 「자동 도출됩니다」가 참인 것은 `general_building` 뿐이었다.
 * 나머지 자산에 그 문구가 남으면 사용자가 ②의 새 입력칸을 찾지 못한다(결함이 사실상 유지).
 */
describe("Q-3 ③ 안내 문구가 자산별로 갈린다", () => {
  const renderAcqBlock = (assetKind: AssetForm["assetKind"]) => {
    const asset: AssetForm = {
      ...makeDefaultAsset(1),
      assetKind,
      transferType: "burdened_gift",
      bgValuationMode: "sangjeungbeop_standard",
      acquisitionCause: "purchase",
    };
    return render(
      <CompanionAcqPurchaseBlock
        asset={asset}
        acquisitionDate=""
        onAcquisitionDateChange={() => {}}
        useEstimatedAcquisition={false}
        onUseEstimatedChange={() => {}}
        fixedAcquisitionPrice=""
        onFixedAcquisitionPriceChange={() => {}}
        standardPriceAtAcq=""
        onStandardPriceAtAcqChange={() => {}}
        standardPriceAtTransfer=""
        onStandardPriceAtTransferChange={() => {}}
        assetKind={assetKind}
      />,
    );
  };

  it.each(["housing", "building", "land", "commercial_building"] as const)(
    "%s — ② 양도정보로 안내한다",
    (assetKind) => {
      renderAcqBlock(assetKind);
      expect(screen.getByText(/② 양도정보/)).toBeTruthy();
      expect(screen.queryByText(/자동 도출됩니다/)).toBeNull();
    },
  );

  it("general_building — 종전 「자동 도출」 유지(그쪽은 참이다)", () => {
    renderAcqBlock("general_building");
    expect(screen.getByText(/자동 도출됩니다/)).toBeTruthy();
  });
});
