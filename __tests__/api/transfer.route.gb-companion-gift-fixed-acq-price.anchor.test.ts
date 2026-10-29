/**
 * anchor — 함께 양도 컴패니언 × 증여 일반건물: ⑧ 통과 ⇒ ⑫ 200 (계획서 `docs/00-pm/gb-companion-gift-fixed-acq-price.plan.md` Q-1 a)
 *
 * 종전: ⑫ 컴패니언 증여 갈래만 매매·신축·상속 갈래의 일반건물 제외와 부담부증여 제외가 없어, 토지 취득원인이 증여인 컴패니언 일반건물이
 * ⑧ 통과 → `companionAssets.N.fixedAcquisitionPrice: 증여 자산은 신고가액(취득가액) 필수` 400 이었다(주 자산 위치는 200). 부담부증여는 화면이 칸을 숨기는 막다른 길이었다.
 * 신고가액 값(1,000원·6억·50억)은 분리 ON·부담부증여에서 세액에 영향이 없다 — 파트 값/§159 가 취득가액을 정한다. 분리 OFF 일괄 증여는 ⑧·⑫ 가 같은 칸을 요구하고 값이 세액에 쓰인다.
 * 불변식: **⑧ 이 신고가액을 안 막는 셀은 ⑫ 도 200, ⑧ 이 막는 셀은 ⑫ 도 400**(UI 통과 ↔ API 400 모순 금지 — 14지점 ⑧·⑫).
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
import { allIssues, captureBody, newForm } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});



const T = 1_600_000_000;
const BASE: Partial<AssetForm> = {
  assetKind: "general_building", addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential", gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", actualSalePrice: String(T),
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2005-05-01", acquisitionDate: "2010-05-01", useEstimatedAcquisition: true,
  landAcqMode: "actual", landAcquisitionPrice: "400000000", buildingAcqMode: "appraisal", buildingAcquisitionPrice: "200000000",
};
const LAND_ACT_BLD_EST = { buildingAcqMode: "estimated", buildingAcquisitionPrice: "" } as Partial<AssetForm>;
const gbAsset = (id: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, BASE, ...over) as AssetForm;
const landAsset = (id: number, over: Partial<AssetForm> = {}) =>
  ({
    ...makeDefaultAsset(id), addressJibun: "서울 강남구 테스트동 2-2", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2012-01-01",
    acquisitionArea: "100", transferArea: "100", landNature: "standalone", standardPriceAtAcq: "100000000", standardPriceAtTransfer: "200000000",
    actualSalePrice: "400000000", fixedAcquisitionPrice: "100000000", ...over,
  }) as unknown as AssetForm;
const bundle = (assets: AssetForm[], over: Record<string, unknown> = {}): TransferFormData => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, {
    transferDate: "2026-02-16", filingDate: "2026-05-31", assets, assetSplitMode: "companion", bundledSaleMode: "actual",
    contractTotalPrice: "2000000000", ...over,
  });
  return f as unknown as TransferFormData;
};
async function run(f: TransferFormData) {
  const iss = allIssues(f).map((x) => x.split(":")[1]);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(await captureBody(f)) }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  const fieldErr = JSON.stringify(j.error?.fieldErrors ?? {});
  return { status: res.status, tax: res.status === 200 ? (j.data.aggregated.calculatedTax as number) : undefined, blocked8: iss.includes("fixedAcquisitionPrice"), gift400: fieldErr.includes("증여 자산은 신고가액") };
}


const ON_GIFT_LAND = { acquisitionCause: "gift", landAcquisitionPrice: "400000000" } as Partial<AssetForm>;
const BLD_ACT = { buildingAcqMode: "actual", buildingAcquisitionPrice: "200000000", useEstimatedAcquisition: false } as Partial<AssetForm>;
const BG = {
  transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgAcquisitionMethod: "converted",
} as unknown as Partial<AssetForm>;
const OFF_GIFT = {
  acquisitionCause: "gift", gbBuildingAcquisitionCause: "gift", hasSeperateLandAcquisitionDate: false, useEstimatedAcquisition: false,
  landAcqMode: undefined, buildingAcqMode: undefined, landAcquisitionPrice: "", buildingAcquisitionPrice: "",
} as unknown as Partial<AssetForm>;
/** [이름, 자산 변형, 부담부증여 묶음 여부, 신고가액 비움 시 기대 상태] */
const CELLS: [string, Partial<AssetForm>[], boolean, 200 | 400][] = [
  ["분리 ON · 토지 증여 + 건물 매매 실가", [ON_GIFT_LAND, BLD_ACT], false, 200],
  ["분리 ON · 토지 증여 + 건물 매매 환산", [ON_GIFT_LAND, LAND_ACT_BLD_EST], false, 200],
  ["분리 ON · 토지 증여 + 건물 증여", [ON_GIFT_LAND, { gbBuildingAcquisitionCause: "gift" }, BLD_ACT], false, 200],
  ["분리 ON · 같은 날 · 토지 증여 + 건물 매매 실가", [ON_GIFT_LAND, BLD_ACT, { landAcquisitionDate: "2010-05-01" }], false, 200],
  ["분리 ON · 건물만 증여(토지 매매)", [{ gbBuildingAcquisitionCause: "gift" }, BLD_ACT], false, 200],
  ["부담부증여 · 토지 증여 2005", [ON_GIFT_LAND, BG, BLD_ACT], true, 200],
  ["부담부증여 · 토지 증여 1980(의제취득일 전)", [ON_GIFT_LAND, BG, BLD_ACT, { landAcquisitionDate: "1980-05-01" }], true, 200],
  // 부담부증여는 파트 취득가액 입력이 없다(§159 가 정한다) — 일반건물 파트 면제가 대신 막아 주지 못하는 셀. 부담부증여 면제만이 이 셀을 푼다.
  ["부담부증여 · 토지 증여 · 파트 취득가액 없음", [{ acquisitionCause: "gift", landAcquisitionPrice: "", buildingAcquisitionPrice: "" } as Partial<AssetForm>, BG, { buildingAcqMode: "actual", useEstimatedAcquisition: false } as Partial<AssetForm>], true, 200],
  ["분리 OFF 일괄 증여 — ⑧·⑫ 가 함께 요구", [OFF_GIFT], false, 400],
];
const build = (c: Partial<AssetForm>[], bgBundle: boolean, role: "컴패니언" | "주 자산", over: Partial<AssetForm>): TransferFormData => {
  // 부담부증여는 일반 양도와 함께 묶을 수 없다 — 다른 자산도 같은 변형의 부담부증여 일반건물이다(`fixedAcquisitionPrice` 는 이 쪽에만 넣는다).
  const other = bgBundle ? gbAsset(role === "컴패니언" ? 1 : 2, ...c) : landAsset(role === "컴패니언" ? 1 : 2);
  const mine = gbAsset(role === "컴패니언" ? 2 : 1, ...c, over);
  return bundle(role === "컴패니언" ? [other, mine] : [mine, other]);
};

describe("GF-1 컴패니언 × 증여 일반건물 — ⑧ 통과 ⇒ ⑫ 200, ⑧ 차단 ⇔ ⑫ 400", () => {
  it.each(CELLS)("컴패니언 · %s", async (_n, c, bgb, expected) => {
    const r = await run(build(c, bgb, "컴패니언", {}));
    expect(r.status).toBe(expected);
    expect(r.blocked8).toBe(expected === 400);
    expect(r.gift400).toBe(expected === 400);
  });
  it.each(CELLS)("주 자산 위치 · %s — 주 자산 자신은 요구가 없다(부담부증여 묶음은 다른 자산도 컴패니언이라 같은 규칙을 받는다)", async (_n, c, bgb, expected) => {
    const r = await run(build(c, bgb, "주 자산", {}));
    expect(r.status).toBe(expected === 200 ? 200 : 400);
    expect(r.blocked8).toBe(expected === 400);
  });
});

describe("GF-2 신고가액 값은 파트/§159 가 정하는 자산에서 세액에 영향이 없다 — 분리 OFF 일괄은 값이 취득가액을 정한다", () => {
  it.each(CELLS.filter(([, , , e]) => e === 200))("컴패니언 · %s — 1,000원 · 6억 · 50억 모두 같은 세액", async (_n, c, bgb) => {
    const t = [];
    for (const v of ["1000", "600000000", "5000000000"]) t.push((await run(build(c, bgb, "컴패니언", { fixedAcquisitionPrice: v }))).tax);
    const none = (await run(build(c, bgb, "컴패니언", {}))).tax;
    expect(new Set([...t, none]).size).toBe(1);
    expect(none).toBeGreaterThan(0);
  });
  it("분리 OFF 일괄 증여: 값에 따라 세액이 달라지고(534,134,685 → 347,730,000 → 0) 비우면 ⑧·⑫ 가 함께 막는다", async () => {
    const [, c, bgb] = CELLS.find(([n]) => n.startsWith("분리 OFF"))!;
    const t = [];
    for (const v of ["1000", "600000000", "5000000000"]) t.push((await run(build(c, bgb, "컴패니언", { fixedAcquisitionPrice: v }))).tax);
    expect(t).toEqual([534_134_685, 347_730_000, 0]);
    const r = await run(build(c, bgb, "컴패니언", {}));
    expect([r.status, r.blocked8, r.gift400]).toEqual([400, true, true]);
  });
  it("대표 세액 고정 — 분리 ON 토지 증여 + 건물 매매 실가 347,730,000 · 환산 354,424,038 · 부담부증여 2005 178,762,436 · 1980 109,572,047", async () => {
    const tax = async (i: number) => (await run(build(CELLS[i][1], CELLS[i][2], "컴패니언", {}))).tax;
    expect([await tax(0), await tax(1), await tax(5), await tax(6)]).toEqual([347_730_000, 354_424_038, 178_762_436, 109_572_047]);
  });
});
