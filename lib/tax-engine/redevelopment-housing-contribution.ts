/**
 * 재개발 단독주택 출자 — §166③ PHD 환산취득가 + §163⑥ 개산공제 + LTHD 산출
 *
 * 사례 39: 조합원입주권 양도(right) + 청산금 수령(receive) + 취득실거래가 불명(환산)
 *
 * 법령 근거:
 * - 소득세법 §166③  : 환산취득가 = 권리가액 × (취득당시 개별주택가격 ÷ 인가당시 부근 개별주택가격)
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

import { applyRate, safeMultiplyThenDivide } from "./tax-utils";
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
  /** §166③ 분모 — 인가당시 부근 개별주택가격 (원, 총액) */
  housingStdPriceAtApproval: number;
  /** 인가전 필요경비 (원) — 미입력 시 0. ※ 환산모드에서는 개산공제(§163⑥)에 흡수되어 인가전 양도차익에서 차감하지 않음(§97②2호). */
  preApprovalExpenses: number;
  /** 인가후 필요경비 (원) — 미입력 시 0 */
  postApprovalExpenses: number;
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
   * = floor((권리가액 − 환산취득가 − 개산공제) × (평가액 − 수령청산금) / 평가액)
   * 환산모드 필요경비 = 개산공제 단독(§97②2호) — 인가전 실제 필요경비 미차감.
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
  const estimatedDeduction = applyRate(input.housingStdPriceAtAcq, 0.03);

  // ── Step 3: salePriceTotal = 평가액 − 수령청산금 ──────────────────────
  // 가목·나목 공통 기준값 (취득가 안분비율 분자, 가목 공제값)
  const salePriceTotal = input.rightsValue - input.settlementReceived;

  // ── Step 4: §166①2호 나목 — 인가전 양도차익 ───────────────────────────
  // = floor((권리가액 − 환산취득가 − 개산공제) × salePriceTotal / 권리가액)
  // 환산취득가 모드 필요경비 = 개산공제(§163⑥) 단독 — 인가전 실제 필요경비는
  // 별도 차감하지 않음(§97②2호 택일: 환산+개산공제, 실제 필요경비 미가산 —
  // 조심2016서2576). land 경로와 동일(redevelopment-land-contribution.ts:120).
  // (음수 손실 → 0)
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
