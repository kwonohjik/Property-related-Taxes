/**
 * anchor — 축 B 일반건물 지분: 자산-수준 필수 입력을 지분마다 ⑫ 에서도 막는다
 * (계획서 `docs/00-pm/gb-share-required-refines-parity.plan.md` · 선행 `gb-gift-off-sec164-unsplit.plan.md` §6 V-1)
 *
 * `refineGbPropertyRequired`(I1·I3·X1·Z4·Z5·C1~C4 · §163⑨ 단서 파트 가액)는 주 자산(첫 지분)·컴패니언에만 걸리고 지분 배열은 파트 수준만 검사했다.
 * 둘째 지분만 고시 전 증여·일괄 신고가액(분리 OFF)이거나 취득가액을 비우면 ⑧ 은 막는데 ⑫ 는 200 이었다(48칸 중 16칸).
 * 수정 전 침묵 세액(API 직접 호출) — 1988 P=284,000,000: 329,451,600(오라클 321,102,000 · +8,349,600) · P=213,000,000: 337,801,200(+16,699,200)
 * · 1995 P=284,000,000: 329,451,600(오라클 325,923,600 · +3,528,000) · 취득가액 빈칸: 취득가액 0 으로 200.
 *
 * | # | 주장 |
 * |---|---|
 * | SR-1 ★ | 48칸 격자 — ⑧ 차단 40칸 ⇔ ⑫ 400 · ⑧ 통과 8칸 ⇔ 200 (수정 전 ⑧ 차단·⑫ 200 16칸) |
 * | SR-2 ★ | 판별 시료 — 둘째 지분 분리 OFF 400 · 오라클(분리 ON) 200 세액 불변 |
 * | SR-3 | 둘째 지분 취득가액 빈칸(2005 증여) → 400 · 이슈 경로 `generalBuildingShares.1.acquisitionPrice` |
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

const BASE: Partial<AssetForm> = {
  assetKind: "general_building", addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential", gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", actualSalePrice: "1600000000",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false,
  acquisitionDate: "2010-05-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "400000000",
};
type Cause = "gift" | "purchase";
const OFF = (d: string, land: Cause, bld: Cause, price: string) =>
  ({ acquisitionCause: land, gbBuildingAcquisitionCause: bld, landAcquisitionDate: d, acquisitionDate: d, hasSeperateLandAcquisitionDate: false, fixedAcquisitionPrice: price }) as Partial<AssetForm>;
/** 오라클 — 같은 일괄 신고가액을 기준시가 비율 205:150 으로 나눈 분리 ON(파트별 §164 비교). */
const ON = (d: string, lp: string, bp: string) =>
  ({ acquisitionCause: "gift", gbBuildingAcquisitionCause: "gift", landAcquisitionDate: d, acquisitionDate: d, hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: lp, buildingAcquisitionPrice: bp }) as Partial<AssetForm>;
const share = (n: number, num: string, ...over: Partial<AssetForm>[]) =>
  Object.assign({ ...makeDefaultAsset(n) }, BASE, { ownershipNumerator: num, ownershipDenominator: "100" }, ...over) as AssetForm;
/** 지분 60(첫 지분) / 40(둘째 지분) */
const frac = (a: Partial<AssetForm>, b: Partial<AssetForm>) => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", contractTotalPrice: "1600000000", assetSplitMode: "fractional", assets: [share(1, "60", a), share(2, "40", b)] });
  return f as unknown as TransferFormData;
};
const post = async (b: unknown) => {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(b) }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  return {
    status: res.status,
    tax: res.status === 200 ? (j.data.aggregated.calculatedTax as number) : undefined,
    keys: res.status === 400 ? Object.keys(j.error?.fieldErrors ?? {}) : [],
  };
};
async function go(f: TransferFormData) {
  return { blocked8: allIssues(f).length > 0, ...(await post(await captureBody(f))) };
}
const DATES = ["1980-05-01", "1988-05-01", "1995-05-01", "2005-05-01"];
const COMBOS: [Cause, Cause][] = [["gift", "gift"], ["gift", "purchase"], ["purchase", "gift"]];

describe("SR-1 격자 — 증여일 4 × 구성 3 × 일괄 신고가액 입력·비움 × 증여 지분(둘 다·둘째만)", () => {
  it("⑧ 차단 40칸 ⇔ ⑫ 400 · ⑧ 통과 8칸 ⇔ 200 (수정 전 「둘째만」 16칸이 ⑧ 차단·⑫ 200)", async () => {
    const tally: Record<string, number> = {};
    const mismatch: string[] = [];
    for (const d of DATES) for (const [l, b] of COMBOS) for (const price of ["240000000", ""]) for (const both of [true, false]) {
      const g = OFF(d, l, b, price);
      const r = await go(both ? frac(g, g) : frac({}, g));
      const k = `${r.blocked8 ? "차단" : "통과"}|${r.status}`;
      tally[k] = (tally[k] ?? 0) + 1;
      if (r.blocked8 === (r.status === 200)) mismatch.push(`${d}|${l}/${b}|${price || "빈"}|${both ? "둘 다" : "둘째만"}`);
    }
    expect(mismatch).toEqual([]);
    expect(tally).toEqual({ "차단|400": 40, "통과|200": 8 });
  }, 180_000);
});

describe("SR-2 판별 시료 — 둘째 지분만 증여 · 일괄 신고가액 P", () => {
  const CASES: [string, string, string, string, number][] = [
    ["1988-05-01", "355000000", "205000000", "150000000", 321_102_000],
    ["1988-05-01", "284000000", "164000000", "120000000", 321_102_000],
    ["1988-05-01", "213000000", "123000000", "90000000", 321_102_000],
    ["1995-05-01", "284000000", "164000000", "120000000", 325_923_600],
  ];
  it.each(CASES)("%s P=%s — 분리 OFF 400 · 오라클 200", async (d, P, lp, bp, oracle) => {
    const off = await go(frac({}, OFF(d, "gift", "gift", P)));
    expect([off.blocked8, off.status]).toEqual([true, 400]);
    expect(off.keys.some((k) => k.startsWith("generalBuildingShares.1.valuation."))).toBe(true);
    const on = await go(frac({}, ON(d, lp, bp)));
    expect([on.blocked8, on.status, on.tax]).toEqual([false, 200, oracle]);
  });
});

describe("SR-3 둘째 지분 취득가액 빈칸", () => {
  it("2005 증여(단서 밖) · 일괄 신고가액 비움 → ⑧ 차단 · ⑫ 400 (수정 전 취득가액 0 으로 200)", async () => {
    const r = await go(frac({}, OFF("2005-05-01", "gift", "gift", "")));
    expect([r.blocked8, r.status]).toEqual([true, 400]);
    expect(r.keys).toContain("generalBuildingShares.1.acquisitionPrice");
  });
  it("대조 — 두 지분 매매 2010 정상 입력은 200 · 315,810,000", async () => {
    const r = await go(frac({}, {}));
    expect([r.blocked8, r.status, r.tax]).toEqual([false, 200, 315_810_000]);
  });
});
