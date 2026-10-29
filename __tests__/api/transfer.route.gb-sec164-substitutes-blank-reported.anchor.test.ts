/**
 * anchor — ④ 는 상속·증여 파트의 평가액이 **비면** §164 가액으로 메우지 않고 비운 채 보낸다 → ⑫ 가 400 (`compareSec164` — 계획서 `docs/00-pm/gb-sec164-substitutes-blank-reported.plan.md`)
 *
 * 「주 자산 I1」(상속 두 파트 · 평가액 비움 · 주 자산도 200) 측정의 결론:
 *   · ⑫ I1(`required-refines-gb.ts` — `bothInherited && !positive(inheritedLandValue)`)은 **고장나지 않았다.** `inheritedLandValue` 는 ④ 가 §163⑨ 단서 비교까지 마친 **최종값**이고
 *     API 가 받는 계약도 그 값이다 — 직접 보내면서 빼면 400 이다(SU-4).
 *   · 우회는 ④ `transfer-tax-api-gb-sec163-9.ts:95-101` 에서 생긴다: 단서 구간(토지 1990.8.30. 전 · 건물 취득연도 2000/2001 전)이면 `Math.max(평가액, §164 가액)` 인데
 *     평가액이 0 이어도 §164 가액이 양수라 **비교가 성립하지 않는 입력을 한쪽 값으로 메운다**(증여 `giftMax` 도 같다). ⑧ 은 이 입력을 막지만(`validate-gb.ts` V3·V4 · 증여 파트 칸) ⑫ 에서는 사라진다.
 *   · 단서 구간 밖(고시 후)은 400 — 상속일에 따라 I1 이 작동한다(SU-1).
 * 수정 전(PR #2724 시점): 아래 비운 셀은 ⑧ 차단 · ⑫ 200 · 평가액을 입력한 대조 세액과 **달랐다**(상속 72셀 중 200 42·세액 이탈 24 · 증여 36셀 중 200 21·전부 이탈) — 주석의 `수정 전` 값.
 * 수정 후: 비운 셀은 전부 400, 평가액을 입력한 대조 셀은 ⑧ 통과 · 200 · 세액 불변(⑧ 통과 입력의 값은 바뀌지 않는다).
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
  acquisitionDate: "2010-05-01", useEstimatedAcquisition: false,
};
const gbAsset = (id: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, BASE, ...over) as AssetForm;
const landAsset = (id: number) =>
  ({
    ...makeDefaultAsset(id), addressJibun: "서울 강남구 테스트동 2-2", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2012-01-01",
    acquisitionArea: "100", transferArea: "100", landNature: "standalone", standardPriceAtAcq: "100000000", standardPriceAtTransfer: "200000000",
    actualSalePrice: "400000000", fixedAcquisitionPrice: "100000000",
  }) as unknown as AssetForm;
const bundle = (assets: AssetForm[]): TransferFormData => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", assets, assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "2000000000" });
  return f as unknown as TransferFormData;
};
type Role = "컴패니언" | "주 자산";
const form = (role: Role, over: Partial<AssetForm>, bg = false) => {
  const gb = gbAsset(role === "컴패니언" ? 2 : 1, over);
  const other = bg ? gbAsset(role === "컴패니언" ? 1 : 2, over) : landAsset(role === "컴패니언" ? 1 : 2);
  return bundle(role === "컴패니언" ? [other, gb] : [gb, other]);
};
const post = async (b: unknown) => {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(b) }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await res.json()) as any;
  return { status: res.status, tax: res.status === 200 ? (j.data.aggregated.calculatedTax as number) : undefined };
};


const single = (over: Partial<AssetForm>) => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", contractTotalPrice: "1600000000", assets: [gbAsset(1, over)] });
  return f as unknown as TransferFormData;
};
const ROLES3 = ["컴패니언", "주 자산", "단건"] as const;
const formOf = (role: (typeof ROLES3)[number], over: Partial<AssetForm>) => (role === "단건" ? single(over) : form(role, over));
async function go(role: (typeof ROLES3)[number], over: Partial<AssetForm>) {
  const f = formOf(role, over);
  const r = await post(await captureBody(f));
  return { blocked8: allIssues(f).length > 0, ...r };
}
const INH = (d: string, sep: boolean): Partial<AssetForm> => ({
  acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", landAcquisitionDate: d, acquisitionDate: d, decedentAcquisitionDate: "1960-01-01",
  publishedValueAtInheritance: "300000000", gbBuildingInheritedValue: "100000000", hasSeperateLandAcquisitionDate: sep,
  ...(sep ? { landAcqMode: "actual", buildingAcqMode: "actual" } : {}),
} as Partial<AssetForm>);
const GIFT = (d: string): Partial<AssetForm> => ({
  acquisitionCause: "gift", gbBuildingAcquisitionCause: "gift", landAcquisitionDate: d, acquisitionDate: d, hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual",
  landAcquisitionPrice: "400000000", buildingAcquisitionPrice: "200000000",
} as Partial<AssetForm>);
const DATES = ["1980-05-01", "1988-05-01", "1995-05-01", "2005-05-01"];
const INH_BLANKS: [string, Partial<AssetForm>][] = [["토지", { publishedValueAtInheritance: "" }], ["건물", { gbBuildingInheritedValue: "" }], ["둘 다", { publishedValueAtInheritance: "", gbBuildingInheritedValue: "" }]];
const GIFT_BLANKS: [string, Partial<AssetForm>][] = [["토지", { landAcquisitionPrice: "" }], ["건물", { buildingAcquisitionPrice: "" }], ["둘 다", { landAcquisitionPrice: "", buildingAcquisitionPrice: "" }]];

describe("SU-1 상속 두 파트 · 평가액 비움 — 상속일과 무관하게 전부 400 (72셀)", () => {
  it("⑧ 은 전부 막고 ⑫ 도 전부 400 (수정 전: 200 42셀 · 세액 이탈 24셀), 대조(평가액 입력)는 ⑧ 통과 · 200", async () => {
    let n = 0; let unblocked = 0; const not400: string[] = [];
    for (const d of DATES) for (const sep of [false, true]) for (const [bn, bp] of INH_BLANKS) for (const role of ROLES3) {
      const r = await go(role, { ...INH(d, sep), ...bp });
      const c = await go(role, INH(d, sep));
      n++; if (!r.blocked8) unblocked++;
      expect([c.blocked8, c.status]).toEqual([false, 200]); // 대조(평가액 입력)는 ⑧ 통과 · 200
      if (r.status !== 400) not400.push(`${d}|${sep}|${bn}|${role}`);
    }
    expect([n, unblocked, not400]).toEqual([72, 0, []]);
  }, 120_000);
  it.each([
    ["1988 토지 비움 · 분리 OFF", INH("1988-05-01", false), { publishedValueAtInheritance: "" }, { 컴패니언: [422_310_000, 392_385_000], "주 자산": [422_310_000, 392_385_000], 단건: [329_040_000, 301_110_000] }],
    ["1980 토지 비움 · 분리 OFF", INH("1980-05-01", false), { publishedValueAtInheritance: "" }, { 컴패니언: [402_009_169, 383_824_038], "주 자산": [402_009_169, 383_824_038], 단건: [310_092_558, 293_104_038] }],
  ] as [string, Partial<AssetForm>, Partial<AssetForm>, Record<string, [number, number]>][])("대표 세액 — %s: 비움 400 (수정 전 세액은 want[0]) · 대조 세액 불변", async (_n, base, blank, want) => {
    for (const role of ROLES3) {
      const r = await go(role, { ...base, ...blank });
      const c = await go(role, base);
      expect(want[role][0]).toBeGreaterThan(want[role][1]); // 수정 전 침묵 세액 > 평가액 입력 세액
      expect([role, r.status, r.tax, c.tax]).toEqual([role, 400, undefined, want[role][1]]);
    }
  });
});

describe("SU-2 증여 두 파트 · 가액 비움 — 같은 규칙 (`compareSec164`) · 전부 400 (36셀)", () => {
  it("⑧ 은 전부 막고 ⑫ 도 전부 400 (수정 전: 200 21셀 · 전부 세액 이탈), 대조는 ⑧ 통과 · 200", async () => {
    let n = 0; let unblocked = 0; const not400: string[] = [];
    for (const d of DATES) for (const [bn, bp] of GIFT_BLANKS) for (const role of ROLES3) {
      const r = await go(role, { ...GIFT(d), ...bp });
      const c = await go(role, GIFT(d));
      n++; if (!r.blocked8) unblocked++;
      expect([c.blocked8, c.status]).toEqual([false, 200]);
      if (r.status !== 400) not400.push(`${d}|${bn}|${role}`);
    }
    expect([n, unblocked, not400]).toEqual([36, 0, []]);
  }, 120_000);
  it("대표 세액 — 1988 토지 비움: 비움 400 · 대조 세액 불변 (수정 전 비움 406,560,000 / 단건 314,340,000)", async () => {
    for (const role of ROLES3) {
      const r = await go(role, { ...GIFT("1988-05-01"), landAcquisitionPrice: "" });
      const c = await go(role, GIFT("1988-05-01"));
      expect([r.status, r.tax, c.tax]).toEqual([400, undefined, role === "단건" ? 257_010_000 : 347_730_000]);
    }
  });
});

describe("SU-3 한쪽만 상속(토지 상속 + 건물 매매) · 평가액 비움 — 상속일과 무관하게 400", () => {
  const PART = (d: string): Partial<AssetForm> => ({
    acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "purchase", landAcquisitionDate: d, acquisitionDate: "2010-05-01", decedentAcquisitionDate: "1960-01-01",
    publishedValueAtInheritance: "300000000", hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual", buildingAcquisitionPrice: "200000000",
  } as Partial<AssetForm>);
  it("1988(토지 단서) · 2005(고시 후) 모두 400 (수정 전 1988 은 200 + 세액 이탈 406,560,000 vs 377,130,000), 대조 세액 불변", async () => {
    const out: Record<string, unknown> = {};
    for (const d of ["1988-05-01", "2005-05-01"]) for (const role of ROLES3) {
      const r = await go(role, { ...PART(d), publishedValueAtInheritance: "" });
      const c = await go(role, PART(d));
      out[`${d}|${role}`] = [r.blocked8, r.status, r.tax, c.tax];
    }
    expect(out).toEqual({
      "1988-05-01|컴패니언": [true, 400, undefined, 377_130_000], "1988-05-01|주 자산": [true, 400, undefined, 377_130_000], "1988-05-01|단건": [true, 400, undefined, 286_410_000],
      "2005-05-01|컴패니언": [true, 400, undefined, 377_130_000], "2005-05-01|주 자산": [true, 400, undefined, 377_130_000], "2005-05-01|단건": [true, 400, undefined, 286_410_000],
    });
  });
});

describe("SU-4 API 계약 — `inheritedLandValue` 는 ④ 가 단서 비교까지 마친 최종값이다: 직접 보내면서 빼면 ⑫ I1 이 400 으로 막는다", () => {
  it("1988 상속(평가액 입력) 본문에서 inheritedLandValue 만 지우면 400 — 우회는 ⑫ 가 아니라 ④ 의 대체에서 생긴다", async () => {
    for (const role of ROLES3) {
      const f = formOf(role, INH("1988-05-01", false));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = (await captureBody(f)) as any;
      const tgt = role === "컴패니언" ? b.companionAssets[0] : b;
      expect(tgt.generalBuildingValuation.inheritedLandValue).toBeGreaterThan(0);
      expect((await post(b)).status).toBe(200);
      delete tgt.generalBuildingValuation.inheritedLandValue;
      expect([role, (await post(b)).status]).toEqual([role, 400]);
    }
  });
});
