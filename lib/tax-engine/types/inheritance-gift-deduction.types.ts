/**
 * 상속·증여공제 입력/결과 타입 — inheritance-gift.types.ts에서 분리 (800줄 정책, 2026-06-19).
 *
 * InheritanceDeductionInput/Result·GiftDeductionInput/Result + §23 재해손실·§23의2① 부수토지지역.
 * 의존: common(CalculationStep)·heir(Heir·CohabitantDependent) + 기존 sibling 공제 상세 타입.
 */

import type { CalculationStep } from "./inheritance-gift-common.types";
import type { Heir, CohabitantDependent } from "./inheritance-gift-heir.types";
import type { FarmingInheritanceInput, FarmingDeductionDetail } from "./inheritance-farming.types";
import type { FamilyBusinessInheritanceInput, FamilyBusinessDeductionDetail } from "./inheritance-family-business.types";
import type {
  LumpSumComparisonDetail,
  SpouseDeductionDetail,
  FinancialDeductionDetail,
  CohabitDeductionDetail,
  DeductionLimitCeilingDetail,
  PersonalDeductionDetail,
  CasualtyLossDeductionDetail,
} from "./inheritance-deduction-detail.types";

// ============================================================
// §23 재해손실공제 입력 타입 (상증법 §23 + 상증령 §20)
// ============================================================

/**
 * §23 재해손실공제 입력 (상증법 §23 + 상증령 §20).
 * ⚠️ §24③ 분자 보정용 disasterLossDeduction(§54 증여세 재해손실)과 완전히 별개.
 */
export interface CasualtyLossInput {
  /** 재해손실 상속재산 가액 (상증령 §20②) — 원 단위 정수 */
  lossValue: number;
  /** 보전 가능 금액 (보험금 + 구상권, §23① 단서) — 미입력 시 0 처리 */
  compensatedValue?: number;
  /**
   * 재난 종류 (상증령 §20① — 신고서·표시용, 산식 무영향).
   * fire=화재 / collapse=붕괴 / explosion=폭발 / environmental=환경오염 / natural=자연재해 / other=기타
   */
  disasterType?: "fire" | "collapse" | "explosion" | "environmental" | "natural" | "other";
  /** 재난 발생일 (YYYY-MM-DD) — §67 신고기한 내 발생 검증용. string 비교, Date 직접변환 금지. */
  disasterDate?: string;
  /**
   * §67 신고기한 내 발생 override.
   * undefined: 자동/미정 → 기한 내 가정 (입력 강제는 validate ⑧ 담당).
   * true·false: 명시 override (기존 isFiledOnTime 패턴 일관).
   */
  isWithinFilingDeadline?: boolean;
}

// ============================================================
// §23의2① 주택부수토지 지역 구분 (G4 Phase 3)
// ============================================================

/**
 * 주택부수토지 지역 구분 — 소득세 시행령 §154⑦ 배율 결정.
 * - metro_residential_commercial_industrial: 수도권 주거·상업·공업지역 → 3배
 * - metro_green: 수도권 녹지지역 → 5배
 * - non_metro: 수도권 밖 도시지역 → 5배
 * - other: 그 밖의 토지 → 10배
 */
export type AncillaryLandRegion =
  | "metro_residential_commercial_industrial"
  | "metro_green"
  | "non_metro"
  | "other";

// ============================================================
// 상속공제 입력 (inheritance-deductions.ts)
// ============================================================

/** 상속공제 입력 (7종 + §24 종합한도) */
export interface InheritanceDeductionInput {
  heirs: Heir[];
  /** 배우자 실제 상속금액 (미입력 시 법정상속분으로 산정) */
  spouseActualAmount?: number;
  /** 순금융재산 (§22 금융재산공제 계산용) */
  netFinancialAssets?: number;
  /** 동거주택 — 상속주택 공시가격 (gross, 담보채무 차감 전) */
  cohabitHouseStdPrice?: number;
  /** §23의2① 담보된 피상속인 채무(저당). cohabitHouseStdPrice(gross)에서 엔진이 단일 차감. */
  cohabitSecuredDebt?: number;
  /** 영농상속 — 농지·목장용지·어선 가액 */
  farmingAssetValue?: number;
  /** 가업상속 — 가업상속재산가액 */
  familyBusinessValue?: number;
  /** 가업 영위 기간 (년) */
  familyBusinessYears?: number;
  /**
   * 상속개시일 (ISO date) — 미성년자·연로자·장애인 인적공제의 나이 기준일.
   * 상증법 §20: 상속개시일 현재 나이로 판정해야 하므로 반드시 전달해야 함.
   * 미제공 시 계산일 기준으로 fallback (소급 계산 오류 가능).
   */
  deathDate?: string;

  // ===== 종합사례 PDF Phase D·E 확장 =====
  /**
   * 가업상속공제 직접 입력 (Phase E).
   * 제공 시 요건 판정 생략하고 입력값 그대로 적용. familyBusinessValue 우선.
   */
  familyBusinessDirectAmount?: number;
  /**
   * 동거주택공제 직접 입력 (Phase E).
   * 제공 시 80% 산정 생략하고 입력값 그대로 적용 (한도 6억은 유지).
   */
  cohabitDirectAmount?: number;
  /**
   * §23의2 동거주택 자산 유형 (엔진 게이트용).
   * deriveCohabitHouseStdPrice가 EstateItem.cohabitHouseRightType을 전달.
   * general 경로(:cohabitHouseStdPrice)·directAmount 경로 양쪽에서 게이트 적용.
   *
   * - "house" | "single_redev_right" | undefined → applicable=true (적용)
   * - "one_plus_one_right" | "sale_right" → applicable=false (미적용, cappedDeduction=0)
   *
   * 법령: §23의2① (mst=276123), 조심 2021중6665 (id=34000), 재산세제과-230·237
   */
  cohabitHouseRightType?: "house" | "single_redev_right" | "one_plus_one_right" | "sale_right";
  /**
   * §19 배우자 법정상속분 직접 입력 (Phase D).
   * 제공 시 calcSpouseDeduction이 법정상속분 자동 산정 대신 입력값 사용.
   * 미입력 시 orchestrator가 PDF 책 1862 표 산식으로 자동 계산.
   */
  spouseLegalShareOverride?: number;
  // ===== Phase D §24 분자 보정 (orchestrator → calcInheritanceDeductions 전달) =====
  /** 상속인 외 자에게 유증한 금액 (§24 분자 차감) */
  legateeAmountNonHeir?: number;
  /** 증여재산공제 합계 (§24 분자 보정용) */
  priorGiftDeductionTotal?: number;
  /** 신고기한 내 재해손실공제 (§24 분자 보정용) */
  disasterLossDeduction?: number;

  // ===== §23 재해손실공제 (2026-06-07, 상증법 §23 + 상증령 §20) =====
  /**
   * §23 재해손실공제 입력. 미제공 시 공제 0.
   * ⚠️ 기존 disasterLossDeduction(§24③ 분자 보정/§54용)과 완전히 별개 — 명칭 혼동 금지.
   */
  casualtyLoss?: CasualtyLossInput;

  // ===== 영농상속공제 정밀화 (2026-05-21, §18의3 + 시행령 §16) =====
  /**
   * 영농상속 자격·요건 입력. 미제공 시 legacy 호환 (evaluated=false, eligible=true 가정).
   * 신규 사용자는 본 객체 제공 권장.
   */
  farming?: FarmingInheritanceInput;

  // ===== 가업상속공제 정밀화 (2026-05-21, 상증법 §18의2 + 상증령 §15) =====
  /**
   * 가업상속 자격·요건 입력 (Phase B). 미제공 시 legacy 호환.
   * familyBusinessDirectAmount 제공 시 본 객체 무시 (Phase E escape hatch).
   * EstateItem 자동 합산은 orchestrator에서 InheritanceTaxInput.estateItems 직접 사용.
   */
  familyBusiness?: FamilyBusinessInheritanceInput;

  // ===== 동거가족 인적공제 (2026-06-05, §20 P1 — 시령 §18①) =====
  /**
   * 비상속인 동거가족(부양 직계존비속·형제자매) — §20①2~4호 미성년·연로자·장애인공제 대상.
   * 옵션 B: heirs[]와 별도 배열(법정상속분·§21② 오염 0). calcPersonalDeductions 3rd 인자로 전달.
   */
  cohabitantDependents?: CohabitantDependent[];

  // ===== §21① 단서 무신고 일괄공제 5억 고정 (2026-06-07, 계획 inheritance-numeric-gaps §1) =====
  /**
   * 완전 무신고(§67 정기신고·국기법 §45의3 기한후신고 모두 없음) 여부.
   * true면 §21① 단서로 일괄공제 5억 고정(기초+인적이 5억 초과해도 5억). 미입력=정기신고 간주(false).
   * ★ Pre-Do stub (2026-06-07): 타입만 추가, 엔진 분기 미구현 — anchor 실패 확보용.
   */
  isUnfiled?: boolean;

  // ===== Phase 3 (2026-06-07) — G4 §23의2① 주택부수토지 면적한도 =====
  /**
   * §23의2①(소득세법 §89①3호 준용) 주택부수토지 실제 면적 (㎡).
   * - 아파트·공동주택가격은 부수토지 포함이므로 입력 불필요.
   * - 단독주택 대형토지를 별도 EstateItem으로 분리 입력할 때만 면적 초과분 차감이 필요.
   * - 미입력 시 차감 없음 (자동 안분 fallback 금지 정책 부합).
   * - ancillaryLandArea·buildingFootprintArea·ancillaryLandRegion 세 필드 전부 또는 전무 입력.
   *   일부만 입력 시 validation ⑧에서 차단.
   */
  ancillaryLandArea?: number;

  /**
   * 건물 정착 면적 (㎡) — 소득세 시행령 §154⑦ 배율 계산의 분모.
   * "건물이 정착된 면적에 지역별로 대통령령으로 정하는 배율을 곱하여 산정한 면적".
   * ancillaryLandArea·ancillaryLandRegion과 함께 전부 입력 또는 전부 미입력.
   */
  buildingFootprintArea?: number;

  /**
   * 주택부수토지 지역 구분 — 소득세 시행령 §154⑦ 배율 결정.
   * - metro_residential_commercial_industrial: 수도권 주거·상업·공업지역 → 3배 (§154⑦1호가)
   * - metro_green: 수도권 녹지지역 → 5배 (§154⑦1호나)
   * - non_metro: 수도권 밖 도시지역 → 5배 (§154⑦1호다)
   * - other: 그 밖의 토지 → 10배 (§154⑦2호)
   * ancillaryLandArea·buildingFootprintArea와 함께 전부 입력 또는 전부 미입력.
   */
  ancillaryLandRegion?: AncillaryLandRegion;

  /**
   * 주택부수토지 공시가격 (토지분만, 원) — §23의2① 초과분 차감의 기준가액.
   * 개별주택가격(cohabitHouseStdPrice)은 건물+토지 일체이므로, 한도 초과분은 이 토지분 가액에서만
   * 비례 차감하고 건물분은 보존한다(§23의2① 주택가액 전액 포함).
   * ancillaryLandArea·buildingFootprintArea·ancillaryLandRegion과 함께 전부 입력 또는 전부 미입력.
   */
  ancillaryLandStdPrice?: number;
}

/** 상속공제 계산 결과 */
export interface InheritanceDeductionResult {
  basicDeduction: number;
  spouseDeduction: number;
  personalDeductionTotal: number;
  lumpSumDeduction: number;
  financialDeduction: number;
  cohabitationDeduction: number;
  farmingDeduction: number;
  /** 영농상속공제 상세 (2026-05-21, §18의3 정밀화). farming 미입력 시 evaluated=false. */
  farmingDetail?: FarmingDeductionDetail;
  familyBusinessDeduction: number;
  /** 가업상속공제 상세 (2026-05-21, §18의2 정밀화). familyBusiness 미입력 시 undefined (legacy). */
  familyBusinessDetail?: FamilyBusinessDeductionDetail;
  /** §24 종합한도 적용 후 최종 공제액 */
  totalDeduction: number;
  /** 일괄공제 vs 개별공제 선택 근거 */
  chosenMethod: "lump_sum" | "itemized";
  /** §21② 배우자 단독상속 → 일괄공제 배제 여부 (true면 chosenMethod="itemized" 강제) */
  lumpSumExcludedBySpouseSoleHeir?: boolean;
  /** §21① 단서 — 무신고로 일괄공제 5억 고정 여부 (★ Pre-Do stub 2026-06-07, 엔진 미구현) */
  lumpSumForcedByUnfiled?: boolean;
  breakdown: CalculationStep[];
  appliedLaws: string[];
  // ── 계산 근거 detail (2026-05-31 신설) ──────────────────────────
  /** ① §21 일괄 vs 항목별 비교 detail */
  lumpSumComparisonDetail?: LumpSumComparisonDetail;
  /** ③ §19 배우자공제 계산 근거 detail */
  spouseDeductionDetail?: SpouseDeductionDetail;
  /** ④ §22 금융재산공제 계산 근거 detail (rows[]는 orchestrator 주입) */
  financialDeductionDetail?: FinancialDeductionDetail;
  /** ⑤ §23의2 동거주택공제 계산 근거 detail */
  cohabitDeductionDetail?: CohabitDeductionDetail;
  /** ⑥ §24 종합한도 계산 근거 detail */
  deductionLimitDetail?: DeductionLimitCeilingDetail;
  /** §24 한도 적용 전 공제 합계 (rawTotal — UI 표시용) */
  rawTotalDeduction?: number;
  /** ② §20 그 밖의 인적공제 4종 계산 근거 detail (G7 echo) */
  personalDeductionDetail?: PersonalDeductionDetail;
  /** §23 재해손실공제 공제액 (top-level — 부표3 ㉘ 데이터 소스, deductionDetail 경유) */
  casualtyLossDeduction: number;
  /** §23 재해손실공제 계산 근거 detail */
  casualtyLossDeductionDetail?: CasualtyLossDeductionDetail;
}

// ============================================================
// 증여공제 입력 (gift-deductions.ts)
// ============================================================

/** 증여자와 수증자의 관계 */
export type DonorRelation =
  | "spouse"
  | "lineal_ascendant_adult"    // 성인 직계존속
  | "lineal_ascendant_minor"    // 미성년자 직계존속
  | "lineal_descendant"         // 직계비속
  | "other_relative";           // 기타 친족

/** 증여공제 입력 */
export interface GiftDeductionInput {
  donorRelation: DonorRelation;
  /** 혼인 공제 (§53의2) — ≤ 1억 */
  marriageExemption?: number;
  /** 출산 공제 (§53의2) — ≤ 1억 */
  birthExemption?: number;
  /** 10년 이내 동일인(동일 관계 그룹)에 대한 기사용 공제 합산 */
  priorUsedDeduction?: number;
  /**
   * §53의2③ 수증자 통산 기공제액 (혼인+출산 합산 한도 1억).
   * 과거 증여에서 이미 적용된 §53의2 공제 누계액.
   * 미입력(undefined) 시 0으로 처리 — 기존 동작 100% 보존.
   * 상증법 §53의2③: "이미 공제받았거나 받을 금액을 합한 금액이 1억원을 초과하는
   * 경우 그 초과분은 공제하지 아니한다."
   */
  priorUsedMarriageBirthDeduction?: number;
  /**
   * 상증령 §46①2호 — 같은 날 *다른 동일인 그룹*으로부터 받은 동시증여.
   * 각 항목 = 한 동일인 그룹의 합산 과세가액 + 그 그룹의 donorRelation.
   * 같은 동일인(부·모)은 현재 신고 grossGiftValue에 이미 합산되므로 여기 넣지 않음.
   * 3-state: undefined=동시증여 없음 / []=ON 빈 / [...]=데이터.
   * 안분 그룹 키 = donorRelation (현재 신고와 같은 관계인 항목만 분모에 합산).
   */
  simultaneousGifts?: Array<{ donorRelation: DonorRelation; taxableValue: number }>;
}

/** 동시증여 안분 산출근거 (상증령 §46①2호) — echo */
export interface GiftApportionment {
  /** 분모 = 현재 과세가액 + 같은 donorRelation 동시 과세가액 합 */
  denominator: number;
  /** 현재 신고 과세가액 (V_cur) */
  currentTaxableValue: number;
  /** 잔여한도 L' = max(0, 한도 − 기사용공제) */
  remainingLimit: number;
  /** 안분액 = floor(L' × V_cur / denominator) */
  apportionedAmount: number;
  /** 분모 합 ≥ 잔여한도 → 안분 실효(true). 합 < 한도면 각자 전액(false) */
  binding: boolean;
  /** §53의2 혼인·출산공제 동시증여 안분 후 한도(Phase 2). 혼인/출산공제 미요청 시 undefined */
  marriageBirthApportionedLimit?: number;
}

/** 증여공제 계산 결과 */
export interface GiftDeductionResult {
  relationDeduction: number;
  marriageBirthDeduction: number;
  totalDeduction: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
  /** §46①2호 안분 산출근거 — 동시증여 없을 땐 undefined (회귀 보존) */
  apportionment?: GiftApportionment;
}
