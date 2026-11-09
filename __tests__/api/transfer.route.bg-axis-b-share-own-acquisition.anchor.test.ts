/**
 * 축 B(지분 분할) × 부담부증여 — 지분 카드(자산 2~N)가 자기 취득가액 산정방식 · 실지취득가액을 쓴다(토글 `bgShareOwnAcquisition`).
 * 계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` §14 D-2 (Q-6 a · 방식 = 지분 카드 토글).
 *
 * 「소득세법 시행령」 §159①1호 취득가액 A = 법 §97①1호 가액 — 양도인이 그 지분을 취득할 때의 가액이다.
 * 종전: ④ `mergePrimaryBasic`이 지분 카드의 `bgAcquisitionMethod` · `bgActualAcquisition*`를 자산 1 값으로 덮었다 —
 *   시가 보충 승 60/40(지분 1 실지 2.5억 · 지분 2 실지 3억)에서 양도차익 450,000,000(오라클 438,000,000 · +12,000,000).
 * 지금: 토글을 켜면 그 지분의 네 칸을 쓴다. 꺼짐(기본)은 종전 그대로.
 *
 * 오라클 = 축 A 단건(그 지분 재료 · 채무 × 지분율) 양도차익 합. 화면 경로 그대로(폼 → ⑧ → ④ → route POST · mock 세율).
 */
import { describe, it, expect, vi } from "vitest";
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
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const S = (n: number, sc: number) => String(Math.round(n * sc));
/** `transfer.route.bg-gb-fractional-win.anchor.test.ts` GB-1과 같은 일반건물 시료(시가 10억 · 취득시 기준시가 4억 · 실지 2.5억). */
const COMMON = { addressJibun: "제주특별자치도 강남구 테스트동 1-1", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgValuationMode: "sangjeungbeop_market", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAcquisitionMethod: "actual",
  assetKind: "general_building", bgMarketValueAtTransfer: "1000000000", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  gbAcqLandPricePerSqm: "2000000", gbAcqBuildingValue: "200000000", gbLandArea: "100", gbBuildingArea: "300", gbBuildingFootprintArea: "135", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "6000000", gbTransferBuildingValue: "200000000", actualSalePrice: "1600000000", gbBuildingAcquisitionCause: "purchase",
  hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "2015-01-01", useEstimatedAcquisition: false, bgActualAcquisitionTotal: "",
  bgActualAcquisitionLand: "100000000", bgActualAcquisitionBuilding: "150000000" };
const card = (id: string, ...over: Record<string, unknown>[]) => Object.assign({ ...makeDefaultAsset(1) }, x({ assetId: id, ...COMMON }), ...over.map(x)) as AssetForm;
const form = (assets: AssetForm[], over: Record<string, unknown> = {}) =>
  Object.assign(createDefaultTransferFormData(), { filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, transferDate: "2026-02-16", assets, contractTotalPrice: "" }, over) as TransferFormData;
const debt = (d: number) => ({ bgMortgageDebtAmount: String(d), bgMortgageSetAmount: String(d) });
const pct = (n: number, third = false) => ({ ownershipNumerator: String(n), ownershipDenominator: "100", ...(third ? { ownershipRemainderThirdParty: "yes" } : {}) });
const STD = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "" };
const ALT = { bgActualAcquisitionLand: "120000000", bgActualAcquisitionBuilding: "180000000" };
const K6 = { bgAcquisitionMethod: "salesCase", bgPresumedInputKind: "split", bgPresumedAcquisitionLand: S(100_000_000, 1), bgPresumedAcquisitionBuilding: S(150_000_000, 1), bgPresumedAcquisitionTotal: S(250_000_000, 1) };
const OWN = { bgShareOwnAcquisition: true };

async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  const j = (await res.json()) as Loose;
  return { status: res.status, err: JSON.stringify(j.error ?? null).slice(0, 300), gain: (j.data?.aggregated?.totalTransferGain ?? j.data?.result?.transferGain) as number };
}
async function gainOk(f: TransferFormData) {
  expect(allIssues(f), "⑧").toEqual([]);
  const r = await post(f);
  expect(r.status, `⑫ ${r.err}`).toBe(200);
  return r.gain;
}
/** 축 B 두 장 — 지분 2 카드만 `own`(토글 · 다른 재료)을 받는다. */
const axisB = (r1: number, r2: number, d: number, mode: Record<string, unknown>, own: Record<string, unknown>[]) =>
  form([card("p", pct(r1), mode, debt(d)), card("s", pct(r2), mode, debt(d), ...own)], { assetSplitMode: "fractional", contractTotalPrice: "1600000000" });
const axisA = (r: number, d: number, mode: Record<string, unknown>, own: Record<string, unknown>[]) => form([card("a", pct(r, true), mode, debt((d * r) / 100), ...own)]);

const CASES: [string, number, Record<string, unknown>, Record<string, unknown>, number][] = [
  // [이름, 채무(물건 전체), 평가 모드, 지분 2 재료, 토글 끈 종전 값]
  ["시가 보충 승 · 지분 2 실지 3억", 600_000_000, {}, ALT, 450_000_000],
  ["시가 보충 승 · 지분 2 매매사례가액(K-6)", 600_000_000, {}, K6, 450_000_000],
  ["시가 담보 승 · 지분 2 실지 3억(취득가액 = 기준시가 × 채무비율 — 실지 무관)", 1_400_000_000, {}, ALT, 988_000_000],
];

describe("D2-1 토글 켬 — 축 B 양도차익 = 지분별 재료 축 A 단건 합", () => {
  for (const [name, d, mode, mat] of CASES) {
    for (const [r1, r2] of [[60, 40], [30, 70]]) {
      it(`${name} · ${r1}/${r2}`, async () => {
        const got = await gainOk(axisB(r1, r2, d, mode, [mat, OWN]));
        const ref = (await gainOk(axisA(r1, d, mode, []))) + (await gainOk(axisA(r2, d, mode, [mat])));
        expect(got).toBe(ref);
      });
    }
  }
  it("고정값 — 시가 보충 승 60/40 = 438,000,000 · 30/70 = 429,000,000 (토글 끔 450,000,000)", async () => {
    expect(await gainOk(axisB(60, 40, 600_000_000, {}, [ALT, OWN]))).toBe(438_000_000);
    expect(await gainOk(axisB(30, 70, 600_000_000, {}, [ALT, OWN]))).toBe(429_000_000);
  });
});

describe("D2-2 토글 끔(기본) — 종전대로 자산 1 값을 쓴다", () => {
  for (const [name, d, mode, mat, before] of CASES) {
    it(`${name} · 60/40 = ${before.toLocaleString()}`, async () => {
      expect(await gainOk(axisB(60, 40, d, mode, [mat]))).toBe(before);
    });
  }
});

describe("D2-3 ⑧ ⊇ ⑫ — 토글을 켜고 지분 2 칸을 비우면 둘 다 막는다", () => {
  it("실지취득가액 비움: ⑧ ≥ 1 · ⑫ 400", async () => {
    const f = axisB(60, 40, 600_000_000, {}, [OWN, { bgActualAcquisitionLand: "", bgActualAcquisitionBuilding: "" }]);
    expect(allIssues(f).length).toBeGreaterThanOrEqual(1);
    expect((await post(f)).status).toBe(400);
  });
  it("산정방식 비움: ⑧ ≥ 1 · ⑫ 400", async () => {
    const f = axisB(60, 40, 600_000_000, {}, [OWN, { bgAcquisitionMethod: "" }]);
    expect(allIssues(f).length).toBeGreaterThanOrEqual(1);
    expect((await post(f)).status).toBe(400);
  });
});

describe("D2-4 숨은 토글은 새지 않는다 — 기준시가 평가면 토글이 안 보이고 켜져 있어도 자산 1 값을 쓴다", () => {
  it("기준시가 보충 승 · 지분 2 토글 켬 + 산정방식 비움: ⑧ 0건 · ⑫ 200 · 토글 끔과 같은 값", async () => {
    const on = await gainOk(axisB(60, 40, 400_000_000, STD, [OWN, { bgAcquisitionMethod: "", bgActualAcquisitionLand: "", bgActualAcquisitionBuilding: "" }]));
    const off = await gainOk(axisB(60, 40, 400_000_000, STD, []));
    expect(on).toBe(off);
    expect(on).toBe(194_000_000);
  });
});

describe("D2-5 범위 밖 종류(토지)는 토글이 켜져 있어도 자산 1 값을 쓴다 — 주택 · 토지 · 상가는 이번 범위 밖(확인 필요)", () => {
  /** `transfer.route.bg-land-fractional-win.anchor.test.ts`와 같은 토지 시료(시가 10억 · 실지 2.5억). */
  const land = (id: string, ...over: Record<string, unknown>[]) =>
    Object.assign({ ...makeDefaultAsset(1) }, x({
      assetId: id, addressJibun: COMMON.addressJibun, acquisitionCause: "purchase", acquisitionDate: "2015-01-01", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
      bgValuationMode: "sangjeungbeop_market", bgLendingDepositTotal: "0", bgAcquisitionMethod: "actual", bgMarketValueAtTransfer: "1000000000",
      standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000", assetKind: "land", bgActualAcquisitionLand: "250000000", landAreaM2: "100",
      landNature: "independent", companionLandNature: "independent", ...debt(600_000_000),
    }), ...over.map(x)) as AssetForm;
  const fb = (...own: Record<string, unknown>[]) =>
    form([land("p", pct(60)), land("s", pct(40), ...own)], { assetSplitMode: "fractional", contractTotalPrice: "1000000000" });
  it("토지 축 B 시가 보충 승 · 지분 2 토글 켬 + 실지 3억: 토글 끔과 같은 값", async () => {
    const off = await gainOk(fb({ bgActualAcquisitionLand: "300000000" }));
    const on = await gainOk(fb(OWN, { bgActualAcquisitionLand: "300000000" }));
    expect(on).toBe(off);
  });
});
