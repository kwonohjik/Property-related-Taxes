/**
 * 재개발 단독주택 출자 — §166③ PHD 환산취득가 + §163⑥ 개산공제 + LTHD 산출
 *
 * 사례 39: 조합원입주권 양도(right) + 청산금 수령(receive) + 취득실거래가 불명(환산)
 *
 * 법령 근거:
 * - 소득세법 §166③  : 환산취득가 = 권리가액 × (취득당시 개별주택가격 ÷ 인가당시 개별주택가격)
 *     ※ 재개발 맥락에서 "양도 당시" = 의제양도시점(관리처분인가일) 기준
 * - 소득세법 §163⑥  : 개산공제 = floor(취득당시 개별주택가격 × 3%)
 * - 소득세법 §95②   : 별표2 [비고] 1호 — 인가전 분만 LTHD 적용, 인가후·청산금 0
 * - 소득세법 §166①2호:
 *     나목: 인가전 양도차익 = (권리가액 − 환산취득가 − 개산공제) × (평가액 − 수령청산금) / 평가액
 *     가목: 인가후 양도차익 = 양도가액 − (평가액 − 수령청산금) − 인가후필요경비
 * - 소득세법 §166⑤1호: LTHD 보유기간 = 취득일 ~ 관리처분인가일
 *
 * 지원 범위: receive 방향만 (사례 39). pay 방향 (단독주택 + 환산 + 납부)은 후속 PR.
 *
 * 평행 구조: redevelopment-land-contribution.ts (§166③ 토지 환산)
 */

import { estimatedDeductionRate } from "./legal-codes";
import { computeEstimatedDeduction, safeMultiplyThenDivide } from "./tax-utils";
import { computeRightLthd, applyLthdToGain } from "./redevelopment-lthd";
import { TaxRateNotFoundError } from "./tax-errors";
import { REDEVELOPMENT } from "./legal-codes/transfer";

// ──────────────────────────────────────────────────────────────────────────────
// 입력 타입
// ──────────────────────────────────────────────────────────────────────────────

export interface RedevHousingContribReceiveEstimatedInput {
  /** 주택 취득일 (§166⑤1호 LTHD 기산일) */
  acquisitionDate: Date;
  /** 관리처분 인가일 (§166⑤1호 LTHD 종기 + §166③ 의제양도시점) */
  approvalDate: Date;
  /** 권리가액 = 평가액 (관리처분 인가일 기준 시행령 §166④) */
  rightsValue: number;
  /** 양도가액 (입주권 실제 매도금액) */
  transferPrice: number;
  /** 청산금 수령액 (절댓값 — receive 방향) */
  settlementReceived: number;
  /** §166③ 분자 — 취득당시 개별주택가격 (원, 총액) */
  housingStdPriceAtAcq: number;
  /** §166③ 분모 — 인가당시 개별주택가격 (원, 총액) */
  housingStdPriceAtApproval: number;
  /** 인가전 필요경비 (원) — 미입력 시 0 */
  preApprovalExpenses: number;
  /** 인가후 필요경비 (원) — 미입력 시 0 */
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
  /**
   * 미등기양도자산 여부(소득세법 §104③) — §163⑥ 개산공제율 3/100 → **3/1000** 전환.
   * 호출부가 `TransferTaxInput.isUnregistered`를 그대로 내려준다(서브엔진 재판정 금지).
   * 율 산출은 `estimatedDeductionRate()` 단일 경유.
   */
  isUnregistered?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// 결과 타입
// ──────────────────────────────────────────────────────────────────────────────

export interface RedevHousingContribReceiveEstimatedResult {
  /** §166③ 환산취득가 = floor(권리가액 × 취득당시PHD / 인가당시PHD) */
  convertedAcquisition: number;
  /** §163⑥ 개산공제 = floor(취득당시PHD × 3%) */
  estimatedDeduction: number;
  /**
   * 인가전 양도차익 (§166①2호 나목).
   * = floor((권리가액 − 환산취득가 − 개산공제 − 인가전필요경비) × (평가액 − 수령청산금) / 평가액)
   */
  preApprovalGain: number;
  /**
   * 인가후 양도차익 (§166①2호 가목).
   * = 양도가액 − (평가액 − 수령청산금) − 인가후필요경비
   */
  postApprovalGain: number;
  /** salePriceTotal = 평가액 − 수령청산금 (취득가 안분·가목 산식 공통 기준) */
  salePriceTotal: number;
  /** 인가전 분 LTHD (표1 보유분, §95② 별표2 [비고] 1호) */
  preApprovalLTHD: number;
  /** 인가후 분 LTHD = 0 (§95② 별표2 [비고] 1호 — 입주권 §94①2호 자산) */
  postApprovalLTHD: number;
  /** LTHD 합계 = 인가전만 */
  totalLTHD: number;
  /** LTHD 보유기간 시작일 = 취득일 (§166⑤1호) */
  lthdHoldingStartDate: Date;
  /** LTHD 보유기간 종기 = 관리처분 인가일 (§166⑤1호) */
  lthdHoldingEndDate: Date;
  /** 만 보유연수 (년, 정수 — 표1 공제율 조회용) */
  lthdHoldingYears: number;
  /** 표1 보유 공제율 (0~0.30) */
  lthdRate: number;
  /**
   * 인가전 분 취득가액 안분 (신고서 양식 표시용).
   * = floor(환산취득가 × salePriceTotal / 권리가액)
   */
  preApprovalApportionedAcquisition: number;
  /**
   * 인가전 분 의제양도가액 안분 (신고서 양식 표시용).
   * = 평가액 − 수령청산금 = salePriceTotal
   */
  preApprovalApportionedTransfer: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// 메인 함수
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 재개발 단독주택 출자 입주권(right) + 청산금 수령(receive) + 환산취득가 세액 산출.
 *
 * 순서:
 *   Step 0. 분모 0 방어 (§166③ housingStdPriceAtApproval)
 *   Step 1. §166③ 환산취득가 (권리가액 × 취득시PHD / 인가시PHD)
 *   Step 2. §163⑥ 개산공제 (취득시PHD × 3%)
 *   Step 3. salePriceTotal = 권리가액 − 수령청산금
 *   Step 4. §166①2호 나목: 인가전 양도차익
 *   Step 5. §166①2호 가목: 인가후 양도차익
 *   Step 6. LTHD 율 산출 (computeRightLthd 재사용 — §166⑤1호)
 *   Step 7. LTHD 금액 산출 + 안분 취득가액 산출
 */
export function calcRedevHousingContribReceiveEstimated(
  input: RedevHousingContribReceiveEstimatedInput,
): RedevHousingContribReceiveEstimatedResult {
  // ── Step 0: 분모 0 방어 ──────────────────────────────────────────────────
  if (input.housingStdPriceAtApproval <= 0) {
    throw new TaxRateNotFoundError(
      "redev-housing-contrib: housingStdPriceAtApproval must be > 0 (§166③ 분모)",
    );
  }
  if (input.housingStdPriceAtAcq <= 0) {
    throw new TaxRateNotFoundError(
      "redev-housing-contrib: housingStdPriceAtAcq must be > 0 (§166③ 분자 — 개산공제 기준)",
    );
  }

  // ── Step 1: §166③ 환산취득가 ───────────────────────────────────────────
  // 권리가액 × (취득당시PHD / 인가당시PHD)
  // safeMultiplyThenDivide: 곱셈 먼저 후 나눗셈 — BigInt overflow 방어 내장
  const convertedAcquisition = safeMultiplyThenDivide(
    input.rightsValue,
    input.housingStdPriceAtAcq,
    input.housingStdPriceAtApproval,
  );

  // ── Step 2: §163⑥ 개산공제 (주택 3%) ───────────────────────────────────
  // applyRate = Math.floor(amount × rate) — 정수 절사
  const estimatedDeduction = computeEstimatedDeduction(
    input.housingStdPriceAtAcq,
    estimatedDeductionRate(input.isUnregistered),
    input.ownershipRatio,
  );

  // ── Step 3: salePriceTotal = 평가액 − 수령청산금 ──────────────────────
  // 가목·나목 공통 기준값 (취득가 안분비율 분자, 가목 공제값)
  const salePriceTotal = input.rightsValue - input.settlementReceived;

  // ── Step 4: §166①2호 나목 — 인가전 양도차익 ───────────────────────────
  // = floor((권리가액 − 환산취득가 − 개산공제) × salePriceTotal / 권리가액)  (음수 손실 → 0)
  //
  // ⚠️ 2026-07-29 정정(#591 감사 R7 — **세액 변경**): 종전에는 개산공제에 더해
  // `input.preApprovalExpenses`까지 차감해 **이중차감**했다(양도차익 과소 → 세액 과소).
  //
  // 근거는 조문 문언이다. §166①2호 나목은 필요경비를
  //   "법 제97조제1항제2호 및 제3호 **또는** 제163조제6항에 따른 필요경비"
  // 로 규정한다 — **"또는"(택일)이지 "및"(합산)이 아니다**.
  //   · 법 §97①2호 = 자본적지출액 · 3호 = 양도비  (= 여기서는 preApprovalExpenses)
  //   · 시행령 §163⑥ = 개산공제
  // 취득가액을 확인할 수 없어 §166③ 환산취득가를 쓴 경로이므로 §163⑥ 개산공제 쪽을 택하며,
  // 이때 실제 필요경비는 별도 가산하지 않는다. (§97②2호 가목·나목 택일=max와 같은 구조 —
  // memory `feedback_97_2_swap_necessary_expense_max_not_sum` · 조심2016서2576)
  //
  // 대비: 같은 호 **가목**(인가후)은 "§97①2호 및 3호에 따른 필요경비"만 규정해 §163⑥ 병기가
  // 없다 → 아래 Step 5에서 `postApprovalExpenses`를 그대로 차감하는 것이 맞다(무변경).
  //
  // 미구현 잔여: §97②2호 단서의 **가목↔나목 max 전환**(실제 필요경비가 환산취득가+개산공제보다
  // 큰 경우)은 이 경로에 아직 없다. 본 fixture 범위(개산공제 3.6M vs 환산 180M)에서는
  // 가목이 항상 커서 발동하지 않는다. 별도 항목으로 남긴다.
  const preApprovalGainBase = Math.max(
    0,
    input.rightsValue - convertedAcquisition - estimatedDeduction,
  );
  // safeMultiplyThenDivide: 나목 축소 안분 (overflow 방어)
  const preApprovalGain = safeMultiplyThenDivide(
    preApprovalGainBase,
    salePriceTotal,
    input.rightsValue,
  );

  // ── Step 5: §166①2호 가목 — 인가후 양도차익 ───────────────────────────
  // = 양도가액 − salePriceTotal − 인가후필요경비 (음수 → 0)
  const postApprovalGain = Math.max(
    0,
    input.transferPrice - salePriceTotal - input.postApprovalExpenses,
  );

  // ── Step 6: LTHD 율 산출 ────────────────────────────────────────────────
  // computeRightLthd 재사용 (§166⑤1호 — 취득일 ~ 인가일):
  //   - 주택 출자도 원조합원 기준 → isSuccessorRightToMoveIn = false
  //   - 1세대1주택 특례 미적용 → isOneHouseSingle = false
  //   - 거주기간 0 (본 사례 39 다주택 가정 — 1세대1주택 분기는 UI PR에서 처리)
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

  // ── Step 7: LTHD 금액 산출 ──────────────────────────────────────────────
  // §95② 별표2(표1) 보유율 적용 — holdingRate (residenceRate 미포함)
  // 법령 근거: REDEVELOPMENT.LTHD_RIGHT_TABLE1_ANNOTATION
  void REDEVELOPMENT.LTHD_RIGHT_TABLE1_ANNOTATION; // 상수 참조 (dead-code 방어)

  const preApprovalLTHD = applyLthdToGain(
    preApprovalGain,
    preApprovalBranch.holdingRate,
  );

  // 인가후 LTHD = 0 (§95② 별표2 [비고] 1호 — 입주권은 부동산 외 §94①2호)
  const postApprovalLTHD = 0 as number; // TS 좁힘 회피를 위해 as number

  // ── 신고서 양식 안분값 산출 ──────────────────────────────────────────────
  // 인가전 분 취득가액 안분 = floor(환산취득가 × salePriceTotal / 권리가액)
  const preApprovalApportionedAcquisition = safeMultiplyThenDivide(
    convertedAcquisition,
    salePriceTotal,
    input.rightsValue,
  );
  // 인가전 분 의제양도가액 = salePriceTotal (평가액 − 수령청산금)
  const preApprovalApportionedTransfer = salePriceTotal;

  return {
    convertedAcquisition,
    estimatedDeduction,
    preApprovalGain,
    postApprovalGain,
    salePriceTotal,
    preApprovalLTHD,
    postApprovalLTHD,
    totalLTHD: preApprovalLTHD + postApprovalLTHD,
    lthdHoldingStartDate: input.acquisitionDate,
    lthdHoldingEndDate: input.approvalDate,
    lthdHoldingYears: holdingYears,
    lthdRate: preApprovalBranch.holdingRate,
    preApprovalApportionedAcquisition,
    preApprovalApportionedTransfer,
  };
}
