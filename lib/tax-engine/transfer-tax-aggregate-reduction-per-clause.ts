/**
 * 다건 감면의 **§90① 입력** — 감면대상소득 버킷(B) · 기본공제 흡수(C) · 호별 산정(재산세과-3820).
 *
 * `transfer-tax-aggregate-reduction-step.ts` 800줄 정책 분리(2026-11-01). 감면 3단계가 이 값을 읽는다.
 */

import { applyRate, safeMultiplyThenDivide } from "./tax-utils";
import type { TransferTaxResult } from "./transfer-tax";
import type { ReducibleIncomeBucket } from "./types/transfer-result.types";
import type { ReductionClauseRow, TransferTaxItemInput } from "./types/transfer-aggregate.types";
import type { ClauseTaxEcho } from "./transfer-tax-aggregate-group-tax";
import type { ReducibleAfterLoss } from "./transfer-tax-aggregate-reducible-loss-share";

/** 집계가 자산별로 들고 있는 최소 정보 — 본 모듈이 읽는 부분만 좁혀 받는다. */
export interface AggregateAssetRecord {
  item: TransferTaxItemInput;
  result: TransferTaxResult;
  /** 영 §167의2② 반영 후 B′ — 없으면 통산 전 B(`bucketsOfRecord`). */
  reducibleAfterLoss?: ReducibleAfterLoss;
}

/**
 * 자산 결과에서 §90①의 감면대상소득 버킷을 꺼낸다 — 없으면 단일 버킷으로 합성한다.
 *
 * 합성이 정확한 유형은 `reducibleIncome`이 **감면율 前 B**인 것들이다(§97 계열·legacy 장기임대·
 * legacy 신축·하이브리드 — 율은 `aggregateReductionRate`). 율이 이미 박혀 있는 §77 계열은
 * 합성으로는 복원되지 않아 스스로 버킷을 싣는다.
 */
export function bucketsOf(result: TransferTaxResult): ReducibleIncomeBucket[] {
  const declared = result.reducibleIncomeBuckets;
  if (declared && declared.length > 0) return declared;
  const income = result.reducibleIncome ?? 0;
  return income > 0 ? [{ income, rate: result.aggregateReductionRate ?? 1 }] : [];
}

export function sumBucketIncome(buckets: ReducibleIncomeBucket[]): number {
  return buckets.reduce((s, b) => s + b.income, 0);
}

/**
 * §90①의 **B — 감면대상 양도소득금액**(세액감면형, 자산 1건).
 *
 * §103② 1단계(「감면소득금액 **외**의 양도소득금액에서 먼저 공제」)를 **자산별 배분**에서도
 * 적용하려면 같은 B가 필요하다. 이 모듈이 이미 `nonReducibleIncome` 총액으로 쓰고 있던 값이라
 * **여기서 내보내 단일 소스로 삼는다** — 배분 쪽에서 따로 유도하면 표시와 감면액이 갈린다.
 */
export function reducibleIncomeOf(record: AggregateAssetRecord): number {
  if (record.result.isExempt) return 0;
  return sumBucketIncome(bucketsOfRecord(record));
}

/**
 * 감면액 산식·§103② 배분·자산별 표시가 읽는 B — 영 §167의2② 반영 후(B′, `transfer-tax-aggregate-reducible-loss-share.ts`).
 * ⚠️ 감면 재계산 경로의 **진입 판정**은 통산 전 값(`result.reducibleIncome`)으로 한다 —
 *    B′가 0이라고 빠지면 레거시 합산이 단건 감면액을 그대로 더한다(계획서 §4.4 C-1).
 */
export function bucketsOfRecord(record: AggregateAssetRecord): ReducibleIncomeBucket[] {
  return record.reducibleAfterLoss?.buckets ?? bucketsOf(record.result);
}

/** 자산 결과 `reducibleIncome`의 B′ 판(§77 계열은 감면율이 박힌 값) — 자산별 배분 가중치·표시용. */
export function reducibleIncomeOfRecord(record: AggregateAssetRecord): number {
  if (record.result.isExempt) return 0;
  return record.reducibleAfterLoss?.reducibleIncome ?? record.result.reducibleIncome ?? 0;
}

/**
 * §90①의 `(B − C) × E` — 기본공제 C를 **감면율이 낮은 버킷부터** 흡수시키고 율을 곱한다.
 *
 * 「소득세법」 §103②은 감면소득 **내부의** 흡수 순서를 정하지 않는다. 낮은 율부터 태우는 것은
 * 국세청 해석(부동산거래관리과-0893, 2011.10.20. — 감면율이 다른 자산을 같은 날 양도하면 감면율이 낮은
 * 양도소득금액에서 먼저 공제)과 §77(현금·채권)·§77의2(현금·대토) 단건 산식이 같은 방향이다. 다건의 자산 간
 * 배분(`allocateBasicDeduction` 2단계)도 같은 순서를 쓴다.
 *
 * ⚠️ 절사는 버킷 **안에서** 한다 — 조문이 `(B − C)`를 먼저 만들고 그 뒤에 E를 곱하기 때문이다.
 */
export function absorbBasicDeduction(buckets: ReducibleIncomeBucket[], basicDeduction: number): number {
  let remaining = Math.max(0, basicDeduction);
  let rated = 0;
  for (const b of [...buckets].sort((x, y) => x.rate - y.rate)) {
    const absorbed = Math.min(remaining, b.income);
    remaining -= absorbed;
    rated += applyRate(b.income - absorbed, b.rate);
  }
  return rated;
}

/**
 * F-9 — 호별 산정 입력. `aggregateByGroup`의 호 버킷 echo + 자산별 기본공제 배분.
 * §104⑤에서 「전체 누진」이 채택되면 호출측이 넘기지 않는다(Q-2 — 합산 유지).
 */
export interface PerClauseContext {
  clauseTaxes: Map<string, ClauseTaxEcho>;
  assetClauseKeys: string[][];
  /** 자산별 파트 종류 → 호 버킷 식별자(`aggregateByGroup` echo). 없으면 귀속하지 않는다. */
  assetPartClauseKeys?: Partial<Record<PartKind, string[]>>[];
  /** 자산별 파트 종류 → 세액 계산에서 그 파트가 받은 기본공제(`aggregateByGroup` echo). */
  assetPartBasic?: Partial<Record<PartKind, number>>[];
  /** 자산별 파트 종류 → 파트 소득(`aggregateByGroup` echo). */
  assetPartIncome?: Partial<Record<PartKind, number>>[];
  allocatedBasic: number[];
}

export type PartKind = "land" | "building" | "non_business_land" | "housing";

/**
 * 감면 자산이 §90① A·D를 읽을 **호 버킷**.
 *
 * 파트가 한 호에만 있으면 그 호다. 파트가 둘 이상의 호에 걸쳐도, 「조세특례제한법」 §77에서 **한 파트만**
 * 「소급 2년 이전 취득」 요건을 채우면(5B — `partWise`) 감면소득은 그 파트의 양도소득금액이라 **그 파트의
 * 호**로 귀속한다 — 안분이 아니라 귀속이 확정돼 있다(Q-F2a, `transfer-104-5-split-nonhouse-followups.plan.md` §2).
 * 감면 파트 자체가 둘 이상의 호에 걸치면(주택 토지 + 배율 초과분) 귀속할 수 없어 종전 키 그대로 둔다(합산 + 안내).
 */
export function reductionClauseKeysOf(i: number, result: TransferTaxResult, ctx: PerClauseContext): string[] {
  return reductionAttributionOf(i, result, ctx)?.keys ?? ctx.assetClauseKeys[i];
}

/**
 * 귀속이 성립하면 그 호와 **감면 파트가 세액 계산에서 받은 기본공제**(§90①의 C).
 * C를 그 값으로 잡아야 분모 D(그 호 버킷의 과세표준 — 파트 내부 기본공제 배분 후)와 축이 같다. 자산 단위 식
 * `배분 기본공제 − (통산 후 소득 − 통산 전 감면소득)`은 차손이 감면 제외 파트에 닿으면 C를 과대로 잡는다(리뷰 #3).
 */
function reductionAttributionOf(
  i: number,
  result: TransferTaxResult,
  ctx: PerClauseContext,
): { keys: string[]; basic: number } | undefined {
  if (ctx.assetClauseKeys[i].length <= 1) return undefined;
  const partWise = result.publicExpropriationDetail?.partWise;
  if (result.reductionTypeApplied !== "public_expropriation" || !partWise) return undefined;
  const byKind = ctx.assetPartClauseKeys?.[i] ?? {};
  // §155⑳ 특례 자산은 파트가 주택분·배율 초과분이라 토지·건물 귀속이 성립하지 않는다.
  if (byKind.housing) return undefined;
  const kinds = reducedPartKindsOf(partWise);
  const own = [...new Set(kinds.flatMap((k) => byKind[k] ?? []))];
  if (own.length !== 1) return undefined;
  return { keys: own, basic: partBasicOfKinds(kinds, ctx.assetPartBasic?.[i] ?? {}) };
}

/** 파트별 귀속을 실측으로 확인한 감면 유형(계획서 Q-2) — 다른 유형은 재기 전까지 합산 + 안내로 둔다. */
const WHOLE_ASSET_PART_TYPES: ReadonlySet<string> = new Set(["public_expropriation", "self_farming"]);

/**
 * 자산의 양도소득금액 **전부**가 하나의 감면율로 감면되는 자산은 각 파트의 감면소득이 그 파트의 소득과 같다 —
 * 비율을 가정해 나누는 것이 아니라 값이 이미 정해져 있다. 그래서 파트별로 그 호에 귀속해 각호별로 산정한다
 * (재산세과-3820 · 서면5팀-57 · 서면4팀-4036. 한 자산의 파트를 다룬 정면 해석은 없다 — 계획서
 * `transfer-split-both-parts-reduction-per-clause.plan.md` §1.2).
 *
 * 버킷이 둘(현금·채권 혼합)이면 파트 몫을 입력이 정하지 않으므로 `undefined`(합산 + 안내)다.
 * C는 그 파트가 세액 계산에서 받은 기본공제 — 분모 D와 축이 같다. 파트 순서는 종류명으로 고정한다.
 */
function wholeAssetPartSlicesOf(
  i: number,
  record: AggregateAssetRecord,
  ctx: PerClauseContext,
): { key: string; buckets: ReducibleIncomeBucket[]; basic: number }[] | undefined {
  if (ctx.assetClauseKeys[i].length <= 1) return undefined;
  const { result } = record;
  if (!WHOLE_ASSET_PART_TYPES.has(result.reductionTypeApplied ?? "")) return undefined;
  if (result.publicExpropriationDetail?.partWise) return undefined;
  const byKind = ctx.assetPartClauseKeys?.[i] ?? {};
  // §155⑳ 특례 자산의 주택분·배율 초과분 파트는 재지 않았다.
  if (byKind.housing) return undefined;
  const kinds = (Object.keys(byKind) as PartKind[]).sort();
  if (kinds.some((k) => byKind[k]?.length !== 1)) return undefined;
  const buckets = bucketsOfRecord(record);
  const incomeOf = (k: PartKind) => ctx.assetPartIncome?.[i]?.[k] ?? 0;
  if (buckets.length !== 1 || buckets[0].income !== kinds.reduce((t, k) => t + incomeOf(k), 0)) return undefined;
  // 파트 안 차손으로 소득이 0인 파트는 감면소득이 없다 — 호별 표에 0원 행을 만들지 않는다.
  return kinds.filter((k) => incomeOf(k) > 0).map((k) => ({
    key: byKind[k]![0],
    buckets: [{ ...buckets[0], income: incomeOf(k) }],
    basic: ctx.assetPartBasic?.[i]?.[k] ?? 0,
  }));
}

/** 감면 자산을 호 하나(또는 파트별 호)에 귀속할 수 없는가 — 그런 자산이 있으면 신고 전체가 합산 산식이다. */
export function reductionSpansClauses(i: number, record: AggregateAssetRecord, ctx: PerClauseContext): boolean {
  return reductionClauseKeysOf(i, record.result, ctx).length !== 1 && !wholeAssetPartSlicesOf(i, record, ctx);
}

/** §77 감면소득이 생긴 파트 종류(5B `partWise`). */
export const reducedPartKindsOf = (partWise: { eligiblePart: "land" | "building" }): readonly PartKind[] =>
  partWise.eligiblePart === "land" ? ["land", "non_business_land"] : ["building"];
const partBasicOfKinds = (kinds: readonly PartKind[], basicByKind: Partial<Record<PartKind, number>>) =>
  kinds.reduce((s, k) => s + (basicByKind[k] ?? 0), 0);

/**
 * F-A — 감면 파트가 확정된 split 자산(§77 5B `partWise`)의 C를 **감면 파트가 세액 계산에서 받은 기본공제**로 읽는다.
 * 전체 누진 경로(`perClause` 없음)용이다. 호별 경로는 `reductionAttributionOf`가 같은 값을 쓴다.
 *
 * 자산 단위 식 `배분 기본공제 − (통산 후 소득 − B)`는 받은 차손이 감면 파트에 닿아 통산 후 소득이 B보다 작아지면
 * 감면 외 소득을 0으로 보아 C를 과대로 잡는다(실측 30셀, 최대 92,760 — 계획서
 * `transfer-split-basic-deduction-units-and-order-rounding.plan.md` §2). 파트가 없거나 주택 파트면 `undefined`(자산 단위 식).
 */
export function reducedPartBasicOf(
  result: TransferTaxResult,
  basicByKind: Partial<Record<PartKind, number>> | undefined,
): number | undefined {
  const partWise = result.publicExpropriationDetail?.partWise;
  if (result.reductionTypeApplied !== "public_expropriation" || !partWise) return undefined;
  if (!basicByKind || Object.keys(basicByKind).length === 0 || basicByKind.housing !== undefined) return undefined;
  return partBasicOfKinds(reducedPartKindsOf(partWise), basicByKind);
}

/** `104-1-10|0.7` → 「§104①10호 (70%)」. 호 불명(`solo-*`)은 「호 미상」. */
function clauseLabelOf(echo: ClauseTaxEcho): string {
  const [candidates, rate] = echo.key.split("|");
  if (candidates.startsWith("solo-")) return "호 미상";
  const label = candidates
    .split("+")
    .map((c) => {
      const m = /^104-1-(\d+)$/.exec(c);
      return m ? `§104①${m[1]}호` : c;
    })
    .join("·");
  return rate ? `${label} (${+(Number(rate) * 100).toFixed(2)}%)` : label;
}

/**
 * 한 감면 유형의 **호별** §90① — 재산세과-3820 · 서면5팀-57(「각호별로 산출세액과 감면세액을 산정」).
 *
 * A·D는 감면 자산이 속한 **호 버킷**의 산출세액·과세표준이다. C는 자산마다
 * `max(0, 배분 기본공제 − 비감면소득)` — §103② 1단계(감면 외 소득에서 먼저 공제)는
 * `allocateBasicDeduction`이 신고서 전체에서 이미 수행했으므로 그 결과의 **감면소득 몫**만 읽는다.
 * 미등기 자산은 기본공제를 받지 못하므로(§103①) 여기서 C를 흡수하지 않는다 —
 * 종전 합산 산식의 `C = 총 기본공제 − 비감면소득 합`은 미등기 소득까지 더해 C를 0으로 만들었다.
 */
export function perClauseRowsOf(
  idxList: number[],
  assetRecords: AggregateAssetRecord[],
  taxableAfterReduction: number[],
  ctx: PerClauseContext,
): { rows: ReductionClauseRow[]; weights: number[] } {
  /** 호에 귀속된 감면소득 한 조각 — 보통 자산 하나, 파트별 귀속이면 파트 하나다. */
  type Slice = { i: number; buckets: ReducibleIncomeBucket[]; basic: number };
  const byClause = new Map<string, Slice[]>();
  const addSlice = (key: string, slice: Slice) => byClause.set(key, [...(byClause.get(key) ?? []), slice]);
  for (const i of idxList) {
    const parts = wholeAssetPartSlicesOf(i, assetRecords[i], ctx);
    if (parts) {
      for (const { key, buckets, basic } of parts) addSlice(key, { i, buckets, basic });
      continue;
    }
    const own = bucketsOfRecord(assetRecords[i]);
    addSlice(reductionClauseKeysOf(i, assetRecords[i].result, ctx)[0], {
      i,
      buckets: own,
      basic:
        reductionAttributionOf(i, assetRecords[i].result, ctx)?.basic ??
        Math.max(0, ctx.allocatedBasic[i] - Math.max(0, taxableAfterReduction[i] - sumBucketIncome(own))),
    });
  }
  const rows: ReductionClauseRow[] = [];
  const weights = idxList.map(() => 0);
  for (const [key, members] of byClause) {
    const echo = ctx.clauseTaxes.get(key)!;
    const ratio = (numerator: number) =>
      echo.taxBase > 0 ? safeMultiplyThenDivide(echo.tax, numerator, echo.taxBase) : 0;
    let gross = 0;
    let basic = 0;
    const buckets: ReducibleIncomeBucket[] = [];
    for (const m of members) {
      gross += sumBucketIncome(m.buckets);
      basic += m.basic;
      buckets.push(...m.buckets);
      weights[idxList.indexOf(m.i)] += ratio(absorbBasicDeduction(m.buckets, m.basic));
    }
    const numerator = absorbBasicDeduction(buckets, basic);
    rows.push({
      clauseLabel: clauseLabelOf(echo),
      calculatedTax: echo.tax,
      taxBase: echo.taxBase,
      eligibleIncomeBeforeRate: gross,
      basicDeductionApplied: Math.min(basic, gross),
      numerator,
      raw: ratio(numerator),
    });
  }
  return { rows, weights };
}
