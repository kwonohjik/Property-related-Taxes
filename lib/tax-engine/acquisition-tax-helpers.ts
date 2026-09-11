/**
 * 취득세 오케스트레이터 헬퍼 — 간주취득 Step 2 + 결과 빌더
 *
 * `acquisition-tax.ts`가 §15② 단서(물건별 구분) 배선으로 836줄이 되어 File Size Policy
 * (트리거 800 · 착지 ≤700)를 넘겼다. 플레이북의 **「거대 단일 함수는 구조분해」**를 적용해
 * 이음매를 실측했다:
 *
 * | 조각 | 줄 | in | out |
 * |---|---:|---:|---|
 * | **Step 2 간주취득** | **~75** | **5** | **1**(판별 유니온) |
 * | Step 7 세액 | ~70 | 12 | 3 |
 * | 계산 과정 정리 | ~73 | 19 | 1 |
 *
 * Step 2가 압도적으로 좁다. 조기 반환 2개(상세입력 없음·과세요건 미충족)는 호출부에서
 * `return` 해야 하므로 `{kind:"zero"|"continue"}` 판별 유니온으로 넘긴다 —
 * 호출부가 `if (kind === "zero") return result` 한 줄로 받는다.
 *
 * ⚠️ `warnings`·`legalBasis`는 **참조로 받아 push** 한다. 복사본을 넘기면 간주취득 경고가
 *    조용히 사라진다.
 */

import { assessDeemedAcquisition } from "./acquisition-deemed";
import type {
  AcquisitionTaxInput,
  AcquisitionTaxResult,
  DeemedMajorShareholderResult,
} from "./types/acquisition.types";
import type {
  DeemedLandCategoryResult,
  DeemedRenovationResult,
} from "./acquisition-deemed";
import type { ExtendedSurchargeDecision } from "./acquisition-surcharge/index";

// ============================================================
// Step 2: 간주취득 판정
// ============================================================

/** 간주취득 Step 2 결과 — `zero`면 호출부가 즉시 반환한다 */
export type DeemedStepOutcome =
  | { kind: "zero"; result: AcquisitionTaxResult }
  | {
      kind: "continue";
      effectiveInput: AcquisitionTaxInput;
      deemedDetail?: AcquisitionTaxResult["deemedDetail"];
    };

/**
 * 간주취득(과점주주 §7⑤ · 지목변경 §7④ · 개수) 판정 + 과세표준 주입.
 *
 * @param input          원본 엔진 입력
 * @param effectiveInput 부담부증여 cause 변환까지 끝난 입력 (여기서 reportedPrice를 덮는다)
 * @param warnings       **참조** — 간주취득 경고를 push 한다
 * @param legalBasis     **참조** — 근거 조문을 push 한다
 */
export function runDeemedAcquisitionStep(
  input: AcquisitionTaxInput,
  effectiveInput: AcquisitionTaxInput,
  targetDate: string,
  warnings: string[],
  legalBasis: string[],
): DeemedStepOutcome {
  const isDeemedCause = [
    "deemed_major_shareholder",
    "deemed_land_category",
    "deemed_renovation",
  ].includes(input.acquisitionCause);

  // 간주취득 원인이지만 상세 입력(deemedInput)이 없는 경우 — 경고 후 0원 결과 반환
  if (isDeemedCause && !input.deemedInput) {
    return {
      kind: "zero",
      result: buildZeroResult(
        input,
        targetDate,
        [`간주취득(${input.acquisitionCause}) 계산에 필요한 상세 입력이 없습니다. deemedInput을 제공해주세요.`],
        undefined,
      ),
    };
  }

  let deemedDetailResult: AcquisitionTaxResult["deemedDetail"] | undefined;

  if (isDeemedCause && input.deemedInput) {
    const deemedResult = assessDeemedAcquisition(input.deemedInput);
    warnings.push(...deemedResult.warnings);
    legalBasis.push(deemedResult.legalBasis);

    // deemedDetail 구성 — 타입별로 필드 분기 매핑
    if (deemedResult.type !== null) {
      const base: AcquisitionTaxResult["deemedDetail"] = {
        type: deemedResult.type,
        isSubjectToTax: deemedResult.isSubjectToTax,
        deemedTaxBase: deemedResult.deemedTaxBase,
        legalBasis: deemedResult.legalBasis,
        warnings: deemedResult.warnings,
      };
      if (deemedResult.type === "major_shareholder" && deemedResult.detail) {
        const d = deemedResult.detail as DeemedMajorShareholderResult;
        base.prevShareRatio = d.prevShareRatio;
        base.newShareRatio = d.newShareRatio;
        base.taxableRatio = d.taxableRatio;
        base.corporateAssetValue = d.corporateAssetValue;
        // §15② 단서 물건별 내역 — 세율·세액은 Step 7에서 채운다.
        base.buckets = d.buckets;
      } else if (deemedResult.detail) {
        const d = deemedResult.detail as DeemedLandCategoryResult | DeemedRenovationResult;
        base.prevStandardValue = d.prevStandardValue;
        base.newStandardValue = d.newStandardValue;
      }
      deemedDetailResult = base;
    }

    if (!deemedResult.isSubjectToTax) {
      return {
        kind: "zero",
        result: {
          ...buildZeroResult(input, targetDate, warnings, "간주취득 과세 요건 미충족"),
          deemedDetail: deemedDetailResult,
        },
      };
    }

    // 간주취득 과세표준을 reportedPrice로 주입 (acquisition-tax-base.ts에서 사용)
    // ⚠️ 분리 전과 동일하게 `effectiveInput`이 아니라 **`input`** 에서 펼친다 —
    //    간주취득은 부담부증여 cause 변환(§7④)과 겹치지 않으므로 원본 동작을 그대로 옮겼다.
    effectiveInput = { ...input, reportedPrice: deemedResult.deemedTaxBase };
  }

  return { kind: "continue", effectiveInput, deemedDetail: deemedDetailResult };
}

/**
 * 중과 판정 상세 결과를 AcquisitionTaxResult.surchargeDetail 형식으로 변환
 *
 * ExtendedSurchargeDecision의 내부 필드를 결과 타입의 surchargeDetail로 매핑.
 * giftExclusionReason은 문자열 패턴으로 enum 값을 추론:
 *   - "1세대 1주택자" 포함 → "one_house_household"
 *   - "이혼 재산분할" 포함 → "divorce_division"
 */
export function buildSurchargeDetail(
  surchargeDecision: ExtendedSurchargeDecision,
  resolvedHouseCount: number,
): AcquisitionTaxResult["surchargeDetail"] {
  // 일시적 2주택 처분기한 연수: number를 1|2|3 union으로 변환
  const deadlineYears = surchargeDecision.temporaryTwoHouseDeadlineYears;
  const deadlineYearsTyped: 1 | 2 | 3 | undefined =
    deadlineYears === 1 || deadlineYears === 2 || deadlineYears === 3
      ? deadlineYears
      : undefined;

  // giftExclusionReason: 문자열 패턴 → enum 변환
  const rawGiftExclusion = surchargeDecision.giftExclusionReason;
  let giftExclusionReasonEnum: "one_house_household" | "divorce_division" | undefined;
  if (rawGiftExclusion) {
    if (rawGiftExclusion.includes("이혼 재산분할")) {
      giftExclusionReasonEnum = "divorce_division";
    } else if (rawGiftExclusion.includes("1세대 1주택자") || rawGiftExclusion.includes("1주택")) {
      giftExclusionReasonEnum = "one_house_household";
    }
  }

  // 모든 필드가 undefined이면 surchargeDetail 자체를 undefined로 반환
  const exceptions = surchargeDecision.exceptions ?? [];
  const hasAnyDetail =
    surchargeDecision.temporaryTwoHouseDeadlineDate !== undefined ||
    deadlineYearsTyped !== undefined ||
    surchargeDecision.preRegulationContractApplied !== undefined ||
    giftExclusionReasonEnum !== undefined ||
    exceptions.length > 0 ||
    resolvedHouseCount > 0;

  if (!hasAnyDetail) return undefined;

  return {
    temporaryTwoHouseDeadlineDate: surchargeDecision.temporaryTwoHouseDeadlineDate,
    temporaryTwoHouseDeadlineYears: deadlineYearsTyped,
    preRegulationContractApplied: surchargeDecision.preRegulationContractApplied,
    giftExclusionReason: giftExclusionReasonEnum,
    surchargeExceptions: exceptions.length > 0 ? exceptions : undefined,
    effectiveHouseCount: resolvedHouseCount > 0 ? resolvedHouseCount : undefined,
  };
}

// ============================================================
// 결과 빌더 (비과세·면제 시)
// ============================================================

export function buildZeroResult(
  input: AcquisitionTaxInput,
  targetDate: string,
  warnings: string[],
  reason?: string,
  exemptionType?: AcquisitionTaxResult["exemptionType"]
): AcquisitionTaxResult {
  const today = new Date().toISOString().slice(0, 10);
  const addDays = (d: string, days: number) => {
    const dt = new Date(d);
    dt.setDate(dt.getDate() + days);
    return dt.toISOString().slice(0, 10);
  };

  if (reason) {
    warnings.push(reason);
  }

  // 취득일: 잔금지급일 > 등기일 > 계약일 > 오늘 순으로 사용
  const acquisitionDate =
    input.balancePaymentDate ?? input.registrationDate ?? input.contractDate ?? today;

  return {
    propertyType: input.propertyType,
    acquisitionCause: input.acquisitionCause,
    acquisitionValue: 0,

    taxBase: 0,
    taxBaseMethod: "standard_value",

    appliedRate: 0,
    rateType: "basic",
    isSurcharged: false,

    acquisitionTax: 0,
    ruralSpecialTax: 0,
    localEducationTax: 0,
    totalTax: 0,

    reductionAmount: 0,
    totalTaxAfterReduction: 0,

    acquisitionDate,
    filingDeadline: addDays(acquisitionDate, 60),

    isExempt: !!exemptionType,
    exemptionType,

    steps: [],

    appliedLawDate: targetDate,
    warnings,
    legalBasis: [],
  };
}
