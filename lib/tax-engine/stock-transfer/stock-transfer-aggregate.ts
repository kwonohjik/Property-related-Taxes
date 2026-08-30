/**
 * 주식 양도소득세 — 다자산 합산 엔진 (Layer 2 — Orchestrator on Orchestrator)
 *
 * 동일 과세기간 내 2건 이상 종목을 양도할 때 §103①(각 호별 연 250만원 **한도**)과
 * §103②(**먼저 양도한 자산부터** 배분)를 반영한다.
 * 기존 단건 엔진(`calculateStockTransferTaxInternal`)을 종목별로 재사용하며,
 * 상위에서 그룹별 기본공제 배분·합산·증권거래세 정보성 echo 합산을 수행.
 *
 * 순수 함수. DB 직접 호출 없음.
 *
 * [800줄 정책 분할 — D-1] stock-transfer-tax.ts(798줄)에서 추출.
 * 외부 import 경로는 stock-transfer-tax.ts의 re-export로 100% 보존(import 무변경).
 */

import type { StockTransferInput, StockTransferResult } from "./types/stock-transfer.types";
import { calculateStockTransferTaxInternal } from "./stock-transfer-tax";
import { floorTen } from "./stock-transfer-helpers";
import { applyStockTaxRate, applyBasicProgressiveRate } from "./stock-transfer-rate-calc";
import { finalizeStockTax } from "./stock-transfer-finalize";
import {
  pickFilingAxisInput,
  stripItemPenalties,
  computeFilingUnitPenalty,
} from "./stock-transfer-aggregate-penalty";
import {
  sumSecuritiesTransactionTax,
  type SecuritiesTransactionTaxTotal,
} from "./securities-transaction-tax";
import { resolveStockCarryover } from "./stock-carryover";
import { offsetLossesCore } from "@/lib/tax-engine/loss-offset-core";
import { resolveStockRateKey } from "./stock-transfer-rate-calc";
import { calculateForeignStockTax } from "./foreign-stock";
import { computeForeignTaxCreditLimits } from "./foreign-tax-credit-limit";
import {
  isForeignStockItem,
  toStockTransferResult,
  type AggregateStockItemInput,
} from "./foreign-stock-aggregate-adapter";

/**
 * §104①11호나목의 「중소기업」 플래그 — 국외주식 입력에는 없는 축이다.
 *
 * 국외주식(§94①3호다목)은 §104①12호로 가고 그 분기는 이 플래그를 보지 않으므로 false로 둔다.
 * (서식 각주가 가리키는 「우리나라 중소기업의 해외상장주식 10%」 경로는 아직 입력이 없다 — 별건.)
 */
function smeFlag(input: AggregateStockItemInput): boolean {
  return isForeignStockItem(input) ? false : input.isSmallMediumEnterprise;
}

// ============================================================
// 다자산 합산 결과 타입
// ============================================================

/**
 * §104⑤ 비교과세 — **기타자산(§94①4호) 그룹** echo.
 *
 * ⚠️ 주식(§94①3호 가·나목)은 §104⑤ 대상이 **아니다** — 본문이 「제94조제1항제1호ㆍ제2호 및
 *   **제4호**에서 규정한 자산」으로 3호를 뺐다. 그래서 이 값은 기타자산 그룹만 본다.
 */
export interface OtherAssetComparativeTax {
  /** §104⑤ 대상 건수(비과세 제외). 2 이상일 때만 이 객체가 만들어진다 */
  itemCount: number;
  /** 합산 과세표준 */
  aggregatedTaxBase: number;
  /**
   * 자산별 산출세액 **단순 합계** — 참고값이다.
   * §104⑤ 어느 호도 아니며(호별 합산을 하지 않아 누진 구간이 자산마다 리셋된다),
   * 이 값이 결정 산출세액이 되어서는 안 된다.
   */
  itemSumTax: number;
  /**
   * **§104⑤1호** — 양도소득과세표준 **합계액**에 §55①(기본누진) 1회.
   * §104①9호분도 **기본세율**로 계산한다(법문이 §55①만 지목한다).
   */
  clause1Tax: number;
  /**
   * **§104⑤2호** — 「각 호별로 합산한 자산」의 산출세액 합계(예규 재산-536).
   * §104①1호 버킷(§55① 누진) + §104①9호 버킷(기본세율 + 10%p).
   */
  clause2Tax: number;
  /**
   * §104①**9호** 버킷의 과세표준·산출세액. 9호 자산이 없으면 둘 다 0.
   *
   * **§104⑤ 크로스 조정 레이어**(`comparative-104-5-cross.ts`)가 부동산 §104①8호와 한 버킷으로
   * 재합산하려면 이 둘이 필요하다 — 「본문 후단: 8호 및 9호의 자산은 **동일한 자산으로 보고**」.
   * `otherClausesTax`(= 8호·9호를 뺀 나머지)는 `clause2Tax − clause9Tax`로 얻는다.
   */
  clause9TaxBase: number;
  clause9Tax: number;
  /**
   * §104①**1호** 버킷의 과세표준·산출세액. 1호 자산이 없으면 둘 다 0.
   *
   * 부동산 `AggregateTransferResult.clause1BucketTaxBase`·`clause1BucketTax`와 **대칭**이다 —
   * 2호의 「자산별」이 예규상 「**각 호별로 합산한 자산**」이므로 **부동산 1호와 기타자산 1호도
   * 합산 대상**이다(기재부 재산세제과-536). 크로스 조정 레이어가 두 값을 한 버킷으로 묶는다.
   *
   * ⚠️ **이름에 `Bucket`이 붙는 이유** — 위 `clause1Tax`는 §104**⑤**1호(과세표준 합계액 ×
   *   §55①)이고 이 필드는 §104**①**1호(호별 버킷)다. **다른 조항의 「1호」**라 이름이 겹치면
   *   조정 레이어에서 치명적으로 혼동된다. 8호·9호는 §104⑤에 그 번호가 없어 접미사가 없다.
   *
   * 📌 `clause1BucketTax + clause9Tax === clause2Tax`가 불변식이다(버킷이 이 둘뿐이므로).
   */
  clause1BucketTaxBase: number;
  clause1BucketTax: number;
  /** MAX가 고른 호 — 9호가 섞이지 않으면 두 값이 같아 `"clause2"`가 된다 */
  applied: "clause1" | "clause2";
  /** `MAX(clause1Tax, clause2Tax)` — 이 그룹의 결정 산출세액 */
  aggregatedTax: number;
}

export interface StockTransferAggregateResult {
  /**
   * 종목별 단건 결과 배열.
   *
   * ⚠️ **`Σ items.calculatedTax ≠ totalCalculatedTax`일 수 있다** — 기타자산 2건 이상이면
   *   §104⑤ 비교과세가 합계에 적용되기 때문이다(`otherAssetComparativeTax`).
   *   items는 **자산 단독 참고값**이며, 그 차이는 비교과세의 본질이다
   *   (부동산 정본 `PerPropertyBreakdown.refCalculatedTax`와 같은 규약).
   */
  items: StockTransferResult[];
  /** 합산 양도소득금액 */
  totalTransferIncome: number;
  /**
   * 그룹별 기본공제 합계
   * - stock: §103①2호 그룹 (주식 §94①3 가·나목)
   * - real_estate_and_other_asset: §103①1호 그룹 (기타자산 §94①4)
   */
  basicDeductionByGroup: {
    stock: number;
    real_estate_and_other_asset: number;
  };
  /** 합산 과세표준 (그룹별 기본공제 1회 적용 후) */
  totalTaxBase: number;

  /**
   * 합산 산출세액.
   * 기타자산 2건 이상이면 §104⑤ 비교과세가 반영되어 **`Σ items.calculatedTax`와 다르다**
   * (`otherAssetComparativeTax` 참조).
   */
  totalCalculatedTax: number;

  /**
   * §102②·시행령 §167의2① 양도차손 통산 요약 — **주식 그룹**(§102①2호)만.
   * 통산도 소멸도 없으면 undefined.
   *   `totalOffset` 이익 자산에 배분된 차손 총액
   *   `unusedLoss` 통산하지 못하고 소멸한 차손 (양도소득에 결손금 이월 없음)
   */
  lossOffset?: { totalOffset: number; unusedLoss: number };
  /**
   * §104⑤ 비교과세(기타자산 그룹) echo — 대상이 2건 미만이면 `undefined`.
   * `"aggregate"` 모드에서만 만들어진다(§103①·② 기본공제가 정상 배분되는 실제 신고 경로).
   */
  otherAssetComparativeTax?: OtherAssetComparativeTax;
  /**
   * 신고불성실가산세 — **신고 1건 단위 1회** 산정 (국세기본법 §47조의2·§47조의3).
   * 종목별 값의 합이 아니다. 종목 결과의 `underReportPenalty` 는 전부 0 이다.
   */
  totalUnderReportPenalty: number;
  /** 납부지연가산세 — 신고 1건 단위 1회 (국세기본법 §47조의4①1호) */
  totalLatePaymentPenalty: number;
  /** 합산 전자신고 공제 (전체 1회) */
  electronicFilingCredit: number;
  /** 합산 최종세액 */
  totalFinalTax: number;
  /** 합산 지방소득세 */
  totalLocalIncomeTax: number;
  /**
   * 종목별 증권거래세 정보성 echo 합산 (Phase 2 — B-E1).
   * 이미 floor된 종목별 값의 단순합 — 안분·잔액흡수 비해당.
   * 비과세 종목 echo도 포함 (증권거래세는 양도세 비과세와 독립).
   * ⚠️ 현재 aggregate UI 소비자 없음(다자산 UI 미연결) — 향후 연결 시 14지점 재점검 대상.
   */
  totalSecuritiesTransactionTax: SecuritiesTransactionTaxTotal;
}

/** §103①1호 그룹 키 — 기타자산(§94①4호)은 부동산과 같은 기본공제 그룹이다. */
const OTHER_ASSET_GROUP = "real_estate_and_other_asset" as const;

/** §104①9호(비사업용 토지 과다소유법인 주식) 카테고리 — 다목·라목 **둘 다**에 얹힌다. */
const NBL_HEAVY_CORP_CATEGORIES: ReadonlySet<StockTransferResult["taxCategory"]> = new Set([
  "other_asset_block_shareholder_nbl",
  "other_asset_heavy_re_nbl",
]);

/**
 * §104⑤ 비교과세 — **기타자산(§94①4호) 그룹**의 산출세액을 호별 합산으로 다시 낸다.
 *
 * [법령]
 * - 「소득세법」 §104⑤ 본문: 「해당 과세기간에 제94조제1항제1호ㆍ제2호 및 **제4호**에서 규정한
 *   자산을 **둘 이상 양도**하는 경우 양도소득 산출세액은 다음 각 호의 금액 중 **큰 것** … 으로 한다」
 *     1호 — 양도소득과세표준 **합계액**에 §55①의 세율을 적용한 산출세액
 *     2호 — §104①~④·⑦에 따라 계산한 **자산별** 산출세액 합계액
 * - 「기획재정부 재산-536」(2018.6.19.) · 국세청 「기준-2018-법령해석재산-0098」:
 *   「2호의 "자산별"에서 "자산"의 의미는 §104 **각 호별로 합산한 자산**을 의미」
 *   ⇒ 같은 호 자산의 과세표준 합산은 **단서가 아니라 본문**이며 **조건이 없다**.
 *
 * [호 버킷 — 기타자산에 걸릴 수 있는 호는 **둘**이다]
 * - **§104①1호** — 「§94①1호·2호 및 **4호**에 따른 자산 — §55①에 따른 세율」. 기타자산의 기본.
 * - **§104①9호** — 그 중 **비사업용 토지 과다소유법인 주식**(시행령 §167의7: 자산총액 중
 *   「법인세법」 §55의2②에 따른 비사토 가액 비율 50% 이상) → **기본세율 + 10%p**.
 * 단기세율(§104①2·3호)은 「§94①**1호 및 2호**에서 규정하는 자산」이라 4호가 빠져
 * **기타자산에 적용되지 않는다** — 그래서 버킷은 이 둘뿐이다.
 *
 * ⚠️ **1호와 2호가 갈린다** — 9호 도입 전에는 호가 하나뿐이라 「1호 = 2호」였고 합산 누진 1회로
 *   충분했다. 이제는 **1호가 이길 수 있다**: 1호는 9호분까지 **기본세율**로 합쳐 계산하므로,
 *   버킷이 각 1건씩이면 「합산으로 올라간 누진 구간」이 「+10%p」를 넘어설 수 있다.
 *   ⇒ MAX를 실제로 취한다(`applied`가 어느 호를 골랐는지 echo한다).
 *
 * [종전 결함] `Σ 단건 세액`을 그대로 합계로 썼다. 그러면 **누진 구간이 자산마다 리셋**되어
 *   1호도 2호도 아닌 값이 나온다 — 부동산 쪽 P11이 저질렀다 되돌린 오류와 같은 성질이다
 *   (`aggregate-progressive-clause-104-5.anchor.test.ts` ❌재제안 금지 항목).
 *   실측 과소 **27,840,000**(기타자산 2건 · 각 양도차익 3억).
 *
 * ⚠️ **주식(§94①3호 가·나목)은 대상이 아니다** — 본문이 3호를 열거하지 않는다.
 * ⚠️ **차손 통산(§102②)은 이 함수의 범위가 아니다** — 차손 자산은 `taxBase`가 0이라 합계에
 *   기여하지 않는다. 2026-08-12에 **주식 그룹**(§102①2호)에는 통산이 들어갔지만
 *   **기타자산 그룹**(§102①1호)은 아직이라(STEP 1.5 주석), 여기 들어오는 값은 종전과 같다.
 *
 * @returns 대상이 2건 미만이면 `undefined`(§104⑤은 「둘 이상 양도」가 요건이다)
 */
function computeOtherAssetComparativeTax(
  items: StockTransferResult[],
  inputs: AggregateStockItemInput[],
): OtherAssetComparativeTax | undefined {
  // 대상은 **기타자산 그룹**뿐이다. 국외주식은 `basicDeductionGroup: "stock"`이라
  // 여기서 자동으로 걸러진다(§104⑤이 「1호·2호 및 **4호**」만 열거해 3호가 빠지는 것과 같은 이유).
  const targets = items
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.basicDeductionGroup === OTHER_ASSET_GROUP && !r.isExempt);
  if (targets.length < 2) return undefined;

  const aggregatedTaxBase = targets.reduce((s, { r }) => s + r.taxBase, 0);
  const itemSumTax = targets.reduce((s, { r }) => s + r.calculatedTax, 0);

  // ── §104⑤2호 — 「각 호별로 합산한 자산」(예규 재산-536) ──────────────────
  const buckets = new Map<"104-1-1" | "104-1-9", typeof targets>();
  for (const t of targets) {
    const k = NBL_HEAVY_CORP_CATEGORIES.has(t.r.taxCategory) ? "104-1-9" : "104-1-1";
    buckets.set(k, [...(buckets.get(k) ?? []), t]);
  }
  let clause2Tax = 0;
  // §104①9호 버킷은 **따로 기록**한다 — 크로스 조정 레이어가 부동산 8호와 한 버킷으로
  // 재합산해야 하므로(§104⑤ 본문 후단) 과세표준·세액을 분리 노출한다.
  let clause9TaxBase = 0;
  let clause9Tax = 0;
  // §104①1호 버킷도 같은 이유로 분리한다 — 부동산 1호와 합산 대상이기 때문(위 타입 주석).
  // ⚠️ 아래 `clause1Tax`(§104⑤1호)와 **다른 것**이라 `Bucket`을 붙인다.
  let clause1BucketTaxBase = 0;
  let clause1BucketTax = 0;
  for (const [clause, bucket] of buckets) {
    const bucketBase = bucket.reduce((s, { r }) => s + r.taxBase, 0);
    // 버킷 **안에서는** 대표 선택이 결과를 바꾸지 않는다 — 1호 버킷의 두 카테고리
    // (다목·라목)는 같은 §55① 누진이고, 9호 버킷의 두 카테고리도 같은 9호 표다.
    // 세율을 재구현하지 않고 정본 `applyStockTaxRate`에 위임한다(dual-truth 방지).
    const rep = bucket[0];
    const bucketTax = floorTen(
      applyStockTaxRate(
        bucketBase,
        rep.r.taxCategory,
        smeFlag(inputs[rep.i]),
        rep.r.isShortTermHolding,
      ).calculatedTax,
    );
    clause2Tax += bucketTax;
    if (clause === "104-1-9") {
      clause9TaxBase = bucketBase;
      clause9Tax = bucketTax;
    } else {
      clause1BucketTaxBase = bucketBase;
      clause1BucketTax = bucketTax;
    }
  }

  // ── §104⑤1호 — 「과세표준 **합계액**에 §55①」 ────────────────────────────
  // 9호분도 **기본세율**로 계산한다(법문이 §55①만 지목한다). 그래서 `taxCategory` 경유가
  // 아니라 전용 헬퍼를 쓴다 — 대표가 9호면 +10%p가 섞여 1호가 아니게 된다.
  const clause1Tax = floorTen(applyBasicProgressiveRate(aggregatedTaxBase).tax);

  const aggregatedTax = Math.max(clause1Tax, clause2Tax);
  return {
    itemCount: targets.length,
    aggregatedTaxBase,
    itemSumTax,
    clause1Tax,
    clause2Tax,
    clause9TaxBase,
    clause9Tax,
    clause1BucketTaxBase,
    clause1BucketTax,
    applied: clause1Tax > clause2Tax ? "clause1" : "clause2",
    aggregatedTax,
  };
}

/**
 * 다자산 합산 계산 — §103①(그룹별 연 250만원 한도) + §103②(먼저 양도한 자산부터 배분)
 *
 * "aggregate" 모드:
 *   1. 각 종목 단건 계산 (realEstateGroupBasicDeductionUsed 연동)
 *   2. 그룹별 기본공제를 250만원 한도 내에서 배분
 *   3. 합산 세액은 단건 세액 합계 (그룹별 기본공제 중복 없음)
 *
 * "each_item" 모드:
 *   - 각 종목 그대로 합산 (기본공제 중복 가능 — 단건 계산 보조용)
 */
export function calculateStockTransferTaxAggregate(
  inputs: AggregateStockItemInput[],
  deductionMode: "each_item" | "aggregate" = "aggregate",
): StockTransferAggregateResult {
  /**
   * §97의2① 이월과세 — **여기가 ②3호 비교의 기준점**이다.
   *
   * ②3호가 비교하는 「양도소득 **결정세액**」은 §92의 계산 순서를 거친 **과세기간 단위**
   * 개념이라 종목 단위로 비교하면 틀린다 — 주식은 §103① 기본공제가 **그룹 단위 연 1회**라
   * 한 종목의 A/B가 **다른 종목의 세액까지** 움직이기 때문이다(계획서 §4 Q-2 · 실측 반례).
   *
   * ⚠️ `aggregateCore`는 이 resolve를 **다시 하지 않는다** — 순환을 만들지 않기 위해서다.
   *
   * 🔑 **국외주식은 이월과세 대상이 아니다** — §97의2①은 배우자·직계존비속에게서 **증여받은**
   *   자산의 취득가액을 증여자 기준으로 되돌리는 규정이고, `ForeignStockInput`에는 그 축
   *   (`acquisitionCause`)이 아예 없다. 그래서 국내 종목만 뽑아 resolve하고 **원래 자리로
   *   되돌려 놓는다** — 순서를 유지해야 §103②(양도일 순) 배분이 어긋나지 않는다.
   *
   * ⚠️ 다만 ②3호가 비교하는 「결정세액」은 **과세기간 전체**라, 비교용 합산에는 국외 종목도
   *   **포함**해야 한다. 그래서 콜백 안에서 전체 배열을 재조립해 넘긴다.
   */
  const domesticIdx: number[] = [];
  inputs.forEach((input, i) => {
    if (!isForeignStockItem(input)) domesticIdx.push(i);
  });

  const mergeDomestic = (list: StockTransferInput[]): AggregateStockItemInput[] => {
    const merged = [...inputs];
    domesticIdx.forEach((globalIdx, localIdx) => {
      merged[globalIdx] = list[localIdx];
    });
    return merged;
  };

  const resolvedDomestic = resolveStockCarryover(
    domesticIdx.map((i) => inputs[i] as StockTransferInput),
    (list) => aggregateCore(mergeDomestic(list), deductionMode).totalFinalTax,
    (i) => calculateStockTransferTaxInternal(i).transferIncome,
  );

  return aggregateCore(mergeDomestic(resolvedDomestic), deductionMode);
}

/** 합산 계산 본체 — 이월과세 A/B가 **이미 확정된** 입력을 받는다. */
function aggregateCore(
  inputs: AggregateStockItemInput[],
  deductionMode: "each_item" | "aggregate",
): StockTransferAggregateResult {
  const BASIC_DEDUCTION_LIMIT = 2_500_000;

  /** 종목 1건 단건 계산 — 국내·국외 엔진을 갈라 부르고 결과 타입을 하나로 맞춘다. */
  const calcOne = (
    input: AggregateStockItemInput,
    over: Partial<StockTransferInput> = {},
  ): StockTransferResult =>
    isForeignStockItem(input)
      ? toStockTransferResult(input, calculateForeignStockTax(input))
      : calculateStockTransferTaxInternal({ ...input, ...over });

  if (deductionMode === "each_item" || inputs.length === 1) {
    // 단건 또는 each_item 모드 — 개별 계산 합산
    //
    // §104⑤ 비교과세를 여기서는 적용하지 않는다:
    //   · `inputs.length === 1` — 법문 요건이 「자산을 **둘 이상** 양도하는 경우」다.
    //   · `each_item` — §103① 기본공제 **중복을 허용**하는 진단 모드라 애초에 유효한 신고가
    //     아니다(위 함수 주석). 실제 신고 경로는 `"aggregate"`이며 Zod 기본값도 그쪽이다
    //     (`lib/api/stock-transfer-tax-schema.ts:548`).
    // 가산세는 신고 단위 1회라 종목별 값은 버린다(`stripItemPenalties` 주석 참조).
    const items = stripItemPenalties(inputs.map((input) => calcOne(input)));
    // 합계가 음수면 과세 소득은 0이다 — 양도소득에 결손금 이월이 없다(§102①후단·§102②).
    // 부동산 정본과 대칭(`multi-parcel-transfer.ts:478`). 종전에는 clamp가 없어 신고서식에
    // **음수 양도소득금액**이 그대로 흘렀다.
    const totalTransferIncome = Math.max(0, items.reduce((s, r) => s + r.transferIncome, 0));
    const totalCalculatedTax = items.reduce((s, r) => s + r.calculatedTax, 0);
    const electronicFilingCredit = items.some((r) => r.electronicFilingCredit > 0)
      ? 20_000
      : 0;
    // §118의6①1호 외국납부세액공제는 **산출세액에서 차감**된다. 이 단축 분기(단건·each_item)도
    // 반드시 빼야 한다 — 국외 종목의 `finalTax`에는 이미 반영돼 있는데 총계에서 빠지면
    // 종목 세액과 결정세액이 어긋난다(anchor FA-2-2가 이 누락을 잡았다).
    const totalForeignTaxCreditShort = items.reduce(
      (s, r) => s + (r.foreignDetail?.foreignTaxCreditApplied ?? 0),
      0,
    );
    // 신고 단위 결정세액 = 산출세액 − 세액공제. 가산세 base 가 바로 이 금액이다.
    const determinedTotal = Math.max(
      0,
      totalCalculatedTax - totalForeignTaxCreditShort - electronicFilingCredit,
    );
    const unitPenalty = computeFilingUnitPenalty(determinedTotal, pickFilingAxisInput(inputs));
    const totalUnderReportPenalty = unitPenalty.filing;
    const totalLatePaymentPenalty = unitPenalty.late;
    // 결정세액 10원 미만 절사 — 단건 finalizeStockTax·aggregate 분기와 대칭
    // (구성요소가 모두 10배수라 현재 실수치 불변이나, 향후 변경 대비 정합 유지)
    const totalFinalTax = Math.max(
      0,
      floorTen(determinedTotal + totalUnderReportPenalty + totalLatePaymentPenalty),
    );
    const totalLocalIncomeTax =
      Math.floor(((totalCalculatedTax - totalForeignTaxCreditShort) * 0.10) / 10) * 10;

    return {
      items,
      totalTransferIncome,
      basicDeductionByGroup: {
        stock: items
          .filter((r) => r.basicDeductionGroup === "stock")
          .reduce((s, r) => s + r.basicDeduction, 0),
        real_estate_and_other_asset: items
          .filter((r) => r.basicDeductionGroup === "real_estate_and_other_asset")
          .reduce((s, r) => s + r.basicDeduction, 0),
      },
      totalTaxBase: items.reduce((s, r) => s + r.taxBase, 0),
      totalCalculatedTax,
      totalUnderReportPenalty,
      totalLatePaymentPenalty,
      electronicFilingCredit,
      totalFinalTax,
      totalLocalIncomeTax,
      totalSecuritiesTransactionTax: sumSecuritiesTransactionTax(items),
    };
  }

  // "aggregate" 모드 — §103① 그룹별 기본공제 1회 **한도** + §103② 배분 **순서**
  // STEP 1: 각 종목 기본공제 최대 소진으로 단건 계산 (순수 소득금액 파악)
  const rawItems = inputs.map((input) =>
    // 부동산 그룹은 이미 소진됨으로 처리 → 실질적 기본공제 0 (국외주식엔 해당 축이 없다)
    calcOne(input, { realEstateGroupBasicDeductionUsed: BASIC_DEDUCTION_LIMIT }),
  );

  // STEP 1.5: §102② 양도차손 통산 (영 §167의2①) — **§92②2호 「양도소득금액」 단계**라
  //           기본공제(§103)보다 **먼저** 온다.
  //
  // 🔑 통산은 **§102① 각 호별로만** 한다. 주식(2호)과 기타자산(1호)은 서로 통산하지 못하므로
  //    코어를 **그룹마다 따로** 돌린다. 하나로 합쳐 돌리면 영 §167의2①2호의 「다른 세율 pro-rata」가
  //    호 경계를 넘어버린다(§102①후단 「다른 호의 소득금액과 합산하지 아니한다」 위반).
  //
  // ⚠️ **기타자산 그룹은 이번 범위 밖이다.** 그 분기는 `calculateStockTransferTaxInternal`을
  //    입력에서 다시 돌려 결과를 통째로 갈아끼우는 구조라 통산 소득을 주입할 자리가 없고,
  //    §104⑤ 비교과세(`computeOtherAssetComparativeTax`)와도 얽힌다. 기타자산은 부동산과 같은
  //    §102①1호 그룹이므로 본래 부동산 aggregate와 함께 통산되어야 하는데 그 경로도 아직 없다.
  //    ⇒ 현재는 **주식 그룹만** 통산한다. 기타자산 그룹 통산은 별건으로 남긴다(anchor로 고정).
  const stockIdx = rawItems
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.basicDeductionGroup === "stock")
    .map((x) => x.i);

  const stockOffset = offsetLossesCore(
    stockIdx.map((i) => ({
      income: rawItems[i].transferIncome,
      rateKey: resolveStockRateKey(
        rawItems[i].taxCategory,
        smeFlag(inputs[i]),
        rawItems[i].isShortTermHolding,
      ),
      exempt: rawItems[i].isExempt,
    })),
  );

  /** 통산 후 양도소득금액 — 주식 그룹만 갈아끼우고 기타자산은 원값 유지. */
  const offsetIncome: number[] = rawItems.map((r) => r.transferIncome);
  stockIdx.forEach((globalIdx, localIdx) => {
    offsetIncome[globalIdx] = stockOffset.incomeAfterOffset[localIdx];
  });
  const totalLossOffset = stockOffset.rows.reduce((s, row) => s + row.amount, 0);

  // STEP 2: 그룹별 소득금액 합산 — **통산 후** 기준(§92② 순서)
  const stockGroupIncome = stockIdx.reduce((s, i) => s + offsetIncome[i], 0);

  const otherAssetGroupIncome = rawItems
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.basicDeductionGroup === "real_estate_and_other_asset")
    .reduce((s, x) => s + offsetIncome[x.i], 0);

  const stockBasicDeduction = Math.min(Math.max(0, stockGroupIncome), BASIC_DEDUCTION_LIMIT);
  const otherAssetBasicDeduction = Math.min(
    Math.max(0, otherAssetGroupIncome),
    BASIC_DEDUCTION_LIMIT,
  );

  // STEP 3: 종목별 기본공제 순차 배분 후 재계산
  //
  // **한도**는 §103①(각 호별 연 250만원)이고, **배분 순서**는 §103②다.
  //   §103② 「… 해당 과세기간에 **먼저 양도한 자산**의 양도소득금액에서부터 순서대로 공제한다」
  //   별지 제84호서식 작성요령 7번도 「해당 연도 중 **먼저 양도하는 자산**의 양도소득금액에서부터
  //   차례대로 공제」로 같은 말을 한다.
  //
  // 🔴 2026-08-12 정정 — 종전에는 **입력 순서**로 배분했다. 같은 사실관계인데 종목을 입력한
  //   순서만 바꾸면 세액이 달라졌다(실측: 20% 종목 2월 + 30% 종목 11월 → 4,250,000 vs 4,500,000,
  //   **250,000 차이**). 세율이 다른 종목이 섞이면 어느 쪽이 공제를 받느냐가 세액을 바꾼다.
  //
  // ⚠️ 동일 양도일의 우선순위는 **법문·서식 어디에도 없다** — 입력 순서로 안정 정렬한다.
  // ⚠️ §103② 전단의 「감면소득금액 외의 양도소득금액에서 먼저 공제」는 **주식에 해당 사항이
  //    없다** — 조특법 「양도소득세의 감면」 조문(§43·§69·§70·§77·§85·§97·§99)이 전부
  //    부동산·토지·주택이고, 주식 특례(조특법 §14①·§13)는 감면이 아니라 **양도소득 불산입**이다.
  //
  // 주식 그룹(§103①2호):
  //   - 엔진 내부 calcBasicDeduction은 "stock" 그룹에 **항상** min(income, 250만)을 적용해
  //     잔여 한도를 모른다 → 정확한 잔여액(deductThis)으로 결과를 패치한다.
  // 기타자산 그룹(§103①1호):
  //   - realEstateGroupBasicDeductionUsed로 직접 제어 가능

  let stockUsed = 0;        // 주식 그룹 기본공제 누적 사용량
  let otherAssetUsed = 0;   // 기타자산 그룹 누적 사용량

  /**
   * §103② 배분 순회 순서 — **양도일 오름차순**, 동일자는 입력 순서(안정 정렬).
   * 결과 배열은 **입력 순서를 유지**한다(결과뷰·신고서식이 입력 순서를 전제한다) —
   * 순회 순서와 출력 순서를 분리하는 것이 이 두 줄의 목적이다.
   */
  const allocationOrder = inputs
    .map((input, i) => ({ i, t: input.transferDate.getTime() }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.i);

  const processedByIndex = new Array<StockTransferResult>(inputs.length);
  const processItem = (i: number): StockTransferResult => {
    const input = inputs[i];
    const r = rawItems[i];
    if (r.isExempt) return r;

    // 통산 후 양도소득금액. 기타자산 그룹은 통산 미적용이라 원값이 그대로 온다(STEP 1.5 주석).
    const income = offsetIncome[i];

    if (r.basicDeductionGroup === "stock") {
      // 이 종목에서 실제 적용할 기본공제
      const remaining = Math.max(0, BASIC_DEDUCTION_LIMIT - stockUsed);
      const deductThis = Math.min(Math.max(0, income), remaining);
      stockUsed += deductThis;

      // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): 종전에는 `deductThis > 0`이면 무조건
      // 엔진 전량 재계산으로 보냈는데, 순수 엔진 `calcBasicDeduction`은 주식 그룹에 **항상**
      // `min(income, 2,500,000)`을 적용한다. 그래서 앞 종목이 한도를 일부만 쓴 경우
      // 뒤 종목이 **250만원 전액을 다시 공제**받아 그룹 한도(§103①2호)를 넘겼다.
      //   실측: 종목A가 1,000,000 사용 → 종목B가 잔여 1,500,000이 아니라 2,500,000 공제
      //        → 그룹 합계 3,500,000 (한도 초과) → 과세표준·산출세액 과소.
      //
      // 0/전액 두 갈래를 없애고 **항상 정확한 잔여액(deductThis)으로 패치**한다.
      // (전액 케이스는 deductThis == min(income, 250만)이라 종전 엔진 경로와 결과가 같다.)
      const taxBaseAfterDeduction = Math.floor(Math.max(0, income - deductThis));
      const rateResult = applyStockTaxRate(
        taxBaseAfterDeduction,
        r.taxCategory,
        smeFlag(input),
        r.isShortTermHolding,
        r.isExempt, // 비과세 분기 산식 echo
      );
      const newCalculatedTax = floorTen(rateResult.calculatedTax);

      // 🔑 **국외주식은 `finalizeStockTax`를 타지 않는다.** 그 함수는 국내 신고 축
      //   (`filingType`·`filingDate`·`filingViolation`·`isFraudulent`…)을 읽는데
      //   `ForeignStockInput`에는 그 필드가 없다. 국외주식 단건 엔진도 가산세를 계산하지
      //   않으므로(기존 갭) 여기서도 0을 유지해 **단건과 다종목의 세액을 일치**시킨다.
      //   외국납부세액공제는 C를 알아야 하므로 STEP 3.5에서 일괄 반영한다.
      if (isForeignStockItem(input)) {
        return {
          ...r,
          transferIncome: income,
          basicDeduction: deductThis,
          taxBase: taxBaseAfterDeduction,
          appliedRate: rateResult.appliedRate,
          progressiveDeduction: rateResult.progressiveDeduction,
          calculatedTax: newCalculatedTax,
          underReportPenalty: 0,
          latePaymentPenalty: 0,
          electronicFilingCredit: 0,
          // STEP 3.5에서 외국납부세액공제를 반영해 다시 쓴다.
          finalTax: newCalculatedTax,
          localIncomeTax: floorTen(newCalculatedTax * 0.1),
        };
      }

      const newFinalize = finalizeStockTax(newCalculatedTax, input);
      return {
        ...r,
        // 통산 후 값으로 갈아끼운다 — 그래야 `taxBase = transferIncome − basicDeduction`
        // 항등식이 유지된다(표시 산식과 세액이 어긋나면 안 된다).
        transferIncome: income,
        basicDeduction: deductThis,
        taxBase: taxBaseAfterDeduction,
        appliedRate: rateResult.appliedRate,
        progressiveDeduction: rateResult.progressiveDeduction,
        calculatedTax: newCalculatedTax,
        underReportPenalty: newFinalize.underReportPenalty,
        latePaymentPenalty: newFinalize.latePaymentPenalty,
        electronicFilingCredit: newFinalize.electronicFilingCredit,
        finalTax: newFinalize.finalTax,
        localIncomeTax: newFinalize.localIncomeTax,
      };
    } else {
      // 기타자산 그룹: realEstateGroupBasicDeductionUsed로 직접 제어.
      // 국외주식은 `basicDeductionGroup`이 항상 "stock"이라 이 갈래에 오지 않는다 — 도달하면
      // 어댑터가 그룹을 잘못 준 것이므로 조용히 국내 엔진으로 넘기지 않고 그대로 돌려준다.
      if (isForeignStockItem(input)) return r;
      const adjustedInput: StockTransferInput = {
        ...input,
        realEstateGroupBasicDeductionUsed: otherAssetUsed,
      };
      const recalc = calculateStockTransferTaxInternal(adjustedInput);
      otherAssetUsed += recalc.basicDeduction;
      return recalc;
    }
  };

  // §103② 순서로 **순회**하되, 결과는 **입력 순서**로 되돌린다.
  for (const i of allocationOrder) {
    processedByIndex[i] = processItem(i);
  }
  const processedItems = processedByIndex;

  // ──────────────────────────────────────────────────────────
  // STEP 3.5: §118의6①1호 외국납부세액 공제한도 — A × B / C
  //
  // 여기까지 와야 A(국외 종목 산출세액 합)와 C(국외 종목 통산 후 양도소득금액 합)가
  // 모두 확정된다. 단건 엔진은 C를 알 수 없어 B = C로 계산하고, 그것이 종목마다
  // **A 전액을 한도로 주는** 과대공제였다(계획서 §3).
  //
  // ⚠️ 국외 종목이 1건이면 B = C라 한도 = A — 단건 경로와 정확히 같은 값이 나온다.
  // ⚠️ `foreignTaxMethod: "expense"`(필요경비 산입)를 고른 종목은 애초에 공제 대상이 아니라
  //    단건 엔진이 `foreignTaxCreditLimit`을 undefined로 둔다. 그 종목은 외국세 0으로 넘겨
  //    한도 배분에서 자기 몫을 요구하지 않게 한다 — 다만 **B와 A에는 그대로 들어간다**
  //    (그 종목도 「해당 과세기간의 국외자산」이다).
  //
  // 🔑 **한도가 그 종목 자신의 산출세액을 넘을 수 있다.** 한도는 「A × 소득 비율」인데 §103②
  //    기본공제가 특정 종목에 몰리면 그 종목의 산출세액만 낮아지기 때문이다(실측: 2종목 동액
  //    이익에서 먼저 양도한 종목의 한도 9,750,000 > 자기 산출세액 9,500,000).
  //    이것을 종목 세액으로 자르지 **않는다** — §118의6①1호 본문이 「**해당 과세기간의**
  //    양도소득 산출세액에서 공제」라 공제 대상이 **과세기간 전체**이기 때문이다. 자르면
  //    근거 없이 납세자에게 불리해진다([[feedback_no_unfavorable_application_without_legal_basis]]).
  //
  // ⚠️ 그 결과 **Σ 종목 finalTax ≠ totalFinalTax**가 될 수 있다(위 예에서 250,000 차이).
  //    이는 결함이 아니라 **과세기간 단위 공제**의 성질이며, 이 엔진에는 이미 같은 구조가 있다 —
  //    전자신고세액공제도 종목별 값과 별개로 합산 1회다(`anyElectronic ? 20_000 : 0`).
  // ──────────────────────────────────────────────────────────
  const foreignIdx: number[] = [];
  inputs.forEach((input, i) => {
    if (isForeignStockItem(input)) foreignIdx.push(i);
  });

  let totalForeignTaxCredit = 0;
  if (foreignIdx.length > 0) {
    const limits = computeForeignTaxCreditLimits(
      foreignIdx.map((i) => ({
        incomeAfterOffset: Math.max(0, processedItems[i].transferIncome),
        incomeTax: processedItems[i].calculatedTax,
        // 세액공제를 고른 종목만 자기 몫을 쓴다(필요경비 산입 선택 시 undefined).
        foreignTaxPaidKrw:
          processedItems[i].foreignDetail?.foreignTaxCreditLimit === undefined
            ? 0
            : (processedItems[i].foreignDetail?.foreignTaxPaidKrw ?? 0),
      })),
    );

    foreignIdx.forEach((globalIdx, localIdx) => {
      const item = processedItems[globalIdx];
      const { limit, applied } = limits[localIdx];
      const usesCredit = item.foreignDetail?.foreignTaxCreditLimit !== undefined;
      const taxAfterCredit = Math.max(0, item.calculatedTax - applied);
      totalForeignTaxCredit += applied;

      processedItems[globalIdx] = {
        ...item,
        finalTax: taxAfterCredit,
        localIncomeTax: floorTen(taxAfterCredit * 0.1),
        foreignDetail: {
          ...item.foreignDetail!,
          foreignTaxCreditLimit: usesCredit ? limit : undefined,
          foreignTaxCreditApplied: usesCredit ? applied : undefined,
        },
      };
    });
  }

  // 통산 후 합계. 기타자산 그룹은 통산 미적용이라 음수가 남을 수 있어 clamp를 유지한다
  // (주식 그룹은 `incomeAfterOffset`이 이미 0 이상이다).
  const totalTransferIncome = Math.max(
    0,
    processedItems.reduce((s, r) => s + r.transferIncome, 0),
  );

  // §104⑤ 비교과세 — 기타자산 그룹만 호별 합산으로 다시 낸다(위 함수 주석 참조).
  // 주식 그룹은 §104⑤ 대상이 아니라 종전대로 단건 합계다.
  const otherAssetComparativeTax = computeOtherAssetComparativeTax(processedItems, inputs);
  const totalCalculatedTax =
    processedItems.reduce((s, r) => s + r.calculatedTax, 0) +
    (otherAssetComparativeTax
      ? otherAssetComparativeTax.aggregatedTax - otherAssetComparativeTax.itemSumTax
      : 0);

  // 전자신고 공제는 합산 1회
  const anyElectronic = inputs.some((inp) => inp.isElectronicFiling);
  const electronicFilingCredit = anyElectronic && totalCalculatedTax > 0 ? 20_000 : 0;

  /**
   * 가산세는 **신고 1건 단위 1회**다 — 종목별 값의 합이 아니다.
   *
   * 종전 주석은 「자산별 가산세는 단건 엔진이 처리, aggregate는 합산만 수행」이라 적으며
   * 부동산 정본을 인용했는데, **그 인용이 틀렸다**. 부동산이 자산별로 합산하는 것은
   * §114조의2 **환산가액적용가산세**(자산 고유)이고, 신고불성실·납부지연은
   * `transfer-tax-aggregate.ts` 의 `filingUnitPenaltyDetail` 이 **신고 단위 결정세액에 1회**
   * 매긴다. 주식에는 자산 고유 가산세가 없으므로 종목별은 전부 0이다.
   *
   * 실측 결함(계획서 P-5): 국내 20,000,000 + 국외 19,500,000 인 혼합 신고에서 종전에는
   * 국외 종목 가산세가 0으로 고정돼 8,000,000 만 잡혔다 — 신고 단위로는 15,800,000 이라
   * **7,800,000 과소**였다.
   */
  const determinedTotal = Math.max(
    0,
    totalCalculatedTax - totalForeignTaxCredit - electronicFilingCredit,
  );
  const unitPenalty = computeFilingUnitPenalty(determinedTotal, pickFilingAxisInput(inputs));
  const totalUnderReportPenalty = unitPenalty.filing;
  const totalLatePaymentPenalty = unitPenalty.late;

  // 🔑 외국납부세액공제는 **산출세액에서 차감**된다(§118의6①1호 본문) — 결정세액·지방소득세
  //    양쪽에 반영해야 한다. 국내 종목만 있으면 `totalForeignTaxCredit`이 0이라 종전과 같다.
  const totalFinalTax = Math.max(
    0,
    floorTen(determinedTotal + totalUnderReportPenalty + totalLatePaymentPenalty),
  );
  const totalLocalIncomeTax =
    Math.floor(((totalCalculatedTax - totalForeignTaxCredit) * 0.10) / 10) * 10;

  return {
    items: stripItemPenalties(processedItems),
    totalTransferIncome,
    basicDeductionByGroup: {
      stock: stockBasicDeduction,
      real_estate_and_other_asset: otherAssetBasicDeduction,
    },
    totalTaxBase: processedItems.reduce((s, r) => s + r.taxBase, 0),
    totalCalculatedTax,
    ...(totalLossOffset > 0 || stockOffset.unusedLoss > 0
      ? { lossOffset: { totalOffset: totalLossOffset, unusedLoss: stockOffset.unusedLoss } }
      : {}),
    ...(otherAssetComparativeTax ? { otherAssetComparativeTax } : {}),
    totalUnderReportPenalty,
    totalLatePaymentPenalty,
    electronicFilingCredit,
    totalFinalTax,
    totalLocalIncomeTax,
    totalSecuritiesTransactionTax: sumSecuritiesTransactionTax(processedItems),
  };
}
