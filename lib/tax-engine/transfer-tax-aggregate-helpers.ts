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
import type { ReducibleAfterLoss } from "./transfer-tax-aggregate-reducible-loss-share";
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
  // ℹ️ 2026-10-16 D1 해소 이후 세율군은 §104⑤ 합산 경계가 아니다 — 호 버킷은 신고 전체에서 합산한다.
  //   2년 이상 분양권의 **해당 호는 §104①1호**라 `candidateClauses`가 `["104-1-1"]`이고 사업용 토지와
  //   버킷 키가 같으므로, 위 63,940,000 결함의 방어선은 이제 `transfer-tax-aggregate-group-tax.ts`
  //   `bucketIdOf`의 **분양권 구분자**다(가드 anchor `presale-clause-1-bucket-guard.anchor.test.ts`).
  //   이 분기는 세율군 카드 표시(단일세율 군)를 위해 남긴다.
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
   * 이 자산을 계산한 세율 — **그 자산의 양도일**로 고른 행(E-14n · 단건 route와 같은 기준).
   * M-5가 자산 세액을 다시 낼 때 이 값을 쓴다. 신고 단위 단계(§103 · §104⑤1호)는 집계 인자 `rates`를 쓴다.
   */
  rates: TaxRatesMap;
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
  /**
   * 차손 통산을 **파트 단위**로 할 비주택 토지·건물 split 자산의 파트 행(Q-F3a — `splitPartsForLossOffset`).
   * 영 §167의2① 「같은 세율을 적용받는 자산」을 파트마다 판정한다. 없으면 자산 한 행(`income`·`lossOffsetRateKey`).
   */
  lossParts?: { kind: string; income: number; rateKey: string }[];
  /** `lossParts`의 통산 후 양도소득금액 — 다건 세액이 파트 소득 안분 가중치로 쓴다(`partIncomeWeights`). */
  lossPartIncomeAfterOffset?: number[];
  /**
   * 영 §167의2② — 통산받은 차손 중 감면소득 몫을 뺀 세액감면형 B′(`transfer-tax-aggregate-reducible-loss-share.ts`).
   * 없으면 통산 전 B 그대로다. 감면 단계·§103② 배분·자산별 표시가 모두 이 값을 읽는다(`bucketsOfRecord`).
   */
  reducibleAfterLoss?: ReducibleAfterLoss;
  taxableGain: number;
  lthd: number;
  income: number;
}

export interface LossOffsetOutput {
  lossOffsetTable: LossOffsetRow[];
  lossOffsetFromSame: number[];
  lossOffsetFromOther: number[];
  incomeAfterOffset: number[];
  /** 파트 단위로 통산한 자산의 파트별 통산 후 양도소득금액(그 밖은 `undefined`). */
  partIncomeAfterOffset: (number[] | undefined)[];
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
  const translate = (key: string) => (cross ? crossLossOffsetRateKey("real_estate", key) ?? key : key);

  // 파트 단위 자산(Q-F3a)은 코어에 **파트 행**으로 펼치고 결과를 자산으로 접는다 — 코어(세목 중립)는 그대로다.
  // 행은 **propertyId 순**으로 넘긴다(자산 안 파트 순서는 그대로). 코어의 동률 처리(잔액 1원이 같은 소수부 중 앞 행으로,
  // 그룹은 최초 등장 순)가 입력 순서를 따르면 같은 신고가 순서만 바꿔 1~3원 갈린다(계획서
  // `transfer-split-basic-deduction-units-and-order-rounding.plan.md` §6 — 3건 격자 391·395행).
  const byId = records
    .map((_, i) => i)
    .sort((a, b) => {
      const x = records[a].item.propertyId;
      const y = records[b].item.propertyId;
      return x < y ? -1 : x > y ? 1 : a - b;
    });
  const owner: number[] = [];
  /** 행이 split 자산의 파트이면 그 파트(통산 표 「[a 건물] → [b]」) — 자산 한 행이면 undefined. */
  const partOf: (string | undefined)[] = [];
  const ownRows = byId.flatMap((i) => {
    const r = records[i];
    const parts = r.lossParts && !r.result.isExempt ? r.lossParts : undefined;
    const rows = parts
      ? parts.map((p) => ({ income: p.income, rateKey: translate(p.rateKey), exempt: false }))
      : [{ income: r.income, rateKey: translate(r.lossOffsetRateKey), exempt: r.result.isExempt }];
    rows.forEach((_, n) => {
      owner.push(i);
      partOf.push(parts?.[n].kind);
    });
    return rows;
  });
  const nOwn = ownRows.length;
  const core = offsetLossesCore([
    ...ownRows,
    ...(cross ?? []).map((e) => ({ income: e.income, rateKey: e.rateKey, exempt: e.exempt })),
  ]);
  /** 코어 행 → 자산 인덱스(외부 행은 자기 자산 뒤에 붙는 **고정 순서**). */
  const assetAt = (k: number) => (k < nOwn ? owner[k] : records.length + (k - nOwn));
  const idAt = (i: number) =>
    i < records.length ? records[i].item.propertyId : (cross ?? [])[i - records.length].id;
  /** 🔑 외부 행 몫은 **잘라낸다** — 이 신고서의 자산이 아니다. 파트 행은 자산으로 합친다. */
  const fold = (arr: number[]) => {
    const out = records.map(() => 0);
    arr.slice(0, nOwn).forEach((v, k) => (out[owner[k]] += v));
    return out;
  };
  /**
   * 자산별로 **다른 자산에서** 받은 차손(1호·2호) — 같은 자산 안 파트끼리 주고받은 몫은 뺀다. 그 몫은 자산 양도소득금액(파트 합)에
   * 이미 들어 있어, 넣으면 받은 차손으로 한 번 더 빠진다(§167의2② 감면소득 안분 등). 코어 행은 받은 쪽(gain 행) 몫을 손실 행에
   * 빠짐없이 나눠 싣므로 행 합 = 코어 `fromSame`·`fromOther`다.
   */
  const receivedFromOtherAssets = (scope: "same_group" | "other_group") => {
    const out = records.map(() => 0);
    for (const row of core.rows) {
      if (row.scope !== scope || row.to >= nOwn) continue;
      if (assetAt(row.from) === assetAt(row.to)) continue;
      out[owner[row.to]] += row.amount;
    }
    return out;
  };
  // 같은 자산 쌍·단계의 행은 한 줄로 합친다 — 받는 쪽은 자산 단위, **주는 쪽은 파트까지**(Q-3 「[a 건물] → [b]」).
  // 같은 자산 안 파트끼리의 통산은 표에 싣지 않는다 — 자산 양도소득금액(파트 합)에 이미 들어 있다(계획서 P2 §2.2-3).
  const table = new Map<string, LossOffsetRow>();
  for (const row of core.rows) {
    if (assetAt(row.from) === assetAt(row.to)) continue;
    const fromPropertyId = idAt(assetAt(row.from));
    const toPropertyId = idAt(assetAt(row.to));
    const fromPart = row.from < nOwn ? partOf[row.from] : undefined;
    const k = `${fromPropertyId}\u0000${fromPart ?? ""}\u0000${toPropertyId}\u0000${row.scope}`;
    const prev = table.get(k);
    if (prev) prev.amount += row.amount;
    else
      table.set(k, {
        fromPropertyId,
        ...(fromPart ? { fromPart: fromPart as NonNullable<LossOffsetRow["fromPart"]> } : {}),
        toPropertyId,
        amount: row.amount,
        scope: row.scope,
      });
  }

  return {
    lossOffsetTable: [...table.values()],
    lossOffsetFromSame: receivedFromOtherAssets("same_group"),
    lossOffsetFromOther: receivedFromOtherAssets("other_group"),
    incomeAfterOffset: fold(core.incomeAfterOffset),
    partIncomeAfterOffset: records.map((r, i) =>
      r.lossParts && !r.result.isExempt
        ? core.incomeAfterOffset.slice(0, nOwn).filter((_, k) => owner[k] === i)
        : undefined,
    ),
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

/** §103② 배분 대상 자산 1건 — `allocateBasicDeduction`·`sameDayTieGroups` 공용. */
export interface BasicDeductionEligible {
  idx: number;
  income: number;
  transferDate: Date;
  /**
   * §90①의 **B — 감면대상 양도소득금액**(세액감면형). 없으면 0.
   * 소득공제형(§90②)은 이미 `income`에서 빠져 있다(`taxableAfterReduction`).
   */
  reducibleIncome?: number;
  /**
   * 감면소득의 **감면율별 조각**(감면액 산식과 같은 leaf — `bucketsOf`). 2단계(감면분)를 같은 날 양도한
   * 자산 사이에서 **감면율 낮은 조각부터** 흡수하는 데 쓴다(부동산거래관리과-0893). 없으면 감면율 1 한 조각.
   */
  reducibleBuckets?: { income: number; rate: number }[];
  /**
   * 한계세율 — `tieRank`가 없을 때의 동순위 기본 순서(같은 날 · 같은 감면율).
   * 배분 «순서»를 정할 뿐 금액 계산에는 쓰이지 않는다.
   */
  rate?: number;
}

/** 감면분은 income을 넘을 수 없다 — 차손 통산으로 income이 줄어든 자산이 있다. */
const reducibleOf = (e: BasicDeductionEligible) => Math.min(e.income, Math.max(0, e.reducibleIncome ?? 0));

/** 2단계 흡수 조각 — 자산의 감면분을 감면율별로 펼친다(감면분 상한 안에서, 낮은 율부터). */
function reducibleSlicesOf(e: BasicDeductionEligible): { idx: number; transferDate: Date; rate: number; income: number }[] {
  let cap = reducibleOf(e);
  const declared = e.reducibleBuckets && e.reducibleBuckets.length > 0 ? e.reducibleBuckets : [{ income: cap, rate: 1 }];
  const out: { idx: number; transferDate: Date; rate: number; income: number }[] = [];
  for (const b of [...declared].sort((x, y) => x.rate - y.rate)) {
    const income = Math.min(cap, Math.max(0, b.income));
    if (income <= 0) continue;
    out.push({ idx: e.idx, transferDate: e.transferDate, rate: b.rate, income });
    cap -= income;
  }
  return out;
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
 *   앞). 실측 880,000·330,000원 과대. 구 세션·구 이력의 `"MAX_BENEFIT"` 값은 아래 순서가
 *   **양도일 순으로 흡수**한다(별도 마이그레이션 불요).
 *
 * 🔑 **조문이 침묵하는 두 자리는 국세청 해석으로 채운다** (계획서 `transfer-basic-deduction-same-day-tie.plan.md`):
 *   · **같은 날 양도**(선후 불분명) — 「납세자에게 유리하다고 판단되는 양도자산의 양도소득금액에서부터 순차로
 *     공제」(재일46014-1685, 1997.7.11.). 무엇이 유리한지는 신고 전체 세액으로만 판정되므로 **호출측**
 *     (`calculateTransferTaxAggregate`)이 후보 순서를 평가해 `tieRank`로 넘긴다. 없으면 한계세율 내림차순 → idx.
 *   · **같은 날 감면소득 사이** — 「감면율이 다른 자산을 같은 날 양도하는 경우 … 감면율이 낮은 양도소득금액에서
 *     먼저 공제」(부동산거래관리과-0893, 2011.10.20.). 2단계는 자산이 아니라 **감면율 조각** 단위로 흡수한다.
 *   양도일이 다르면 두 단계 모두 먼저 양도한 자산부터다(감면소득 사이의 순서도 조문 침묵 — 양도일 순 유지).
 */
export function allocateBasicDeduction(
  eligible: BasicDeductionEligible[],
  available: number,
  strategy: "FIRST" | "EARLIEST_TRANSFER",
  /** 같은 날(·같은 감면율) 자산 사이 순위 — 작을수록 먼저. 호출측의 「유리한 순서」 판정 결과다. */
  tieRank?: ReadonlyMap<number, number>,
  /**
   * 2단계(감면분)의 같은 날 **자산 블록** 순위 — 있으면 감면율보다 앞선다(자산 안 조각은 감면율 오름차순 그대로).
   * 조특법 §133 한도 때문에 0893 순서가 불리할 때 호출측이 고른 후보다(계획서 `transfer-basic-deduction-133-cap-order.plan.md`).
   */
  reducibleRank?: ReadonlyMap<number, number>,
): { idx: number; amount: number }[] {
  if (available <= 0 || eligible.length === 0) return [];

  const rateOf = new Map(eligible.map((e) => [e.idx, e.rate ?? 0]));
  /** 동순위 순서 — `tieRank`가 있으면 그것, 없으면 한계세율 내림차순 → idx(T-M17·B-9). */
  const tie = (a: number, b: number) =>
    tieRank
      ? (tieRank.get(a) ?? Number.MAX_SAFE_INTEGER) - (tieRank.get(b) ?? Number.MAX_SAFE_INTEGER) || a - b
      : rateOf.get(b)! - rateOf.get(a)! || a - b;
  const byDate = (a: { transferDate: Date }, b: { transferDate: Date }) =>
    a.transferDate.getTime() - b.transferDate.getTime();

  const stage1 =
    strategy === "FIRST"
      ? [...eligible].sort((a, b) => a.idx - b.idx)
      : [...eligible].sort((a, b) => byDate(a, b) || tie(a.idx, b.idx));
  const stage2 = eligible.flatMap(reducibleSlicesOf);
  const block = (a: number, b: number) =>
    reducibleRank ? (reducibleRank.get(a) ?? Number.MAX_SAFE_INTEGER) - (reducibleRank.get(b) ?? Number.MAX_SAFE_INTEGER) : 0;
  if (strategy === "FIRST") stage2.sort((a, b) => a.idx - b.idx || a.rate - b.rate);
  else stage2.sort((a, b) => byDate(a, b) || block(a.idx, b.idx) || a.rate - b.rate || tie(a.idx, b.idx));

  const byIdx = new Map<number, number>();
  /** **흡수 순서**를 그대로 보존한다 — 1단계(감면 외)가 먼저 나와야 조문 순서로 읽힌다. */
  const absorbOrder: number[] = [];
  let remaining = available;
  const take = (idx: number, room: number) => {
    const t = Math.min(remaining, room);
    if (t <= 0) return;
    if (!byIdx.has(idx)) absorbOrder.push(idx);
    byIdx.set(idx, (byIdx.get(idx) ?? 0) + t);
    remaining -= t;
  };
  for (const e of stage1) if (remaining > 0) take(e.idx, e.income - reducibleOf(e)); // 1단계 — 감면소득금액 «외»
  for (const sl of stage2) if (remaining > 0) take(sl.idx, sl.income);              // 2단계 — 감면소득금액(낮은 율부터)

  return absorbOrder.map((idx) => ({ idx, amount: byIdx.get(idx)! }));
}

/**
 * 기본공제가 **실제로 닿는** 동순위 묶음 — 같은 날 양도한(2단계는 같은 감면율 조각까지 같은) 자산이 둘 이상이고
 * 그 묶음에 들어설 때 공제 잔액이 남아 있는 것만. 묶음이 흡수하는 총액은 묶음 안 순서와 무관하므로
 * 이 판정도 순서와 무관하다. 호출측은 묶음 안 순열만 평가하면 된다(재일46014-1685 — 유리한 순서).
 * `EARLIEST_TRANSFER` 전용이다(`FIRST`는 사용자가 고른 입력 순서).
 */
export function sameDayTieGroups(eligible: BasicDeductionEligible[], available: number): number[][] {
  const groups: number[][] = [];
  let remaining = available;
  /** 같은 (양도일, 감면율) 묶음을 양도일 → 감면율 순으로 훑는다 — 1단계는 감면율 자리가 0이다. */
  const sweep = (items: { time: number; rate: number; idx: number; room: number }[]) => {
    const byKey = new Map<string, { time: number; rate: number; idx: Set<number>; room: number }>();
    for (const it of items) {
      if (it.room <= 0) continue;
      const key = `${it.time}|${it.rate}`;
      const g = byKey.get(key) ?? { time: it.time, rate: it.rate, idx: new Set<number>(), room: 0 };
      g.idx.add(it.idx);
      g.room += it.room;
      byKey.set(key, g);
    }
    for (const g of [...byKey.values()].sort((a, b) => a.time - b.time || a.rate - b.rate)) {
      if (remaining <= 0) return;
      if (g.idx.size > 1) groups.push([...g.idx].sort((a, b) => a - b));
      remaining -= Math.min(remaining, g.room);
    }
  };
  sweep(eligible.map((e) => ({ time: e.transferDate.getTime(), rate: 0, idx: e.idx, room: e.income - reducibleOf(e) })));
  sweep(eligible.flatMap(reducibleSlicesOf).map((sl) => ({ time: sl.transferDate.getTime(), rate: sl.rate, idx: sl.idx, room: sl.income })));
  return groups;
}

/**
 * 기본공제가 닿는 **같은 날 감면소득** 묶음 중 감면율이 서로 다른 것 — 자산 둘 이상 · 감면율 둘 이상.
 * 0893(감면율 낮은 것부터)은 감면액만 보면 언제나 유리하지만, 감면율이 높은 쪽이 조특법 §133 한도에 걸리면 그쪽에서
 * 공제해도 감면이 줄지 않아 불리해진다. 호출측은 이 묶음의 **자산 블록** 순열을 0893 순서 뒤의 후보로 평가한다
 * (사용자 결정 2026-10-16 — 한도 적용 후 세액으로 순서를 정한다). 1단계(감면 외)를 다 흡수하고도 잔액이 남을 때만 닿는다.
 */
export function sameDayReducibleRateGroups(eligible: BasicDeductionEligible[], available: number): number[][] {
  let remaining = available - eligible.reduce((s, e) => s + Math.max(0, e.income - reducibleOf(e)), 0);
  const byDay = new Map<number, { idx: Set<number>; rates: Set<number>; room: number }>();
  for (const sl of eligible.flatMap(reducibleSlicesOf)) {
    const t = sl.transferDate.getTime();
    const g = byDay.get(t) ?? { idx: new Set<number>(), rates: new Set<number>(), room: 0 };
    g.idx.add(sl.idx);
    g.rates.add(sl.rate);
    g.room += sl.income;
    byDay.set(t, g);
  }
  const groups: number[][] = [];
  for (const [, g] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    if (remaining <= 0) break;
    if (g.idx.size > 1 && g.rates.size > 1) groups.push([...g.idx].sort((a, b) => a - b));
    remaining -= Math.min(remaining, g.room);
  }
  return groups;
}

export function applyGeneralProgressive(taxBase: number, rates: TaxRatesMap): number {
  if (taxBase <= 0) return 0;
  const { brackets } = parseRatesFromMap(rates);
  return calculateProgressiveTax(taxBase, brackets);
}

/** 동순위 후보 상한(사용자 결정 Q-2) — 넘으면 묶음마다 「누가 첫째인가」만 평가한다. */
const TIE_CANDIDATE_LIMIT = 24;

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));
}

/**
 * 동순위 묶음의 순서 후보 중 **납세자에게 가장 유리한** 것(재일46014-1685) — 사용자 결정 Q-1:
 * 총 부담(`totalTax`) 최소 → 결정세액 최소 → `order` 순.
 *
 * 후보는 묶음 안 순열이고 `order`로 정렬한 뒤 사전식으로 나열한다 — 세액이 같으면 **먼저 나온 후보**(= `order` 순)를
 * 남긴다. `order`는 호출측이 정한다: 다건은 propertyId 사전순(입력 순서와 무관), 일괄양도는 한계세율 ↓ → 자산 번호 ↑
 * (`AggregateTransferInput.sameDayEqualTaxOrder`).
 * 후보 수가 `TIE_CANDIDATE_LIMIT`을 넘으면 묶음마다 첫째 자산만 바꾸고 나머지는 `order` 순으로 채운다(Q-2).
 *
 * `reducibleGroups`(`sameDayReducibleRateGroups`)가 있으면 그 뒤에 **2단계 자산 블록 순서** 후보를 덧붙인다 —
 * 0893 순서(위 후보들)가 먼저라 세액이 같으면 0893이 남는다. 한도가 안 걸리면 0893이 이미 가장 유리하다(계획서 §2.2 P2).
 */
export function pickFavorableTieRank(
  groups: number[][],
  order: (a: number, b: number) => number,
  evaluate: (candidate: TieCandidate) => { totalTax: number; determinedTax: number },
  reducibleGroups: number[][] = [],
): TieCandidate {
  const ranksOf = (gs: number[][]): Map<number, number>[] => {
    const sorted = gs.map((g) => [...g].sort(order));
    const full = sorted.map((g) => permutations(g));
    const fullCount = full.reduce((n, p) => n * p.length, 1);
    const perGroup =
      fullCount <= TIE_CANDIDATE_LIMIT
        ? full
        : sorted.map((g) => g.map((first) => [first, ...g.filter((x) => x !== first)]));
    let candidates: number[][][] = [[]];
    for (const options of perGroup) {
      candidates = candidates.flatMap((c) => options.map((o) => [...c, o]));
      if (candidates.length > TIE_CANDIDATE_LIMIT) candidates = candidates.slice(0, TIE_CANDIDATE_LIMIT);
    }
    return candidates.map((cand) => {
      const rank = new Map<number, number>();
      for (const order of cand) for (const idx of order) if (!rank.has(idx)) rank.set(idx, rank.size);
      return rank;
    });
  };
  const base: TieCandidate[] =
    groups.length > 0 ? ranksOf(groups).map((tieRank) => ({ tieRank })) : [{}];
  const blocks: TieCandidate[] =
    reducibleGroups.length > 0
      ? ranksOf(reducibleGroups).map((reducibleRank) => ({ tieRank: base[0].tieRank, reducibleRank }))
      : [];
  const candidates = [...base, ...blocks];
  let best = candidates[0];
  let bestScore = evaluate(best);
  for (const cand of candidates.slice(1)) {
    const score = evaluate(cand);
    if (
      score.totalTax < bestScore.totalTax ||
      (score.totalTax === bestScore.totalTax && score.determinedTax < bestScore.determinedTax)
    ) {
      best = cand;
      bestScore = score;
    }
  }
  return best;
}

/** 동순위 후보 — 1단계·같은 감면율 순위(`tieRank`)와 2단계 자산 블록 순위(`reducibleRank` — 있으면 0893 대신). */
export interface TieCandidate {
  tieRank?: ReadonlyMap<number, number>;
  reducibleRank?: ReadonlyMap<number, number>;
}

/**
 * 같은 날 양도한 감면소득의 감면율이 서로 달라 「감면율 낮은 것부터」(부동산거래관리과-0893)가 실제로 작동했는가 —
 * 기본공제가 2단계(감면분)까지 닿았고, 그 날 감면율이 다른 감면 자산이 둘 이상일 때. 계산 과정 문구 전용.
 * `withinAssetOnly` — `FIRST` 전략은 자산끼리는 입력 순서로 배분하고 한 자산 안의 감면율 조각(현금분·채권분)만
 * 감면율 낮은 것부터라(`allocateBasicDeduction` 2단계 정렬), 그 경우는 한 자산 안에서 감면율이 갈릴 때만 참이다.
 */
export function sameDayReducibleRatesDiffer(
  eligible: BasicDeductionEligible[],
  allocation: { idx: number; amount: number }[],
  withinAssetOnly = false,
): boolean {
  const onReducible = allocation.some((a) => {
    const e = eligible.find((x) => x.idx === a.idx);
    return e !== undefined && a.amount > e.income - reducibleOf(e);
  });
  if (!onReducible) return false;
  const ratesByDate = new Map<string, Set<number>>();
  for (const sl of eligible.flatMap(reducibleSlicesOf)) {
    const t = withinAssetOnly ? `asset:${sl.idx}` : `date:${sl.transferDate.getTime()}`;
    ratesByDate.set(t, (ratesByDate.get(t) ?? new Set<number>()).add(sl.rate));
  }
  return [...ratesByDate.values()].some((rates) => rates.size > 1);
}
