/**
 * anchor: 「상증법」§4의2⑥ 단서 고지 — **긍정 짝**이 이 파일의 존재 이유다.
 *
 * 결과뷰는 엔진 표지(`donorJointLiabilityExempt`)만 읽고 유형을 다시 판단하지 않는다.
 * 그 표지가 전 유형으로 확장되면서 **열거 밖 유형에는 `false`가 명시적으로 실린다** —
 * 종전처럼 필드가 부재하지 않는다. 그래서 게이트를 `=== true`에서 조금만 넓혀도
 * (`!== undefined` 등) §33 신탁이익·§34 보험금·§45의2 명의신탁에 「연대납부의무 없음」이
 * **거짓 고지**된다. 뮤테이션 AM9가 실제로 그렇게 살아남아 이 파일이 생겼다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DeemedGiftResultView } from "../../../../components/calc/results/DeemedGiftResultView";
import { calcDeemedGift } from "../../../../lib/tax-engine/gift-deemed/router";
import type { DeemedGiftInput } from "../../../../lib/tax-engine/gift-deemed/gift-deemed-input-types";

afterEach(cleanup);

function renderFor(input: DeemedGiftInput) {
  render(<DeemedGiftResultView result={calcDeemedGift(input)} onToGiftTax={() => {}} />);
}

/** §35 저가 양수 — 단서 열거 「제35조부터 제39조까지」 안 */
const BARGAIN: DeemedGiftInput = {
  type: "bargain_transfer",
  transactionPrice: 500_000_000,
  marketValue: 1_000_000_000,
  isRelatedParty: true,
  transactionType: "purchase",
};

/** §34 보험금 — 단서 열거 **밖** */
const INSURANCE: DeemedGiftInput = {
  type: "insurance",
  caseType: "non_payer",
  insuranceProceeds: 100_000_000,
  totalPremiumPaid: 10_000_000,
  relevantPremium: 10_000_000,
  isInheritanceInsurance: false,
};

/** §45의2 명의신탁 — 단서 열거 **밖**(열거는 §45와 §45의3~§45의5뿐) */
const NOMINEE: DeemedGiftInput = { type: "nominee_trust", hasTaxAvoidancePurpose: true };

describe("§4의2⑥ 단서 고지 — 결과뷰", () => {
  it("[JLN-1] §35 저가 양수 — 열거 안이므로 고지가 뜬다", () => {
    renderFor(BARGAIN);
    expect(screen.getByTestId("deemed-joint-liability-exempt")).toBeTruthy();
  });

  it("[JLN-2] 긍정 짝: §34 보험금 — 열거 밖이므로 고지가 뜨지 않는다", () => {
    renderFor(INSURANCE);
    expect(screen.queryByTestId("deemed-joint-liability-exempt")).toBeNull();
  });

  it("[JLN-3] 긍정 짝: §45의2 명의신탁 — 열거 밖이므로 고지가 뜨지 않는다", () => {
    renderFor(NOMINEE);
    expect(screen.queryByTestId("deemed-joint-liability-exempt")).toBeNull();
  });

  it("[JLN-4] 열거 밖 유형의 표지는 부재가 아니라 명시적 false다 (JLN-2·3의 전제)", () => {
    expect(calcDeemedGift(INSURANCE).donorJointLiabilityExempt).toBe(false);
    expect(calcDeemedGift(NOMINEE).donorJointLiabilityExempt).toBe(false);
  });
});
