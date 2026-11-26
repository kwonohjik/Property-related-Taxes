/**
 * §97의2②3호 비교 — **2ⁿ 고정점 솔버** (국내·국외 종목 공용)
 *
 * `stock-carryover.ts`의 `resolveStockCarryover`에서 **동작 그대로** 떼어 냈다. 국내(가·나목)와
 * 국외(다목) 종목은 §102①2호 통산·§103①2호 기본공제 250만원이 **같은 그룹**이라 한 후보 집합으로
 * 함께 풀어야 한다. 솔버를 복제하면 dual-truth가 되므로 이 파일이 단일 소스다.
 *
 * 입력 타입을 모른다 — 종목 배열 `T[]`와 「조합 → 전체 결정세액」 콜백만 안다.
 * (국내 `StockTransferInput`·국외 `ForeignStockInput`·둘의 합집합 모두 같은 코드로 푼다.)
 *
 * 조건(②3호) — 자산 *i* 는 `T(i=적용) < T(i=미적용)` 이면 배제된다. 최종 조합은 자기 자신을
 * 재생산해야 한다:
 *
 *   모든 i:  (i가 적용 상태인가)  ===  (T(i=적용) ≥ T(i=미적용))      ← 동률은 적용 유지
 */

/** 종목 하나에 ②3호 비교 echo를 얹는다 — 입력 타입마다 필드 위치가 같아 호출부가 주입한다. */
export type AttachComparison<T> = (
  item: T,
  comparison: { appliedTotalTax: number; excludedTotalTax: number },
) => T;

export interface SolveCarryoverArgs<T> {
  /** 게이트를 통과한 종목의 인덱스 (carryover 대상) */
  targets: number[];
  /** 대상이 아닌 종목은 이 배열 그대로 — 대상 자리는 조합마다 시나리오로 덮는다 */
  base: T[];
  scenarioA: Map<number, T>;
  scenarioB: Map<number, T>;
  /** 배열 전체의 **결정세액** 합계 (순환 방지를 위해 주입) */
  computeTotalTax: (list: T[]) => number;
  attachComparison: AttachComparison<T>;
}

export function solveCarryoverCombination<T>(args: SolveCarryoverArgs<T>): T[] {
  const { targets, base, scenarioA, scenarioB, computeTotalTax, attachComparison } = args;

  const n = targets.length;
  const size = 1 << n;
  const materialize = (mask: number): T[] => {
    const list = [...base];
    targets.forEach((assetIdx, bit) => {
      list[assetIdx] = (mask >> bit) & 1 ? scenarioA.get(assetIdx)! : scenarioB.get(assetIdx)!;
    });
    return list;
  };

  const tax: number[] = new Array(size);
  for (let mask = 0; mask < size; mask++) tax[mask] = computeTotalTax(materialize(mask));

  const popcount = (m: number) => {
    let c = 0;
    for (let b = 0; b < n; b++) if ((m >> b) & 1) c++;
    return c;
  };

  // 자기 재생산 조합(고정점)을 찾는다. 복수해(Q-2b)는 **적용(A)이 가장 많은 것**.
  let best = -1;
  for (let mask = 0; mask < size; mask++) {
    let consistent = true;
    for (let bit = 0; bit < n; bit++) {
      const on = mask | (1 << bit);
      const off = mask & ~(1 << bit);
      const shouldApply = tax[on] >= tax[off]; // 동률은 적용 유지
      if (((mask >> bit) & 1) === 1 !== shouldApply) {
        consistent = false;
        break;
      }
    }
    if (!consistent) continue;
    if (best === -1 || popcount(mask) > popcount(best)) best = mask;
  }

  /**
   * 고정점은 **반드시 존재한다** — 「전체 세액 최대 조합 중 적용 최다」가 항상 조건을
   * 만족하기 때문이다(적용 자산은 토글해도 세액이 안 커지므로 `≥`, 미적용 자산은
   * 엄격히 작아지므로 `<`). 아래는 부동소수·절사로 인한 이론 밖 상황 대비 방어선이다.
   */
  if (best === -1) {
    const maxTax = Math.max(...tax);
    for (let mask = 0; mask < size; mask++) {
      if (tax[mask] !== maxTax) continue;
      if (best === -1 || popcount(mask) > popcount(best)) best = mask;
    }
  }

  /**
   * ②3호가 실제로 견준 **두 세액**을 결과 계층에 남긴다 — 그 종목만 토글한 전체 결정세액이다.
   * `best`는 고정점이므로 「채택된 쪽 = 이 두 값 중 큰 쪽(동률이면 적용)」이 성립한다.
   */
  const chosen = materialize(best);
  targets.forEach((assetIdx, bit) => {
    const on = best | (1 << bit);
    const off = best & ~(1 << bit);
    chosen[assetIdx] = attachComparison(chosen[assetIdx], {
      appliedTotalTax: tax[on],
      excludedTotalTax: tax[off],
    });
  });
  return chosen;
}
