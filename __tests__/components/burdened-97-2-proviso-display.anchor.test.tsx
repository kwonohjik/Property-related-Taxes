/**
 * @vitest-environment jsdom
 *
 * anchor: 부담부증여 결과 카드 — **§97②2호 단서 표시** (W-7, 2026-08-07)
 *
 * W-6이 단서를 구현하면서 발동 시 **취득가액 슬롯이 0**이 된다(나목이 필요경비 전체라
 * 환산취득가액을 별도 차감하지 않는다). 화면이 그대로 「취득가액 0」만 보여주면 사용자는
 * **계산이 빠진 것으로 읽는다** — 표시 계층이 그 이유를 말해야 한다.
 *
 * 고정 계약:
 *   D1. 발동 시 취득가액 행이 「차감 제외」로 바뀌고 **스왑 전 환산취득가액**을 보여준다
 *   D2. 발동 시 필요경비 행 라벨에 단서 근거가 붙는다
 *   D3. 가목·나목 비교 배너가 뜬다
 *   D4. **미발동도 표시한다** — 숨기면 「비교를 했는지」가 안 보인다
 *   D5. 단서와 무관한 경로(K-1~K-3·K-4)에는 배너가 없다
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BurdenedTransferTaxResultCard } from "@/components/calc/results/BurdenedTransferTaxResultCard";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

afterEach(cleanup);

const ESTIMATED_SIDE = 41_200_000;
const DIRECT_SIDE = 50_000_000;
const CONVERTED_LAND = 30_000_000;
const CONVERTED_BUILDING = 10_000_000;

function perAssetPart(over: Record<string, unknown> = {}) {
  return {
    sangjeungbeopValue: 300_000_000,
    stdPriceAtAcquisition: 60_000_000,
    transferPrice: 150_000_000,
    acquisitionPrice: 30_000_000,
    estimatedDeduction: 900_000,
    acquisitionMethod: "converted" as const,
    stdPriceAtTransfer: 300_000_000,
    ...over,
  };
}

function makeBreakdown(over: Partial<TransferBurdenedGiftBreakdown> = {}): TransferBurdenedGiftBreakdown {
  return {
    assumedDebtAmount: 200_000_000,
    sangjeungbeopValuation: {
      supplementary: 400_000_000, mortgage: 200_000_000, rental: 0,
      selectedMode: "supplementary", max: 400_000_000,
    },
    giftValuation: {
      supplementary: 400_000_000, mortgage: 200_000_000, rental: 0,
      selectedMode: "supplementary", max: 400_000_000,
    },
    wholePropertySupplementary: 400_000_000,
    debtRatio: 0.5,
    gratuitousPortion: 200_000_000,
    taxpayer: "donor",
    acquisitionMethodUsed: "converted",
    perAsset: { land: perAssetPart(), building: perAssetPart() },
    ...over,
  } as TransferBurdenedGiftBreakdown;
}

function makeResult(breakdown: TransferBurdenedGiftBreakdown): TransferTaxResult {
  return {
    transferGain: 150_000_000,
    taxableGain: 150_000_000,
    longTermHoldingDeduction: 0,
    longTermHoldingRate: 0,
    basicDeduction: 0,
    taxBase: 150_000_000,
    // ⚠️ 세액값은 취득가액(40,000,000)과 **겹치지 않게** 고른다 — 겹치면
    //    getByText가 다중 매치로 죽어 계약이 실제로 무엇을 재는지 흐려진다.
    calculatedTax: 38_100_000,
    reductionAmount: 0,
    determinedTax: 38_100_000,
    penaltyTax: 0,
    localIncomeTax: 3_810_000,
    totalTax: 41_910_000,
    progressiveDeduction: 0,
    taxRate: 0.38,
    steps: [],
    transferBurdenedGiftBreakdown: breakdown,
  } as unknown as TransferTaxResult;
}

function renderWith(breakdown: TransferBurdenedGiftBreakdown) {
  return render(<BurdenedTransferTaxResultCard transferTaxResults={[makeResult(breakdown)]} />);
}

const FIRED = makeBreakdown({
  necessaryExpenseSwap: { estimatedSide: ESTIMATED_SIDE, directSide: DIRECT_SIDE, chosen: "direct" },
  convertedAcquisitionBeforeSwap: { land: CONVERTED_LAND, building: CONVERTED_BUILDING },
  perAsset: {
    // 단서 발동 후의 엔진 산출 상태 — 취득가액 0, 경비 = 나목
    land: perAssetPart({ acquisitionPrice: 0, estimatedDeduction: 37_500_000 }),
    building: perAssetPart({ acquisitionPrice: 0, estimatedDeduction: 12_500_000 }),
  },
});

describe("D1·D2 — 발동 시 행 라벨이 갈린다", () => {
  it("🔴 취득가액 행이 「차감 제외」로 바뀌고 스왑 전 환산취득가액을 보여준다", () => {
    renderWith(FIRED);
    expect(screen.getByText("취득가액 (환산 — 차감 제외)")).toBeTruthy();
    // 0이 아니라 40,000,000(= 30,000,000 + 10,000,000)이 보여야 한다.
    expect(screen.getByText("40,000,000")).toBeTruthy();
    expect(screen.queryByText("취득가액 (채무인수분)")).toBeNull();
  });

  it("🔴 필요경비 행에 단서 근거가 붙는다", () => {
    renderWith(FIRED);
    expect(screen.getByText("필요경비 (자본·양도비 §97②단서)")).toBeTruthy();
  });
});

describe("D3·D4 — 비교 배너", () => {
  it("🔴 발동 시 가목·나목 금액과 「별도로 차감하지 않습니다」가 보인다", () => {
    renderWith(FIRED);
    const banner = screen.getByTestId("burdened-97-2-proviso");
    expect(banner.textContent).toContain("제97조 제2항 제2호 단서");
    expect(banner.textContent).toContain("41,200,000");
    expect(banner.textContent).toContain("50,000,000");
    expect(banner.textContent).toContain("별도로 차감하지 않습니다");
  });

  it("🔴 **미발동도 표시한다** — 숨기면 비교를 했는지가 안 보인다", () => {
    renderWith(
      makeBreakdown({
        necessaryExpenseSwap: { estimatedSide: ESTIMATED_SIDE, directSide: 25_000_000, chosen: "estimated" },
      }),
    );
    const banner = screen.getByTestId("burdened-97-2-proviso");
    expect(banner.textContent).toContain("본문 적용");
    expect(banner.textContent).toContain("단서 미발동");
    // 본문이므로 취득가액 행은 종전 라벨 그대로다.
    expect(screen.getByText("취득가액 (채무인수분)")).toBeTruthy();
  });
});

describe("D5 — 단서와 무관한 경로에는 배너가 없다", () => {
  it("K-1~K-3(기준시가) — `necessaryExpenseSwap` 자체가 없다", () => {
    renderWith(makeBreakdown({ acquisitionMethodUsed: "standard_price" }));
    expect(screen.queryByTestId("burdened-97-2-proviso")).toBeNull();
  });

  it("K-4(실지취득가) — §97②1호 가산이라 단서 대상 아님", () => {
    renderWith(makeBreakdown({ acquisitionMethodUsed: "actual" }));
    expect(screen.queryByTestId("burdened-97-2-proviso")).toBeNull();
  });
});
