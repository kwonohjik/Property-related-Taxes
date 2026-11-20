/**
 * 면적 한도 비교·초과 면적 산출 — **단일 소스** (NBL2611-V9-I · 로드맵 R11). 무의존 leaf 모듈.
 *
 * ## 왜 필요한가
 *
 * 면적 × 배율을 부동소수로 비교하면 한도와 **정확히 같은 토지**가 뒤집힌다.
 * 면적은 소수 2자리 입력이고 배율은 정수(3·4·5·7·10)·1.2·1.5 같은 소수라서 곱의 참값은 소수 4자리 이내인데,
 * 이진 배정도는 그 값을 정확히 표현하지 못한다:
 *
 *   `100.1 × 3 = 300.29999999999995` (참값 300.3) → 토지 300.3㎡가 «0.00000000000005㎡ 초과»로 비사업용
 *
 * 2자리 면적 × 정수 배율 시료의 약 10%가 이렇게 한도 아래로 어긋난다. 면적 합도 마찬가지로 더하는 순서에 따라
 * `100.3 / 100.29999999999998 / 100.30000000000001`로 갈린다(연접 다필지 입력 순서 의존).
 *
 * ## 규약 — 1/1,000,000㎡(마이크로㎡) 정수
 *
 * 모든 면적을 `Math.round(㎡ × 1e6)` 정수로 올려 비교·덧셈·뺄셈한다. 입력 면적은 2자리, 배율은 4자리 이내라 곱은 6자리 이내이므로
 * 이 해상도는 **실제 값을 바꾸지 않고 이진 부동소수 잡음만 지운다**(반올림이 아니다 — 참값이 이미 6자리 이내).
 * 곱은 `BigInt`로 한다(㎡ 10억 × 배율 10 = 10^16 마이크로 단위가 안전정수를 넘는다).
 *
 * ⚠️ `round2()`(`area-utils.ts`)와 역할이 다르다 — `round2`는 «안분 면적을 2자리로 확정(반올림)한 뒤 단가를 곱한다»이고, 이 모듈은
 *    «한도와 비교하는 면적을 잡음 없이 정확히 다룬다»이다. 둘은 겹치지 않는다. 이 모듈은 값을 2자리로 반올림하지 않는다.
 *
 * ## 세액용 비율은 4자리 그대로
 *
 * `areaRatio4`는 NBL 엔진이 세액에 쓰는 «비사업용 면적 비율 4자리»를 **정수 half-up**으로 낸다(종전 `Math.round(x * 10000) / 10000`은
 * `57/800 = 0.07125`를 float 잡음으로 0.0712로 내렸다). 정밀도(4자리) 자체는 바꾸지 않는다 — 결정 Q-7 (가) 기각.
 */

const MICRO = 1_000_000;
const MICRO_BIG = BigInt(MICRO);

/** ㎡ → 마이크로㎡ 정수. 비정상 값(NaN·±Infinity)은 0으로 둔다(호출부가 입력 검증을 이미 마친 값만 넘긴다). */
export function toAreaMicro(m2: number): number {
  return Number.isFinite(m2) ? Math.round(m2 * MICRO) : 0;
}

/** 마이크로㎡ 정수 → ㎡. 나눗셈 한 번이라 «참값에 가장 가까운 배정도»가 나온다(예: 300_300_000 → 300.3). */
export function fromAreaMicro(micro: number): number {
  return micro / MICRO;
}

/**
 * 이미 부동소수로 계산돼 온 면적(표값 합·`min(바닥, 표값) × 배율` 등)의 이진 잡음을 지운다 — 1e-6㎡ 격자에 붙인다.
 * 입력 면적(2자리) × 배율(4자리 이내)의 참값은 6자리 이내라 **실제 값은 바뀌지 않는다**(반올림이 아니라 잡음 제거).
 */
export function snapArea(m2: number): number {
  return fromAreaMicro(toAreaMicro(m2));
}

/** 면적 × 계수(배율·비율)를 정확히 곱한다 — 부동소수 곱을 쓰지 않는다. 6자리 아래는 half-up. */
export function areaTimes(area: number, factor: number): number {
  const product = BigInt(toAreaMicro(area)) * BigInt(toAreaMicro(factor));
  return fromAreaMicro(Number((product + MICRO_BIG / 2n) / MICRO_BIG));
}

/** 면적 합 — 더하는 순서와 무관하다(정수 합). */
export function sumAreas(...areas: number[]): number {
  return fromAreaMicro(areas.reduce((sum, a) => sum + toAreaMicro(a), 0));
}

/** `a − b` — 잡음 없이. 음수가 될 수 있다(호출부가 `Math.max(0, …)`가 필요하면 `areaExcess`). */
export function subtractAreas(a: number, b: number): number {
  return fromAreaMicro(toAreaMicro(a) - toAreaMicro(b));
}

/** `min(a, b)` — 정확 비교로 고른다(잡음 없는 값 그대로 돌려준다). */
export function minArea(a: number, b: number): number {
  return snapArea(toAreaMicro(a) <= toAreaMicro(b) ? a : b);
}

/** `a ≤ b`(정확 비교). */
export function isAreaAtMost(a: number, b: number): boolean {
  return toAreaMicro(a) <= toAreaMicro(b);
}

/** `a > b`(정확 비교). */
export function isAreaOver(a: number, b: number): boolean {
  return toAreaMicro(a) > toAreaMicro(b);
}

export interface AreaLimitJudgment {
  /** 토지 면적 ≤ 한도 */
  within: boolean;
  /** 한도 초과 면적 = max(0, 토지 − 한도) (㎡, 잡음 없음) */
  excess: number;
  /** 한도 이내 면적 = 토지 − 초과 (㎡) */
  withinArea: number;
  /** 초과 비율 = 초과 ÷ 토지 (0~1, 반올림하지 않은 정밀값 — 표시·안분용). 토지 면적 0 이하면 0. */
  ratio: number;
}

/**
 * 토지 면적을 한도와 정확히 비교한다. **면적 한도 판정의 단일 진입점** — 한도는 `areaTimes(바닥면적, 배율)`·표값·합계 등 호출부가 만든다.
 */
export function judgeAreaLimit(landArea: number, limitArea: number): AreaLimitJudgment {
  const land = toAreaMicro(landArea);
  const limit = toAreaMicro(limitArea);
  const excess = Math.max(0, land - limit);
  return {
    within: land <= limit,
    excess: fromAreaMicro(excess),
    withinArea: fromAreaMicro(land - excess),
    ratio: land > 0 ? excess / land : 0,
  };
}

/**
 * 비사업용 면적 비율 — **소수 4자리 half-up**(정수 연산). 세액에 곱해지는 값이라 정밀도(4자리)는 종전과 같다.
 * 전체 면적이 0 이하이면 0.
 */
export function areaRatio4(excessArea: number, totalArea: number): number {
  const total = toAreaMicro(totalArea);
  if (total <= 0) return 0;
  const excess = BigInt(Math.max(0, toAreaMicro(excessArea)));
  const t = BigInt(total);
  return Number((excess * 20000n + t) / (2n * t)) / 10000;
}
