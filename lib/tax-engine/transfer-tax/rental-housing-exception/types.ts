/**
 * 장기임대주택 보유자의 거주주택 양도 비과세 특례 — 타입 정의
 *
 * 소득세법 시행령 §155⑳ (주택수 제외 특례)
 * 소득세법 시행령 §161 (PHRP 기준시가 안분)
 *
 * Design: docs/02-design/features/rental-housing-residence-exception.engine.design.md
 */

import type { ArticleFailCode } from "../../rental-article/check";

// ============================================================
// 임대주택 단위 입력
// ============================================================

/**
 * 임대구분 (사용자 선택 축) — 의무임대기간·기준시가 상한은 등록기준일·취득방법에서 파생.
 *
 * long_general:      장기일반민간임대 (가/마/다/바목 — 등록기준일로 5/8/10 파생)
 * short_6y:          단기민간임대 6년 (아/자목, 2025.6.4 신설)
 * pre_2018:          구 임대주택법 (5년)
 * existing_business: 기존사업자 매입임대 (나목, 2003.10.29 이전 등록·취득당시 3억·국민주택·2호)
 * unsold_08_09:      미분양 매입임대 (라목, 2008.6.11~2009.6.30 최초분양·비수도권·취득당시 3억·5호·298/149)
 * (말소 사목은 다주택 전용 — §155⑳는 §155⑳㉓ 말소 후 5년 특례로 처리)
 */
export type RentalCategory =
  | "long_general" | "short_6y" | "pre_2018" | "existing_business" | "unsold_08_09";

/** 수도권/비수도권 구분 (조정대상지역은 isExcluded918Rule 별도 축) */
export type RegionType = "seoul-metro" | "non-metro";

/** 도출 엔진 목 (§167조의3①2호 가~자 — 사목은 다주택 전용이라 §155⑳ 미도출) */
export type RentalArticle = "가" | "나" | "다" | "라" | "마" | "바" | "아" | "자" | "구법";

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
  /**
   * 918 조정취득 배제 (2018.9.14 이후 조정대상지역 신규취득):
   * - 마목(장기 매입): hard 배제.
   * - 아목(단기 매입): 계약금 지급 증빙(hasContractDepositProof) 있으면 carve-out.
   * (구 isRegulatedAreaNewAcq rename — D-2 아목 게이트 다주택 정합)
   * ※ 생산 경로는 Zod(rentalUnitSchema)가 required 강제 — 엔진 타입은 미해당 목(가/다/구법 등)
   *    구성 편의를 위해 optional. 미제공 시 false/0 default(check.ts falsy·adapter).
   */
  isExcluded918Rule?: boolean;
  /** 아목 918 carve-out — 조정대상지역 공고 전 계약 + 계약금 지급 증빙 */
  hasContractDepositProof?: boolean;
  /** 마·바목 단기→장기 변경신고 배제 여부 */
  isExcludedShortToLongChange?: boolean;
  /** 임대개시일 당시 기준시가 (원) — 가/다/마/바/아/자/구법 가액요건 */
  standardPriceAtRentalStart: number;
  /** 취득당시 기준시가 (원) — 나목 가액요건(취득당시 3억, 지역무관). 미제공 시 adapter 0 */
  acquisitionOfficialPrice?: number;
  /** 국민주택규모(전용 85㎡·수도권 도시지역 60㎡ 이하) 충족 — 나목 요건 */
  isNationalSizeHousing?: boolean;
  /** 대지면적 (㎡) — 건설임대 규모요건(≤298) 판정용 */
  landAreaM2?: number;
  /** 주택 연면적/전용면적 (㎡) — 건설임대 규모요건(≤149) 판정용 */
  totalFloorAreaM2?: number;
  /** 2호 이상 임대 충족 자기확인 — 건설임대(다/바/자)·나목 호수요건 */
  hasMinimum2Units: boolean;
  /** 같은 시·군 5호 이상 임대 충족 — 라목(미분양) 호수요건 */
  hasMinimum5UnitsInCity?: boolean;
  /** 최초 분양계약일 — 라목(미분양) 2008.6.11~2009.6.30 판정용 */
  firstSaleContractDate?: Date;
  /** 실제 임대 개월수 (공실 차감 후) */
  rentalMonths: number;
  /**
   * §155⑳㉓ 말소 특례 — 가·다·라·마목 임대주택이 자진말소(의무기간 1/2 이상)·자동말소된 후
   * 말소 이후 5년 이내 거주주택을 양도하는 경우. true면 의무임대기간요건을 간주 충족(RENTAL_PERIOD_SHORT 억제).
   */
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

/** 요건 미충족 임대주택 단위 정보 (code는 공용 predicate check.ts의 ArticleFailCode 단일 소스) */
export type RentalUnitFailReason = {
  unitIndex: number;
  code: ArticleFailCode;
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
