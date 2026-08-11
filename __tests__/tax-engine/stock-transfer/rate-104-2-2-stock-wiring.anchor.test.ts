/**
 * anchor: 주식 §104②2호 **UI → API → 엔진 배선** (D-5 Phase 3)
 *
 * 계획서: docs/02-design/features/transfer-104-2-2-gift-carryover-scope.plan.md Phase 3
 *
 * 엔진만 고치면 **세액이 전혀 변하지 않는다** — 사용자가 값을 넣을 경로가 없으면
 * `donorAcquisitionDate`가 엔진에 도달하지 못하기 때문이다
 * (메모리 `feedback_api_trigger_without_input_path_is_noop` ★★★).
 * Phase 3에서 취득원인 「이월과세(증여)」와 증여자 취득일 입력구를 열었으므로,
 * 여기서는 **폼 값이 실제로 엔진 세액을 움직이는지**를 끝까지 단언한다.
 *
 * 경로: `StockTransferFormData` → `buildStockTransferApiBody` → zod(`stockTransferInputSchema`)
 *       → `calculateStockTransferTax`
 *
 * ⚠️ zod enum·lot 스키마 누락은 **TypeScript가 잡지 못한다**(`feedback_api_zod_schema_sync` ★★★ ⑫).
 *    실제로 Phase 2에서 `acquisitionCauseSchema`에 `carryover_gift`가 없어 조용히 막힐 뻔했다.
 */
import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { coerceDates } from "@/lib/api/date-coerce";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

/** 코스닥 대주주 · 중소기업 외 · 1,000주 · 양도 5억 / 취득 1억 (anchor S-1과 같은 픽스처) */
function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "kosdaq",
    isMajorShareholder: true,
    selfShareRatio: "3",
    selfMarketCap: "6000000000",
    priorYearEndDate: "2025-12-31",
    acquisitionDate: "2025-07-01",
    transferDate: "2026-03-01",
    shareCount: "1000",
    totalIssuedShares: "100000",
    transferPriceMode: "actual",
    // `transferActualInputMode`의 3중 패턴 default가 "total"이라 1주당 단가를 쓰려면 명시해야 한다.
    transferActualInputMode: "per_share",
    perShareTransferPrice: "500000",
    acquisitionMode: "actual",
    acquisitionActualInputMode: "per_share",
    perShareAcquisitionPrice: "100000",
    expenseMode: "actual",
    actualExpenses: "0",
    filingType: "preliminary",
    filingDate: "2026-05-31",
    ...o,
  };
}

/** route handler와 같은 Date 강제 목록 (`app/api/calc/stock-transfer/route.ts` STOCK_DATE_FIELDS 부분집합) */
const DATE_FIELDS = [
  "acquisitionDate",
  "transferDate",
  "priorYearEndDate",
  "filingDate",
  "decedentAcquisitionDate",
  "donorAcquisitionDate",
  "preMergerAcquisitionDate",
];

/** 폼 → API body → zod → coerceDates → 엔진. 어느 계층이 끊겨도 여기서 드러난다. */
function runThroughPipeline(f: StockTransferFormData) {
  const body = buildStockTransferApiBody(f);
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) {
    throw new Error(`zod 검증 실패: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`);
  }
  const coerced = coerceDates(parsed.data as Record<string, unknown>, DATE_FIELDS);
  const result = calculateStockTransferTax(coerced as unknown as StockTransferInput) as unknown as {
    appliedRate: number;
    calculatedTax: number;
  };
  return { body, result };
}

describe("W 주식 §104②2호 — 폼에서 엔진까지 값이 도달한다", () => {
  /**
   * W-1: 「이월과세(증여)」 + 증여자 취득일 → 가목2) 25%.
   * 이 테스트가 실패하면 store·API 변환·zod·엔진 중 한 곳이 끊긴 것이다.
   */
  it("W-1 carryover_gift — donorAcquisitionDate가 body에 실리고 세액이 25%로 내려간다", () => {
    const { body, result } = runThroughPipeline(
      form({ acquisitionCause: "carryover_gift", donorAcquisitionDate: "2015-01-01" }),
    );
    expect(body.acquisitionCause).toBe("carryover_gift");
    expect(body.donorAcquisitionDate).toBe("2015-01-01");
    expect(result.appliedRate).toBe(0.25);
    expect(result.calculatedTax).toBe(84_375_000);
  });

  /** W-2: 단순 증여는 §97의2① 미해당 선언 — 값이 있어도 body에 싣지 않는다. */
  it("W-2 gift — donorAcquisitionDate를 body에 싣지 않고 30% 유지", () => {
    const { body, result } = runThroughPipeline(
      form({ acquisitionCause: "gift", donorAcquisitionDate: "2015-01-01" }),
    );
    expect(body.donorAcquisitionDate).toBeUndefined();
    expect(result.appliedRate).toBe(0.3);
    expect(result.calculatedTax).toBe(119_250_000);
  });

  /**
   * W-3 **부칙 게이트가 파이프라인 끝까지 살아 있는가.**
   * 증여일 2024-12-31은 개정 전 증여분이므로 body에는 실리되 엔진이 무시해야 한다.
   */
  it("W-3 carryover_gift + 2024-12-31 증여 — 값은 전달되지만 엔진이 30% 유지", () => {
    const { body, result } = runThroughPipeline(
      form({
        acquisitionCause: "carryover_gift",
        acquisitionDate: "2024-12-31",
        transferDate: "2025-11-01",
        donorAcquisitionDate: "2015-01-01",
        priorYearEndDate: "2024-12-31",
        filingDate: "2026-01-31",
      }),
    );
    expect(body.donorAcquisitionDate).toBe("2015-01-01");
    expect(result.appliedRate).toBe(0.3);
    expect(result.calculatedTax).toBe(119_250_000);
  });
});
