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
 * 임대주택 등록신청일별 임대유형
 *
 * short-4: 단기임대 4년 (2020.7.10 이전 등록 — 현재 신규등록 불가)
 * short-6: 단기임대 6년 (2025.6.4 이후 신설)
 * long-8: 장기일반민간임대 8년 (2020.7.10 이전 등록)
 * long-10: 장기일반민간임대 10년 (2020.7.11 이후 등록)
 * pre-2018: 2018.3.31 이전 등록 (구 임대주택법 적용, 5년 이상)
 */
export type RentalType =
  | "short-4"
  | "short-6"
  | "long-8"
  | "long-10"
  | "pre-2018";

/** 수도권/비수도권/조정대상지역 구분 */
export type RegionType = "seoul-metro" | "non-metro" | "regulated-area";

/**
 * 임대주택 1호 입력 데이터
 *
 * 복수 임대주택 보유 시 배열로 전달. 최소 1호 필수.
 * 1호라도 요건을 충족하면 특례 적용 (§155⑳ 호별 검증).
 */
export type RentalUnitInput = {
  /** 지자체·세무서 임대사업자 등록신청일 */
  registrationDate: Date;
  /** 임대 유형 (등록신청일에 따른 분류) */
  rentalType: RentalType;
  /** 매입임대 / 건설임대 구분 */
  rentalAcquisitionType: "purchase" | "construction";
  /** 아파트 여부 (2020.7.11 이후 등록 아파트는 장기일반 불가) */
  isApartment: boolean;
  /** 소재지 구분 */
  region: RegionType;
  /** 임대개시일 당시 기준시가 (원) — §155⑳ 가액요건 검증용 */
  standardPriceAtRentalStart: number;
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
    | "APARTMENT_RESTRICTED"     // 아파트 등록 제한 (2020.7.11 이후)
    | "REQUIREMENTS_NOT_CONFIRMED" // 기타 요건 미확인
    | "SHORT_TERM_REGULATED"     // 단기임대 + 조정대상지역 (2025.6.4 이후 신설 유형)
    | "RENTAL_TERMINATION_RESTRICTED"; // 자동·자진말소 5년 내 양도 제한 (Phase 2)
  message: string;
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
