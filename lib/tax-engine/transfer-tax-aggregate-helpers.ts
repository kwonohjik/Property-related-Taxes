/**
 * 양도소득세 다건 합산 엔진 헬퍼 (Layer 2 — Internal helpers)
 *
 * `transfer-tax-aggregate.ts` 가 800줄 정책을 초과하여 헬퍼 영역을 분리.
 * 외부 소비자는 본체(`./transfer-tax-aggregate`)에서 재수출되는 심볼(`classifyRateGroup` 등)을 사용한다.
 */

import {
  calcTax,
  parseRatesFromMap,
  type TransferTaxInput,
  type TransferTaxResult,
} from "./transfer-tax";
import { calculateProgressiveTax } from "./tax-utils";
import { resolveSplitAwareTax } from "./transfer-tax-split-rate";
import type { SplitRatePart } from "./transfer-tax-split-rate";
import { clauseBucketKey } from "./transfer-tax-rate-calc";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type {
  RateGroup,
  TransferTaxItemInput,
  AggregateTransferInput,
  GroupTaxResult,
  LossOffsetRow,
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

  const acqDate =
    item.acquisitionCause === "inheritance" && item.decedentAcquisitionDate
      ? item.decedentAcquisitionDate
      : item.acquisitionCause === "gift" && item.donorAcquisitionDate
        ? item.donorAcquisitionDate
        : item.acquisitionDate;
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
  const multiHouseByInput =
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
  rateGroup: RateGroup;
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

export function offsetLosses(records: AssetRecord[]): LossOffsetOutput {
  const n = records.length;
  const fromSame: number[] = new Array(n).fill(0);
  const fromOther: number[] = new Array(n).fill(0);
  const table: LossOffsetRow[] = [];

  const byGroup = new Map<RateGroup, number[]>();
  records.forEach((r, i) => {
    if (r.result.isExempt) return;
    const list = byGroup.get(r.rateGroup) ?? [];
    list.push(i);
    byGroup.set(r.rateGroup, list);
  });

  const remainingLossByGroup = new Map<RateGroup, number>();
  const remainingGainByAsset: number[] = records.map((r) => (r.result.isExempt ? 0 : Math.max(0, r.income)));

  for (const [group, idxList] of byGroup) {
    const gainIdx = idxList.filter((i) => records[i].income > 0);
    const lossIdx = idxList.filter((i) => records[i].income < 0);
    const totalGain = gainIdx.reduce((s, i) => s + records[i].income, 0);
    const totalLossAbs = lossIdx.reduce((s, i) => s + Math.abs(records[i].income), 0);
    const offsetPool = Math.min(totalGain, totalLossAbs);

    if (offsetPool > 0 && totalGain > 0) {
      let distributed = 0;
      gainIdx.forEach((gi, pos) => {
        const isLast = pos === gainIdx.length - 1;
        const share = isLast
          ? offsetPool - distributed
          : Math.floor((records[gi].income * offsetPool) / totalGain);
        if (share > 0) {
          fromSame[gi] += share;
          remainingGainByAsset[gi] -= share;
          let lossShareRemaining = share;
          lossIdx.forEach((li, lpos) => {
            const isLastLoss = lpos === lossIdx.length - 1;
            const fromThis = isLastLoss
              ? lossShareRemaining
              : Math.min(
                  lossShareRemaining,
                  Math.floor((Math.abs(records[li].income) * share) / totalLossAbs),
                );
            if (fromThis > 0) {
              table.push({
                fromPropertyId: records[li].item.propertyId,
                toPropertyId: records[gi].item.propertyId,
                amount: fromThis,
                scope: "same_group",
              });
              lossShareRemaining -= fromThis;
            }
          });
        }
        distributed += share;
      });
    }

    remainingLossByGroup.set(group, totalLossAbs - offsetPool);
  }

  const totalRemainingLoss = [...remainingLossByGroup.values()].reduce((s, v) => s + v, 0);
  const totalRemainingGain = remainingGainByAsset.reduce((s, v) => s + v, 0);
  const offsetPool2 = Math.min(totalRemainingLoss, totalRemainingGain);

  if (offsetPool2 > 0 && totalRemainingGain > 0) {
    const lossGroups = [...remainingLossByGroup.entries()].filter(([, v]) => v > 0);
    const gainIndices = remainingGainByAsset
      .map((g, i) => ({ i, g }))
      .filter((x) => x.g > 0);

    let consumedGain = 0;
    gainIndices.forEach((gx, pos) => {
      const isLast = pos === gainIndices.length - 1;
      const share = isLast
        ? offsetPool2 - consumedGain
        : Math.floor((gx.g * offsetPool2) / totalRemainingGain);
      if (share > 0) {
        fromOther[gx.i] += share;
        let remainingShare = share;
        lossGroups.forEach(([lossGroup, lossGroupRemain], lgPos) => {
          if (lossGroupRemain <= 0) return;
          const isLastGroup = lgPos === lossGroups.length - 1;
          const fromThisGroup = isLastGroup
            ? remainingShare
            : Math.min(
                remainingShare,
                Math.floor((lossGroupRemain * share) / totalRemainingLoss),
              );
          if (fromThisGroup > 0) {
            const lossIdxInGroup = records
              .map((r, i) => ({ i, r }))
              .filter((x) => x.r.rateGroup === lossGroup && x.r.income < 0);
            const groupLossTotal = lossIdxInGroup.reduce((s, x) => s + Math.abs(x.r.income), 0);
            let distributed = 0;
            lossIdxInGroup.forEach((lx, lpos) => {
              const isLastAsset = lpos === lossIdxInGroup.length - 1;
              const fromThisAsset = isLastAsset
                ? fromThisGroup - distributed
                : Math.floor((Math.abs(lx.r.income) * fromThisGroup) / groupLossTotal);
              if (fromThisAsset > 0) {
                table.push({
                  fromPropertyId: lx.r.item.propertyId,
                  toPropertyId: records[gx.i].item.propertyId,
                  amount: fromThisAsset,
                  scope: "other_group",
                });
                distributed += fromThisAsset;
              }
            });
            remainingShare -= fromThisGroup;
          }
        });
      }
      consumedGain += share;
    });
  }

  const unusedLoss = totalRemainingLoss - offsetPool2;

  const incomeAfterOffset = records.map((r, i) => {
    if (r.result.isExempt) return 0;
    if (r.income < 0) return 0;
    return Math.max(0, r.income - fromSame[i] - fromOther[i]);
  });

  return {
    lossOffsetTable: table,
    lossOffsetFromSame: fromSame,
    lossOffsetFromOther: fromOther,
    incomeAfterOffset,
    unusedLoss,
  };
}

// ============================================================
// M-4: 기본공제 배분
// ============================================================

export function allocateBasicDeduction(
  eligible: { idx: number; rateGroup: RateGroup; income: number; transferDate: Date; rate: number }[],
  available: number,
  strategy: "MAX_BENEFIT" | "FIRST" | "EARLIEST_TRANSFER",
): { idx: number; amount: number }[] {
  if (available <= 0 || eligible.length === 0) return [];

  let sorted: typeof eligible;
  if (strategy === "FIRST") {
    // 입력 순서 우선 — 목록 첫 번째 자산(idx 오름차순). 양도일 순(EARLIEST_TRANSFER)과 구분.
    sorted = [...eligible].sort((a, b) => a.idx - b.idx);
  } else if (strategy === "EARLIEST_TRANSFER") {
    sorted = [...eligible].sort((a, b) => a.transferDate.getTime() - b.transferDate.getTime());
  } else {
    const groupPriority: Record<RateGroup, number> = {
      unregistered: 5,
      short_term: 4,
      multi_house_surcharge: 3,
      non_business_land: 2,
      progressive: 1,
    };
    sorted = [...eligible].sort((a, b) => {
      const dg = (groupPriority[b.rateGroup] ?? 0) - (groupPriority[a.rateGroup] ?? 0);
      if (dg !== 0) return dg;
      // 동일 그룹 내: 적용세율 높은 자산에 기본공제 우선 배분 (세액 절감 최대 = MAX_BENEFIT).
      // short_term 그룹에 1년 미만 50% + 1~2년 40%가 섞인 경우 등 순서 의존 제거.
      const dr = b.rate - a.rate;
      if (dr !== 0) return dr;
      return b.income - a.income;
    });
  }

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

// ============================================================
// M-5: 세율군별 집계 + 세율 적용
// ============================================================

export function aggregateByGroup(
  records: AssetRecord[],
  incomeAfterOffset: number[],
  allocatedBasic: number[],
  rates: TaxRatesMap,
): {
  groupTaxes: GroupTaxResult[];
  /**
   * 파트가 있는 자산(토지·건물 분리취득 · 한 필지 중 일부만 비사업용)의 **자산 단독 세액**.
   * 파트가 없는 자산은 `undefined`.
   *
   * `PerPropertyBreakdown.refCalculatedTax`가 쓴다 — 그 필드의 종전 산식
   * `taxBaseShare × (appliedRate + surchargeRate)`은 파트 자산에서 `appliedRate`가
   * **파트 최고세율**이라 자산 과세표준 전체에 곱해지면 과대해진다(계획서 §4.12).
   *
   * ❌ 이것은 **그룹 세액의 역안분이 아니다.** `refCalculatedTax`는 **자산 단독 참고값**이고
   *   `Σ ref ≠ 그룹 세액`은 비교과세의 본질이다(타입 문서가 「비교과세 적용 시 합산값과
   *   차이 가능」으로 명시). 예정신고는 자산별, §104⑤는 확정신고에서 전체에 적용된다.
   */
  assetPartTax: { tax: number; note?: string }[];
} {
  const groupMap = new Map<RateGroup, number[]>();
  records.forEach((r, i) => {
    if (r.result.isExempt) return;
    const list = groupMap.get(r.rateGroup) ?? [];
    list.push(i);
    groupMap.set(r.rateGroup, list);
  });

  const out: GroupTaxResult[] = [];
  const assetPartTax: { tax: number; note?: string }[] = [];
  const parsedRates = parseRatesFromMap(rates);
  /**
   * 자산 1건의 산출세액 — 토지·건물 취득일이 다른 split 자산은 파트별 세율 + §104⑤ 비교과세.
   * 단건 엔진(`transfer-tax.ts` STEP 7)과 **같은 헬퍼**를 쓴다(이중 진실 방지).
   */
  const assetTaxOf = (i: number) => {
    const assetTaxBase = Math.max(0, incomeAfterOffset[i] - allocatedBasic[i]);
    const tr = resolveSplitAwareTax({
      taxBase: assetTaxBase,
      transferIncome: incomeAfterOffset[i],
      basicDeduction: allocatedBasic[i],
      splitDetail: records[i].result.splitDetail,
      parsedRates,
      taxRateInput: records[i].correctedSingleInput,
    });
    // 파트가 있는 자산만 **자산 단독 세액**을 기록한다(§4.12 — 표시 정확화용).
    // 자산은 그룹 하나에만 속하므로 이 대입은 자산당 1회다.
    if (tr.splitPartDetail) assetPartTax[i] = { tax: tr.calculatedTax, note: tr.shortTermNote };
    return {
      tax: tr.calculatedTax,
      rate: tr.appliedRate,
      surcharge: tr.surchargeRate,
      /** 자산 단위 과세표준 — 파트가 없는 자산은 이 값이 곧 파트 과세표준이다. */
      taxBase: assetTaxBase,
      /**
       * 자산 단위 「**해당** 호 후보 전부」 — §104⑤ 합산 단위 키(Q2·Q3).
       * `rateClause`(승자)는 그룹핑에 쓰지 않는다 — 「해당 호는 같은데 승자만 갈린」 자산이
       * 나뉘고, 반대로 「해당 호는 다른데 승자만 같은」 자산이 합쳐진다(계획서 E-2).
       */
      candidateClauses: tr.candidateClauses,
      /**
       * §104⑤ 합산 단위인 **파트 목록**(있으면).
       * 본문 후단이 「각각을 **별개의 자산**으로 보아」라고 정하므로, 자산 하나가 둘 이상의
       * 호에 걸치면(토지·건물 분리취득 · 한 필지 중 일부만 비사업용) **파트가 곧 합산 단위**다.
       * ⚠️ 파트를 자산 단위 합산 1회로 되돌리면 그 분해가 사라진다 — 특히 부분 비사토는
       *   `calcTax`가 곧바로 폐기된 모델 A를 내므로 P8 정정이 무효화된다(D-12).
       */
      parts: tr.splitPartDetail?.parts,
    };
  };
  for (const [group, idxList] of groupMap) {
    const groupGrossGain = idxList
      .filter((i) => records[i].income > 0)
      .reduce((s, i) => s + records[i].income, 0);
    const groupGrossLoss = idxList
      .filter((i) => records[i].income < 0)
      .reduce((s, i) => s + Math.abs(records[i].income), 0);
    const groupIncomeAmount = idxList.reduce((s, i) => s + incomeAfterOffset[i], 0);
    const groupBasicDeduction = idxList.reduce((s, i) => s + allocatedBasic[i], 0);
    const groupTaxBase = Math.max(0, groupIncomeAmount - groupBasicDeduction);

    let groupCalculatedTax: number;
    let appliedRate: number;
    let surchargeRate: number | undefined;
    let progressiveDeduction: number;

    if (group === "short_term") {
      // §104⑤2호 — 합산 단위는 예규가 확정한 **「제104조 각 호별로 합산한 자산」**이다
      // (「기획재정부 재산세제과-536」 2018.6.19. · 국세청 「기준-2018-법령해석재산-0098」
      //  [법령해석과-1715] 2018.6.21.). ⇒ **해당 호 집합이 같은 자산끼리** 버킷으로 묶어
      // 합산 1회, 다르면 각자 계산한다. 누진 호 분기는 P12가 이미 같은 규약으로 옮겼다.
      //
      // 단서(「동일한 호의 세율이 적용되고, 그 **적용세율이 둘 이상**인 경우 … 각 해당 호별
      // 세율을 적용해 **큰 산출세액**」)의 MAX는 `calcTax`가 합산 과세표준에 대해 내부에서
      // 수행한다(§104①·⑦ 후단) — 신규 세율 로직이 필요 없다. 교재 사례2(D-11)가 이 경로다.
      //
      // 2026-08-02 **Q2**(계획서 `transfer-rate-clause-candidates.plan.md` §3 — **세액 변경**):
      //   종전 `uniformRate || sameRateClause` **전부-아니면-전무** 판정을 폐기했다. 누수 3가지:
      //   ⓐ `sameRateClause`(구 `rateClauseKeyOf`)는 단기 밴드·다주택 밴드만 봐 **§104①8호
      //      (비사업용 토지) 축이 통째로 없었다** → 비사토와 사업용 토지가 같은 키가 되고
      //      합산 대표가 **입력 첫 자산**이라 순서 의존:
      //      `[비사토 3억, 사업용 2억]` 224,060,000 ↔ 반전 200,000,000 (도출 204,060,000).
      //   ⓑ `uniformRate`는 **적용세율**만 봤다 — 비사토가 §104① 후단에서 단기세율로 이기면
      //      사업용과 세율이 같아져 후보 집합이 달라도 합쳐졌다(174,060,000 ↔ 160,000,000).
      //   ⓒ 키가 하나라도 다르면 **그룹 전체**가 자산별 합으로 떨어져 같은 호끼리의 합산까지
      //      끊겼다 — 누진 호 분기의 D-12와 같은 성질이다(P12가 그쪽을 먼저 고쳤다).
      // 2026-08-02 **P13**(계획서 `transfer-104-5-short-term-part-bucket.plan.md` — **세액 변경**):
      //   버킷 멤버가 **자산**이라, 파트가 있는 자산(토지·건물 분리취득 · 한 필지 중 일부만
      //   비사업용)은 통째로 `solo`로 빠져 **같은 호인 다른 자산과 합산되지 않았다**.
      //     실측 `[split 주택, 단순 주택]` 409,060,000 → **432,060,000**(과소 23,000,000).
      //   ⭐ 도출값은 추정이 아니다 — **파트가 없는 동등 입력**(과세표준 합계·해당 호 동일)에
      //     현행 엔진이 **이미** 432,060,000을 냈다. 「split이라는 이유만으로」 빠지던 것이다.
      //   누진 호 분기는 P12가 이미 파트를 버킷 멤버로 풀었다(D-7 51,000,000 · D-12 23,400,000)
      //   — `short_term`이 **같은 결함의 마지막 조각**이었다.
      const perAsset = idxList.map((i) => assetTaxOf(i));
      /**
       * §104⑤ 합산 단위 — 파트가 있으면 그 파트들, 없으면 자산 자체가 파트 1개다.
       * 근거: §104⑤ 본문 **후단**(「각각을 **별개의 자산**으로 보아」) + 예규(「"자산별" =
       * 각 호별로 합산한 자산」). 누진 호 분기와 **같은 형태**다.
       */
      const stParts = perAsset.flatMap((a, n) =>
        a.parts
          ? a.parts.map((p) => ({
              taxBase: p.taxBase,
              calculatedTax: p.calculatedTax,
              appliedRate: p.appliedRate,
              candidateClauses: p.candidateClauses,
              // ⚠️ 파트가 **실어 보낸 입력**을 그대로 쓴다. 재구성하면 dual-truth다 — 토지 파트는
              //   `buildLandRateInput`으로 §104② 기산일을 확정했고, 비사업용 파트는
              //   `nonBusinessLandAreaRatio`를 1로 되돌린 입력이다.
              rateInput: p.rateInput,
            }))
          : [
              {
                taxBase: a.taxBase,
                calculatedTax: a.tax,
                appliedRate: a.rate,
                candidateClauses: a.candidateClauses,
                rateInput: records[idxList[n]].correctedSingleInput,
              },
            ],
      );
      const buckets = new Map<string, typeof stParts>();
      stParts.forEach((p, i) => {
        const k = clauseBucketKey(p.candidateClauses, p.appliedRate, i);
        buckets.set(k, [...(buckets.get(k) ?? []), p]);
      });
      groupCalculatedTax = 0;
      appliedRate = 0;
      for (const bucket of buckets.values()) {
        if (bucket.length === 1) {
          groupCalculatedTax += bucket[0].calculatedTax;
          appliedRate = Math.max(appliedRate, bucket[0].appliedRate); // 표시용 최고세율
          continue;
        }
        // 합산 과세표준 × 세율로 **1회 floor** — 파트별 floor 합산은 floor 횟수 차이로 ±N원
        // 어긋난다(일괄양도 일체과세 70% 사례 28이 이 경로다).
        //
        // 버킷이 그룹 전체면 `mergedBase === groupTaxBase`다(종전 경로와 동일) —
        // `allocateBasicDeduction`이 `take = min(remaining, income)`으로 배분해
        // `allocatedBasic[i] ≤ incomeAfterOffset[i]`이고, 파트 과세표준의 합은 자산 과세표준과
        // 같다(`computeSplitPartTax:286`가 어긋나면 `null`을 반환해 파트를 만들지 않는다).
        const mergedBase = bucket.reduce((s, p) => s + p.taxBase, 0);
        const tr = calcTax(mergedBase, parsedRates, bucket[0].rateInput);
        groupCalculatedTax += tr.calculatedTax;
        appliedRate = Math.max(appliedRate, tr.appliedRate);
      }
      surchargeRate = undefined;
      progressiveDeduction = 0;
    } else {
      // 누진세율 호(progressive·multi_house_surcharge·non_business_land) 및 미등기 단일 70%.
      //
      // §104⑤2호 **단서**는 "둘 이상의 자산에 대하여 … **동일한 호**의 세율이 적용되고,
      // 그 적용세율이 둘 이상인 경우"에만 합산 후 호별 세율을 적용하도록 한다.
      // ⇒ 한 그룹 안에서 **적용 호가 갈리면** 단서가 아니라 **본문**(자산별 산출세액 합계)이다.
      //
      // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): `multi_house_surcharge` 그룹은
      // §104⑦**1호**(1세대 2주택 +20%p)와 §104⑦**3호**(1세대 3주택 이상 +30%p)가 **섞일 수 있는데**,
      // 종전에는 `records[idxList[0]]`(입력 첫 자산)의 세율을 그룹 합산 과세표준 전체에 적용했다.
      //   → 3주택 우선 324,060,000 / 2주택 우선 274,060,000 — **입력 순서에 따라 세액이 달라졌다**.
      //   → §104⑤2호 본문 도출값은 280,120,000이다
      //     (3억: 누진 94,060,000 + 30% 90,000,000 / 2억: 누진 56,060,000 + 20% 40,000,000).
      //
      // `short_term` 그룹은 위에서 이미 같은 판정을 하고 있었다(세율 혼재 → 자산별 합) —
      // 누진 호 쪽만 빠져 있던 내부 불일치다. 동일 세율이면 종전대로 합산 1회 floor를 유지한다
      // (자산별 floor 합산은 floor 횟수 차이로 ±N원이 어긋난다).
      //
      // ❌ **재제안 금지 — 「적용세율이 같으면 자산별 합으로 쪼갠다」** (2026-08-02 P11 오류·되돌림)
      //    §104⑤2호 **본문**의 「자산별」이 곧 **호별 합산**이라고 예규가 못박고 있다:
      //      「"자산별"에서 "자산"의 의미는 동법 **제104조 각 호별로 합산한 자산**을 의미」
      //      — 「기획재정부 재산세제과-536」(2018.6.19.) ·
      //        국세청 「기준-2018-법령해석재산-0098」[법령해석과-1715](생산 2018.6.21.)
      //    즉 같은 호 자산의 과세표준 합산은 **단서가 아니라 본문**이며 **무조건**이다.
      //    단서는 그 위에서 「그 자산이 **둘 이상의 호**에 해당해 적용세율이 둘 이상이면
      //    합산액에 **각 해당 호별** 세율을 적용해 **큰** 산출세액을 취한다」를 정한 것이다
      //    (교재 사례2 = ①2호 + ⑦3호 동시 해당 → D-11/P9가 구현).
      //    ⇒ 아래 `mixedTier`(적용 **호**가 갈리는가)가 정확한 판정이다. 자산별 **적용세율**
      //      동일 여부로 쪼개면 과소과세가 된다. 계획서 §D-13.
      // 2026-08-02 **P12 2단계** — 자산이 아니라 **파트**를 호별로 묶는다(계획서 §4.11).
      //   자산 하나가 둘 이상의 호에 걸치면(토지·건물 분리취득 · 한 필지 중 일부만 비사업용)
      //   §104⑤ 본문·후단이 **각각을 별개 자산으로 의제**하므로 **파트가 곧 합산 단위**다.
      //   종전에는 그런 자산이 있으면 `mixedTier`가 켜져 **그룹 전체**가 자산별 합으로 떨어져
      //   같은 호 다른 자산의 합산까지 끊겼다(§D-7 과소 51,000,000 · §D-12 과소 23,400,000).
      //
      // ✅ 2026-08-02 **Q3**로 승패 오염 걱정이 사라졌다 — 묶음 키가 `candidateClauses`
      //   (**해당 호 집합**)라 §104①·⑦ 후단이 어느 쪽을 골랐든 같은 키가 나온다.
      //   `short_term` 분기도 **Q2에서 같은 규약**으로 옮겼다(두 분기가 한 규칙을 공유한다).
      const perAsset = idxList.map((i) => assetTaxOf(i));
      /** 호별 합산 단위 — 파트가 있으면 그 파트들, 없으면 자산 자체가 파트 1개다. */
      type ClausePart = Pick<SplitRatePart, "taxBase" | "calculatedTax" | "appliedRate"> & {
        /** 묶음 키의 **정본** — §104①·⑦ 후단의 승자가 아니라 「해당 호 집합」이다(Q3). */
        candidateClauses: SplitRatePart["candidateClauses"];
        rateInput: TransferTaxInput;
        surchargeRate?: number;
      };
      const clauseParts: ClausePart[] = perAsset.flatMap((a, n) =>
        a.parts
          ? a.parts.map((p) => ({
              taxBase: p.taxBase,
              calculatedTax: p.calculatedTax,
              appliedRate: p.appliedRate,
              candidateClauses: p.candidateClauses,
              rateInput: p.rateInput,
              surchargeRate: p.surchargeRate,
            }))
          : [
              {
                taxBase: a.taxBase,
                calculatedTax: a.tax,
                appliedRate: a.rate,
                candidateClauses: a.candidateClauses,
                rateInput: records[idxList[n]].correctedSingleInput,
                surchargeRate: a.surcharge,
              },
            ],
      );
      // 묶음 키 — `short_term` 분기·`computeSplitPartTax`와 **같은 규약**(`clauseBucketKey`).
      //
      // 2026-08-02 **Q3** — 종전에는 `rateClause`(**승자**)를 넘겼다. 자산은 2년 이상만 남지만
      //   **파트는 아니다**: 토지를 나중에 취득한 split 주택은 자산이 11년이어도 토지 파트가
      //   17개월이라 §104⑦ 후단이 그 파트에서 발동한다. 그래서 「해당 호는 다른데 승자만 같은」
      //   파트가 합쳐졌다 — 두 자산 다건에서 314,060,000 → **303,620,000**(과대 10,440,000).
      const clauseGroups = new Map<string, ClausePart[]>();
      clauseParts.forEach((p, i) => {
        const k = clauseBucketKey(p.candidateClauses, p.appliedRate, i);
        clauseGroups.set(k, [...(clauseGroups.get(k) ?? []), p]);
      });
      groupCalculatedTax = 0;
      for (const bucket of clauseGroups.values()) {
        if (bucket.length === 1) {
          groupCalculatedTax += bucket[0].calculatedTax;
          continue;
        }
        // 같은 호 → 과세표준을 **합산해 1회** 계산한다(§104⑤2호 본문 · 예규 §1.6-A).
        // 대표 파트의 `rateInput`을 쓴다 — 같은 호라 세율 규칙이 같고, 재구성하면 dual-truth다.
        const mergedBase = bucket.reduce((sum, p) => sum + p.taxBase, 0);
        groupCalculatedTax += calcTax(
          mergedBase,
          parsedRates,
          bucket[0].rateInput,
        ).calculatedTax;
      }
      appliedRate = Math.max(...clauseParts.map((p) => p.appliedRate)); // 표시용 최고세율
      surchargeRate = Math.max(...clauseParts.map((p) => p.surchargeRate ?? 0));
      // 호마다 누진공제가 달라 그룹 단위로 합산 표시할 수 없다(묶음이 하나일 때도 규약 통일).
      progressiveDeduction = 0;
    }

    out.push({
      group,
      assetIds: idxList.map((i) => records[i].item.propertyId),
      groupGrossGain,
      groupGrossLoss,
      groupIncomeAmount,
      groupBasicDeduction,
      groupTaxBase,
      groupCalculatedTax,
      appliedRate,
      surchargeRate,
      progressiveDeduction,
    });
  }

  return { groupTaxes: out, assetPartTax };
}

// ============================================================
// M-6: 전체 누진세율 (방법 A)
// ============================================================

export function applyGeneralProgressive(taxBase: number, rates: TaxRatesMap): number {
  if (taxBase <= 0) return 0;
  const { brackets } = parseRatesFromMap(rates);
  return calculateProgressiveTax(taxBase, brackets);
}
