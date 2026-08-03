import { addDays, addMonths, addYears, differenceInDays, differenceInMonths, differenceInYears, subMonths } from "date-fns";
import type { Heir } from "./types/inheritance-gift.types";

// ============================================================
// P0-2 원칙: 세율(rate) × 금액(amount) 곱셈은 반드시 applyRate()를 사용.
// 직접 `amount * rate` 후 Math.floor를 쓰지 않는다.
// 이유: 부동소수점 오차가 후속 연산에 누적되는 것을 방지하기 위함.
// ============================================================

/**
 * 누진세율 계산 (정수 연산)
 * 과세표준에 해당하는 구간의 세율과 누진공제액을 적용하여 산출세액 반환.
 *
 * 공식: Math.floor(taxableAmount × rate) - 누진공제액
 * P0-1: Math.floor를 세율 곱셈 직후 적용 → 누진공제액(정수) 차감 순서 보장
 */
export function calculateProgressiveTax(
  /**
   * ⚠️ **`TaxBracket[]`이 아니라 「이 함수가 실제로 읽는 최소 구조」**로 받는다.
   *   본문이 `max`·`rate`·`deduction`만 쓰고 `min`은 쓰지 않는다. 좁게 선언해 두면
   *   주식 엔진의 정적 표(`{ max?: number; rate; deduction }` — `min` 없음)도 **변환 없이**
   *   같은 함수를 쓸 수 있어, 같은 산식이 두 곳에 복제되는 것을 막는다
   *   (§104⑤ 크로스 레이어 `comparative-104-5-cross.ts`가 그 소비자다).
   *   기존 `TaxBracket[]` 호출자는 구조적 타이핑으로 그대로 통과한다.
   */
  taxableAmount: number,
  brackets: readonly { max?: number | null; rate: number; deduction: number }[],
): number {
  if (taxableAmount <= 0) return 0;

  for (const bracket of brackets) {
    const max = bracket.max ?? Infinity;
    if (taxableAmount <= max) {
      // P0-2: applyRate() = Math.floor(amount * rate) — 곱셈 직후 절사
      return applyRate(taxableAmount, bracket.rate) - bracket.deduction;
    }
  }

  // 최고 구간 적용 (모든 max보다 큰 경우 — 정상적으로 도달하지 않음)
  const last = brackets[brackets.length - 1];
  return applyRate(taxableAmount, last.rate) - last.deduction;
}

/**
 * [P0-2] 세율 적용 후 즉시 절사 (원 미만)
 * 모든 "세율 × 금액" 연산에 이 함수를 사용하여 부동소수점 오차 방지.
 * 직접 Math.floor(amount * rate) 사용 금지.
 */
export function applyRate(amount: number, rate: number): number {
  return Math.floor(amount * rate);
}

/**
 * 공유지분율 적용 — 100% 기준 금액에 지분 비율을 곱해 원 단위로 절사.
 *
 * 이 저장소의 **지분 적용 단일 규약**이다. API 변환(`transfer-tax-api-helpers.ts`)이 재수출해
 * 엔진·클라이언트가 같은 절사 규칙을 쓴다 — 순서·절사가 갈리면 사이드바 미리보기와 엔진 결과가
 * 어긋난다(실측 0.49% 1원 차).
 */
export function applyRatio(amount: number, ratio: number): number {
  return Math.floor(amount * ratio);
}

/**
 * 필요경비 개산공제 (소득세법 시행령 §163⑥).
 *
 * 공유지분 자산은 **지분 기준시가**를 base로 한다 — 양도자산이 지분이면 그 지분에 상당하는
 * 기준시가에 율을 곱하는 것이 §163⑥ 문언("취득당시의 개별공시지가 × 3/100")에 부합하고,
 * §97②2호 가목이 규정한 **합계액**(환산취득가액 + 개산공제)의 두 항이 같은 스케일로 맞는다.
 * 환산취득가액은 `transferPrice`를 통해 이미 지분 스케일이기 때문이다.
 *
 * ⚠️ 기준시가 **입력값 자체는 물건 전체(100%)로 유지**해야 한다 — 환산 산식에서 분자·분모로
 *    함께 나타나 상쇄되고, §166⑥ 안분 비율(`landStd / total`)도 100% 스케일을 전제한다.
 *    지분 적용은 **이 함수 안에서만** 한다.
 *
 * floor 순서: 지분 기준시가를 먼저 확정한 뒤 율을 적용한다(단일 floor 대비 0.96%에서 1원 작으나,
 * 지분 기준시가가 결과 표시 산식의 base로 노출되어야 하고 `applyRatio` 규약과 일관해야 한다).
 *
 * 설계: docs/02-design/features/transfer-fractional-lump-sum-deduction.{plan,engine.design}.md
 *
 * @param standardPriceAtAcq 물건 전체(100%) 취득시 기준시가
 * @param rate 3/100 · 미등기양도자산(§104③) 3/1000
 * @param ownershipRatio 공유지분율 (기본 1 = 단독소유)
 */
export function computeEstimatedDeduction(
  standardPriceAtAcq: number,
  rate: number,
  ownershipRatio = 1,
): number {
  return applyRate(computeLumpSumDeductionBase(standardPriceAtAcq, ownershipRatio), rate);
}

/**
 * 개산공제 base = **지분 기준시가**. 결과 표시 산식(「지분 기준시가 × 3%」)의 base로 echo된다.
 * 100% 값을 표시하면 산식이 자기 값을 만들지 못한다(feedback_engine_result_display_drift).
 */
export function computeLumpSumDeductionBase(
  standardPriceAtAcq: number,
  ownershipRatio = 1,
): number {
  return ownershipRatio < 1 ? applyRatio(standardPriceAtAcq, ownershipRatio) : standardPriceAtAcq;
}

/**
 * 엔진 레이어 날짜 변환 — string|Date|undefined → Date|undefined.
 *
 * 엔진 내부에서 직접 `new Date(x)` 호출을 금지하기 위한 안전 헬퍼 (Layer 2 전용).
 * `lib/api/date-coerce.ts`(toOptionalDate)는 Route 레이어 전용이므로 엔진에서 import 금지.
 *
 * - 빈문자열·null·undefined → undefined
 * - invalid 날짜 문자열 → undefined (silent false 비교 트랩 방어)
 * - 이미 Date면 유효성만 검사 후 통과 (Route에서 변환된 Date 입력 호환)
 */
export function coerceOptionalDate(value: string | Date | undefined | null): Date | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (value instanceof Date) return isNaN(value.getTime()) ? undefined : value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

// ============================================================
// 절사 유틸
// ============================================================

/** 천원 미만 절사 — 양도세·재산세·취득세·상속세·증여세 과세표준 */
export function truncateToThousand(amount: number): number {
  return Math.floor(amount / 1000) * 1000;
}

/** 만원 미만 절사 — 종합부동산세 과세표준 */
export function truncateToTenThousand(amount: number): number {
  return Math.floor(amount / 10000) * 10000;
}

/** 원 미만 절사 — 산출세액 공통 */
export function truncateToWon(amount: number): number {
  return Math.floor(amount);
}

// 면적 안분 유틸(round2 · residualArea)은 `./area-utils` — 무의존 leaf(클라이언트 번들 안전).

// ============================================================
// 정수 안전 연산
// ============================================================

/**
 * 안전한 정수 곱셈 (BigInt fallback)
 * Number.MAX_SAFE_INTEGER 초과 시 BigInt 사용
 */
export function safeMultiply(a: number, b: number): number {
  const result = a * b;
  if (Math.abs(result) > Number.MAX_SAFE_INTEGER) {
    // Math.floor로 정수화: 피연산자를 정수로 변환 후 곱 (중간 반올림 금지)
    return Number(BigInt(Math.floor(a)) * BigInt(Math.floor(b)));
  }
  return result;
}

/**
 * (a × b) ÷ c — 곱셈 먼저 수행하여 정밀도 유지.
 * Number.MAX_SAFE_INTEGER 초과 시 BigInt fallback.
 * c === 0 이면 0 반환 (division by zero 방어).
 */
export function safeMultiplyThenDivide(a: number, b: number, c: number): number {
  if (c === 0) return 0;
  const product = a * b;
  if (Math.abs(product) > Number.MAX_SAFE_INTEGER) {
    // Math.floor로 정수화: 피연산자를 정수로 변환 후 연산 (중간 반올림 금지)
    return Number(
      BigInt(Math.floor(a)) * BigInt(Math.floor(b)) / BigInt(Math.floor(c)),
    );
  }
  return Math.floor(product / c);
}

/**
 * 분수 세율 적용 — floor(amount × numer / denom). 부동소수 곱(0.046·0.02 등) 회피.
 * 적정이자율 4.6% → applyRateFraction(x, 46, 1000). 환산율 2% → applyRateFraction(x, 2, 100).
 * safeMultiplyThenDivide 기반(BigInt overflow 가드).
 */
export function applyRateFraction(amount: number, numer: number, denom: number): number {
  return safeMultiplyThenDivide(amount, numer, denom);
}

/**
 * 공정시장가액비율(소수 상수, 예 0.70) 적용 — floor(amount × ratio) 정확 정수.
 *
 * applyRate(amount, 0.70)는 0.70의 double 표현(0.6999999999999999…)으로 인해
 * price × 70/100이 정수가 되는 입력(공시가격 7억 등)에서 Math.floor가 1원 과소산정된다.
 * 정수 분수연산(applyRateFraction)으로 대체해 정확값을 보장. ratio는 소수 4자리까지 지원.
 * (Math.round는 세액이 아닌 비율 상수 → 정수 분자 변환용 — "세법은 floor" 원칙 위반 아님)
 */
export function applyFairMarketRatio(amount: number, ratio: number): number {
  return applyRateFraction(amount, Math.round(ratio * 10000), 10000);
}

/**
 * (a × b) ÷ c — round-half-up(소수 0.5 이상 올림). BigInt로 overflow·정밀도 안전.
 * 안분 산식이 floor 아닌 반올림인 경우(종부세 재산세 공제 §4의3 — 시행령 절사 미규정,
 * 교재·실무 반올림. 상속세 안분 bigIntRoundDiv과 동일 round-half-up).
 * floor로 하면 PDF 교재와 1원 차이 발생(memory bigint-round-half-up).
 */
export function safeMulDivRound(a: number, b: number, c: number): number {
  if (c === 0) return 0;
  const numer = BigInt(Math.round(a)) * BigInt(Math.round(b));
  const denom = BigInt(Math.round(c));
  const q = numer / denom;
  const r = numer - q * denom;
  return r * 2n >= denom ? Number(q) + 1 : Number(q);
}

/**
 * [P0-4] 비율 안분 계산 — amount × (numerator / denominator)
 * - denominator === 0 → 0 반환 (division by zero 방어)
 * - 비율 상한 1.0 적용: numerator > denominator 여도 amount 초과 불가
 *
 * 사용: 12억 초과분 과세 안분, 재산세↔종부세 비율 안분 공제
 */
export function calculateProration(
  amount: number,
  numerator: number,
  denominator: number,
): number {
  if (denominator === 0) return 0;
  // 상한(비율 1.0) 가드 — 분자가 분모 이상이면 amount 전액 반환
  if (numerator >= denominator) return amount;
  // P0-2 원칙: 부동소수점 비율 연산 금지 → 정수 곱셈 먼저 후 나눗셈
  return Math.floor(safeMultiplyThenDivide(amount, numerator, denominator));
}

// ============================================================
// 보유기간 계산
// ============================================================

/**
 * 세법상 보유기간 계산 (민법 초일불산입 원칙)
 * 기산일: 취득일 다음날 ~ 양도일 (양도일 포함)
 *
 * @returns { years, months, days } — 연·월·일 분리 (장기보유공제에는 years만 사용)
 */
export function calculateHoldingPeriod(
  acquisitionDate: Date,
  disposalDate: Date,
): { years: number; months: number; days: number } {
  // 민법 초일불산입: 취득일 다음날부터 기산
  const start = addDays(acquisitionDate, 1);

  const years = differenceInYears(disposalDate, start);
  const afterYears = addYears(start, years);

  const months = differenceInMonths(disposalDate, afterYears);
  const afterMonths = addMonths(afterYears, months);

  const days = differenceInDays(disposalDate, afterMonths);

  return { years: Math.max(0, years), months: Math.max(0, months), days: Math.max(0, days) };
}

// ============================================================
// 환산취득가액
// ============================================================

/**
 * 환산취득가액 계산 (취득가 불명 시)
 * 공식: 양도가액 × (취득 당시 기준시가 ÷ 양도 당시 기준시가)
 * standardPriceAtTransfer === 0 → 0 반환 (방어)
 */
export function calculateEstimatedAcquisitionPrice(
  transferPrice: number,
  standardPriceAtAcquisition: number,
  standardPriceAtTransfer: number,
): number {
  return safeMultiplyThenDivide(
    transferPrice,
    standardPriceAtAcquisition,
    standardPriceAtTransfer,
  );
}

// ============================================================
// 상속·증여세 전용 유틸 (W1-D4~5)
// ============================================================

/**
 * 법정상속분 비율 계산 (민법 §1009·§1010)
 * 배우자 : 자녀 = 1.5 : 1 (기여분 무시, 단순 법정비율)
 *
 * @returns 각 상속인의 법정상속분 비율 (소수점) — 합계 = 1.0
 */
export function calcLegalShareRatios(heirs: Heir[]): Map<string, number> {
  const ratioMap = new Map<string, number>();

  // 단위: 배우자=1.5, 나머지=1
  const units: { id: string; unit: number }[] = heirs.map((h) => ({
    id: h.id,
    unit: h.relation === "spouse" ? 1.5 : 1,
  }));

  const totalUnits = units.reduce((sum, u) => sum + u.unit, 0);
  if (totalUnits === 0) return ratioMap;

  for (const { id, unit } of units) {
    ratioMap.set(id, unit / totalUnits);
  }
  return ratioMap;
}

/**
 * 미성년자 인적공제액 계산 (상증법 §20①2호)
 * 공식: (19 − 연령) × 10,000,000 — "19세가 될 때까지의 연수" (민법 §4 성년 19세)
 * §20③ "1년 미만의 기간은 1년으로 한다" → differenceInYears(만나이 floor) 산식이 자동 충족
 *   (예: 만 5년 9개월 → floor 5 → 19−5=14, 잔여 13.25년의 올림과 동치).
 * 19세 미만인 경우에만 적용. 연령은 만 나이.
 */
export function calcMinorPersonalDeduction(
  birthDate: string,
  baseDate: string,
): number {
  const birth = new Date(birthDate);
  const base = new Date(baseDate);
  // differenceInYears: 생일이 기준일 이후면 완성된 연도 수에서 1을 뺌 → 정확한 만 나이
  const age = differenceInYears(base, birth);
  if (age >= 19) return 0;
  return Math.max(0, 19 - age) * 10_000_000;
}

// calcDisabledPersonalDeduction (78−age 단순식) 제거 (2026-06-05, G3-c) —
// 장애인공제는 personal-deduction-calc.ts의 calcDisabledDeduction
// (성별·연령별 2023 생명표 getLifeExpectancyByGender)로 일원화.

/**
 * 평가기간 필터 — 상증법 §60 ② 기준
 * 상속: 상속개시일 전후 6개월 이내
 * 증여: 증여일 전 6개월 ~ 후 3개월
 *
 * @param txDate 매매·감정 등이 발생한 날짜
 * @param baseDate 상속개시일 or 증여일
 * @param mode 'inheritance' (±6개월) | 'gift' (전6 / 후3개월)
 */
export function isWithinValuationPeriod(
  txDate: string,
  baseDate: string,
  mode: "inheritance" | "gift",
): boolean {
  const tx = new Date(txDate);
  const base = new Date(baseDate);

  if (mode === "inheritance") {
    const from = subMonths(base, 6);
    const to = addMonths(base, 6);
    return tx >= from && tx <= to;
  } else {
    const from = subMonths(base, 6);
    const to = addMonths(base, 3);
    return tx >= from && tx <= to;
  }
}

// ============================================================
// P0-3: 중과세 유예 판단
// ============================================================

interface SurchargeSpecialRules {
  surcharge_suspended: boolean;
  suspended_types?: string[];
  suspended_until?: string; // ISO date string 'YYYY-MM-DD'
}

/**
 * [P0-3] 중과세 유예 여부 런타임 판단.
 * DB special_rules.suspended_until을 기준일(양도일)과 비교하여 판단.
 * suspended_until이 없거나 기준일이 지났으면 유예 종료(중과세 적용).
 *
 * @param specialRules  DB tax_rates.special_rules (surcharge category)
 * @param referenceDate 양도일 (기준일)
 * @param surchargeType 'multi_house_2' | 'multi_house_3plus' 등
 */
export function isSurchargeSuspended(
  specialRules: SurchargeSpecialRules | null | undefined,
  referenceDate: Date,
  surchargeType: string,
): boolean {
  if (!specialRules?.surcharge_suspended) return false;

  // 해당 유형이 유예 대상인지 확인
  if (
    specialRules.suspended_types &&
    !specialRules.suspended_types.includes(surchargeType)
  ) {
    return false;
  }

  // 유예 종료일 확인 (날짜 포함: referenceDate <= suspended_until)
  if (!specialRules.suspended_until) return false;
  const suspendedUntil = new Date(specialRules.suspended_until);
  return referenceDate <= suspendedUntil;
}
