/**
 * 가업상속공제 사후관리(추징) 시뮬레이터 타입 (Phase F 통합)
 *
 * 법령: 상증법 §18의2⑤⑥⑦⑨⑩ + 상증령 §15⑧⑩⑪⑫⑬⑮⑯⑰⑱㉕
 * KoreanLaw MCP 검증 2026-06-04: §18의2(mst=276123)·§15(mst=283637).
 *
 * 산식 헬퍼는 family-business-postmanagement.ts(동결). 본 타입은 orchestrator·UI·API 공용.
 * 계획서: docs/00-pm/inheritance-family-business-postmgmt.plan.md (v3)
 */

import type { FamilyBusinessViolationType } from "../credits/family-business-postmanagement";

/** 사후관리 자산 타입 (EstateItem.category → 매핑) */
export type PostMgmtAssetType = "land" | "building" | "stock" | "other";

/**
 * 가업상속공제 사후관리 트래킹 메타 (계획 §2-1, E1).
 * 가업상속공제 > 0 시에만 채워짐(직접입력 모드 포함). UI 시뮬레이터 prefill 소스.
 */
export interface FamilyBusinessPostMgmtMeta {
  /** 가업상속공제 적용액 (추징 원금) */
  appliedDeduction: number;
  /** 상속세 신고기한 — 상증법 §67 (사망일이 속하는 달 말일 + 6개월), YYYY-MM-DD */
  filingDeadline: string;
  /** OFZ 특례 활성 (§15㉕ → §15⑪1호·2호 사후관리 면제 사전 정보) */
  ofzExemptionActive: boolean;
  /** 직접입력 모드(usedDirectInput) — 요건 우회 사례도 사후관리 대상 */
  usedDirectInput: boolean;
  /** 가업상속재산 자산 이력 (자산처분 비율 산정 기준) */
  inheritedAssets: Array<{ id: string; value: number; type: PostMgmtAssetType }>;
}

/**
 * §15⑧ 정당사유 18종 enum (계획 §2-2, P1 정정 17종 + L2 5년가드 = 18).
 * KoreanLaw MCP 검증 — 1호 가~사 7건 + 2호 가~다 3건 + 3호 가~사 7건 + OFZ + 5년외.
 */
export type JustifiableReasonCode =
  // §15⑧ 1호 가~사 (자산처분 위반 예외 7건)
  | "expropriation"             // 가. 수용·협의매수·국가지자체 양도·시설개체·사업장이전
  | "state_donation_asset"      // 나. 국가지자체 증여
  | "heir_death"                // 다. 가업상속인 사망
  | "reorganization"            // 라. 합병·분할·통합·법인전환
  | "useful_life"               // 마. 내용연수 도래
  | "industry_change_replace"   // 바. 업종 변경 대체취득
  | "rnd_use"                   // 사. 처분금액 R&D 사용 (조특법 §10)
  // §15⑧ 2호 가~다 (가업 미종사 위반 예외 3건)
  | "heir_death_cessation"      // 가. 가업상속인 사망
  | "state_donation_cessation"  // 나. 국가지자체 증여
  | "military_illness"          // 다. 병역·질병 부득이한 사유
  // §15⑧ 3호 가~사 (지분 감소 위반 예외 7건)
  | "reorg_share_transfer"      // 가. 조직변경 주식 처분
  | "third_party_dilution"      // 나. 특수관계인 외 유상증자 희석
  | "heir_death_succession"     // 다. 상속인 사망 (승계자 종사)
  | "state_donation_share"      // 라. 국가지자체 증여
  | "listing_dilution"          // 마. 상장요건 충족 감자
  | "uniform_capital_decrease"  // 바. 균등 감자
  | "court_decision"            // 사. 법원결정 무상감자·출자전환
  // 자동 면제
  | "ofz_exemption"             // §15㉕ OFZ (§15⑪1·2호 한정)
  | "outside_five_year_period"; // L2 — 상속개시일 + 5년 초과 위반

/** §15⑪ business_cessation sub-type (OFZ 면제는 1·2호만, 3호 휴/폐업 제외) */
export type CessationSubType = "ceo_not_serving" | "industry_change" | "business_pause";

/** 5년 추적 — 위반 사건 (계획 §2-2) */
export interface ViolationEvent {
  /** 위반 발생일 (ISO date) */
  date: string;
  /** §18의2⑤ 1~4호 위반 유형 */
  type: FamilyBusinessViolationType;
  /** §15⑪ sub-type (type="business_cessation" 한정) */
  cessationSubType?: CessationSubType;
  /** 1호 자산처분 — 처분 자산가액 */
  disposedAssetValue?: number;
  /** 1호 자산처분 — 전체 가업용 자산가액 */
  totalBusinessAssetValue?: number;
  /** §15⑩ 단서 — 재차 부과 시 종전 처분 자산 제외분 */
  priorDisposedExcluded?: number;
}

/** 사용자 명시 정당사유 (위반 인덱스 → 사유코드) */
export interface JustifiableReasonEvent {
  /** input.violations 인덱스 */
  violationRef: number;
  reasonCode: JustifiableReasonCode;
}

/** 월별 정규직 데이터 (§15⑰⑱) */
export interface MonthlyEmploymentData {
  /** YYYY-MM (월 말일 기준) */
  monthEnd: string;
  regularEmployees: number;
  /** 분할·합병 승계 인원 (§15⑱) */
  spinoffMerged?: number;
}

/** 정규직·총급여 트래킹 (§15⑬⑰⑱ + §⑤4호 AND) */
export interface EmploymentTracking {
  /** 상속개시 후 5년 월별 데이터 */
  fiveYearData: MonthlyEmploymentData[];
  /** 직전 2개 과세기간 월별 데이터 (기준) */
  priorTwoYearData: MonthlyEmploymentData[];
  /** 5년 총급여액 */
  fiveYearTotalSalary: number;
  /** 직전 2년 총급여액 (기준) */
  priorTwoYearTotalSalary: number;
}

/** 사후관리 추징 시뮬레이터 입력 (계획 §2-2) */
export interface FamilyBusinessPostMgmtInput {
  /** 가업상속공제 적용액 (추징 원금) */
  appliedDeduction: number;
  /** 상속개시일(사망일) — §⑤ "상속개시일부터 5년 이내" 가드 기준 (ISO date) */
  deathDate: string;
  /** 상속세 신고기한 (§67, ISO date) — 이자상당액 기산 */
  filingDeadline: string;
  /** OFZ 특례 활성 — §15⑪1·2호 자동 면제 */
  ofzExemptionActive: boolean;
  /** 5년 추적 — 위반 사건 목록 */
  violations: ViolationEvent[];
  /** 사용자 명시 정당사유 */
  justifiableReasons?: JustifiableReasonEvent[];
  /** 정규직·총급여 트래킹 (§15⑬⑰⑱) */
  employmentTracking?: EmploymentTracking;
  /** 양도세 상당액 환원 공제 (§18의2⑩, transfer-tax 측 산정값 수동 입력) */
  cgtCreditAmount?: number;
  /** 국세기본법 §43의3② 연 이자율 (예: 0.022) */
  annualInterestRate: number;
}

/** 위반별 추징 상세 */
export interface PostMgmtViolationDetail {
  event: ViolationEvent;
  /** 면제 여부 (정당사유·OFZ·5년외) */
  exempted: boolean;
  /** 면제 사유 (exempted=true 시) */
  exemptionReason?: JustifiableReasonCode;
  /** 추징세액 */
  recapture: number;
  /** 이자상당액 */
  interest: number;
}

/** 정규직·총급여 4호 판정 결과 */
export interface PostMgmtEmploymentResult {
  /** 5년 평균 정규직 수 */
  fiveYearAvg: number;
  /** 직전 2년 평균 정규직 수 */
  priorTwoYearAvg: number;
  /** 기준 = priorTwoYearAvg × 0.9 */
  threshold: number;
  /** 정규직 수 90% 미달 (§⑤4호 가) */
  employmentDrop: boolean;
  /** 총급여 90% 미달 (§⑤4호 나) */
  salaryDrop: boolean;
  /** 4호 위반 = 가 AND 나 (§⑤4호 "각 목에 모두") */
  bothViolated: boolean;
}

/** 사후관리 추징 시뮬레이터 결과 */
export interface FamilyBusinessPostMgmtResult {
  /** 추징세액 합계 */
  totalRecapture: number;
  /** 이자상당액 합계 */
  totalInterest: number;
  /** 양도세 환원 공제 적용액 (§18의2⑩) */
  cgtCreditApplied: number;
  /** 순 추징세액 = max(0, totalRecapture − cgtCreditApplied) */
  netRecapture: number;
  /** 위반별 상세 */
  perViolationDetail: PostMgmtViolationDetail[];
  /** 정규직·총급여 판정 (employmentTracking 제공 시) */
  employmentResult?: PostMgmtEmploymentResult;
}

/** 상속세 수정신고 데이터 (별지 제9호서식 매핑, 계획 §4-4 L13) */
export interface AmendmentReturnData {
  /** 추가 결정세액 */
  additionalDeterminedTax: number;
  /** 이자상당액 가산세 */
  interestPenalty: number;
  /** 양도세 환원 공제(기납부세액) */
  cgtCreditReceived: number;
  /** 최종 납부세액 = netRecapture + 이자상당액 */
  netPayable: number;
  /** 수정신고 기한 — 사유발생일 속하는 달 말일 + 6개월 (§18의2⑨), YYYY-MM-DD */
  amendmentDeadline: string;
}
