/**
 * anchor — 이월과세(§97의2) × 부담부증여 **기준시가 모드 × 균일 승자(담보 §66 · 임대 §61⑤) 함께 양도 묶음** (⑧ 게이트 해제 · ⑫ 정합).
 *
 * 종전 ⑧ 묶음 게이트(`bgNonSupplementaryWinnerUnsupported`)는 이월과세 자산의 비보충 승자를 모드와 무관하게 막았다. 그런데 기준시가 모드는 단건 ⑧이 이미 열어 두었고,
 * 두 시나리오의 취득가액이 모두 「취득시 기준시가 × 채무비율」(A = 당초 증여자 · B = 양도인)이라 ⑫ 값이 맞다. 시가 모드 담보 승은 당시 화면을 열지 않아 막았고
 * 2단계에서 풀었다(`transfer.route.bg-carryover-mkt-collateral-win.anchor.test.ts`).
 *
 * · CU-1 격자 — 주택·일반건물 × 담보·임대(대칭) × 이월과세 위치(둘 다 · 첫 자산만 · 둘째 자산만): ⑧ 통과 ∧ ⑫ 200 ∧
 *   시나리오 A·B 취득가액 합과 양도차익이 단건 합과 ±0 (대칭 채무라 묶음 채무비율 = 단건 채무비율).
 * · CU-2 여전히 막힘 — 지분 보유 · 입주권 · 겸용(해당 자산만 ⑧이 막는다). 시가 모드 담보 승은 2단계에서 풀었다(`transfer.route.bg-carryover-mkt-collateral-win.anchor.test.ts`).
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
import { allIssues, captureBody } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const FORM = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "100,000,000", giftDateValuation: "600,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no" };

/** 기준시가 모드 주택 — 양도시 기준시가 10억 · 취득시 5억(양도인) · 당초 증여자 취득시 1.5억. 승자는 `win`이 정한다. */
const WIN = {
  housing: {
    mortgage: x({ bgLendingDepositTotal: "0", bgMortgageDebtAmount: "1,500,000,000", bgMortgageSetAmount: "1,500,000,000" }),
    rental: x({ bgLendingDepositTotal: "200000000", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAnnualRentTotal: "120000000" }),
  },
  gb: {
    mortgage: x({ bgLendingDepositTotal: "0", bgMortgageDebtAmount: "600,000,000", bgMortgageSetAmount: "600,000,000" }),
    rental: x({ bgLendingDepositTotal: "100000000", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAnnualRentTotal: "60000000" }),
  },
} as const;
type Kind = keyof typeof WIN;
type Win = "mortgage" | "rental";

const asset = (kind: Kind, win: Win, id: number, carry: boolean, ...over: Partial<AssetForm>[]): AssetForm => {
  const cause = carry ? "carryover_gift" : "purchase";
  const base = kind === "housing"
    ? x({
      assetId: `h${id}`, assetKind: "housing", acquisitionCause: cause, acquisitionDate: carry ? "2023-06-01" : "2015-01-01", fixedAcquisitionPrice: "300000000",
      standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000", useEstimatedAcquisition: false, ...(carry ? { bgCoDonorLandStdPriceAtAcq: "0", bgCoDonorBuildingStdPriceAtAcq: "150,000,000" } : {}),
    })
    : x({
      assetId: `g${id}`, assetKind: "general_building", acquisitionCause: cause, gbBuildingAcquisitionCause: cause, acquisitionDate: carry ? "2023-06-01" : "2015-03-01",
      gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential", gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "200000000",
      gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "100000000",
      ...(carry ? { buildingCarryover: { ...CARRYOVER_DEFAULTS, donorAcquisitionDate: "2000-06-01" }, bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000" } : {}),
    });
  return Object.assign({ ...makeDefaultAsset(id) }, x({
    addressJibun: `서울 강남구 테스트동 ${id}-${id}`, transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
  }), base, carry ? x({ carryover: { ...CO } }) : {}, WIN[kind][win], ...over) as AssetForm;
};

const bundle = (assets: AssetForm[]): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), FORM, { assets, contractTotalPrice: "", assetSplitMode: "companion", bundledSaleMode: "actual" }) as TransferFormData;
const single = (a: AssetForm): TransferFormData => Object.assign(createDefaultTransferFormData(), FORM, { assets: [a], contractTotalPrice: "" }) as TransferFormData;
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** 결과에서 이월과세 시나리오 A·B 취득가액 합과 양도차익을 읽는다 — 주택은 자산 카드, 일반건물은 묶음 단위 echo·단건 detail(파트 합). 이월과세 자산이 없으면 취득가액 합은 0. */
function read(j: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const sumParts = (sc: any) => (sc?.parts ?? []).reduce((s: number, p: any) => s + p.acquisitionPrice, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
  const agg = j.data.aggregated;
  const details: any[] = [j.data.result?.carryoverTaxationDetail, ...(agg?.properties ?? []).map((p: any) => p.carryoverTaxationDetail)].filter(Boolean); // eslint-disable-line @typescript-eslint/no-explicit-any
  const units: any[] = [...Object.values(agg?.burdenedGiftCarryoverUnits ?? {}), agg?.burdenedGiftCarryoverDetail].filter(Boolean); // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    a: details.reduce((s, d) => s + d.scenarioA.acquisitionPrice, 0) + units.reduce((s, u) => s + sumParts(u.scenarioA), 0),
    b: details.reduce((s, d) => s + d.scenarioB.acquisitionPrice, 0) + units.reduce((s, u) => s + sumParts(u.scenarioB), 0),
    gain: (agg?.totalTransferGain ?? j.data.result.transferGain) as number,
  };
}
const GATE = "함께 양도와 같이 계산하지 않습니다";

const POSITIONS = [["둘 다 이월과세", [true, true]], ["첫 자산만", [true, false]], ["둘째 자산만", [false, true]]] as const;
const GRID = (["housing", "gb"] as const).flatMap((kind) => (["mortgage", "rental"] as const).flatMap((win) => POSITIONS.map(([pos, carry]) => ({ kind, win, pos, carry: [...carry] as boolean[] }))));

describe("CU-1 기준시가 모드 균일 승자 × 이월과세 — ⑧ 통과 · ⑫ 200 · 시나리오 A·B 취득가액 합과 양도차익 = 단건 합", () => {
  it.each(GRID)("$kind · $win 승 · $pos", async ({ kind, win, carry }) => {
    const assets = carry.map((c, i) => asset(kind, win, i + 1, c));
    const f = bundle(assets);
    expect(allIssues(f).map(String)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    const got = read(r.j);
    const singles = await Promise.all(assets.map(async (a) => { const s = await post(single(a)); expect(s.status, JSON.stringify(s.j).slice(0, 300)).toBe(200); return read(s.j); }));
    expect(got.a).toBe(singles.reduce((s, q) => s + q.a, 0));
    expect(got.b).toBe(singles.reduce((s, q) => s + q.b, 0));
    expect(got.gain).toBe(singles.reduce((s, q) => s + q.gain, 0));
    if (carry.some(Boolean)) expect(got.a).not.toBe(got.b); // 당초 증여자와 양도인의 기준시가가 달라 §97의2②3호 비교가 성립한다
  });
});

describe("CU-2 여전히 막힘 — 지분 · 입주권 · 겸용", () => {
  const HM = asset("housing", "mortgage", 1, false);
  it.each([
    ["지분 50% 담보 승", () => [HM, asset("housing", "mortgage", 2, true, x({ ownershipNumerator: "50", ownershipDenominator: "100" }))], "지분 보유"],
    ["조합원입주권 담보 승", () => [HM, asset("housing", "mortgage", 2, false, x({ assetKind: "right_to_move_in" }))], "조합원입주권"],
    ["겸용주택 담보 승", () => [HM, asset("housing", "mortgage", 2, true, x({ isMixedUseHouse: true }))], "겸용주택"],
  ] as const)("%s — 해당 자산만 ⑧이 막는다", async (_l, mk, reason) => {
    const gate = allIssues(bundle(mk())).map(String).filter((m) => m.includes(GATE));
    expect(gate.length).toBe(1);
    expect(gate[0]).toContain("자산 2:");
    expect(gate[0]).toContain(`${reason} 자산은`);
  });
});

/**
 * CU-3 비대칭 임대 승 — 묶음은 채무를 증여가액 비례로 재안분하므로(④ `ΣB/ΣC`) 단건 합과 다르다(의도된 설계). 오라클은 ΣB/ΣC 산식이다:
 * 취득가액 = 취득시 기준시가 합 × ΣB/ΣC (시나리오 A는 당초 증여자 기준시가, B는 양도인 기준시가). 임대평가 C = 보증금 + 연 임대료 ÷ 12%(상증법 §61⑤).
 */
describe("CU-3 비대칭 임대 승 — 묶음 취득가액 = 취득시 기준시가 합 × ΣB/ΣC", () => {
  const RENT1 = x({ bgLendingDepositTotal: "200000000", bgAnnualRentTotal: "120000000" }); // C = 2억 + 10억 = 12억
  const RENT2 = x({ bgLendingDepositTotal: "400000000", bgAnnualRentTotal: "120000000" }); // C = 4억 + 10억 = 14억
  it.each([
    ["둘 다 이월과세", [true, true], 150_000_000 * 2, 500_000_000 * 2],
    ["첫 자산만", [true, false], 150_000_000, 500_000_000],
    ["둘째 자산만", [false, true], 150_000_000, 500_000_000],
  ] as const)("주택 · %s", async (_l, carry, donorStd, taxpayerStd) => {
    const f = bundle([asset("housing", "rental", 1, carry[0], RENT1), asset("housing", "rental", 2, carry[1], RENT2)]);
    expect(allIssues(f).map(String)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    const ratioNum = 200_000_000 + 400_000_000;
    const ratioDen = 1_200_000_000 + 1_400_000_000;
    const got = read(r.j);
    // 자산별 채무비율이 아니라 묶음 비율(ΣB/ΣC)이 두 자산 모두에 걸린다 — 분수 곱셈·파트별 내림 오차는 ±2원.
    expect(Math.abs(got.a - Math.floor((donorStd * ratioNum) / ratioDen))).toBeLessThanOrEqual(2);
    expect(Math.abs(got.b - Math.floor((taxpayerStd * ratioNum) / ratioDen))).toBeLessThanOrEqual(2);
  });
});
