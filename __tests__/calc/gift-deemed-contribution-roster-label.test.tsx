/**
 * anchor: §39의3 로스터 행 주식수 라벨 — 저가·고가 **둘 다 「현물출자 전 보유주식수」**
 *
 * 이 입력은 `ContributionParty.preShares`로 들어가
 *   저가 `gross × preShares / preContribShares` · 고가 `base × preShares / preContribShares`
 * 지분비율의 **분자**가 되고, 검증도 `Σshares ≤ 현물출자 전 발행주식총수` 기준이다
 * (`gift-deemed-validate.ts` · `gift-deemed-input.ts` superRefine).
 *
 * 종전 고가 라벨은 「인수 신주수」였다 — 고가인수에서 신주를 인수하는 쪽은 **현물출자자**
 * (폼-전역 `conAllocatedShares`, 같은 라벨)이고 수증자는 인수하지 않는다. 라벨대로 입력하면
 * 분자에 엉뚱한 수가 들어가 증여재산가액이 틀린다(산식 자체는 정상 — 입력 유도만 잘못).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ContributionFields } from "../../components/calc/deemed-gift/contribution-form";
import { INITIAL_DEEMED, type DeemedFormState } from "../../components/calc/deemed-gift/shared";

afterEach(cleanup);

function renderWith(caseType: "low" | "high") {
  const form: DeemedFormState = {
    ...INITIAL_DEEMED,
    type: "contribution",
    conCaseType: caseType,
    conPreShares: "100,000",
    conParties: [{ name: "B", shares: "35,000", relation: "" }],
  };
  render(<ContributionFields form={form} set={() => {}} />);
}

describe("§39의3 로스터 — 주식수 행 라벨", () => {
  it("고가: 「현물출자 전 보유주식수」 (「인수 신주수」 아님)", () => {
    renderWith("high");
    expect(screen.getByText("현물출자 전 보유주식수")).toBeInTheDocument();
    // 폼-전역 "인수 신주수"는 남아 있어야 한다(현물출자자 몫 — 라벨 1개뿐)
    expect(screen.getAllByText("인수 신주수")).toHaveLength(1);
  });

  it("저가: 동일 라벨 — 회귀", () => {
    renderWith("low");
    expect(screen.getByText("현물출자 전 보유주식수")).toBeInTheDocument();
  });
});
