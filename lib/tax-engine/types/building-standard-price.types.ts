/**
 * 건물 기준시가 계산기 — 타입 정의
 *
 * 출처: 국세청 「건물 기준시가 계산방법」 고시(첨부 PDF, 법령 조문 아님).
 * 위임 근거: 소득세법 §99①1호나목 · 소득세법 시행령 §164⑤⑧③ · 상속세 및 증여세법 §61①2호.
 *
 * 설계: docs/02-design/features/building-standard-price.engine.design.md
 */

/** 세목 모드 — 양도(취득·양도 2시점) / 상속·증여(1시점, 조정율 적용) */
export type BuildingStdPriceTaxType = "transfer" | "inheritance_gift";

/** 잔가율 그룹(내용연수 50/40/30/20년 = I/II/III/IV) */
export type ResidualRateGroup = "I" | "II" | "III" | "IV";

/** 산정기준율 그룹(내용연수 40/30/20년 = I/II/III) — 잔가율 그룹과 별개 체계 */
export type AcqBaseRateGroup = "I" | "II" | "III";

/** §164⑧ 동일연도 양도 환산 산식 — 제1산식(취득전기 기준) / 제2산식(신규 고시 기준) */
export type SameYearFormula = "prev" | "new";

/** 한 시점(취득/양도/평가)의 구조·용도·공시지가 입력 */
export interface BuildingPointInput {
  /** 해당 시점 연도 구조지수표 항목 키(개별 구조명 단위 — STRUCTURE_META 키. 예 "rc"·"wood") */
  structureKey: string;
  /**
   * 해당 시점 연도 용도지수표 항목 번호(연도군별 상이 — listUsageOptions(year)의 `no`).
   * ⚠️ 용도지수 데이터는 번호 기반(resolveUsageIndex(year, usageNo)) — UI 드롭다운이 연도별 번호를 선택해 전달.
   */
  usageNo: number;
  /** ㎡당 개별공시지가(위치지수 산정용). 기준일은 §1.5 */
  landPricePerM2: number;
}

/** 개별건물 특성 조정율 7구분 입력(상증 전용). 실제값 항목은 엔진이 구간 판정 */
export interface SpecialAdjustmentFeatures {
  /** I 지붕재료(구조지수<100일 때만 적용) — 조정율표 번호 1·2·3 */
  roofMaterial?: 1 | 2 | 3;
  /** II 최고층수 실제값(지하·옥탑 제외) → 엔진이 번호 4~8 구간 판정 */
  maxFloors?: number;
  /** II 연면적은 별도 필드 없음 — input.floorArea 재사용(주거용 미적용) → 번호 9~13 */
  /** II 지능형건축물 인증(3~4등급=14:110 / 1~2등급=15:120) */
  intelligentBuildingGrade?: "1-2" | "3-4";
  /** III 단독(16·17)/공동(18·19) 주택 중 1개 */
  houseTypeTier?: 16 | 17 | 18 | 19;
  /** IV 상가층(20~23) */
  commercialFloor?: 20 | 21 | 22 | 23;
  /** IV 부속·주차(24·25) */
  ancillaryParking?: 24 | 25;
  /** V 개축(일부) — 1회=26:110 / 2회↑=27:120 */
  remodelCount?: 26 | 27;
  /** VI 무벽면적비율 실제값(0~1, 납세자 입증) → 번호 28~30 구간 판정 */
  wallessRatio?: number;
  /** VII 구조안전진단/철거(입증) — 번호 31~36 */
  structuralSafety?: 31 | 32 | 33 | 34 | 35 | 36;
  /** VII-37 화재·멸실 정상사용면적비율(0~1) */
  normalUseRatio?: number;
}

/** 건물 기준시가 엔진 입력 */
export interface BuildingStandardPriceInput {
  taxType: BuildingStdPriceTaxType;
  /** 연면적(㎡). 공동주택=전유+공용. 기계식주차 시 미사용 */
  floorArea: number;
  /** 신축연도(준공/사용승인 속한 연도) */
  builtYear: number;
  /** 리모델링(대수선)연도 — 상증만, 잔가율 신축연도 override */
  remodelYear?: number;
  /** 기계식주차전용빌딩 → 특수산식(연도별 단가 × 잔가율 × 주차대수). 구조/용도/위치/연면적 미적용 */
  isMechanicalParking?: boolean;
  /** 기계식주차 주차대수(특수산식). isMechanicalParking 시 필수 */
  parkingLotCount?: number;

  // 양도 모드 (취득시·양도시 2시점)
  transferYear?: number;
  acquisitionYear?: number;
  transfer?: BuildingPointInput;
  acquisition?: BuildingPointInput;
  /** §164⑧ 동일연도 양도 환산용 보유월수(1월 미만=1월). 동일연도 시 필수 */
  holdingMonths?: number;
  /** §164⑧ 기준시가조정월수(전기 결정일~취득 결정일 전일). 미입력 시 12 */
  adjustMonths?: number;
  /** §164⑧ 산식 선택 — 기본 "prev" */
  sameYearFormula?: SameYearFormula;
  /** §164⑧ 제2산식 선택 시 새로운 기준시가 ㎡당 금액 */
  newNoticePricePerM2?: number;
  /** §164⑧ 제1산식 취득전기(취득연도-1) 위치지수용 공시지가 */
  prevLandPricePerM2?: number;
  /** 취득전기 구조키(미입력 시 acquisition.structureKey 재사용) */
  prevStructureKey?: string;
  /** 취득전기 용도번호(미입력 시 acquisition.usageNo 재사용) */
  prevUsageNo?: number;

  // 상속·증여 모드 (1시점)
  valuationYear?: number;
  valuation?: BuildingPointInput;
  /** 조정율 7구분 특성 입력 */
  specialFeatures?: SpecialAdjustmentFeatures;
  /** fallback: 조정율 직접 입력(%, 100=1.0) */
  manualAdjustmentRate?: number;
  /** 조정율 II 판정용 — 주거용 건물 여부(용도지수 구분 I). 연면적 조정 미적용·최고층수는 아파트만 */
  isResidentialUse?: boolean;
  /** 조정율 II 판정용 — 아파트 여부(주거용 중 최고층수 적용 대상) */
  isApartmentUse?: boolean;
}

/** 시점별 산출근거 echo */
export interface BuildingStdPriceBreakdown {
  /** 건물 기준시가(원) */
  standardPrice: number;
  /** ㎡당 금액(1,000원 절사 후). 기계식주차는 없음(주차대수 기반) */
  pricePerM2?: number;
  /** 일반=신축가격기준액 / 기계식주차=연도별 단가 */
  basePrice: number;
  /** ÷100 전 정수(예 110). 기계식주차 미적용 */
  structureIndex?: number;
  usageIndex?: number;
  locationIndex?: number;
  /** 0.xxx */
  residualRate: number;
  /** 상증만 (1.0 기준) */
  adjustmentRate?: number;
  /** 2000.12.31 이전 취득시만 */
  acqBaseRate?: number;
  /** 위치지수 적용 공시지가 기준연도(§1.5 echo) */
  appliedLandPriceYear?: number;
  /** 기계식주차만 echo */
  parkingLotCount?: number;
  /** 기계식주차만 — 적용 내용연수 echo(연도 가변) */
  mechDurableYears?: number;
}

/** 건물 기준시가 엔진 결과 */
export interface BuildingStandardPriceResult {
  /** 상증 1세트 */
  valuation?: BuildingStdPriceBreakdown;
  /** 양도 취득시 */
  acquisition?: BuildingStdPriceBreakdown;
  /** 양도 양도시 */
  transfer?: BuildingStdPriceBreakdown;
  /** §164⑧ 동일연도 환산 적용 여부 */
  sameYearAdjusted?: boolean;
  warnings: string[];
  legalBasis: string;
}
