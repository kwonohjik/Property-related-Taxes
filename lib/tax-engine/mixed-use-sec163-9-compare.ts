/**
 * 겸용주택 상속·증여 취득가액 — 소득세법 시행령 §163⑨ 단서 **자산 합계 비교** (PR-6 · 계획서
 * `docs/02-design/features/inheritance-pre-deemed-clause-b-revisit.plan.md` §17).
 *
 * 후보(파트 p = 주택분·상가분)는 각 후보로 엔진을 다시 계산해 얻는다 — 비교값과 적용값이 같은 계산에서 나온다.
 *   ① 상증법 평가액(상속·증여세 신고가액) — 두 칸이 다 있을 때만(Q-19)
 *   ② §164 가액 — 주택: PHD면 §164⑦ 환산, 아니면 취득시 개별주택가격 · 상가: 취득시 (토지 + 건물) 기준시가
 *   ③ 환산취득가액(§176조의2④) — 의제취득일(1985.1.1.) 전만. ④가 상속·증여 플래그를 보내지 않은 종전 경로 그대로(수용 특례 분모 포함 — Q-10 A)
 * 비교는 자산 합계(Q-15), 동점이면 ① > ② > ③(Q-5), 취득가액만(Q-7 a). 이긴 후보의 파트 값을 그대로 쓴다(Q-20).
 *
 * ①② 후보 계산은 상속·증여 분기(개산공제 없음 · 실제 필요경비 칸)를 탄다. `inheritedValuesAsIs`가 PHD 주택분의 파트별 max를 끄고
 * 상가분의 공익수용 거부를 푼다.
 */
import type {
  MixedSec163_9Comparison,
  MixedUseAssetInput,
  MixedUseGainBreakdown,
} from "./types/transfer-mixed-use.types";

type Run = (asset: MixedUseAssetInput) => MixedUseGainBreakdown;
type Totals = { housing: number; commercial: number; total: number };

function totalsOf(r: MixedUseGainBreakdown): Totals {
  // 부담부증여 — 채무비율을 곱하기 전 금액으로 비교한다(주택·상가 채무비율이 달라 곱한 뒤 합계는 순서가 뒤집힐 수 있다 · Q-36 · PR-7b-7a-2)
  const pp = r.burdenedGift?.perPart;
  if (pp) {
    const before = (k: keyof typeof pp) => pp[k].acquisitionBeforeRatio ?? pp[k].acquisitionPrice;
    const housing = before("housingLand") + before("housingBuilding");
    const commercial = before("commercialLand") + before("commercialBuilding");
    return { housing, commercial, total: housing + commercial };
  }
  const housing = r.housingPart.estimatedAcquisitionPrice;
  const commercial = r.commercialPart.estimatedAcquisitionPrice;
  return { housing, commercial, total: housing + commercial };
}

/** 보유 중 용도변경은 상속·증여 분기가 계산을 거부한다 — 의제취득일 전이면 ③만 쓰고 그 사실을 남긴다(PR-3 D2와 같은 처리). */
const UNCOMPARED_USAGE_CHANGE =
  "보유 중 용도변경이 있는 겸용주택은 상속·증여 평가액(①)·§164 가액(②) 계산을 아직 지원하지 않아 환산취득가액(③)만 적용했습니다.";

export function calcMixedSec163_9Compare(asset: MixedUseAssetInput, run: Run): MixedUseGainBreakdown {
  const cmp = asset.sec163_9Compare;
  if (!cmp) return run(asset);
  const preDeemed = cmp.era === "pre_deemed";
  const plain: MixedUseAssetInput = { ...asset, sec163_9Compare: undefined };

  const hasHousingReported = asset.housingInheritedValue !== undefined;
  const hasCommercialReported = asset.commercialInheritedValue !== undefined;
  if (hasHousingReported !== hasCommercialReported) {
    // ⑧·⑫가 먼저 막는다(Q-19) — 여기 닿으면 한쪽을 조용히 버리지 않고 멈춘다.
    throw new Error("겸용주택 상속·증여 평가액은 주택분·상가분을 모두 입력하거나 모두 비워야 합니다 (소득세법 시행령 §163⑨).");
  }

  // ③ — 의제취득일 전 종전 경로(④가 상속·증여 플래그를 보내지 않았다)
  const r3 = preDeemed ? run(plain) : undefined;
  const echo = (
    selected: MixedSec163_9Comparison["selected"],
    reported: Totals | null,
    standard: Totals | null,
    uncomparedReason?: string,
  ): MixedSec163_9Comparison => ({
    era: cmp.era,
    cause: cmp.cause,
    ...(cmp.era === "clause" && cmp.commercialOutsideClause ? { commercialOutsideClause: true } : {}),
    reported,
    standard,
    converted: r3 ? totalsOf(r3) : null,
    selected,
    ...(uncomparedReason ? { uncomparedReason } : {}),
  });
  if (r3 && asset.partialUsageChange) {
    return { ...r3, sec163_9Comparison: echo("converted", null, null, UNCOMPARED_USAGE_CHANGE) };
  }

  const inherited: MixedUseAssetInput = {
    ...plain,
    acquisitionByInheritance: cmp.cause === "inheritance",
    acquisitionByGift: cmp.cause === "gift",
    inheritedValuesAsIs: true,
  };
  // 상가분이 단서 밖이면(Q-22) ② 후보의 상가분은 ①(없으면 보충적 평가) — 주택분만 ①②가 갈린다.
  const outside = cmp.era === "clause" && cmp.commercialOutsideClause === true;
  const r2 = run({
    ...inherited,
    housingInheritedValue: undefined,
    commercialInheritedValue: outside ? asset.commercialInheritedValue : undefined,
  });
  const r1 = hasHousingReported ? run(inherited) : undefined;
  const standard = totalsOf(r2);
  const reported = r1 ? totalsOf(r1) : null;

  // 동점이면 ① > ② > ③(Q-5)
  const clauseA = reported && reported.total >= standard.total
    ? { selected: "reported" as const, total: reported.total, result: r1! }
    : { selected: "standard" as const, total: standard.total, result: r2 };
  if (r3 && totalsOf(r3).total > clauseA.total) {
    return { ...r3, sec163_9Comparison: echo("converted", reported, standard) };
  }
  return { ...clauseA.result, sec163_9Comparison: echo(clauseA.selected, reported, standard) };
}
