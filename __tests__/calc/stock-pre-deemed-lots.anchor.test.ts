/**
 * 의제취득일 전 매수 lot × 영 §176의2④2호 ② (미결 4 — 분할·다건 lot 모드)
 *
 * 종전 분할·다건 lot 모드는 §176의2④를 «범위 밖»으로 두어, 1986.1.1. 전 매수 lot 이 입력 단가 그대로
 * 계산됐다(② 「실가 + 생산자물가상승분」 누락 — 강행 규정의 조용한 미적용). lot 마다 ②를 적용한다.
 *
 *   PL-1  분할 — 1980 매수 lot 단가가 ②로 바뀌고 FIFO 합계에 반영 · 규칙·경고 echo
 *   PL-2  ⑤⑥ 미리보기(사이드바)가 엔진과 같은 취득가액
 *   PL-3  원인 축 — 유상증자·과세 무상주 lot 은 매수와 같이 / 증여 lot 은 그대로(§163⑨ 평가액)
 *   PL-4  다건 lot(단건 양도 · 취득 lots) 모드도 같은 적용
 *   PL-5  1965.01 이전 매수 lot — ⑧(step1·step2) ⇔ ⑫ 차단 · 1970 은 통과
 *   PL-6  의제취득일 후 lot 만이면 종전 그대로(제보 사례 104,000,000)
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { ppiMonthlyX100, PRE_DEEMED_LOT_BEFORE_PPI_MESSAGE } from "@/lib/tax-engine/stock-transfer/stock-pre-deemed-acquisition";
import { previewSplitAllocation } from "@/lib/calc/stock-split-preview";
import { validateStep1, validateStep2 } from "@/lib/calc/stock-transfer-tax-validate";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { AcquisitionLotForm } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { reportedSplitForm } from "./stock-split-lots-fixture";

function runFullStack(form: StockTransferFormData) {
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(buildStockTransferApiBody(form));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" | "));
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  return calculateStockTransferTax(buildEngineInput(coerced));
}

/** ② 1주당 = floor(단가 × 1985-12 지수 ÷ 취득월 지수) */
const clause2 = (price: number, y: number, m: number) =>
  Math.floor((price * ppiMonthlyX100(1985, 12)!) / ppiMonthlyX100(y, m)!);

/** 제보 사례에서 매수 #1 만 바꾼다 — FIFO 10,000주 = #1 8,000주 + #2 2,000주 × 12,000 */
function withLot1(o: Partial<AcquisitionLotForm>): StockTransferFormData {
  const base = reportedSplitForm();
  return reportedSplitForm({ acquisitionLots: [{ ...base.acquisitionLots[0], ...o }, base.acquisitionLots[1], base.acquisitionLots[2]] });
}

const LOT2_PART = 2000 * 12000;

describe("PL-1 분할 — 1980 매수 lot", () => {
  it("단가 10,000 → ② · 합계 반영 · 규칙·경고", () => {
    const p2 = clause2(10000, 1980, 6);
    expect(p2).toBeGreaterThan(10000);
    const r = runFullStack(withLot1({ acquisitionDate: "1980-06-10" }));
    expect(r.acquisitionPrice).toBe(8000 * p2 + LOT2_PART);
    expect(r.appliedRules).toContain("의제취득일물가상승가산");
    expect(r.warnings.some((w) => w.includes("매수 lot #1(1980-06 취득"))).toBe(true);
  });
});

describe("PL-2 미리보기 = 엔진", () => {
  it("사이드바 취득가액이 엔진 결과와 같다", () => {
    const f = withLot1({ acquisitionDate: "1980-06-10" });
    expect(previewSplitAllocation(f)?.totalAcquisitionPrice).toBe(runFullStack(f).acquisitionPrice);
  });
});

describe("PL-3 원인 축", () => {
  it.each(["rights_issue", "bonus_taxed"] as const)("%s lot 은 매수와 같이 ②", (cause) => {
    const r = runFullStack(withLot1({ acquisitionDate: "1980-06-10", acquisitionCause: cause }));
    expect(r.acquisitionPrice).toBe(8000 * clause2(10000, 1980, 6) + LOT2_PART);
  });
  it("증여 lot 은 그대로 — §163⑨ 평가액(② 부적용)", () => {
    const r = runFullStack(withLot1({ acquisitionDate: "1980-06-10", acquisitionCause: "gift" }));
    expect(r.acquisitionPrice).toBe(8000 * 10000 + LOT2_PART);
    expect(r.appliedRules).not.toContain("의제취득일물가상승가산");
  });
});

/** 단건 양도 · 취득 lots 2건(1980 1,000주 × 5,000 · 2010 1,000주 × 20,000) → 1,500주 양도 */
function lotsOnlyForm(firstDate = "1980-06-10"): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "테스트",
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: "20",
    selfMarketCap: "6000000000",
    totalIssuedShares: "100000",
    priorYearEndDate: "2025-12-31",
    lotsMode: "single",
    transferDate: "2026-05-10",
    shareCount: "1500",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: "50000",
    acquisitionMode: "actual",
    acquisitionActualInputMode: "lots",
    costAllocationMethod: "fifo",
    acquisitionLots: [
      { id: "a1", acquisitionDate: firstDate, acquisitionCause: "purchase", shareCount: "1000", perShareAcquisitionPrice: "5000" },
      { id: "a2", acquisitionDate: "2010-03-02", acquisitionCause: "purchase", shareCount: "1000", perShareAcquisitionPrice: "20000" },
    ],
    filingType: "preliminary",
    filingDate: "2026-07-31",
  } as StockTransferFormData;
}

describe("PL-4 다건 lot 모드", () => {
  it("1980 lot 만 ② · 2010 lot 은 그대로", () => {
    const r = runFullStack(lotsOnlyForm());
    expect(r.acquisitionPrice).toBe(1000 * clause2(5000, 1980, 6) + 500 * 20000);
  });
});

describe("PL-5 1965.01 이전 매수 lot — ⑧ ⇔ ⑫", () => {
  const has = (errs: { message: string; severity: string }[]) =>
    errs.some((e) => e.severity === "error" && e.message.includes(PRE_DEEMED_LOT_BEFORE_PPI_MESSAGE));
  const zodHas = (f: StockTransferFormData) => {
    const r = addStockRefines(stockTransferInputSchema).safeParse(buildStockTransferApiBody(f));
    return !r.success && r.error.issues.some((i) => i.message.includes(PRE_DEEMED_LOT_BEFORE_PPI_MESSAGE));
  };
  it("분할 1960 매수 → step1·⑫ 차단 / 1970 → 통과", () => {
    expect(has(validateStep1(withLot1({ acquisitionDate: "1960-06-10" })))).toBe(true);
    expect(zodHas(withLot1({ acquisitionDate: "1960-06-10" }))).toBe(true);
    expect(has(validateStep1(withLot1({ acquisitionDate: "1970-06-10" })))).toBe(false);
    expect(zodHas(withLot1({ acquisitionDate: "1970-06-10" }))).toBe(false);
  });
  it("분할 1960 증여 lot 은 해당 없음", () => {
    expect(has(validateStep1(withLot1({ acquisitionDate: "1960-06-10", acquisitionCause: "gift" })))).toBe(false);
    expect(zodHas(withLot1({ acquisitionDate: "1960-06-10", acquisitionCause: "gift" }))).toBe(false);
  });
  it("다건 lot 1960 → step2·⑫ 차단", () => {
    expect(has(validateStep2(lotsOnlyForm("1960-06-10")))).toBe(true);
    expect(zodHas(lotsOnlyForm("1960-06-10"))).toBe(true);
  });
});

describe("PL-6 회귀 없음", () => {
  it("의제취득일 후 lot 만 — 104,000,000 · 규칙 없음", () => {
    const r = runFullStack(reportedSplitForm());
    expect(r.acquisitionPrice).toBe(104_000_000);
    expect(r.appliedRules).not.toContain("의제취득일물가상승가산");
  });
});
