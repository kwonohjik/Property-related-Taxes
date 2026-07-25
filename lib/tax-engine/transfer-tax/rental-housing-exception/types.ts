/**
 * 장기임대주택 보유자의 거주주택 양도 비과세 특례 — 타입 정의
 *
 * 소득세법 시행령 §155⑳ (주택수 제외 특례)
 * 소득세법 시행령 §161 (PHRP 기준시가 안분)
 *
 * Design: docs/02-design/features/rental-housing-residence-exception.engine.design.md
 */

// ============================================================
// 임대주택 단위 입력
// ============================================================

/**
 * 임대구분 (사용자 선택 축) — 의무임대기간·기준시가 상한은 등록기준일·취득방법에서 파생.
 *
 * long_general: 장기일반민간임대 (가/마/다/바목 — 등록기준일로 5/8/10 파생)
 * short_6y:     단기민간임대 6년 (아/자목, 2025.6.4 신설)
 * pre_2018:     구 임대주택법 (5년)
 * (existing_business 나목·미분양 라목은 Phase 2 — 취득당시 cap 별도 필드 필요)
 */
export type RentalCategory = "long_general" | "short_6y" | "pre_2018";

/** 수도권/비수도권 구분 (조정대상지역은 isRegulatedAreaNewAcq 별도 축) */
export type RegionType = "seoul-metro" | "non-metro";

/** 도출 엔진 목 (§167조의3①2호 가~자) */
export type RentalArticle = "가" | "다" | "마" | "바" | "아" | "자" | "구법";

/**
 * 임대주택 1호 입력 데이터
 *
 * 복수 임대주택 보유 시 배열로 전달. 최소 1호 필수.
 * 1호라도 요건을 충족하면 특례 적용 (§155⑳ 호별 검증).
 */
export type RentalUnitInput = {
  /** 세무서 사업자등록일 (소득세법 §168) */
  businessRegistrationDate: Date;
  /** 지자체 임대사업자등록신청일 (민특법 §5) */
  rentalRegistrationDate: Date;
  /** 임대구분 (도출 목·의무기간·cap의 파생 소스) */
  rentalCategory: RentalCategory;
  /** 매입임대 / 건설임대 구분 */
  rentalAcquisitionType: "purchase" | "construction";
  /** 아파트 여부 (2020.7.11 이후 등록 아파트는 장기일반 불가·단기/건설은 항상 제외) */
  isApartment: boolean;
  /** 소재지 구분 (수도권/비수도권 — cap 산정축) */
  region: RegionType;
  /** 아목 게이트: 1주택 이상 보유 세대원이 조정대상지역에 신규취득한 단기임대 여부 */
  isRegulatedAreaNewAcq: boolean;
  /** 임대개시일 당시 기준시가 (원) — §155⑳ 가액요건 검증용 */
  standardPriceAtRentalStart: number;
  /** 대지면적 (㎡) — 건설임대 규모요건(≤298) 판정용 */
  landAreaM2?: number;
  /** 주택 연면적/전용면적 (㎡) — 건설임대 규모요건(≤149) 판정용 */
  totalFloorAreaM2?: number;
  /** 2호 이상 임대 충족 자기확인 — 건설임대(다/바/자) 호수요건 */
  hasMinimum2Units: boolean;
  /** 실제 임대 개월수 (공실 차감 후) */
  rentalMonths: number;
  /** 자동말소·자진말소 5년 내 양도 여부 (Phase 2 전용, 현재 무조건 false) */
  rentalAutoTermination: boolean;
  /**
   * 기타 요건 자기확인 체크
   * (임대료 5% 이내 증액·임대차계약 체결·임대료 지급 등 — LawArticleModal 안내 후 사용자 확인)
   */
  requirementsConfirmed: boolean;
};

// ============================================================
// 메인 입력 타입
// ============================================================

/**
 * 장기임대주택 거주주택 비과세 특례 입력
 *
 * TransferTaxInput.rentalHousingException? 으로 전달됨.
 */
export type RentalHousingExceptionInput = {
  /** 특례 적용 여부 토글 */
  applyException: boolean;
  /**
   * 시나리오 선택
   * A: 자가 거주주택 양도 (임대주택은 계속 보유)
   * B: 임대주택 → 거주주택으로 전환 후 양도 (직전거주주택보유주택, PHRP)
   */
  scenario: "A" | "B";
  /** 임대주택 목록 (최소 1호) */
  rentalUnits: RentalUnitInput[];
  // ─── B 시나리오 전용 (scenario === 'B' 시 필수) ───
  /** D_prior: 직전거주주택 양도일 */
  priorResidenceTransferDate?: Date;
  /** P_acq: PHRP(임대→거주 전환 주택) 취득 당시 기준시가 (원) */
  standardPriceAtAcquisition?: number;
  /** P_prior: 직전거주주택 양도 당시 PHRP의 기준시가 (원) */
  standardPriceAtPriorTransfer?: number;
  /** P_transfer: PHRP 양도 당시 기준시가 (원) */
  standardPriceAtTransfer?: number;
};

// ============================================================
// 결과 타입
// ============================================================

/** 요건 미충족 임대주택 단위 정보 */
export type RentalUnitFailReason = {
  unitIndex: number;
  code:
    | "RENTAL_PERIOD_SHORT"      // 의무임대기간 미충족
    | "STANDARD_PRICE_EXCEEDED"  // 기준시가 상한 초과
    | "APARTMENT_RESTRICTED"     // 아파트 등록 제한 (2020.7.11 이후·단기/건설)
    | "REQUIREMENTS_NOT_CONFIRMED" // 기타 요건 미확인
    | "SHORT_TERM_REGULATED"     // 아목 단기임대 + 조정대상지역 신규취득
    | "SIZE_REQUIRED"            // 건설임대 면적 미입력 (침묵 통과 차단)
    | "SIZE_EXCEEDED"            // 건설임대 규모(대지298·연면적149) 초과
    | "MIN_UNITS_NOT_MET"        // 건설임대 2호 이상 미충족
    | "BOTH_REG_REQUIRED"        // 세무서·지자체 등록 미완비 (사업자등록등)
    | "RENTAL_TERMINATION_RESTRICTED"; // 자동·자진말소 5년 내 양도 제한 (Phase 2)
  message: string;
};

/** 임대주택 호별 판정기준 echo (결과카드 P5 표시용 — 산식 무변경) */
export type RentalUnitVerdict = {
  unitIndex: number;
  derivedArticle: RentalArticle;
  requiredYears: number;
  stdPriceCap: number;
  effectiveRegDate: string; // ISO date (max 두 등록일)
  sizeRequired: boolean;    // 건설 규모요건 적용 여부
};

/** 요건 판정 결과 */
export type EligibilityResult = {
  /** 전체 통과 여부 (최소 1호 통과 + 거주주택 요건 충족) */
  passed: boolean;
  /** 미충족 사유 목록 */
  failReasons: RentalUnitFailReason[];
  /** 거주주택 요건 미충족 사유 (보유 2년/거주 2년) */
  residenceFailReasons: string[];
  /** 인용된 법령 조문 코드 */
  laws: string[];
  /** 호별 판정기준 echo (결과카드 표시용) */
  perUnitVerdict?: RentalUnitVerdict[];
};

/** §161 안분 산식 추적 데이터 (결과 카드 표기용) */
export type FormulaTrace = {
  /** gain95(표1) — §95① 양도소득금액 (표1 장기보유공제 적용) */
  gain95Table1: number;
  /** gain95(표2) — §95① 양도소득금액 (표2 장기보유공제 적용, 1세대1주택 특례) */
  gain95Table2: number;
  /** r161_1 = (P_prior − P_acq) / (P_transfer − P_acq) (B1·B2-1호) */
  ratio161_1?: number;
  /** r161_2_2 = (P_transfer − P_prior) / (P_transfer − P_acq) (B2-2호) */
  ratio161_2_2?: number;
  /** r_high = (S − 12억) / S (A2·B2 — 고가주택 과세비율) */
  ratioHighValue?: number;
  /** §161③ 캡 발동 여부 */
  capApplied: boolean;
  /** B2 각 호 과세 양도소득금액 (1호 + 2호 합산 전 개별값) */
  part1?: number;
  part2?: number;
};

/**
 * 장기임대주택 거주주택 비과세 특례 계산 결과
 *
 * transfer-tax 엔진의 1세대1주택 비과세·고가주택 분기보다 우선 적용.
 * applied=false 시 일반 분기로 폴백.
 */
export type RentalHousingExceptionResult = {
  /** 특례 적용 여부 (요건 미충족 시 false) */
  applied: boolean;
  /** 시나리오 ID */
  scenarioId: "RH-A1" | "RH-A2" | "RH-B1" | "RH-B2";
  /** 요건 판정 결과 */
  eligibility: EligibilityResult;
  /**
   * 과세대상 양도소득금액 (원)
   * A1: 0 (전액 비과세)
   * A2: gain95(표2) × (S − 12억) / S
   * B1: gain95(표1) × r161_1
   * B2: part1 + part2
   */
  taxableGain: number;
  /**
   * 비과세 양도소득금액 (원) — 보고용
   * B 시나리오: gain95(표1) − taxableGain
   * A1: gain95(표2) 전액
   * A2: gain95(표2) × 12억 / S
   */
  exemptGain: number;
  /** 적용된 장기보유공제 표 구분 */
  appliedTable: "table-1" | "table-2" | "mixed";
  /** §161 산식 추적 데이터 */
  formulaTrace: FormulaTrace;
};
