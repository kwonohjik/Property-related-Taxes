/**
 * 일반건물 부담부증여 K-4 × 「소득세법 시행령」 §163⑨ 단서(의제취득일 이후 · 고시 전) — 파트별 큰 금액(PR-3 B2).
 * 계획서 docs/00-pm/remaining-4-measurements.plan.md §B · 사용자 결정 Q-43 a.
 *
 * 시료: 토지 100㎡ · 양도시 토지 5억 · 건물 2억 · 시가 10억 · 채무 5억(β 0.5) · ① 토지 1억 · 건물 1천만 · ② §164④ = 200만 × 100㎡ = 2억 · §164⑤ = 5천만.
 * ②는 부담부증여에서 이미 필수인 취득시 기준시가 칸 값이다. 수정 전에는 ①만 써 445,000,000(일반 양도 750,000,000).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { allIssues } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { needsClauseADeclaration } from "@/lib/calc/transfer-tax-validate-clause-a";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type L = Record<string, any>; // eslint-disable-line
const GB: L = {
  addressJibun: "서울 강남구 테스트동 8-8", assetKind: "general_building", acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance",
  acquisitionDate: "1988-06-01", inheritanceStartDate: "1988-06-01", decedentAcquisitionDate: "1970-01-01", useEstimatedAcquisition: false,
  landAcqMode: "actual", buildingAcqMode: "actual", gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "5,000,000", gbTransferBuildingValue: "200,000,000", gbAcqLandPricePerSqm: "2,000,000", gbAcqBuildingValue: "50,000,000",
  gbZoneType: "general_residential", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgMortgageDebtAmount: "500000000", bgMortgageSetAmount: "500000000",
  bgLendingDepositTotal: "0", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual",
  bgActualAcquisitionLand: "100000000", bgActualAcquisitionBuilding: "10000000",
};
const form = (over: L): TransferFormData => Object.assign(createDefaultTransferFormData(), {
  transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false, contractTotalPrice: "1000000000",
  assets: [{ ...makeDefaultAsset(1), ...GB, ...over } as AssetForm],
}) as TransferFormData;
async function run(over: L) {
  const f = form(over); const issues = allIssues(f); const body = (await captureBody(f)) as L; const r = await postTransfer(body);
  const agg = r.json?.data?.aggregated;
  return { issues, status: r.status, err: JSON.stringify(r.json?.error ?? null).slice(0, 200), flags: { l: body.generalBuildingValuation?.landSec163_9Proviso, b: body.generalBuildingValuation?.buildingSec163_9Proviso }, gain: agg?.totalTransferGain };
}
describe("BGGB — 일반건물 부담부증여 K-4 × §163⑨ 단서 파트별(Q-43 a)", () => {
  it.each([
    ["상속 1988 두 파트 — 토지 max(1억, 2억) · 건물 max(1천만, 5천만) × 0.5", {}, { l: true, b: true }, 375_000_000],
    ["상속 1995 — 건물만 2호(토지는 1990.8.30. 이후)", { acquisitionDate: "1995-06-01", inheritanceStartDate: "1995-06-01" }, { b: true }, 425_000_000],
    ["토지 1988 상속 + 건물 2010 매매(분리)", { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "1988-06-01", acquisitionDate: "2010-01-01", gbBuildingAcquisitionCause: "purchase", inheritanceStartDate: "1988-06-01" }, { l: true }, 395_000_000],
    ["증여 1988 두 파트", { acquisitionCause: "gift", gbBuildingAcquisitionCause: "gift", inheritanceStartDate: "", donorAcquisitionDate: "1970-01-01", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "1988-06-01", giftDonorRelation: "other", giftSameHousehold: "no" }, { l: true, b: true }, 375_000_000],
  ] as [string, L, L, number][])("%s → %d(수정 전 445,000,000)", async (_n, over, flags, gain) => {
    const r = await run(over);
    expect([r.issues, r.status]).toEqual([[], 200]);
    expect(r.flags).toEqual(flags);
    expect(r.gain).toBe(gain);
  });
  it("단서 밖(상속 2005) — 표시 없음 · 445,000,000 그대로", async () => {
    const r = await run({ acquisitionDate: "2005-06-01", inheritanceStartDate: "2005-06-01" });
    expect([r.flags, r.gain]).toEqual([{}, 445_000_000]);
  });
  it("평가액(실지 칸)이 크면 평가액 — (3억 + 6천만) × 0.5 → 320,000,000", async () => {
    expect((await run({ bgActualAcquisitionLand: "300000000", bgActualAcquisitionBuilding: "60000000" })).gain).toBe(320_000_000);
  });
  it("환산(K-5) — 표시 없음(실지가 아니라 §163⑨ 단서가 닿지 않는다)", async () => {
    expect((await run({ bgAcquisitionMethod: "converted" })).flags).toEqual({});
  });
  it("기준시가 평가 — 표시 없음(§159①1호 괄호)", async () => {
    expect((await run({ bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "" })).flags).toEqual({});
  });
  it("지분 1/2(축 A · 채무 × 1/2) — 실지 · 기준시가를 같은 비율로 줄여 비교 · 187,500,000(= 375,000,000 ÷ 2)", async () => {
    const r = await run({ ownershipNumerator: "1", ownershipDenominator: "2", ownershipRemainderThirdParty: "yes", bgMortgageDebtAmount: "250000000", bgMortgageSetAmount: "250000000" });
    expect([r.issues, r.status, r.gain]).toEqual([[], 200, 187_500_000]);
  });
});
