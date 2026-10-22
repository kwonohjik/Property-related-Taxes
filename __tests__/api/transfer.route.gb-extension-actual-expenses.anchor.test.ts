/**
 * 일반건물 증축 × 실가 계열 파트 — 자본적지출·양도비 소실 수정 (E-1 · 2026-10-22)
 *
 * 계획서: `docs/00-pm/gb-extension-actual-expenses.plan.md` (Q-1~Q-8 확정). 폼 → ⑧ → ④ → ⑫ → ⑭ 전 구간 · mock 세율.
 *
 * 종전(⑧ 통과): 증축 자산은 실가여도 3-way 엔진으로 가는데, 파트 가격으로 대체된 파트의 경비를 엔진이 덮어쓰고, 파트 칸이
 * 비면 swap 자산총액 판정이 실가 카드에 가산하지 않아 자본적지출·양도비가 사라졌다. 양도비는 일괄 슬롯·나목 두 경로였다.
 * 수정: ④ 일괄 슬롯 사슬에서 양도비 제거(나목 단일 경로) · ⑭ 증축 × 두 파트 실가면 파트 축 + 자산 단위 자본적지출 취득시 안분 ·
 * swap 실가 그룹 가산은 실가 카드에만(Q-8) · ⑧ 이전 형식 필요경비 × 파트 가격 대체 차단(Q-5).
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
import { gbExtensionLegacyExpenseUnused } from "@/lib/calc/gb-extension-legacy-expense";
import { buildGbExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementGbFormulas";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const T = 1_600_000_000;
const BASE: Partial<AssetForm> = {
  assetKind: "general_building",
  addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000",
  gbAcqBuildingValue: "150000000",
  gbLandArea: "205",
  gbBuildingArea: "300",
  gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "5514000",
  gbTransferBuildingValue: "259072400",
  actualSalePrice: String(T),
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  gbHasExtension: true,
  gbExtensionDate: "2018-05-01",
  gbExtensionArea: "50",
};
/** 증축분 실가(매매) / 환산(자가증축). */
const EXT_ACTUAL = {
  gbExtensionAcquisitionMode: "actual", gbExtensionAcquisitionCause: "purchase", gbExtensionActualAcquisitionPrice: "50000000",
  gbTransferExtensionBuildingStdPrice: "40000000", gbAcquisitionExtensionBuildingStdPrice: "30000000",
} as Partial<AssetForm>;
const EXT_ESTIMATED = {
  gbExtensionAcquisitionMode: "estimated", gbExtensionAcquisitionCause: "newConstruction",
  gbTransferExtensionBuildingStdPrice: "40000000", gbAcquisitionExtensionBuildingStdPrice: "30000000",
} as Partial<AssetForm>;
const ACQ = {
  /** 매매 · 분리 OFF · 토지+원건물 일괄 실가 6억 */
  buyOff: { acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "2005-05-01", acquisitionDate: "2005-05-01", fixedAcquisitionPrice: "600000000" },
  /** 매매 · 분리 ON · 토지 4억 · 건물 2억 */
  buyOn: { acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2005-05-01", acquisitionDate: "2010-05-01", landAcquisitionPrice: "400000000", buildingAcquisitionPrice: "200000000" },
  /** 토지·건물 모두 상속(C1) · 분리 OFF */
  c1Off: { acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "1995-05-01", acquisitionDate: "1995-05-01", decedentAcquisitionDate: "1970-01-01", publishedValueAtInheritance: "300000000", gbBuildingInheritedValue: "200000000" },
  /** C1 · 분리 ON */
  c1On: { acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "1988-05-01", acquisitionDate: "1995-05-01", decedentAcquisitionDate: "1970-01-01", publishedValueAtInheritance: "300000000", gbBuildingInheritedValue: "200000000" },
} satisfies Record<string, Partial<AssetForm>>;
const CAPEX = { capitalExpenditure: "20000000" } as Partial<AssetForm>;
const TX = { transferExpense: "10000000" } as Partial<AssetForm>;
const PART = { landDirectExpenses: "30000000", buildingDirectExpenses: "20000000" } as Partial<AssetForm>;
const BUNDLED = { gbBundledAcquisitionExpenses: "15000000" } as Partial<AssetForm>;
const LEGACY = { directExpenses: "12000000" } as Partial<AssetForm>;

const asset = (...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(1) }, BASE, ...over) as AssetForm;
function form(a: AssetForm): TransferFormData {
  const f = newForm();
  f.transferDate = "2026-02-16";
  f.filingDate = "2026-05-31";
  f.contractTotalPrice = String(T);
  f.assets = [a];
  return f;
}

type Prop = { propertyId: string; necessaryExpense: number };
async function run(a: AssetForm) {
  const f = form(a);
  const issues = allIssues(f);
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(await captureBody(f)),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  const props = json.data.aggregated.properties as Prop[];
  const exp = (id: string) => props.find((p) => p.propertyId === id)!.necessaryExpense;
  const gbd = json.data.aggregated.generalBuildingValuationDetail;
  /** ⑦ 상세명세서 «자산별 필요경비» 산식 — 카드 값을 그대로 넘긴다. */
  const formula = (id: string) =>
    buildGbExpenseFormula({ propertyId: id, necessaryExpense: exp(id), capitalExpenditureForDisplay: 0 } as never, gbd);
  return {
    formula,
    issues,
    tax: json.data.aggregated.calculatedTax as number,
    sum: props.reduce((s, p) => s + p.necessaryExpense, 0),
    land: exp("land"),
    b1: exp("building1"),
    b2: exp("building2"),
  };
}
const ok = async (a: AssetForm) => {
  const r = await run(a);
  expect(r.issues).toEqual([]);
  return r;
};

describe("🔴 사라지던 셀 — 입력한 자본적지출·양도비가 필요경비에 전부 들어간다 (증축분 실가)", () => {
  it("매매 분리 OFF · 자산 단위 자본적지출 2천만 → 토지·원건물 취득시 기준시가 안분 + 건물 그룹 안 양도가액 비례 (종전 0)", async () => {
    const r = await ok(asset(EXT_ACTUAL, ACQ.buyOff, CAPEX));
    expect(r.sum).toBe(20_000_000);
    expect([r.land, r.b1, r.b2]).toEqual([11_549_295, 7_320_449, 1_130_256]);
    expect(r.tax).toBe(235_628_948);
  });

  it("매매 분리 ON · 양도비 1천만 (종전 0)", async () => {
    const r = await ok(asset(EXT_ACTUAL, ACQ.buyOn, TX));
    expect(r.sum).toBe(10_000_000);
    expect(r.tax).toBe(238_676_102);
  });

  it("C1 분리 OFF · 자본적지출 + 양도비 (종전 0) · ⑦ 산식은 가산분을 §97②1호로 적는다", async () => {
    const r = await ok(asset(EXT_ACTUAL, ACQ.c1Off, CAPEX, TX));
    expect(r.sum).toBe(30_000_000);
    expect(r.tax).toBe(262_053_690);
    expect(r.formula("land")).toBe(`자본적지출·양도비 안분 = ${r.land.toLocaleString()} (§97②1호 — 실지거래가액 파트 가산)`);
    // 증축분 — 종전 문구 「사용자 직접 입력 (증축 실제 필요경비)」는 사용자가 넣지 않은 값을 그렇게 불렀다.
    expect(r.formula("building2")).toBe(`자본적지출·양도비 안분 = ${r.b2.toLocaleString()} (§97②1호 — 실지거래가액 파트 가산)`);
  });

  it("⑦ 자기 경비 + 가산분 — 일괄 취득 필요경비 안분과 안분 가산을 나눠 적고 합이 카드 값이다", async () => {
    const r = await ok(asset(EXT_ACTUAL, ACQ.buyOff, BUNDLED, TX));
    expect(r.formula("land")).toMatch(/^일괄 취득 필요경비 안분 [\d,]+ \+ 자본적지출·양도비 안분 [\d,]+ = [\d,]+ \(§97②1호\)$/);
    const [own, add, total] = r.formula("land")!.match(/[\d,]{3,}/g)!.map((x) => Number(x.replace(/,/g, "")));
    expect(own + add).toBe(total);
    expect(total).toBe(r.land);
  });

  it("C1 분리 ON · 양도비 (종전 0)", async () => {
    const r = await ok(asset(EXT_ACTUAL, ACQ.c1On, TX));
    expect(r.sum).toBe(10_000_000);
    expect(r.tax).toBe(268_076_102);
  });

  it("양도비 몫은 증축분(실가)도 받는다 — 토지·원건물·증축분 양도가액 비례 (Q-2 a)", async () => {
    const r = await ok(asset(EXT_ACTUAL, ACQ.buyOff, TX));
    expect([r.land, r.b1, r.b2]).toEqual([7_907_768, 1_812_402, 279_830]);
  });
});

describe("이중계상 없음 — 양도비는 한 경로로만", () => {
  it("매매 분리 OFF · 일괄 취득 필요경비 1.5천만 + 양도비 1천만 = 2.5천만 (종전 양도비 소실 1.5천만)", async () => {
    const r = await ok(asset(EXT_ACTUAL, ACQ.buyOff, BUNDLED, TX));
    expect(r.sum).toBe(25_000_000);
    expect(r.tax).toBe(234_266_102);
  });

  it("일괄 필요경비 + 자본적지출 + 양도비 = 4.5천만", async () => {
    const r = await ok(asset(EXT_ACTUAL, ACQ.buyOff, BUNDLED, CAPEX, TX));
    expect(r.sum).toBe(45_000_000);
  });
});

describe("회귀 0 — 종전에도 맞던 셀은 값이 그대로다", () => {
  it.each([
    ["없음", [ACQ.buyOff], 241_651_361],
    ["매매 분리 ON · 파트 칸", [ACQ.buyOn, PART], 226_614_319],
    ["매매 분리 ON · 파트 칸 + 양도비", [ACQ.buyOn, PART, TX], 223_639_060],
    ["C1 분리 ON · 파트 칸 + 양도비", [ACQ.c1On, PART, TX], 253_039_060],
    ["매매 분리 OFF · 일괄 취득 필요경비", [ACQ.buyOff, BUNDLED], 237_241_361],
    ["매매 분리 OFF · 이전 입력 형식 필요경비", [ACQ.buyOff, LEGACY], 238_123_361],
  ] as const)("%s", async (_n, over, tax) => {
    const r = await ok(asset(EXT_ACTUAL, ...over));
    expect(r.tax).toBe(tax);
  });
});

describe("증축분 환산 — 실가 그룹 가산은 실가 카드에만 (Q-7 a · Q-8 a)", () => {
  it("매매 분리 ON · 파트 칸 → 건물 자본적지출 2천만은 원건물로 · 증축분은 개산공제만 (종전 증축분에 2,674,938 가산)", async () => {
    const r = await ok(asset(EXT_ESTIMATED, ACQ.buyOn, PART));
    expect([r.b1, r.b2]).toEqual([20_000_000, 900_000]);
    expect(r.tax).toBe(232_864_720);
  });

  it("매매 분리 OFF · 자산 단위 자본적지출 + 양도비 → 실가 파트에 가산 · 증축분 개산공제만", async () => {
    const r = await ok(asset(EXT_ESTIMATED, ACQ.buyOff, CAPEX, TX));
    expect(r.b2).toBe(900_000);
    expect(r.land + r.b1).toBe(30_000_000);
  });
});

describe("⑧ 이전 입력 형식 필요경비 × 파트 가격 대체 — 칸을 나눠 입력하게 한다 (Q-5 a)", () => {
  it.each([
    ["매매 분리 ON", ACQ.buyOn],
    ["C1 분리 OFF", ACQ.c1Off],
    ["C1 분리 ON", ACQ.c1On],
  ] as const)("%s → directExpenses 칸을 지목해 막는다 (종전 ⑧ 통과 · 필요경비 0)", async (_n, acq) => {
    const r = await run(asset(EXT_ACTUAL, acq, LEGACY));
    // 공용 도우미는 메시지를 80자에서 자른다 — 앞부분 문구로 잡는다.
    expect(r.issues.some((i) => i.includes(":directExpenses:") && i.includes("이전 입력 형식"))).toBe(true);
  });

  it("매매 분리 OFF(일괄 실가)는 막지 않는다 — 그 값이 일괄 슬롯으로 쓰인다", () => {
    expect(gbExtensionLegacyExpenseUnused(asset(EXT_ACTUAL, ACQ.buyOff, LEGACY), "2026-02-16")).toBe(false);
  });

  it("자본적지출이 있으면 이전 형식 칸은 화면에서 숨는다 — 숨은 칸을 지목하지 않는다(막다른 길 금지)", () => {
    expect(gbExtensionLegacyExpenseUnused(asset(EXT_ACTUAL, ACQ.c1On, LEGACY, CAPEX), "2026-02-16")).toBe(false);
  });

  it("양도비가 있으면 ④가 이전 형식 값을 쓰지 않는다(종전 사슬과 같은 조건) — 막지 않는다", () => {
    expect(gbExtensionLegacyExpenseUnused(asset(EXT_ACTUAL, ACQ.c1On, LEGACY, TX), "2026-02-16")).toBe(false);
  });
});
