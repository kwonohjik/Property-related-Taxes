/**
 * 일반건물 실가 경로 — 파트 자본적지출 칸(`landDirectExpenses`·`buildingDirectExpenses`) × 둘 다 상속(C1) · 양도비 (2026-10-22)
 *
 * 종전 결함(⑧ 통과):
 *  - E-2: 둘 다 상속(C1) 분기가 화면에 있는 파트 자본적지출 칸을 읽지 않았다(산출세액 불변 286,410,000).
 *  - 매매 분기: 파트 칸이 그 파트의 필요경비 **전체**를 대체해, 자산 단위 양도비(§97①3호)의 그 파트 몫이 사라졌다
 *    (두 파트 다 입력하면 양도비 전액 소실 — 242,310,000 그대로).
 *
 * 규칙: 파트 칸은 화면 라벨대로 **자본적지출**만 대체하고, 양도비는 파트에 적용된 양도가액 비율로 안분해 더한다
 * (「소득세법」 §100② 후문 「공통되는 … 양도비용」 — 주택 분리 경로 F23과 같은 규칙). 두 분기가 같은 함수를 쓴다.
 *
 * 폼 → ⑧ → ④ → ⑫ Zod → ⑭ Route 전 구간 + 엔진 직접 호출(거짓 차단). mock 세율.
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
import { calculateGeneralBuildingActualTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { buildGbExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementGbFormulas";
import { directExpenseRaw } from "@/lib/stores/transfer-per-asset-direct";
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
  hasSeperateLandAcquisitionDate: true,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
};
/** 토지 1988 · 건물 1995 상속(C1). */
const C1: Partial<AssetForm> = {
  ...BASE,
  acquisitionCause: "inheritance",
  gbBuildingAcquisitionCause: "inheritance",
  landAcquisitionDate: "1988-05-01",
  acquisitionDate: "1995-05-01",
  decedentAcquisitionDate: "1970-01-01",
  publishedValueAtInheritance: "300000000",
  gbBuildingInheritedValue: "200000000",
};
const BUY: Partial<AssetForm> = {
  ...BASE,
  acquisitionCause: "purchase",
  gbBuildingAcquisitionCause: "purchase",
  landAcquisitionDate: "2005-05-01",
  acquisitionDate: "2010-05-01",
  landAcquisitionPrice: "400000000",
  buildingAcquisitionPrice: "200000000",
};
const PART: Partial<AssetForm> = { landDirectExpenses: "30000000", buildingDirectExpenses: "20000000" };
const LAND_ONLY: Partial<AssetForm> = { landDirectExpenses: "30000000" };
const TX: Partial<AssetForm> = { transferExpense: "10000000" };
/** 양도비 1천만의 토지 몫 — 양도시 기준시가 비율(구분 기재 없음): 205㎡ × 5,514,000 : 259,072,400. */
const TX_LAND = 8_135_421;
const TX_BUILDING = 10_000_000 - TX_LAND;

const asset = (...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(1) }, ...over) as AssetForm;
function form(a: AssetForm): TransferFormData {
  const f = newForm();
  f.transferDate = "2026-02-16";
  f.filingDate = "2026-05-31";
  f.contractTotalPrice = String(T);
  f.assets = [a];
  return f;
}

type Prop = { propertyId: string; necessaryExpense: number };
async function run(f: TransferFormData) {
  const issues = allIssues(f);
  const body = await captureBody(f);
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  expect(issues).toEqual([]);
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  const props = (json.data.aggregated.properties ?? []) as Prop[];
  const exp = (part: "land" | "building") => props.find((p) => p.propertyId === part)!.necessaryExpense;
  const gbd = json.data.aggregated.generalBuildingValuationDetail;
  /** 상세명세서 «자산별 필요경비» 산식(⑦) — 카드 값을 그대로 넘긴다. */
  const formula = (part: "land" | "building") =>
    buildGbExpenseFormula({ propertyId: part, necessaryExpense: exp(part), capitalExpenditureForDisplay: 0 } as never, gbd);
  return { tax: json.data.aggregated.calculatedTax as number, land: exp("land"), building: exp("building"), formula };
}

describe("E-2 — 둘 다 상속(C1)도 파트 자본적지출 칸을 읽는다", () => {
  it("🔴 두 파트 입력 → 토지 30,000,000 · 건물 20,000,000 (종전 0 · 세액 불변 286,410,000)", async () => {
    const r = await run(form(asset(C1, PART)));
    expect([r.land, r.building]).toEqual([30_000_000, 20_000_000]);
    expect(r.tax).toBe(271_710_000);
    expect(r.formula("land")).toBe("자본적지출 30,000,000 (토지 칸 직접 입력)");
    expect(r.formula("building")).toBe("자본적지출 20,000,000 (건물 칸 직접 입력)");
  });

  it("🔴 한 파트만 입력 → 그 파트만 직접 귀속, 상대 파트는 안분분(자산 단위 자본적지출 없음 = 0)", async () => {
    const r = await run(form(asset(C1, LAND_ONLY)));
    expect([r.land, r.building]).toEqual([30_000_000, 0]);
  });

  it("🔴 파트 자본적지출 + 양도비 → 양도비 몫을 더한다", async () => {
    const r = await run(form(asset(C1, PART, TX)));
    expect([r.land, r.building]).toEqual([30_000_000 + TX_LAND, 20_000_000 + TX_BUILDING]);
    expect(r.tax).toBe(268_770_000);
    expect(r.formula("land")).toMatch(/자본적지출 30,000,000 \(토지 칸 직접 입력\)\n\s+합계 = 38,135,421$/);
    expect(r.formula("building")).toMatch(/자본적지출 20,000,000 \(건물 칸 직접 입력\)\n\s+합계 = 21,864,579$/);
  });

  it("파트 칸이 없으면 종전과 같다 — 양도비만 안분", async () => {
    const r = await run(form(asset(C1, TX)));
    expect([r.land, r.building]).toEqual([TX_LAND, TX_BUILDING]);
    expect(r.tax).toBe(283_470_000);
  });
});

describe("매매 분기 — 파트 자본적지출 칸이 양도비 몫을 지우지 않는다", () => {
  it("🔴 두 파트 입력 + 양도비 → 양도비 전액 반영 (종전 242,310,000 = 양도비 소실)", async () => {
    const r = await run(form(asset(BUY, PART, TX)));
    expect([r.land, r.building]).toEqual([30_000_000 + TX_LAND, 20_000_000 + TX_BUILDING]);
    expect(r.tax).toBe(239_370_000);
  });

  it("🔴 토지만 입력 + 양도비 → 토지 = 자본적지출 + 양도비 몫 (종전 토지 몫 소실)", async () => {
    const r = await run(form(asset(BUY, LAND_ONLY, TX)));
    expect([r.land, r.building]).toEqual([30_000_000 + TX_LAND, TX_BUILDING]);
  });

  it("양도비 없이 두 파트 입력은 종전과 같다", async () => {
    const r = await run(form(asset(BUY, PART)));
    expect([r.land, r.building]).toEqual([30_000_000, 20_000_000]);
    expect(r.tax).toBe(242_310_000);
  });
});

describe("엔진 직접 호출 — 두 파트 모두 직접 귀속이면 취득시 기준시가를 요구하지 않는다(거짓 차단 금지)", () => {
  const ENGINE_BASE = {
    totalTransferPrice: 1_000_000_000,
    transferDate: new Date("2026-03-01"),
    acquisitionDate: new Date("2015-03-01"),
    landArea: 200,
    buildingFootprintArea: 100,
    transferLandPricePerSqm: 3_000_000, // × 200 = 600,000,000
    transferBuildingStdPrice: 200_000_000,
    zoneType: "commercial",
    isMetropolitan: false,
    isUnregistered: false,
    actualAcquisitionPrice: 0,
    actualExpenses: 0,
  };
  const cards = (over: Record<string, unknown>) =>
    (
      calculateGeneralBuildingActualTransfer({ ...ENGINE_BASE, ...over } as never, 2026, undefined, [], makeMockRates())
        .aggregated.generalBuildingValuationDetail as unknown as { assetCards: { propertyId: string; expenses: number }[] }
    ).assetCards;

  it("C1 · 취득시 기준시가 없음 · 두 파트 + 양도비 → 계산된다 · 양도비는 양도시 기준시가 3:1", () => {
    const c = cards({
      acquisitionByInheritance: true,
      buildingAcquisitionByInheritance: true,
      inheritedLandValue: 300_000_000,
      inheritedBuildingValue: 100_000_000,
      landDirectExpenses: 60_000_000,
      buildingDirectExpenses: 40_000_000,
      transferExpense: 8_000_000,
    });
    expect(c.find((x) => x.propertyId === "land")!.expenses).toBe(66_000_000);
    expect(c.find((x) => x.propertyId === "building")!.expenses).toBe(42_000_000);
  });
});

describe("⑥ 사이드바 계산 전 필요경비 — 엔진과 같은 합(파트 자본적지출 + 양도비)", () => {
  it("분리 ON · 파트 칸 + 양도비 → 60,000,000 (종전 양도비 10,000,000만 보였다)", () => {
    expect(directExpenseRaw(asset(C1, PART, TX))).toBe(60_000_000);
  });
  it("분리 OFF면 파트 칸 잔재를 더하지 않는다 — 자산 단위 자본적지출·양도비", () => {
    expect(
      directExpenseRaw(asset(C1, PART, TX, { hasSeperateLandAcquisitionDate: false, capitalExpenditure: "5000000" })),
    ).toBe(15_000_000);
  });
});
