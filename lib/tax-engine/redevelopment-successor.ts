/**
 * 재개발/재건축 양도소득세 — 승계조합원 분기 (사례 48)
 *
 * 관리처분계획인가일 이후 입주권을 상속·증여·매매로 승계 취득한 자가 신축APT 양도 시
 * §166 인가전·인가후 안분 산식을 우회하고 단순 차감 산식을 적용한다.
 *
 * 산식:
 *   양도차익 = transferPrice − rightsValue − postApprovalExpenses
 *   보유기간 = completionDate ~ transferDate  (사용검사필증 교부일 기산)
 *   LTHD    = 표1 (3년 미만 0, 3년차 6%, 매년 +2%, 15년+ 30% 캡)
 *
 * 결과 구조:
 *   preApproval = 0 fill (안분 우회)
 *   postApprovalExistingHouse = primary
 *   settlement = 0 fill (settlement 미지원 — validate 차단)
 *
 * 법령 근거:
 *  - 사전-2019-법령해석재산-0649 (2020.02.11.) ★ 직접
 *  - 소법 시행령 §162①4호 (자가건설 의제 — 사용승인서 교부일)
 *  - 소법 §95② 단서 (입주권 LTHD 0 — 신축APT 양도 시 부동산 보유기간 적용)
 *
 * Pre-Do 환류 (2026-05-14): PDF 양도코리아 양도소득금액 계산명세서 자산종류 = "일반주택(3)".
 * 인가전·인가후 안분 미표시 — 단순 housing 양도와 동치 처리.
 */

import { calculateHoldingPeriod } from "./tax-utils";
import { applyLthdToGain } from "./redevelopment-lthd";
import type {
  RedevelopmentBranchDetail,
  RedevelopmentResult,
} from "./types/transfer-redevelopment.types";
import type { RedevelopmentOrchestratorInput } from "./redevelopment";

/**
 * 표1 (소법 §95② 별표) LTHD 율 산정.
 * 3년 미만 = 0 / 3년차 = 6% / 매년 +2% / 15년+ = 30% 캡.
 */
function computeTable1Rate(years: number): number {
  if (years < 3) return 0;
  if (years >= 15) return 0.3;
  return 0.06 + (years - 3) * 0.02;
}

/**
 * 승계조합원 분기 — 단순 차감 산식 + 준공일 기산 LTHD/세율.
 */
export function runSuccessorMember(
  input: RedevelopmentOrchestratorInput,
): RedevelopmentResult {
  const { redevelopment, transferDate, transferPrice } = input;

  // validate 보장 — completionDate 필수, settlementDirection !== "receive"|"pay" 차단.
  // 방어적 fallback: completionDate 부재 시 acquisitionDate (실제로는 validate 차단됨).
  const completionDate = redevelopment.completionDate ?? input.acquisitionDate;

  // 사례 48 — 승계조합원 취득가액은 자산 카드의 통합 acquisitionPrice(=actualAcquisitionPrice) 우선 사용.
  // 상속·증여·매매 어느 취득원인이든 자산 카드의 검증된 acquisitionPrice 도출 경로를 활용.
  // fallback: redevelopment.rightsValue (legacy test 직접 호출 경로 호환).
  // ★ 모순 해소 — "권리가액(§166④, 인가일 평가액)" 슬롯에 "취득시점 평가액"을 강제 매핑하던 이중 입력 제거.
  const successorAcquisitionPrice =
    input.actualAcquisitionPrice ?? redevelopment.rightsValue;
  const postApprovalExpenses = redevelopment.postApprovalExpenses ?? 0;

  // ─ Step 1: 단순 차감 양도차익 ─
  const gain = transferPrice - successorAcquisitionPrice - postApprovalExpenses;

  // ─ Step 2: 보유기간 = 준공일 ~ 양도일 ─
  const holdingPeriod = calculateHoldingPeriod(completionDate, transferDate);
  const holdingMonths = holdingPeriod.years * 12 + holdingPeriod.months;
  const holdingDays = holdingPeriod.days;

  // ─ Step 3: LTHD 표1 적용 ─
  const lthdRate = computeTable1Rate(holdingPeriod.years);
  const lthdAmount = gain > 0 && lthdRate > 0 ? applyLthdToGain(gain, lthdRate) : 0;

  // ─ Step 4: 세율 라벨 (보유기간 기준 — UI/anchor 검증용) ─
  const totalMonthsForRate = holdingPeriod.years * 12 + holdingPeriod.months;
  const rateLabel: NonNullable<
    RedevelopmentResult["successorMemberDetail"]
  >["rateLabel"] =
    totalMonthsForRate < 12
      ? "1년 미만 70% (§104①3호 주택 본문)"
      : totalMonthsForRate < 24
        ? "1년 이상 2년 미만 60% (§104①2호 주택)"
        : "기본누진세율 (§55·§104①1호)";

  // ─ Step 5: RedevelopmentBranchDetail 3분기 (preApproval·settlement = 0 fill) ─
  const zeroBranch: RedevelopmentBranchDetail = {
    apportionedTransfer: 0,
    apportionedAcquisition: 0,
    gain: 0,
    holdingMonths: 0,
    holdingDays: 0,
    lthd: 0,
    lthdRate: 0,
    branchAcqDate: completionDate,
    branchTransferDate: transferDate,
    expenses: 0,
    lthdHoldingPart: 0,
    lthdResidencePart: 0,
  };

  const postApprovalExistingHouse: RedevelopmentBranchDetail = {
    apportionedTransfer: transferPrice,
    // ★ P8 — 결과 카드 표시값과 실제 차감값 일치 (successorAcquisitionPrice 단일 출처)
    apportionedAcquisition: successorAcquisitionPrice,
    gain,
    holdingMonths,
    holdingDays,
    lthd: lthdAmount,
    lthdRate,
    branchAcqDate: completionDate, // ★ 보유기간 기산일 = 준공일
    branchTransferDate: transferDate,
    expenses: postApprovalExpenses,
    lthdHoldingPart: lthdAmount, // 표1 단독 — 거주분 0
    lthdResidencePart: 0,
  };

  // ─ Step 6: 합계 ─
  const totalLthd = lthdAmount;
  const taxableIncome = Math.max(0, gain - totalLthd);

  return {
    preApproval: { ...zeroBranch },
    postApprovalExistingHouse,
    settlement: { ...zeroBranch },
    total: {
      gain,
      lthd: totalLthd,
      taxableIncome,
    },
    salePriceTotal: undefined, // 분양가 개념 미적용
    receiveOnlyMode: undefined,
    valuationMeta: {
      method: "successor_member_decree_162_1_4",
      numerator: undefined,
      denominator: undefined,
      rationale:
        "사전-2019-법령해석재산-0649 (승계조합원) + 시행령 §162①4호 (자가건설 의제)",
    },
    estimatedLumpDeduction: undefined,
    successorMemberApplied: true,
    successorMemberDetail: {
      applied: true,
      completionDate,
      holdingDaysFromCompletion:
        holdingPeriod.years * 365 + holdingPeriod.months * 30 + holdingPeriod.days, // approx
      shortTermRateApplied: totalMonthsForRate < 24,
      rateLabel,
    },
  };
}
