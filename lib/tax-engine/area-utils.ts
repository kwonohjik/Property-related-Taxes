/**
 * 면적 안분 유틸 — 전 세목 공통 leaf 모듈 (무의존).
 *
 * UI(`use client`)·엔진·bridge 가 모두 이 모듈만 import 한다.
 * 의존이 없어야 무거운 엔진 모듈 그래프가 클라이언트 번들에 유입되지 않는다
 * (`tax-utils.ts`는 date-fns 의존 → 면적 유틸을 그쪽에 두지 않는다).
 *
 * ## 면적 안분 규칙 (강제)
 *
 * 1. 안분 면적은 **소수점 3째 자리에서 반올림**해 2자리까지 확정 — `round2()`.
 *    금액(원)의 `Math.floor` 절사와 달리 면적은 반올림한다.
 * 2. **마지막 항목은 잔액 흡수** — `residualArea(전체, ...앞선 항목들)`.
 *    비율로 직접 재계산하지 않는다.
 *
 * 두 규칙이 함께 `Σ안분면적 = 전체면적` 불변식과 "표시값 = 계산값"을 보장한다.
 */

/**
 * 면적 소수점 2자리 반올림(3째 자리에서 반올림).
 *
 * 화면 표시(`toFixed(2)`)와 계산값을 일치시켜 "표시 76.51 / 계산 76.508" 드리프트를 차단한다.
 * 반올림한 면적을 이후 단가 곱셈에 그대로 사용할 것.
 */
export function round2(area: number): number {
  return Math.round(area * 100) / 100;
}

/**
 * 단가(원/㎡) × 면적(㎡) → 원 단위 절사. **부동소수 곱을 쓰지 않는다.**
 *
 * 🔴 `Math.floor(unitPrice * area)`는 **1원 과소산정**한다. 면적이 이진 배정도로 정확히
 *    표현되지 않아 곱이 참값보다 미세하게 작아지고, `floor`가 그 차이를 1원으로 확대한다:
 *
 *    `5_000_000 × 8.04` → `40199999.999999996` → floor **40,199,999** (참값 40,200,000)
 *
 *    단가 5,000,000원 기준 면적 0.01~2000.00㎡ 전수 20만 개 중 **11,105건(5.6%)** 이 어긋나고
 *    방향은 **항상 과소**다.
 *
 * 이 저장소는 같은 부류를 이미 한 번 해결했다 — `applyFairMarketRatio`(`tax-utils.ts`)의
 * 「0.70의 double 표현으로 `Math.floor`가 1원 과소산정된다 → 정수 분수연산으로 대체」가
 * 그 기록이다. 여기서도 **면적을 정수로 올려 곱한 뒤 나눈다**.
 *
 * ⚠️ 면적의 소수 자릿수는 **값에서 읽는다**(상수 캡 없음 — `decompose` 주석 참조).
 *    규약상 면적은 `round2` 후 곱해지므로 보통 2자리다.
 */
export function multiplyByArea(unitPrice: number, area: number): number {
  return floorProduct(unitPrice, area);
}

/**
 * 단가(원/㎡) × 면적(㎡) × 지분율 → 원 단위 절사. **floor는 한 번**이다.
 *
 * 🔑 이 함수는 **지분 적용 «순서»를 바꾸지 않는다.** 종전
 *    `Math.floor(area * shareRatio * pricePerSqm)`와 «수학적으로 같은 값»을 내되,
 *    부동소수 곱을 정수 연산으로 바꿔 **1원 과소산정만 제거**한다.
 *
 *    (단가·면적·지분) 4만8천 조합 실측: **5,048건(10.5%)** 이 어긋났고 전부 1원 과소였다.
 *
 * ✅ **「지분을 어디에 적용할 것인가」는 종결됐다 — ⓐ(이 함수) 확정** (2026-09-10 `5da0765a`,
 *    계획서 `docs/00-pm/share-ratio-application-order.plan.md`). 「근거를 못 찾아 유지」가
 *    아니라 **조문 구조·심판례 원리·실측 셋이 모두 ⓐ를 가리켰다**:
 *
 *      1. 「지방세법」 **§113①** 은 「납세의무자가 **소유하고 있는** … 토지의 **가액을 모두
 *         합한 금액**」에 세율을 적용한다. 주택의 §113③(물건 전체 과표)에 대응하는 규정이
 *         **토지에는 없고**, §107①1호상 공유토지 납세의무자가 소유하는 것은 「그 **지분에
 *         해당하는 부분**」이다 ⇒ 지분 상당 가액을 합산하는 현행 구조가 문언에 부합한다.
 *      2. 조심2011지0554: 「단독 소유와 공동 소유를 구분하여 **과세표준을 달리 적용하는 것은
 *         과세형평상 불합리**」.
 *      3. 그 원리를 세 후보에 적용한 실측(지분율 합이 정확히 1인 45,000건):
 *         **ⓐ만 Σ지분가액 = 전체가액이 0건 예외 없이 성립**한다(ⓑ 1,526건·최대 1원 어긋남,
 *         ⓒ 8,103건·최대 43,000원).
 *
 * ⛔ **재제안 금지 3건** — ⓑ `floor(floor(단가 × 면적) × 지분)` · ⓒ `floor(단가 × round2(면적
 *    × 지분))` · 「주택 방식(전체 과표 → 세액 안분)」. 근거는 위 계획서의 기각 목록에 있다.
 *    대조군 실측은 `unit-price-area-precision.anchor.test.ts` UA-11 이 고정한다.
 */
export function multiplyByAreaShare(
  unitPrice: number,
  area: number,
  shareRatio: number,
): number {
  return floorProduct(unitPrice, area, shareRatio);
}

/**
 * 소수 인자를 «십진 스케일 정수»로 분해. 지수표기·음수는 분해하지 않는다(호출부가 fallback).
 *
 * 🔴 **자릿수를 상수로 고정하지 않는다.** 초판(PR #1556·#1557)은 `Math.min(6, …)`으로 잘랐는데,
 *    면적은 규약상 2자리라 무해했지만 **지분율은 `1/3`처럼 고정밀 값이 정상**이다.
 *    50억 필지 × 지분 `1/3`에서 **1,666원**이 잘려 나갔다(1,666,666,666 → 1,666,665,000) —
 *    부동소수 오차를 고치겠다는 함수가 **더 큰 오차를 만들고 있었다**.
 *
 * ⇒ 값이 가진 자릿수를 그대로 쓰되, `x × 10^d`가 **안전정수를 벗어나지 않는 선까지만**
 *    내린다. 정밀도 한계를 «임의의 상수»가 아니라 «표현 가능 한계»가 정한다.
 */
function decompose(x: number): { n: bigint; scale: bigint } | null {
  if (!Number.isFinite(x) || x < 0) return null;
  const text = String(x);
  if (text.includes("e") || text.includes("E")) return null;
  const frac = text.split(".")[1];
  for (let d = frac ? frac.length : 0; d >= 0; d--) {
    const scale = 10 ** d;
    if (!Number.isSafeInteger(scale)) continue;
    const scaled = Math.round(x * scale);
    if (Number.isSafeInteger(scaled)) return { n: BigInt(scaled), scale: BigInt(scale) };
  }
  return null;
}

/**
 * `floor(f1 × f2 × …)` 를 **부동소수 곱 없이** 계산한다.
 *
 * 각 인자를 십진 스케일 정수로 올려 BigInt로 곱한 뒤 스케일 곱으로 나눈다.
 * 분해할 수 없는 인자(지수표기·음수·비정상)가 하나라도 있으면 종전 동작으로 되돌아간다 —
 * **정밀도 개선이 새로운 실패를 만들지 않게** 한다.
 */
function floorProduct(...factors: number[]): number {
  if (factors.some((f) => !Number.isFinite(f))) return 0;
  const parts = factors.map(decompose);
  if (parts.some((p) => p === null)) {
    return Math.floor(factors.reduce((a, b) => a * b, 1));
  }
  let num = 1n;
  let den = 1n;
  for (const p of parts) {
    num *= p!.n;
    den *= p!.scale;
  }
  return Number(num / den); // 음수 인자는 위에서 걸러졌으므로 truncate = floor
}

/**
 * 면적 안분 잔액 — **마지막 항목 전용**. `전체 − 앞서 확정된 항목들의 합`.
 *
 * 각 항목을 독립적으로 `round2(전체 × 비율)` 하면 합이 전체와 어긋난다
 * (예: 100㎡를 3등분 → 33.33 × 3 = 99.99). 마지막 항목이 잔액을 흡수해
 * `Σ안분면적 = 전체` 불변식을 보장한다.
 *
 * @param total 안분 대상 전체 면적 (㎡)
 * @param allocated 앞서 `round2` 로 확정된 항목들의 면적
 */
export function residualArea(total: number, ...allocated: number[]): number {
  return round2(round2(total) - allocated.reduce((s, a) => s + a, 0));
}
