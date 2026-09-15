/**
 * ⑥ 사이드바 필요경비 합계 — 추계 3종의 개산공제(§163⑥) anchor.
 *
 * 계획서: docs/00-pm/transfer-appraisal-salescase-lump-sum-deduction.plan.md §7.3
 *
 * ## 결함 (수정 전 실측 — 자본적지출 5,000,000 · 양도비 2,000,000 입력 시)
 * | 모드 | 사이드바 | 엔진 | 법정 |
 * |---|---|---|---|
 * | 환산   | 3,000,000 / 300,000 | 동일 | ✅ |
 * | 감정   | 3,000,000 / 300,000 | **0** | 사이드바가 맞고 결과가 틀렸다(④ 결함) |
 * | 매매사례 | **7,000,000** | **0** | **양쪽 다 틀렸다** |
 *
 * 분기가 `useEstimatedAcquisition || isAppraisalAcquisition`이라 매매사례만 빠져 **실경비
 * fallback**(자본적지출+양도비)을 실었다. 율도 손으로 적혀 있어 §163⑥4호(1%)를 보지 못했다.
 */
import { describe, it, expect } from "vitest";

import { computeTransferSummary } from "@/lib/stores/calc-wizard-store";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

function form(over: Partial<AssetForm>, isUnregistered = false): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-02-16";
  f.contractTotalPrice = "200,000,000";
  f.isUnregistered = isUnregistered;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2017-03-09",
    actualSalePrice: "200,000,000",
    fixedAcquisitionPrice: "100,000,000",
    standardPriceAtAcq: "100000000",
    standardPriceAtTransfer: "150000000",
    // 실경비 fallback이 섞이면 즉시 드러나도록 일부러 채운다 (합계 7,000,000)
    capitalExpenditure: "5,000,000",
    transferExpense: "2,000,000",
    ...over,
  };
  return f;
}

const SALES_CASE = { isSalesCaseAcquisition: true, similarSalesValue: "100,000,000" } as const;
const APPRAISAL = { isAppraisalAcquisition: true } as const;
const ESTIMATED = { useEstimatedAcquisition: true } as const;

describe("A-7/A-8 — ⑥ 사이드바 개산공제", () => {
  it("A-7: 매매사례 → 개산공제 3,000,000 (실경비 7,000,000이 **아니다**)", () => {
    const s = computeTransferSummary(form(SALES_CASE), null);
    expect(s.totalNecessaryExpense).toBe(3_000_000);
  });

  it("A-7b: 감정·환산도 같은 값 — 세 방식이 §97②2호 본문에서 한 묶음이다", () => {
    for (const mode of [APPRAISAL, ESTIMATED]) {
      expect(computeTransferSummary(form(mode), null).totalNecessaryExpense).toBe(3_000_000);
    }
  });

  it("A-8a: 미등기 → 0.3% (§163⑥1호·2호 단서) — 세 방식 모두", () => {
    for (const mode of [SALES_CASE, APPRAISAL, ESTIMATED]) {
      expect(computeTransferSummary(form(mode, true), null).totalNecessaryExpense).toBe(300_000);
    }
  });

  it("A-8b: 분양권은 §163⑥**4호 1%** — 미등기여도 1%다(4호에 단서가 없다)", () => {
    for (const unreg of [false, true]) {
      const s = computeTransferSummary(form({ ...SALES_CASE, assetKind: "presale_right" }, unreg), null);
      expect(s.totalNecessaryExpense, `미등기=${unreg}`).toBe(1_000_000);
    }
  });

  it("A-8c: 실거래가 모드는 종전대로 실경비 합계 — 개산공제로 바뀌지 않는다", () => {
    expect(computeTransferSummary(form({}), null).totalNecessaryExpense).toBe(7_000_000);
  });
});
