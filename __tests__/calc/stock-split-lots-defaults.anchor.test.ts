/**
 * 분할 매수·분할 양도 — 폼 기본 입력 방식이 「합계 직접 입력」이어도 계산된다 (D-4)
 *
 * 계획서 `docs/00-pm/stock-split-lots-ui-bugfix.plan.md` §1 D-4 · §2 F-4
 *
 *   SL-1  새 폼(입력 방식 기본값 total) + 분할 입력 → ④ → ⑫ Zod 통과 → 엔진 FIFO 정답
 *   SL-2  저장 이력 복원(split + total 이 기록된 레코드) → ③ normalize → ④ → ⑫ 통과
 *   SL-3  분할 body 에는 합계 직접 입력 값이 실리지 않는다 (화면에 없는 칸)
 *
 * 종전: 폼 기본값(`transferActualInputMode`·`acquisitionActualInputMode` = "total")이 그대로
 * body 에 실려 Zod 분할 방어선(`stock-transfer-tax-refines.ts`)이 거부했다 — 화면은 「Validation failed」.
 * ⑧ validate 는 분할 모드에서 입력 방식을 보지 않아 UI 는 통과시켰다.
 */

import { describe, it, expect } from "vitest";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { formatStockApiError } from "@/lib/calc/stock-transfer-tax-api";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { normalizeStockFormData } from "@/lib/stores/calc-wizard-stock-normalize";
import { previewSplitAllocation } from "@/lib/calc/stock-split-preview";
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

describe("분할 모드 × 입력 방식 기본값 (D-4)", () => {
  it("SL-1 새 폼 기본값(total)이어도 분할 입력만으로 계산된다 — FIFO 8,000×10,000 + 2,000×12,000", () => {
    const initial = createInitialStockFormData();
    // 전제: 이 anchor 가 지키는 기본값 — 바뀌면 SL-1 이 더는 회귀를 재현하지 않는다
    expect(initial.transferActualInputMode).toBe("total");
    expect(initial.acquisitionActualInputMode).toBe("total");

    const { result } = runFullStack(reportedSplitForm());
    expect(result.transferPrice).toBe(200_000_000);
    expect(result.acquisitionPrice).toBe(104_000_000);
    expect(result.transferIncome).toBe(96_000_000);
  });

  it("SL-2 split + total 이 기록된 저장 이력도 복원 후 계산된다", () => {
    const stored = JSON.parse(
      JSON.stringify(
        reportedSplitForm({ transferActualInputMode: "total", acquisitionActualInputMode: "total" }),
      ),
    );
    const restored = normalizeStockFormData(stored);
    expect(restored.lotsMode).toBe("split");
    const { result } = runFullStack(restored);
    expect(result.acquisitionPrice).toBe(104_000_000);
  });

  it("SL-3 분할 body 에는 합계 직접 입력 값이 실리지 않는다", () => {
    const { body } = runFullStack(
      reportedSplitForm({ transferTotalPrice: "999", acquisitionTotalPrice: "888" }),
    );
    expect(body.transferActualInputMode).toBe("per_share");
    expect(body.acquisitionActualInputMode).toBe("per_share");
    expect(body.transferTotalPrice).toBeUndefined();
    expect(body.acquisitionTotalPrice).toBeUndefined();
  });
});

/**
 * SP-* 미리보기(⑤ Step2 카드 · ⑥ 사이드바)는 엔진 결과와 **같은 값**이어야 한다 (D-3 · F-3)
 * 종전 사이드바: Σ(전 매수 lot) = 196,000,000 — 매도 수량·산정방법 무시.
 */
describe("분할 미리보기 = 엔진 결과 (D-3)", () => {
  const cases: [string, Partial<StockTransferFormData>][] = [
    ["선입선출", { costAllocationMethod: "fifo" }],
    ["이동평균", { costAllocationMethod: "moving_avg" }],
    [
      "개별법",
      {
        costAllocationMethod: "specific",
        specificMatchings: [
          { transferLotId: "t1", acquisitionLotId: "a2", shareCount: "8000" },
          { transferLotId: "t1", acquisitionLotId: "a1", shareCount: "2000" },
        ],
      },
    ],
    [
      "자본준비금 무상증자 50% (발생일 이전 보유 lot 희석)",
      {
        costAllocationMethod: "fifo",
        capitalAdjustments: [
          { type: "bonus_capital_reserve", eventDate: "2024-06-01", ratio: "0.5", notes: "" },
        ],
      },
    ],
  ];

  it.each(cases)("SP-1 %s — 미리보기 양도가액·취득가액 = 엔진 결과", (_label, o) => {
    const form = reportedSplitForm(o);
    const preview = previewSplitAllocation(form);
    const { result } = runFullStack(form);
    expect(preview).not.toBeNull();
    expect(preview!.totalTransferPrice).toBe(result.transferPrice);
    expect(preview!.totalAcquisitionPrice).toBe(result.acquisitionPrice);
  });

  it("SP-2 제보 사례 선입선출 취득가액은 104,000,000 (전 매수 합계 196,000,000 이 아니다)", () => {
    expect(previewSplitAllocation(reportedSplitForm())!.totalAcquisitionPrice).toBe(104_000_000);
  });

  it("SP-3 입력이 덜 채워졌거나 개별법 배정이 모자라면 null — 부분 합계를 보여주지 않는다", () => {
    const base = reportedSplitForm();
    expect(
      previewSplitAllocation({
        ...base,
        transferLots: [{ ...base.transferLots[0], transferDate: "2026-05" }],
      }),
    ).toBeNull();
    expect(
      previewSplitAllocation({
        ...base,
        costAllocationMethod: "specific",
        specificMatchings: [{ transferLotId: "t1", acquisitionLotId: "a1", shareCount: "3000" }],
      }),
    ).toBeNull();
    expect(previewSplitAllocation({ ...base, lotsMode: "single" })).toBeNull();
  });
});

describe("오류 응답 메시지 (D-4 부수)", () => {
  it("ER-1 Zod issues 가 있으면 「Validation failed」 대신 사유를 보여준다(중복 제거)", () => {
    const msg = formatStockApiError(
      { error: "Validation failed", issues: [{ message: "가" }, { message: "나" }, { message: "가" }] },
      400,
    );
    expect(msg).toBe("입력값을 확인하세요: 가 · 나");
    expect(formatStockApiError({ error: "Validation failed" }, 400)).toBe("Validation failed");
    expect(formatStockApiError({}, 500)).toBe("HTTP 500");
  });
});
