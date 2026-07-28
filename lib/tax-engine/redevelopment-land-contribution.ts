/**
 * 재개발 토지 무상귀속 — §166③ 환산취득가 + §163⑥ 개산공제 + LTHD 산출
 *
 * 근거:
 * - 소득세법 §166③ : 환산취득가 = 관리처분인가 당시 권리가액 × (취득 당시 공시지가 ÷ 관리처분인가 당시 공시지가)
 * - 소득세법 §163⑥ : 개산공제 = 취득 당시 공시지가 × 3% (토지)
 * - 소득세법 §95② 별표2 : 인가전 분 LTHD — 취득일 ~ 관리처분인가일 보유기간 기준
 * - 소득세법 §95② 별표2 [비고] 1호 : 인가후 분 LTHD = 0
 * - 소득세법 §166⑤1호 : 보유기간 기산일 = 토지 취득일, 종기 = 관리처분인가일
 *
 * 지원 범위 (본 PR): 청산금 pay 방향만. receive 방향은 후속 Task.
 */

import { computeEstimatedDeduction, safeMultiplyThenDivide } from "./tax-utils";
import { computeRightLthd, applyLthdToGain } from "./redevelopment-lthd";
import { TaxRateNotFoundError } from "./tax-errors";
import { REDEVELOPMENT } from "./legal-codes/transfer";

// ──────────────────────────────────────────────────────────────────────────────
// 결과 타입
// ──────────────────────────────────────────────────────────────────────────────

export interface RedevLandContribResult {
  /** §166③ 환산취득가 = 권리가액 × (취득당시공시지가 ÷ 인가당시공시지가) */
  convertedAcquisition: number;
  /** §163⑥ 개산공제 = floor(취득당시공시지가 × 3%) */
  estimatedDeduction: number;
  /** 인가전 양도차익 = 권리가액 − 환산취득가 − 개산공제 (음수 → 0) */
  preApprovalGain: number;
  /** 인가후 양도차익 = 양도가액 − 권리가액 − 청산금납부 − 인가후필요경비 (음수 → 0) */
  postApprovalGain: number;
  /** 총 양도차익 = 인가전 + 인가후 */
  totalGain: number;
  /**
   * 인가전 LTHD — §95② 별표2(표1) 보유율 적용
   * 근거: REDEVELOPMENT.LTHD_RIGHT_TABLE1_ANNOTATION
   */
  preApprovalLTHD: number;
  /**
   * 인가후 LTHD = 0
   * 근거: §95② 별표2 [비고] 1호 — 인가전 분에 한정 적용
   */
  postApprovalLTHD: number;
  /** 총 LTHD = 인가전 + 인가후 (= 인가전만) */
  totalLTHD: number;
  /** LTHD 보유기간 기산일 = 취득일 (§166⑤1호) */
  lthdHoldingStartDate: Date;
  /** LTHD 보유기간 종기 = 관리처분인가일 (§166⑤1호) */
  lthdHoldingEndDate: Date;
  /** 보유기간(연수) = floor(보유월수 ÷ 12) */
  lthdHoldingYears: number;
  /** 적용 LTHD 율 — computeLthdRateSplit().holding (표1 보유 율) */
  lthdRate: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// 입력 타입
// ──────────────────────────────────────────────────────────────────────────────

export interface RedevLandContribInput {
  /** 토지 취득일 */
  acquisitionDate: Date;
  /** 관리처분인가일 */
  approvalDate: Date;
  /** 관리처분인가 당시 권리가액 (원) */
  rightsValue: number;
  /** 양도가액 (원) */
  transferPrice: number;
  /** 청산금 납부액 (원) — pay 방향. receive는 후속 PR */
  settlementPaid: number;
  /** 취득 당시 개별공시지가 (원) */
  landStdPriceAtAcq: number;
  /** 관리처분인가 당시 개별공시지가 (원) */
  landStdPriceAtApproval: number;
  /** 인가후 필요경비 (원) — 사용자 직접 입력. 미입력 시 0 */
  postApprovalExpenses: number;
  /**
   * 공유지분율 (0 < r ≤ 1, 미전달 시 1). **개산공제(소득령 §163⑥) base 축소 전용**.
   *
   * 기준시가·면적은 물건 전체(100%) 값을 유지한다 — 환산 산식에서 분자·분모로 함께 나타나 상쇄되고,
   * §166⑥ 안분 비율도 100% 스케일을 전제하기 때문이다. 호출부가 `TransferTaxInput.ownershipRatio`를
   * 그대로 내려준다(서브엔진 재판정 금지).
   *
   * 설계: docs/02-design/features/transfer-fractional-lump-sum-deduction.engine.design.md §2.1
   */
  ownershipRatio?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// 메인 함수
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 재개발 토지 무상귀속 — 환산취득가 방식 세액 산출
 *
 * 순서:
 *   Step 0. 분모 0 방어 (§166③ 공시지가 분모)
 *   Step 1. §166③ 환산취득가
 *   Step 2. §163⑥ 개산공제 (토지 3%)
 *   Step 3. 인가전 양도차익
 *   Step 4. 인가후 양도차익
 *   Step 5. LTHD 율 산출 (computeRightLthd 재사용 — 사례 36 mirror)
 *   Step 6. LTHD 금액 산출 (applyLthdToGain 별도 호출)
 */
export function calcRedevLandContribEstimated(
  input: RedevLandContribInput,
): RedevLandContribResult {
  // ── Step 0: 분모 0 방어 ──────────────────────────────────────────────────
  if (input.landStdPriceAtApproval <= 0) {
    throw new TaxRateNotFoundError(
      "redev-land-contrib: landStdPriceAtApproval must be > 0 (§166③ 분모)",
    );
  }

  // ── Step 1: §166③ 환산취득가 ────────────────────────────────────────────
  // 권리가액 × (취득당시공시지가 ÷ 인가당시공시지가)
  // safeMultiplyThenDivide: 곱셈 먼저 후 나눗셈 — BigInt overflow 방어 내장
  const convertedAcquisition = safeMultiplyThenDivide(
    input.rightsValue,
    input.landStdPriceAtAcq,
    input.landStdPriceAtApproval,
  );

  // ── Step 2: §163⑥ 개산공제 (토지 3%) ───────────────────────────────────
  // applyRate = Math.floor(amount * rate) — 정수 절사
  const estimatedDeduction = computeEstimatedDeduction(
    input.landStdPriceAtAcq,
    0.03,
    input.ownershipRatio,
  );

  // ── Step 3: 인가전 양도차익 ─────────────────────────────────────────────
  // 권리가액 − 환산취득가 − 개산공제 (음수 = 손실 → 0)
  // 인가전 필요경비는 본 PR 범위 외 (개산공제에 흡수됨)
  const preApprovalGain = Math.max(
    0,
    input.rightsValue - convertedAcquisition - estimatedDeduction,
  );

  // ── Step 4: 인가후 양도차익 ─────────────────────────────────────────────
  // 양도가액 − 권리가액 − 청산금납부 − 인가후필요경비 (음수 → 0)
  const postApprovalGain = Math.max(
    0,
    input.transferPrice -
      input.rightsValue -
      input.settlementPaid -
      input.postApprovalExpenses,
  );

  // ── Step 5: LTHD 율 산출 ────────────────────────────────────────────────
  // computeRightLthd 재사용 (사례 36 mirror):
  //   - 토지 무상귀속도 원조합원 기준 → isSuccessorRightToMoveIn = false
  //   - 1세대1주택 특례 미적용 → isOneHouseSingle = false
  //   - 거주기간 0 (토지 — 거주 개념 없음)
  const lthdResult = computeRightLthd({
    acquisitionDate: input.acquisitionDate,
    approvalDate: input.approvalDate,
    isSuccessorRightToMoveIn: false,
    isOneHouseSingle: false,
    residencePeriodMonths: 0,
  });

  // preApproval 브랜치에서 보유율·월수 추출
  const preApprovalBranch = lthdResult.preApproval;
  const holdingYears = Math.floor(preApprovalBranch.holdingMonths / 12);

  // ── Step 6: LTHD 금액 산출 ──────────────────────────────────────────────
  // §95② 별표2(표1) 보유율 적용 — holdingRate (residenceRate 미포함)
  // 법령 근거: REDEVELOPMENT.LTHD_RIGHT_TABLE1_ANNOTATION
  void REDEVELOPMENT.LTHD_RIGHT_TABLE1_ANNOTATION; // 상수 참조 (dead-code 방어)

  const preApprovalLTHD = applyLthdToGain(
    preApprovalGain,
    preApprovalBranch.holdingRate,
  );

  // 인가후 LTHD = 0 (§95② 별표2 [비고] 1호 — 인가전 분에 한정)
  const postApprovalLTHD = 0 as number; // TS 좁힘 회피를 위해 as number

  return {
    convertedAcquisition,
    estimatedDeduction,
    preApprovalGain,
    postApprovalGain,
    totalGain: preApprovalGain + postApprovalGain,
    preApprovalLTHD,
    postApprovalLTHD,
    totalLTHD: preApprovalLTHD + postApprovalLTHD,
    lthdHoldingStartDate: input.acquisitionDate,
    lthdHoldingEndDate: input.approvalDate,
    lthdHoldingYears: holdingYears,
    lthdRate: preApprovalBranch.holdingRate,
  };
}
