/**
 * 양도소득세 다건 합산 엔진 헬퍼 (Layer 2 — Internal helpers)
 *
 * `transfer-tax-aggregate.ts` 가 800줄 정책을 초과하여 헬퍼 영역을 분리.
 * 외부 소비자는 본체(`./transfer-tax-aggregate`)에서 재수출되는 심볼(`classifyRateGroup` 등)을 사용한다.
 */

import {
  parseRatesFromMap,
  type TransferTaxInput,
  type TransferTaxResult,
} from "./transfer-tax";
import { calculateProgressiveTax } from "./tax-utils";
import { resolveRateBasisAcquisitionDate } from "./transfer-rate-holding-basis";
import { offsetLossesCore } from "./loss-offset-core";
import { crossLossOffsetRateKey } from "./cross-loss-offset-rate-key";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type {
  RateGroup,
  TransferTaxItemInput,
  AggregateTransferInput,
  LossOffsetRow,
  CrossLossExternalAsset,
} from "./types/transfer-aggregate.types";

// ============================================================
// M-0: 입력 검증
// ============================================================

export function validateInput(input: AggregateTransferInput): void {
  if (!input.properties || input.properties.length === 0) {
    throw new Error("다건 양도 입력: properties는 1건 이상이어야 합니다.");
  }
  if (input.properties.length > 20) {
    throw new Error("다건 양도 입력: properties는 최대 20건까지 지원합니다.");
  }
  const ids = new Set<string>();
  for (const p of input.properties) {
    if (ids.has(p.propertyId)) {
      throw new Error(`중복된 propertyId: ${p.propertyId}`);
    }
    ids.add(p.propertyId);
    const year = p.transferDate.getFullYear();
    if (year !== input.taxYear) {
      throw new Error(
        `자산 ${p.propertyId}의 양도일 연도(${year})가 과세기간(${input.taxYear})과 다릅니다.`,
      );
    }
  }
}

// ============================================================
// M-2: 세율군 분류
// ============================================================

export function classifyRateGroup(
  item: TransferTaxItemInput,
  result: TransferTaxResult,
): RateGroup {
  if (item.isUnregistered) return "unregistered";

  // §104② 기산일 — `transfer-rate-holding-basis.ts` 단일 소스 (단순 증여는 통산 없음).
  const acqDate = resolveRateBasisAcquisitionDate(item);
  const holdingMonths = monthsBetween(acqDate, item.transferDate);
  const isHousingLike =
    item.propertyType === "housing" ||
    item.propertyType === "right_to_move_in" ||
    item.propertyType === "presale_right";
  if (holdingMonths < 24 && (isHousingLike || holdingMonths < 24)) {
    return "short_term";
  }

  // 분양권은 **보유기간과 무관하게** 단일세율 그룹이다 (§104①1호 괄호:
  //   "제55조제1항에 따른 세율(**분양권의 경우에는 양도소득 과세표준의 100분의 60**)").
  //   → 1년 미만 70%(3호) · 1~2년 60%(2호) · **2년 이상 60%(1호 괄호)** — 어느 구간도 누진이 아니다.
  //
  // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): 2년 이상 분양권이 위 24개월 게이트를 빠져나가
  // `progressive`로 분류됐다. §104⑤2호 그룹 합산에서 누진 자산과 한 그룹이 되면서
  // **그룹 대표세율(60%)이 합산 과세표준 전체에 적용**돼 과세 초과가 발생했다.
  //   실측: 분양권 차익 3억(60%=180,000,000) + 사업용 토지 차익 2억(누진=56,060,000)
  //        → 올바른 §104⑤ = MAX(합산누진 174,060,000, 자산별합 236,060,000) = 236,060,000
  //        → 종전 산출 300,000,000 (= 5억 × 60%). 63,940,000 과세 초과.
  //
  // 조합원입주권(`right_to_move_in`)은 대상이 **아니다** — §104①1호 괄호가 분양권만 지목하고,
  // 2년 이상이면 §55① 누진세율이다(2호·3호는 2년 미만 구간 전용). 현행 분류 유지.
  //
  // 🔒 **이 분기는 load-bearing이다 — 세율 표시용 분류가 아니라 §104⑤ 오합산 방어선이다.**
  //   2년 이상 분양권의 **해당 호는 §104①1호**라 `candidateClauses`가 `["104-1-1"]`이고,
  //   `clauseBucketKey`는 누진 호가 포함되면 세율을 키에서 뺀다(그 규약 자체는 옳다 — 승자
  //   세율은 묶음 판정에 무의미하므로). 그래서 **분양권과 사업용 토지의 버킷 키가 같다.**
  //   두 자산을 같은 `rateGroup`에 넣는 순간 위 63,940,000 결함이 그대로 재발한다.
  //   ⇒ 가드 anchor `presale-clause-1-bucket-guard.anchor.test.ts`(방어선 제거 시 3건 빨개짐).
  if (item.propertyType === "presale_right") {
    return "short_term";
  }

  // 부칙 §9270호 §14①(nblSurchargeExcluded): +10%p가 배제되면 **해당 호 자체가 §104①1호**다
  // (`legal-codes/surcharge-transition.ts:41` 「중과세율 배제 → §104①1호 기본세율」 — 기획재정부
  //  재산세제과-1422 · 서울행정법원 2024구단72950). `calcTax`는 이미 그 판정을 내려 `nblBaseClause`를
  //  `"104-1-1"`로 싣는데(`transfer-tax-rate-calc.ts:380` — Q2/PR#982), **그룹 분류만 따라가지 않아**
  //  같은 §104①1호 자산과 §104⑤2호 버킷을 공유하지 못했다.
  //  실측: [위기취득비사토 3억, 사업용토지 2억, 조정지역3주택 4억] 347,480,000 → 368,120,000
  //        (합산 과세표준 350,000,000이 동일한데 누진이 두 번 태워져 20,640,000 과소).
  //        anchor `aggregate-crisis-nbl-clause-group.anchor.test.ts` C-1 — 대조군 C-2가
  //        「위기취득분을 사업용으로 바꾼 동등 입력」으로 같은 값을 내 도출값을 확증한다.
  //  바로 아래 다주택 축(rateSurchargeStatutoryExcluded)이 **이미 같은 처리**를 하고 있던 좌우 불일치다.
  //
  // ⚠️ 배율 초과분 파트만 비사업용인 자산(주택 등)은 여기 걸리지 않는다 — 그 파트가 중과 배제되면
  //   `surchargeType`이 undefined이고 `item.isNonBusinessLand`도 false라 종전과 동일하게 흐른다.
  //   「배율 초과분 파트가 자산 전체를 §104⑤상 비사업용 토지 자산으로 만드는가」는 **미판정 별건**이다.
  if (
    (result.surchargeType === "non_business_land" || item.isNonBusinessLand) &&
    !result.nblSurchargeExcluded
  ) {
    return "non_business_land";
  }

  const multiHouseByResult =
    result.surchargeType === "multi_house_2" || result.surchargeType === "multi_house_3plus";
  /**
   * 원시 플래그 fallback은 **정밀 판정이 없을 때만** 쓴다 (2026-08-13 F01).
   *
   * `transfer-tax.ts` STEP 3이 이미 「houses[] 정밀 결과가 정본, 없을 때만 원시 fallback」
   * 규약을 구현한다. 여기만 그 규약을 따르지 않아, 단건이 §167의3 배제로 중과를 걷어낸
   * 자산이 다건에서 `multi_house_surcharge` 그룹으로 되살아났다(실측 +122,250,000).
   * `rateGroup`은 §102② 통산 범위·기본공제 배분 우선순위에도 직결되므로 표시용 분류가 아니다.
   */
  const multiHouseByInput =
    result.multiHouseSurchargeEvaluation === undefined &&
    isHousingLike &&
    item.isRegulatedArea &&
    item.householdHousingCount >= 2;
  // 부칙 §9270호 §14①(rateSurchargeStatutoryExcluded): surchargeType은 유지하나 세율 중과 미적용 →
  // §104⑤ 그룹은 progressive로 분류(기존 배제/유예 분류는 불변 — 이 케이스만 좁게 제외).
  if ((multiHouseByResult || multiHouseByInput) && !result.isSurchargeSuspended && !result.rateSurchargeStatutoryExcluded) {
    return "multi_house_surcharge";
  }

  return "progressive";
}

export function monthsBetween(from: Date, to: Date): number {
  const y = to.getFullYear() - from.getFullYear();
  const m = to.getMonth() - from.getMonth();
  const d = to.getDate() - from.getDate();
  return y * 12 + m - (d < 0 ? 1 : 0);
}

// ============================================================
// M-3: 차손 통산 (§102② · 시행령 §167의2)
// ============================================================

export interface AssetRecord {
  item: TransferTaxItemInput;
  /**
   * 정밀 NBL 판정(result.nonBusinessLandJudgmentDetail)으로 교정한 입력.
   * 원시 isNonBusinessLand는 사용자 체크박스라 정밀판정과 어긋날 수 있어,
   * 그룹 분류·세율 재계산은 반드시 이 교정본을 사용한다(사업용 오중과 방지).
   * - correctedItem: classifyRateGroup용 (TransferTaxItemInput)
   * - correctedSingleInput: calcTax용 (TransferTaxInput)
   */
  correctedItem: TransferTaxItemInput;
  correctedSingleInput: TransferTaxInput;
  singleInput: TransferTaxInput;
  result: TransferTaxResult;
  /**
   * §104⑤2호 **비교과세 합산 단위** — 축은 「**호**」다(예규가 확정).
   * ⛔ §102② 통산에 쓰지 말 것 — 그쪽 축은 「**세율**」이라 아래 `lossOffsetRateKey`가 담당한다.
   */
  rateGroup: RateGroup;
  /**
   * 영 §167의2①1호 **「같은 세율을 적용받는 자산」** 판정 키 — `loss-offset-rate-key.ts`.
   * `rateGroup`과 **직교**한다(그 파일 헤더에 조문·실측 근거).
   */
  lossOffsetRateKey: string;
  taxableGain: number;
  lthd: number;
  income: number;
}

export interface LossOffsetOutput {
  lossOffsetTable: LossOffsetRow[];
  lossOffsetFromSame: number[];
  lossOffsetFromOther: number[];
  incomeAfterOffset: number[];
  unusedLoss: number;
}

/**
 * 부동산 다자산 §102② 통산 — **`offsetLossesCore`의 얇은 어댑터**.
 *
 * 2026-08-12: 알고리즘 본체를 `lib/tax-engine/loss-offset-core.ts`(무의존 leaf)로 **추출**했다.
 * 주식 다종목도 같은 통산을 써야 하는데 복제하면 한쪽만 고쳐지는 드리프트가 나기 때문이다
 * (계획서 `stock-102-2-loss-offset-and-103-deduction-order.plan.md` §6.1 설계 A).
 *
 * 여기가 하는 일은 **도메인 ↔ 코어 번역** 둘뿐이다:
 *   - `rateKey` = **`lossOffsetRateKey`** — 부동산의 「같은 세율을 적용받는 자산」 축
 *     (`loss-offset-rate-key.ts`). **주식과 같은 성질**(적용 세율 값)이라 코어가 아니라 호출자가 정한다.
 *     ⛔ **`rateGroup`을 쓰면 안 된다** — 그건 §104⑤2호(비교과세)의 「**호**」 축이라 §102②의
 *        「**세율**」 축과 직교한다. 종전에는 그걸 그대로 써서 70%(미등기)와 70%(주택 1년미만)를
 *        갈라놓고(1호 → 2호), 40·50·60·70%를 한 그룹에 몰아넣었다(2호 → 1호).
 *        실측 세액 영향 각 **5,197,222원**(계획서 `loss-offset-same-rate-axis.plan.md` §5).
 *   - 코어가 돌려주는 **인덱스** 기반 `rows`를 `propertyId` 기반 `LossOffsetRow`로 환원.
 *
 * 거동 고정: `__tests__/tax-engine/transfer-tax-loss-offset-characterization.test.ts` (41건).
 * 추출 전후로 이 파일이 통째로 통과해야 한다.
 */
export function offsetLosses(
  records: AssetRecord[],
  external?: CrossLossExternalAsset[],
): LossOffsetOutput {
  /**
   * 🔴 **크로스 통산(§102① 1호 = 부동산 + 기타자산)** — 외부 행이 있으면 자기 키도 **크로스
   * 축으로 번역**해 한 배열로 돌린다. 번역을 빼면 `prog:104-1-1` ≠ `x:prog-basic`이라
   * 영 §167의2①**1호(같은 세율 먼저)가 죽고 2호(안분)로 떨어진다** — 금액이 달라진다.
   *
   * 외부 행이 **없으면 한 글자도 바뀌지 않는다**(축 번역도 하지 않는다) — 기존 41건의
   * characterization이 그 무영향을 고정한다.
   */
  const cross = external && external.length > 0 ? external : null;
  const ownKey = (r: AssetRecord) =>
    cross ? crossLossOffsetRateKey("real_estate", r.lossOffsetRateKey) ?? r.lossOffsetRateKey
          : r.lossOffsetRateKey;

  const core = offsetLossesCore([
    ...records.map((r) => ({
      income: r.income,
      rateKey: ownKey(r),
      exempt: r.result.isExempt,
    })),
    ...(cross ?? []).map((e) => ({ income: e.income, rateKey: e.rateKey, exempt: e.exempt })),
  ]);

  /** 코어 인덱스 → 표시용 id. 자기 자산 뒤에 외부 행이 붙는 **고정 순서**다. */
  const idAt = (i: number) =>
    i < records.length ? records[i].item.propertyId : (cross ?? [])[i - records.length].id;

  return {
    lossOffsetTable: core.rows.map((row) => ({
      fromPropertyId: idAt(row.from),
      toPropertyId: idAt(row.to),
      amount: row.amount,
      scope: row.scope,
    })),
    // 🔑 외부 행 몫은 **잘라낸다** — 이 신고서의 자산이 아니다.
    lossOffsetFromSame: core.fromSame.slice(0, records.length),
    lossOffsetFromOther: core.fromOther.slice(0, records.length),
    incomeAfterOffset: core.incomeAfterOffset.slice(0, records.length),
    unusedLoss: core.unusedLoss,
  };
}

// ============================================================
// M-4: 기본공제 배분
// ============================================================

/**
 * **한 자산 «내부» 파트 사이의 기본공제 배분** — 세율이 높은 파트부터.
 *
 * ⚠️ **§103②의 자산 간 순서 규칙과는 다른 축이다.** 그 조문은 「해당 과세기간에 **먼저 양도한
 *   자산**의 양도소득금액에서부터」라고 정하는데, 파트들은 **같은 자산이라 양도일이 동일**해
 *   그 규칙으로는 순서가 서지 않는다. ⇒ 배분 이득을 결정하는 **한계세율** 순으로 간다
 *   (memory `feedback_basic_deduction_highest_rate_allocation` — 2026-07-21 확정).
 *
 * 소비자는 둘뿐이다 — 토지·건물 분리취득 파트(`transfer-tax-split-rate.ts`)와
 * 주택·비사업용 파트(`transfer-tax-rental-housing-step.ts`). **단건 엔진 전용**이다.
 *
 * ⛔ 다건(자산 간)에 쓰지 말 것 — 아래 `allocateBasicDeduction`이 §103② 축을 담당한다.
 *   종전에는 한 함수가 두 축을 겸용해, 다건 기본값이 법정 순서가 아닌 채로 굳어 있었다.
 */
export function allocateBasicDeductionAcrossParts(
  parts: { idx: number; income: number; rate: number }[],
  available: number,
): { idx: number; amount: number }[] {
  if (available <= 0 || parts.length === 0) return [];
  const sorted = [...parts].sort((a, b) => b.rate - a.rate || b.income - a.income);
  const result: { idx: number; amount: number }[] = [];
  let remaining = available;
  for (const e of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, e.income);
    if (take > 0) {
      result.push({ idx: e.idx, amount: take });
      remaining -= take;
    }
  }
  return result;
}

/**
 * §103② **법정 배분 순서** — 감면소득금액 「외」에서 먼저, 그 안에서 「먼저 양도한 자산」부터.
 *
 * 「소득세법」 §103② (법제처 실독, 시행 2026-01-01):
 *   「… 양도소득금액에 … **감면소득금액이 있는 경우에는 그 감면소득금액 외의 양도소득금액에서
 *    먼저 공제**하고, 감면소득금액 외의 양도소득금액 중에서는 해당 과세기간에 **먼저 양도한
 *    자산의 양도소득금액에서부터 순서대로 공제**한다.」
 *
 * 🔑 **왜 감면 외가 먼저인가** — §90①의 감면액 산식이 `A × (B − C) / D × E`이고 **`C`가 바로 이
 *   기본공제**다. 공제가 감면대상 양도소득금액(B)에 붙으면 **감면액이 그만큼 줄어든다.**
 *
 * ⛔ **`MAX_BENEFIT`(높은 세율 우선)은 폐지됐다** (2026-09-16 사용자 결정 — 「법문대로」).
 *   법정 순서가 아니었고, 게다가 **자기 이름도 지키지 않았다**: `rateGroup` 우선순위로 먼저
 *   정렬했는데 그 순위가 실효세율과 어긋났다(`short_term` 40%가 `multi_house_surcharge` 72%보다
 *   앞). 실측 880,000·330,000원 과대. 구 세션·구 이력의 `"MAX_BENEFIT"` 값은 아래 `order`가
 *   **양도일 순으로 흡수**한다(별도 마이그레이션 불요).
 *
 * ⚠️ **조문은 감면분 «내부» 순서를 정하지 않는다.** 여기서는 1단계와 같은 순서를 쓴다 —
 *   같은 신고에서 두 단계가 다른 축을 쓰면 설명할 수 없다. (감면액 산식 쪽에서 감면 버킷 간
 *   흡수 순서는 `absorbBasicDeduction`이 「감면율 낮은 것부터」로 따로 정한다 — 그쪽은 §77 계열
 *   단건 산식의 기존 해석이다.)
 */
export function allocateBasicDeduction(
  eligible: {
    idx: number;
    income: number;
    transferDate: Date;
    /**
     * §90①의 **B — 감면대상 양도소득금액**(세액감면형). 없으면 0.
     * 소득공제형(§90②)은 이미 `income`에서 빠져 있다(`taxableAfterReduction`).
     */
    reducibleIncome?: number;
    /**
     * 한계세율 — **동순위 tie-break 전용**(§103②이 침묵하는 자리. 아래 `order` 참조).
     * 배분 «순서»를 정할 뿐 금액 계산에는 쓰이지 않는다.
     */
    rate?: number;
  }[],
  available: number,
  strategy: "FIRST" | "EARLIEST_TRANSFER",
): { idx: number; amount: number }[] {
  if (available <= 0 || eligible.length === 0) return [];

  /**
   * 🔑 **§103②은 「같은 날 양도한 자산」 사이의 순서를 정하지 않는다.**
   *
   * 그대로 두면 stable sort가 **입력 순서**로 떨어져 같은 사안의 세액이 목록 순서에 따라
   * 갈린다 — 이 저장소가 반복해서 고쳐 온 결함이다(§104⑤ 그룹 대표 순서 의존 등).
   * ⇒ 조문이 비워 둔 자리에 **결정적 기준**을 둔다: 한계세율 내림차순 → idx.
   *   단건의 파트 축(`allocateBasicDeductionAcrossParts`)과 **같은 기준**이라 경로 간
   *   같은 사안이 같은 값을 낸다. 실측 고정: T-M17「입력 순서 무관 — [50,40] === [40,50]」.
   */
  const order =
    strategy === "FIRST"
      ? [...eligible].sort((a, b) => a.idx - b.idx)
      : [...eligible].sort(
          (a, b) =>
            a.transferDate.getTime() - b.transferDate.getTime() ||
            (b.rate ?? 0) - (a.rate ?? 0) ||
            a.idx - b.idx,
        );

  /** 감면분은 income을 넘을 수 없다 — 차손 통산으로 income이 줄어든 자산이 있다. */
  const reducibleOf = (e: (typeof eligible)[number]) =>
    Math.min(e.income, Math.max(0, e.reducibleIncome ?? 0));

  const byIdx = new Map<number, number>();
  /** **흡수 순서**를 그대로 보존한다 — 1단계(감면 외)가 먼저 나와야 조문 순서로 읽힌다. */
  const absorbOrder: number[] = [];
  let remaining = available;
  /** 한 단계를 소진 순서대로 훑는다 — `sliceOf`가 그 단계에서 흡수 가능한 몫을 준다. */
  const sweep = (sliceOf: (e: (typeof eligible)[number]) => number) => {
    for (const e of order) {
      if (remaining <= 0) return;
      const take = Math.min(remaining, sliceOf(e));
      if (take > 0) {
        if (!byIdx.has(e.idx)) absorbOrder.push(e.idx);
        byIdx.set(e.idx, (byIdx.get(e.idx) ?? 0) + take);
        remaining -= take;
      }
    }
  };

  sweep((e) => e.income - reducibleOf(e)); // 1단계 — 감면소득금액 «외»
  sweep((e) => reducibleOf(e));            // 2단계 — 감면소득금액

  return absorbOrder.map((idx) => ({ idx, amount: byIdx.get(idx)! }));
}

export function applyGeneralProgressive(taxBase: number, rates: TaxRatesMap): number {
  if (taxBase <= 0) return 0;
  const { brackets } = parseRatesFromMap(rates);
  return calculateProgressiveTax(taxBase, brackets);
}
