/**
 * US-29 anchor — 양도소득분 지방소득세 가산세(지방세기본법 §53~§55) 미포함 고지.
 * 세액을 바꾸지 않는 고지다. 엔진 총 납부세액은 지방 가산세를 포함하지 않는다(확인 필요 — 계산 범위 밖).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LOCAL_INCOME_PENALTY_NOTICE_DETAIL,
  LOCAL_INCOME_PENALTY_NOTICE_LEAD,
  shouldShowLocalIncomePenaltyNotice,
} from "@/lib/calc/local-income-penalty-notice";
import { localCalculatedTaxFormula } from "@/components/calc/results/transfer/local-income-tax-display";

describe("US-29 지방소득세 가산세 미포함 고지", () => {
  it("문구가 지방세기본법 §53~§55·§103의2 3호·확인 필요를 명시한다", () => {
    expect(LOCAL_INCOME_PENALTY_NOTICE_LEAD).toContain("지방세기본법 §53~§55");
    expect(LOCAL_INCOME_PENALTY_NOTICE_DETAIL).toContain("지방세법 §103의2 3호");
    expect(LOCAL_INCOME_PENALTY_NOTICE_DETAIL).toContain("확인 필요");
  });
  it("가산세를 켠 결과(penaltyDetail 있음)에만 노출한다", () => {
    expect(shouldShowLocalIncomePenaltyNotice({ penaltyDetail: { totalPenalty: 0 } })).toBe(true);
    expect(shouldShowLocalIncomePenaltyNotice({})).toBe(false);
    expect(shouldShowLocalIncomePenaltyNotice({ penaltyDetail: undefined })).toBe(false);
  });
  it("지방소득세 산식 문구가 국세 가산세 한정임을 밝힌다", () => {
    expect(localCalculatedTaxFormula(1000, 0)).toContain("지방세기본법 §53~§55 가산세는 미산정");
  });
  it("결과 단건 hero·수정신고 카드·Step6에 배선돼 있다", () => {
    for (const f of [
      "components/calc/results/TransferTaxResultView.tsx",
      "components/calc/results/transfer/AmendmentResultCard.tsx",
      "app/calc/transfer-tax/steps/Step6.tsx",
    ]) {
      expect(readFileSync(f, "utf8"), f).toContain("<LocalIncomePenaltyNotice");
    }
  });
});
