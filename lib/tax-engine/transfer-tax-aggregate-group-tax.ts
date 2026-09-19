/**
 * 다건 집계 **M-5 세율군·호 버킷 산출세액** — `transfer-tax-aggregate-helpers.ts`에서 분리
 * (2026-09-19 F-9 · 800줄 정책). 로직 변경 없이 옮긴 뒤 호 버킷 echo(`clauseTaxes`·`assetClauseKeys`)를
 * 더했다 — 다건 감면 M-8이 §90①을 **호별로** 산정하는 데 쓴다(재산세과-3820).
 */

import { calcTax, parseRatesFromMap, type TransferTaxInput } from "./transfer-tax";
import { resolveSplitAwareTax } from "./transfer-tax-split-rate";
import type { SplitRatePart } from "./transfer-tax-split-rate";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import { clauseBucketKey } from "./transfer-tax-rate-calc";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { RateGroup, GroupTaxResult } from "./types/transfer-aggregate.types";
import type { AssetRecord } from "./transfer-tax-aggregate-helpers";

/** 호 버킷 1개의 산출세액·과세표준 — `aggregateByGroup`의 F-9 echo. */
export interface ClauseTaxEcho {
  group: RateGroup;
  /** `clauseBucketKey` 원문 — 예: `104-1-1` · `104-1-10|0.7` · `104-1-2+104-1-8|0.4` */
  key: string;
  tax: number;
  taxBase: number;
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
  /**
   * §104⑤ **크로스 조정**(부동산 §104①8호 ↔ 주식 §104①9호)용 echo — 본문 후단
   * 「제1항제8호 및 제9호의 자산은 **동일한 자산으로 보고**」.
   *
   * 🔒 후보 집합이 **정확히 `{104-1-8}`인 버킷**만이다(계획서 §5-B G-2 — 좁은 해석).
   *   단기 비사토(`{104-1-2, 104-1-8}`)는 제외 — 넓히면 세액이 오르고 §104⑤2호 단서와 충돌한다.
   * ⚠️ `groupTaxes`의 `non_business_land` **그룹으로 대신할 수 없다** — 부분 비사업용 토지는
   *   한 그룹 안에서 8호 파트/1호 파트로 갈린다.
   * 8호 자산이 없으면 둘 다 0.
   */
  clause8TaxBase: number;
  clause8Tax: number;
  /**
   * §104①**1호**(§55① 일반 누진) 버킷 echo — 8호와 **같은 규약**(키가 정확히 `"104-1-1"`).
   *
   * 🔒 **분양권은 여기 도달하지 않는다.** `classifyRateGroup`이 분양권을 보유기간과 무관하게
   *   `short_term`으로 보내고(§104①1호 괄호 60% = 누진이 아니므로), 이 누적은 **`else` 분기
   *   (누진 호)에서만** 일어나기 때문이다. 분양권의 후보는 `["104-1-1"]`이고 `clauseBucketKey`가
   *   누진 호 포함 시 세율을 키에서 빼므로 **키는 `"104-1-1"`로 같다** — 그룹 분리가 유일한
   *   방어선이다(`presale-clause-1-bucket-guard.anchor.test.ts`).
   *   ⇒ 제외 근거는 **새 법령 해석이 아니라 현행 규약 승계**다(계획서 §5-C H-1).
   * ⚠️ 조합원입주권 2년+는 `progressive`·1호 누진이라 **포함되는 것이 맞다**(§104①1호 괄호가
   *   분양권만 지목한다).
   * 1호 버킷이 없으면 둘 다 0.
   */
  clause1BucketTaxBase: number;
  clause1BucketTax: number;
  /**
   * F-9 — **호 버킷별** 산출세액·과세표준 echo. 키는 `${group}|${clauseBucketKey}` —
   * `clauseBucketKey`만으로는 그룹 간에 겹칠 수 있다(분양권 `short_term`의 `104-1-1`).
   * 다건 감면 M-8이 §90①의 A·D를 **감면 자산이 속한 호**로 잡는 데 쓴다(재산세과-3820).
   */
  clauseTaxes: Map<string, ClauseTaxEcho>;
  /** 자산별로 파트가 속한 호 버킷 키(중복 제거). 비과세 자산은 빈 배열. */
  assetClauseKeys: string[][];
} {
  const groupMap = new Map<RateGroup, number[]>();
  const clauseTaxes = new Map<string, ClauseTaxEcho>();
  const assetClauseKeySets = records.map(() => new Set<string>());
  const recordBucket = (
    group: RateGroup,
    key: string,
    parts: { assetIdx: number }[],
    tax: number,
    taxBase: number,
  ) => {
    const id = `${group}|${key}`;
    clauseTaxes.set(id, { group, key, tax, taxBase });
    for (const p of parts) assetClauseKeySets[p.assetIdx].add(id);
  };
  records.forEach((r, i) => {
    if (r.result.isExempt) return;
    const list = groupMap.get(r.rateGroup) ?? [];
    list.push(i);
    groupMap.set(r.rateGroup, list);
  });

  const out: GroupTaxResult[] = [];
  // §104⑤ 크로스 조정용 8호 버킷 누적(위 반환 타입 주석 참조). `short_term` 그룹에는
  // 순수 8호가 생기지 않는다 — 2년 미만 비사토는 후보가 `{104-1-2/3, 104-1-8}`이기 때문이다.
  let clause8TaxBase = 0;
  let clause8Tax = 0;
  // §104①1호 버킷(위 반환 타입 주석) — 분양권은 `short_term` 분기라 여기 오지 않는다.
  let clause1BucketTaxBase = 0;
  let clause1BucketTax = 0;
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
      // houses[] 정밀 중과 판정 — 단건 엔진이 낸 **그 판정**을 그대로 넘긴다 (2026-08-13 F01).
      // 빠뜨리면 `calcTax`가 원시 플래그(householdHousingCount·isRegulatedArea)로 중과를
      // **재판정**해 단건이 배제한 중과가 다건에서 되살아난다(optional이라 TS가 못 잡는다).
      multiHouseSurchargeResult: records[i].result.multiHouseSurchargeEvaluation,
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
              // 파트는 자산 n에서 나왔으므로 그 자산의 정밀 중과 판정을 함께 나른다 (F01).
              mhResult: records[idxList[n]].result.multiHouseSurchargeEvaluation,
              assetIdx: idxList[n],
            }))
          : [
              {
                taxBase: a.taxBase,
                calculatedTax: a.tax,
                appliedRate: a.rate,
                candidateClauses: a.candidateClauses,
                rateInput: records[idxList[n]].correctedSingleInput,
                mhResult: records[idxList[n]].result.multiHouseSurchargeEvaluation,
                assetIdx: idxList[n],
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
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.length === 1) {
          recordBucket(group, bucketKey, bucket, bucket[0].calculatedTax, bucket[0].taxBase);
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
        const tr = calcTax(mergedBase, parsedRates, bucket[0].rateInput, bucket[0].mhResult);
        recordBucket(group, bucketKey, bucket, tr.calculatedTax, mergedBase);
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
        /** 파트가 속한 자산의 houses[] 정밀 중과 판정 — 버킷 합산 재계산에 그대로 넘긴다 (F01). */
        mhResult?: MultiHouseSurchargeResult;
        /** 파트가 나온 자산 — 호 버킷 echo(`assetClauseKeys`)용. */
        assetIdx: number;
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
              mhResult: records[idxList[n]].result.multiHouseSurchargeEvaluation,
              assetIdx: idxList[n],
            }))
          : [
              {
                taxBase: a.taxBase,
                calculatedTax: a.tax,
                appliedRate: a.rate,
                candidateClauses: a.candidateClauses,
                rateInput: records[idxList[n]].correctedSingleInput,
                surchargeRate: a.surcharge,
                mhResult: records[idxList[n]].result.multiHouseSurchargeEvaluation,
                assetIdx: idxList[n],
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
      /**
       * 버킷이 **하나뿐이면** 그 버킷을 만든 계산이 곧 그룹의 세율·누진공제다 — 표시 메타로 승계한다.
       *
       * 🔴 종전에는 `calcTax`의 `.calculatedTax`만 취하고 `appliedRate`·`progressiveDeduction`을
       *    **버렸다**. 그 자리에 파트별 **standalone 최고세율**과 리터럴 `0`을 실어, 같은 호
       *    두 자산을 합산한 화면이 「적용 호가 둘 이상 · 최고세율 38%」로 표시됐다 —
       *    실제로는 호가 **하나**고 합산 과세표준에 **40%**가 적용됐다(제보 2026-09-16:
       *    399,400,000 × 40% − 25,940,000 = 133,820,000).
       *    `GroupTaxResult.progressiveDeduction`은 그때까지 **값이 실린 적이 없었다**.
       */
      let onlyBucketMeta: { appliedRate: number; progressiveDeduction: number } | undefined;
      for (const [bucketKey, bucket] of clauseGroups) {
        const bucketBase = bucket.reduce((sum, p) => sum + p.taxBase, 0);
        let bucketTax: number;
        if (bucket.length === 1) {
          bucketTax = bucket[0].calculatedTax;
          if (clauseGroups.size === 1) {
            // 파트 타입(`SplitRatePart`)에는 누진공제가 없다 — 같은 입력으로 한 번 더 계산해
            // **메타만** 얻는다. 세액은 건드리지 않고, 아래 항등식 검산이 어긋나면 버린다.
            const tr = calcTax(bucketBase, parsedRates, bucket[0].rateInput, bucket[0].mhResult);
            onlyBucketMeta = {
              appliedRate: tr.appliedRate,
              progressiveDeduction: tr.progressiveDeduction,
            };
          }
        } else {
          // 같은 호 → 과세표준을 **합산해 1회** 계산한다(§104⑤2호 본문 · 예규 §1.6-A).
          // 대표 파트의 `rateInput`을 쓴다 — 같은 호라 세율 규칙이 같고, 재구성하면 dual-truth다.
            const tr = calcTax(bucketBase, parsedRates, bucket[0].rateInput, bucket[0].mhResult);
          bucketTax = tr.calculatedTax;
          if (clauseGroups.size === 1) {
            onlyBucketMeta = {
              appliedRate: tr.appliedRate,
              progressiveDeduction: tr.progressiveDeduction,
            };
          }
        }
        recordBucket(group, bucketKey, bucket, bucketTax, bucketBase);
        groupCalculatedTax += bucketTax;

        // §104⑤ **크로스 조정**(부동산 8호 ↔ 주식 9호)용 echo — 본문 후단이 「제1항제8호 및
        // 제9호의 자산은 **동일한 자산으로 보고**」라 정하므로 8호 몫을 분리해 내보낸다.
        //
        // 🔒 **키가 정확히 `"104-1-8"`인 버킷만** 잡는다(계획서 §5-B **G-2 — 좁은 해석**).
        //   단기(1~2년) 비사토는 8호에 **해당은 하나** 후보 집합이 `{104-1-2, 104-1-8}`이라
        //   키가 `"104-1-2+104-1-8"`이고 애초에 `short_term` 그룹에 있다. 그것까지 8호로 묶으면
        //   세율이 8호 표로 바뀌어 **세액이 오르고** §104⑤2호 **단서**(합산액에 각 해당 호별
        //   세율을 적용해 **큰** 것)와도 충돌 소지가 있다 ⇒ 「법 근거 없이 불리 적용 금지」.
        //
        // ⚠️ `groupTaxBase`로 대신할 수 없다 — **부분 비사업용 토지**는 한 그룹 안에서 8호 파트와
        //   1호 파트로 갈린다(실측: 그룹 492,000,000 = 8호 369,000,000 + 1호 123,000,000).
        if (bucketKey === "104-1-8") {
          clause8TaxBase += bucketBase;
          clause8Tax += bucketTax;
        } else if (bucketKey === "104-1-1") {
          // §104①1호(일반 누진) — 크로스 조정 레이어가 기타자산 1호와 한 버킷으로 재합산한다.
          // 8호와 **같은 좁은 규약**(후보 집합이 정확히 그 호 하나)이라 단기·중과가 섞인
          // 버킷(`"104-1-2+104-1-8"` 등)은 자동으로 빠진다.
          clause1BucketTaxBase += bucketBase;
          clause1BucketTax += bucketTax;
        }
      }
      /**
       * 승계한 메타로 **그룹 산출세액을 재현할 수 있을 때만** 채택한다.
       * 재현하지 못하면 표시가 거짓 등식이 되므로 종전 규약(최고세율 · 0)으로 남긴다 —
       * 그때는 소비부가 「단일 산식으로 표시할 수 없다」로 분기한다(PR #1640).
       */
      const metaReproducesTax =
        onlyBucketMeta !== undefined &&
        Math.floor(groupTaxBase * onlyBucketMeta.appliedRate) -
          onlyBucketMeta.progressiveDeduction ===
          groupCalculatedTax;
      // 버킷이 둘 이상이면 호마다 누진공제가 달라 그룹 단위로 합산 표시할 수 없다 — 0을 유지한다.
      appliedRate = metaReproducesTax
        ? onlyBucketMeta!.appliedRate
        : Math.max(...clauseParts.map((p) => p.appliedRate)); // 표시용 최고세율
      surchargeRate = Math.max(...clauseParts.map((p) => p.surchargeRate ?? 0));
      progressiveDeduction = metaReproducesTax ? onlyBucketMeta!.progressiveDeduction : 0;
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

  return {
    groupTaxes: out,
    assetPartTax,
    clause8TaxBase,
    clause8Tax,
    clause1BucketTaxBase,
    clause1BucketTax,
    clauseTaxes,
    assetClauseKeys: assetClauseKeySets.map((set) => [...set]),
  };
}

// ============================================================
// M-6: 전체 누진세율 (방법 A)
// ============================================================
