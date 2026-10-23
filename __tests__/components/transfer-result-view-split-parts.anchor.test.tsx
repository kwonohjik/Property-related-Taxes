/**
 * `TransferTaxResultView` 800줄 분리(Q-12 PR-3, 동작 무변경)로 옮긴 두 조각의 계약 고정.
 *  · `ParcelDisclosure` — 닫혀 있어도 인쇄에서는 펼쳐진다(`hidden print:block`)
 *  · `SingleDetailCards` — 상가 환산 카드에 «양도소득금액 = 양도차익 − 장기보유특별공제»를 결과에서 읽어 넘기고, 렌더 게이트 술어(`hasSingleDetailCards`)는 8개 사유를 모두 본다
 * 분리 전후 렌더 동일성은 결과 4뷰 해시 매트릭스로 따로 실측했고(커밋 메시지), 이 파일은 그 뒤 회귀를 막는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ParcelDisclosure } from "@/components/calc/results/transfer/ParcelDisclosure";
import { SingleDetailCards, hasSingleDetailCards } from "@/components/calc/results/transfer/SingleDetailCards";
import { calculateCommercialBuildingValuation } from "@/lib/tax-engine/commercial-building-valuation";
import { CB_VALUATION_INPUT_C01, TRANSFER_PRICE } from "../tax-engine/transfer-tax/_helpers/case-29-fixtures";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

afterEach(cleanup);

describe("ParcelDisclosure", () => {
  const pr = {
    id: "p1",
    allocatedTransferPrice: 500_000_000,
    acquisitionPrice: 100_000_000,
    estimatedDeduction: 0,
    expenses: 0,
    transferGain: 400_000_000,
    longTermHoldingRate: 0.1,
    longTermHoldingDeduction: 40_000_000,
    transferIncome: 360_000_000,
  } as unknown as NonNullable<TransferTaxResult["parcelDetails"]>[number];

  it("닫힌 상태에서도 본문은 DOM 에 있고 인쇄에서만 보이며, 펼치면 화면에도 보인다", () => {
    const { container } = render(<ParcelDisclosure pr={pr} idx={0} />);
    const body = container.querySelector("table")!.parentElement!;
    expect(body.className).toBe("hidden print:block");
    expect(screen.getByText("필지 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /필지 1/ }));
    expect(container.querySelector("table")!.parentElement!.className).toBe("");
  });
});

describe("SingleDetailCards", () => {
  it("상가 환산 카드 «양도소득금액» 행 = 과세 양도차익 − 장기보유특별공제 (결과에서 읽어 넘긴다)", () => {
    const detail = calculateCommercialBuildingValuation(CB_VALUATION_INPUT_C01, TRANSFER_PRICE);
    const result = { commercialBuildingValuationDetail: detail, transferGain: 500_000_000, taxableGain: 500_000_000, longTermHoldingDeduction: 120_000_000 } as unknown as TransferTaxResult;
    render(<SingleDetailCards result={result} />);
    const row = screen.getByText("양도소득금액 = 양도차익 − 장기보유특별공제").closest("tr")!;
    expect(row.textContent).toContain("380,000,000");
  });

  it("렌더 게이트 술어는 8개 사유를 각각 본다 — 아무것도 없으면 false", () => {
    const base = {} as unknown as TransferTaxResult;
    expect(hasSingleDetailCards(base)).toBe(false);
    const causes: Array<Partial<TransferTaxResult>> = [
      { familyBusinessDetail: {} as never },
      { surchargeType: "non_business_land" },
      { nonBusinessLandJudgmentDetail: { isNonBusinessLand: true } as never },
      { commercialBuildingValuationDetail: {} as never },
      { transferBurdenedGiftBreakdown: {} as never },
      { redevelopmentDetail: {} as never },
      { rentalHousingExceptionDetail: {} as never },
      { new99Detail: { isEligible: true } as never },
    ];
    for (const c of causes) expect(hasSingleDetailCards({ ...base, ...c } as TransferTaxResult), JSON.stringify(c)).toBe(true);
  });
});
