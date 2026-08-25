/**
 * anchor — E1-02 : §166①1호·①2호나목 「§97①2·3호 **또는** §163⑥」 택일 위반 (이중차감).
 *
 * ## 조문
 *
 * 시행령 §166①1호 후단·①2호 나목은 인가전 분 필요경비를
 * 「법 **제97조제1항제2호 및 제3호** 또는 **제163조제6항**에 따른 필요경비」로 규정한다.
 * **「또는」이지 「및」이 아니다** — 합산하지 않는다.
 *
 *   · §166③ 환산취득가를 쓴 경우 → **§163⑥ 개산공제**
 *   · 실지 취득가액을 쓴 경우     → **§97①2·3호 실제 자본적지출·양도비**
 *
 * ## 결함
 *
 * `computeRedevelopmentSplit`의 인가전 양도차익이
 * `권리가액 − 취득가액 − 개산공제 − preApprovalExpenses`로 **둘을 모두** 뺐다.
 *
 * 이 저장소는 같은 조문을 **sibling 두 경로에서 이미 택일로 정정**했다 —
 * `redevelopment-housing-contribution.ts`(#591 감사 R7)와 표시 헬퍼
 * `preApprovalNecessaryExpense`. **본류인 `computeRedevelopmentSplit`만 정정에서 빠졌다**
 * (memory `feedback_sibling_path_already_implements_rule`의 전형).
 *
 * 파급 셋:
 *   1. 환산 모드에서 인가전 필요경비를 입력하면 그만큼 양도차익이 추가로 줄어 **세액 과소**
 *   2. 신고서 인가전 분 열은 택일 값(개산공제)만 표시 → 「양도가액 − 취득가액 − 필요경비 ≠ 양도차익」
 *   3. 계산근거 step은 **두 항을 모두** 표시 → 신고서 열과 서로 다른 진실
 *
 * ## 안전망 실측 (수정 전)
 *
 * `- redevelopment.preApprovalExpenses`를 지우고 `__tests__/tax-engine/transfer-tax/` 전건 실행:
 * **2,683테스트 중 실패 1건**(`right-receive-expenses-apportion` A-1 — 실가 경로).
 * 즉 **환산 경로의 이 산식을 지키는 테스트는 0건**이었다.
 *
 * ## 실측 (사례 44 fixture · mock 세율)
 *
 * | 인가전 필요경비 | 인가전 양도차익 | 산출세액 |
 * |---|---|---|
 * | 0 | 75,445,917 | 55,836,614 |
 * | 10,000,000 (종전) | **65,445,917** | **53,176,614** (2,660,000 과소) |
 * | 10,000,000 (수정 후) | 75,445,917 | 55,836,614 — 환산이면 §163⑥을 택하므로 **불변** |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "./_helpers";

const rates = makeMockRates();

/** 사례 44 — APT·환산·납부·주택출자. 인가전 필요경비만 바꿔 가며 본다. */
function estimated(preApprovalExpenses: number): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 525_000_000,
    transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date("2005-04-09"),
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: { ...case44RedevelopmentInfo(), preApprovalExpenses },
  });
}

describe("E1-02 anchor — 환산 모드는 §163⑥ 개산공제를 택한다 (실제 필요경비 미가산)", () => {
  const zero = calculateTransferTax(estimated(0), rates);
  const withExpense = calculateTransferTax(estimated(10_000_000), rates);

  it("기준선 — 필요경비 0일 때 인가전 양도차익 75,445,917 · 산출세액 55,836,614", () => {
    expect(zero.redevelopmentDetail?.preApproval.gain).toBe(75_445_917);
    expect(zero.calculatedTax).toBe(55_836_614);
  });

  it("🔑 환산 모드에서 인가전 필요경비를 넣어도 양도차익이 변하지 않는다 (택일)", () => {
    expect(withExpense.redevelopmentDetail?.preApproval.gain).toBe(75_445_917);
  });

  it("🔑 세액도 불변 — 종전에는 53,176,614로 2,660,000 과소였다", () => {
    expect(withExpense.calculatedTax).toBe(55_836_614);
    expect(withExpense.totalTax).toBe(zero.totalTax);
  });

  it("개산공제는 정상 차감된다 — 택일이지 「둘 다 무시」가 아니다", () => {
    // 권리가액 219,218,500 − 환산취득가 141,221,534 − 개산공제 2,551,049 = 75,445,917
    const b = zero.redevelopmentDetail!.preApproval;
    expect(b.apportionedAcquisition).toBe(141_221_534);
    expect(b.expenses).toBe(2_551_049); // 택일 결과 = §163⑥ 개산공제
  });

  it("신고서 인가전 분 열이 자기일관적이다 — 양도가액 − 취득가액 − 필요경비 = 양도차익", () => {
    const b = withExpense.redevelopmentDetail!.preApproval;
    expect(b.apportionedTransfer - b.apportionedAcquisition - (b.expenses ?? 0)).toBe(b.gain);
  });
});

describe("E1-02 anchor — 실가 모드는 §97①2·3호 실제 필요경비를 택한다", () => {
  /** 실가 경로 — 개산공제가 0이므로 택일 결과는 preApprovalExpenses다 */
  function actual(preApprovalExpenses: number): TransferTaxInput {
    return baseTransferInput({
      propertyType: "redevelopment_apt",
      transferPrice: 525_000_000,
      transferDate: new Date("2026-02-16"),
      acquisitionDate: new Date("2005-04-09"),
      acquisitionPrice: 100_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 2,
      residencePeriodMonths: 0,
      redevelopment: { ...case44RedevelopmentInfo(), preApprovalExpenses },
    });
  }
  const zero = calculateTransferTax(actual(0), rates);
  const withExpense = calculateTransferTax(actual(10_000_000), rates);

  it("실가 모드에서는 인가전 필요경비가 양도차익을 실제로 줄인다 (10,000,000)", () => {
    expect(zero.redevelopmentDetail!.preApproval.gain - withExpense.redevelopmentDetail!.preApproval.gain)
      .toBe(10_000_000);
  });

  it("실가 모드 택일 결과 = 실제 필요경비 (개산공제 아님)", () => {
    expect(withExpense.redevelopmentDetail?.preApproval.expenses).toBe(10_000_000);
    expect(zero.redevelopmentDetail?.preApproval.expenses).toBe(0);
  });

  it("실가 모드 신고서 열도 자기일관적이다", () => {
    const b = withExpense.redevelopmentDetail!.preApproval;
    expect(b.apportionedTransfer - b.apportionedAcquisition - (b.expenses ?? 0)).toBe(b.gain);
  });
});
