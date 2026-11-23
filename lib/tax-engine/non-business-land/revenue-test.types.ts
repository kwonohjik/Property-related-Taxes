/**
 * 수입금액 비율 테스트 입력·결과 타입 (§168의11②) — `types.ts`에서 떼어 낸 타입 전용 파일(NBL-STATE-HISTORY-E2 · 800줄 정책 기회주의적 분리, 이동만).
 * `types.ts`가 re-export하므로 기존 import 경로는 그대로다.
 */
import type { NblRevenueBusinessType } from "../legal-codes";
import type { WholesaleItem } from "./revenue-wholesale-item";
import type { DateInterval } from "./types";

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

// ── NBL-STATE-HISTORY-E3-② 업종 영위 기간 · 과세기간별 수입금액 ─────────────────────────────────────

/**
 * 양도연도 T−2 이전 과세기간 한 해의 수입금액·토지가액(연환산 전 raw). T·T−1은 이 행이 아니라 기존 칸(`currentRevenue`·`priorRevenue` 등)이 말한다.
 * 한 칸이라도 없거나 토지가액이 0 이하이면 «모름» — 그 연도는 수입금액비율을 통과하지 않은 것으로 본다(차단하지 않고 확인 필요 고지).
 */
export interface RevenueYearRow {
  taxYear: number;
  revenue?: number;
  landValue?: number;
}

/**
 * 「영위 기간」 입력(E3-②) — **ON일 때만** 엔진에 닿는다(`NonBusinessLandInput.revenueHistory`; OFF는 키 자체가 없다 = 현행과 바이트 동일).
 * 업종은 하나(`revenueTest.businessType`)·영위 기간은 1건이다. 개시일의 단일 소스는 `revenueTest.currentBusinessStartDate`(UI 기존 칸)와 같은 값을 ⑭가 여기로 옮긴다.
 */
export interface RevenueHistoryInput {
  /** 처음 영업한 날. 없으면 소유 시작부터 영위. */
  businessStartDate?: Date;
  /** 영업을 하지 않게 된 첫날(휴업·폐업·이전). 없으면 양도일 현재도 영위. 개시일보다 뒤·양도일보다 앞이어야 한다(⑧·⑫ 공용 leaf). */
  businessEndDate?: Date;
  /** 양도연도 T−2 이전 과세기간 행. 연도 중복·T·T−1 행은 ⑧·⑫가 막는다(엔진은 T−1 이후 행을 읽지 않는다). */
  rows: RevenueYearRow[];
}

/** 과세기간 한 해의 판정 echo(표시 전용 — 세액 불변). */
export interface RevenueHistoryYearEcho {
  taxYear: number;
  /** 그 해의 영위일수(초일산입 — 양도연도는 양도일 포함, 폐업일은 비영업). */
  operatingDays: number;
  /** 그 해의 총일수(365·366). */
  yearDays: number;
  /** 입력 출처 — T = 기존 당해 칸 · T−1 = 기존 직전 칸 · 그 이전 = 연도 행. */
  source: "current" | "prior" | "row";
  /** 비율을 계산할 입력이 갖춰졌는가. false = «모름» → 불통과 + 확인 필요. */
  known: boolean;
  /** 비율① (연환산 후 당해 수입 ÷ 당해 토지가액). `known`일 때만. */
  ratioCurrent?: number;
  /** 비율② (당해+직전). 직전 과세기간 입력이 없으면 없다. */
  ratioCombined?: number;
  /** 연환산 후 연간수입금액. `known`일 때만. */
  annualizedRevenue?: number;
  /** 업종별 기준비율(규칙 §83의4). */
  threshold: number;
  /** 수입금액비율 통과(= 그 해의 영위일이 사업용 구간이 된다). */
  pass: boolean;
  /** 이 해에서 사업용 구간으로 센 일수(반열린 — 양도일 제외, 소유기간 안). */
  businessDays: number;
}

/** 기산일 이전 영위 통산 일수가 2년에 못 미쳐 판정에서 뺀 10호(휴·폐업·이전) 유예 행(V-7 — E3c-2). */
export interface RevenueHistoryExcludedGrace {
  anchorDate: Date;
  /** 기산일 이전 소유기간 중 영위 통산 일수. */
  operatingDaysBefore: number;
  /** 요구 일수 = 기산일 − 2년(윤일 포함 730 또는 731). */
  requiredDays: number;
}

/** `periodEvaluation.revenueHistory` — 영위 기간 ON 경로를 탔을 때만 있다(OFF = 키 부재 · R-3). */
export interface RevenueHistoryEcho {
  /** 소유기간 중 영위 구간(반열린 `[start, end)` — 양도일 제외). 영위일이 없으면 null. */
  operatingInterval: DateInterval | null;
  /** 소유기간 중 영위 통산 일수 = `operatingInterval` 길이. */
  operatingDays: number;
  /** 영위일이 있는 과세기간별 판정(오래된 해부터). */
  years: RevenueHistoryYearEcho[];
  /** 통과한 과세기간 ∩ 영위일 — 영 §168의6 기간기준에 넘긴 사업용 구간(병합 후). */
  businessIntervals: DateInterval[];
  /** 사업용 구간 일수(`businessIntervals` 합). */
  businessDays: number;
  /** «모름»으로 불통과 처리한 연도. */
  unknownYears: number[];
  /** 이 수입금액비율 경로만으로(사업용 구간 ∪ 유예) 기간기준을 충족했는가. */
  meets: boolean;
  /** 판정에서 뺀 10호 유예(V-7). 없으면 키 없음. */
  excludedGrace10?: RevenueHistoryExcludedGrace[];
}
