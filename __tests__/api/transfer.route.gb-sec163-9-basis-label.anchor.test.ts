/**
 * 일반건물 §163⑨ 상속·증여 파트 — 결과 화면 취득가액 산식의 근거 문구 (2026-10-24)
 *
 * 폼 → ④ → route → 상세명세서 빌더(`buildStatementItems`) · mock 세율. 표시 echo만 바뀌므로 결정세액은 변경 전 실측과 같다.
 *
 * 변경 전 실측(같은 시료):
 * - 부분 상속(토지만·건물만)·증여 파트 → 「실거래가 — 소득세법 §97①1호 가목」(값은 평가액·증여 신고가액).
 * - C1 상속 · 단서 ②(영 §164 가액) 채택 → 「상속개시일 평가액 — 소득세법 시행령 §163⑨ = 150,000,000」인데 평가액은 1억이었다
 *   (적힌 이름 ≠ 적힌 값). 1980년 상속 ② 채택(토지 205,000,000 · 건물 150,000,000)도 같았다.
 *
 * 근거 — 「소득세법 시행령」 §163⑨ 본문(상속개시일·증여일 평가액을 취득당시 실지거래가액으로 본다) · 단서 1호(1990.8.30. 전 상속·증여
 * 토지 — 영 §164④ 가액과 중 많은 금액) · 2호(건물 기준시가 고시 전 — 영 §164⑤~⑦ 가액과 중 많은 금액).
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
const COMPANION = { assetSplitMode: "companion", bundledSaleMode: "actual" } as Partial<TransferFormData>;
const r = (n: string, d = "100") => ({ ownershipNumerator: n, ownershipDenominator: d });

/** 토지 상속(1988) + 건물 매매(2010 · 실가 2억). */
const LAND_INH_ACT: Partial<AssetForm> = {
  hasSeperateLandAcquisitionDate: true, gbBuildingAcquisitionCause: "purchase", landAcqMode: "actual", buildingAcqMode: "actual",
  acquisitionDate: "2010-05-01", buildingAcquisitionPrice: "200000000",
};
/** 토지 매매(2005 · 실가 4억) + 건물 상속(1988). */
const BLD_INH_ACT: Partial<AssetForm> = {
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "inheritance", hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2005-05-01", acquisitionDate: "1988-05-01", landAcqMode: "actual", buildingAcqMode: "actual",
  landAcquisitionPrice: "400000000", gbBuildingDecedentAcquisitionDate: "1970-01-01",
};
/** 토지·건물 증여(2005·2010 — 단서 구간 밖) · 증여 신고가액 4억·2억. */
const GIFT: Partial<AssetForm> = {
  acquisitionCause: "gift", gbBuildingAcquisitionCause: "gift", hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2005-05-01", acquisitionDate: "2010-05-01", landAcqMode: "actual", buildingAcqMode: "actual",
  landAcquisitionPrice: "400000000", buildingAcquisitionPrice: "200000000", donorAcquisitionDate: "1990-01-01",
};
/** 1980 상속 — ① 5천만·2천만 < ② 2.05억·1.5억, 양도가액 9억이라 ③도 ②보다 작다. */
const PRE_SEC164: Partial<AssetForm> = {
  landAcquisitionDate: "1980-05-01", acquisitionDate: "1980-05-01", publishedValueAtInheritance: "50000000",
  gbBuildingInheritedValue: "20000000", actualSalePrice: "900000000",
};
/** 1980 토지 상속(① 9억 채택) + 건물 매매(2010 · 실가 2억). */
const PRE_LAND_REPORTED: Partial<AssetForm> = {
  landAcquisitionDate: "1980-05-01", publishedValueAtInheritance: "900000000", actualSalePrice: "1620000000",
  hasSeperateLandAcquisitionDate: true, gbBuildingAcquisitionCause: "purchase", buildingAcqMode: "actual",
  acquisitionDate: "2010-05-01", buildingAcquisitionPrice: "200000000",
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
const single = (contract: number, ...over: Partial<AssetForm>[]) => calc(form(contract, [asset(1, INH, ...over)]));

const INHERITED = (v: string) => `자산별 취득가액 = ${v} (상속개시일 평가액 — 소득세법 시행령 §163⑨)`;
const GIFTED = (v: string) => `자산별 취득가액 = ${v} (증여일 평가액 — 소득세법 시행령 §163⑨)`;
const ACTUAL = (v: string) => `자산별 취득가액 = ${v} (실거래가 — 소득세법 §97①1호 가목)`;
const LAND_SEC164 = (v: string) =>
  `자산별 취득가액 = ${v} (상속개시일 평가액보다 많은 소득세법 시행령 §164④ 가액 — 같은 영 §163⑨ 단서 1호)`;
const BLD_SEC164 = (v: string) =>
  `자산별 취득가액 = ${v} (상속개시일 평가액보다 많은 소득세법 시행령 §164⑤ 가액 — 같은 영 §163⑨ 단서 2호)`;

describe("부분 상속 — 상속 파트는 §163⑨, 매매 파트는 실거래가", () => {
  it("🔴 토지 상속 + 건물 매매(실가) → 토지 「상속개시일 평가액」(종전 「실거래가」) · 결정세액 286,410,000 불변", async () => {
    const r1 = await single(T, LAND_INH_ACT);
    expect(r1.tax).toBe(286_410_000);
    expect(r1.acq.land).toBe(INHERITED("300,000,000"));
    expect(r1.acq.building).toBe(ACTUAL("200,000,000"));
  });

  it("토지 상속 + 건물 매매(환산) → 토지 「상속개시일 평가액」 · 건물은 환산 산식 그대로 · 293,104,038 불변", async () => {
    const r1 = await calc(form(T, [asset(1, ...GB_SAMPLES["INH-C2"][0])]));
    expect(r1.tax).toBe(293_104_038);
    expect(r1.acq.land).toBe(INHERITED("300,000,000"));
    expect(r1.acq.building).toBe("298,332,511 × 150,000,000 / 259,072,400 = 172,731,161");
  });

  it("🔴 건물만 상속(1988 — 단서 2호 구간) · 평가액 1억 < §164⑤ 1.5억 → 건물 단서 2호 · 토지 실거래가 · 271,710,000 불변", async () => {
    const r1 = await single(T, BLD_INH_ACT);
    expect(r1.tax).toBe(271_710_000);
    expect(r1.acq.land).toBe(ACTUAL("400,000,000"));
    expect(r1.acq.building).toBe(BLD_SEC164("150,000,000"));
  });

  it("토지 매매(환산) + 건물 상속(1988) → 건물 단서 2호 · 토지는 환산 산식", async () => {
    const r1 = await single(T, BLD_INH_ACT, { landAcqMode: "estimated", landAcquisitionPrice: "" });
    expect(r1.acq.building).toBe(BLD_SEC164("150,000,000"));
    expect(r1.acq.land).toMatch(/^[\d,]+ × [\d,]+ \/ [\d,]+ = [\d,]+$/);
  });

  it("함께 양도 — 일반건물(토지 상속) 카드도 같은 문구 · 351,930,000 불변", async () => {
    const r1 = await calc(form(T + 300_000_000, [asset(1, INH, LAND_INH_ACT), asset(2, LAND)], COMPANION));
    expect(r1.tax).toBe(351_930_000);
    expect(r1.acq["land#primary"]).toBe(INHERITED("300,000,000"));
    expect(r1.acq["building#primary"]).toBe(ACTUAL("200,000,000"));
  });

  it("지분 분할(축 B) 50/50 — 지분마다 토지 카드가 「상속개시일 평가액」(지분 몫) · 293,104,038 불변", async () => {
    const C2 = GB_SAMPLES["INH-C2"][0];
    const r1 = await calc(form(T, [asset(1, ...C2, r("50")), asset(2, ...C2, r("50"))]));
    expect(r1.tax).toBe(293_104_038);
    const lands = Object.entries(r1.acq).filter(([k]) => k.startsWith("land"));
    expect(lands).toHaveLength(2);
    for (const [, f] of lands) expect(f).toBe(INHERITED("150,000,000"));
  });
});

describe("전부 상속(C1) — 채택된 쪽을 적는다", () => {
  it("🔴 1988 상속 · 토지 ① 3억 > ② 2.05억 → 평가액 · 건물 ① 1억 < ② 1.5억 → 단서 2호(종전 「상속개시일 평가액 = 150,000,000」) · 301,110,000 불변", async () => {
    const r1 = await single(T);
    expect(r1.tax).toBe(301_110_000);
    expect(r1.acq.land).toBe(INHERITED("300,000,000"));
    expect(r1.acq.building).toBe(BLD_SEC164("150,000,000"));
  });

  it("🔴 1980 상속 · ② 채택(①·③보다 큼) → 토지 단서 1호 · 건물 단서 2호", async () => {
    const r1 = await single(900_000_000, PRE_SEC164);
    expect(r1.acq.land).toBe(LAND_SEC164("205,000,000"));
    expect(r1.acq.building).toBe(BLD_SEC164("150,000,000"));
  });

  it("동점은 ① — 건물 평가액 1.5억 = §164⑤ 1.5억 → 「상속개시일 평가액」", async () => {
    const r1 = await single(T, { gbBuildingInheritedValue: "150000000" });
    expect(r1.acq.building).toBe(INHERITED("150,000,000"));
  });

  it("1980 토지 상속 · ① 9억 채택 + 건물 매매 → 토지 평가액 · 건물 실거래가", async () => {
    const r1 = await single(1_620_000_000, PRE_LAND_REPORTED);
    expect(r1.acq.land).toBe(INHERITED("900,000,000"));
    expect(r1.acq.building).toBe(ACTUAL("200,000,000"));
  });
});

describe("증여 파트 — 증여일 평가액", () => {
  it("🔴 토지·건물 증여(단서 구간 밖) → 둘 다 「증여일 평가액」(종전 「실거래가」)", async () => {
    const r1 = await single(T, GIFT);
    expect(r1.acq.land).toBe(GIFTED("400,000,000"));
    expect(r1.acq.building).toBe(GIFTED("200,000,000"));
  });

  it("단서 구간 밖(2005 토지)이면 비교하지 않는다 — 증여 신고가액 1억 < 토지 기준시가 2.05억이어도 「증여일 평가액」 1억", async () => {
    const r1 = await single(T, GIFT, { landAcquisitionPrice: "100000000" });
    expect(r1.acq.land).toBe(GIFTED("100,000,000"));
  });

  it("토지만 증여 + 건물 매매 → 토지 「증여일 평가액」 · 건물 실거래가", async () => {
    const r1 = await single(T, GIFT, { gbBuildingAcquisitionCause: "purchase" });
    expect(r1.acq.land).toBe(GIFTED("400,000,000"));
    expect(r1.acq.building).toBe(ACTUAL("200,000,000"));
  });
});

describe("대조 — 파트 값이 그대로 취득가액이 아닌 분기는 종전 문구", () => {
  it("증여 · 분리 OFF · 숨은 토지 칸 값만 남음 → 자산 단위 신고가액 일괄 안분 산식(「증여일 평가액」 아님)", async () => {
    const r1 = await single(T, GIFT, {
      hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "2010-05-01", fixedAcquisitionPrice: "600000000", buildingAcquisitionPrice: "",
    });
    expect(r1.acq.land).not.toContain("§163⑨");
    expect(r1.acq.land).toMatch(/^600,000,000 × /);
  });
});

describe("대조 — 상속·증여가 아니면 종전 문구", () => {
  it("매매 · 파트 실가 → 둘 다 「실거래가」", async () => {
    const r1 = await calc(form(T, [asset(1, ...GB_SAMPLES["S100-act"][0])]));
    expect(r1.acq.land).toBe(ACTUAL("400,000,000"));
    expect(r1.acq.building).toBe(ACTUAL("200,000,000"));
  });
});
