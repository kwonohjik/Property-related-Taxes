/**
 * 구주택 멸실·신축 통산(해석 (5)) × 토지 파트 이월과세(§97의2①) — 이월과세 4뷰의 「세율 기산일」 날짜 칸이
 * 환산 기산일을 실제 취득일처럼 내지 않는다(「환산」 접두). 14지점 점검 ⑦ 지적(2026-10-19).
 *
 * 이월과세 4뷰(카드 `SplitCarryoverComparisonCard` · 상세명세서 `splitCarryoverRateDateText` · 신고서·PDF `splitCarryoverVerdictText`)는
 * 모두 `splitCarryoverView().parts[].rateBasisDate` 한 값을 읽는다 — 그 값을 잠근다. 부정형 짝: 통산 입력이 없으면 날짜만(접두 없음).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { splitCarryoverView, splitCarryoverVerdictText } from "@/lib/tax-engine/transfer-tax-split-carryover-display";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

const D = (s: string) => new Date(s);
const GIFT = D("2022-01-01");

/** 엔진 anchor RB-D3 형태 — 건물 신축 2025-01-01 · 토지 이월과세(증여 2022-01-01, 증여자 취득 2019-01-01) · 양도 2025-09-01 */
function input(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing", transferPrice: 1_000_000_000, transferDate: D("2025-09-01"), acquisitionPrice: 450_000_000,
    acquisitionCause: "newConstruction", acquisitionDate: D("2025-01-01"), isOneHousehold: false, householdHousingCount: 2,
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landTransferPrice: 700_000_000, buildingTransferPrice: 300_000_000, landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 300_000_000,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 250_000_000, landAcquisitionDate: GIFT,
    landAcquisitionCause: "carryover_gift", landDonorAcquisitionDate: D("2019-01-01"),
    carryoverGiftEvent: { giftRegistryDate: GIFT, giftTaxCalculated: 0, giftTaxBase: 200_000_000 },
    landCarryoverTaxation: {
      giftRegistryDate: GIFT, donorAcquisitionDate: D("2019-01-01"), donorAcquisitionPrice: 150_000_000, useEstimatedAcquisition: false,
      giftTaxAmount: 0, giftDateValuation: 200_000_000, donorRelation: "lineal", exclusionDeclared: {},
    },
    ...over,
  });
}
const rebuild = { landRebuildPriorHouse: { startMode: "since_land" as const, demolitionDate: D("2023-05-31"), footprintUnchanged: true } };

describe("통산 × 토지 이월과세 — 이월과세 view의 세율 기산일 칸", () => {
  const withRb = calculateTransferTax(input(rebuild), makeMockRates());
  const plain = calculateTransferTax(input(), makeMockRates());

  it("전제: 통산 echo가 있고 엔진이 파트별로 세율을 판정했다", () => {
    expect(withRb.splitDetail?.land.rateHoldingAggregation).toBeDefined();
    expect(withRb.splitDetail?.partRateBasisApplied).toBe(true);
    expect(withRb.splitDetail?.land.carryover).toBeDefined();
  });

  it("통산이면 「환산 YYYY-MM-DD」 — 신고서·PDF 판정 줄도 같은 값", () => {
    const land = splitCarryoverView(withRb.splitDetail)!.parts.find((p) => p.key === "land")!;
    const e = withRb.splitDetail!.land.appliedRateBasisDate!;
    expect(land.rateBasisDate).toBe(`환산 ${e}`);
    expect(splitCarryoverVerdictText(land)).toContain(`세율 기산 환산 ${e}`);
  });

  it("부정형 짝: 통산 입력이 없으면 날짜만(접두 없음)", () => {
    const land = splitCarryoverView(plain.splitDetail)!.parts.find((p) => p.key === "land")!;
    expect(plain.splitDetail?.land.rateHoldingAggregation).toBeUndefined();
    expect(plain.splitDetail?.partRateBasisApplied).toBe(true);
    expect(land.rateBasisDate).toBe(plain.splitDetail!.land.appliedRateBasisDate);
    expect(land.rateBasisDate).not.toContain("환산");
  });
});
