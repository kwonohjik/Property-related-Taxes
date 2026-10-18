/**
 * 다건 양도 집계의 **감면 3단계** — 합산 재계산(M-8) · 자산별 배분 · 농어촌특별세.
 *
 * `transfer-tax-aggregate.ts` 800줄 정책 분리(2026-08-23 F17). 세 단계는 **한 줄기**다:
 * 유형별로 감면세액을 재계산해 §133 한도를 적용하고(①), 그 결과를 자산별로 배분한 뒤(②),
 * 배분액을 base로 농특세를 판정한다(③). 그래서 한 파일에 둔다 — 쪼개면 ②가 ①의 산출물
 * (`ReductionBreakdownEntry`)을, ③이 ②의 산출물(배분 Map)을 각각 다른 파일에서 찾아야 한다.
 *
 * ⚠️ **호출 순서가 계약이다** — ① → ② → ③. ②는 ①의 `cappedAggregateReduction`을,
 *    ③은 ②의 자산별 몫을 base로 쓴다. 순서를 바꾸면 한도 미반영 금액에 농특세가 붙는다.
 */

import { TRANSFER } from "./legal-codes";
import { isSec104_5ReductionParenthesisInForceForTaxYear } from "./data/sec104-5-reduction-parenthesis-era";
import { reductionTypeLabelOf } from "./transfer-reduction-type-labels";
import { applyRate, safeMultiplyThenDivide } from "./tax-utils";
import {
  applyAnnualLimits,
  applyFiveYearLimits,
  buildLimitGroups,
  lookupLimit,
} from "./aggregate-reduction-limits";
import { resolveTypeLegalBasis } from "./transfer-tax-aggregate-pickers";
import { RURAL_SURTAX_RATE, resolveTaxCreditRuralSurtax } from "./transfer-tax-rural-surtax";
import type { CalculationStep, TransferTaxResult } from "./transfer-tax";
import type { ReducibleIncomeBucket } from "./types/transfer-result.types";
import type {
  ReductionBreakdownEntry,
  ReductionClauseRow,
  TransferTaxItemInput,
} from "./types/transfer-aggregate.types";
import type { ClauseTaxEcho } from "./transfer-tax-aggregate-group-tax";
import type { ReducibleAfterLoss } from "./transfer-tax-aggregate-reducible-loss-share";

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

function sumBucketIncome(buckets: ReducibleIncomeBucket[]): number {
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
function absorbBasicDeduction(buckets: ReducibleIncomeBucket[], basicDeduction: number): number {
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
  allocatedBasic: number[];
}

type PartKind = "land" | "building" | "non_business_land" | "housing";

/**
 * 감면 자산이 §90① A·D를 읽을 **호 버킷**.
 *
 * 파트가 한 호에만 있으면 그 호다. 파트가 둘 이상의 호에 걸쳐도, 「조세특례제한법」 §77에서 **한 파트만**
 * 「소급 2년 이전 취득」 요건을 채우면(5B — `partWise`) 감면소득은 그 파트의 양도소득금액이라 **그 파트의
 * 호**로 귀속한다 — 안분이 아니라 귀속이 확정돼 있다(Q-F2a, `transfer-104-5-split-nonhouse-followups.plan.md` §2).
 * 감면 파트 자체가 둘 이상의 호에 걸치면(주택 토지 + 배율 초과분) 귀속할 수 없어 종전 키 그대로 둔다(합산 + 안내).
 */
function reductionClauseKeysOf(i: number, result: TransferTaxResult, ctx: PerClauseContext): string[] {
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
function reducedPartBasicOf(
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
function perClauseRowsOf(
  idxList: number[],
  assetRecords: AggregateAssetRecord[],
  taxableAfterReduction: number[],
  ctx: PerClauseContext,
): { rows: ReductionClauseRow[]; weights: number[] } {
  const byClause = new Map<string, number[]>();
  for (const i of idxList) {
    const k = reductionClauseKeysOf(i, assetRecords[i].result, ctx)[0];
    byClause.set(k, [...(byClause.get(k) ?? []), i]);
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
    for (const i of members) {
      const own = bucketsOfRecord(assetRecords[i]);
      const b = sumBucketIncome(own);
      const c =
        reductionAttributionOf(i, assetRecords[i].result, ctx)?.basic ??
        Math.max(0, ctx.allocatedBasic[i] - Math.max(0, taxableAfterReduction[i] - b));
      gross += b;
      basic += c;
      buckets.push(...own);
      weights[idxList.indexOf(i)] = ratio(absorbBasicDeduction(own, c));
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

/** 집계가 자산별로 들고 있는 최소 정보 — 본 모듈이 읽는 부분만 좁혀 받는다. */
export interface AggregateAssetRecord {
  item: TransferTaxItemInput;
  result: TransferTaxResult;
  /** 영 §167의2② 반영 후 B′ — 없으면 통산 전 B(`bucketsOfRecord`). */
  reducibleAfterLoss?: ReducibleAfterLoss;
}

export interface AggregateReductionArgs {
  assetRecords: AggregateAssetRecord[];
  /** 합산 산출세액 (비교과세 반영 후) */
  calculatedTax: number;
  /** 감면후 양도소득금액 합 (자산별) */
  taxableAfterReduction: number[];
  /** 배분된 기본공제 합계 */
  totalBasicDeduction: number;
  /**
   * 자산별 기본공제 배분(§103② — `allocateBasicDeduction`). §90①의 C를 **이 배분에서** 읽는다 —
   * 감면 유형 사이의 C를 따로 안분하면 배분 표시와 감면액이 다른 순서를 말한다(부동산거래관리과-0893).
   */
  allocatedBasic: number[];
  /**
   * 자산별 파트 종류 → 세액 계산에서 그 파트가 받은 기본공제(`aggregateByGroup` echo). 감면 파트가 확정된 split 자산의 C를
   * 전체 누진 경로에서도 파트 귀속으로 읽는다(F-A — `reducedPartBasicOf`).
   */
  assetPartBasic: Partial<Record<PartKind, number>>[];
  taxYear: number;
  priorReductionUsage: { year: number; type: string; amount: number }[];
  /** F-9 호별 산정 입력 — 없으면 합산 산식(§104⑤ 전체 누진 채택 · Q-2). */
  perClause?: PerClauseContext;
  /** 부수효과 대상 — 호출측 배열을 그대로 변경한다(기존 동작 보존). */
  steps: CalculationStep[];
  warnings: string[];
}

export interface AggregateReductionResult {
  reductionBreakdown: ReductionBreakdownEntry[];
  reductionAmount: number;
}

/** ① M-8 — 유형별 감면 재계산 + 조특법 §133 한도. */
export function aggregateReductions(args: AggregateReductionArgs): AggregateReductionResult {
  const {
    assetRecords, calculatedTax, taxableAfterReduction, totalBasicDeduction, allocatedBasic,
    perClause, steps, warnings,
  } = args;
  const input = { taxYear: args.taxYear, priorReductionUsage: args.priorReductionUsage };
  // M-8: 감면 합산 — 유형별 비율 재계산 (조특법 §69 + §127⑦ + §133)
  //      ⚠️ 중복배제는 §127**⑦**이다. 종전에는 「의2」가 붙은 조문을 적었는데 조특법에
  //         그런 조문은 **존재하지 않는다**(KoreanLaw 실측 NOT_FOUND).
  //         §127⑦ 본문: 「둘 이상의 양도소득세의 감면규정을 동시에 적용받는 경우에는 그 거주자가
  //         선택하는 하나의 감면규정만을 적용한다」 (결과탭 코드리뷰 Lane 1 · L2).
  // 1) 각 자산이 노출한 reducibleIncome을 유형별로 집계
  // 2) 합산 과세표준 기준으로 `safeMultiplyThenDivide(calculatedTax, 유형별 reducibleIncome, taxBase)` 재계산
  // 3) §133 유형별 연간 한도 적용 (자경·축산·어업 1억원 그룹 / 공익수용 2억원 단독 등)
  // 4) 유형이 없는 레거시 감면은 건별 단순 합산으로 폴백
  //
  // 분모 주의: 반드시 aggregate taxBase(차손 통산 + 기본공제 반영)여야 한다.
  // 합산양도소득금액이나 각 건별 taxBase를 쓰면 과대감면이 발생한다.
  // 세액감면(§69·§77 등) 비율 재계산 분모 — income-deduction 반영 후 과세표준(감면후 기준).
  const aggregateTaxBase = Math.max(
    0,
    taxableAfterReduction.reduce((s, v) => s + v, 0) - totalBasicDeduction,
  );
  /**
   * 🔴 **「소득세법」 §90①의 `− C`** (2026-09-02 · **세액 변경**).
   *
   * §90①: 감면액 = **A × (B − C) / D × E**
   *   A 산출세액 · B 감면대상 양도소득금액 · **C 「§103②에 따른 양도소득 기본공제」**
   *   · D 과세표준 · E 감면율 (법제처 본문 실측)
   *
   * 종전 M-8은 `A × B / D`로 **C를 빼지 않았다**. 그래서 감면소득이 전체 소득의 대부분일 때
   * `B > D`가 되어 **감면이 과대**해졌다 — 실측(§97① 본문 50% · 자산 1건):
   *   단건 82,530,000 ↔ 다건 **82,962,094**(총부담 −388,886). 단건은 §90①과 일치한다.
   *
   * **C의 크기는 §103②이 정한다** — 「감면소득금액이 있는 경우에는 그 **감면소득금액 외의**
   * 양도소득금액에서 **먼저** 공제하고 …」. 즉 기본공제는 비감면소득이 먼저 흡수하고,
   * 흡수하지 못한 잔여만 감면소득에 닿는다. 자산마다 `c_i = max(0, 배분 기본공제_i − 비감면소득_i)`이고
   * 그 배분은 `allocateBasicDeduction`이 정한다(같은 날 감면소득은 감면율 낮은 것부터 — 부동산거래관리과-0893).
   * ⇒ 비감면소득이 250만원 이상이면 C = 0이라 **종전 동작과 같다**. 감면 자산만 있는
   *   사안에서만 발현한다(그때 `(B − C)/D = 1`이 되어 단건과 원 단위까지 맞는다).
   *
   * ── 🔴 **B·E는 버킷으로 복원한다** (2026-09-03 · §77 계열 세액 변경) ──────────────
   * 자산 결과의 `reducibleIncome` 하나로는 B와 E를 되살릴 수 없다 — 유형마다 의미가 갈린다:
   *   · §97 계열 — B(감면율 前) + `aggregateReductionRate`
   *   · **§77·§77의2·§77의3 — `B × E`**(율이 박혀 있고 율 필드는 미설정)
   * 그래서 종전에는 이 세 유형을 「이미 기본공제를 뺐다」고 보아 C에서 **제외**했는데,
   * 그 전제가 **틀렸다**: 집계는 단건 엔진을 `skipBasicDeduction: true`로 부르므로 세 유형의
   * 자체 산식이 받은 기본공제는 **0**이다. ⇒ 기본공제가 분자에 **한 번도** 반영되지 않았다
   *   (실측 §77 자산 1건: 단건 감면 8,855,000 ↔ 다건 8,932,539 · 총부담 −69,786).
   * 게다가 §77은 현금분·채권분의 **율이 다르고**, §77의2는 현금분이 **감면대상이 아니다** —
   * 평균율 한 개로는 어느 쪽도 복원되지 않는다.
   *
   * ⇒ 자산이 `reducibleIncomeBuckets`(감면율 前 소득, 그 율)를 실으면 그대로 쓰고, 없으면
   *   `[{ income: reducibleIncome, rate: aggregateReductionRate ?? 1 }]`로 합성한다.
   *   버킷에 실리지 않은 소득은 **비감면소득**이므로 §103②대로 C를 먼저 흡수한다.
   */
  const reducibleByType = new Map<
    string,
    {
      income: number;
      ratedIncome: number;
      assetIds: string[];
      /** `assetRecords` 인덱스 — 호별 산정(F-9)이 자산의 호·기본공제를 찾는 데 쓴다. */
      idx: number[];
      rates: Set<number>;
      buckets: ReducibleIncomeBucket[];
    }
  >();
  /** §90①의 자산별 C — 배분 기본공제 중 그 자산의 비감면소득이 흡수하지 못한 잔여(`perClauseRowsOf`와 같은 식). */
  const basicOnReducibleOf = (idx: number) =>
    reducedPartBasicOf(assetRecords[idx].result, args.assetPartBasic[idx]) ??
    Math.max(0, (allocatedBasic[idx] ?? 0) - Math.max(0, taxableAfterReduction[idx] - sumBucketIncome(bucketsOfRecord(assetRecords[idx]))));

  assetRecords.forEach((r, idx) => {
    if (r.result.isExempt) return;
    const type = r.result.reductionTypeApplied;
    // 진입은 통산 전 값으로 판정하고(C-1), 누적은 영 §167의2② 반영 후 B′로 한다.
    if (!type || (r.result.reducibleIncome ?? 0) <= 0) return;
    const income = reducibleIncomeOfRecord(r);
    const existing =
      reducibleByType.get(type) ??
      { income: 0, ratedIncome: 0, assetIds: [], idx: [], rates: new Set<number>(), buckets: [] };
    // ⚠️ **감면율은 유형 단위로 균일하지 않다.** `long_term_rental`(0.7·0.5 tier)·
    //    `new_housing`(가격·시기 matrix)은 같은 type 문자열 아래 자산마다 감면율이 다를 수 있다.
    //    그래서 그룹의 rate 하나를 last-write-wins로 덮으면 한쪽 자산에 틀린 율이 곱해진다.
    //    ⇒ **자산별로 먼저 감면율을 곱해 누적**한다(`ratedIncome`).
    //    `income`은 별지84호 부표1 ⑲ 표시용(감면율 前)이라 그대로 둔다.
    const rate = r.result.aggregateReductionRate ?? 1;
    existing.income += income;
    existing.ratedIncome += rate === 1 ? income : applyRate(income, rate);
    existing.buckets.push(...bucketsOfRecord(r));
    existing.assetIds.push(r.item.propertyId);
    existing.idx.push(idx);
    existing.rates.add(rate);
    reducibleByType.set(type, existing);
  });

  /**
   * F-9 — 호별 산정 발동 조건. 호 버킷이 **하나뿐이면** 호별 = 합산이라 종전 경로를 그대로 탄다
   * (값이 같다 — F9-3이 고정). 감면 자산의 파트가 **둘 이상의 호에 걸치면**(토지·건물 분리취득 ·
   * 한 필지 중 일부만 비사업용) 감면소득을 호에 나눌 근거가 없어 합산으로 두고 안내한다.
   * 단, 감면소득의 소속 파트가 확정된 자산(§77 한 파트만 요건 충족)은 그 파트의 호로 귀속한다(`reductionClauseKeysOf`).
   */
  const reducibleIdx = [...reducibleByType.values()].flatMap((e) => e.idx);
  const spansClauses =
    perClause !== undefined &&
    perClause.clauseTaxes.size > 1 &&
    reducibleIdx.some((i) => reductionClauseKeysOf(i, assetRecords[i].result, perClause).length !== 1);
  const clauseCtx =
    perClause && perClause.clauseTaxes.size > 1 && !spansClauses ? perClause : undefined;
  const clauseByType = new Map<string, { rows: ReductionClauseRow[]; weights: number[] }>();

  // 조특법 §133 유형별 연간 한도 — `aggregate-reduction-limits.ts` 모듈 사용.
  // 유형별 원시 감면세액을 계산한 뒤 그룹 단위로 capping.
  const rawByType = new Map<string, number>();
  /** 유형별 §90① 표시 항 — B · C · (B − C) × E. 화면 자기일관성 전용(세액 무관). */
  const displayByType = new Map<
    string,
    { eligibleIncomeBeforeRate: number; basicDeductionApplied: number; numerator: number }
  >();
  for (const [type, entry] of reducibleByType.entries()) {
    // 🔴 분자는 **감면율 반영 후**(`ratedIncome`)를 쓴다. `reducibleIncome`에 감면율이
    //    반영돼 있지 않은 유형(§97 계열·legacy 장기임대·legacy 신축·하이브리드) 때문이다 —
    //    별지84호 부표1 ⑲가 「감면율 前」 금액을 요구해 표시용으로 남아 있다
    //    (코드리뷰 D8-01 — §97① 본문이 다건에서 정확히 2배 감면됐다).
    //    §77·§77의2·§77의3·§69는 rate가 1이라 `ratedIncome === income`이므로 종전과 동일하다.
    /**
     * §90①의 `− C`. 자산마다 그 자산에 배분된 C를 **그 자산의 감면율 낮은 조각부터** 흡수시킨다.
     * 종전에는 감면 유형이 여럿이면 C를 감면대상소득(B) 비중으로 안분했는데, 같은 날 감면율이 다른
     * 감면소득은 감면율이 낮은 소득에서 먼저 공제한다(부동산거래관리과-0893 — 실측 자경 100% + 수용 15%:
     * 안분 833,333 / 1,666,666 → 감면 25,527,666, 해석례대로 25,728,765).
     */
    if (clauseCtx) {
      const pc = perClauseRowsOf(entry.idx, assetRecords, taxableAfterReduction, clauseCtx);
      clauseByType.set(type, pc);
      displayByType.set(type, {
        eligibleIncomeBeforeRate: pc.rows.reduce((t, row) => t + row.eligibleIncomeBeforeRate, 0),
        basicDeductionApplied: pc.rows.reduce((t, row) => t + row.basicDeductionApplied, 0),
        numerator: pc.rows.reduce((t, row) => t + row.numerator, 0),
      });
      rawByType.set(type, pc.rows.reduce((t, row) => t + row.raw, 0));
      continue;
    }
    const entryGross = sumBucketIncome(entry.buckets);
    let cApplied = 0;
    let numerator = 0;
    for (const i of entry.idx) {
      const own = bucketsOfRecord(assetRecords[i]);
      const c = basicOnReducibleOf(i);
      cApplied += Math.min(c, sumBucketIncome(own));
      // §90①은 `(B − C) × E` — **C를 뺀 뒤** 율을 곱한다. 그래서 버킷 안에서 절사한다.
      numerator += absorbBasicDeduction(own, c);
    }
    displayByType.set(type, {
      eligibleIncomeBeforeRate: entryGross,
      basicDeductionApplied: cApplied,
      numerator,
    });
    const raw =
      aggregateTaxBase > 0
        ? safeMultiplyThenDivide(calculatedTax, numerator, aggregateTaxBase)
        : 0;
    rawByType.set(type, raw);
  }
  // §133 한도는 양도연도 분기 그룹(2025+ §77 그룹 2억/3억, 이전 1억/2억).
  const transferYear = input.taxYear;
  const limitGroups = buildLimitGroups(transferYear);
  const { cappedByType: annuallyCapped, capInfoByType } = applyAnnualLimits(rawByType, limitGroups);

  // §133 5년 누적 한도 추가 capping
  const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(
    annuallyCapped,
    input.priorReductionUsage ?? [],
    transferYear,
    limitGroups,
  );
  const cappedByType = fiveYearCappedByType;

  const reductionBreakdown: ReductionBreakdownEntry[] = [];
  let totalAggregatedReduction = 0;
  for (const [type, entry] of reducibleByType.entries()) {
    const clause = clauseByType.get(type);
    const raw = rawByType.get(type) ?? 0;
    const capped = cappedByType.get(type) ?? 0;
    const info = capInfoByType.get(type);
    const fiveInfo = fiveYearCapInfoByType.get(type);
    const annualLimit =
      info && Number.isFinite(info.annualLimit) ? info.annualLimit : 0;
    const annuallyCappedReduction = annuallyCapped.get(type) ?? capped;
    const fiveYearLimitVal =
      fiveInfo && Number.isFinite(fiveInfo.fiveYearLimit) ? fiveInfo.fiveYearLimit : 0;
    reductionBreakdown.push({
      type,
      /**
       * M-8이 실제로 곱한 잔여 감면율 (1 = 이미 reducibleIncome에 반영됨).
       * 그룹 내 감면율이 균일하면 그 값, 자산마다 다르면 소득 가중평균 —
       * 어느 쪽이든 「감면대상소득 × 이 값 = 감면율 반영 소득」 항등식이 성립한다.
       */
      appliedReductionRate:
        entry.rates.size === 1
          ? [...entry.rates][0]
          : entry.income > 0
            ? entry.ratedIncome / entry.income
            : 1,
      legalBasis: info?.legalBasis
        /**
         * 🔴 `lookupLimit`을 **인자 없이** 부르면 `DEFAULT_LIMIT_GROUPS`로 조회한다. 그 기본
         *   그룹②는 `public_expropriation` 하나뿐이라 `gb_designated_land`·
         *   `replacement_land_comp`가 `groupTypes.length === 0`으로 떨어져 감면 근거 자리에
         *   **중복배제 조항(§127⑦)** 이 인쇄됐다. 두 유형은 양도연도 분기본
         *   `buildLimitGroups()`에만 있다 — 바로 위 :103에서 이미 만들어 둔 `limitGroups`를
         *   넘긴다 (결과탭 코드리뷰 #048).
         */
        ? `${lookupLimit(type, limitGroups).groupTypes.length > 0 ? resolveTypeLegalBasis(type) : TRANSFER.REDUCTION_OVERLAP_EXCLUSION} + ${info.legalBasis}`
        : resolveTypeLegalBasis(type),
      totalReducibleIncome: entry.income,
      eligibleIncomeBeforeRate: displayByType.get(type)?.eligibleIncomeBeforeRate ?? 0,
      basicDeductionApplied: displayByType.get(type)?.basicDeductionApplied ?? 0,
      reducibleIncomeAfterBasicDeduction: displayByType.get(type)?.numerator ?? 0,
      // 호별 산정이면 A·D는 **그 호의** 값(호가 둘 이상이면 합 — 표시는 `clauseRows`).
      aggregateTaxBase: clause
        ? clause.rows.reduce((t, row) => t + row.taxBase, 0)
        : aggregateTaxBase,
      aggregateCalculatedTax: clause
        ? clause.rows.reduce((t, row) => t + row.calculatedTax, 0)
        : calculatedTax,
      rawAggregateReduction: raw,
      annualLimit,
      annuallyCappedReduction,
      cappedAggregateReduction: capped,
      cappedByLimit: info?.cappedByLimit ?? false,
      fiveYearLimit: fiveYearLimitVal,
      priorGroupSum: fiveInfo?.priorGroupSum ?? 0,
      fiveYearRemaining: fiveInfo && Number.isFinite(fiveInfo.remaining) ? fiveInfo.remaining : 0,
      cappedByFiveYearLimit: fiveInfo?.cappedByFiveYear ?? false,
      assetIds: entry.assetIds,
      ...(clause
        ? { clauseBasis: "per_clause" as const, clauseRows: clause.rows, assetWeights: clause.weights }
        : {}),
    });
    totalAggregatedReduction += capped;
  }

  // 유형이 지정되지 않은 감면(reducibleIncome 미노출 레거시 경로)은 건별 단순 합산
  const legacyReductionAmount = assetRecords.reduce((s, r) => {
    if (r.result.isExempt) return s;
    // 재계산 경로(reducibleByType)는 reducibleIncome>0 인 유형만 처리한다.
    // reductionTypeApplied는 있으나 reducibleIncome 미노출인 세액감면(§97·§98·§99 계열 등)은
    // 이 레거시 단순합에 포함해야 소실되지 않는다(건별 §127⑦ 이미 적용된 reductionAmount).
    if (r.result.reductionTypeApplied && (r.result.reducibleIncome ?? 0) > 0) return s;
    return s + (r.result.reductionAmount ?? 0);
  }, 0);

  const reductionAmount = Math.min(
    calculatedTax,
    totalAggregatedReduction + legacyReductionAmount,
  );

  /**
   * §133③ **분할 양도 1개 과세기간 의제 — 미구현 고지** (코드리뷰 D8-05).
   *
   * 조특법 §133③(시행 2025-04-01본): 「제1항제1호 및 제2항제1호를 적용할 때 토지를
   * 분할(해당 토지의 일부를 양도한 날부터 소급하여 1년 이내에 토지를 분할한 경우를 말한다)하여
   * 그 일부를 양도하거나 토지의 지분을 양도한 후 그 양도한 날로부터 2년 이내에 나머지 토지나
   * 그 지분의 전부 또는 일부를 동일인이나 그 배우자에게 양도하는 경우에는 **1개 과세기간에
   * 해당 양도가 모두 이루어진 것으로 본다**.」
   *
   * 이 의제는 ①1호·②1호의 **연간 한도**에만 걸린다. `applyAnnualLimits`에는 과세기간 병합
   * 개념이 없고, `PriorReductionUsageItem`도 `{year, type, amount}` 3필드뿐이라
   * 「분할일·양수인 동일성」을 담을 자리가 없다.
   *
   * 완전 구현은 분할일·양수인 판정 입력이 필요한 **별도 축**이다. 그때까지는 침묵하지 않고
   * 고지한다 — 대상자가 스스로 합산 여부를 판단할 수 있어야 한다(조용한 과소과세 방지).
   * ⚠️ 자동 추정 금지 — 사용자가 선언하지 않은 사실을 엔진이 지어내지 않는다.
   */
  if (reducibleByType.size > 0) {
    warnings.push(
      "조세특례제한법 §133③(분할 양도 1개 과세기간 의제)은 반영되지 않았습니다. " +
        "양도일부터 소급 1년 이내에 토지를 분할해 일부를 양도했거나, 지분 양도 후 2년 이내에 " +
        "나머지를 동일인·배우자에게 양도한 경우에는 그 양도들이 1개 과세기간에 이루어진 것으로 보아 " +
        "연간 한도를 합산해야 하므로, 해당 사실이 있으면 신고 전 별도 확인이 필요합니다.",
    );
  }

  /**
   * F-9 — 호별 산정을 적용하지 못한 경우만 알린다. 종전에는 세율군별 채택이면 무조건
   * 「전체 산출세액 기준 · 별도 로직 필요」를 띄웠는데, 그 별도 로직이 `perClauseRowsOf`다.
   */
  if (spansClauses) {
    warnings.push(
      "감면 자산의 일부(토지·건물 또는 사업용·비사업용 부분)가 서로 다른 세율의 호에 걸쳐 있어, " +
        "감면세액을 호별이 아니라 합산 산출세액 기준으로 계산했습니다. 국세청은 호가 섞이면 호별로 " +
        "산출세액과 감면세액을 산정한다고 보므로(재산세과-3820) 신고 전 확인이 필요합니다.",
    );
  }

  steps.push({
    label: "감면세액 (합산 재계산)",
    formula:
      reducibleByType.size > 0
        ? `유형별 재계산: ${[...reducibleByType.keys()].map(reductionTypeLabelOf).join(", ")} | 원시 ${totalAggregatedReduction === 0 ? "0" : totalAggregatedReduction.toLocaleString()} + 레거시 ${legacyReductionAmount.toLocaleString()}`
        : legacyReductionAmount === 0
          ? // 🔴 종전에는 이 경우에도 「유형 미지정 감면만 존재」라고 적었다 — 감면이 **하나도
            //    없는데** 있다고 말하는 거짓 서술이었다(사용자 제보 2026-09-16 화면).
            "감면 없음 (합산 재계산 대상·건별 감면세액 모두 0)"
          : `건별 단순합 ${legacyReductionAmount.toLocaleString()} (유형 미지정 감면만 존재)`,
    amount: reductionAmount,
    legalBasis: TRANSFER.REDUCTION_ANNUAL_LIMIT,
  });

  return { reductionBreakdown, reductionAmount };
}

/**
 * §104⑤ 괄호 — 「감면액이 있는 경우에는 해당 감면세액을 **차감한 세액이 더 큰 경우의 산출세액**」.
 *
 * 감면이 두 경로에서 같은 비율(합산 산식)이면 감면 전 MAX와 답이 같다 — 그래서 종전에는
 * 감면 전에 골랐다(계획서 `transfer-104-5-proviso-mixed-use-rate-gaps.plan.md` D-6 증명).
 * 호별 산정(F-9)은 세율군별 경로의 감면만 호의 세액으로 잡으므로 **그 전제가 깨진다**
 * (감면율 100% 자산이 높은 세율 호에 있으면 세율군별 순세액이 전체 누진보다 항상 작다).
 * ⇒ 호 버킷이 둘 이상일 때만 두 경로의 감면 후 세액을 비교해 고른다. 호가 하나면 D-6 그대로다.
 * 전체 누진 경로의 감면은 합산 산식이다(Q-2).
 */
export function choose104_5AfterReduction(args: {
  base: Omit<AggregateReductionArgs, "calculatedTax" | "perClause" | "steps" | "warnings">;
  calculatedTaxByGroups: number;
  calculatedTaxByGeneral: number;
  calculatedTax: number;
  comparedTaxApplied: "groups" | "general" | "none";
  perClause: PerClauseContext;
}): {
  calculatedTax: number;
  comparedTaxApplied: "groups" | "general" | "none";
  perClause?: PerClauseContext;
  /** 감면 차감 후 비교로 감면 전 MAX와 **다른** 경로를 골랐는가 */
  decidedAfterReduction: boolean;
} {
  const pre = { calculatedTax: args.calculatedTax, comparedTaxApplied: args.comparedTaxApplied };
  const keepPre = {
    ...pre,
    perClause: pre.comparedTaxApplied === "general" ? undefined : args.perClause,
    decidedAfterReduction: false,
  };
  // 괄호는 2020.1.1. 양도분부터다(제16834호 부칙 제2조②) — 그 전 과세기간은 감면 전 MAX를 유지한다.
  if (!isSec104_5ReductionParenthesisInForceForTaxYear(args.base.taxYear)) return keepPre;
  if (args.perClause.clauseTaxes.size <= 1) return keepPre;
  const reductionOf = (calculatedTax: number, perClause?: PerClauseContext) =>
    aggregateReductions({ ...args.base, calculatedTax, perClause, steps: [], warnings: [] })
      .reductionAmount;
  const netGroups = args.calculatedTaxByGroups - reductionOf(args.calculatedTaxByGroups, args.perClause);
  const netGeneral = args.calculatedTaxByGeneral - reductionOf(args.calculatedTaxByGeneral);
  if (pre.comparedTaxApplied !== "general" && netGeneral > netGroups) {
    return {
      calculatedTax: args.calculatedTaxByGeneral,
      comparedTaxApplied: "general",
      perClause: undefined,
      decidedAfterReduction: true,
    };
  }
  if (pre.comparedTaxApplied === "general" && netGroups > netGeneral) {
    return {
      calculatedTax: args.calculatedTaxByGroups,
      comparedTaxApplied: "groups",
      perClause: args.perClause,
      decidedAfterReduction: true,
    };
  }
  return keepPre;
}

/**
 * 자산별 배분 가중치 — 호별 산정(F-9)이면 그 자산의 **호별 원시 감면**, 아니면 감면율 반영 소득.
 *
 * 호가 다른 자산을 소득 비율로 나누면 높은 세율 호의 감면이 낮은 호 자산으로 옮겨 간다
 * (F9-5: 16,485,000 / 12,570,000이 14,527,500씩으로 뭉개졌다). 자산별 표시와 농특세 판정이
 * 이 배분을 쓰므로 합계만 맞아서는 안 된다.
 */
export function allocationWeightOf(
  entry: ReductionBreakdownEntry,
  assetRecords: AggregateAssetRecord[],
): (idx: number) => { own: number; total: number } {
  const weights = entry.assetWeights;
  if (weights && weights.length === entry.assetIds.length) {
    const total = weights.reduce((t, w) => t + w, 0);
    return (idx) => {
      const k = entry.assetIds.indexOf(assetRecords[idx].item.propertyId);
      return { own: k >= 0 ? weights[k] : 0, total };
    };
  }
  return (idx) => ({
    own: reducibleIncomeOfRecord(assetRecords[idx]),
    total: entry.totalReducibleIncome,
  });
}

/**
 * ② 감면 배분 — 자산 인덱스 → 배분된 감면세액.
 * 표시(자산별 감면)와 농특세 판정이 이 값을 쓴다.
 */
export function allocateAggregateReductions(
  assetRecords: AggregateAssetRecord[],
  reductionBreakdown: ReductionBreakdownEntry[],
): Map<number, number> {
  // ── 감면 배분 선계산 — floor 잔액 말단 흡수 ────────────────────────────
  //
  // 2026-07-29 정정(#591 감사 R7 — 표시 자기일관성, 세액 불변): 같은 감면 유형의 자산들이
  // 각각 독립 floor되어 **Σ배분액이 cappedAggregateReduction과 최대 (n−1)원 어긋났다**.
  // 화면에는 "감면 합계"와 "자산별 감면"이 나란히 나오므로 1원 차이도 자기모순으로 보인다.
  //
  // 정책: 안분은 마지막 항목이 잔액을 흡수해 `Σ = 전체` 불변식을 지킨다
  // (memory `feedback_floor_residual_absorption`). 총 감면액(capped) 자체는 불변이다.
  //
  // 「마지막」은 **propertyId 순**이다(입력 순서가 아니다). 잔액 1원이 농특세 비과세 자산(§77 직접 경작 토지)과
  // 과세 자산 사이를 넘나들면 농특세가 1원 갈린다 — 입력 순서만 바꿔 총 부담이 달라지면 안 된다
  // (계획서 `transfer-split-basic-deduction-units-and-order-rounding.plan.md` §5).
  const reductionAllocations = new Map<number, number>();
  const idOf = (idx: number) => assetRecords[idx].item.propertyId;
  {
    /** 감면유형 → 그 유형에 속하는 자산 인덱스(아래에서 propertyId 순으로 정렬한다) */
    const groupIdx = new Map<string, number[]>();
    assetRecords.forEach((r, idx) => {
      const type = r.result.reductionTypeApplied;
      // B′가 0인 자산(받은 차손이 감면소득을 다 덮음)은 배분 대상이 아니다 — 말단 잔액을 받으면 안 된다.
      const reducible = reducibleIncomeOfRecord(r);
      if (!type || reducible <= 0) return;
      const entry = reductionBreakdown.find((b) => b.type === type);
      if (!entry || entry.totalReducibleIncome <= 0) return;
      const list = groupIdx.get(type);
      if (list) list.push(idx);
      else groupIdx.set(type, [idx]);
    });

    for (const [type, inputOrder] of groupIdx) {
      const idxList = [...inputOrder].sort((a, b) => (idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : a - b));
      const entry = reductionBreakdown.find((b) => b.type === type)!;
      const weightOf = allocationWeightOf(entry, assetRecords);
      let allocated = 0;
      idxList.forEach((idx, i) => {
        const isLast = i === idxList.length - 1;
        if (isLast) {
          // 말단 흡수 — 나머지 전액. floor 누적 오차가 여기로 모인다.
          reductionAllocations.set(idx, entry.cappedAggregateReduction - allocated);
          return;
        }
        const w = weightOf(idx);
        const share = w.total > 0
          ? Math.floor(entry.cappedAggregateReduction * (w.own / w.total))
          : 0;
        reductionAllocations.set(idx, share);
        allocated += share;
      });
    }
  }
  return reductionAllocations;
}

/** ③ 세액감면형 감면의 농어촌특별세 — 과세 판정은 자산별 배분액, 세액은 과세 대상 합계에 한 번. */
export function computeAggregateTaxCreditRuralSurtax(
  assetRecords: AggregateAssetRecord[],
  reductionAllocations: Map<number, number>,
  /** 부수효과 대상 — 농특세가 붙으면 근거 step을 남긴다(침묵 금지). */
  steps: CalculationStep[],
): number {
  /**
   * 세액감면형 감면의 **농어촌특별세** — 단건 경로(STEP 8.8)와 **같은 판정표**를 쓴다.
   *
   * 위 `ruralSurtax`는 **소득금액 차감형**(§99의3 등) 전용이라 §77·§77의2·§77의3·§97 시리즈에는
   * 한 원도 붙지 않았다. 「농어촌특별세법」 §5①1호는 조특법 감면세액 × 20%를 정하고, 비과세는
   * 시행령 §4가 **열거**한 것뿐이다(§69는 비과세 · §77은 **직접 경작한 토지**만 비과세).
   *
   * 🔑 **과세 여부는 자산별 배분액으로 판정한다** — 「직접 경작」 여부는 자산마다 다르므로 유형 합계로는
   *    가를 수 없다. 그래서 `reductionAllocations`(§133 한도까지 반영된 자산별 몫)를 쓴다.
   * 🔑 **세액은 과세 대상 감면세액의 합계에 한 번** 곱한다 — 과세표준은 「감면을 받는 소득세의 감면세액」(§5①1호)이고
   *    신고서(「소득세법 시행규칙」 별지 제84호서식 「농어촌특별세 납부계산서」)도 감면세액 한 줄이다. 종전처럼 자산마다
   *    절사해 더하면 합계보다 최대 (자산 수 − 1)원 작고, 잔액이 붙는 자산에 따라 1원씩 갈렸다.
   */
  let taxableReduction = 0;
  for (const [idx, allocated] of reductionAllocations) {
    if (allocated <= 0) continue;
    const rec = assetRecords[idx];
    const verdict = resolveTaxCreditRuralSurtax({
      reductionTypeApplied: rec.result.reductionTypeApplied,
      reductionAmount: allocated,
      isSelfCultivatedExpropriatedLand: (rec.item as { isSelfCultivatedExpropriatedLand?: boolean })
        .isSelfCultivatedExpropriatedLand,
    });
    if (verdict.verdict === "taxable") taxableReduction += allocated;
  }
  const ruralSurtaxCredit = applyRate(taxableReduction, RURAL_SURTAX_RATE);
  if (ruralSurtaxCredit > 0) {
    steps.push({
      label: "농어촌특별세 (감면세액 × 20%)",
      formula: `과세 대상 감면세액 ${taxableReduction.toLocaleString()} × 20% = ${ruralSurtaxCredit.toLocaleString()} (농어촌특별세법 §5①1호 · 시행령 §4 비과세 열거 제외분)`,
      amount: ruralSurtaxCredit,
      legalBasis: "농어촌특별세법 §5①1호",
    });
  }
  return ruralSurtaxCredit;
}
