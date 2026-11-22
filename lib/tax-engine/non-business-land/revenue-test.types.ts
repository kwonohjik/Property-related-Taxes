/**
 * 수입금액 비율 테스트 입력·결과 타입 (§168의11②) — `types.ts`에서 떼어 낸 타입 전용 파일(NBL-STATE-HISTORY-E2 · 800줄 정책 기회주의적 분리, 이동만).
 * `types.ts`가 re-export하므로 기존 import 경로는 그대로다.
 */
import type { NblRevenueBusinessType } from "../legal-codes";
import type { WholesaleItem } from "./revenue-wholesale-item";

export interface RevenueTestInput {
  businessType: NblRevenueBusinessType;
  /**
   * 당해 과세기간 수입금액 (원) — §168의11③3호 연환산 전 raw 기간수입금액.
   * currentBusinessDays·currentTaxYear가 제공되고 영위일수 < 해당연도총일수면 엔진이 연환산.
   */
  currentRevenue: number;
  /** 당해 과세기간 토지가액 (원) — 양도일 기준시가 §168의11④ */
  currentLandValue: number;
  /** 당해 과세기간 중 사업영위 일수(초일산입). 미제공 시 환산 안 함(계수 1) */
  currentBusinessDays?: number;
  /** 당해 과세연도(윤년 판정용 총일수 365/366). 미제공 시 환산 안 함 */
  currentTaxYear?: number;
  /**
   * 당해 사업개시일(§168의11③3호 연환산의 영위 개시일 override) — NBL2611-D1(DM-01 · Q-4 (나)): 수입금액비율을 충족했더라도
   * 직전 비율②가 미통과이면 이 업종의 사업 구간을 [개시일, 양도일]로 보아 기간기준(§168의6)을 판정한다. 미제공이면 전 기간(현행).
   */
  currentBusinessStartDate?: Date;
  /** 직전 과세기간 수입금액 (원). 미제공 시 비율② 생략 */
  priorRevenue?: number;
  /** 직전 과세기간 토지가액 (원) */
  priorLandValue?: number;
  /**
   * 12호 도소매업(`wholesale_retail`) 품목 — 규칙 §83조의4⑭ 열거 품목만 12호다(NBL2611-V7-S · Q-6 (다)).
   * `wholesale_retail` 선택 시 필수 — 없으면 엔진이 던진다(⑧·⑫가 먼저 막는다). 다른 업종에서는 쓰지 않는다.
   */
  wholesaleItem?: WholesaleItem;
  /** 농산물·수산물·축산물 도소매 — 「유통산업발전법」에 따른 시장과 그 밖에 이와 유사한 장소에서 운영하는지. 그 세 품목에서만 쓴다 */
  wholesaleInMarket?: boolean;
  /** 직전 과세기간 중 사업영위 일수(초일산입). 미제공 시 직전 환산 안 함 */
  priorBusinessDays?: number;
  /** 직전 과세연도(윤년 판정용). 미제공 시 직전 환산 안 함 */
  priorTaxYear?: number;

  // §168의11③1호 간주임대료 — 전세금·보증금 (부가세법 시행령 §65① 준용)
  /** 당해 전세금·임대보증금 (원) */
  currentDeposit?: number;
  /** 당해 임대 과세대상기간 일수 */
  currentRentDays?: number;
  /** 당해 적용 정기예금이자율 분수(부가세칙 §47). 매퍼가 연도별 테이블에서 해소; 미검증 연도면 미제공 */
  currentDeemedRate?: { num: number; den: number };
  /** 직전 전세금·임대보증금 (원) */
  priorDeposit?: number;
  /** 직전 임대 과세대상기간 일수 */
  priorRentDays?: number;
  /** 직전 적용 정기예금이자율 분수 */
  priorDeemedRate?: { num: number; den: number };
  /** 간주임대료 입력은 있으나 해당 연도 율 미검증 → 적용 불가(경고) */
  deemedRateUnavailable?: boolean;

  // §168의11③2호 공통수입 안분 — 실지귀속 불가 공통수입금액
  /** 당해 공통수입금액 (원) */
  commonRevenue?: number;
  /** 당해 그 밖의 토지가액 (원) — 안분 분모 */
  otherLandValue?: number;
  /** 직전 공통수입금액 (원) */
  priorCommonRevenue?: number;
  /** 직전 그 밖의 토지가액 (원) */
  priorOtherLandValue?: number;
}

export interface RevenueTestResult {
  businessType: NblRevenueBusinessType;
  /** 업종별 기준비율 (시행규칙 §83의4) */
  threshold: number;
  /** 비율① 당해 (연환산) 수입 ÷ 당해 토지가액 */
  ratioCurrent: number;
  /** 비율② (당해+직전 연환산 수입) ÷ (당해+직전 토지가액). 직전 미제공 시 undefined */
  ratioCombined?: number;
  /** max(①,②) — §168의11② "큰 것" */
  actualRatio: number;
  pass: boolean;
  detail: string;
  /** §168의11③3호 연환산 후 당해 연간수입금액 (환산 미적용 시 raw와 동일) */
  annualizedCurrentRevenue: number;
  /** 연환산 후 직전 연간수입금액 (직전 제공 시). 환산 미적용 시 raw와 동일 */
  annualizedPriorRevenue?: number;
  /** 당해 영위일수 (echo) */
  currentBusinessDays?: number;
  /** 직전 영위일수 (echo) */
  priorBusinessDays?: number;
  /** 당해 또는 직전에 연환산이 적용되었는지 */
  annualizationApplied: boolean;
  /** §168의11③1호 당해 간주임대료 (원). 0이면 미적용 */
  deemedRentCurrent: number;
  /** 직전 간주임대료 (원) */
  deemedRentPrior: number;
  /** §168의11③2호 당해 공통수입 안분액 (원) */
  commonApportionedCurrent: number;
  /** 직전 공통수입 안분액 (원) */
  commonApportionedPrior: number;
  /** 간주임대료 입력 있으나 해당 연도 율 미검증으로 미적용된 경우 true (경고) */
  deemedRateUnavailable: boolean;
  /**
   * [echo] 당해 사업개시일을 기간기준 판정에 쓴 경우의 사실(NBL2611-D1 · DM-01). 수입금액비율 충족 + 개시일 입력 + 직전 비율② 미통과일 때만 있다.
   * `meets`가 참이면 [개시일, 양도일]을 사업 구간으로 보아도 기간기준을 충족한 것이다.
   */
  businessStartJudged?: { startDate: string; businessDays: number; totalOwnershipDays: number; meets: boolean };
}
