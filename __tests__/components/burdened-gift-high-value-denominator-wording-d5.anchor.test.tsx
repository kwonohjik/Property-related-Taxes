/**
 * @vitest-environment jsdom
 *
 * anchor: D-5 — `BurdenedGiftDetailCard`의 지분 모드 안내 문구가 `4a6da10ec`(G1 후속, 2026-09-27)에서
 * 「12억 고가주택 판정 분모」 → 「고가주택 판정 분모」로 바뀌었는데 그 정정을 고정하는 anchor가 없었다.
 *
 * 왜 「12억」을 뺀 것이 옳은가: 이 물건 전체 보충적평가액(`wholePropertySupplementary`)은
 * 고가주택 판정 문턱의 분모로 쓰이는데, 그 문턱은 양도일에 따라 9억(2021-12-07 이전)·12억
 * (이후)으로 갈린다(`resolveHighValueHouseThreshold` — OH-13). 「12억」을 리터럴로 박으면
 * 9억 문턱이 적용되는 양도분에서 화면 문구가 틀린다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BurdenedGiftDetailCard } from "@/components/calc/results/transfer/BurdenedGiftDetailCard";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

afterEach(cleanup);

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
    wholePropertySupplementary: 800_000_000,
    ownershipRatio: 0.5,
    debtRatio: 0.5,
    gratuitousPortion: 200_000_000,
    taxpayer: "donor",
    acquisitionMethodUsed: "converted",
    perAsset: { land: perAssetPart(), building: perAssetPart() },
    ...over,
  } as TransferBurdenedGiftBreakdown;
}

describe("D-5: BurdenedGiftDetailCard 지분 모드 — 고가주택 판정 분모 문구", () => {
  it("「고가주택 판정 분모」 문구를 보여준다 — 「12억」 리터럴은 없다(era-aware)", () => {
    render(<BurdenedGiftDetailCard breakdown={makeBreakdown()} />);
    expect(screen.getByText(/고가주택 판정 분모로는 물건 전체/)).toBeInTheDocument();
    expect(screen.queryByText(/12억 고가주택 판정 분모/)).not.toBeInTheDocument();
    // 물건 전체 보충적평가액 숫자는 그대로 보인다.
    expect(screen.getByText("800,000,000")).toBeInTheDocument();
  });
});
