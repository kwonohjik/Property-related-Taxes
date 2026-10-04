/**
 * 영 §165④ 보충평가 — 순자산가치 0 하한(상증령 §55① 후단 준용)이 **주 경로**에도 걸린다 (S-1c-4)
 *
 * 계획서 `docs/00-pm/stock-165-4-valuation-followups.plan.md` §1
 *
 * 종전: 0 하한이 `calcSection165_4Value` 진입부에만 있었고, 양측 가중평균·순자산 단독·사례 49 경로는 그 함수를
 * 거치지 않아 간이 모드 음수 순자산이 그대로 들어갔다 — **취득가액이 음수**가 됐다(실측 −300,000,000).
 * 결산서(full) 모드도 어댑터가 평가일 없이 순자산을 집계해 하한이 걸리지 않았다.
 *
 *   ZM-1  양측 가중평균 — 취득측 음수 순자산
 *   ZM-2  순자산 단독(라목 후단 · §165④3 사유 · 기타자산) — 취득측 음수 순자산
 *   ZM-3  양측 가중평균 — 양도측 음수 순자산
 *   ZM-4  사례 49(취득시 장부분실) — 양도측 음수 순자산
 *   ZM-5  결산서(full) 모드 — 자본잠식 취득연도
 *   ZM-6  연혁 짝 — 2009.2.3. 양도는 하한 없음 (상증령 §55① 후단 2009.2.4. 신설 — ZF-9)
 *   ZM-7  Q-4b — 양도기준시가가 0 이하면 ⑧·⑫에서 차단 (환산 산식의 분모가 0)
 *   ZM-8  단측 경로 직접 호출 — 사례 49 양도측 · 취득일 거래정지(C-1) 취득측 단독
 *
 * 공통 입력: 양도 6,000,000,000 · 8,000주 · 양도연도 순손익 150,000 / 순자산 200,000 · 취득연도 순손익 6,000 / 순자산 10,000
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
import {
  calcAcquisitionStdPerShareSupplementary,
  calcTransferStdPriceForFaceValue,
} from "@/lib/tax-engine/stock-transfer/stock-valuation-unlisted-single-side";
import { calcNetAssetOnlyValue } from "@/lib/tax-engine/stock-transfer/valuation-165-4-basis";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "자본잠식법인",
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

const RA: Partial<StockTransferFormData> = { isHeavyRealEstateForRate: true };

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

describe("ZM-1: 양측 가중평균 — 취득측 음수 순자산은 0으로 본다", () => {
  it("취득연도 순자산 −10,000 → 취득 (6,000×3 + 0×2)/5 = 3,600 → 127,058,823 (종전 −14,117,647)", () => {
    expect(ok(run(form({ acquisitionYearNetAssetPerShare: "-10000" }))).acq).toBe(127_058_823);
  });
  it("순자산 0 입력과 같은 값 (하한의 정의)", () => {
    expect(ok(run(form({ acquisitionYearNetAssetPerShare: "0" }))).acq).toBe(127_058_823);
  });
  it("가중평균이 양수여도 음수 순자산이 깎지 않는다 — 순손익 60,000 → 36,000 → 1,270,588,235 (종전 32,000 → 1,129,411,764)", () => {
    const r = ok(run(form({ acquisitionYearNetIncomePerShare: "60000", acquisitionYearNetAssetPerShare: "-10000" })));
    expect(r.acq).toBe(1_270_588_235);
  });
});

describe("ZM-2: 순자산 단독 — 취득측 음수 순자산은 0 (취득가액이 음수가 되지 않는다)", () => {
  it("라목(§165⑧1호 후단) → 0 (종전 −300,000,000)", () => {
    const r = ok(run(form({ ...RA, acquisitionYearNetAssetPerShare: "-10000" })));
    expect(r.acq).toBe(0);
    expect(r.method).toBe("net_asset_only");
  });
  it("§165④3 가목(청산) → 0", () => {
    const r = ok(
      run(form({ netAssetOnlyReason: "liquidation_or_owner_death", acquisitionYearNetAssetPerShare: "-10000" } as Partial<StockTransferFormData>)),
    );
    expect(r.acq).toBe(0);
  });
  it("기타자산 + 라목 → 0", () => {
    const r = ok(run(form({ ...RA, marketType: "other_asset", acquisitionYearNetAssetPerShare: "-10000" })));
    expect(r.acq).toBe(0);
  });
});

describe("ZM-3: 양측 가중평균 — 양도측 음수 순자산", () => {
  it("양도연도 순자산 −200,000 → 양도 150,000×3/5 = 90,000 → 6e9 × 8,000 ÷ 90,000 = 533,333,333 (종전 4,800,000,000)", () => {
    expect(ok(run(form({ transferYearNetAssetPerShare: "-200000" }))).acq).toBe(533_333_333);
  });
});

describe("ZM-4: 사례 49(취득시 장부분실) — 양도측 음수 순자산", () => {
  const BOOK_LOST: Partial<StockTransferFormData> = {
    transferYearNetAssetPerShare: "-200000",
    acquisitionYearNetIncomePerShare: "",
    acquisitionYearNetAssetPerShare: "",
    acqFaceValueOnly: true,
    acqFaceValuePerShare: "12500",
  };
  it("양도 90,000 → 6e9 × 12,500 ÷ 90,000 = 833,333,333 (종전 10,000 → 7,500,000,000)", () => {
    const r = ok(run(form(BOOK_LOST)));
    expect(r.acq).toBe(833_333_333);
    expect(r.method).toBe("acq_face_value_only");
  });
});

describe("ZM-5: 결산서(full) 모드 — 자본잠식 취득연도", () => {
  it("라목 · 취득연도 부채 80,000,000 > 자산 0 (1주당 −10,000) → 0 (종전 −300,000,000)", () => {
    const r = ok(
      run(
        form({
          ...RA,
          unlistedValuationMode: "full",
          transferYearNetIncomePerShare: "",
          transferYearNetAssetPerShare: "",
          acquisitionYearNetIncomePerShare: "",
          acquisitionYearNetAssetPerShare: "",
          naAssetTotalRow1EUTransfer: "1600000000",
          naShareCountEUTransfer: "8000",
          naLiabTotalRow8EUAcq: "80000000",
          naShareCountEUAcq: "8000",
        } as Partial<StockTransferFormData>),
      ),
    );
    expect(r.acq).toBe(0);
  });
});

describe("ZM-6: 연혁 짝 — 상증령 §55① 후단은 2009.2.4. 신설 (그 전 양도는 하한 없음)", () => {
  const AT = (transferDate: string, priorYearEndDate: string, filingDate: string) => ({
    transferDate,
    priorYearEndDate,
    filingDate,
    acquisitionYearNetIncomePerShare: "60000",
    acquisitionYearNetAssetPerShare: "-10000",
  });
  it("2009-02-03 양도 → 32,000 그대로 → 1,129,411,764", () => {
    expect(ok(run(form(AT("2009-02-03", "2008-12-31", "2009-04-30")))).acq).toBe(1_129_411_764);
  });
  it("2009-02-04 양도 → 36,000 → 1,270,588,235", () => {
    expect(ok(run(form(AT("2009-02-04", "2008-12-31", "2009-04-30")))).acq).toBe(1_270_588_235);
  });
});

describe("ZM-7: Q-4b — 양도기준시가 0 이하는 ⑧·⑫에서 차단", () => {
  it("라목 · 양도연도 순자산 −200,000 → 단독 0 → 차단 (종전 경고만 남기고 취득가액 0)", () => {
    const r = run(form({ ...RA, transferYearNetAssetPerShare: "-200000" }));
    expect(r.step2).toContain("transferYearNetAssetPerShare");
    expect(r.blocked).toBe(true);
    if (r.blocked) expect(r.paths).toContain("transferYearNetAssetPerShare");
  });
  it("일반 · 순손익 −10,000 · 순자산 −10,000 → 가중평균 0 → 차단", () => {
    const r = run(form({ transferYearNetIncomePerShare: "-10000", transferYearNetAssetPerShare: "-10000" }));
    expect(r.step2).toContain("transferYearNetAssetPerShare");
    expect(r.blocked).toBe(true);
  });
  it("사례 49 · 양도측 0 → 차단", () => {
    const r = run(
      form({
        transferYearNetIncomePerShare: "-10000",
        transferYearNetAssetPerShare: "-10000",
        acquisitionYearNetIncomePerShare: "",
        acquisitionYearNetAssetPerShare: "",
        acqFaceValueOnly: true,
        acqFaceValuePerShare: "12500",
      }),
    );
    expect(r.step2).toContain("transferYearNetAssetPerShare");
    expect(r.blocked).toBe(true);
  });
  it("결산서(full) · 양도연도 자본잠식 → 차단 (⑧은 결산서 입력 칸으로)", () => {
    const r = run(
      form({
        ...RA,
        unlistedValuationMode: "full",
        transferYearNetIncomePerShare: "",
        transferYearNetAssetPerShare: "",
        acquisitionYearNetIncomePerShare: "",
        acquisitionYearNetAssetPerShare: "",
        naLiabTotalRow8EUTransfer: "80000000",
        naShareCountEUTransfer: "8000",
        naAssetTotalRow1EUAcq: "80000000",
        naShareCountEUAcq: "8000",
      } as Partial<StockTransferFormData>),
    );
    expect(r.step2).toContain("naAssetTotalRow1EUTransfer");
    expect(r.blocked).toBe(true);
  });
  it("부정 짝 — 양도기준시가가 1원이라도 양수면 통과", () => {
    expect(run(form({ transferYearNetIncomePerShare: "0", transferYearNetAssetPerShare: "3" })).blocked).toBe(false);
  });
});

describe("ZM-8: 단측 경로 직접 호출", () => {
  const base = {
    transferDate: new Date("2024-06-01"),
    isHeavyRealEstateForValuation: false,
    isHeavyRealEstateForRate: true,
  } as unknown as StockTransferInput;
  it("사례 49 양도측(`calcTransferStdPriceForFaceValue`) — 라목 단독 음수 → 0", () => {
    const r = calcTransferStdPriceForFaceValue({ ...base, transferYearNetAssetPerShare: -200_000 } as StockTransferInput);
    expect(r.perShare).toBe(0);
  });
  it("사례 49 양도측 — 일반 가중평균 음수 순자산 → 90,000", () => {
    const r = calcTransferStdPriceForFaceValue({
      ...base,
      isHeavyRealEstateForRate: false,
      transferYearNetIncomePerShare: 150_000,
      transferYearNetAssetPerShare: -200_000,
    } as StockTransferInput);
    expect(r.perShare).toBe(90_000);
  });
  it("단독 평가액 leaf — 0 하한은 2009.2.4. 양도부터 (가중평균과 같은 연혁 · ZF-9)", () => {
    expect(calcNetAssetOnlyValue(-10_000, new Date("2009-02-03"))).toBe(-10_000);
    expect(calcNetAssetOnlyValue(-10_000, new Date("2009-02-04"))).toBe(0);
    expect(calcNetAssetOnlyValue(10_000.7, new Date("2024-06-01"))).toBe(10_000);
  });
  it("C-1 취득측(`calcAcquisitionStdPerShareSupplementary`) — 라목 단독 음수 → 0", () => {
    const r = calcAcquisitionStdPerShareSupplementary({ ...base, acquisitionYearNetAssetPerShare: -10_000 } as StockTransferInput);
    expect(r.perShare).toBe(0);
  });
});
