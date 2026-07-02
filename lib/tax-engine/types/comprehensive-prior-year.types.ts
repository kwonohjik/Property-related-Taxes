/**
 * 직전연도 세부담상한 상당액 타입 — comprehensive.types.ts에서 분리 (800줄 정책).
 *
 * 종합부동산세법 시행령 §5② 직전연도 총세액상당액(재산세상당액 + 종부세상당액) 자동계산.
 * comprehensive.types.ts가 import + re-export하여 기존 import 경로 무변경
 * (`from "./types/comprehensive.types"`로 계속 접근 가능 — corporate.types와 동일 패턴).
 */
import type { AppurtenantSplitInput } from "./comprehensive.types";

export interface PreviousYearAutoInput {
  assessedValue: number;        // 직전연도 공시가격 합산 (합산배제 후, 원)
  isOneHouseOwner: boolean;     // 직전연도 1세대1주택 여부
  birthDate?: Date;             // 고령자 공제 (직전연도 과세기준일 6.1 기준 재판정)
  acquisitionDate?: Date;       // 장기보유 공제 (동일)
  /**
   * 직전연도 자동계산용 감면율 (0~1).
   * 법령 원칙3: 세부담상한 계산 시 직전연도 재산세상당액·종합부동산세상당액은
   * 직전연도 감면 여부와 무관하게 "해당연도 감면비율"을 적용한다.
   * → 해당연도와 동일한 감면율을 전달할 것.
   */
  reductionRate?: number;
  /**
   * 직전연도 자동계산용 공유지분율 (0~1. 미입력 = 단독 소유(1.0) — 기존 동작 보존).
   * 해당연도와 동일한 지분율을 전달할 것 (법령 원칙: effectiveFactor 결합 적용).
   */
  ownershipRatio?: number;
  /**
   * 직전연도 주택별 공시가격(원) — 재산세상당액 주택별 합산용 (누진세율이므로 합산 단일 ≠ 주택별 합산).
   * 미입력 = [assessedValue] 단일 1채로 처리 (하위호환). 입력 시 종부세 과표용 합산도 Σ로 자동 도출.
   */
  priorHouseValues?: number[];
  /**
   * 직전연도 주택별 감면율(0~1) — priorHouseValues와 인덱스 정합. 주택별 감면율이 다른 다주택
   * (예: 사례9 서초 30%·강남 0%·안양 0%)에서 감면을 주택별로 적용. 인덱스 미입력/배열 미입력 시
   * 단일 reductionRate fallback(하위호환 — 단일 감면 사례4 등 동작 보존).
   */
  priorHouseReductionRates?: number[];
  /**
   * 직전연도 주택별 공유지분율(0~1) — priorHouseValues와 인덱스 정합. 주택별 지분이 다른 경우
   * (예: 사례9 강남 50%) 주택별 적용. 미입력 시 단일 ownershipRatio(또는 1.0) fallback.
   */
  priorHouseOwnershipRatios?: number[];
  /**
   * 직전연도 조정대상지역 2주택 여부 (≤2022 중과 2축). 미입력 = false.
   * 직전연도 종부세상당액 세율을 일반→다주택 중과로 분기 (시행령 §5② — 직전연도 세법 적용).
   * ※ 당해연도 ComprehensiveTaxInput.isMultiHouseInAdjustedArea(상한율·당해 세율)와는 별개.
   */
  isMultiHouseInAdjustedArea?: boolean;
  /**
   * 직전연도 세율 주택 수 (3주택 이상 중과 판정). 미입력 = priorHouseValues.length ?? 1.
   */
  taxableHouseCount?: number;
  /**
   * 직전연도 §8④ 특례주택(지방저가·상속·일시적2주택 등) 공시가격 합(원).
   * §9⑦⑨: 1세대1주택+§8④ 고령자·장기보유 공제는 (산출세액 − §8④분 안분) × 공제율.
   * 미입력 = §8④ 없음 → 안분 미적용(전체에 공제율). 입력 시 안분 분자 main = priorSum − 이 값.
   * ※ 당해 §8④ 안분(15억/17억)과 별개 — 직전 공시 기준.
   */
  priorSection8Para4Value?: number;
  /**
   * 직전연도 건물·부속토지 시가표준액 비율 안분 (사례6). 미입력 = 분리 없음.
   * ★ 당해 appurtenantSplit과 독립 — 시가표준액 연도 변동(당해 8억/2억 → 직전 7.8억/2.6억)으로
   *   안분비율이 다름(당해 0.8 ≠ 직전 0.75). ownershipRatio(공유지분, 연도 불변)와 구분.
   */
  appurtenantSplit?: AppurtenantSplitInput;
}

/**
 * 직전연도 재산세상당액(①) 주택별 산출 내역 — 산출근거 표시용 echo (계산 무변경).
 * 주택별 감면율·세율구간이 달라 합산 단일 산식으로 표현 불가 → 주택별 행으로 표시.
 */
export interface PriorPropertyTaxLine {
  assessedValue: number;   // 주택 직전 공시가격
  taxBase: number;         // 재산세 과세표준 = floor(공시 × 재산세FMR)
  standardTax: number;     // 표준세율 재산세 (감면·지분 전)
  reductionRate: number;   // 적용 감면율 (0~1)
  ownershipRatio: number;  // 적용 지분율 (0~1)
  reducedTax: number;      // 감면·지분 반영 후 재산세상당액 (합계 분자)
}

export interface PreviousYearEquivalentResult {
  propertyTaxEquiv: number;        // ⑭(5호)/⑦(부표) 직전연도 재산세상당액 (표준세율 재계산)
  comprehensiveTaxEquiv: number;   // ⑮(5호)/⑫(부표) 직전연도 종합부동산세상당액
  total: number;                   // ⑯ = propertyTaxEquiv + comprehensiveTaxEquiv
  detail: {
    assessedValue: number;         // 부표 ① 직전연도 공시가격
    basicDeduction: number;        // 부표 ② 공제금액 (1주택 시 추가공제 포함)
    basicDeductionGeneral: number; // 부표 ② 병기용 일반 기본공제 (연도별 6억/9억) — 1주택 라벨 비교값
    fairMarketRatio: number;       // 부표 ③ 공정시장가액비율 (2021 = 0.95)
    taxBase: number;               // 부표 ④ 종부세 과세표준
    appliedRate: number;           // 부표 ⑤ 세율
    progressiveDeduction?: number; // ②ⓐ 종부세액 누진공제액 (산식 "× 세율 − 누진공제" 표시용 echo)
    calculatedTax: number;         // 부표 ⑥ 재산세공제전 종부세액
    stdTaxNumerator: number;       // 부표 ⑧ 과세표준 표준세율 재산세액
    stdTaxDenominator: number;     // 부표 ⑨ 총표준세율 재산세액
    creditAmount: number;          // 부표 ⑩ 공제할 재산세액
    oneHouseDeductionRate: number; // 부표 ⑪ 세액공제율
    oneHouseDeductionAmount: number; // 부표 ⑪ 세액공제액
    propertyFairMarketRatio?: number; // 직전연도 재산세 FMR (교재 ⑤나 "× 60%" — getPropertyFmrForProration)
    propertyTaxBaseAmount?: number;   // 직전연도 재산세 과세표준 (교재 ⑤나 "= 8.4억" — assessedValue × FMR)
    effectiveAssessedValue?: number;  // ②ⓐⓑ 라벨용 — 주택별 감면후 공시 합(종부세 과표·총표준세율재산세 기준)
    propertyTaxBreakdown?: PriorPropertyTaxLine[]; // ① 주택별 산출 내역 (산출근거 표시용 echo)
  };
}
