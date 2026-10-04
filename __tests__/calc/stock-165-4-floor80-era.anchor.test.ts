/**
 * 영 §165④1호 단서(80% 하한) 시행일 — **양도일 2018-04-01 이후** (S-1c-3 1단계)
 *
 * 계획서 `docs/00-pm/stock-165-4-valuation-followups.plan.md` §4 · Q-3a
 *
 * 근거: 대통령령 제28637호(2018.2.13.) 부칙 제1조 단서 1호 「…제165조제4항…의 개정규정: 2018년 4월 1일」,
 *       제2조② 「양도소득에 관한 개정규정은 이 영 시행 이후 양도하는 분부터 적용」.
 *       2007.2.28.(MST 77490)·2010·2017.2.3.(MST 191522)·2018.2.13. 시행본 §165④1호에는 하한이 없다.
 * 종전 엔진은 2007.2.28. 이후 양도에 하한을 걸었다(출처 미상 — 계획·설계 문서 grep 0건).
 *
 *   FE-1  2018-03-31 / 2018-04-01 경계 — 취득측 하한
 *   FE-2  2015 양도 — 양도측 하한이 걸리던 입력
 *   FE-3  2007-02-28 양도 — 종전 엔진의 하한 시작일
 *   FE-4  상장 후 환산(§165⑤) — 같은 정본
 *   FE-5  leaf `getValuationWeights` 경계
 *
 * ⚠️ 2007.2.27. 이전 양도분의 산식(2006 시행본은 max(순손익가치, 순자산가치))은 2단계다 — 여기서 바꾸지 않는다.
 *
 * 공통 입력: 양도 6,000,000,000 · 8,000주 · 양도연도 150,000/200,000 · 취득연도 6,000/10,000
 *   하한 없음 : 양도 170,000 · 취득 7,600 → 6e9 × 7,600 ÷ 170,000 = 268,235,294
 *   하한 있음 : 양도 170,000 · 취득 8,000 → 282,352,941
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { calcPostListingConversion } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import { getValuationWeights } from "@/lib/tax-engine/stock-transfer/valuation-165-4-basis";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "하한연혁법인",
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: "20",
    selfMarketCap: "0",
    totalIssuedShares: "40000",
    priorYearEndDate: "2023-12-31",
    acquisitionDate: "1990-01-01",
    transferDate: "2024-06-01",
    shareCount: "8000",
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: "6000000000",
    acquisitionMode: "estimated",
    unlistedInputMode: "simple",
    transferYearNetIncomePerShare: "150000",
    transferYearNetAssetPerShare: "200000",
    acquisitionYearNetIncomePerShare: "6000",
    acquisitionYearNetAssetPerShare: "10000",
    filingType: "preliminary",
    filingDate: "2024-08-31",
    ...o,
  } as StockTransferFormData;
}


type Run =
  | { blocked: true; paths: string[]; step2: string[] }
  | { blocked: false; acq: number; method?: string; step2: string[] };

function run(f: StockTransferFormData): Run {
  const step2 = validateStep2Domestic(f).filter((e) => e.severity === "error").map((e) => e.field);
  const body = buildStockTransferApiBody(f) as Record<string, unknown>;
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) return { blocked: true, paths: parsed.error.issues.map((i) => i.path.join(".")), step2 };
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  const r = calculateStockTransferTax(buildEngineInput(coerced));
  return { blocked: false, acq: r.acquisitionPrice, method: r.valuationDetail?.method, step2 };
}
function ok(r: Run) {
  if (r.blocked) throw new Error(`blocked: ${r.paths.join(", ")}`);
  expect(r.step2).toEqual([]);
  return r;
}

const AT = (transferDate: string, priorYearEndDate: string, filingDate: string): Partial<StockTransferFormData> => ({
  transferDate,
  priorYearEndDate,
  filingDate,
});

describe("FE-1: 2018-03-31 / 2018-04-01 경계 (취득측 하한)", () => {
  it("2018-03-31 양도 → 하한 없음 · 268,235,294 (종전 282,352,941)", () => {
    expect(ok(run(form(AT("2018-03-31", "2017-12-31", "2018-05-31")))).acq).toBe(268_235_294);
  });
  it("2018-04-01 양도 → 하한 · 282,352,941", () => {
    expect(ok(run(form(AT("2018-04-01", "2017-12-31", "2018-06-30")))).acq).toBe(282_352_941);
  });
});

describe("FE-2: 2015 양도 — 양도측 하한이 걸리던 입력", () => {
  it("양도연도 순손익 30,000 → 양도 98,000 그대로 → 6e9 × 7,600 ÷ 98,000 = 465,306,122 (종전 300,000,000)", () => {
    const r = ok(run(form({ transferYearNetIncomePerShare: "30000", ...AT("2015-06-01", "2014-12-31", "2015-08-31") })));
    expect(r.acq).toBe(465_306_122);
  });
});

describe("FE-3: 2007-02-28 양도 — 종전 엔진의 하한 시작일", () => {
  it("→ 하한 없음 · 268,235,294", () => {
    expect(ok(run(form(AT("2007-02-28", "2006-12-31", "2007-04-30")))).acq).toBe(268_235_294);
  });
});

describe("FE-4: 상장 후 환산(§165⑤)도 같은 정본", () => {
  const base = {
    marketType: "kosdaq",
    acquiredBeforeListing: true,
    listingDate: new Date("2010-07-01"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForValuation: false,
    isHeavyRealEstateForRate: false,
    listingDatePriceAvg1Month: 1_000,
    listingYearNetIncomePerShare: 100,
    listingYearNetAssetPerShare: 200,
    acquisitionYearNetIncomePerShare: 100,
    acquisitionYearNetAssetPerShare: 200,
  } as unknown as StockTransferInput;
  it("2015 양도 → 상장연도 평가 140 (하한 160 아님)", () => {
    expect(calcPostListingConversion({ ...base, transferDate: new Date("2015-06-01") }).listingYearPerShareValue).toBe(140);
  });
  it("2018-04-01 양도 → 160 (하한)", () => {
    expect(calcPostListingConversion({ ...base, transferDate: new Date("2018-04-01") }).listingYearPerShareValue).toBe(160);
  });
});

describe("FE-5: leaf 경계", () => {
  it("2018-03-31 하한 없음 · 2018-04-01 하한", () => {
    expect(getValuationWeights(new Date("2018-03-31")).hasFloor80).toBe(false);
    expect(getValuationWeights(new Date("2018-04-01")).hasFloor80).toBe(true);
  });
});
