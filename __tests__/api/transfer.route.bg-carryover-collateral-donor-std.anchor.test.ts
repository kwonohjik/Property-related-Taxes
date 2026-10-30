/**
 * anchor — 이월과세(§97의2) × 부담부증여 시가 모드 × 담보 승(상증법 §66): **당초 증여자 취득시 기준시가 필수** (⑫·엔진 게이트).
 *
 * 담보 승이면 §159①1호 괄호로 취득가액이 취득시 기준시가 × 채무비율로 강제된다 — 시나리오 A는 당초 증여자 기준시가를, B는 양도인 기준시가를 쓴다.
 * 그런데 게이트(`assertCarryoverDonorBasis`)는 산정방식(실지)의 칸만 요구했다. 실지취득가액만 채우고 당초 증여자 기준시가를 비우면 ⑫가 200을 주고
 * 시나리오 A가 양도인 값으로 대체돼(A = B) §97의2가 조용히 무력화됐다(실측: 주택 500M=500M · 일반건물 묶음 200M=200M).
 * 화면에서는 ⑧의 시가 모드 담보 승 차단이 앞서 막아 API 직접 호출에서만 도달한다.
 *
 * · CD-1 주택 단건 · CD-2 일반건물 묶음 — 기준시가를 비우면 400(당초 증여자 기준시가 안내), 채우면 200 ∧ A ≠ B.
 * · CD-3 보충적평가 승(괄호 미발동) — 실지취득가액만으로 200(과차단 없음).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { captureBody } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const FORM = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "100,000,000", giftDateValuation: "600,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no" };
/** 시가 10억 · 담보 12억(설정액 = 채무) → 담보 승. 보충적평가 승은 채무 3억. */
const DEBT = { mortgage: { bgMortgageDebtAmount: "1,200,000,000", bgMortgageSetAmount: "1,200,000,000" }, supplementary: { bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000" } };

type Opt = { id: number; win: "mortgage" | "supplementary"; donorStd: boolean };
const housing = ({ id, win, donorStd }: Opt) => ({
  ...makeDefaultAsset(id), assetId: `h${id}`, addressJibun: `서울 강남구 테스트동 ${id}-${id}`, assetKind: "housing", acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01",
  fixedAcquisitionPrice: "300000000", standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000", useEstimatedAcquisition: false,
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "actual",
  bgActualAcquisitionTotal: "300000000", bgLendingDepositTotal: "0", ...DEBT[win],
  carryover: { ...CO }, bgCoDonorLandStdPriceAtAcq: donorStd ? "0" : "", bgCoDonorBuildingStdPriceAtAcq: donorStd ? "150,000,000" : "", bgCoDonorActualAcquisitionTotal: "120,000,000",
}) as unknown as AssetForm;
const generalBuilding = ({ id, win, donorStd }: Opt) => ({
  ...makeDefaultAsset(id), assetId: `g${id}`, addressJibun: `서울 강남구 테스트동 ${id}-${id}`, assetKind: "general_building", acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01",
  gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential", gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "200000000",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "100000000", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000",
  bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "250000000", bgActualAcquisitionBuilding: "250000000", bgLendingDepositTotal: "0", ...DEBT[win],
  carryover: { ...CO }, buildingCarryover: { ...CARRYOVER_DEFAULTS, donorAcquisitionDate: "2000-06-01" },
  bgCoDonorLandStdPriceAtAcq: donorStd ? "10,000,000" : "", bgCoDonorBuildingStdPriceAtAcq: donorStd ? "40,000,000" : "",
  bgCoDonorActualAcquisitionLand: "30,000,000", bgCoDonorActualAcquisitionBuilding: "30,000,000",
}) as unknown as AssetForm;

async function post(assets: AssetForm[]) {
  const f = Object.assign(createDefaultTransferFormData(), FORM, { assets, contractTotalPrice: assets.length > 1 ? "" : "1,000,000,000", assetSplitMode: "companion", bundledSaleMode: "actual" }) as TransferFormData;
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
/** 이월과세 시나리오 A·B 취득가액 — 주택 단건은 자산 카드, 일반건물 묶음은 묶음 단위(파트 합). */
function scenarios(j: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const sum = (sc: any) => (sc?.parts ?? []).reduce((s: number, p: any) => s + p.acquisitionPrice, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
  const d = j.data.aggregated?.properties?.[0]?.carryoverTaxationDetail ?? j.data.result?.carryoverTaxationDetail;
  if (d) return { a: d.scenarioA.acquisitionPrice as number, b: d.scenarioB.acquisitionPrice as number };
  const u = j.data.aggregated.burdenedGiftCarryoverUnits.primary;
  return { a: sum(u.scenarioA), b: sum(u.scenarioB) };
}
const ASK = "취득시 기준시가";

describe("CD-1 주택 단건 — 시가 모드 담보 승 이월과세", () => {
  it("당초 증여자 기준시가를 비우면 400 (종전 200 · A = B)", async () => {
    const r = await post([housing({ id: 1, win: "mortgage", donorStd: false })]);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.j)).toContain(ASK);
  });
  it("채우면 200 ∧ 시나리오 A(당초 증여자) ≠ B(양도인) — A = 150M × 채무비율 1", async () => {
    const r = await post([housing({ id: 1, win: "mortgage", donorStd: true })]);
    expect(r.status).toBe(200);
    expect(scenarios(r.j)).toEqual({ a: 150_000_000, b: 500_000_000 });
  });
});

describe("CD-2 일반건물 묶음 — 시가 모드 담보 승 이월과세", () => {
  it("두 자산 모두 당초 증여자 기준시가를 비우면 400 (종전 200 · A = B)", async () => {
    const r = await post([generalBuilding({ id: 1, win: "mortgage", donorStd: false }), generalBuilding({ id: 2, win: "mortgage", donorStd: false })]);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.j)).toContain(ASK);
  });
  it("채우면 200 ∧ A = 50M(10M + 40M) ≠ B = 200M", async () => {
    const r = await post([generalBuilding({ id: 1, win: "mortgage", donorStd: true }), generalBuilding({ id: 2, win: "mortgage", donorStd: true })]);
    expect(r.status).toBe(200);
    expect(scenarios(r.j)).toEqual({ a: 50_000_000, b: 200_000_000 });
  });
});

describe("CD-3 보충적평가 승 — 괄호 미발동이라 실지취득가액만으로 계산한다(과차단 없음)", () => {
  it.each([
    ["주택", () => [housing({ id: 1, win: "supplementary", donorStd: false })]],
    ["일반건물 묶음", () => [generalBuilding({ id: 1, win: "supplementary", donorStd: false }), generalBuilding({ id: 2, win: "supplementary", donorStd: false })]],
  ] as const)("%s — 기준시가 비움 ⇒ 200", async (_l, mk) => {
    expect((await post(mk())).status).toBe(200);
  });
});
