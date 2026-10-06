/**
 * 의제취득일 전에 받은 과세 무상주 × 소득세법 시행령 §176의2④
 *
 * 영 §176의2④: 의제취득일 전에 취득한 자산(상속·증여 포함)의 의제취득일 현재 취득가액은
 *   ① 의제취득일 현재 매매사례가액·감정가액·환산가액 과 ② 취득 당시 실지거래가액 + 생산자물가상승분
 *   중 **많은 것으로 한다**(강행). 과세 무상주의 액면가액(소령 §27①1호 가목)은 ②의 실지거래가액이다.
 *
 * PR-3(#2001)이 과세 무상주의 추계 모드를 «날짜와 무관하게» 막아, 의제취득일 전 무상주는 ①을
 * 산정할 길이 없어졌다(②만 남는다). 의제취득일 전이면 추계 모드를 열고, ②의 액면가액을 필수로 받는다.
 *
 *   PD-1  1980 과세 무상주 + 환산 → ⑧ 추계 차단 없음 · 의제취득일 후(2010)는 종전대로 차단
 *   PD-2  ③ 복원 — 의제취득일 전 과세 무상주의 환산 저장분은 보존 / 의제취득일 후는 실가로
 *   PD-3  엔진 — 1980 과세 무상주 환산 + 액면가 ② = 「매수」와 같은 ①·② 비교 결과
 *   PD-4  ⑧ — 의제취득일 전 과세 무상주가 추계 모드면 ② 액면가액 필수 (매수는 종전대로 선택)
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { normalizeStockFormData } from "@/lib/stores/calc-wizard-stock-normalize";
import { validateStep2 } from "@/lib/calc/stock-transfer-tax-validate";
import {
  BONUS_TAXED_ACTUAL_ONLY_MESSAGE,
  BONUS_TAXED_PRE_DEEMED_FACE_VALUE_REQUIRED_MESSAGE,
} from "@/lib/calc/stock-acquisition-cause";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

function runFullStack(form: StockTransferFormData) {
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(buildStockTransferApiBody(form));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" | "));
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  return calculateStockTransferTax(buildEngineInput(coerced));
}

/** 코스피 1,000주 · 1980-06-01 취득 · 2025-12-01 양도 2억 · 환산 ① = 2억 × 20,000 ÷ 100,000 = 40,000,000 */
function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "테스트",
    marketType: "kospi",
    isMajorShareholder: true,
    selfShareRatio: "20",
    selfMarketCap: "0",
    totalIssuedShares: "10000",
    priorYearEndDate: "2024-12-31",
    acquisitionDate: "1980-06-01",
    transferDate: "2025-12-01",
    shareCount: "1000",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: "200000000",
    acquisitionMode: "estimated",
    acquisitionActualInputMode: "per_share",
    acquisitionStdMode: "monthly_avg",
    transferStdInputMode: "direct",
    acquisitionStdInputMode: "direct",
    transferDatePriceAvg1Month: "100000",
    acquisitionDatePriceAvg1Month: "20000",
    acquisitionCause: "bonus_taxed",
    preDeemedActualPricePerShare: "500",
    filingType: "preliminary",
    filingDate: "2026-02-28",
    ...o,
  } as StockTransferFormData;
}

const messages = (f: StockTransferFormData) =>
  validateStep2(f).filter((e) => e.severity === "error").map((e) => e.message);

describe("PD-1 ⑧ — 의제취득일 전이면 추계 모드를 막지 않는다", () => {
  it.each(["estimated", "sale_case"] as const)("1980 과세 무상주 + %s → 추계 차단 없음", (mode) => {
    expect(messages(form({ acquisitionMode: mode }))).not.toContain(BONUS_TAXED_ACTUAL_ONLY_MESSAGE);
  });
  it("2010 과세 무상주 + 환산 → 종전대로 차단 (PR-3 회귀 없음)", () => {
    expect(messages(form({ acquisitionDate: "2010-06-01" }))).toContain(BONUS_TAXED_ACTUAL_ONLY_MESSAGE);
  });
});

describe("PD-2 ③ 복원", () => {
  const restore = (f: StockTransferFormData) => normalizeStockFormData(JSON.parse(JSON.stringify(f)));
  it("1980 과세 무상주 + 환산 저장분 → 보존", () => {
    expect(restore(form()).acquisitionMode).toBe("estimated");
  });
  it("2010 과세 무상주 + 환산 저장분 → 실가", () => {
    expect(restore(form({ acquisitionDate: "2010-06-01" })).acquisitionMode).toBe("actual");
  });
});

describe("PD-3 엔진 — 매수와 같은 ①·② 비교", () => {
  it("1980 과세 무상주 환산 + 액면가 500 → 매수(같은 입력)와 결과 동일 · ① 40,000,000 채택", () => {
    const bonus = runFullStack(form());
    const purchase = runFullStack(form({ acquisitionCause: "purchase" }));
    expect(bonus.preDeemedAcquisitionDetail).toMatchObject({ clause1Amount: 40_000_000, selected: "clause1" });
    expect(bonus.preDeemedAcquisitionDetail?.clause2Amount).toBeGreaterThan(0);
    expect(bonus.acquisitionPrice).toBe(purchase.acquisitionPrice);
    expect(bonus.calculatedTax).toBe(purchase.calculatedTax);
  });
});

describe("PD-4 ⑧ — ② 액면가액 필수 (과세 무상주 한정)", () => {
  it("1980 과세 무상주 + 환산 + 액면가 비움 → 차단", () => {
    expect(messages(form({ preDeemedActualPricePerShare: "" }))).toContain(
      BONUS_TAXED_PRE_DEEMED_FACE_VALUE_REQUIRED_MESSAGE,
    );
  });
  it("매수는 종전대로 선택 입력", () => {
    expect(messages(form({ acquisitionCause: "purchase", preDeemedActualPricePerShare: "" }))).not.toContain(
      BONUS_TAXED_PRE_DEEMED_FACE_VALUE_REQUIRED_MESSAGE,
    );
  });
  it("실가 모드는 입력한 액면가가 곧 ② — 별도 칸 불필요", () => {
    expect(
      messages(form({ acquisitionMode: "actual", perShareAcquisitionPrice: "500", preDeemedActualPricePerShare: "" })),
    ).not.toContain(BONUS_TAXED_PRE_DEEMED_FACE_VALUE_REQUIRED_MESSAGE);
  });
});
