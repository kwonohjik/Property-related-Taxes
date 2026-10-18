/**
 * 다종목 §103② 기본공제 — **같은 날 양도한 종목 사이의 순서**를 신고 세액으로 고른다.
 *
 * 계획서: `docs/02-design/features/stock-basic-deduction-same-day-order.plan.md`
 *
 * §103②은 「해당 과세기간에 먼저 양도한 자산의 양도소득금액에서부터 순서대로 공제한다」까지만 정하고 같은 날은 비워 둔다.
 * 재일46014-1685(1997.7.11.)는 그 자리에 「납세자에게 유리하다고 판단되는 양도자산의 양도소득금액에서부터 순차로 공제」로
 * 회신했다. 질의는 부동산이지만 §103②의 공백은 호(§103①1호·2호)와 무관하게 같으므로 준용한다(부동산 #2220과 같은 기준 —
 * 판단은 세율이 아니라 **결과 세액**이다). 주식을 직접 다룬 해석례는 찾지 못했다(계획서 §1.2).
 *
 * ## 후보
 *
 * 순서가 바꾸는 것은 **기본공제 배분**뿐이고(통산 후 소득·세율은 순서와 무관), 배분은 그룹(주식 / 기타자산)·양도일 묶음마다
 * 「공제를 전부 받는 종목 집합 + 나머지를 일부 받는 한 종목」으로 정해진다. 그래서 순열 전체가 아니라 **서로 다른 배분**만 후보로
 * 만든다(같은 날 7종목 = 순열 5,040 → 배분 최대 448). 각 후보는 그 배분을 실현하는 순서 하나로 본체를 돌려 평가한다 —
 * 외국납부세액공제 한도·기타자산 §104⑤ 비교·가산세가 신고 단위라 종목 세액의 합으로는 고를 수 없다.
 *
 * ## 고르는 기준
 *
 * (결정세액 + 지방소득세) → 결정세액 → **후보 생성 순서**(정준 순서에서 먼저 나온 것). 정준 순서는 양도일 → 입력 내용(키 정렬
 * 직렬화)이다 — 주식 입력에는 부동산 `propertyId` 같은 고정 식별자가 없어서, 세액이 같은 후보 사이에서도 입력 순서가 표시
 * (종목별 기본공제)를 바꾸지 않게 하려면 내용으로 정할 수밖에 없다(계획서 Q-2).
 */
import type { AggregateStockItemInput } from "./foreign-stock-aggregate-adapter";
import type { StockTransferAggregateResult } from "./stock-transfer-aggregate";

const BASIC_DEDUCTION_LIMIT = 2_500_000;

/**
 * 평가할 후보(배분 조합) 상한. 그룹·양도일 묶음별 배분 수의 곱이 이를 넘으면 정준 순서 하나만 평가한다.
 * 같은 날 한 그룹 7종목까지는 묶음 하나의 배분이 448을 넘지 않는다(n × 2ⁿ⁻¹).
 */
export const SAME_DAY_CANDIDATE_LIMIT = 1_000;

/** 키를 정렬한 직렬화 — 같은 내용이면 객체 생성 경로(키 순서)와 무관하게 같은 문자열. Date는 ISO. */
function stableKey(v: unknown): string {
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return `[${v.map(stableKey).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableKey(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/** 정준 순서 — 양도일 오름차순 → 입력 내용. 같은 내용이면 입력 인덱스(그때는 어느 쪽이든 표시가 같다). */
export function canonicalOrder(inputs: AggregateStockItemInput[]): number[] {
  const keys = inputs.map(stableKey);
  return inputs
    .map((input, i) => ({ i, t: input.transferDate.getTime(), k: keys[i] }))
    .sort((a, b) => a.t - b.t || (a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i))
    .map((x) => x.i);
}

interface Block {
  /** 정준 순서의 이 묶음 종목(공제 대상 — 비과세 아님, 통산 후 소득 > 0) */
  items: number[];
  income: number[];
  /** 이 묶음 앞에서 남은 그룹 한도 */
  remaining: number;
}

/** 한 묶음의 서로 다른 배분 — 각 배분은 그것을 실현하는 앞부분 순서(나머지는 정준 순서로 뒤에 붙는다). */
function allocationPrefixes(block: Block, cap: number): number[][] | null {
  const { items, income, remaining } = block;
  const total = income.reduce((s, x) => s + x, 0);
  if (items.length <= 1 || remaining <= 0 || total <= remaining) return [[]];
  const out: number[][] = [];
  const seen = new Set<string>();
  const visited = new Set<string>();
  // 집합 단위로 한 번만 내려간다(같은 집합을 다른 순서로 채운 경로는 같은 배분이다).
  const walk = (prefix: number[], used: number): boolean => {
    const setKey = [...prefix].sort((a, b) => a - b).join(",");
    if (visited.has(setKey)) return true;
    visited.add(setKey);
    for (let j = 0; j < items.length; j++) {
      if (prefix.includes(j)) continue;
      if (used + income[j] >= remaining) {
        const sig = `${setKey}|${j}`;
        if (!seen.has(sig)) {
          seen.add(sig);
          out.push([...prefix, j].map((x) => items[x]));
          if (out.length > cap) return false;
        }
      } else if (!walk([...prefix, j], used + income[j])) {
        return false;
      }
    }
    return true;
  };
  return walk([], 0) ? out : null;
}

/**
 * @param inputs   다종목 입력(이월과세 확정 후)
 * @param evaluate 주어진 §103② 순회 순서(입력 인덱스 배열)로 본체를 돌린다. 결과 `items`는 입력 순서다.
 * @param otherAssetSeed §103①1호 기소진액(부동산 등) — 기타자산 그룹 한도의 출발점
 */
export function evaluateSameDayOrder(
  inputs: AggregateStockItemInput[],
  evaluate: (order: number[]) => StockTransferAggregateResult,
  otherAssetSeed: number,
): StockTransferAggregateResult {
  const canon = canonicalOrder(inputs);
  const base = evaluate(canon);

  // 그룹·양도일 묶음 — 통산 후 소득·그룹·비과세는 순서와 무관하므로 정준 실행 결과에서 읽는다.
  const remaining = { stock: BASIC_DEDUCTION_LIMIT, other: Math.max(0, BASIC_DEDUCTION_LIMIT - otherAssetSeed) };
  const blocks: Block[] = [];
  let k = 0;
  while (k < canon.length) {
    const t = inputs[canon[k]].transferDate.getTime();
    const day: number[] = [];
    while (k < canon.length && inputs[canon[k]].transferDate.getTime() === t) day.push(canon[k++]);
    for (const g of ["stock", "other"] as const) {
      const items = day.filter((i) => {
        const r = base.items[i];
        const group = r.basicDeductionGroup === "stock" ? "stock" : "other";
        return group === g && !r.isExempt && r.transferIncome > 0;
      });
      const income = items.map((i) => base.items[i].transferIncome);
      blocks.push({ items, income, remaining: remaining[g] });
      remaining[g] = Math.max(0, remaining[g] - income.reduce((s, x) => s + x, 0));
    }
  }

  const options: number[][][] = [];
  let count = 1;
  for (const b of blocks) {
    const p = allocationPrefixes(b, SAME_DAY_CANDIDATE_LIMIT);
    if (!p) return base;
    options.push(p);
    count *= p.length;
    if (count > SAME_DAY_CANDIDATE_LIMIT) return base;
  }
  if (count === 1) return base;

  // 후보 순서: 양도일 순으로 각 묶음의 앞부분 → 묶음의 나머지(정준) → 공제 대상 아닌 종목(정준).
  const pos = new Map(canon.map((i, n) => [i, n]));
  const orderOf = (choice: number[][]): number[] => {
    const rank = new Map<number, number>();
    blocks.forEach((b, bi) => {
      const prefix = choice[bi];
      const rest = b.items.filter((i) => !prefix.includes(i));
      [...prefix, ...rest].forEach((i, n) => rank.set(i, n));
    });
    return [...canon].sort(
      (a, b) =>
        inputs[a].transferDate.getTime() - inputs[b].transferDate.getTime() ||
        (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity) ||
        pos.get(a)! - pos.get(b)!,
    );
  };

  const burden = (r: StockTransferAggregateResult) => r.totalFinalTax + r.totalLocalIncomeTax;
  let best = base;
  let choice: number[][] = [[]];
  const walk = (bi: number) => {
    if (bi === blocks.length) {
      const r = evaluate(orderOf(choice));
      if (burden(r) < burden(best) || (burden(r) === burden(best) && r.totalFinalTax < best.totalFinalTax)) best = r;
      return;
    }
    for (const p of options[bi]) {
      choice = [...choice.slice(0, bi), p];
      walk(bi + 1);
    }
  };
  choice = [];
  walk(0);
  return best;
}
