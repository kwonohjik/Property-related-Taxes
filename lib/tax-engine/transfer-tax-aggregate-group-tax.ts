/**
 * 다건 집계 **M-5 세율군·호 버킷 산출세액** — `transfer-tax-aggregate-helpers.ts`에서 분리
 * (2026-09-19 F-9 · 800줄 정책). 로직 변경 없이 옮긴 뒤 호 버킷 echo(`clauseTaxes`·`assetClauseKeys`)를
 * 더했다 — 다건 감면 M-8이 §90①을 **호별로** 산정하는 데 쓴다(재산세과-3820).
 *
 * 2026-10-16 **D1 해소**(계획서 `transfer-104-5-clause-bucket-return-wide.plan.md` — **세액 변경**):
 *   호 버킷을 세율군(`rateGroup`) 안에서만 합산하던 경계를 걷고 **신고 전체**에서 합산한다.
 *   세율군은 자산 단독 계산의 **승자**로 정해지므로, 같은 호가 적용되는 파트·자산이 세율군만 달라
 *   합산되지 않았다(배율 초과분 8호 × 다른 세율군의 비사업용 토지 · 부분 비사업용 토지의 1호 파트 ×
 *   사업용 토지). 세율군은 이제 **표시 분류**이고, 그룹 카드 세액은 버킷 세액을 나눠 싣는다.
 */

import { calcTax, parseRatesFromMap, type TransferTaxInput } from "./transfer-tax";
import { resolveSplitAwareTax } from "./transfer-tax-split-rate";
import type { SplitRatePart, SplitPartRateContext } from "./transfer-tax-split-rate";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import { clauseBucketKey } from "./transfer-tax-rate-calc";
import { PROGRESSIVE_RATE_CLAUSES } from "./transfer-tax-rate-clause";
import { safeMultiplyThenDivide } from "./tax-utils";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { RateGroup, GroupTaxResult } from "./types/transfer-aggregate.types";
import type { AssetRecord } from "./transfer-tax-aggregate-helpers";

/** 호 버킷 1개의 산출세액·과세표준 — `aggregateByGroup`의 F-9 echo. */
export interface ClauseTaxEcho {
  /** `clauseBucketKey` 원문 — 예: `104-1-1` · `104-1-10|0.7` · `104-1-2+104-1-8|0.4` */
  key: string;
  tax: number;
  taxBase: number;
}

// ============================================================
// M-5: 세율군별 집계 + 세율 적용
// ============================================================

/**
 * 군 표시용 최고세율 — **과세표준 > 0인 몫**만 후보로 한다.
 *
 * 통산(§102②)·기본공제로 과세표준이 0원이 된 호의 세율은 군 산출세액에 한 푼도 기여하지 않는데,
 * 그 세율이 최고값이면 군 세율로 표시됐다(40% 자산 + 통산으로 0원이 된 70% 자산 → 「70%」).
 * 전부 0원이면 종전대로 전체의 최고세율을 쓴다 — 0원 군도 자기 세율은 보여야 한다.
 * 표시 echo 전용이다: 세액·비교과세 판정은 이 값을 읽지 않는다.
 */
function pickDisplayRate(parts: { taxBase: number; rate: number }[]): number {
  const positive = parts.filter((p) => p.taxBase > 0);
  const pool = positive.length > 0 ? positive : parts;
  return Math.max(0, ...pool.map((p) => p.rate));
}

/** 버킷 세액 안분의 단수를 받을 세율군을 고르는 동률 순서 — 입력 순서와 무관하게 같은 카드 값을 낸다. */
const RATE_GROUP_ORDER: readonly RateGroup[] = [
  "progressive",
  "short_term",
  "multi_house_surcharge",
  "non_business_land",
  "unregistered",
];

/**
 * 세율군을 넘는 버킷의 세액을 **세율군별 과세표준 비율**로 나눈다(표시 전용 — 계획서 D-3).
 * 단수(나머지)는 버킷 안 과세표준이 가장 큰 세율군이 받는다(같으면 `RATE_GROUP_ORDER`).
 * 몫의 합은 항상 버킷 세액이다 ⇒ `Σ 그룹 세액 = calculatedTaxByGroups`.
 */
function allocateBucketTax(
  bucketTax: number,
  bucketBase: number,
  baseByGroup: Map<RateGroup, number>,
): Map<RateGroup, number> {
  if (baseByGroup.size === 1) return new Map([[[...baseByGroup.keys()][0], bucketTax]]);
  const groups = [...baseByGroup.keys()];
  const residual = groups.reduce((best, g) => {
    const d = baseByGroup.get(g)! - baseByGroup.get(best)!;
    return d > 0 || (d === 0 && RATE_GROUP_ORDER.indexOf(g) < RATE_GROUP_ORDER.indexOf(best)) ? g : best;
  });
  const shares = new Map<RateGroup, number>();
  let allocated = 0;
  for (const g of groups) {
    if (g === residual) continue;
    const share = bucketBase > 0 ? safeMultiplyThenDivide(bucketTax, baseByGroup.get(g)!, bucketBase) : 0;
    shares.set(g, share);
    allocated += share;
  }
  shares.set(residual, bucketTax - allocated);
  return shares;
}

export function aggregateByGroup(
  records: AssetRecord[],
  incomeAfterOffset: number[],
  allocatedBasic: number[],
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
   * 버킷이 신고 전체 단위라, 다른 세율군에 있는 배율 초과분 파트도 같은 8호 버킷으로 들어온다.
   * 8호 자산이 없으면 둘 다 0.
   */
  clause8TaxBase: number;
  clause8Tax: number;
  /**
   * §104①**1호**(§55① 일반 누진) 버킷 echo — 8호와 **같은 규약**(버킷 식별자가 정확히 `"104-1-1"`).
   *
   * 🔒 **분양권은 여기 도달하지 않는다.** 분양권 2년+의 해당 호는 1호지만 세율이 단일 60%라
   *   (§104①1호 괄호) 누진 1호 자산과 합산하지 않는다 — 버킷 식별자에 `presale:` 구분자를 붙인다
   *   (아래 `bucketIdOf`). ⇒ 제외 근거는 **새 법령 해석이 아니라 현행 규약 승계**다(계획서 §5-C H-1).
   * ⚠️ 조합원입주권 2년+는 1호 누진이라 **포함되는 것이 맞다**(§104①1호 괄호가 분양권만 지목한다).
   * 1호 버킷이 없으면 둘 다 0.
   */
  clause1BucketTaxBase: number;
  clause1BucketTax: number;
  /**
   * F-9 — **호 버킷별** 산출세액·과세표준 echo. 키는 버킷 식별자(`bucketIdOf` — 분양권 구분자 포함).
   * 다건 감면 M-8이 §90①의 A·D를 **감면 자산이 속한 호**로 잡는 데 쓴다(재산세과-3820).
   */
  clauseTaxes: Map<string, ClauseTaxEcho>;
  /** 자산별로 파트가 속한 호 버킷 식별자(중복 제거). 비과세 자산은 빈 배열. */
  assetClauseKeys: string[][];
} {
  const groupMap = new Map<RateGroup, number[]>();
  const clauseTaxes = new Map<string, ClauseTaxEcho>();
  const assetClauseKeySets = records.map(() => new Set<string>());
  records.forEach((r, i) => {
    if (r.result.isExempt) return;
    const list = groupMap.get(r.rateGroup) ?? [];
    list.push(i);
    groupMap.set(r.rateGroup, list);
  });

  // §104⑤ 크로스 조정용 8호 버킷 누적(위 반환 타입 주석 참조).
  let clause8TaxBase = 0;
  let clause8Tax = 0;
  // §104①1호 버킷(위 반환 타입 주석) — 분양권은 식별자 구분자로 빠진다.
  let clause1BucketTaxBase = 0;
  let clause1BucketTax = 0;
  const assetPartTax: { tax: number; note?: string }[] = [];
  // 자산별 세율(E-14n) — 같은 세율 Map을 공유하는 자산은 한 번만 파싱한다.
  // ⚠️ 신고 단위 세율로 대신하지 말 것 — 연중 시작 행이 있는 해에 자산 세액이 단건과 갈린다.
  const parsedCache = new Map<TaxRatesMap, ReturnType<typeof parseRatesFromMap>>();
  const parsedRatesOf = (assetIdx: number) => {
    const own = records[assetIdx].rates;
    let parsed = parsedCache.get(own);
    if (!parsed) {
      parsed = parseRatesFromMap(own);
      parsedCache.set(own, parsed);
    }
    return parsed;
  };
  const splitCtxOf = (i: number): SplitPartRateContext => ({
    taxBase: Math.max(0, incomeAfterOffset[i] - allocatedBasic[i]),
    transferIncome: incomeAfterOffset[i],
    basicDeduction: allocatedBasic[i],
    splitDetail: records[i].result.splitDetail,
    parsedRates: parsedRatesOf(i),
    taxRateInput: records[i].correctedSingleInput,
    // houses[] 정밀 중과 판정 — 단건 엔진이 낸 **그 판정**을 그대로 넘긴다 (2026-08-13 F01).
    // 빠뜨리면 `calcTax`가 원시 플래그(householdHousingCount·isRegulatedArea)로 중과를
    // **재판정**해 단건이 배제한 중과가 다건에서 되살아난다(optional이라 TS가 못 잡는다).
    multiHouseSurchargeResult: records[i].result.multiHouseSurchargeEvaluation,
    // §155⑳ 특례 적용 자산은 단건 특례 경로와 같은 모델로 계산한다 — 엔진이 슬롯(`income`)에 싣는 과세대상 소득금액을 그대로 넘긴다.
    ...(records[i].result.rentalHousingExceptionDetail?.applied === true
      ? { rentalHousingTaxableIncome: records[i].income }
      : {}),
  });
  /**
   * 자산 1건의 산출세액 — 토지·건물 취득일이 다른 split 자산은 파트별 세율 + §104⑤ 비교과세.
   * 단건 엔진(`transfer-tax.ts` STEP 7)과 **같은 헬퍼**를 쓴다(이중 진실 방지).
   */
  const assetTaxOf = (i: number) => {
    const assetTaxBase = Math.max(0, incomeAfterOffset[i] - allocatedBasic[i]);
    // 1호가 이겨도 파트(배율 초과 비사업용 토지 · 비주택 토지·건물)를 호별 버킷 합산 단위로 남긴다(§104⑤ — 단건은 넘기지 않는다).
    const tr = resolveSplitAwareTax({ ...splitCtxOf(i), aggregateFiling: true });
    // 파트가 있는 자산만 **자산 단독 세액**을 기록한다(§4.12 — 표시 정확화용).
    if (tr.splitPartDetail) assetPartTax[i] = { tax: tr.calculatedTax, note: tr.shortTermNote };
    // 다건 세액은 이 재계산이 정본이다 — 「세율 기산일」 표시 게이트도 이 판정으로 덮는다(D1-3).
    const sd = records[i].result.splitDetail;
    if (sd) sd.partRateBasisApplied = tr.partRateBasisApplied;
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
      bucketFlatRate: tr.bucketFlatRate,
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

  // ── §104⑤2호 합산 단위 — 신고 전체(비과세 제외)의 파트, 파트가 없으면 자산 자체 ──────────
  //
  // 합산 단위는 예규가 확정한 **「제104조 각 호별로 합산한 자산」**이다(「기획재정부 재산세제과-536」
  // 2018.6.19. · 국세청 「기준-2018-법령해석재산-0098」[법령해석과-1715] 2018.6.21.).
  // ⇒ **해당 호 집합이 같은 단위끼리** 버킷으로 묶어 합산 1회, 다르면 각자 계산한다.
  //
  // ❌ **재제안 금지 — 「적용세율이 같으면 자산별 합으로 쪼갠다」** (2026-08-02 P11 오류·되돌림)
  //    같은 호 자산의 과세표준 합산은 §104⑤2호 **단서가 아니라 본문**이며 **무조건**이다.
  //    단서는 그 위에서 「그 자산이 **둘 이상의 호**에 해당해 적용세율이 둘 이상이면 합산액에
  //    **각 해당 호별** 세율을 적용해 **큰** 산출세액을 취한다」를 정한 것이다 — 그 MAX는 `calcTax`가
  //    합산 과세표준에 대해 내부에서 수행한다(§104①·⑦ 후단, 교재 사례2 = D-11/P9). 계획서 §D-13.
  //
  // 이력(전부 **세액 변경**):
  //   · 2026-07-29 #591 R7 — 같은 군 안에서 §104⑦1호(+20%p)·3호(+30%p)가 섞이면 첫 자산 세율을
  //     합산 전체에 적용해 입력 순서 의존(324,060,000 ↔ 274,060,000, 도출 280,120,000).
  //   · 2026-08-02 Q2·Q3 — 묶음 키를 승자 세율·`rateClause`가 아니라 **해당 호 집합**(`candidateClauses`)으로
  //     (비사토 3억 + 사업용 2억 224,060,000 ↔ 200,000,000, 도출 204,060,000 · 314,060,000 → 303,620,000).
  //   · 2026-08-02 P12·P13 — 버킷 멤버를 자산이 아니라 **파트**로(D-7 51,000,000 · D-12 23,400,000 ·
  //     `short_term` 432,060,000). 본문 후단이 파트를 「별개의 자산」으로 의제하므로 파트가 합산 단위다.
  //   · 2026-10-16 D1 — 버킷을 세율군 안이 아니라 **신고 전체**에서(배율 초과분 + 다른 세율군의
  //     비사업용 토지 818,960,000 → 826,219,999). 종전 두 분기(`short_term`·그 외)의 복제 규칙을 하나로 합쳤다.
  type ClausePart = Pick<SplitRatePart, "taxBase" | "calculatedTax" | "appliedRate"> & {
    /** 묶음 키의 **정본** — §104①·⑦ 후단의 승자가 아니라 「해당 호 집합」이다(Q3). */
    candidateClauses: SplitRatePart["candidateClauses"];
    bucketFlatRate: SplitRatePart["bucketFlatRate"];
    /**
     * ⚠️ 파트가 **실어 보낸 입력**을 그대로 쓴다. 재구성하면 dual-truth다 — 토지 파트는
     *   `buildLandRateInput`으로 §104② 기산일을 확정했고, 비사업용 파트는 `nonBusinessLandAreaRatio`를 1로 되돌린 입력이다.
     */
    rateInput: TransferTaxInput;
    surchargeRate?: number;
    /** 파트가 속한 자산의 houses[] 정밀 중과 판정 — 버킷 합산 재계산에 그대로 넘긴다 (F01). */
    mhResult?: MultiHouseSurchargeResult;
    /** 파트가 나온 자산 — 세율군 안분·호 버킷 echo(`assetClauseKeys`)용. */
    assetIdx: number;
  };
  const units: ClausePart[] = [];
  records.forEach((r, i) => {
    if (r.result.isExempt) return;
    const a = assetTaxOf(i);
    const mhResult = r.result.multiHouseSurchargeEvaluation;
    if (a.parts) {
      for (const p of a.parts) {
        units.push({
          taxBase: p.taxBase,
          calculatedTax: p.calculatedTax,
          appliedRate: p.appliedRate,
          candidateClauses: p.candidateClauses,
          bucketFlatRate: p.bucketFlatRate,
          rateInput: p.rateInput,
          surchargeRate: p.surchargeRate,
          mhResult,
          assetIdx: i,
        });
      }
    } else {
      units.push({
        taxBase: a.taxBase,
        calculatedTax: a.tax,
        appliedRate: a.rate,
        candidateClauses: a.candidateClauses,
        bucketFlatRate: a.bucketFlatRate,
        rateInput: r.correctedSingleInput,
        surchargeRate: a.surcharge,
        mhResult,
        assetIdx: i,
      });
    }
  });

  /**
   * 버킷 식별자 — `clauseBucketKey`(`short_term` 분기·`computeSplitPartTax`와 **같은 규약**)에
   * **분양권 구분자**를 더한다.
   *
   * 🔒 **load-bearing** — 분양권 2년+의 해당 호는 §104①1호(괄호 60%)라 후보가 `["104-1-1"]`이고,
   *   `clauseBucketKey`는 누진 호가 포함되면 세율을 키에서 빼므로 **사업용 토지와 키가 같다**.
   *   합치면 합산 과세표준 전체에 대표 자산의 규칙이 적용된다(#591 R7이 고친 63,940,000 —
   *   `presale-clause-1-bucket-guard.anchor.test.ts`). 종전에는 `classifyRateGroup`이 분양권을
   *   `short_term` 세율군으로 보내 막았다 — 버킷이 신고 전체 단위가 되며 그 방어선을 여기로 옮겼다.
   *   ❌ 1호를 「누진/단일」로 나눠 합산할지는 **법령 검토가 선행**이다(현행 규약 승계 — 계획서 §2.1).
   * 구분자는 **누진 호가 들어간 키에만** 붙인다 — 세율이 키에 들어가는 단일세율 호(예: 1년 미만 70%,
   *   주택·조합원입주권·분양권 공통)는 같은 호·같은 세율이므로 종전대로 다른 자산과 합산한다.
   */
  const bucketIdOf = (u: ClausePart, n: number) => {
    const key = clauseBucketKey(u.candidateClauses, u.appliedRate, n, u.bucketFlatRate);
    // 단일세율(`bucketFlatRate`)이 키에 들어간 버킷은 1호 후보가 있어도 «단일세율 호» 버킷이다(Q-F1 α) —
    // 같은 호·같은 세율이므로 다른 자산과 합산한다(아래 주석의 마지막 문단).
    const presaleProgressiveKey =
      records[u.assetIdx].item.propertyType === "presale_right" &&
      u.bucketFlatRate === undefined &&
      (u.candidateClauses ?? []).some((c) => PROGRESSIVE_RATE_CLAUSES.has(c));
    return { key, id: presaleProgressiveKey ? `presale:${key}` : key };
  };
  const buckets = new Map<string, { key: string; members: ClausePart[] }>();
  units.forEach((u, n) => {
    const { key, id } = bucketIdOf(u, n);
    const bucket = buckets.get(id);
    if (bucket) bucket.members.push(u);
    else buckets.set(id, { key, members: [u] });
  });

  /** 세율군별 표시 재료 — 그 세율군이 걸친 버킷과, 버킷 안 그 세율군 몫의 과세표준. */
  const groupTax = new Map<RateGroup, number>();
  const groupTouched = new Map<RateGroup, { bucketBase: number; bucketRate: number; groupBase: number; rep: ClausePart }[]>();
  for (const [id, { key, members }] of buckets) {
    const bucketBase = members.reduce((s, p) => s + p.taxBase, 0);
    let bucketTax: number;
    let bucketRate: number;
    if (members.length === 1) {
      bucketTax = members[0].calculatedTax;
      bucketRate = members[0].appliedRate;
    } else {
      // 같은 호 → 과세표준을 **합산해 1회** 계산한다(§104⑤2호 본문 · 예규). 파트별 floor 합산은 floor 횟수
      // 차이로 ±N원 어긋난다(일괄양도 일체과세 70% 사례 28이 이 경로다).
      // 합산 재계산은 대표 단위(members[0])의 입력·판정을 쓴다 — 같은 호라 세율 규칙이 같고, 세율도 그 자산의 것(E-14n).
      const tr = calcTax(bucketBase, parsedRatesOf(members[0].assetIdx), members[0].rateInput, members[0].mhResult);
      bucketTax = tr.calculatedTax;
      bucketRate = tr.appliedRate;
    }
    clauseTaxes.set(id, { key, tax: bucketTax, taxBase: bucketBase });
    for (const p of members) assetClauseKeySets[p.assetIdx].add(id);

    // §104⑤ **크로스 조정**(부동산 8호 ↔ 주식 9호)용 echo — 본문 후단이 「제1항제8호 및 제9호의 자산은
    // **동일한 자산으로 보고**」라 정하므로 8호 몫을 분리해 내보낸다.
    // 🔒 **식별자가 정확히 `"104-1-8"`인 버킷만** 잡는다(계획서 §5-B **G-2 — 좁은 해석**). 단기(1~2년)
    //   비사토는 후보가 `{104-1-2, 104-1-8}`이라 키가 `"104-1-2+104-1-8|…"`다. 그것까지 8호로 묶으면 세율이
    //   8호 표로 바뀌어 **세액이 오르고** §104⑤2호 단서와도 충돌 소지가 있다 ⇒ 「법 근거 없이 불리 적용 금지」.
    // ⚠️ 세율군 세액으로 대신할 수 없다 — **부분 비사업용 토지**는 한 자산이 8호 파트와 1호 파트로 갈린다.
    if (id === "104-1-8") {
      clause8TaxBase += bucketBase;
      clause8Tax += bucketTax;
    } else if (id === "104-1-1") {
      // §104①1호(일반 누진) — 크로스 조정 레이어가 기타자산 1호와 한 버킷으로 재합산한다.
      clause1BucketTaxBase += bucketBase;
      clause1BucketTax += bucketTax;
    }

    const baseByGroup = new Map<RateGroup, number>();
    for (const p of members) {
      const g = records[p.assetIdx].rateGroup;
      baseByGroup.set(g, (baseByGroup.get(g) ?? 0) + p.taxBase);
    }
    for (const [g, share] of allocateBucketTax(bucketTax, bucketBase, baseByGroup)) {
      groupTax.set(g, (groupTax.get(g) ?? 0) + share);
      const touched = groupTouched.get(g) ?? [];
      touched.push({
        bucketBase,
        bucketRate,
        groupBase: baseByGroup.get(g)!,
        rep: members.find((p) => records[p.assetIdx].rateGroup === g)!,
      });
      groupTouched.set(g, touched);
    }
  }

  const out: GroupTaxResult[] = [];
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
    const groupCalculatedTax = groupTax.get(group) ?? 0;
    const touched = groupTouched.get(group) ?? [];
    const groupParts = units.filter((p) => records[p.assetIdx].rateGroup === group);

    let appliedRate: number;
    let surchargeRate: number | undefined;
    let progressiveDeduction: number;
    if (group === "short_term") {
      // 표시용 최고세율 — 과세표준 > 0인 버킷에서만 고른다(`pickDisplayRate`). 통산으로 0원이 된
      // 70% 자산이 40% 자산의 군 세율을 70%로 덮어 쓰던 결함의 수정이다.
      appliedRate = pickDisplayRate(touched.map((t) => ({ taxBase: t.bucketBase, rate: t.bucketRate })));
      surchargeRate = undefined;
      progressiveDeduction = 0;
    } else {
      /**
       * 버킷이 **하나뿐이면** 그 버킷을 만든 계산이 곧 그룹의 세율·누진공제다 — 표시 메타로 승계한다.
       *
       * 🔴 종전에는 `calcTax`의 `.calculatedTax`만 취하고 `appliedRate`·`progressiveDeduction`을
       *    **버렸다**. 그 자리에 파트별 **standalone 최고세율**과 리터럴 `0`을 실어, 같은 호
       *    두 자산을 합산한 화면이 「적용 호가 둘 이상 · 최고세율 38%」로 표시됐다 —
       *    실제로는 호가 **하나**고 합산 과세표준에 **40%**가 적용됐다(제보 2026-09-16:
       *    399,400,000 × 40% − 25,940,000 = 133,820,000).
       * 파트 타입(`SplitRatePart`)에는 누진공제가 없다 — 그 세율군 몫의 과세표준으로 한 번 더 계산해
       * **메타만** 얻는다. 세액은 건드리지 않고, 아래 항등식 검산이 어긋나면 버린다(세율군을 넘는 버킷의
       * 안분 몫은 대개 단일 산식으로 재현되지 않는다 → 「(호별 합계)」 표시).
       */
      let onlyBucketMeta: { appliedRate: number; progressiveDeduction: number } | undefined;
      if (touched.length === 1) {
        const t = touched[0];
        const tr = calcTax(t.groupBase, parsedRatesOf(t.rep.assetIdx), t.rep.rateInput, t.rep.mhResult);
        onlyBucketMeta = { appliedRate: tr.appliedRate, progressiveDeduction: tr.progressiveDeduction };
      }
      /**
       * 승계한 메타로 **그룹 산출세액을 재현할 수 있을 때만** 채택한다.
       * 재현하지 못하면 표시가 거짓 등식이 되므로 종전 규약(최고세율 · 0)으로 남긴다 —
       * 그때는 소비부가 「단일 산식으로 표시할 수 없다」로 분기한다(PR #1640).
       */
      const metaReproducesTax =
        onlyBucketMeta !== undefined &&
        Math.floor(groupTaxBase * onlyBucketMeta.appliedRate) - onlyBucketMeta.progressiveDeduction ===
          groupCalculatedTax;
      // 버킷이 둘 이상이면 호마다 누진공제가 달라 그룹 단위로 합산 표시할 수 없다 — 0을 유지한다.
      appliedRate = metaReproducesTax
        ? onlyBucketMeta!.appliedRate
        : pickDisplayRate(groupParts.map((p) => ({ taxBase: p.taxBase, rate: p.appliedRate }))); // 표시용 최고세율
      // 중과분도 **세율과 같은 후보 집합**에서 고른다 — 다른 호에서 나오면 `+N%p`가 거짓이 된다.
      surchargeRate = pickDisplayRate(groupParts.map((p) => ({ taxBase: p.taxBase, rate: p.surchargeRate ?? 0 })));
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
