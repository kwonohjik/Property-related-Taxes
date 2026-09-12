/**
 * 취득세 간주취득 판정 모듈
 *
 * 지방세법 §7④⑤·§10의6 — 간주취득 3종 (구 §7의2는 §7로 통합되어 폐지):
 * 1. 과점주주 (법인 주식 취득, §7⑤ — 과세표준 §10의6④)
 * 2. 토지 지목변경 (§7④ — 과세표준 §10의6①)
 * 3. 건물 개수(改修) (과세표준 §10의6③ — 면적 증가분은 §11③ 원시취득)
 */

import { ACQUISITION } from "./legal-codes";
import type {
  DeemedAcquisitionInput,
  DeemedBucketBreakdown,
  DeemedMajorShareholderResult,
  LandCategory,
  LandTaxBaseBasis,
} from "./types/acquisition.types";

// ============================================================
// 간주취득 결과 타입
// ============================================================

export interface DeemedLandCategoryResult {
  isSubjectToTax: boolean;
  /** 본칙이면 사실상취득가격, 보충이면 「변경 이후 − 변경 전」 시가표준액 차액 */
  deemedTaxBase: number;
  /** 어느 조문으로 산정했는가 — 근거 문자열은 `landTaxBaseLegalBasis()` 단일 소스 */
  basis: LandTaxBaseBasis;
  /** 본칙(§10의6①1호) 적용 시의 사실상취득가격 */
  actualPrice?: number;
  prevStandardValue?: number;
  newStandardValue?: number;
  legalBasis: string;
  warnings: string[];
}

/**
 * 지목변경 과세표준의 **조문 근거** — 엔진·UI 단일 소스.
 *
 * UI가 이 판정을 손으로 다시 쓰면 조문이 두 곳에서 갈린다
 * (`feedback_ui_engine_dual_truth_avoidance`).
 */
export function landTaxBaseLegalBasis(basis: LandTaxBaseBasis): string {
  return basis === "actual_price"
    ? ACQUISITION.DEEMED_LAND_BASE_ACTUAL
    : ACQUISITION.DEEMED_LAND_BASE_STANDARD;
}

export interface DeemedRenovationResult {
  isSubjectToTax: boolean;
  deemedTaxBase: number;   // 개수 후 시가표준액 - 개수 전 시가표준액
  prevStandardValue: number;
  newStandardValue: number;
  legalBasis: string;
  warnings: string[];
}

// LandCategory 타입 재수출 (외부에서 이 파일을 통해 접근할 수 있도록)
export type { LandCategory, LandTaxBaseBasis };

// ============================================================
// 1. 과점주주 간주취득 (지방세법 §7⑤)
// ============================================================

/**
 * 과점주주 간주취득 판정
 *
 * 과점주주 = 주주 1인 + 특수관계인 지분 합계 50% 초과
 *
 * 판정 기준:
 * - 취득 전 비과점주주 → 취득 후 과점주주: 전체 지분율 기준 간주취득
 * - 취득 전 과점주주 → 지분율 증가: 증가분 지분율 기준 간주취득
 * - 유가증권·코스닥 상장법인 주식: 과점주주 정의에서 제외(지방세기본법 §46) → 간주취득 비과세
 *   (코넥스는 제외 대상 아님 — 과세)
 */
export function assessMajorShareholder(
  input: NonNullable<DeemedAcquisitionInput["majorShareholder"]>
): DeemedMajorShareholderResult {
  const warnings: string[] = [];
  const { corporateAssetValue, prevShareRatio, newShareRatio, isListed, isFoundingShare } = input;

  // ① 증권시장 상장법인은 과점주주 정의에서 제외 → 간주취득 비과세
  //    근거: 지방세기본법 §46(시행령 §24①) — "대통령령으로 정하는 증권시장"은
  //    유가증권시장·코스닥시장만. 코넥스(KONEX)는 제외 대상이 아니므로 과세된다.
  //    (isListed 플래그는 유가증권·코스닥 상장을 전제 — 코넥스는 false로 입력해야 함)
  if (isListed) {
    return {
      isSubjectToTax: false,
      deemedTaxBase: 0,
      prevShareRatio,
      newShareRatio,
      taxableRatio: 0,
      legalBasis: ACQUISITION.LISTED_NOT_OLIGOPOLY,
      warnings: [
        `유가증권시장·코스닥시장 상장법인 주식 취득은 과점주주 정의에서 제외되어 ` +
        `간주취득 과세 대상이 아닙니다 (${ACQUISITION.LISTED_NOT_OLIGOPOLY}, 시행령 §24①). ` +
        `다만 코넥스(KONEX) 상장법인은 제외 대상이 아니므로 과세됩니다.`,
      ],
    };
  }

  // [R3-08] 합병·분할로 인한 주식 취득 포괄면제 분기 제거.
  //   §7⑤에 합병·분할 주식취득 포괄면제 명문 없음 → 원칙적으로 과점주주 간주취득 과세.
  //   지특법 §57의2⑤(부실금융기관 인수·출자전환·지주회사·주식의 포괄적 교환 등) 한정 면제는
  //   7개 호별 요건·추징조건·일몰(≤2027.12.31)을 개별 판정해야 하므로 별도 특례로 처리한다.

  // ③ 법인 설립 시 주식 취득 — 취득으로 보지 아니함 (지방세법 §7⑤ 괄호)
  if (isFoundingShare) {
    return {
      isSubjectToTax: false,
      deemedTaxBase: 0,
      prevShareRatio,
      newShareRatio,
      taxableRatio: 0,
      legalBasis: ACQUISITION.DEEMED_FOUNDING_EXEMPT,
      warnings: [`법인 설립 시 발행 주식 취득으로 과점주주가 된 경우 취득으로 보지 아니합니다 (${ACQUISITION.DEEMED_FOUNDING_EXEMPT}).`],
    };
  }

  const MAJORITY_THRESHOLD = 0.5; // 과점주주 기준: 지분 합계 50% 초과

  const wasOverThreshold = prevShareRatio > MAJORITY_THRESHOLD;
  const isOverThreshold = newShareRatio > MAJORITY_THRESHOLD;

  // Case 1: 취득 후에도 50% 이하 → 과점주주 아님
  if (!isOverThreshold) {
    return {
      isSubjectToTax: false,
      deemedTaxBase: 0,
      prevShareRatio,
      newShareRatio,
      taxableRatio: 0,
      legalBasis: ACQUISITION.DEEMED_ACQUISITION,
      warnings: ["취득 후 지분율 50% 이하 — 과점주주 해당 없음."],
    };
  }

  let taxableRatio: number;

  if (!wasOverThreshold) {
    // Case 2: 비과점주주 → 과점주주 (최초 과점주주 취득): 취득 후 전체 지분율 기준
    taxableRatio = newShareRatio;
    warnings.push("최초 과점주주 취득: 취득 후 지분율 전체를 과세 기준으로 적용합니다.");
  } else {
    // Case 3: 과점주주 → 지분율 증가: 증가분만 과세.
    // [L4] 부동소수 뺄셈 노이즈(0.6−0.3=0.2999…) 제거 — 과세표준 1원 과소 방지.
    taxableRatio = Math.round((newShareRatio - prevShareRatio) * 1e12) / 1e12;
    if (taxableRatio <= 0) {
      return {
        isSubjectToTax: false,
        deemedTaxBase: 0,
        prevShareRatio,
        newShareRatio,
        taxableRatio: 0,
        legalBasis: ACQUISITION.DEEMED_ACQUISITION,
        warnings: ["지분율 증가 없음 — 간주취득 과세 대상 아님."],
      };
    }
    warnings.push("과점주주 지분율 증가: 증가분 지분율만 과세 기준으로 적용합니다.");
  }

  /**
   * 간주취득 과세표준 = 법인 보유 부동산등 **장부상 총가액** × 과세 지분율 (§10의6④).
   *
   * 「해당 법인의 결산서와 그 밖의 장부 등에 따른 그 부동산등의 총가액을 그 법인의 주식 …
   * 총수로 나눈 가액에 과점주주가 취득한 주식 … 수를 곱한 금액」 — 「총가액 × 지분율」과
   * 같은 식이다(지분율 = 취득주식수 ÷ 총주식수).
   *
   * ## 버킷이 있으면 물건마다 따로 낸다
   *
   * §15② 단서는 「취득**물건이**」 기준이라 물건 단위로 갈린다. 그래서 버킷별로
   * `floor(장부가액 × 지분율)`을 내고 합산한다 — 총액에 한 번 floor 하지 않는다.
   * ⚠️ 잔액 흡수(`feedback_floor_residual_absorption`)를 **하지 않는다**. 버킷은 안분 조각이
   *    아니라 **서로 다른 세율을 받는 별개 물건**이므로, 잔액을 옮기면 세율이 다른 칸으로
   *    금액이 이동한다.
   */
  const inputBuckets = input.assetBuckets;
  if (inputBuckets && inputBuckets.length > 0) {
    const buckets: DeemedBucketBreakdown[] = inputBuckets.map((b) => ({
      label: b.label,
      bookValue: b.bookValue,
      proviso: b.proviso,
      luxuryType: b.luxuryType,
      taxBase: Math.floor(b.bookValue * taxableRatio),
    }));
    const bucketTotalBookValue = buckets.reduce((a, b) => a + b.bookValue, 0);
    const bucketTaxBase = buckets.reduce((a, b) => a + b.taxBase, 0);
    if (buckets.some((b) => b.proviso === "luxury")) {
      warnings.push(
        `물건별 구분 입력: 사치성 재산(${ACQUISITION.LUXURY_SURCHARGE}) 해당 물건은 ` +
        `중과기준세율의 100분의 500을 적용합니다 (${ACQUISITION.DEEMED_RATE_PROVISO}).`,
      );
    }
    return {
      isSubjectToTax: true,
      deemedTaxBase: bucketTaxBase,
      prevShareRatio,
      newShareRatio,
      taxableRatio,
      // 총가액은 버킷 합계가 단일 진실이다 (호출부가 보낸 값으로 덮지 않는다)
      corporateAssetValue: bucketTotalBookValue,
      buckets,
      legalBasis: ACQUISITION.DEEMED_ACQUISITION,
      warnings,
    };
  }

  const deemedTaxBase = Math.floor(corporateAssetValue * taxableRatio);

  return {
    isSubjectToTax: true,
    deemedTaxBase,
    prevShareRatio,
    newShareRatio,
    taxableRatio,
    corporateAssetValue, // 결과 카드 장부가액 행·산식 표시용 (§10의6④)
    legalBasis: ACQUISITION.DEEMED_ACQUISITION,
    warnings,
  };
}

// ============================================================
// 2. 토지 지목변경 간주취득 (지방세법 §7④)
// ============================================================

/**
 * 토지 지목변경 간주취득 판정
 *
 * 과세표준은 **두 조문이 순위를 이룬다** (「지방세법」 §10의6):
 *
 * 1. **본칙 §10의6①1호** — 「토지의 지목을 사실상 변경한 경우 … 그 변경으로 증가한 가액에
 *    해당하는 **사실상취득가격**」. `actualPrice`가 오면 그 값이 곧 과세표준이다.
 * 2. **보충 §10의6②1호 + 시행령 §18의6 1호** — ②는 「①에도 **불구하고** … 사실상취득가격을
 *    **확인할 수 없는 경우**」에만 열린다. 계산방법은 시행령이 정한다:
 *    「가목(지목변경 **이후** 시가표준액) − 나목(지목변경 **전** 시가표준액)」.
 *
 * ⚠️ 종전에는 2번**만** 있었다 — 보충법을 본칙처럼 썼다. 확인된 사실상취득가격이 있으면
 *    ②의 요건 자체가 성립하지 않으므로 **본칙이 이긴다**(anchor AT-LC-04).
 *
 * 어느 경로든 「증가한 가액」이 아니면(0 이하) 과세 없음.
 */
export function assessLandCategoryChange(
  input: NonNullable<DeemedAcquisitionInput["landCategory"]>
): DeemedLandCategoryResult {
  const warnings: string[] = [];
  const { prevCategory, newCategory, actualPrice, prevStandardValue, newStandardValue } = input;

  const basis: LandTaxBaseBasis = actualPrice !== undefined ? "actual_price" : "standard_value";
  const diff =
    basis === "actual_price"
      ? (actualPrice ?? 0)
      : (newStandardValue ?? 0) - (prevStandardValue ?? 0);

  if (diff <= 0) {
    warnings.push(
      basis === "actual_price"
        ? `지목변경으로 증가한 가액에 해당하는 사실상취득가격이 0 이하 — 간주취득 과세 없음 (${ACQUISITION.DEEMED_LAND_BASE_ACTUAL}).`
        : `지목변경 후 시가표준액(${(newStandardValue ?? 0).toLocaleString()})이 변경 전(${(prevStandardValue ?? 0).toLocaleString()}) 이하 — 간주취득 과세 없음.`
    );
    return {
      isSubjectToTax: false,
      deemedTaxBase: 0,
      basis,
      actualPrice,
      prevStandardValue,
      newStandardValue,
      legalBasis: ACQUISITION.DEEMED_ACQUISITION,
      warnings,
    };
  }

  warnings.push(
    basis === "actual_price"
      ? `지목변경: ${prevCategory} → ${newCategory} (사실상취득가격 ${diff.toLocaleString()} 과세 — ${ACQUISITION.DEEMED_LAND_BASE_ACTUAL})`
      : `지목변경: ${prevCategory} → ${newCategory} (시가표준액 증가분 ${diff.toLocaleString()} 과세 — 사실상취득가격을 확인할 수 없는 경우의 보충법, ${ACQUISITION.DEEMED_LAND_BASE_STANDARD})`
  );

  // 취득 시기 안내: 두 날짜 중 빠른 날 기준 (지방세법 §20)
  if (input.actualChangeDate && input.registrationDate) {
    const earlier = input.actualChangeDate < input.registrationDate
      ? input.actualChangeDate
      : input.registrationDate;
    warnings.push(
      `취득 시기: 사실상 변경 완료일(${input.actualChangeDate})과 공부 변경 등록일(${input.registrationDate}) 중 빠른 날(${earlier})을 기준으로 신고·납부 기한(60일)을 산정하세요 (${ACQUISITION.ACQUISITION_TIMING}).`
    );
  } else if (input.actualChangeDate) {
    warnings.push(
      `취득 시기: 사실상 변경 완료일(${input.actualChangeDate}) 기준. 공부 변경 등록일이 더 빠른 경우 등록일로 신고하세요 (${ACQUISITION.ACQUISITION_TIMING}).`
    );
  } else if (input.registrationDate) {
    warnings.push(
      `취득 시기: 공부 변경 등록일(${input.registrationDate}) 기준. 사실상 변경이 더 일찍 완료된 경우 해당 완료일로 신고하세요 (${ACQUISITION.ACQUISITION_TIMING}).`
    );
  }

  return {
    isSubjectToTax: true,
    deemedTaxBase: diff,
    basis,
    actualPrice,
    prevStandardValue,
    newStandardValue,
    legalBasis: ACQUISITION.DEEMED_ACQUISITION,
    warnings,
  };
}

// ============================================================
// 3. 건물 개수(改修) 간주취득 (지방세법 §10의6③ — 과세표준)
// ============================================================

/**
 * 건물 개수(改修) 간주취득 판정
 *
 * 건물의 구조 변경·용도 변경·대수선으로 시가표준액이 증가한 경우:
 *   간주취득 과세표준 = 개수 후 시가표준액 - 개수 전 시가표준액
 *
 * 적용 대상 개수 유형:
 * - structural_change: 건물 구조 변경 (목조→철근콘크리트 등)
 * - use_change: 용도 변경 (창고→주택 등)
 * - major_repair: 대수선 (주요 구조부 수선)
 */
export function assessBuildingRenovation(
  input: NonNullable<DeemedAcquisitionInput["renovation"]>
): DeemedRenovationResult {
  const warnings: string[] = [];
  const { renovationType, prevStandardValue, newStandardValue } = input;

  const diff = newStandardValue - prevStandardValue;

  if (diff <= 0) {
    warnings.push(
      `개수 후 시가표준액(${newStandardValue.toLocaleString()}이 개수 전(${prevStandardValue.toLocaleString()} 이하 — 간주취득 과세 없음.`
    );
    return {
      isSubjectToTax: false,
      deemedTaxBase: 0,
      prevStandardValue,
      newStandardValue,
      legalBasis: ACQUISITION.DEEMED_ACQUISITION,
      warnings,
    };
  }

  const renovationTypeLabel =
    renovationType === "structural_change" ? "구조 변경" :
    renovationType === "use_change" ? "용도 변경" : "대수선";

  warnings.push(`건물 개수(${renovationTypeLabel}): 시가표준액 증가분 ${diff.toLocaleString()} 간주취득 과세`);

  // 취득 시기 안내: 사용승인일·사실상 사용개시일 중 빠른 날 기준 (지방세법 §20)
  if (input.usageApprovalDate && input.actualUsageDate) {
    const earlier = input.usageApprovalDate < input.actualUsageDate
      ? input.usageApprovalDate
      : input.actualUsageDate;
    warnings.push(
      `취득 시기: 사용승인일(${input.usageApprovalDate})과 사실상 사용개시일(${input.actualUsageDate}) 중 빠른 날(${earlier})을 기준으로 신고·납부 기한(60일)을 산정하세요 (${ACQUISITION.ACQUISITION_TIMING}).`
    );
  } else if (input.usageApprovalDate) {
    warnings.push(
      `취득 시기: 사용승인일(${input.usageApprovalDate}) 기준. 사용승인 전 실제 사용 시 사실상 사용개시일을 기준으로 신고하세요 (${ACQUISITION.ACQUISITION_TIMING}).`
    );
  } else if (input.actualUsageDate) {
    warnings.push(
      `취득 시기: 사실상 사용개시일(${input.actualUsageDate}) 기준 (${ACQUISITION.ACQUISITION_TIMING}).`
    );
  }

  return {
    isSubjectToTax: true,
    deemedTaxBase: diff,
    prevStandardValue,
    newStandardValue,
    legalBasis: ACQUISITION.DEEMED_ACQUISITION,
    warnings,
  };
}

// ============================================================
// 통합 간주취득 판정
// ============================================================

export interface DeemedAcquisitionResult {
  type: "major_shareholder" | "land_category" | "renovation" | null;
  isSubjectToTax: boolean;
  deemedTaxBase: number;
  detail: DeemedMajorShareholderResult | DeemedLandCategoryResult | DeemedRenovationResult | null;
  legalBasis: string;
  warnings: string[];
}

/**
 * 간주취득 종합 판정 — 3가지 유형 중 해당 유형 처리
 */
export function assessDeemedAcquisition(
  input: DeemedAcquisitionInput
): DeemedAcquisitionResult {
  if (input.majorShareholder) {
    const result = assessMajorShareholder(input.majorShareholder);
    return {
      type: "major_shareholder",
      isSubjectToTax: result.isSubjectToTax,
      deemedTaxBase: result.deemedTaxBase,
      detail: result,
      legalBasis: result.legalBasis,
      warnings: result.warnings,
    };
  }

  if (input.landCategory) {
    const result = assessLandCategoryChange(input.landCategory);
    return {
      type: "land_category",
      isSubjectToTax: result.isSubjectToTax,
      deemedTaxBase: result.deemedTaxBase,
      detail: result,
      legalBasis: result.legalBasis,
      warnings: result.warnings,
    };
  }

  if (input.renovation) {
    const result = assessBuildingRenovation(input.renovation);
    return {
      type: "renovation",
      isSubjectToTax: result.isSubjectToTax,
      deemedTaxBase: result.deemedTaxBase,
      detail: result,
      legalBasis: result.legalBasis,
      warnings: result.warnings,
    };
  }

  return {
    type: null,
    isSubjectToTax: false,
    deemedTaxBase: 0,
    detail: null,
    legalBasis: ACQUISITION.DEEMED_ACQUISITION,
    warnings: ["간주취득 입력 데이터 없음."],
  };
}
