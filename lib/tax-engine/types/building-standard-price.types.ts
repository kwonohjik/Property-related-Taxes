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

  // 복합 건물 (상속·증여 1시점 전용)
  /** 다필지 부속토지 — 위치지수를 면적가중평균 ㎡당 공시지가로 산정(고시 §6⑥). landParcels 있으면 단일 공시지가 무시 */
  landParcels?: LandParcel[];
  /** 층/부분별 구조·용도가 다른 복합건물 — 각 부분 독립 계산 후 합산. 있으면 valuation 단일 point 무시 */
  compositeParts?: BuildingCompositePart[];
  /**
   * 공용 부속시설 총면적(㎡, 주차장+보일러실+기계실 등). compositeParts의 주용도 면적비율로 안분(고시 계산서 V항).
   * 각 부분의 sharedAdjustmentRate와 함께 사용. 단독으론 무효.
   * @deprecated ancillaryFacilities로 종류 분해(엔진 내부에서 [{kind:"other"}]로 정규화 — 하위호환·결과 불변).
   */
  sharedFacilityArea?: number;
  /**
   * 부속시설 종류별 면적 — Ⅳ·Ⅴ 종류 분해(주차장·기계실·보일러실·대피소·옥탑·기타).
   * sharedFacilityArea와 동시 입력 = 검증 오류. 양쪽 미입력이면 부속 미적용.
   * 종류별 합 = sharedFacilityArea 단일 합계와 numeric 동일(echo·표시 전용 분해).
   */
  ancillaryFacilities?: AncillaryFacility[];

  /** 공동주택 고시 전 취득 → 취득당시 기준시가 환산(양도 전용). builtYear·acquisitionYear는 본 input 공통 */
  apartmentConversion?: ApartmentConversionInput;
}

/**
 * 공동주택 기준시가 고시 전 취득 → 취득당시 기준시가 환산 입력(소령 §164·고시).
 * 취득당시 = 최초고시 공동주택기준시가 × (취득당시 토지+건물) ÷ (최초고시 토지+건물).
 * 토지 = 공시지가 × 대지지분면적 / 건물 = 2001 건물기준시가 × 산정기준율(해당 시점).
 */
export interface ApartmentConversionInput {
  /** ① 최초고시 공동주택기준시가(원) */
  firstNoticeApartmentPrice: number;
  /** 최초고시 연도(산정기준율 취득연도 기준) */
  firstNoticeYear: number;
  /** 대지(지분)면적(㎡) */
  landAreaM2: number;
  /** 건물 연면적(전유+공용, ㎡) — 2001 건물기준시가 산정용 */
  totalFloorArea: number;
  structureKey: string;
  usageNo: number;
  /** ② 최초고시 시점 ㎡당 공시지가 */
  firstNoticeLandPrice: number;
  /** ④ 취득당시 ㎡당 공시지가 */
  acquisitionLandPrice: number;
  /** 2001 건물기준시가 위치지수 산정용 ㎡당 공시지가 */
  building2001LandPrice: number;
}

/** 다필지 부속토지 1필지(위치지수 가중평균용) */
export interface LandParcel {
  /** 필지 면적(㎡) */
  areaM2: number;
  /** ㎡당 개별공시지가 */
  pricePerM2: number;
}

/** 복합건물 1개 부분(층/구역) — 구조·용도·면적 상이. 위치지수·신축연도·평가연도는 건물 공통 */
export interface BuildingCompositePart {
  /** 부분명(예 "1층 공장") */
  label?: string;
  structureKey: string;
  usageNo: number;
  floorArea: number;
  /**
   * 취득시점 용도번호 — 양도 복합 전용. 용도번호 체계가 연도군별 상이(근린생활시설 2001=#27 ↔ 2023=#41).
   * 양도 복합에서 미입력 = 검증 오류(usageNo 재사용 fallback 금지 — 잘못된 지수 적용 방지). 상증·단일 무시.
   */
  acqUsageNo?: number;
  /** 조정율 배율(1.0 기준, 100=1.0 미적용). 부분별 상이. 미입력 = 1.0 */
  adjustmentRate?: number;
  /**
   * 조정율 번호 ⓧⓨⓩ(최대 3, 상증 전용) — 계산서 Ⅲ "조정률(번호)" 칸 "0.9(9)" 표기.
   * 입력 시 adjustmentRate(%) 대신 번호→지수 곱으로 배율 산정. adjustmentRate와 동시 입력 = 검증 오류.
   */
  adjustmentNos?: number[];
  /**
   * 공용 부속시설(주차장·보일러실 등) 귀속분 조정율(100=1.0). 지정 시 sharedFacilityArea를 이 부분의
   * 주용도 면적비율로 안분해 공용 기준시가를 별도 산정(주용도 구조·용도·위치·잔가는 동일, 조정율만 다름).
   */
  sharedAdjustmentRate?: number;
  /** 공용 부속분 조정율 번호(최대 3, 상증 전용) — 계산서 Ⅳ. sharedAdjustmentRate와 동시 입력 = 검증 오류. */
  sharedAdjustmentNos?: number[];
}

/** 부속시설 종류 — 계산서 Ⅴ항 열 Ci~Hi 순서 고정 */
export type AncillaryFacilityKind =
  | "parking" // Ci 주차장(지하 포함)
  | "machine" // Di 기계실
  | "boiler" // Ei 보일러실
  | "shelter" // Fi 대피소
  | "rooftop" // Gi 옥탑
  | "other"; // Hi 기타

/** 부속시설 종류별 총면적(㎡) — sharedFacilityArea(단일 합계)의 종류 분해 */
export interface AncillaryFacility {
  kind: AncillaryFacilityKind;
  areaM2: number;
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
  /** 복합건물 부분명 echo(층/구역) */
  label?: string;
  /** 해당 부분 면적(㎡) echo */
  floorArea?: number;
  /** 잔가율 그룹 echo — 계산서 Ⅱ "내용연수(그룹별)" 표기용 */
  residualGroup?: ResidualRateGroup;
  /** 내용연수(연) echo — Ⅱ "50년/40년". durableForGroup(group, year) */
  durableYears?: number;
  /**
   * 적용 조정률 번호 echo — 계산서 Ⅲ·Ⅳ "조정률(번호)" 칸 "0.9(9)" 표기.
   * IV구분 동시해당(상가층+부속 → 지수 60)은 번호 2개·rate 1개 → {nos[], rate}. 미적용 시 undefined.
   */
  adjustmentItems?: { nos: number[]; rate: number }[];
  /** 부속시설 행 마킹 — Ⅳ 분리 필터용. undefined = 주용도(Ⅲ) */
  ancillaryKind?: AncillaryFacilityKind;
  /** 부속 귀속 부분명 echo — "주차장(슈퍼귀속)" 표기용 */
  attributedTo?: string;
  /** 적용요령 echo(인쇄·서식용) — 일반 건물만. 산식 무관 표시 전용 */
  applyNotes?: BuildingStdPriceApplyNotes;
}

/** 계산서 Ⅴ "주용도에 의한 부속시설 면적 안분" 1행 */
export interface AncillaryApportionRow {
  /** 귀속 부분명 */
  label?: string;
  /** 해당 부분 주용도지수(정수 100기준) — Ⅴ "주용도지수" 칸 */
  usageIndex: number;
  /** Bi = 주용도 면적비율(원천 분수 — 표시 반올림은 UI) */
  ratio: number;
  /** Ai = 종류별 안분면적 합(㎡) */
  areaSum: number;
  /** Ci~Hi 종류별 안분면적(㎡, toFixed(2) 후) */
  byKind: Partial<Record<AncillaryFacilityKind, number>>;
}

/** 계산서 Ⅴ 안분계산표 echo */
export interface AncillaryApportionment {
  /** 계(t): At */
  totalArea: number;
  /** 계(t): Ct~Ht */
  totalByKind: Partial<Record<AncillaryFacilityKind, number>>;
  rows: AncillaryApportionRow[];
}

/** ※ 2000.12.31 이전 취득 복합 환산 echo(양도 전용) */
export interface AcqBaseConversion {
  /** (1) 2001.1.1 현재 건물 기준시가(복합 합계 ⑪) */
  total2001: number;
  /** (2) 산정기준율 — 부분 구조가 단일 그룹일 때만(상이 시 undefined → 부분별 적용) */
  acqBaseRate?: number;
  /** (3) = 단일 그룹: floor((1)×(2)) / 그룹 상이: Σ floor(부분⑩×부분율) */
  convertedTotal: number;
}

/** 결과 서식 "적용요령" 칸 텍스트 echo(산식 변경 없음). 예 구조 "철골조" · 용도 "6. 여관" */
export interface BuildingStdPriceApplyNotes {
  /** 구조지수 — 구조 표시명. 예 "철골조" */
  structure?: string;
  /** 용도지수 — "번호. 표시명". 예 "6. 여관" */
  usage?: string;
  /** 위치지수 — "번호. 구간". 예 "17. 120만원 이상~160만원 미만" */
  location?: string;
  /** 잔가율 — "그룹, 신축연도, 경과". 예 "II그룹, 2004년 신축, 19년 경과" */
  residual?: string;
  /** 조정률 — 적용 특성. 예 "1. 기와·징크 등 지붕 & 4. 5층 이하" (상증 특성 모드만). 직접입력 시 undefined */
  adjustment?: string;
}

/** 공동주택 고시 전 취득 환산 결과(산출근거 echo) */
export interface ApartmentConversionResult {
  /** 취득당시 환산 기준시가(원) — Ⅰ */
  convertedAcquisitionPrice: number;
  /** 2001 건물기준시가(원) */
  base2001BuildingPrice: number;
  /** ② 최초고시 토지가액 */
  firstNoticeLandValue: number;
  /** ③ 최초고시 건물기준시가(= 2001건물 × 산정기준율) */
  firstNoticeBuildingValue: number;
  /** ④ 취득당시 토지가액 */
  acqLandValue: number;
  /** ⑤ 취득당시 건물기준시가 */
  acqBuildingValue: number;
  firstNoticeAcqBaseRate: number;
  acquisitionAcqBaseRate: number;
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
  /** 복합건물 부분별 breakdown(층/구역) */
  compositeBreakdowns?: BuildingStdPriceBreakdown[];
  /** 복합건물 부분 기준시가 합계(원) */
  compositeTotal?: number;
  /** 양도 복합 — 취득시점 부분별 breakdown(Ⅲ·Ⅳ 마킹 포함) + 합계(2001 ≤2000 시 total=total2001) */
  acquisitionComposite?: { breakdowns: BuildingStdPriceBreakdown[]; total: number };
  /** 양도 복합 — 양도시점 부분별 breakdown + 합계 */
  transferComposite?: { breakdowns: BuildingStdPriceBreakdown[]; total: number };
  /** 계산서 Ⅴ 안분계산표(상증·양도 공용 — 부분 구성 공통이므로 1벌) */
  ancillaryApportionment?: AncillaryApportionment;
  /** ※식 echo(양도 취득 ≤2000 복합) */
  acqBaseConversion?: AcqBaseConversion;
  /** 다필지 면적가중평균 ㎡당 공시지가 echo */
  weightedLandPricePerM2?: number;
  /** 공동주택 고시 전 취득 환산 결과 */
  apartmentConversion?: ApartmentConversionResult;
  warnings: string[];
  legalBasis: string;
}
