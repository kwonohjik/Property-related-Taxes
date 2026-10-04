/**
 * 의제취득일 전 매수 × 영 §176의2④ — 입력 게이트·배선 anchor (폼 → ④ → ⑫ Zod → ⑭ → 엔진)
 *
 * 계획서 `docs/00-pm/stock-pre-deemed-acquisition-176-2-4.plan.md` §5.4 · §6
 *
 *   GZ-1  실가 모드 1975-06 매수 → ④ body에 신규 필드 없음 · 엔진 ② 28,716,638 (끝까지 관통)
 *   GZ-2  환산 모드 + 취득 당시 실가 → ④가 전송 · 엔진이 ①·② 견줌 / 실가 비움 → ①만(종전)
 *   GZ-3  의제 대상이 아니면(2010 취득·증여) stale 입력을 보내지 않는다
 *   GZ-4  1965.01 이전 취득 — ⑧·⑫ 배율 필수(실가 모드 항상 · 환산은 실가 동시 입력 시) · 입력하면 통과
 *   GZ-5  ③ 복원 — 신규 2필드 보존
 *   GZ-6  lots-only·분할은 범위 밖
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
import { normalizeStockFormData } from "@/lib/stores/calc-wizard-stock-normalize";
import { isPreDeemedPurchaseForm } from "@/lib/calc/stock-transfer-section94-4-form";
import { PRE_DEEMED_PPI_RATIO_REQUIRED_MESSAGE } from "@/lib/tax-engine/stock-transfer/stock-pre-deemed-acquisition";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

type Run =
  | { blocked: true; paths: string[] }
  | { blocked: false; result: StockTransferResult; body: Record<string, unknown> };

function runFullStack(form: StockTransferFormData): Run {
  const body = buildStockTransferApiBody(form);
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) return { blocked: true, paths: parsed.error.issues.map((i) => i.path.join(".")) };
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  return { blocked: false, result: calculateStockTransferTax(buildEngineInput(coerced)), body };
}
function ok(run: Run) {
  if (run.blocked) throw new Error(`blocked: ${run.paths.join(", ")}`);
  return run;
}

/** 비상장 1,000주 · 양도 2억 · 1975-06-01 매수 · 실가 10,000/주 · 양도 2025-12-01 */
function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "테스트",
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: "20",
    selfMarketCap: "0",
    totalIssuedShares: "10000",
    priorYearEndDate: "2024-12-31",
    acquisitionDate: "1975-06-01",
    transferDate: "2025-12-01",
    shareCount: "1000",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: "200000000",
    acquisitionMode: "actual",
    acquisitionActualInputMode: "per_share",
    perShareAcquisitionPrice: "10000",
    filingType: "preliminary",
    filingDate: "2026-02-28",
    ...o,
  } as StockTransferFormData;
}

/** 코스피 환산 — ① = 양도가액 × 취득 종가평균 ÷ 양도 종가평균 = 200,000,000 × 20,000 ÷ 100,000 = 40,000,000 */
const LISTED_ESTIMATED: Partial<StockTransferFormData> = {
  marketType: "kospi",
  acquisitionDate: "1980-06-01",
  acquisitionMode: "estimated",
  acquisitionStdMode: "monthly_avg",
  transferStdInputMode: "direct",
  acquisitionStdInputMode: "direct",
  transferDatePriceAvg1Month: "100000",
  acquisitionDatePriceAvg1Month: "20000",
};
const errFields = (errs: { field: string; severity: string }[]) =>
  errs.filter((e) => e.severity === "error").map((e) => e.field);

describe("GZ-1: 실가 모드 — 폼에서 엔진까지 ② 관통", () => {
  it("1975-06 매수 → 취득가액 28,716,638 · body에 신규 필드 없음", () => {
    const { result, body } = ok(runFullStack(form()));
    expect(result.acquisitionPrice).toBe(28_716_638);
    expect(result.preDeemedAcquisitionDetail?.selected).toBe("clause2");
    expect(body).not.toHaveProperty("preDeemedActualPricePerShare");
    expect(body).not.toHaveProperty("preDeemedPpiRatio");
  });
  it("⑧ 오류 없음", () => {
    expect(errFields(validateStep2Domestic(form()))).not.toContain("preDeemedPpiRatio");
  });
});

describe("GZ-2: 환산 모드 + 취득 당시 실가 — ①과 ②를 견준다", () => {
  it("실가 10,000 입력 → body 전송 · ① 40,000,000 채택 (② 12,910,390)", () => {
    const { result, body } = ok(runFullStack(form({ ...LISTED_ESTIMATED, preDeemedActualPricePerShare: "10000" })));
    expect(body.preDeemedActualPricePerShare).toBe(10_000);
    expect(result.preDeemedAcquisitionDetail).toMatchObject({
      clause1Amount: 40_000_000,
      clause2Amount: 12_910_390,
      selected: "clause1",
    });
    expect(result.acquisitionPrice).toBe(40_000_000);
  });
  it("긍정 짝 — 실가를 비우면 ①만(종전 동작) · body 미전송", () => {
    const { result, body } = ok(runFullStack(form(LISTED_ESTIMATED)));
    expect(body).not.toHaveProperty("preDeemedActualPricePerShare");
    expect(result.preDeemedAcquisitionDetail).toBeUndefined();
    expect(result.acquisitionPrice).toBe(40_000_000);
  });
});

describe("GZ-3: 의제 대상이 아니면 stale 입력을 보내지 않는다", () => {
  it("2010년 매수 + 입력돼 있던 실가·배율 → body 미전송 · 취득가액 그대로", () => {
    const f = form({
      ...LISTED_ESTIMATED,
      acquisitionDate: "2010-06-01",
      preDeemedActualPricePerShare: "10000",
      preDeemedPpiRatio: "3",
    });
    const { body, result } = ok(runFullStack(f));
    expect(body).not.toHaveProperty("preDeemedActualPricePerShare");
    expect(body).not.toHaveProperty("preDeemedPpiRatio");
    expect(result.preDeemedAcquisitionDetail).toBeUndefined();
  });
  it("증여(수증일이 의제취득일 전이어도) — 매수가 아니므로 해당 없음", () => {
    expect(isPreDeemedPurchaseForm(form({ acquisitionCause: "gift" }))).toBe(false);
    expect(isPreDeemedPurchaseForm(form({ acquisitionCause: "inheritance" }))).toBe(false);
    expect(isPreDeemedPurchaseForm(form())).toBe(true);
  });
  it("국외주식·국외전출세는 별도 엔진 — 해당 없음", () => {
    expect(isPreDeemedPurchaseForm(form({ marketType: "foreign_stock" }))).toBe(false);
    expect(isPreDeemedPurchaseForm(form({ marketType: "exit_tax" }))).toBe(false);
  });
});

describe("GZ-4: 1965.01 이전 취득 — 직접 입력 배율 (계획서 Q-4)", () => {
  const OLD = { acquisitionDate: "1964-12-01" };
  it("실가 모드 + 배율 미입력 → ⑧ 오류 · ⑫ 차단", () => {
    const f = form(OLD);
    const errs = validateStep2Domestic(f).filter((e) => e.field === "preDeemedPpiRatio");
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toBe(PRE_DEEMED_PPI_RATIO_REQUIRED_MESSAGE);
    const run = runFullStack(f);
    expect(run.blocked).toBe(true);
    if (run.blocked) expect(run.paths).toContain("preDeemedPpiRatio");
  });
  it("배율 3.5 입력 → 통과 · 엔진 ② = 35,000,000", () => {
    const f = form({ ...OLD, preDeemedPpiRatio: "3.5" });
    expect(errFields(validateStep2Domestic(f))).not.toContain("preDeemedPpiRatio");
    const { result, body } = ok(runFullStack(f));
    expect(body.preDeemedPpiRatio).toBe(3.5);
    expect(result.acquisitionPrice).toBe(35_000_000);
    expect(result.preDeemedAcquisitionDetail?.ratioSource).toBe("override");
  });
  it("환산 모드 — 실가를 함께 입력하지 않으면 ②가 없으므로 배율을 요구하지 않는다", () => {
    const f = form({ ...LISTED_ESTIMATED, ...OLD });
    expect(errFields(validateStep2Domestic(f))).not.toContain("preDeemedPpiRatio");
    expect(runFullStack(f).blocked).toBe(false);
  });
  it("환산 모드 + 실가 입력 → 배율 필요 (⑧·⑫ 같은 조건)", () => {
    const f = form({ ...LISTED_ESTIMATED, ...OLD, preDeemedActualPricePerShare: "10000" });
    expect(errFields(validateStep2Domestic(f))).toContain("preDeemedPpiRatio");
    const run = runFullStack(f);
    expect(run.blocked).toBe(true);
    if (run.blocked) expect(run.paths).toContain("preDeemedPpiRatio");
  });
  it("1965-01 이후 취득은 배율을 요구하지 않는다 (표로 산정)", () => {
    expect(errFields(validateStep2Domestic(form({ acquisitionDate: "1965-01-15" })))).not.toContain("preDeemedPpiRatio");
  });
});

describe("GZ-5: ③ 복원 — 신규 필드 보존", () => {
  it("round trip", () => {
    const n = normalizeStockFormData(form({ preDeemedActualPricePerShare: "12345", preDeemedPpiRatio: "2.75" }));
    expect(n.preDeemedActualPricePerShare).toBe("12345");
    expect(n.preDeemedPpiRatio).toBe("2.75");
  });
  it("저장본에 키가 없으면(구 이력) 빈 값", () => {
    const old = { ...form() } as Record<string, unknown>;
    delete old.preDeemedActualPricePerShare;
    delete old.preDeemedPpiRatio;
    const n = normalizeStockFormData(old);
    expect(n.preDeemedActualPricePerShare).toBe("");
    expect(n.preDeemedPpiRatio).toBe("");
  });
});

describe("GZ-6: lots-only·분할은 범위 밖 (엔진 isSplitMode와 같은 경계)", () => {
  it("실가 입력 방식이 lots면 해당 없음", () => {
    expect(isPreDeemedPurchaseForm(form({ acquisitionActualInputMode: "lots" }))).toBe(false);
  });
  it("분할 모드(lotsMode split)면 해당 없음", () => {
    expect(isPreDeemedPurchaseForm(form({ lotsMode: "split" }))).toBe(false);
  });
});
