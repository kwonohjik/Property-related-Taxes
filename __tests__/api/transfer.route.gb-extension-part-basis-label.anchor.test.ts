/**
 * 일반건물 증축 × 파트 취득가액 — 결과 화면 취득가액 산식의 근거 문구 (2026-10-24 · #2508 후속)
 *
 * 폼 → ④ → route → 상세명세서 빌더(`buildStatementItems`) · mock 세율. 표시 echo·표시 분기만 바뀌므로 결정세액은 변경 전 실측과 같다.
 *
 * 변경 전 실측(같은 시료): 증축이 있으면 엔진 3-way 카드에 출처 echo(`actualSource`·`sec1639Basis`)가 없어 토지·건물1이 전부
 * 「사례 33 일괄 실가 안분」 분기로 떨어졌다 — 토지 「(토지+건물1) × 취득시 토지 기준시가 ÷ (토지+건물1 기준시가)」 · 건물1 「잔액 보정」.
 * 파트 값이 그대로 취득가액이면 그 식은 적힌 값을 못 만든다(600,000,000 × 205/355 = 346,478,873 ≠ 400,000,000). 환산 파트도 같은 분기로
 * 떨어졌다(토지 429,460,102 × 205/355 ≠ 229,460,102 · 건물1은 환산값에 「잔액 보정」).
 *
 * 근거 — 「소득세법 시행령」 §163⑨ 본문·단서 1호·2호 · 「소득세법」 §97①1호 가목.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { GB_SAMPLES, LAND, T, asset, form, run } from "../components/_helpers/gb-bundled-blocks-fixtures";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const INH = GB_SAMPLES.INH[0][0];
const BUY_EXT = GB_SAMPLES.EXT3[0][0];
const COMPANION = { assetSplitMode: "companion", bundledSaleMode: "actual" } as Partial<TransferFormData>;
/** 증축 2018 · 실가 5천만(매매). */
const EXT: Partial<AssetForm> = {
  gbHasExtension: true, gbExtensionDate: "2018-05-01", gbExtensionArea: "50", gbExtensionAcquisitionMode: "actual",
  gbExtensionAcquisitionCause: "purchase", gbExtensionActualAcquisitionPrice: "50000000",
  gbTransferExtensionBuildingStdPrice: "40000000", gbAcquisitionExtensionBuildingStdPrice: "30000000",
};
/** 토지 상속(1988) + 건물 매매(2010 · 실가 2억). */
const LAND_INH: Partial<AssetForm>[] = [INH, {
  hasSeperateLandAcquisitionDate: true, gbBuildingAcquisitionCause: "purchase", landAcqMode: "actual", buildingAcqMode: "actual",
  acquisitionDate: "2010-05-01", buildingAcquisitionPrice: "200000000",
}, EXT];
/** 토지 매매(2005 · 실가 4억) + 건물 상속(1988). */
const BLD_INH: Partial<AssetForm> = {
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "inheritance", hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2005-05-01", acquisitionDate: "1988-05-01", landAcqMode: "actual", buildingAcqMode: "actual",
  landAcquisitionPrice: "400000000", gbBuildingDecedentAcquisitionDate: "1970-01-01",
};

type Formulas = Record<string, string | undefined>;
async function calc(f: TransferFormData) {
  const res = await run(f);
  expect(res.status).toBe(200);
  const agg = res.aggregated;
  const items = buildStatementItems(aggregateToFilingResult(agg), f, f.assets[0], { properties: agg.properties, aggregated: agg }, undefined);
  const col = items.get("acquisitionPrice")?.perAsset ?? [];
  const acq: Formulas = {};
  agg.properties.forEach((p, i) => {
    acq[p.propertyId] = col[i]?.formula;
  });
  return { tax: agg.determinedTax, acq };
}
const single = (contract: number, ...over: Partial<AssetForm>[]) => calc(form(contract, [asset(1, ...over)]));

const INHERITED = (v: string) => `자산별 취득가액 = ${v} (상속개시일 평가액 — 소득세법 시행령 §163⑨)`;
const GIFTED = (v: string) => `자산별 취득가액 = ${v} (증여일 평가액 — 소득세법 시행령 §163⑨)`;
const ACTUAL = (v: string) => `자산별 취득가액 = ${v} (실거래가 — 소득세법 §97①1호 가목)`;
const LAND_SEC164 = (v: string) =>
  `자산별 취득가액 = ${v} (상속개시일 평가액보다 많은 소득세법 시행령 §164④ 가액 — 같은 영 §163⑨ 단서 1호)`;
const BLD_SEC164 = (v: string) =>
  `자산별 취득가액 = ${v} (상속개시일 평가액보다 많은 소득세법 시행령 §164⑤ 가액 — 같은 영 §163⑨ 단서 2호)`;
const EXT_DIRECT = (v: string) => `사용자 직접 입력 (증축 실거래가) = ${v}`;

describe("증축 × §163⑨ 상속·증여 파트", () => {
  it("🔴 전부 상속(1988) → 토지 평가액 · 건물1 단서 2호(① 1억 < ② 1.5억) · 증축분은 직접 입력 · 285,751,361 불변", async () => {
    const r1 = await single(T, INH, EXT);
    expect(r1.tax).toBe(285_751_361);
    expect(r1.acq.land).toBe(INHERITED("300,000,000"));
    expect(r1.acq.building1).toBe(BLD_SEC164("150,000,000"));
    expect(r1.acq.building2).toBe(EXT_DIRECT("50,000,000"));
  });

  it("🔴 토지 상속 + 건물 매매(실가) → 토지 평가액 · 건물1 실거래가 · 271,051,361 불변", async () => {
    const r1 = await single(T, ...LAND_INH);
    expect(r1.tax).toBe(271_051_361);
    expect(r1.acq.land).toBe(INHERITED("300,000,000"));
    expect(r1.acq.building1).toBe(ACTUAL("200,000,000"));
  });

  it("🔴 토지 매매(실가) + 건물 상속(1988) → 토지 실거래가 · 건물1 단서 2호 · 256,351,361 불변", async () => {
    const r1 = await single(T, INH, BLD_INH, EXT);
    expect(r1.tax).toBe(256_351_361);
    expect(r1.acq.land).toBe(ACTUAL("400,000,000"));
    expect(r1.acq.building1).toBe(BLD_SEC164("150,000,000"));
  });

  it("🔴 1980 상속 · ② 채택 → 토지 단서 1호 · 건물1 단서 2호 · 108,682,158 불변", async () => {
    const r1 = await single(900_000_000, INH, {
      landAcquisitionDate: "1980-05-01", acquisitionDate: "1980-05-01", publishedValueAtInheritance: "50000000",
      gbBuildingInheritedValue: "20000000", actualSalePrice: "900000000",
    }, EXT, { gbExtensionDate: "1995-05-01" });
    expect(r1.tax).toBe(108_682_158);
    expect(r1.acq.land).toBe(LAND_SEC164("205,000,000"));
    expect(r1.acq.building1).toBe(BLD_SEC164("150,000,000"));
  });

  it("🔴 토지·건물 증여 → 둘 다 「증여일 평가액」 · 241,651,361 불변", async () => {
    const r1 = await single(T, INH, {
      acquisitionCause: "gift", gbBuildingAcquisitionCause: "gift", hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: "2005-05-01", acquisitionDate: "2010-05-01", landAcqMode: "actual", buildingAcqMode: "actual",
      landAcquisitionPrice: "400000000", buildingAcquisitionPrice: "200000000", donorAcquisitionDate: "1990-01-01",
    }, EXT);
    expect(r1.tax).toBe(241_651_361);
    expect(r1.acq.land).toBe(GIFTED("400,000,000"));
    expect(r1.acq.building1).toBe(GIFTED("200,000,000"));
  });

  it("함께 양도 — 일반건물(토지 상속 + 증축) 카드도 같은 문구 · 336,571,361 불변", async () => {
    const r1 = await calc(form(T + 300_000_000, [asset(1, ...LAND_INH), asset(2, LAND)], COMPANION));
    expect(r1.tax).toBe(336_571_361);
    expect(r1.acq["land#primary"]).toBe(INHERITED("300,000,000"));
    expect(r1.acq["building1#primary"]).toBe(ACTUAL("200,000,000"));
  });

  it("지분 분할(축 B) 50/50 — 지분마다 지분 몫 문구 · 271,051,361 불변", async () => {
    const half = { ownershipNumerator: "50", ownershipDenominator: "100" };
    const r1 = await calc(form(T, [asset(1, ...LAND_INH, half), asset(2, ...LAND_INH, half)]));
    expect(r1.tax).toBe(271_051_361);
    for (const s of ["#0", "#1"]) {
      expect(r1.acq[`land${s}`]).toBe(INHERITED("150,000,000"));
      expect(r1.acq[`building1${s}`]).toBe(ACTUAL("100,000,000"));
      expect(r1.acq[`building2${s}`]).toBe(EXT_DIRECT("25,000,000"));
    }
  });
});

describe("증축 × 매매 파트 — 같은 결함(출처 echo 부재)", () => {
  it("🔴 파트 실가 → 둘 다 「실거래가」(종전 600,000,000 × 205/355 = 400,000,000 거짓 등식) · 232,543,320 불변", async () => {
    const r1 = await single(T, BUY_EXT);
    expect(r1.tax).toBe(232_543_320);
    expect(r1.acq.land).toBe(ACTUAL("400,000,000"));
    expect(r1.acq.building1).toBe(ACTUAL("200,000,000"));
  });

  it("🔴 토지 상속 + 건물 매매(환산) → 건물1은 환산식(종전 「잔액 보정」) · 279,166,456 불변", async () => {
    const r1 = await single(T, INH, {
      hasSeperateLandAcquisitionDate: true, gbBuildingAcquisitionCause: "purchase", buildingAcqMode: "estimated",
      landAcqMode: "actual", acquisitionDate: "2010-05-01",
    }, EXT);
    expect(r1.tax).toBe(279_166_456);
    expect(r1.acq.land).toBe(INHERITED("300,000,000"));
    expect(r1.acq.building1).toBe("289,984,290 × 150,000,000 / 259,072,400 = 167,897,635");
  });

  it("🔴 토지 환산 + 건물 상속 → 토지는 환산식(종전 일괄 안분 거짓 등식) · 건물1 단서 2호 · 304,681,990 불변", async () => {
    const r1 = await single(T, INH, { ...BLD_INH, landAcqMode: "estimated", landAcquisitionPrice: "" }, EXT);
    expect(r1.tax).toBe(304_681_990);
    expect(r1.acq.land).toBe("1,265,243,006 × 205,000,000 / 1,130,370,000 = 229,460,102");
    expect(r1.acq.building1).toBe(BLD_SEC164("150,000,000"));
  });

  it("증축분 환산 — 증축분은 종전 환산식 그대로 · 원건물 파트는 「실거래가」 · 239,334,544 불변", async () => {
    const r1 = await single(T, BUY_EXT, { gbExtensionAcquisitionMode: "estimated", gbExtensionActualAcquisitionPrice: "" });
    expect(r1.tax).toBe(239_334_544);
    expect(r1.acq.land).toBe(ACTUAL("400,000,000"));
    expect(r1.acq.building2).toBe("44,772,704 × 30,000,000 / 40,000,000 = 33,579,528");
  });
});

describe("대조 — 일괄 실가 안분(조합 A)은 종전 산식", () => {
  it("매매 · 분리 OFF · 일괄 6억 → 「일괄 × 취득시 기준시가 비율」 · 「잔액 보정」 그대로 · 238,676,102 불변", async () => {
    const r1 = await single(T, BUY_EXT, {
      hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "2010-05-01", landAcquisitionPrice: "", buildingAcquisitionPrice: "",
      fixedAcquisitionPrice: "600000000",
    });
    expect(r1.tax).toBe(238_676_102);
    expect(r1.acq.land).toBe("600,000,000 × 205,000,000 / (205,000,000+150,000,000) = 346,478,873");
    expect(r1.acq.building1).toBe("600,000,000 - 토지 346,478,873 = 253,521,127 (잔액 보정)");
  });
});
