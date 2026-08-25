/**
 * 감사 확정 결함 회귀 테스트
 * ref: transfer-tax-redevelopment.ts:645 (formula-display-drift, group redev-2)
 *
 * 결함: 환산 모드 재개발 "인가전 분 양도차익" step 산식이 §163⑥ 개산공제
 *       (estimatedLumpDeduction) 차감을 누락 → 표시 산식의 산술 결과가 실제 amount 와
 *       개산공제만큼 어긋남(자기모순). 세액 자체는 정확 — 표시 전용 결함.
 *
 * 독립 도출(사례 44, APT-환산-납부, 1세대1주택 아님 → 12억 안분 미발동):
 *   apportionedTransfer(권리가액 의제양도가) = 219,218,500
 *   apportionedAcquisition(환산취득가)       = 141,221,534
 *   개산공제 §163⑥ = floor(취득당시 주택기준시가 85,034,988 × 3%)
 *                  = floor(2,551,049.64) = 2,551,049
 *   preApprovalExpenses(인가전필요경비) = 0
 *   ∴ 인가전 양도차익 = 219,218,500 − 141,221,534 − 0 − 2,551,049 = 75,445,917
 *
 * 검증: (1) step.amount == 75,445,917 (엔진 실측)
 *       (2) 산식이 개산공제 항(2,551,049)을 명시 (수정 전엔 누락)
 *       (3) 산식에 표시된 숫자들의 산술 결과 == step.amount (자기일관성)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "../transfer-tax/redevelopment/_helpers";

// 결함 시나리오와 무관하게 조문에서 독립적으로 도출한 기대값 (엔진 출력 베끼지 않음)
const ACQ_HOUSING_STD_PRICE = 85_034_988; // case44RedevelopmentInfo.acquisitionHousingPrice
const ESTIMATED_DEDUCTION = Math.floor(ACQ_HOUSING_STD_PRICE * 0.03); // 시행령 §163⑥ = 2,551,049
const APPORTIONED_TRANSFER = 219_218_500; // 권리가액(의제 양도가액)
const APPORTIONED_ACQUISITION = 141_221_534; // §166③ 환산취득가 (BigInt floor)
const PRE_APPROVAL_EXPENSES = 0;
const EXPECTED_PRE_APPROVAL_GAIN =
  APPORTIONED_TRANSFER - APPORTIONED_ACQUISITION - PRE_APPROVAL_EXPENSES - ESTIMATED_DEDUCTION;

const mockRates = makeMockRates();

function runCase44() {
  const input: TransferTaxInput = baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 525_000_000,
    transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date("2005-04-09"),
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: false, // 1세대1주택 아님 → 12억 안분 미발동 (인가전 gain 미안분)
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: case44RedevelopmentInfo(),
  });
  return calculateTransferTax(input, mockRates);
}

/** 산식 문자열에서 값 숫자만 추출 ("§163⑥"의 163 은 배제) */
function extractNumbers(formula: string): number[] {
  return (formula.replace(/§163⑥/g, "").match(/[\d,]+/g) ?? []).map((s) =>
    Number(s.replace(/,/g, "")),
  );
}

describe("audit redev-2: 인가전 분 양도차익 산식 개산공제 §163⑥ 자기일관성", () => {
  const result = runCase44();
  const step = result.steps.find((s) => s.label === "인가전 분 양도차익");

  it("독립 도출값 sanity — 개산공제 2,551,049 / 인가전 양도차익 75,445,917", () => {
    expect(ESTIMATED_DEDUCTION).toBe(2_551_049);
    expect(EXPECTED_PRE_APPROVAL_GAIN).toBe(75_445_917);
  });

  it("인가전 분 양도차익 step 존재 + amount = 75,445,917 (조문 독립 도출과 일치)", () => {
    expect(step).toBeDefined();
    expect(step!.amount).toBe(EXPECTED_PRE_APPROVAL_GAIN);
  });

  it("산식에 개산공제 §163⑥ 항(2,551,049) 명시 (수정 전: 누락)", () => {
    expect(step!.formula).toContain("개산공제");
    expect(step!.formula).toContain("§163⑥");
    expect(step!.formula).toContain(ESTIMATED_DEDUCTION.toLocaleString()); // "2,551,049"
  });

  /**
   * ⚠️ **2026-08-25 기대 항 수 정정 (E1-02)** — 자기일관성이라는 이 테스트의 취지는 그대로다.
   *
   * 종전 산식은 「… − 필요경비 0 − 개산공제 2,551,049」로 **두 항을 나란히** 보여줬다.
   * 그런데 §166①1호 후단·①2호 나목은 필요경비를
   * 「법 제97조제1항제2호 및 제3호 **또는** 제163조제6항에 따른 필요경비」로 규정한다 —
   * **택일**이라 실제로 차감되는 항은 언제나 **하나**다. 두 항을 다 보여주면
   * 신고서 인가전 분 열(택일 값 1개)과 서로 다른 진실이 된다.
   *
   * ⇒ 환산 모드이므로 §163⑥ 개산공제 하나만 표시한다. `PRE_APPROVAL_EXPENSES`(0)는
   *   **표시되지 않는 것이 맞다**(값이 0이라 산술 결과도 동일 — 세액 불변).
   */
  it("산식 항 산술 결과 == step.amount (자기일관성 — 첫 항 − 나머지 항 합)", () => {
    const nums = extractNumbers(step!.formula);
    // 의제양도가액 219,218,500 / 취득가 141,221,534 / 개산공제(택일) 2,551,049
    expect(nums).toEqual([
      APPORTIONED_TRANSFER,
      APPORTIONED_ACQUISITION,
      ESTIMATED_DEDUCTION,
    ]);
    const reconstructed = nums[0] - nums.slice(1).reduce((a, b) => a + b, 0);
    expect(reconstructed).toBe(step!.amount);
    // 택일이 지켜졌는지 — 실가 항(§97①2·3호) 라벨이 함께 나오면 안 된다.
    expect(step!.formula).not.toContain("§97①2·3호");
  });
});
