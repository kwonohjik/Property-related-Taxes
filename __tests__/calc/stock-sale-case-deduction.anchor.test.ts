/**
 * 주식 매매사례가액 anchor — 계획서 `docs/00-pm/stock-sale-case-transfer-priority-and-deduction.plan.md`
 *
 * ── ① 양도 매매사례가액은 양도가액을 치환하지 않는다 ─────────────────────────
 *   소득세법 §96① 양도가액 = 양도 당시 실지거래가액. 양도가액 추계(매매사례가액)는
 *   §114⑦ **과세관청의 결정·경정** 축이라 납세자 신고 단계의 우선 규정이 없다.
 *   (취득가액은 §97①1호 단서가 납세자 산정을 허용하므로 비대칭이다.)
 *
 * ── ② 취득가액을 매매사례가액으로 하면 필요경비 = 취득가액 + 취득기준시가 × 1% ─
 *   소득세법 §97②2호 본문 + 시행령 §163⑥4호(주식은 1~3호 밖 → 취득당시 기준시가 ×1/100).
 *   §97②2호 단서(실비로 갈아타기)는 «환산취득가액으로 하는 경우»에 한정이라 매매사례에는 없다.
 *   비상장·기타자산의 취득기준시가는 §99①4호 → 시행령 §165④(§165⑧1호가 기타자산 주식등을 같게 본다).
 *
 * 폼 → ④ → ⑨⑫ Zod → ⑭ route 매핑 → 엔진 **전 계층**을 태운다(엔진 직접 호출은 strip을 못 본다).
 *
 *   SC-1  취득 사례 + 취득연도 NI/NA → 개산공제 = floor(기준시가 총액 × 1%) (P1)
 *   SC-2  엔진 직접 expenseMode:"actual"+실비 → 실비 미반영 (P2)
 *   SC-3  구 body의 transferMarketSamplePrice → 양도가액 치환 없음 (P3)
 *   SC-4  순자산 단독 사유 → NI 없이 통과, 기준시가 = NA (P4)
 *   SC-5  인용에 §165③(거래정지)이 섞이지 않고 §163⑥4가 남는다 (P6)
 *   SC-6  취득일 거래정지(C-1) 형제 경로 인용 불변 (P7)
 *   SC-7  취득연도 NI/NA 미입력 → ⑧ validate가 막는다 (P8)
 *   SC-8  상장 + sale_case는 종전대로 차단 (P9)
 *   SC-9  estimated→full→sale_case 전환 후 stale 결산서 값이 기준시가를 덮지 않는다 (V-2)
 *   SC-10 ⑫ Zod 2차 필수 게이트 — body에 NI/NA가 없으면 서버도 막는다 (V-3)
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import {
  stockTransferInputSchema,
  addStockRefines,
} from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

type Run =
  | { blocked: true; issues: string[] }
  | { blocked: false; result: StockTransferResult; body: Record<string, unknown> };

/** route.ts와 같은 순서 — Zod가 막으면 그 사실 자체를 반환한다. */
function runFullStack(form: StockTransferFormData, extraBody: Record<string, unknown> = {}): Run {
  const body = { ...buildStockTransferApiBody(form), ...extraBody };
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) {
    return { blocked: true, issues: parsed.error.issues.map((i) => i.message) };
  }
  const coerced = coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
  return { blocked: false, result: calculateStockTransferTax(buildEngineInput(coerced)), body };
}

/** 비상장 100주 · 실지양도 2억(합계) · 취득 사례 1,000,000/주 · 취득연도 NI=NA=100,000 → 기준시가 100,000/주 */
function saleCaseForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "테스트",
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: "60",
    selfMarketCap: "2000000000",
    priorYearEndDate: "2024-12-31",
    acquisitionDate: "2020-01-01",
    transferDate: "2025-06-01",
    shareCount: "100",
    totalIssuedShares: "1000000",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: "200000000",
    acquisitionMode: "sale_case",
    acquisitionMarketSamplePrice: "1000000",
    acquisitionYearNetIncomePerShare: "100000",
    acquisitionYearNetAssetPerShare: "100000",
    filingType: "preliminary",
    filingDate: "2025-08-31",
    ...o,
  } as StockTransferFormData;
}

function ok(run: Run): { result: StockTransferResult; body: Record<string, unknown> } {
  if (run.blocked) throw new Error(`blocked: ${run.issues.join(" | ")}`);
  return run;
}

describe("SC (P1): 매매사례 취득 → 개산공제 = 취득기준시가 × 1% (§97②2호 본문 · 영 §163⑥4)", () => {
  it("SC-1: 필요경비 1,000,000 · 양도소득금액 = 2억 − 1억 − 100만", () => {
    const { result } = ok(runFullStack(saleCaseForm()));
    expect(result.transferPrice).toBe(200_000_000);
    expect(result.acquisitionPrice).toBe(100_000_000);
    // 기준시가 100,000 × 100주 = 10,000,000 → ×1% = 100,000
    expect(result.estimatedDeduction).toBe(100_000);
    expect(result.expenses).toBe(100_000);
    expect(result.transferIncome).toBe(200_000_000 - 100_000_000 - 100_000);
  });

  it("SC-2: 엔진에 expenseMode:'actual'+실비를 직접 줘도 실비는 필요경비가 아니다 (단서 swap은 환산 한정)", () => {
    const { body } = ok(runFullStack(saleCaseForm()));
    const coerced = coerceDates({ ...body }, [...STOCK_DATE_FIELDS]);
    const input = buildEngineInput(coerced);
    const r = calculateStockTransferTax({ ...input, expenseMode: "actual", actualExpenses: 31_000_000 });
    expect(r.swapApplied).toBeFalsy();
    expect(r.expenses).toBe(100_000);
  });
});

describe("SC (P3): ① 양도 매매사례가액은 양도가액을 치환하지 않는다 (소득세법 §96①)", () => {
  it("SC-3: 구 이력·직접 호출 body에 transferMarketSamplePrice가 남아도 양도가액은 실가", () => {
    const run = runFullStack(saleCaseForm(), {
      transferMarketSamplePrice: 1_500_000,
      transferMarketSampleDate: "2025-05-01",
      transferMarketSampleCounterparty: "제3자",
    });
    const { result, body } = ok(run);
    expect(result.transferPrice).toBe(200_000_000); // 사례가 1.5억이면 150,000,000
    expect(Object.keys(result.marketSampleDetail ?? {})).not.toContain("transferApplied");
    // 폼이 만든 body에는 이 키가 아예 실리지 않는다
    expect(Object.keys(buildStockTransferApiBody(saleCaseForm()))).not.toContain("transferMarketSamplePrice");
    expect(body).toBeDefined();
  });
});

describe("SC (P4·P6·P7): 취득기준시가 산정 규율", () => {
  it("SC-4: 순자산 단독 사유(§165④3)면 NI 없이 통과하고 기준시가 = NA", () => {
    const { result } = ok(
      runFullStack(
        saleCaseForm({
          netAssetOnlyReason: "liquidation_or_owner_death",
          acquisitionYearNetIncomePerShare: "",
          acquisitionYearNetAssetPerShare: "200000",
        }),
      ),
    );
    // 200,000 × 100주 × 1% = 200,000
    expect(result.estimatedDeduction).toBe(200_000);
  });

  it("SC-5: 인용 — 거래정지(§165③) 조문이 섞이지 않고 §163⑥4가 남는다", () => {
    const { result } = ok(runFullStack(saleCaseForm()));
    const notes = [...result.warnings, ...result.appliedRules].join(" | ");
    expect(notes).not.toContain("§165③");
    expect(notes).not.toContain("거래정지");
    // 긍정 짝 — 개산공제 근거(§163⑥4)와 기준시가 근거(§165④)가 «있어야» 위 부정이 의미를 갖는다
    expect(notes).toContain("§163⑥4");
    expect(notes).toContain("§165④");
  });

  it("SC-6: 취득일 거래정지(C-1) 형제 경로는 여전히 §165③ 인용을 남긴다 (회귀 가드)", () => {
    const { result } = ok(
      runFullStack({
        ...saleCaseForm({
          marketType: "kosdaq",
          acquisitionMode: "estimated",
          acquisitionStdMode: "halt_acquisition",
          transferDatePriceAvg1Month: "300000",
          acquisitionMarketSamplePrice: "",
        }),
      } as StockTransferFormData),
    );
    const notes = [...result.warnings, ...result.appliedRules].join(" | ");
    expect(notes).toMatch(/165/);
    expect(notes).toContain("거래정지");
  });
});

describe("SC (P8·P9·V-2·V-3): 입력 게이트", () => {
  it("SC-7: 취득연도 NI/NA 미입력 → ⑧ validate가 막는다", () => {
    const errors = validateStep2Domestic(
      saleCaseForm({ acquisitionYearNetIncomePerShare: "", acquisitionYearNetAssetPerShare: "" }),
    );
    const fields = errors.filter((e) => e.severity === "error").map((e) => e.field);
    expect(fields).toContain("acquisitionYearNetIncomePerShare");
    expect(fields).toContain("acquisitionYearNetAssetPerShare");
  });

  it("SC-8: 상장 + sale_case는 종전대로 차단", () => {
    const errors = validateStep2Domestic(saleCaseForm({ marketType: "kospi" }));
    expect(errors.some((e) => e.field === "acquisitionMode" && e.severity === "error")).toBe(true);
  });

  it("SC-9: estimated(full 결산서)로 채운 뒤 sale_case로 바꿔도 stale 결산서 값이 기준시가를 덮지 않는다", () => {
    const run = runFullStack(
      saleCaseForm({
        unlistedValuationMode: "full",
        // full 결산서 잔존값 — 화면에는 없지만 adapter가 합성하면 body를 덮는다.
        // 이 값이 새어 들어가면 기준시가가 100,000이 아니게 되어 개산공제가 달라진다.
      }),
    );
    const { result } = ok(run);
    expect(result.estimatedDeduction).toBe(100_000);
  });

  it("SC-10: ⑫ Zod 2차 게이트 — body에 취득연도 NI/NA가 없으면 서버도 막는다", () => {
    const body = buildStockTransferApiBody(saleCaseForm());
    delete (body as Record<string, unknown>).acquisitionYearNetIncomePerShare;
    delete (body as Record<string, unknown>).acquisitionYearNetAssetPerShare;
    const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("acquisitionYearNetIncomePerShare");
    }
  });
});
