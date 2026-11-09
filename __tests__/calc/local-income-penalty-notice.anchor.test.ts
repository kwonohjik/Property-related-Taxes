/**
 * US-29 anchor — 양도소득분 지방소득세 가산세(지방세기본법 §53~§55) 「포함됨 + 가정·확인 필요」 고지.
 * 엔진이 지방 가산세를 산정해 총 납부세액에 더한다(`transfer-tax-local-income-penalty.ts`) — 고지는 그 가정을 밝힌다.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LOCAL_INCOME_PENALTY_AMENDMENT_NOTICE,
  LOCAL_INCOME_PENALTY_INPUT_NOTICE,
  LOCAL_INCOME_PENALTY_NOTICE_DETAIL,
  LOCAL_INCOME_PENALTY_NOTICE_LEAD,
  shouldShowLocalIncomePenaltyNotice,
} from "@/lib/calc/local-income-penalty-notice";
import { localCalculatedTaxFormula } from "@/components/calc/results/transfer/local-income-tax-display";
import { localIncomePenaltyStatementItem } from "@/components/calc/results/transfer/local-income-penalty-display";
import { computeLocalIncomePenalty } from "@/lib/tax-engine/transfer-tax-local-income-penalty";
import { calculateTransferTaxPenalty, type FilingPenaltyInput } from "@/lib/tax-engine/transfer-tax-penalty";

describe("US-29 지방소득세 가산세 고지 (포함됨 + 가정·확인 필요)", () => {
  it("문구가 지방세기본법 §53~§55·§103의2 3호·가정·확인 필요를 명시한다", () => {
    expect(LOCAL_INCOME_PENALTY_NOTICE_LEAD).toContain("포함되어 있습니다");
    expect(LOCAL_INCOME_PENALTY_NOTICE_LEAD).toContain("지방세기본법 §53~§55");
    expect(LOCAL_INCOME_PENALTY_NOTICE_LEAD).toContain("지방세법 §103의2 3호");
    expect(LOCAL_INCOME_PENALTY_NOTICE_DETAIL).toContain("국세와 같은 날");
    expect(LOCAL_INCOME_PENALTY_NOTICE_DETAIL).toContain("지방세기본법 §24①");
    expect(LOCAL_INCOME_PENALTY_NOTICE_DETAIL).toContain("지방세기본법 §59");
    expect(LOCAL_INCOME_PENALTY_NOTICE_DETAIL).toContain("확인 필요");
    expect(LOCAL_INCOME_PENALTY_INPUT_NOTICE).toContain("확인 필요");
    expect(LOCAL_INCOME_PENALTY_AMENDMENT_NOTICE).toContain("국세 합계에 넣지 않고");
  });
  it("「미포함」 문구가 남아 있지 않다", () => {
    for (const t of [LOCAL_INCOME_PENALTY_NOTICE_LEAD, LOCAL_INCOME_PENALTY_NOTICE_DETAIL, LOCAL_INCOME_PENALTY_INPUT_NOTICE]) {
      expect(t).not.toContain("포함되어 있지 않습니다");
    }
  });
  it("가산세를 켠 결과(penaltyDetail 또는 localIncomePenalty 있음)에만 노출한다", () => {
    expect(shouldShowLocalIncomePenaltyNotice({ penaltyDetail: { totalPenalty: 0 } })).toBe(true);
    expect(shouldShowLocalIncomePenaltyNotice({ localIncomePenalty: { total: 1 } })).toBe(true);
    expect(shouldShowLocalIncomePenaltyNotice({})).toBe(false);
    expect(shouldShowLocalIncomePenaltyNotice({ penaltyDetail: undefined })).toBe(false);
  });
  it("지방소득세 산출세액(본세) 산식 문구는 가산세를 별도 행으로 산정함을 밝힌다", () => {
    const f = localCalculatedTaxFormula(1000, 0);
    expect(f).toContain("별도 행으로 산정");
    expect(f).not.toContain("미산정");
  });
  it("상세 명세서 행 — 엔진 합계를 그대로 읽고 가산세가 없으면 행이 없다", () => {
    const filing: FilingPenaltyInput = {
      determinedTax: 30_235_000, reductionAmount: 0, priorPaidTax: 0, originalFiledTax: 0,
      excessRefundAmount: 0, interestSurcharge: 0, filingType: "none", penaltyReason: "normal",
    };
    const pen = calculateTransferTaxPenalty({
      filing,
      delayedPayment: {
        unpaidTax: 30_235_000,
        paymentDeadline: new Date("2026-05-31"),
        actualPaymentDate: new Date("2027-05-31"),
      },
    });
    const d = computeLocalIncomePenalty(filing, pen)!;
    const item = localIncomePenaltyStatementItem(d)!;
    expect(item.value).toBe(d.total);
    expect(item.formula).toContain("304일");
    expect(item.formula).toContain("확인 필요");
    expect(localIncomePenaltyStatementItem(undefined)).toBeUndefined();
  });
  it("결과 단건 hero·수정신고 카드·Step6·다건·겸용·일괄·PDF·명세서 그룹에 배선돼 있다", () => {
    const wired: Array<[string, string]> = [
      ["components/calc/results/TransferTaxResultView.tsx", "<LocalIncomePenaltyNotice"],
      ["components/calc/results/transfer/AmendmentResultCard.tsx", '<LocalIncomePenaltyNotice variant="amendment"'],
      ["app/calc/transfer-tax/steps/Step6.tsx", '<LocalIncomePenaltyNotice variant="input"'],
      ["components/calc/results/MultiTransferTaxSummaryCard.tsx", "localIncomePenalty"],
      ["components/calc/results/mixed-use/MixedUseTotalTaxSection.tsx", "localIncomePenalty"],
      ["components/calc/results/BundledAllocationCard.tsx", "filingUnitLocalIncomePenalty"],
      ["components/calc/results/mixed-use/MixedUseResultCardAdapter.ts", "localIncomePenalty"],
      ["lib/pdf/ResultPdfTransferSections.tsx", "localIncomePenalty"],
      ["components/calc/results/transfer/DetailedStatementConfig.ts", '"localIncomePenalty"'],
      ["components/calc/results/transfer/DetailedStatementFormulaBuilders.ts", "localIncomePenaltyStatementItem"],
    ];
    for (const [f, needle] of wired) expect(readFileSync(f, "utf8"), f).toContain(needle);
  });
});
