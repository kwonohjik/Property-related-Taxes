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
import { applyStockTaxRate } from "./stock-transfer-rate-calc";
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
import { resolveSplitRateResult } from "./lot-allocation-tax";
import {
  BASIC_DEDUCTION_LIMIT,
  taxableField,
  resolveRealEstateGroupUsedSeed,
} from "./stock-transfer-aggregate-deduction";
import { calculateForeignStockTax } from "./foreign-stock";
import { computeForeignTaxCreditLimits } from "./foreign-tax-credit-limit";
import {
  isForeignStockItem,
  smeFlag,
  toStockTransferResult,
  type AggregateStockItemInput,
} from "./foreign-stock-aggregate-adapter";

// [D-2] §104⑤ 비교과세(기타자산 그룹) → stock-transfer-aggregate-104-5.ts로 분리 (800줄 정책).
//       외부 import 경로 보존을 위해 타입은 여기서 **re-export**한다(consumer 무변경).
import {
  computeOtherAssetComparativeTax,
  type OtherAssetComparativeTax,
} from "./stock-transfer-aggregate-104-5";

export type { OtherAssetComparativeTax };
// ============================================================
// 다자산 합산 결과 타입
// ============================================================

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
  /** §103①1호 기소진액 — 신고 단위 선언값(leaf 주석 참조, 리뷰 #16). */
  const realEstateGroupUsedSeed = resolveRealEstateGroupUsedSeed(inputs);

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
    // 비과세 종목의 echo 는 총계에 산입하지 않는다(리뷰 #1 — `taxableField` 주석 참조).
    const totalTransferIncome = Math.max(
      0,
      items.reduce((s, r) => s + taxableField(r, "transferIncome"), 0),
    );
    const totalCalculatedTax = items.reduce((s, r) => s + taxableField(r, "calculatedTax"), 0);
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
          .reduce((s, r) => s + taxableField(r, "basicDeduction"), 0),
        real_estate_and_other_asset: items
          .filter((r) => r.basicDeductionGroup === "real_estate_and_other_asset")
          .reduce((s, r) => s + taxableField(r, "basicDeduction"), 0),
      },
      totalTaxBase: items.reduce((s, r) => s + taxableField(r, "taxBase"), 0),
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

  // 주식 그룹은 `offsetLossesCore`가 비과세 행의 소득을 0으로 돌려주지만(`incomeAfterOffset`),
  // 기타자산 그룹은 통산을 타지 않아 원값이 그대로 온다 → 여기서 명시 배제한다(리뷰 #1).
  const otherAssetGroupIncome = rawItems
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.basicDeductionGroup === "real_estate_and_other_asset" && !x.r.isExempt)
    .reduce((s, x) => s + offsetIncome[x.i], 0);

  const stockBasicDeduction = Math.min(Math.max(0, stockGroupIncome), BASIC_DEDUCTION_LIMIT);
  // §103①1호 잔여 한도 = 250만 − 기소진액(리뷰 #16). 표시값과 배분 결과가 같은 한도를 봐야
  // `Σ 종목 기본공제 = basicDeductionByGroup` 항등식이 유지된다.
  const otherAssetBasicDeduction = Math.min(
    Math.max(0, otherAssetGroupIncome),
    Math.max(0, BASIC_DEDUCTION_LIMIT - realEstateGroupUsedSeed),
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

  let stockUsed = 0;                                // 주식 그룹 기본공제 누적 사용량
  let otherAssetUsed = realEstateGroupUsedSeed;     // 기타자산 그룹 — **기소진액에서 시작**(리뷰 #16)

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
      //
      // 🔴 2026-08-28 정정(리뷰 #5 — **세액 변경**) — 종전에는 무조건 `applyStockTaxRate`를 불러
      //   **split(lot) 축을 통째로 버렸다**. `calcSplitModeTax`의 호출부가 단건 엔진 한 곳뿐이라
      //   (전수 grep) lot 단기·장기가 섞인 종목이 다종목 신고에서는 폼 전역 취득일 하나로
      //   판정됐다 — `r.isShortTermHolding`은 lot 이 아니라 `input.acquisitionDate` 기반이다.
      //   ⇒ **종목을 하나 더 신고했다는 이유만으로 세액이 달라졌다**
      //     (실측: 단건 204,312,500 vs 다종목 184,375,000 = 19,937,500 과소.
      //      역방향은 lot 전량 장기 + 폼 전역 단기에서 52,881,250 과대).
      //   `lotMatchingDetail`과 「단기·장기 세율 상이」 warning 은 그대로 남아 있어
      //   화면은 혼합인데 세액만 단일이었다.
      //
      // 법령: 소득세법 §104①11호 가목 1)(중소기업 외 대주주 1년 미만 30%)·가목 2)(20/25% 누진).
      //   §103②은 기본공제 배분 규정일 뿐 세율 구조를 바꿀 근거가 아니다.
      //
      // ⚠️ 비과세 종목은 위에서 조기 반환하므로 여기 `r.isExempt`는 항상 false 다.
      const rateResult = r.lotMatchingDetail
        ? resolveSplitRateResult(
            taxBaseAfterDeduction,
            r.lotMatchingDetail,
            r.taxCategory,
            smeFlag(input),
          ).rate
        : applyStockTaxRate(
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
          // echo — 공제 대상이 아닌 종목에 배분된 한도. 산식에는 쓰이지 않는다(표시 전용).
          unusedForeignTaxCreditLimit: !usesCredit && limit > 0 ? limit : undefined,
        },
      };
    });
  }

  // 통산 후 합계. 기타자산 그룹은 통산 미적용이라 음수가 남을 수 있어 clamp를 유지한다
  // (주식 그룹은 `incomeAfterOffset`이 이미 0 이상이다).
  const totalTransferIncome = Math.max(
    0,
    processedItems.reduce((s, r) => s + taxableField(r, "transferIncome"), 0),
  );

  // §104⑤ 비교과세 — 기타자산 그룹만 호별 합산으로 다시 낸다(위 함수 주석 참조).
  // 주식 그룹은 §104⑤ 대상이 아니라 종전대로 단건 합계다.
  const otherAssetComparativeTax = computeOtherAssetComparativeTax(processedItems, inputs);
  const totalCalculatedTax =
    processedItems.reduce((s, r) => s + taxableField(r, "calculatedTax"), 0) +
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
    totalTaxBase: processedItems.reduce((s, r) => s + taxableField(r, "taxBase"), 0),
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
