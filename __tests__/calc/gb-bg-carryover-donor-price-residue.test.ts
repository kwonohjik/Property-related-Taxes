/**
 * ④ — 부담부증여 일반건물은 이월과세 블록의 「증여자 취득가액」을 싣지 않는다 (V-3 · Q-2 a · 3중 패턴)
 *
 * 계획서 `docs/00-pm/gb-bg-on-building-block-fields.plan.md` §4.2. 당초 증여자 취득가액은 「당초 증여자」 블록(`carryoverDonorBasis`)이 정본이고
 * 엔진도 이 칸을 쓰지 않는다(`transfer-burdened-gift.types.ts`). ⑤가 칸을 숨기므로 남은 값을 본문에 싣지 않는다. 일반 양도는 종전 그대로.
 */
import { describe, it, expect } from "vitest";
import { buildCarryoverPayload } from "@/lib/calc/transfer-tax-api-carryover";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const asset = (over: Record<string, unknown> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    transferType: "burdened_gift",
    acquisitionCause: "carryover_gift",
    gbBuildingAcquisitionCause: "carryover_gift",
    carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "900,000,000" },
    ...over,
  }) as unknown as AssetForm;

describe("④ 증여자 취득가액 남은 값", () => {
  it("부담부증여 일반건물 → 싣지 않는다", () => {
    expect((buildCarryoverPayload(asset(), "2026-03-01", 1)?.carryoverTaxation as { donorAcquisitionPrice?: number } | undefined)?.donorAcquisitionPrice).toBeUndefined();
  });
  it("일반 양도 일반건물 → 종전대로 싣는다", () => {
    expect((buildCarryoverPayload(asset({ transferType: "general" }), "2026-03-01", 1)?.carryoverTaxation as { donorAcquisitionPrice?: number } | undefined)?.donorAcquisitionPrice).toBe(900_000_000);
  });
});

describe("⑧ 환산 토글이 남은 부담부증여 — 안내가 「당초 증여자」 블록을 가리킨다(Q-2 a)", () => {
  it("메시지에 「이월과세 — 「당초 증여자」 취득 당시 값」", async () => {
    const { collectStepIssues } = await import("@/lib/calc/transfer-tax-validate");
    const a = asset({
      addressJibun: "서울 강남구 테스트동 1-1", acquisitionDate: "2024-05-01",
      gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
      gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000", gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
      transferCause: "general", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
      bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgAcquisitionMethod: "converted",
      bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000",
      carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", giftDateValuation: "1,000,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no", useEstimatedAcquisition: true, estimationMode: "general" },
      buildingCarryover: { ...CARRYOVER_DEFAULTS, donorAcquisitionDate: "2015-01-01" },
    });
    const form = { transferDate: "2026-03-01", filingDate: "2026-05-31", assets: [a], houses: [], presaleRights: [], contractTotalPrice: "1,000,000,000", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false } as never;
    const messages = [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, form)).map((i) => (i as { message?: string }).message).join("\n");
    expect(messages).toContain("이월과세 취득가액을 환산으로 구할 수 없습니다");
    expect(messages).toContain("「이월과세 — 「당초 증여자」 취득 당시 값」에 입력하거나");
  });
});
