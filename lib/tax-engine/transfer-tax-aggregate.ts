/**
 * 양도소득세 다건 동시 양도 엔진 (Layer 2 — Orchestrator on Orchestrator)
 *
 * 동일 과세기간 내 2건 이상 자산을 양도할 때 아래 규정을 반영한다:
 *   - §92              : 양도소득금액 합산 → 통합 과세표준
 *   - §102 ②·시행령 §167의2 : 양도차손 통산 (그룹 내 → 타군 pro-rata 안분, 이월 불인정)
 *   - §103             : 기본공제 연 1회 250만원, 미등기 배제
 *   - §104⑤          : 비교과세 MAX(세율군별 분리세액 합, 전체 누진세액)
 *   - 조특법 §127⑦    : 감면 중복배제는 건별 독립 적용 후 합산
 *
 * 순수 함수. DB 직접 호출 없음. 모든 세율 데이터는 rates 매개변수로 주입.
 * 기존 단건 엔진(`calculateTransferTax`)을 건별로 재사용하며, 상위에서 합산·통산·비교과세 수행.
 */

import {
  resolveFilingUnitCarryoverScope,
  type CarryoverScenarioOverrides,
  type FilingUnitCarryoverComparison,
} from "./transfer-tax-aggregate-carryover-scope";
import { classifyRateGroup } from "./transfer-tax-aggregate-helpers";
import { computeAggregateOnce } from "./transfer-tax-aggregate-once";
import { applyDebtUnits, attachPurchasedPartSplit, deriveCarryoverDebtUnits, stripDebtKey } from "./transfer-tax-aggregate-debt-units";

export { classifyRateGroup };

import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { RatesByTransferDate } from "./transfer-tax-item-rates";


// ============================================================
// 타입 — ./types/transfer-aggregate.types 로 분리 (800줄 정책)
// 기존 소비자들을 위해 본체 파일에서 재수출한다.
// ============================================================

import type {
  RateGroup,
  TransferTaxItemInput,
  AggregateTransferInput,
  PerPropertyBreakdown,
  ReductionBreakdownEntry,
  GroupTaxResult,
  LossOffsetRow,
  AggregateTransferResult,
} from "./types/transfer-aggregate.types";

export type {
  RateGroup,
  TransferTaxItemInput,
  AggregateTransferInput,
  PerPropertyBreakdown,
  ReductionBreakdownEntry,
  GroupTaxResult,
  LossOffsetRow,
  AggregateTransferResult,
};



// ============================================================
// 공개 진입점 — §97의2②3호를 **신고단위 결정세액**으로 판정한다
// ============================================================

/**
 * **외부 비교 단위** — 단건 엔진이 아니라 route가 A/B 카드를 미리 만든 §97의2②3호 비교 단위.
 *
 * 일반건물 부담부증여는 A/B가 §159 안분 단계(카드 조립 **전**)에서 갈려 카드에 `carryoverTaxation`이
 * 없다. 그래서 단건 엔진이 판정하는 단위처럼 카드 하나에 시나리오를 내려보낼 수 없고, 집계가 그 단위의
 * 카드 구간을 통째로 갈아 끼운다(계획서 `docs/00-pm/gb-bg-carryover-share-bundled.plan.md` §4.2).
 *
 * `input.properties[start, start + cardsA.length)`가 그 단위의 **B(미적용) 카드**다.
 */
export interface ExternalCarryoverUnit {
  /** 결과에서 단위를 찾는 키 — 지분은 카드 접미사, 묶음은 자산 id(계획서 §4.6). */
  key: string;
  /** 그 단위 첫 카드의 위치. 순차 고정점의 단위 순서도 이 값이다 — 단건 엔진 단위와 같은 축(카드 index)이다. */
  start: number;
  /** A(§97의2① 적용) 카드. B 카드와 개수·순서가 같다 — 갈아 끼워도 다른 카드의 index가 움직이지 않는다. */
  cardsA: readonly TransferTaxItemInput[];
}

export interface ExternalCarryoverUnitOutcome {
  adoptedScenario: "A" | "B";
  /** 그 단위에 적용 / 미적용일 때의 **신고 전체** 결정세액 — 단건 엔진 단위의 `filingUnitComparison`과 같은 뜻. */
  filingUnitComparison: FilingUnitCarryoverComparison;
  /** 최종 배정에서 **이 단위만** 반대 시나리오로 돌린 집계 — 채택하지 않은 쪽 요약은 여기서 만든다(계획서 §4.6). */
  counterfactual: AggregateTransferResult;
}

/**
 * 다건 양도소득세 집계.
 *
 * 단건 엔진은 §97의2②3호의 A/B 비교를 **자기 자산만 놓고** 한다. 자산이 1건이면 그 값이 곧
 * 신고 전체의 결정세액이라 옳지만, **여러 건이면 틀린다** — A/B 전환이 세율군을 바꿔
 * §104⑤ 누진 합산·§102② 통산·§103 기본공제 배분이 함께 움직이기 때문이다
 * (`transfer-tax-aggregate-carryover-scope.ts` 머리주석 · 실측 300 격자 중 7건, 전부 과소).
 *
 * 그래서 여기서 집계를 여러 번 돌려 **신고 전체 결정세액**으로 비교하고, 그 결과를
 * `carryoverScenarioOverride`로 단건 엔진에 내려보낸다.
 *
 * **자산 1건이거나 이월과세 자산이 없으면 호출 1회**로 종전과 동일하게 끝난다.
 */
export function calculateTransferTaxAggregate(
  input: AggregateTransferInput,
  /** 신고 단위(과세기간) 세율 — §103 기본공제 · §104⑤1호 누진표. `ratesByTransferDate`가 없으면 자산 계산에도 쓴다. */
  rates: TaxRatesMap,
  /**
   * E-14n — 자산별 양도일 세율(`rateDateKey(양도일)` → 세율). 양도일이 서로 다른 다건 신고는 반드시 넘긴다 —
   * 연중에 시작하는 세율 행이 있어 한 날짜로 읽은 세율은 그 전 양도분에 다른 규정을 준다.
   */
  ratesByTransferDate?: RatesByTransferDate,
): AggregateTransferResult {
  return calculateTransferTaxAggregateWithUnits(input, rates, ratesByTransferDate, []).result;
}

/**
 * {@link calculateTransferTaxAggregate} + 외부 비교 단위. 단건 엔진 단위와 외부 단위를 **한 번의 순차 고정점**으로
 * 푼다 — 둘을 따로 풀면 단위 순서가 카드 순서가 아니게 되어 규약과 결과가 달라질 수 있다(계획서 §4.2 기각안).
 */
export function calculateTransferTaxAggregateWithUnits(
  input: AggregateTransferInput,
  rates: TaxRatesMap,
  ratesByTransferDate: RatesByTransferDate | undefined,
  externalUnits: readonly ExternalCarryoverUnit[],
): { result: AggregateTransferResult; units: Record<string, ExternalCarryoverUnitOutcome> } {
  let covered = 0;
  for (const u of [...externalUnits].sort((a, b) => a.start - b.start)) {
    if (u.cardsA.length === 0 || u.start < covered || u.start + u.cardsA.length > input.properties.length)
      throw new Error(`다건 양도 입력: 이월과세 비교 단위 ${u.key}의 카드 구간이 비었거나 겹치거나 범위를 벗어났습니다.`);
    covered = u.start + u.cardsA.length;
  }
  const externalStarts = new Set(externalUnits.map((u) => u.start));
  // 이월과세 × 당초 증여 채무 부분(매입분) — 채무 카드는 A 배정일 때만 증여분·매입분으로 펼친다(매입분은 꼬리 카드라 index 불변). 엔진에는 채무 키를 벗긴 카드만 간다.
  const debtUnits = deriveCarryoverDebtUnits(input.properties, externalStarts);
  const engineProperties = debtUnits.size === 0 ? input.properties : input.properties.map((p, i) => (debtUnits.has(i) ? stripDebtKey(p) : p));

  const memo = new Map<string, AggregateTransferResult>();
  const run = (overrides: CarryoverScenarioOverrides): AggregateTransferResult => {
    // 외부 단위는 카드를 갈아 끼우고, 단건 엔진에는 자기 단위의 시나리오만 내려보낸다.
    // 외부 단위의 「B」와 「미지정」은 같은 카드라 같은 키로 메모이즈한다.
    const engineOverrides: CarryoverScenarioOverrides = {};
    for (const [k, v] of Object.entries(overrides)) if (!externalStarts.has(Number(k))) engineOverrides[Number(k)] = v;
    const swapped = externalUnits.filter((u) => overrides[u.start] === "A");
    const key = JSON.stringify([engineOverrides, swapped.map((u) => u.start)]);
    const hit = memo.get(key);
    if (hit) return hit;
    const properties = [...engineProperties];
    for (const u of swapped) properties.splice(u.start, u.cardsA.length, ...u.cardsA);
    const computed = computeAggregateOnce({ ...input, properties: applyDebtUnits(properties, debtUnits, overrides) }, rates, engineOverrides, ratesByTransferDate);
    memo.set(key, computed);
    return computed;
  };

  // 1) 강제 없이 1회 — ②1호·②2호·③ 기간·관계로 **이미 배제된** 자산을 가려낸다.
  //    그 배제들은 ②3호보다 앞서므로 비교 대상이 아니다(`finishScenarios` 조기 반환).
  const baseline = run({});
  const eligible = [
    ...baseline.properties.flatMap((p, idx) => (p.carryoverTaxationDetail?.isEligible === true ? [idx] : [])),
    ...externalStarts,
  ].sort((a, b) => a - b);
  if (eligible.length === 0) return { result: baseline, units: {} };

  // 2) 신고단위 비교로 채택 시나리오 확정
  const { overrides, comparisons } = resolveFilingUnitCarryoverScope(
    eligible,
    (ov) => run(ov).determinedTax,
  );
  const final = run(overrides);

  // 3) 비교 실적을 자산별 detail에 실어 준다 — 결과 화면이 **신고단위 두 값**을 그대로 보여준다.
  //    (단건 세액만 보여주면 「A가 작은데 A를 채택했다」는 자기모순 화면이 된다.)
  let result: AggregateTransferResult = {
    ...final,
    properties: final.properties.map((p, idx) => {
      const cmp = comparisons.get(idx);
      const detail = p.carryoverTaxationDetail;
      if (!cmp || !detail) return p;
      return { ...p, carryoverTaxationDetail: { ...detail, filingUnitComparison: cmp } };
    }),
  };
  // 채무 부분(매입분) 조각 echo — 채택과 무관하게 부모 카드에 싣는다(A′ 쪽은 반사실 실행에서).
  for (const [idx, unit] of debtUnits) {
    const cmp = comparisons.get(idx);
    if (!cmp) continue;
    const runA = overrides[idx] === "A" ? final : run({ ...overrides, [idx]: "A" });
    result = attachPurchasedPartSplit(result, idx, unit, runA, baseline.properties[idx]?.carryoverTaxationDetail, cmp);
  }
  const units: Record<string, ExternalCarryoverUnitOutcome> = {};
  for (const u of externalUnits) {
    const adoptedScenario = overrides[u.start];
    units[u.key] = {
      adoptedScenario,
      filingUnitComparison: comparisons.get(u.start)!,
      counterfactual: run({ ...overrides, [u.start]: adoptedScenario === "A" ? "B" : "A" }),
    };
  }
  return { result, units };
}

// 헬퍼 영역(M-0 검증 / M-2 세율군 / M-3 차손통산 / M-4 기본공제 / M-5 그룹집계 / M-6 누진)은
// `transfer-tax-aggregate-helpers.ts` 로 분리되었다 (800줄 정책 준수).

// 위 헬퍼들은 헬퍼 파일로 이동.
