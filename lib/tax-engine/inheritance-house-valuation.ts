/**
 * 상속 주택 환산취득가 — 개별주택가격 미공시 + 1990 이전 토지 통합 계산
 *
 * 자산 종류가 주택이고 상속개시일이 개별주택가격 최초 공시일(2005-04-30) 이전인 경우
 * 상속개시일 시점에 개별주택가격이 존재하지 않으므로 3-시점 비율 환산으로
 * 상속개시일 합계 기준시가를 자동 산출한다.
 *
 * 토지부수토지:
 *   - 상속개시일 < 1990-08-30: `calculatePre1990LandValuation()` 으로 등급가액 환산
 *   - 상속개시일 ≥ 1990-08-30: 사용자 입력 `landPricePerSqmAtInheritance` 직접 사용
 *
 * 주택 상속개시일 시점 가격 추정:
 *   추정값 = floor(최초고시 주택가격 × 상속개시일 토지기준시가 / 최초고시 토지기준시가)
 *   사용자 override 입력 시 그 값 우선.
 *
 * Layer 2 원칙: DB 직접 호출 없음. 순수 함수. 정수 연산(원 단위).
 */

import { calculatePre1990LandValuation, INDIVIDUAL_LAND_PRICE_FIRST_NOTICE_DATE } from "./pre-1990-land-valuation";
import { safeMultiply } from "./tax-utils";
import { INHERITED_HOUSE } from "./legal-codes";
import {
  HOUSE_FIRST_DISCLOSURE_DATE,
  type InheritanceHouseValuationInput,
  type InheritanceHouseValuationResult,
  type HousePriceEstimationMethod,
} from "./types/inheritance-house-valuation.types";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";

export type {
  InheritanceHouseValuationInput,
  InheritanceHouseValuationResult,
  HousePriceEstimationMethod,
  Pre1990LandGradeInput,
} from "./types/inheritance-house-valuation.types";

export { HOUSE_FIRST_DISCLOSURE_DATE };

// ─── 진입점 ────────────────────────────────────────────────────────────────

export function calculateInheritanceHouseValuation(
  input: InheritanceHouseValuationInput,
): InheritanceHouseValuationResult {
  validateInput(input);

  const warnings: string[] = [];

  // ── Step 1: 상속개시일 시점 토지 단가 산출 ──
  const { landPricePerSqmAtInheritance, pre1990Result } = resolveLandPriceAtInheritance(
    input,
    warnings,
  );

  // ── Step 2: 3-시점 토지 기준시가 ──
  const landStdAtInheritance = Math.floor(safeMultiply(landPricePerSqmAtInheritance, input.landArea));
  const landStdAtTransfer    = Math.floor(safeMultiply(input.landPricePerSqmAtTransfer, input.landArea));
  const landStdAtFirstDisclosure = Math.floor(safeMultiply(input.landPricePerSqmAtFirstDisclosure, input.landArea));

  // ── Step 3: 상속개시일 시점 주택가격 산출 ──
  const { housePriceAtInheritanceUsed, estimationMethod } = resolveHousePriceAtInheritance(
    input,
    landStdAtInheritance,
    landStdAtFirstDisclosure,
  );

  // ── Step 4: 합계 기준시가 3시점 ──
  const totalStdPriceAtInheritance      = landStdAtInheritance + housePriceAtInheritanceUsed;
  const totalStdPriceAtTransfer         = landStdAtTransfer + input.housePriceAtTransfer;
  const totalStdPriceAtFirstDisclosure  = landStdAtFirstDisclosure + input.housePriceAtFirstDisclosure;

  const formula = buildFormula(
    input,
    landPricePerSqmAtInheritance,
    landStdAtInheritance,
    landStdAtTransfer,
    housePriceAtInheritanceUsed,
    estimationMethod,
    totalStdPriceAtInheritance,
    totalStdPriceAtTransfer,
    pre1990Result,
  );

  const legalBasis = [
    INHERITED_HOUSE.PRE_DEEMED_MAX,
    INHERITED_HOUSE.PHD_VALUATION,
    ...(pre1990Result ? [INHERITED_HOUSE.PRE1990_GRADE] : []),
  ].join(" · ");

  return {
    totalStdPriceAtInheritance,
    totalStdPriceAtTransfer,
    totalStdPriceAtFirstDisclosure,
    landStdAtInheritance,
    landStdAtTransfer,
    landStdAtFirstDisclosure,
    housePriceAtInheritanceUsed,
    estimationMethod,
    pre1990Result,
    formula,
    legalBasis,
    warnings,
  };
}

// ─── 입력 검증 ─────────────────────────────────────────────────────────────

function validateInput(input: InheritanceHouseValuationInput): void {
  if (!(input.inheritanceDate instanceof Date) || Number.isNaN(input.inheritanceDate.getTime())) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_DATE, "inheritanceDate가 유효한 Date가 아닙니다");
  }
  if (!(input.transferDate instanceof Date) || Number.isNaN(input.transferDate.getTime())) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_DATE, "transferDate가 유효한 Date가 아닙니다");
  }
  if (!Number.isFinite(input.landArea) || input.landArea <= 0) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, `landArea는 양수여야 합니다 (입력: ${input.landArea})`);
  }
  if (!Number.isFinite(input.landPricePerSqmAtTransfer) || input.landPricePerSqmAtTransfer <= 0) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "landPricePerSqmAtTransfer는 양수여야 합니다");
  }
  if (!Number.isFinite(input.landPricePerSqmAtFirstDisclosure) || input.landPricePerSqmAtFirstDisclosure <= 0) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "landPricePerSqmAtFirstDisclosure는 양수여야 합니다");
  }
  if (!Number.isFinite(input.housePriceAtTransfer) || input.housePriceAtTransfer < 0) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "housePriceAtTransfer는 0 이상이어야 합니다");
  }
  if (!Number.isFinite(input.housePriceAtFirstDisclosure) || input.housePriceAtFirstDisclosure <= 0) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "housePriceAtFirstDisclosure는 양수여야 합니다");
  }

  const isBefore1990 = input.inheritanceDate.getTime() < INDIVIDUAL_LAND_PRICE_FIRST_NOTICE_DATE.getTime();
  if (isBefore1990 && !input.pre1990 && !input.landPricePerSqmAtInheritance) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "상속개시일이 1990-08-30 이전이면 pre1990 등급가액 또는 landPricePerSqmAtInheritance 중 하나가 필수입니다",
    );
  }
  if (!isBefore1990 && !input.landPricePerSqmAtInheritance && !input.pre1990) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "상속개시일이 1990-08-30 이후이면 landPricePerSqmAtInheritance가 필수입니다",
    );
  }
}

// ─── 토지 단가 산출 ────────────────────────────────────────────────────────

function resolveLandPriceAtInheritance(
  input: InheritanceHouseValuationInput,
  warnings: string[],
): { landPricePerSqmAtInheritance: number; pre1990Result: ReturnType<typeof calculatePre1990LandValuation> | undefined } {
  const isBefore1990 = input.inheritanceDate.getTime() < INDIVIDUAL_LAND_PRICE_FIRST_NOTICE_DATE.getTime();

  // 사용자 직접 입력 override (1990 이전/이후 모두)
  if (input.landPricePerSqmAtInheritance !== undefined) {
    if (isBefore1990 && input.pre1990) {
      warnings.push("1990-08-30 이전이지만 landPricePerSqmAtInheritance 직접 입력값을 우선 사용합니다 (pre1990 등급가액 환산 무시)");
    }
    return { landPricePerSqmAtInheritance: input.landPricePerSqmAtInheritance, pre1990Result: undefined };
  }

  // 1990 이전 → 등급가액 환산
  if (isBefore1990 && input.pre1990) {
    const pre1990Result = calculatePre1990LandValuation({
      acquisitionDate: input.inheritanceDate,
      transferDate: input.transferDate,
      areaSqm: input.landArea,
      pricePerSqm_1990: input.pre1990.pricePerSqm_1990,
      pricePerSqm_atTransfer: input.landPricePerSqmAtTransfer,
      grade_1990_0830: input.pre1990.grade_1990_0830,
      gradePrev_1990_0830: input.pre1990.gradePrev_1990_0830,
      gradeAtAcquisition: input.pre1990.gradeAtAcquisition,
      forceRatioCap: input.pre1990.forceRatioCap,
    });
    warnings.push(...pre1990Result.warnings);
    return {
      landPricePerSqmAtInheritance: pre1990Result.pricePerSqmAtAcquisition,
      pre1990Result,
    };
  }

  // 1990 이후인데 landPricePerSqmAtInheritance 미제공 — validateInput에서 이미 잡히므로 여기에 도달 불가
  throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "토지 단가 산출 불가 — 입력 오류");
}

// ─── 주택가격 산출 ─────────────────────────────────────────────────────────

function resolveHousePriceAtInheritance(
  input: InheritanceHouseValuationInput,
  landStdAtInheritance: number,
  landStdAtFirstDisclosure: number,
): { housePriceAtInheritanceUsed: number; estimationMethod: HousePriceEstimationMethod } {
  if (input.housePriceAtInheritanceOverride !== undefined && input.housePriceAtInheritanceOverride >= 0) {
    return {
      housePriceAtInheritanceUsed: Math.floor(input.housePriceAtInheritanceOverride),
      estimationMethod: "user_override",
    };
  }

  // §164⑤ 토지 비율 추정: 최초고시 주택가격 × (상속개시일 토지기준시가 / 최초고시 토지기준시가)
  const estimated = landStdAtFirstDisclosure > 0
    ? Math.floor(safeMultiply(input.housePriceAtFirstDisclosure, landStdAtInheritance) / landStdAtFirstDisclosure)
    : 0;

  return { housePriceAtInheritanceUsed: estimated, estimationMethod: "estimated_phd" };
}

// ─── 산식 문자열 ────────────────────────────────────────────────────────────

function buildFormula(
  input: InheritanceHouseValuationInput,
  landPricePerSqmAtInheritance: number,
  landStdAtInheritance: number,
  landStdAtTransfer: number,
  housePriceAtInheritanceUsed: number,
  estimationMethod: HousePriceEstimationMethod,
  totalStdPriceAtInheritance: number,
  totalStdPriceAtTransfer: number,
  pre1990Result: ReturnType<typeof calculatePre1990LandValuation> | undefined,
): string {
  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const lines: string[] = [];

  // 양도시 합계
  lines.push(`양도시 합계 기준시가`);
  lines.push(`  = 양도시 토지(${fmt(input.landArea)}㎡ × ${fmt(input.landPricePerSqmAtTransfer)}원/㎡) + 양도시 주택가격(${fmt(input.housePriceAtTransfer)}원)`);
  lines.push(`  = ${fmt(landStdAtTransfer)}원 + ${fmt(input.housePriceAtTransfer)}원 = ${fmt(totalStdPriceAtTransfer)}원`);
  lines.push(``);

  // 상속개시일 토지단가
  if (pre1990Result) {
    lines.push(`상속개시일 토지단가 환산 (1990.8.30. 이전 등급가액 환산, ${pre1990Result.caseLabel})`);
    lines.push(`  ${pre1990Result.breakdown.formula}`);
  } else {
    lines.push(`상속개시일 개별공시지가 = ${fmt(landPricePerSqmAtInheritance)}원/㎡`);
  }
  lines.push(``);

  // 상속개시일 주택가격
  if (estimationMethod === "user_override") {
    lines.push(`상속개시일 주택가격 = ${fmt(housePriceAtInheritanceUsed)}원 (직접 입력)`);
  } else {
    lines.push(`상속개시일 주택가격 추정 (§164⑤ 토지 비율)`);
    lines.push(`  = 최초고시 주택가격(${fmt(input.housePriceAtFirstDisclosure)}원) × 상속개시일 토지기준시가 / 최초고시 토지기준시가`);
    lines.push(`  = ${fmt(housePriceAtInheritanceUsed)}원`);
  }
  lines.push(``);

  // 상속개시일 합계
  lines.push(`상속개시일 합계 기준시가`);
  lines.push(`  = 토지(${fmt(landStdAtInheritance)}원) + 주택(${fmt(housePriceAtInheritanceUsed)}원)`);
  lines.push(`  = ${fmt(totalStdPriceAtInheritance)}원`);

  return lines.join("\n");
}
