/**
 * @vitest-environment jsdom
 *
 * anchor — 일반건물 부담부증여 × 토지·건물 둘 다 이월과세: 토지분 칸에 **자산 전체 평가액**이 남은 이력 알림 (V-5 · a)
 *
 * 계획서 `docs/00-pm/gb-bg-carryover-gift-tax-part-limit.plan.md` §8 V-5.
 * PR-2(#2592) 전 화면은 이 칸을 「증여 당시 평가액(양도한 해당 자산가액)」 하나로 받았다 — 저장 이력의 토지 칸에 자산 전체가 있을 수 있다.
 * 과세가액이 자산 전체 + 건물분 이상이면(다른 재산·10년 합산) ⑧을 통과해 상당액이 부풀고(A 채택 실측 32,916,000 → 31,096,000),
 * 저장 시점으로 골라낼 수 없어 문구로만 알린다: ⑤ 토지분 칸 안내 · ⑧ 건물분 비움 · ⑧ 합계 초과.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CarryoverGiftBlock } from "@/components/calc/transfer/CarryoverGiftBlock";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const NOTICE = "자산 전체 평가액";
const RET = { giftTaxAmount: "", giftTaxCalculated: "100,000,000", giftTaxBase: "1,000,000,000" };
const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100,000,000", donorRelation: "lineal", donorSameHousehold: "no", ...RET };

/** 일반건물 · 부담부증여 K-5 · 둘 다 이월과세(`buildingCause` = "purchase"면 토지만). */
function gbAsset(land: string, building: string, separate: boolean, buildingCause: "carryover_gift" | "purchase" = "carryover_gift"): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "general_building",
    acquisitionCause: "carryover_gift",
    acquisitionDate: separate ? "2020-01-01" : "2024-05-01",
    ...(separate ? { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2024-05-01" } : {}),
    gbBuildingAcquisitionCause: buildingCause,
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
    transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgAcquisitionMethod: "converted",
    bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000",
    carryover: { ...CO, giftDateValuation: land },
    buildingCarryover: { ...CO, giftDateValuation: building },
  } as unknown as AssetForm;
}
const formOf = (a: AssetForm) =>
  ({ transferDate: "2026-03-01", filingDate: "2026-05-31", assets: [a], houses: [], presaleRights: [], contractTotalPrice: "1,000,000,000", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false }) as unknown as TransferFormData;
const issueOn = (a: AssetForm, field: string) =>
  [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, formOf(a))).find((i) => (i as { field?: string }).field === field) as { message: string } | undefined;
const hintOf = (a: AssetForm, part: "land" | "building", field: string) => {
  const { container } = render(<CarryoverGiftBlock asset={a} transferDate="2026-03-01" onChange={() => {}} part={part} />);
  return container.querySelector(`[data-field="${field}"]`)?.textContent ?? "";
};

describe("⑤ 토지분 칸 안내 — 자산 전체 평가액이 남았으면 고치라고 말한다", () => {
  it.each([["분리 OFF", false], ["분리 ON 토지 블록", true]] as const)("%s", (_n, separate) => {
    expect(hintOf(gbAsset("1,000,000,000", "", separate), "land", "carryover.giftDateValuation")).toContain(NOTICE);
  });
  it("분리 ON 건물 블록 · 분리 OFF 건물분 칸에는 없다", () => {
    expect(hintOf(gbAsset("600,000,000", "", true), "building", "buildingCarryover.giftDateValuation")).not.toContain(NOTICE);
    expect(hintOf(gbAsset("600,000,000", "", false), "land", "buildingCarryover.giftDateValuation")).not.toContain(NOTICE);
  });
  it("토지만 이월과세(평가액을 나누지 않음)에는 없다", () => {
    expect(hintOf(gbAsset("1,000,000,000", "", true, "purchase"), "land", "carryover.giftDateValuation")).not.toContain(NOTICE);
  });
});

describe("⑧ 메시지 — 막히는 순간 원인을 말한다", () => {
  it.each([["분리 OFF", false], ["분리 ON", true]] as const)("%s 건물분 비움 → 건물분 칸 메시지에 토지분 확인", (_n, separate) => {
    expect(issueOn(gbAsset("1,000,000,000", "", separate), "buildingCarryover.giftDateValuation")?.message).toContain(NOTICE);
  });
  it("토지 10억(자산 전체) + 건물 4억 > 과세가액 10억 → 합계 메시지에 토지분 확인", () => {
    const m = issueOn(gbAsset("1,000,000,000", "400,000,000", false), "buildingCarryover.giftDateValuation")?.message;
    expect(m).toContain("초과합니다");
    expect(m).toContain(NOTICE);
  });
  it("정상 입력(6억 · 4억)은 막히지 않는다", () => {
    expect(issueOn(gbAsset("600,000,000", "400,000,000", false), "buildingCarryover.giftDateValuation")).toBeUndefined();
  });
});
