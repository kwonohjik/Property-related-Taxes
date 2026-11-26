/**
 * 가업상속공제적용률 — 법정량(분자·분모) 단일 소스
 *
 * 「소득세법」 §97의2④1호의 「가업상속공제적용률」은 「소득세법 시행령」 §163의2③이 정하는 **비율(분수)**이다.
 *   - 구 ③(양도일 2026.2.26. 이전) · 신 ③1호(개인가업): 상속세 과세가액에서 공제한 금액 ÷ 가업상속 재산가액
 *   - 신 ③2호(법인가업, 양도일 2026.2.27. 이후): (총자산가액 − 사업무관자산) ÷ 총자산가액
 *
 * 종전 구현은 적용률을 0~1 double로만 받아 소수 6자리로 반올림한 뒤 곱했다. 이력 불러오기가 넘기는
 * 400/1200 같은 값에서 의제 취득가액이 +268원(1/3, 평가 10억) ~ +8,573원(1/7, 평가 900억) 어긋났다
 * (계획서 `docs/02-design/features/fb-97-2-4-fixes.plan.md` §3.1).
 * ⇒ 법정량을 그대로 받아(`FamilyBusinessRateBasis`) 정수 분수로 곱한다. 법정량이 없으면(구 입력·% 직접 입력)
 *    종전 6자리 basis를 그대로 쓴다 — 기존 결과와 비트 동일.
 *
 * 순수 함수 · DB 없음. ⑧(validate)·⑫(Zod)·엔진이 같은 술어를 쓴다(3중 일치).
 */

import { isFamilyBusinessAssetScopeDecreeEra } from "./data/family-business-cgt-era";

/** 가업상속공제적용률의 법정량 — 「소득세법 시행령」 §163의2③ 호별 */
export type FamilyBusinessRateBasis =
  | {
      /** 구 ③ · 신 ③1호 — 공제금액 ÷ 가업상속 재산가액 */
      kind: "deduction_ratio";
      /** 「상속세 및 증여세법」 §18의2①에 따라 상속세 과세가액에서 공제한 금액 (원) */
      deductionAmount: number;
      /** 같은 항 각 호 외의 부분 전단에 따른 가업상속 재산가액 (원) */
      businessEstateValue: number;
    }
  | {
      /** 신 ③2호 — (총자산가액 − 사업무관자산) ÷ 총자산가액 */
      kind: "corporate_business_assets";
      /** 법인가업의 총자산가액 (상속개시일 현재 「상속세 및 증여세법」 제4장 평가액, 원) */
      totalAssets: number;
      /** 「상속세 및 증여세법 시행령」 §15⑤2호 사업무관자산 (원) */
      nonBusinessAssets: number;
    };

/** 정수 분수 — 0 ≤ numerator ≤ denominator, denominator > 0 */
export interface FamilyBusinessRateFraction {
  numerator: number;
  denominator: number;
}

/** 법정량이 없을 때의 basis — 종전 구현과 같은 값(화면 % 입력은 소수 4자리라 이 안에서 정확하다). */
export const FB_RATE_LEGACY_SCALE = 1_000_000;

/** 법정량과 함께 실린 0~1 적용률이 법정량과 같다고 볼 허용 오차 (double 나눗셈 오차만 흡수) */
const RATE_CONSISTENCY_TOLERANCE = 1e-9;

/** 법정량 → 정수 분수 */
export function basisToFraction(basis: FamilyBusinessRateBasis): FamilyBusinessRateFraction {
  if (basis.kind === "deduction_ratio") {
    return { numerator: basis.deductionAmount, denominator: basis.businessEstateValue };
  }
  return { numerator: basis.totalAssets - basis.nonBusinessAssets, denominator: basis.totalAssets };
}

/**
 * 엔진이 곱할 정수 분수.
 * 법정량이 있으면 그것, 없으면 0~1 적용률을 `FB_RATE_LEGACY_SCALE` basis로 바꾼 값(종전과 비트 동일).
 * (`Math.round`는 세액이 아니라 비율 상수 → 정수 분자 변환용이다 — `applyFairMarketRatio`와 같은 용법.)
 */
export function resolveFamilyBusinessRateFraction(
  appliedRate: number,
  basis?: FamilyBusinessRateBasis,
): FamilyBusinessRateFraction {
  if (basis) return basisToFraction(basis);
  return { numerator: Math.round(appliedRate * FB_RATE_LEGACY_SCALE), denominator: FB_RATE_LEGACY_SCALE };
}

const isNonNegInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * 법정량 형식·정합 오류 문구 (없으면 null) — ⑧·⑫ 공용.
 *
 * - 금액은 0 이상 정수, 분모(가업상속 재산가액·총자산가액)는 0보다 커야 한다.
 * - 분자가 분모를 넘으면 적용률이 1을 넘는다(공제금액 > 재산가액 · 사업무관자산 < 0) — 차단.
 * - 함께 실린 0~1 적용률이 법정량과 다르면 차단한다. 둘 중 하나를 조용히 우선하지 않는다.
 */
export function familyBusinessRateBasisError(
  basis: FamilyBusinessRateBasis | undefined,
  appliedRate: number | undefined,
): string | null {
  if (!basis) return null;
  if (basis.kind === "deduction_ratio") {
    if (!isNonNegInt(basis.deductionAmount) || !isNonNegInt(basis.businessEstateValue))
      return "가업상속공제금액과 가업상속 재산가액은 0 이상의 원 단위 금액이어야 합니다.";
    if (basis.businessEstateValue === 0) return "가업상속 재산가액을 입력하세요.";
    if (basis.deductionAmount > basis.businessEstateValue)
      return "가업상속공제금액이 가업상속 재산가액보다 클 수 없습니다.";
  } else {
    if (!isNonNegInt(basis.totalAssets) || !isNonNegInt(basis.nonBusinessAssets))
      return "법인 총자산가액과 사업무관자산가액은 0 이상의 원 단위 금액이어야 합니다.";
    if (basis.totalAssets === 0) return "법인 총자산가액을 입력하세요.";
    if (basis.nonBusinessAssets > basis.totalAssets)
      return "사업무관자산가액이 법인 총자산가액보다 클 수 없습니다.";
  }
  if (appliedRate != null) {
    const { numerator, denominator } = basisToFraction(basis);
    if (Math.abs(appliedRate - numerator / denominator) > RATE_CONSISTENCY_TOLERANCE)
      return "적용률이 입력한 금액으로 계산한 비율과 다릅니다. 적용률을 다시 입력하세요.";
  }
  return null;
}

// ─── 상속세 이력 → 적용률 법정량 (양도일로 신·구 선택 · 계획서 F-2) ─────────────────

/** 이력에서 적용률을 산정할 수 없는 사유 — 1·0 등으로 채우지 않고 사용자 입력을 요구한다(자동 fallback 금지) */
export type FamilyBusinessRateUnavailableReason =
  /** 상속세 직접입력 모드 — 가업상속 재산가액을 모른다(엔진 `appliedRate`는 표시용 1) */
  | "direct_input"
  /** 공제액·재산가액 정수가 이력에 없다(구 레코드 등) */
  | "deduction_missing"
  /** 법인가업인데 총자산가액이 이력에 없다(총자산 직접입력 모드) */
  | "corp_assets_missing"
  /** 사업무관자산이 총자산가액 이상 — 적용률 0 */
  | "no_business_assets";

export type FamilyBusinessRateDerivation =
  | { basis: FamilyBusinessRateBasis }
  | { unavailable: FamilyBusinessRateUnavailableReason };

/**
 * 양도일 기준으로 「소득세법 시행령」 §163의2③의 신·구 산식을 골라 법정량을 만든다.
 *
 * | 조건 | 법정량 |
 * |---|---|
 * | 개인가업 자산 (양도일 무관) | 공제액 ÷ 가업상속 재산가액 — 구 ③ · 신 ③1호 |
 * | 법인가업 주식 · 양도일 ≤ 2026-02-26 | 공제액 ÷ 가업상속 재산가액 — 구 ③ |
 * | 법인가업 주식 · 양도일 ≥ 2026-02-27 | (총자산 − 사업무관자산) ÷ 총자산 — 신 ③2호(공제 한도와 무관) |
 *
 * 경계는 부칙(대통령령 제36129호) §10 「이 영 시행 이후 자산을 양도하는 경우부터」 — `isFamilyBusinessAssetScopeDecreeEra`.
 * 상속세 엔진의 `appliedRate`(공제 ÷ 재산가액)는 구 ③과 같고 건드리지 않는다. 신·구는 양도일을 아는 쪽이 고른다.
 */
export function deriveFamilyBusinessRateBasis(args: {
  transferDate: Date;
  isCorporateStock: boolean;
  deduction: unknown;
  finalValue: unknown;
  usedDirectInput: boolean;
  /** 법인가업 주식일 때 `calcCorporateBusinessAssets` 결과(총자산 미입력이면 undefined) */
  corporate?: { totalAssets: number; businessAssets: number };
}): FamilyBusinessRateDerivation {
  if (args.isCorporateStock && isFamilyBusinessAssetScopeDecreeEra(args.transferDate)) {
    const c = args.corporate;
    if (!c || !(c.totalAssets > 0)) return { unavailable: "corp_assets_missing" };
    if (!(c.businessAssets > 0)) return { unavailable: "no_business_assets" };
    return {
      basis: {
        kind: "corporate_business_assets",
        totalAssets: c.totalAssets,
        nonBusinessAssets: c.totalAssets - c.businessAssets,
      },
    };
  }
  if (args.usedDirectInput) return { unavailable: "direct_input" };
  const { deduction, finalValue } = args;
  if (
    !isNonNegInt(deduction) ||
    !isNonNegInt(finalValue) ||
    finalValue === 0 ||
    deduction > finalValue
  ) {
    return { unavailable: "deduction_missing" };
  }
  return { basis: { kind: "deduction_ratio", deductionAmount: deduction, businessEstateValue: finalValue } };
}
