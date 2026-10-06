/**
 * ⑥ lots-only(일자별 다건) 미리보기 = 엔진 — 분할 전용이던 `previewSplitAllocation` 이 lots-only 도 덮는다
 *
 * 종전 사이드바의 lots-only 취득가액은 «가중평균 단가 × 양도수량» 근사라 의제취득일 전 매수 ②·① 을 반영하지 못해
 * 결과(엔진)와 갈렸다. 같은 엔진 매칭을 쓰므로 합계가 엔진 `lotMatchingDetail`·`acquisitionPrice` 와 같아야 한다.
 *
 *   LP-1  ② 만(① none): 미리보기 = 엔진 취득가액 (12,910,000 = floor(10,000 × 5057 ÷ 3917) × 1,000)
 *   LP-2  ① 환산 채택: 미리보기 = 엔진 취득가액 40,000,000
 *   LP-3  입력이 덜 찼으면(양도일 없음) null — 부분 합계를 보이지 않는다
 *   LP-4  lots-only 가 아닌 단건·환산 모드 → null (분할/lots-only 에서만)
 */
import { describe, it, expect } from "vitest";
import { previewSplitAllocation } from "@/lib/calc/stock-split-preview";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

function lotsOnly(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "테스트",
    marketType: "kospi",
    isMajorShareholder: true,
    selfShareRatio: "20",
    selfMarketCap: "6000000000",
    totalIssuedShares: "100000",
    priorYearEndDate: "2024-12-31",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    acquisitionMode: "actual",
    filingType: "preliminary",
    filingDate: "2026-07-31",
    lotsMode: "single",
    transferDate: "2025-12-01",
    shareCount: "1000",
    perShareTransferPrice: "200000",
    acquisitionActualInputMode: "lots",
    costAllocationMethod: "fifo",
    preDeemedLotClause1Mode: "none",
    acquisitionDatePriceAvg1Month: "20000",
    transferDatePriceAvg1Month: "100000",
    acquisitionLots: [{ id: "a1", acquisitionDate: "1980-06-10", acquisitionCause: "purchase", shareCount: "1000", perShareAcquisitionPrice: "10000" }],
    ...o,
  } as StockTransferFormData;
}
function engineAcq(form: StockTransferFormData) {
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(buildStockTransferApiBody(form));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("|"));
  return calculateStockTransferTax(buildEngineInput(coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS])));
}

describe("lots-only 미리보기 = 엔진", () => {
  it("LP-1 ① none — ② 만 적용한 취득가액이 엔진과 같다", () => {
    const f = lotsOnly();
    const p = previewSplitAllocation(f);
    expect(p).not.toBeNull();
    expect(p!.totalAcquisitionPrice).toBe(engineAcq(f).lotMatchingDetail!.totalAcquisitionPrice);
    expect(p!.totalAcquisitionPrice).toBe(12_910_000);
  });
  it("LP-2 ① 환산 채택 — 40,000,000 · 엔진과 같다", () => {
    const f = lotsOnly({ preDeemedLotClause1Mode: "estimated" });
    const p = previewSplitAllocation(f);
    expect(p!.totalAcquisitionPrice).toBe(40_000_000);
    expect(p!.totalAcquisitionPrice).toBe(engineAcq(f).acquisitionPrice);
    expect(p!.matched[0].preDeemedSelected).toBe("clause1");
  });
  it("LP-3 양도일이 없으면 null", () => {
    expect(previewSplitAllocation(lotsOnly({ transferDate: "" }))).toBeNull();
  });
  it("LP-4 단건(취득 1건)·lots 입력 방식이 아니면 null", () => {
    expect(previewSplitAllocation(lotsOnly({ acquisitionActualInputMode: "per_share" }))).toBeNull();
    expect(previewSplitAllocation(lotsOnly({ acquisitionMode: "estimated" }))).toBeNull();
  });
});
