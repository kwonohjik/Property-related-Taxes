/**
 * Pre-Do anchor — §111③ 기납부세액의 **전송 축**(④⑬)과 **제외 가드**
 *
 * 계획서: `docs/00-pm/stock-history-aggregate-filing.plan.md` §4.3 (PR-2)
 *
 * ## 🔴 「확정신고에서만」이라고 적는 것으로는 부족하다
 *
 * 계획서가 어떤 축을 「이 조건에서만」이라고 정하면 **그 제외를 강제하는 가드를 코드에
 * 넣어야 한다** — 안 넣으면 stale 폼 값이 그 축을 조용히 켠다
 * ([[feedback_plan_exclusion_decision_needs_a_code_gate]], PR #1607 실측).
 *
 * 여기서 켜지면 안 되는 경우가 셋이다:
 *   ① 예정신고·수정신고 — §111③은 **확정신고납부** 규정이다
 *   ② 단건(종목 1건) — 합산 경로가 아니고, §173⑤3호의 확정신고 의무 요건이 「2회 이상」이다
 *   ③ 국외주식만인 신고 — §105① 본문 괄호로 예정신고 자체가 없어 기납부가 존재할 수 없다
 *
 * `filingType`은 `carryFilingFields`로 승계되지만 **편집기 종목이 신고 축의 정본**이다
 * (`pickFilingAxisInput`과 같은 층위) — `forms.at(-1)`을 본다.
 */
import { describe, it, expect } from "vitest";
import { buildStockAggregateFilingPayload } from "@/lib/calc/stock-preliminary-paid";
import { stockTransferAggregateInputSchema } from "@/lib/api/stock-transfer-tax-schema";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "삼성전자",
    marketType: "kospi",
    transferDate: "2024-06-01",
    // Zod 필수 3건 — 손으로 빠뜨리면 「신규 필드 탓」인지 「픽스처 탓」인지 갈리지 않는다
    acquisitionDate: "2022-01-01",
    priorYearEndDate: "2023-12-31",
    transferTotalPrice: "40,000,000",
    filingType: "final",
    preliminaryPaidTax: "3,000,000",
    preliminaryPaidLocalTax: "300,000",
    ...o,
  } as StockTransferFormData;
}

describe("§111③ 기납부세액 전송 축 anchor", () => {
  it("D-6 확정신고 + 다종목이면 실린다", () => {
    const p = buildStockAggregateFilingPayload([form(), form()]);
    expect(p).toEqual({ preliminaryPaidTax: 3_000_000, preliminaryPaidLocalTax: 300_000 });
  });

  it("D-7 🔴 예정신고면 stale 값이 있어도 **실리지 않는다**", () => {
    expect(buildStockAggregateFilingPayload([form(), form({ filingType: "preliminary" })])).toEqual({});
  });

  it("D-7a 수정신고도 마찬가지다 — §111③은 확정신고납부 규정이다", () => {
    expect(buildStockAggregateFilingPayload([form(), form({ filingType: "revised" })])).toEqual({});
  });

  it("D-8 🔴 단건(종목 1건)이면 실리지 않는다", () => {
    expect(buildStockAggregateFilingPayload([form()])).toEqual({});
  });

  it("D-9 🔴 국외주식만인 신고는 예정신고 자체가 없어 실리지 않는다 (§105① 본문 괄호)", () => {
    const foreign = form({ marketType: "foreign_stock" });
    expect(buildStockAggregateFilingPayload([foreign, foreign])).toEqual({});
  });

  it("D-9a 국내 종목이 하나라도 섞이면 예정신고가 성립해 실린다", () => {
    const foreign = form({ marketType: "foreign_stock" });
    expect(buildStockAggregateFilingPayload([foreign, form()])).toEqual({
      preliminaryPaidTax: 3_000_000,
      preliminaryPaidLocalTax: 300_000,
    });
  });

  it("D-10 신고 축은 **편집기(마지막) 종목**이 정본이다", () => {
    // 앞 종목에 옛 filingType이 남아 있어도 편집기가 확정신고면 실린다
    const stale = form({ filingType: "preliminary" });
    expect(buildStockAggregateFilingPayload([stale, form()])).toEqual({
      preliminaryPaidTax: 3_000_000,
      preliminaryPaidLocalTax: 300_000,
    });
  });

  it("D-11 값이 0이거나 비면 필드를 싣지 않는다 (빈 행 방지)", () => {
    expect(buildStockAggregateFilingPayload([form({ preliminaryPaidTax: "0" }), form({ preliminaryPaidTax: "0", preliminaryPaidLocalTax: "0" })])).toEqual({});
  });

  /**
   * ⑫ — leaf만 보면 Zod를 안 탄다. 스키마가 필드를 **모르면 침묵 strip**되어
   * 엔진에 도달하지 않는다([[feedback_leaf_anchor_skips_zod_layer]]).
   */
  it("D-12 🔴 Zod가 신고 단위 기납부 필드를 통과시킨다 (⑫ 침묵 strip 방지)", () => {
    // 종목은 **실제 전송 빌더**로 만든다 — 손으로 적으면 스키마가 요구하는 필드를 빠뜨려
    // 「Zod가 거부한다」가 신규 필드 탓인지 픽스처 탓인지 갈리지 않는다.
    const parsed = stockTransferAggregateInputSchema.safeParse({
      items: [buildStockTransferApiBody(form()), buildStockTransferApiBody(form())],
      deductionMode: "aggregate",
      preliminaryPaidTax: 3_000_000,
      preliminaryPaidLocalTax: 300_000,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.preliminaryPaidTax).toBe(3_000_000);
      expect(parsed.data.preliminaryPaidLocalTax).toBe(300_000);
    }
  });

  it("D-12a 음수는 거부한다", () => {
    const bad = stockTransferAggregateInputSchema.safeParse({
      items: [],
      deductionMode: "aggregate",
      preliminaryPaidTax: -1,
    });
    expect(bad.success).toBe(false);
  });
});
