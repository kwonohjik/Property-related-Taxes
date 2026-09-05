/**
 * 상속 주택 환산취득가 — 개별주택가격 미공시 + 1990 이전 토지 통합 처리 공개 타입
 *
 * 자산 종류가 주택이고 상속개시일이 개별주택가격 최초 공시일(2005-04-30) 이전인 경우
 * 취득시점에 개별주택가격이 존재하지 않으므로, 토지·주택을 분리 입력받아
 * 3-시점 비율 환산으로 취득시점 합계 기준시가를 자동 산출한다.
 *
 * ⚠️ **아래 필드명·주석의 "상속개시일"은 post-deemed 기준 명칭**이다. pre-deemed(상속일 <
 *    1985.1.1.)에서는 「소득세법」 부칙(법률 제4803호) §8이 취득시기를 1985.1.1.로 **의제**하므로
 *    같은 자리에 **의제취득일 시점** 값이 들어온다(B-1 · 조심2010서1195).
 *    엔진은 시점을 강제하지 못하고 UI 라벨(`sec164AcqTimePointLabel`)이 통제한다 —
 *    상세는 `inheritance-house-valuation.ts` 헤더.
 *
 * 근거 조문:
 *   - 소득세법 시행령 §164⑦(⑤ 준용) — 개별주택가격(부수토지 포함) 미공시 취득시 기준시가 추정
 *   - 소득세법 시행령 §176조의2④ — 의제취득일 전 상속: max(환산, 실가×CPI)
 *   - 소득세법 시행령 §163⑥ — 개산공제 = 취득시 기준시가 × 3%
 *   - 소득세법 시행규칙 §80⑥ — 1990.8.30. 이전 취득 토지 등급가액 환산
 */

import type { LandGradeInput } from "../pre-1990-land-valuation";
import type { Pre1990LandValuationResult } from "../pre-1990-land-valuation";

export type { LandGradeInput };

/** 개별주택가격 최초 고시일 (2005-04-30) */
export const HOUSE_FIRST_DISCLOSURE_DATE = new Date("2005-04-30T00:00:00.000Z");

/** 1990.8.30. 이전 취득 토지 등급가액 환산 입력 */
export interface Pre1990LandGradeInput {
  /** 1990.8.30. 현재 등급가액 */
  grade_1990_0830: LandGradeInput;
  /** 1990.8.30. 직전 등급가액 */
  gradePrev_1990_0830: LandGradeInput;
  /** 상속개시일(또는 의제취득일) 시점 등급가액 */
  gradeAtAcquisition: LandGradeInput;
  /** 1990.1.1. 개별공시지가 (원/㎡) */
  pricePerSqm_1990: number;
  /** 선택: CAP-2 override */
  forceRatioCap?: boolean;
}

export interface InheritanceHouseValuationInput {
  /** 상속개시일 (1990-08-30 분기 + 2005-04-30 적용 여부 판단) */
  inheritanceDate: Date;
  /** 양도일 (pre-1990 환산의 양도시 기준시가 산출용) */
  transferDate: Date;

  /** 토지 면적 (㎡) */
  landArea: number;

  // ── 양도시 시점 ──
  /** 양도시 개별공시지가 (원/㎡) */
  landPricePerSqmAtTransfer: number;
  /** 양도시 공시된 개별주택가격 P_T (원) — 홈택스/부동산공시가격알리미 조회 */
  housePriceAtTransfer: number;
  /*
   * ❌ 「양도당시 건물기준시가」를 받지 않는다 — 조문에 그런 축이 없다 (2026-09-05).
   *
   * 종전에는 `buildingStdPriceAtTransfer?: number`가 「제공 시 totalStdPriceAtTransfer =
   * 양도시 토지기준시가 + 이 값」이라고 약속했으나, **엔진은 그 필드를 한 번도 읽지 않았고**
   * (`inheritance-house-valuation.ts` 전수 grep 0건) 그 약속에는 법령 근거도 없었다.
   *
   * 양도 당시 주택의 기준시가는 법 §99①1호 **라목**이 「개별주택가격 및 공동주택가격」이라는
   * **단일값**으로 정한다 — 「양도시 합계기준시가」라는 개념 자체가 없다. 위 `housePriceAtTransfer`
   * (P_T) 하나가 정본이다.
   *
   * 건물(나목) 기준시가가 필요한 시점은 영 §164⑦이 지정한 **취득당시·최초공시당시** 둘뿐이다
   * (아래 `buildingStdPriceAtInheritance`·`buildingStdPriceAtFirstDisclosure`). 양도시는 아니다.
   * ⇒ 되살리지 말 것.
   */

  // ── 최초고시 시점 ──
  /** 최초 고시일 (기본 "2005-04-30", 사용자가 다른 날짜로 보정 가능) */
  firstDisclosureDate?: Date;
  /** 최초고시 시점 개별공시지가 (원/㎡) */
  landPricePerSqmAtFirstDisclosure: number;
  /**
   * 최초 공시된 개별주택가격 P_F (원) — 홈택스/부동산공시가격알리미 조회.
   * §164⑤ 추정 공식의 분자 승수. Sum_F 분모에는 별도 건물기준시가 사용.
   */
  housePriceAtFirstDisclosure: number;
  /**
   * 최초고시 시점 건물기준시가 (원) — 국세청 기준시가.
   * §164⑤ Sum_F 분모: 최초고시 토지기준시가 + 이 값.
   * 미입력 시 Sum_F = 토지기준시가만 사용.
   */
  buildingStdPriceAtFirstDisclosure?: number;

  // ── 상속개시일 시점 토지 ──
  /**
   * 상속개시일 시점 개별공시지가 (원/㎡).
   * - 상속개시일 ≥ 1990-08-30: 필수 (개별공시지가 존재)
   * - 상속개시일 < 1990-08-30: pre1990 입력에서 자동 환산. 제공 시 override.
   */
  landPricePerSqmAtInheritance?: number;

  /**
   * 1990.8.30. 이전 취득 토지 등급가액 환산 입력.
   * 상속개시일 < 1990-08-30 이면 이 필드 또는 landPricePerSqmAtInheritance 중 하나 필수.
   */
  pre1990?: Pre1990LandGradeInput;

  // ── 상속개시일 시점 주택 ──
  /**
   * 상속개시일 시점 건물기준시가 (원).
   * §164⑤ 정식 공식의 분자 Sum_A = 취득시 토지기준시가 + 취득시 건물기준시가에 사용.
   * 미입력 시 Sum_A = 취득시 토지기준시가만 사용 (토지 비율 근사).
   */
  buildingStdPriceAtInheritance?: number;

  /**
   * 상속개시일 시점 개별주택가격 직접 입력 override (원).
   * - 미입력 시: §164⑤ 정식 공식으로 자동 추정.
   * - 엑셀처럼 별도 산정근거가 있을 때 직접 입력.
   */
  housePriceAtInheritanceOverride?: number;
}

/** 주택가격 추정 방법 */
export type HousePriceEstimationMethod =
  | "user_override"    // 사용자 직접 입력
  | "estimated_phd";   // 합계기준시가(토지+건물) 비율로 개별주택가격 자동 추정 (§164⑦·⑤ 준용)

export interface InheritanceHouseValuationResult {
  // ── §164⑦ 취득당시 개별주택가격 추정용 합계기준시가 (토지 + 건물, estimated 모드) ──
  /** 취득(상속개시일) 합계기준시가 Sum_A = landStdAtInheritance + buildingStdAtInheritance (§164⑦ 분자) */
  sumAtInheritance: number;
  /** 최초고시 합계기준시가 Sum_F = landStdAtFirstDisclosure + buildingStdAtFirstDisclosure (§164⑦ 분모) */
  sumAtFirstDisclosure: number;

  // ── 토지 기준시가 (개별공시지가 × 면적) ──
  landStdAtInheritance: number;
  landStdAtTransfer: number;
  landStdAtFirstDisclosure: number;

  // ── 건물 기준시가 (국세청, §164⑦ 추정 sum 성분 echo) ──
  buildingStdAtInheritance: number;
  buildingStdAtFirstDisclosure: number;

  // ── 개별주택가격 (환산취득가 분자/분모, 부수토지 포함 단일값) ──
  /** 최초 공시 개별주택가격 P_F (§164⑦ 추정 승수) */
  housePriceAtFirstDisclosure: number;
  /** 취득(상속개시일) 개별주택가격 = §164⑦ 추정값 또는 직접 입력 override (환산 분자) */
  housePriceAtInheritanceUsed: number;
  /** 양도 개별주택가격 P_T (환산 분모, 부수토지 포함) */
  housePriceAtTransfer: number;
  estimationMethod: HousePriceEstimationMethod;

  // ── 1990 환산 상세 (pre1990 입력이 있을 때) ──
  pre1990Result?: Pre1990LandValuationResult;

  /** 한국어 계산 산식 (UI 표시용, 변수약어 금지) */
  formula: string;
  /** 적용 법령 근거 */
  legalBasis: string;
  /** 경계 경고 (1990 이후인데 pre1990 입력된 경우 등) */
  warnings: string[];
}
