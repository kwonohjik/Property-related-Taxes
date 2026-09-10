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
 * ⚠️ 면적의 소수 자릿수를 값에서 읽는다(최대 6자리). 규약상 면적은 `round2` 후 곱해지므로
 *    보통 2자리이고, 잔액 흡수(`residualArea`)로 생긴 긴 소수도 6자리에서 잘린다 —
 *    6자리 아래는 원 단위에 영향을 주지 않는다.
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
 * ⚠️ **「지분을 어디에 적용할 것인가」는 여전히 미결이다.** 후보가 셋이고 결과가 갈린다:
 *      ⓐ `floor(단가 × 면적 × 지분)`            — 현행(이 함수가 정확히 구현)
 *      ⓑ `floor(floor(단가 × 면적) × 지분)`     — 필지 전체 공시가격을 먼저 원 단위로 확정
 *                                                (`applyRatio`가 정한 저장소 지분 규약의 형태)
 *      ⓒ `floor(단가 × round2(면적 × 지분))`    — 지분면적을 먼저 확정
 *    ⓑ는 「공시가격은 필지 단위로 원 단위 공시된다」는 독법, ⓒ는 「지분 소유자는 지분면적을
 *    소유한다」는 독법이다. **어느 쪽도 조문 본문으로 확인하지 못했다** — 근거 없이 세액
 *    방향을 바꾸지 않는다. 순서를 바꾸려면 부동산 가격공시법·종부세법 본문을 먼저 확인할 것.
 */
export function multiplyByAreaShare(
  unitPrice: number,
  area: number,
  shareRatio: number,
): number {
  return floorProduct(unitPrice, area, shareRatio);
}

/** 소수 인자를 «십진 스케일 정수»로 분해. 지수표기·음수는 분해하지 않는다(호출부가 fallback). */
function decompose(x: number): { n: bigint; scale: bigint } | null {
  if (!Number.isFinite(x) || x < 0) return null;
  const text = String(x);
  if (text.includes("e") || text.includes("E")) return null;
  const frac = text.split(".")[1];
  const decimals = Math.min(6, frac ? frac.length : 0);
  const scale = 10 ** decimals;
  const scaled = Math.round(x * scale);
  if (!Number.isSafeInteger(scaled)) return null;
  return { n: BigInt(scaled), scale: BigInt(scale) };
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
