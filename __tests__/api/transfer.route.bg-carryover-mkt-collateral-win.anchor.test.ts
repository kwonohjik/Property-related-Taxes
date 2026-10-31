/**
 * anchor — 이월과세(§97의2) × 부담부증여 **시가 모드 × 담보 승(상증법 §66)** (⑧ 차단 해제 · ⑫ 요구 정리 · 2단계).
 *
 * 시가 모드에서 담보평가가 시가보다 크면 증여가액이 담보평가액이고, 「소득세법 시행령」 제159조 제1항 제1호 괄호에 따라 취득가액은 산정방식과 무관하게
 * 취득시 기준시가 × 채무비율이다. 두 시나리오가 모두 기준시가를 쓴다(A = 당초 증여자 · B = 양도인) — 기준시가 모드와 같은 구조다(1단계 `bg-carryover-std-uniform-bundle`).
 * 종전에는 ⑧이 단건(`이월과세 자산의 부담부증여에서 이 경우의 취득가액 산정 기준을 확인하지 못해`)·묶음(`함께 양도와 같이 계산하지 않습니다`) 모두 막았고,
 * 직접 호출(⑫)은 방식별로 쓰이지 않는 당초 증여자 값(실지·매매사례가액·감정가액)을 요구했다 — 화면이 그 칸을 숨기면 막다른 길이다.
 * 시가 모드의 임대 승은 존재하지 않는다(엔진 `computeSangjeungbeopValuation` — 임대 환산은 시가가 없을 때만 비교).
 *
 * · MC-1 격자 — 주택·일반건물 × 이월과세 위치(단건 · 둘 다 · 첫 자산만 · 둘째 자산만): ⑧ 통과 ∧ ⑫ 200 ∧ 취득가액 A·B 합과 양도차익이 단건 합과 ±0, 단건은 값 고정.
 * · MC-2 산정방식 4종(실지·환산·매매사례·감정) — 당초 증여자 기준시가만으로 ⑧ 통과 ∧ ⑫ 200 ∧ 쓰이지 않는 당초 증여자 값(실지·매매·감정)을 바꿔도 A·B·차익·세액이 같다.
 * · MC-3 당초 증여자 기준시가가 비면 ⑧·⑫ 모두 막는다(침묵 A = B 차단).
 * · MC-4 보충적평가 승(담보가 지지 않음)은 종전 그대로 방식별 당초 증여자 값을 요구한다 — 요구를 풀지 않았다는 안전망.
 * · MC-5 여전히 막힘 — 지분 50% · 조합원입주권 · 겸용(시가 모드 이월과세여도 해당 자산만 ⑧이 막는다).
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
import { bgCollateralForcesStdAcq } from "@/lib/calc/burdened-gift-collateral-win";
import { bgCoDonorNeedsStdPrice } from "@/lib/calc/burdened-gift-acq-std-price";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const FORM = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "100,000,000", giftDateValuation: "600,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no" };

/** 시가 모드 — 양도시 시가 10억, 차입금 12억(담보평가 12억 > 시가 → 담보 승, 채무비율 100%). 취득시 기준시가는 양도인 5억(주택) · 당초 증여자 1.5억. 임대 승은 시가 모드에 없다. */
const MKT = {
  housing: x({ bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000", bgCoDonorActualAcquisitionTotal: "120,000,000" }),
  gb: x({ bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "250000000", bgActualAcquisitionBuilding: "250000000", bgCoDonorActualAcquisitionLand: "30,000,000", bgCoDonorActualAcquisitionBuilding: "30,000,000" }),
} as const;
const WIN = {
  housing: x({ ...MKT.housing, bgLendingDepositTotal: "0", bgMortgageDebtAmount: "1,200,000,000", bgMortgageSetAmount: "1,200,000,000" }),
  gb: x({ ...MKT.gb, bgLendingDepositTotal: "0", bgMortgageDebtAmount: "1,200,000,000", bgMortgageSetAmount: "1,200,000,000" }),
} as const;
type Kind = keyof typeof WIN;

const asset = (kind: Kind, id: number, carry: boolean, ...over: Partial<AssetForm>[]): AssetForm => {
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
    addressJibun: `서울 강남구 테스트동 ${id}-${id}`, transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgDonorRelation: "lineal_descendant",
  }), base, carry ? x({ carryover: { ...CO } }) : {}, WIN[kind], ...over) as AssetForm;
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
const STD = { housing: x({ bgCoDonorLandStdPriceAtAcq: "0", bgCoDonorBuildingStdPriceAtAcq: "150,000,000" }), gb: x({ bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000" }) } as const;
const KINDS = ["housing", "gb"] as const;
const BLANK_STD = x({ bgCoDonorLandStdPriceAtAcq: "", bgCoDonorBuildingStdPriceAtAcq: "" });
/** 이월과세 자산은 당초 증여자 기준시가가 없으면 안 되므로, 방식별 격자의 「기준시가만」 자산은 실지·매매·감정 당초 증여자 칸을 모두 비운다. */
const NO_DONOR_AMOUNTS = x({
  bgCoDonorActualAcquisitionTotal: "", bgCoDonorActualAcquisitionLand: "", bgCoDonorActualAcquisitionBuilding: "",
  bgCoDonorPresumedAcquisitionTotal: "", bgCoDonorPresumedAcquisitionLand: "", bgCoDonorPresumedAcquisitionBuilding: "",
});

const POSITIONS = [["단건", [true]], ["둘 다 이월과세", [true, true]], ["첫 자산만", [true, false]], ["둘째 자산만", [false, true]]] as const;
const GRID = KINDS.flatMap((kind) => POSITIONS.map(([pos, carry]) => ({ kind, pos, carry: [...carry] as boolean[] })));
const mk = (kind: Kind, id: number, c: boolean, ...over: Partial<AssetForm>[]) => asset(kind, id, c, ...(c ? [STD[kind]] : []), ...over);

describe("MC-1 시가 모드 담보 승 × 이월과세 — ⑧ 통과 · ⑫ 200 · 취득가액 A·B 합과 양도차익 = 단건 합", () => {
  it.each(GRID)("$kind · $pos", async ({ kind, carry }) => {
    const assets = carry.map((c, i) => mk(kind, i + 1, c));
    const f = carry.length === 1 ? single(assets[0]) : bundle(assets);
    expect(allIssues(f).map(String)).toEqual([]);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j).slice(0, 300)).toBe(200);
    const got = read(r.j);
    const singles = await Promise.all(assets.map(async (a) => { const s = await post(single(a)); expect(s.status, JSON.stringify(s.j).slice(0, 300)).toBe(200); return read(s.j); }));
    expect(got.a).toBe(singles.reduce((s, q) => s + q.a, 0));
    expect(got.b).toBe(singles.reduce((s, q) => s + q.b, 0));
    expect(got.gain).toBe(singles.reduce((s, q) => s + q.gain, 0));
    if (carry.length === 1) {
      // 값 고정 — 취득시 기준시가 × 채무비율(100%): 주택 A = 당초 증여자 1.5억 · B = 양도인 5억, 일반건물 A = 5천만 · B = 2억
      expect(got.a).toBe(kind === "housing" ? 150_000_000 : 50_000_000);
      expect(got.b).toBe(kind === "housing" ? 500_000_000 : 200_000_000);
    }
  });
});

describe("MC-1b ⑤ 술어 — 시가 모드 담보 승 이월과세는 취득가액 강제 ∧ 당초 증여자 기준시가 칸을 연다", () => {
  it.each(KINDS)("%s", (kind) => {
    const a = mk(kind, 1, true);
    expect(bgCollateralForcesStdAcq(a)).toBe(true);
    expect(bgCoDonorNeedsStdPrice(a)).toBe(true);
  });
  it("보충적평가 승(채무 3억)은 담보 승이 아니라 기준시가 칸을 열지 않는다(실지 방식)", () => {
    const a = mk("housing", 1, true, x({ bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000" }));
    expect(bgCollateralForcesStdAcq(a)).toBe(false);
    expect(bgCoDonorNeedsStdPrice(a)).toBe(false);
  });
});

const METHODS = ["actual", "converted", "salesCase", "appraisal"] as const;
describe("MC-2 산정방식 4종 — 당초 증여자 기준시가만으로 통과하고, 쓰이지 않는 당초 증여자 값은 결과에 영향이 없다", () => {
  const strip = (j: any) => ({ ...read(j), tax: j.data.result?.determinedTax ?? j.data.aggregated?.totalDeterminedTax }); // eslint-disable-line @typescript-eslint/no-explicit-any
  it.each(KINDS.flatMap((kind) => METHODS.map((method) => ({ kind, method }))))("$kind · $method", async ({ kind, method }) => {
    const only = mk(kind, 1, true, x({ bgAcquisitionMethod: method }), NO_DONOR_AMOUNTS);
    const withNoise = mk(kind, 1, true, x({
      bgAcquisitionMethod: method,
      bgCoDonorActualAcquisitionTotal: "999,000,000", bgCoDonorActualAcquisitionLand: "444,000,000", bgCoDonorActualAcquisitionBuilding: "555,000,000",
      bgCoDonorPresumedAcquisitionTotal: "888,000,000", bgCoDonorPresumedAcquisitionLand: "333,000,000", bgCoDonorPresumedAcquisitionBuilding: "444,000,000",
    }));
    // 매매사례·감정은 양도인 쪽 입력(⑦ 증여일 평가액)이 필요하지 않다 — 시가 모드 기본 시료에 이미 실지가 있어 같은 시료로 비교한다
    expect(allIssues(single(only)).map(String), method).toEqual([]);
    const a = await post(single(only));
    const b = await post(single(withNoise));
    expect(a.status, JSON.stringify(a.j).slice(0, 300)).toBe(200);
    expect(b.status, JSON.stringify(b.j).slice(0, 300)).toBe(200);
    expect(strip(a.j)).toEqual(strip(b.j));
    expect(strip(a.j).a).not.toBe(strip(a.j).b); // §97의2②3호 비교가 성립한다 — A ≠ B
  });
});

describe("MC-3 당초 증여자 기준시가가 비면 ⑧·⑫ 모두 막는다", () => {
  it.each(KINDS.flatMap((kind) => METHODS.map((method) => ({ kind, method }))))("$kind · $method", async ({ kind, method }) => {
    const blank = mk(kind, 1, true, x({ bgAcquisitionMethod: method }), BLANK_STD);
    const issues = allIssues(single(blank)).map(String);
    expect(issues.length, method).toBeGreaterThan(0);
    expect(issues.join("\n"), method).toContain("기준시가");
    const r = await post(single(blank));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.j)).toContain("기준시가가 필요합니다");
  });
});

describe("MC-3b 일반건물 · 당초 증여자 건물 기준시가 0 — 담보 승이면 ⑧·⑫ 모두 막는다(기준시가 모드와 같다)", () => {
  it("담보 승", async () => {
    const a = mk("gb", 1, true, x({ bgCoDonorBuildingStdPriceAtAcq: "0" }));
    expect(allIssues(single(a)).map(String).join("\n")).toContain("건물 기준시가는 0일 수 없습니다");
    const r = await post(single(a));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.j)).toContain("buildingStdPriceAtAcquisition");
  });
});

describe("MC-4 보충적평가 승(담보가 시가보다 작음) — 방식별 당초 증여자 값 요구는 종전 그대로", () => {
  const SUP = x({ bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000" });
  it("주택 · 실지 · 당초 증여자 실지취득가액을 비우면 ⑧·⑫ 모두 막는다", async () => {
    const a = mk("housing", 1, true, SUP, NO_DONOR_AMOUNTS);
    expect(allIssues(single(a)).map(String).join("\n")).toContain("실지취득가액");
    const r = await post(single(a));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.j)).toContain("실지취득가액");
  });
  it("주택 · 실지 · 당초 증여자 실지취득가액이 있으면 통과(보충적평가 승은 담보 승 예외가 아니다)", async () => {
    const a = mk("housing", 1, true, SUP);
    expect(allIssues(single(a)).map(String)).toEqual([]);
    expect((await post(single(a))).status).toBe(200);
  });
});

describe("MC-5 여전히 막힘 — 지분 · 조합원입주권 · 겸용(시가 모드 이월과세여도 해당 자산만 ⑧이 막는다)", () => {
  const HM = mk("housing", 1, false);
  it.each([
    ["지분 50% 담보 승", () => [HM, mk("housing", 2, true, x({ ownershipNumerator: "50", ownershipDenominator: "100" }))], "지분 보유"],
    ["조합원입주권 담보 승", () => [HM, mk("housing", 2, false, x({ assetKind: "right_to_move_in" }))], "조합원입주권"],
    ["겸용주택 담보 승", () => [HM, mk("housing", 2, true, x({ isMixedUseHouse: true }))], "겸용주택"],
  ] as const)("%s", async (_l, build, reason) => {
    const gate = allIssues(bundle(build())).map(String).filter((m) => m.includes(GATE));
    expect(gate.length).toBe(1);
    expect(gate[0]).toContain("자산 2:");
    expect(gate[0]).toContain(`${reason} 자산은`);
  });
  it("조합원입주권 단건 담보 승은 단건 ⑧이 막는다", () => {
    const rtmi = mk("housing", 1, false, x({ assetKind: "right_to_move_in" }));
    // allIssues는 메시지를 80자로 자르므로 앞부분(담보평가 승 차단 사유)으로 단언한다
    expect(allIssues(single(rtmi)).map(String).join("\n")).toContain("담보평가액(1,200,000,000원 — 「상속세 및 증여세법」 제66조)이 시가보다 커서");
  });
});
