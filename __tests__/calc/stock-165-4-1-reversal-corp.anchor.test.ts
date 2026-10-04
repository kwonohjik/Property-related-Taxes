/**
 * 영 §165④1호 괄호 — 「법 §94①4 다목에 해당하는 **법인**」은 순손익가치·순자산가치를 2:3으로 가중평균한다 (S-1c-2)
 *
 * 계획서 `docs/00-pm/stock-165-4-valuation-followups.plan.md` §3 — Q-2a(법인 요건 독법) · Q-2b·Q-2c
 *
 * 종전: 2:3은 사용자 토글 `isHeavyRealEstateForValuation` 하나로만 켜졌고, 그 토글이 라목 카드 안에만 있어
 * 다목·일반 비상장·상장 후 환산에서는 켤 수 없었다. 다목 카드에 부동산등 비율을 넣어도, 라목(80% ⊃ 50%)이어도 3:2였다.
 *
 *   RC-1  다목 카드 ON + 부동산등 비율 60% → 2:3 (과점주주 양도 요건 미충족이어도 — 법인 요건 독법)
 *   RC-2  부정 짝 — 다목 비율 40% · 다목 OFF인데 비율만 남은 잔재 · 아무것도 없음
 *   RC-3  라목 + 2023-02-27 양도 → 2:3 자동 (후단 단독 전) · 2024 양도는 후단 단독 그대로
 *   RC-4  일반 비상장 + 사용자 신고 → 2:3 (종전 동작 유지)
 *   RC-5  상장 후 환산(§165⑤) · 단측 경로(사례 49 양도측 · C-1 취득측) — 같은 leaf
 *   RC-6  leaf ↔ 폼 래퍼 동치 (% → 소수 단위)
 *
 * 수치: 양도 6,000,000,000 · 8,000주 · 양도연도 150,000/200,000 · 취득연도 6,000/10,000
 *   3:2 → 양도 170,000 · 취득 8,000(하한) → 282,352,941
 *   2:3 → 양도 180,000 · 취득 8,400        → 280,000,000
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
import { calcAcquisitionStdPerShareSupplementary } from "@/lib/tax-engine/stock-transfer/stock-valuation-unlisted-single-side";
import { calcTransferStdPriceForFaceValue } from "@/lib/tax-engine/stock-transfer/stock-valuation-unlisted-single-side";
import { isSection165_4_1ReversalCorp } from "@/lib/tax-engine/stock-transfer/section165-4-reversal-corp";
import { isReversalCorpForm } from "@/lib/calc/stock-transfer-section94-4-form";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "부동산법인",
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
  | { blocked: false; acq: number; method?: string; heavy?: boolean; step2: string[] };

function run(f: StockTransferFormData): Run {
  const step2 = validateStep2Domestic(f).filter((e) => e.severity === "error").map((e) => e.field);
  const body = buildStockTransferApiBody(f) as Record<string, unknown>;
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) return { blocked: true, paths: parsed.error.issues.map((i) => i.path.join(".")), step2 };
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  const r = calculateStockTransferTax(buildEngineInput(coerced));
  return { blocked: false, acq: r.acquisitionPrice, method: r.valuationDetail?.method, heavy: r.valuationDetail?.isHeavyRE, step2 };
}
function ok(r: Run) {
  if (r.blocked) throw new Error(`blocked: ${r.paths.join(", ")}`);
  expect(r.step2).toEqual([]);
  return r;
}

// 비상장 시장 + 다목 카드 — 과점주주 양도 요건이 미달이라 분류는 §94①3(일반 비상장)이다.
// 그래도 법인은 «부동산등 50% 이상»이므로 법인 요건 독법이면 2:3이다(기타자산 시장은 다목 미성립이면 ⑫가 막는다).
const DA = (ratio: string): Partial<StockTransferFormData> => ({
  marketType: "unlisted",
  isQualifyingBlockShareholder: true,
  blockShareholderRealEstateRatio: ratio,
  blockShareholderOwnershipRatio: "60",
  aggregationFirstTransferDate: "2024-06-01",
  cumulativeTransferRatio: "10", // 과점주주 50% 양도 요건 미충족 — 다목 주식등은 아니어도 «다목 법인»이다
});

describe("RC-1: 다목 부동산등 비율 50% 이상 법인 → 2:3", () => {
  it("다목 카드 ON · 비율 60% → 280,000,000 (종전 282,352,941) · 결과 echo도 반전", () => {
    const r = ok(run(form(DA("60"))));
    expect(r.acq).toBe(280_000_000);
    expect(r.heavy).toBe(true);
  });
  it("경계 — 비율 50% 정확히 → 2:3", () => {
    expect(ok(run(form(DA("50")))).acq).toBe(280_000_000);
  });
});

describe("RC-2: 부정 짝", () => {
  it("다목 비율 49.9% → 3:2", () => {
    expect(ok(run(form(DA("49.9")))).acq).toBe(282_352_941);
  });
  it("다목 OFF인데 비율 60%가 남아 있음(잔재) → 3:2", () => {
    expect(ok(run(form({ ...DA("60"), isQualifyingBlockShareholder: false, marketType: "unlisted" }))).acq).toBe(282_352_941);
  });
  it("아무 사실도 없음 → 3:2", () => {
    expect(ok(run(form())).acq).toBe(282_352_941);
  });
});

describe("RC-3: 라목(80% ⊃ 50%)", () => {
  const AT = { transferDate: "2023-02-27", priorYearEndDate: "2022-12-31", filingDate: "2023-04-30" };
  it("라목 + 2023-02-27 양도 → 2:3 자동 · 280,000,000 (종전 282,352,941)", () => {
    expect(ok(run(form({ ...AT, isHeavyRealEstateForRate: true }))).acq).toBe(280_000_000);
  });
  it("라목 + 2024 양도 → 후단 순자산 단독이 우선 · 300,000,000", () => {
    const r = ok(run(form({ isHeavyRealEstateForRate: true })));
    expect(r.acq).toBe(300_000_000);
    expect(r.method).toBe("net_asset_only");
  });
});

describe("RC-4: 사용자 신고 (다목·라목 카드를 쓰지 않는 일반 비상장)", () => {
  it("일반 비상장 + «부동산등 50% 이상 법인» → 280,000,000", () => {
    expect(ok(run(form({ isHeavyRealEstateForValuation: true }))).acq).toBe(280_000_000);
  });
});

describe("RC-5: 다른 평가 경로도 같은 leaf", () => {
  const base = {
    marketType: "kosdaq",
    transferDate: new Date("2023-02-26"),
    acquiredBeforeListing: true,
    listingDate: new Date("2018-07-01"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForValuation: false,
    isHeavyRealEstateForRate: false,
    listingDatePriceAvg1Month: 1_000,
    listingYearNetIncomePerShare: 300,
    listingYearNetAssetPerShare: 100,
    acquisitionYearNetIncomePerShare: 300,
    acquisitionYearNetAssetPerShare: 100,
    transferYearNetIncomePerShare: 300,
    transferYearNetAssetPerShare: 100,
  } as unknown as StockTransferInput;
  it("상장 후 환산(§165⑤) — 라목 상장주식 → 상장연도 평가 180 (3:2면 220)", () => {
    expect(calcPostListingConversion(base).listingYearPerShareValue).toBe(220);
    expect(calcPostListingConversion({ ...base, isHeavyRealEstateForRate: true }).listingYearPerShareValue).toBe(180);
  });
  it("사례 49 양도측 · C-1 취득측 — 다목 비율 0.6 → 180", () => {
    const da = { ...base, isQualifyingBlockShareholder: true, blockShareholderRealEstateRatio: 0.6 } as StockTransferInput;
    expect(calcTransferStdPriceForFaceValue(da).perShare).toBe(180);
    expect(calcAcquisitionStdPerShareSupplementary(da).perShare).toBe(180);
  });
});

describe("RC-6: leaf ↔ 폼 래퍼", () => {
  it("폼 % 문자열과 엔진 소수가 같은 답", () => {
    const f = { isHeavyRealEstateForValuation: false, isQualifyingBlockShareholder: true, isHeavyRealEstateForRate: false };
    expect(isReversalCorpForm({ ...f, blockShareholderRealEstateRatio: "50" })).toBe(true);
    expect(isSection165_4_1ReversalCorp({ ...f, blockShareholderRealEstateRatio: 0.5 })).toBe(true);
    expect(isReversalCorpForm({ ...f, blockShareholderRealEstateRatio: "49.9" })).toBe(false);
    expect(isReversalCorpForm({ ...f, blockShareholderRealEstateRatio: "" })).toBe(false);
  });
});
