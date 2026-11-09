/**
 * 일반건물 이월과세(§97의2 · 증여자 취득가액 환산) × 지분 — 카드 개산공제(소령 §163⑥) base를 지분분으로.
 * 계획서 `docs/00-pm/gb-carryover-estimated-share-lump-deduction.plan.md` (Q-1 a · Q-2 (다) · Q-3 a).
 *
 * 종전: 그 카드의 개산공제가 물건 전체 기준시가 × 3%(3,000,000) 그대로였다 — 지분 50% 산출세액이 대조보다 409,500 작았다(축 B 60/40 −889,200).
 * 지금: `lumpSumDeductionOwnershipRatio`(개산공제 전용 키)로 50% 1,500,000 · 30% 900,000. 분자 · 분모(기준시가)는 100% 그대로다 —
 * 줄이면 증여자 증축 가산세(§114의2) base 분모만 줄어 가산세가 두 배가 된다(P-1이 그 회귀를 잡는다).
 *
 * 화면 경로 그대로 — 폼 → ⑧(`allIssues`) → ④(`captureBody`) → ⑫~⑭(route POST). mock 세율.
 * 대조: 같은 몫을 100% 소유로 입력(금액 · 면적 · 기준시가 × 지분율). 축 B는 100% 단건. 양도 2026-03-01.
 */
import { describe, expect, it, vi } from "vitest";
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
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type P = Partial<AssetForm>;
const S = (n: number, s: number) => String(Math.round(n * s));
const AREA = (n: number, s: number) => String(Math.round(n * s * 100) / 100);

/** 이월과세 서브폼 — 증여 2024-05-01 · 증여자 취득 2015 · 증여자 취득시 기준시가 1억(환산 일반). `ext` = 증여자 증축 85.01㎡(가산세 대상). */
const carryover = (s: number, ext = false) => ({
  ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", giftDateValuation: S(800_000_000, s),
  useEstimatedAcquisition: true, estimationMode: "general", donorStandardPriceAtAcquisition: S(100_000_000, s),
  donorBuilt: ext, ...(ext ? { donorBuiltType: "extension", donorBuiltDate: "2022-01-10", donorBuiltExtensionArea: "85.01", donorBuiltExtensionStdPrice: S(50_000_000, s) } : {}),
});
/** 일반건물 10억 · 토지 100㎡ · 건물 200㎡ · 토지 매매 환산 + 건물 이월과세(환산). */
const BLD = (s: number, ext = false): P => ({
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "carryover_gift",
  acquisitionDate: "2024-05-01", useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated",
  gbLandArea: AREA(100, s), gbBuildingArea: AREA(200, s), gbBuildingFootprintArea: AREA(50, s), gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: S(200_000_000, s),
  gbZoneType: "general_residential", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: S(100_000_000, s), actualSalePrice: S(1_000_000_000, s), standardPriceAtTransfer: S(400_000_000, s),
  buildingCarryover: carryover(s, ext) as never, ownershipNumerator: "100", ownershipDenominator: "100",
});
/** 토지 파트 이월과세(환산) + 건물 매매 환산. */
const LND = (s: number): P => ({ ...BLD(s), acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "purchase", buildingCarryover: undefined, carryover: carryover(s) as never });
/** 실가 경로(`actualPriceMode`) — 두 파트 실가 모드 · 토지 매매 실가(분리 ON) + 건물 이월과세(증여자 취득가액 환산). */
const ACTUAL = (s: number): P => ({ ...BLD(s), landAcqMode: "actual", buildingAcqMode: "actual", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-05-01",
  landAcquisitionPrice: S(150_000_000, s), buildingAcquisitionPrice: S(200_000_000, s), useEstimatedAcquisition: false });
/** 증축(3-way) — 증축분 자가증축 환산 + 건물 이월과세(환산). */
const EXT3 = (s: number): P => ({ ...BLD(s), gbHasExtension: true, gbExtensionDate: "2025-01-01", gbExtensionArea: AREA(50, s), gbExtensionAcquisitionMode: "estimated",
  gbExtensionAcquisitionCause: "newConstruction", gbTransferExtensionBuildingStdPrice: S(40_000_000, s), gbAcquisitionExtensionBuildingStdPrice: S(30_000_000, s) });
const LAND: P = { assetKind: "land", addressJibun: "강원 홍천군 테스트리 1", acquisitionArea: "300", transferArea: "300", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  fixedAcquisitionPrice: "100000000", standardPriceAtTransfer: "150000000", actualSalePrice: "300000000", landNature: "standalone" };

const asset = (n: number, ...over: P[]) => Object.assign({ ...makeDefaultAsset(n) }, ...over) as AssetForm;
const SH = (n: number, third = true) => ({ ownershipNumerator: String(n), ownershipDenominator: "100", ...(third ? { ownershipRemainderThirdParty: "yes" } : {}) }) as P;
const COMPANION = { assetSplitMode: "companion", bundledSaleMode: "actual" } as Partial<TransferFormData>;
function form(contract: number, assets: AssetForm[], extra: Partial<TransferFormData> = {}): TransferFormData {
  const f = newForm();
  f.transferDate = "2026-03-01";
  f.filingDate = "2026-05-31";
  f.contractTotalPrice = String(contract);
  f.householdHousingCount = "2";
  f.isOneHousehold = false;
  f.assets = assets;
  return Object.assign(f, extra);
}
async function run(f: TransferFormData) {
  const issues = allIssues(f);
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  const j = (await res.json()) as Loose;
  const a = (j.data?.aggregated ?? {}) as Loose;
  const props = (a.properties ?? []) as Loose[];
  /** 파트 카드 필요경비(이월과세 카드 = 개산공제) — id 접두로 고른다. */
  const exp = (part: "land" | "building") => props.filter((p) => String(p.propertyId).startsWith(`${part}#`) || p.propertyId === part).map((p) => p.necessaryExpense as number);
  return { issues, status: res.status, err: res.status === 200 ? "" : JSON.stringify(j.error).slice(0, 200), tax: a.calculatedTax as number, gain: a.totalTransferGain as number, penalty: (a.penaltyTax ?? 0) as number, exp };
}
const ok = (r: Awaited<ReturnType<typeof run>>) => {
  expect(r.issues, "⑧").toEqual([]);
  expect(r.status, `⑫ ${r.err}`).toBe(200);
  return r;
};

type Path = [string, (k: (s: number) => P) => Promise<{ share: Awaited<ReturnType<typeof run>>; ref: Awaited<ReturnType<typeof run>> }>, number[]];
/** [경로, 계산, 이월과세 파트 카드 개산공제(지분 카드 순)] */
const PATHS: Path[] = [
  ["축 A 50%", async (k) => ({ share: await run(form(1e9, [asset(1, k(1), SH(50))])), ref: await run(form(5e8, [asset(1, k(0.5))])) }), [1_500_000]],
  ["축 A 30%", async (k) => ({ share: await run(form(1e9, [asset(1, k(1), SH(30))])), ref: await run(form(3e8, [asset(1, k(0.3))])) }), [900_000]],
  ["함께 양도 50%", async (k) => ({
    share: await run(form(8e8, [asset(1, LAND), asset(2, k(1), SH(50))], COMPANION)),
    ref: await run(form(8e8, [asset(1, LAND), asset(2, k(0.5))], COMPANION)),
  }), [1_500_000]],
  ["축 B 60/40", async (k) => ({
    share: await run(form(1e9, [asset(1, k(1), SH(60, false)), asset(2, k(1), SH(40, false))], { assetSplitMode: "fractional" })),
    ref: await run(form(1e9, [asset(1, k(1))])),
  }), [1_800_000, 1_200_000]],
];

describe.each([
  ["건물 파트 이월과세(환산)", BLD, "building"],
  ["토지 파트 이월과세(환산)", LND, "land"],
] as [string, (s: number) => P, "land" | "building"][])("%s × 지분 — 개산공제 = 증여자 취득시 기준시가 1억 × 3% × 지분율", (_n, kind, part) => {
  it.each(PATHS)("%s — ⑧ 0건 · ⑫ 200 · 세액 · 양도차익 = 대조 · 카드 개산공제 %j", async (_p, calc, lump) => {
    const { share, ref } = await calc(kind);
    ok(share);
    ok(ref);
    expect(share.tax, "산출세액 = 대조").toBe(ref.tax);
    expect(share.gain, "양도차익 = 대조").toBe(ref.gain);
    expect(share.exp(part), "이월과세 카드 개산공제").toEqual(lump);
  });
});

describe("고정값 — 종전 값과의 차이를 숫자로 남긴다", () => {
  it("건물 파트 · 축 A 50% 66,675,500(종전 66,266,000) · 축 B 60/40 151,070,800 = 100% 단건(종전 150,181,600)", async () => {
    expect(ok(await run(form(1e9, [asset(1, BLD(1), SH(50))]))).tax).toBe(66_675_500);
    expect(ok(await run(form(1e9, [asset(1, BLD(1), SH(60, false)), asset(2, BLD(1), SH(40, false))], { assetSplitMode: "fractional" }))).tax).toBe(151_070_800);
  });
  it("실가 경로(두 파트 실가 모드 · 건물 이월과세 환산) — 축 A 50% 68,915,400 · 함께 양도 50% = 대조 · 축 B 60/40 162,124,000 = 100% 단건(종전 161,188,000)", async () => {
    const share = ok(await run(form(1e9, [asset(1, ACTUAL(1), SH(50))])));
    expect(share.tax).toBe(ok(await run(form(5e8, [asset(1, ACTUAL(0.5))]))).tax);
    expect(share.tax).toBe(68_915_400);
    expect(share.exp("building")).toEqual([1_500_000]);
    const comp = ok(await run(form(8e8, [asset(1, LAND), asset(2, ACTUAL(1), SH(50))], COMPANION)));
    expect(comp.tax).toBe(ok(await run(form(8e8, [asset(1, LAND), asset(2, ACTUAL(0.5))], COMPANION))).tax);
    expect(comp.exp("building")).toEqual([1_500_000]);
    const axisB = ok(await run(form(1e9, [asset(1, ACTUAL(1), SH(60, false)), asset(2, ACTUAL(1), SH(40, false))], { assetSplitMode: "fractional" })));
    expect(axisB.tax).toBe(ok(await run(form(1e9, [asset(1, ACTUAL(1))]))).tax);
    expect(axisB.tax).toBe(162_124_000);
    expect(axisB.exp("building")).toEqual([1_800_000, 1_200_000]);
  });
  it("증축(3-way) + 건물 이월과세 환산 축 A 50% 63,451,927 = 대조(종전 63,171,127)", async () => {
    const share = ok(await run(form(1e9, [asset(1, EXT3(1), SH(50))])));
    expect(share.tax).toBe(ok(await run(form(5e8, [asset(1, EXT3(0.5))]))).tax);
    expect(share.tax).toBe(63_451_927);
  });
});

describe("P-1 증여자 증축 가산세(§114의2) — 지분율만큼(분모를 줄이는 수정은 이것을 두 배로 만든다)", () => {
  it("100% 6,250,000 · 축 A 50% 3,125,000 · 축 B 60/40 합 6,250,000", async () => {
    expect(ok(await run(form(1e9, [asset(1, BLD(1, true))]))).penalty).toBe(6_250_000);
    expect(ok(await run(form(1e9, [asset(1, BLD(1, true), SH(50))]))).penalty).toBe(3_125_000);
    expect(ok(await run(form(1e9, [asset(1, BLD(1, true), SH(60, false)), asset(2, BLD(1, true), SH(40, false))], { assetSplitMode: "fractional" }))).penalty).toBe(6_250_000);
  });
});
