/**
 * 취득원인 — 유상증자·무상증자 (PR-2 · 사용자 결정 A안 + 단건 모드 포함)
 *
 * 계획서 `docs/00-pm/stock-split-lots-ui-bugfix.plan.md` §1 D-1 · §2 F-1
 *
 *   CI-1  단건 유상증자·과세 무상주 → ④ 「매매」로 전송 · 엔진 결과가 매매와 같다
 *   CI-2  분할 lot 의 유상증자·과세 무상주 → 같은 매핑 · 제보 사례 FIFO 104,000,000 불변
 *   CI-3  비과세 무상주(자본준비금 전입)는 ⑧ 세 경로(단건·분할 lot·일자별 다건 lot)가 막는다
 *   CI-4  ⑫ 방어선 — 비과세 무상주 lot 이 body 에 실리면 Zod 가 거부한다
 *   CI-5  분할 모드에 남은 단건 비과세 값(화면에 없음)은 싣지 않는다 — 보이지 않는 400 방지
 *   CI-6  ③ 복원이 새 원인을 「매매」로 바꾸지 않는다 (단건·lot)
 *   CI-7  ⑤⑧ 의제취득일 매수 술어가 ④·엔진과 같은 매핑을 쓴다
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
import { validateStep1, validateStep2 } from "@/lib/calc/stock-transfer-tax-validate";
import { isPreDeemedPurchaseForm } from "@/lib/calc/stock-transfer-section94-4-form";
import { BONUS_UNTAXED_BLOCK_MESSAGE } from "@/lib/calc/stock-acquisition-cause";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { reportedSplitForm } from "./stock-split-lots-fixture";

function runFullStack(form: StockTransferFormData) {
  const body = buildStockTransferApiBody(form);
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) {
    throw new Error(`blocked: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" | ")}`);
  }
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  return { body, result: calculateStockTransferTax(buildEngineInput(coerced)) };
}

/** 단건 — 비상장 대주주 1,000주 · 2025-03-01 취득 1주당 5,000 · 2026-05-10 양도 2억 */
function singleForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "테스트",
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: "20",
    selfMarketCap: "0",
    totalIssuedShares: "10000",
    priorYearEndDate: "2025-12-31",
    acquisitionDate: "2025-03-01",
    transferDate: "2026-05-10",
    shareCount: "1000",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: "200000000",
    acquisitionMode: "actual",
    acquisitionActualInputMode: "per_share",
    perShareAcquisitionPrice: "5000",
    filingType: "preliminary",
    filingDate: "2026-07-31",
    ...o,
  } as StockTransferFormData;
}

const errorsOf = (errs: { field: string; message: string; severity: string }[]) =>
  errs.filter((e) => e.severity === "error");

describe("CI-1 단건 — 유상증자·과세 무상주는 엔진에 「매매」로 간다", () => {
  const purchase = runFullStack(singleForm()).result;

  it.each(["rights_issue", "bonus_taxed"] as const)("%s → body purchase · 세액이 매매와 같다", (cause) => {
    expect(errorsOf(validateStep1(singleForm({ acquisitionCause: cause })))).toEqual([]);
    const { body, result } = runFullStack(singleForm({ acquisitionCause: cause }));
    expect(body.acquisitionCause).toBe("purchase");
    expect(result.acquisitionPrice).toBe(purchase.acquisitionPrice);
    expect(result.calculatedTax).toBe(purchase.calculatedTax);
    // 단기 보유(1년 미만) 판정도 입력한 취득일 기준 — 매매와 같다
    expect(result.calculatedTax).toBeGreaterThan(0);
  });
});

describe("CI-2 분할 lot — 같은 매핑", () => {
  it("매수 #2 유상증자 · #3 과세 무상주 → body lot 원인 purchase · FIFO 104,000,000 불변", () => {
    const base = reportedSplitForm();
    const form = reportedSplitForm({
      acquisitionLots: [
        base.acquisitionLots[0],
        { ...base.acquisitionLots[1], acquisitionCause: "rights_issue" },
        { ...base.acquisitionLots[2], acquisitionCause: "bonus_taxed", perShareAcquisitionPrice: "500" },
      ],
    });
    expect(errorsOf(validateStep1(form))).toEqual([]);
    const { body, result } = runFullStack(form);
    const lots = body.acquisitionLots as { acquisitionCause: string }[];
    expect(lots.map((l) => l.acquisitionCause)).toEqual(["purchase", "purchase", "purchase"]);
    expect(result.acquisitionPrice).toBe(104_000_000);
  });
});

describe("CI-3 비과세 무상주는 ⑧이 막는다 — 세 경로", () => {
  it("단건", () => {
    const errs = errorsOf(validateStep1(singleForm({ acquisitionCause: "bonus_untaxed" })));
    expect(errs).toContainEqual(
      expect.objectContaining({ field: "acquisitionCause", message: BONUS_UNTAXED_BLOCK_MESSAGE }),
    );
  });

  it("분할 lot", () => {
    const base = reportedSplitForm();
    const form = reportedSplitForm({
      acquisitionLots: [base.acquisitionLots[0], base.acquisitionLots[1], { ...base.acquisitionLots[2], acquisitionCause: "bonus_untaxed" }],
    });
    expect(errorsOf(validateStep1(form)).map((e) => e.field)).toContain("acquisitionLots[2].acquisitionCause");
  });

  it("일자별 다건 lot (단건 양도 · 취득 lots)", () => {
    const base = reportedSplitForm();
    const form = singleForm({
      acquisitionActualInputMode: "lots",
      acquisitionLots: [{ ...base.acquisitionLots[0], acquisitionCause: "bonus_untaxed" }],
    });
    expect(errorsOf(validateStep2(form)).map((e) => e.field)).toContain("acquisitionLots[0].acquisitionCause");
  });
});

describe("CI-4 ⑫ 방어선", () => {
  it("비과세 무상주 lot 이 body 에 실리면 Zod 가 거부한다", () => {
    const base = reportedSplitForm();
    const form = reportedSplitForm({
      acquisitionLots: [base.acquisitionLots[0], base.acquisitionLots[1], { ...base.acquisitionLots[2], acquisitionCause: "bonus_untaxed" }],
    });
    const parsed = addStockRefines(stockTransferInputSchema).safeParse(buildStockTransferApiBody(form));
    expect(parsed.success).toBe(false);
  });
});

describe("CI-5 분할 모드에 남은 단건 비과세 값", () => {
  it("화면에 없는 단건 원인이 「비과세 무상주」여도 계산된다(lot 이 정본)", () => {
    const { body, result } = runFullStack(reportedSplitForm({ acquisitionCause: "bonus_untaxed" }));
    expect(body.acquisitionCause).toBe("purchase");
    expect(result.acquisitionPrice).toBe(104_000_000);
    // ⑧ 단건 차단은 단일 모드에서만 — 분할 모드에서 보이지 않는 칸으로 막지 않는다
    expect(errorsOf(validateStep1(reportedSplitForm({ acquisitionCause: "bonus_untaxed" }))).map((e) => e.field))
      .not.toContain("acquisitionCause");
  });
});

describe("CI-6 ③ 복원", () => {
  it.each(["rights_issue", "bonus_taxed", "bonus_untaxed"] as const)("%s — 단건·lot 모두 보존", (cause) => {
    const base = reportedSplitForm();
    const stored = JSON.parse(
      JSON.stringify({
        ...base,
        acquisitionCause: cause,
        acquisitionLots: [{ ...base.acquisitionLots[0], acquisitionCause: cause }],
      }),
    );
    const restored = normalizeStockFormData(stored);
    expect(restored.acquisitionCause).toBe(cause);
    expect(restored.acquisitionLots[0].acquisitionCause).toBe(cause);
  });
});

describe("CI-7 의제취득일 매수 술어 = ④ 매핑", () => {
  it.each(["purchase", "rights_issue", "bonus_taxed"] as const)("%s 1980 취득 → 의제취득일 전 매수", (cause) => {
    expect(isPreDeemedPurchaseForm(singleForm({ acquisitionCause: cause, acquisitionDate: "1980-06-01" }))).toBe(true);
  });
  it("상속은 종전대로 아니다", () => {
    expect(isPreDeemedPurchaseForm(singleForm({ acquisitionCause: "inheritance", acquisitionDate: "1980-06-01" }))).toBe(false);
  });
});
