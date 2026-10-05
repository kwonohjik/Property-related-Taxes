/**
 * 주식 양도소득세 API — cross-field refine 중 **단일 모드 필수 입력** (14지점 ⑫)
 *
 * `stock-transfer-tax-refines.ts`(753줄)에서 떼어냈다(File Size Policy — 기회주의적 분리). 이음매는 **블록 경계**다:
 * 입력은 `data`·`ctx` 둘이고 출력은 이슈뿐이라 호출부가 하나도 바뀌지 않는다. 이 블록은 비상장 보충평가(§165④) ·
 * 매매사례 · 이월과세 증여자 분모 · 순자산 단독 사유 연혁이 모여 자주 자라는 곳이라 따로 둔다.
 *
 * 비우면 엔진이 0으로 읽어 200 + 다른 세액이었다(양도가액 0 → 세액 0 · 전전연도 보정 누락).
 * ⑧ `stock-transfer-tax-validate-step2.ts`(분할 모드는 거기서도 먼저 끝난다)·`-validate.ts`와 같은 조건 —
 * 키 집합은 ⑧과 공용 술어(`stock-transfer-required-inputs.ts`)다.
 */

import {
  isBookLostAtAcquisition,
  isGiftLikeEstimationBlocked,
  GIFT_LIKE_ESTIMATION_BLOCKED_MESSAGE,
} from "@/lib/tax-engine/stock-transfer/gift-acquisition-163-9";
import { z } from "zod";
import type { stockTransferInputSchema } from "./stock-transfer-tax-schema";
import { toOptionalDate } from "./date-coerce";
import { isSection94_4Asset } from "@/lib/tax-engine/stock-transfer/stock-deemed-acquisition-date";
import { resolveNetAssetOnlyBasis } from "@/lib/tax-engine/stock-transfer/net-asset-only-basis";
import { isNetAssetOnlyReasonInEra } from "@/lib/tax-engine/stock-transfer/net-asset-only-basis";
import { netAssetOnlyReasonSidesRead } from "@/lib/calc/stock-transfer-required-inputs";
import { isTransferSupplementaryNonPositive } from "@/lib/tax-engine/stock-transfer/valuation-165-4-basis";
import { isSection165_4EraUnsupported } from "@/lib/tax-engine/stock-transfer/valuation-165-4-basis";
import { isSection165_4_1ReversalCorp } from "@/lib/tax-engine/stock-transfer/section165-4-reversal-corp";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";
import {
  isBeforePpiSeries,
  isPreDeemedPurchase,
  PRE_DEEMED_PPI_RATIO_REQUIRED_MESSAGE,
} from "@/lib/tax-engine/stock-transfer/stock-pre-deemed-acquisition";
import {
  requiredUnlistedValuationKeys,
  type UnlistedValuationKey,
} from "@/lib/calc/stock-transfer-required-inputs";

type StockInput = z.infer<typeof stockTransferInputSchema>;

const UNLISTED_VALUATION_LABEL: Record<UnlistedValuationKey, string> = {
  transferYearNetIncomePerShare: "양도연도 1주당 순손익가치를",
  transferYearNetAssetPerShare: "양도연도 1주당 순자산가치를",
  acquisitionYearNetIncomePerShare: "취득연도 1주당 순손익가치를",
  acquisitionYearNetAssetPerShare: "취득연도 1주당 순자산가치를",
  acqFaceValuePerShare: "취득시점 1주당 액면가(소득세법 §99①4호 후단)를",
};

/** 취득 후 상장 간이 입력(상세 모드 아님) — ⑧ step2 `post_listing` simple 분기와 같은 5칸 */
const POST_LISTING_SIMPLE_REQUIRED = [
  ["listingDatePriceAvg1Month", "상장일 이후 1개월 종가평균을"],
  ["listingYearNetIncomePerShare", "상장연도 1주당 순손익가치를"],
  ["listingYearNetAssetPerShare", "상장연도 1주당 순자산가치를"],
  ["acquisitionYearNetIncomePerShare", "취득연도 1주당 순손익가치를"],
  ["acquisitionYearNetAssetPerShare", "취득연도 1주당 순자산가치를"],
] as const;

/**
 * 단일 모드(분할·다건 lot이 아닌 입력)의 필수 입력과 §165④ 연혁 차단.
 * 분할/다건 lot 모드는 `splitOrLots`로 건너뛴다 — 그쪽은 lot별 규칙이 따로 있다.
 */
export function refineSingleModeRequiredInputs(data: StockInput, ctx: z.RefinementCtx): void {
  const splitOrLots =
    (data.acquisitionLots?.length ?? 0) > 0 ||
    (data.transferLots?.length ?? 0) > 0 ||
    data.costAllocationMethod !== undefined ||
    (data.acquisitionActualInputMode ?? "per_share") === "lots";
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  // 순자산 단독(§165④3 사유 · §165⑧1호 후단 라목)이면 순손익가치를 요구하지 않는다 — 엔진과 같은 leaf.
  // 평가 시점마다 따로다(양도 당시 · 취득 당시 — 계획서 §14).
  const naFacts = {
    netAssetOnlyReason: data.netAssetOnlyReason,
    acquisitionNetAssetOnlyReason: data.acquisitionNetAssetOnlyReason,
    isHeavyRealEstateForRate: data.isHeavyRealEstateForRate as boolean | undefined,
    transferDate: toOptionalDate(data.transferDate),
  };
  const niSkip = {
    transfer: resolveNetAssetOnlyBasis(naFacts, "transfer") !== undefined,
    acquisition: resolveNetAssetOnlyBasis(naFacts, "acquisition") !== undefined,
  };
  // S-1c-3 2단계 — 2000.4.2. 이전 양도분은 §165④ 보충적 평가 산식이 달라 계산하지 않는다(⑧ 같은 조건·문구).
  // §165④를 부르는 분기(환산 — 비상장·거래정지·취득 후 상장 / 매매사례가액 — 개산공제 기준시가)에서만 막는다.
  const transferDateForEra = toOptionalDate(data.transferDate);
  const eraUnsupported = transferDateForEra !== undefined && isSection165_4EraUnsupported(transferDateForEra);
  // Q-3b — §165④3 사유가 양도일에 없던 사유면 **그 사유를 읽는 시점**의 칸에서 막는다(⑧ 같은 술어·문구).
  if (!eraUnsupported && !splitOrLots) {
    const listedForReason = ["kospi", "kosdaq", "konex"].includes(data.marketType as string);
    const reads = netAssetOnlyReasonSidesRead({
      acquisitionMode: data.acquisitionMode,
      listed: listedForReason,
      haltAtTransfer: data.tradingHaltAtTransfer === true,
      haltAtAcquisition: data.tradingHaltAtAcquisition === true,
      acqFaceValueOnly: data.acqFaceValueOnly === true,
      donorConversion:
        data.acquisitionCause === "carryover_gift" &&
        data.donorAcquisitionMethod === "estimated" &&
        data.acquisitionMode !== "estimated",
    });
    if (reads.transfer && !isNetAssetOnlyReasonInEra(data.netAssetOnlyReason, transferDateForEra))
      issue("netAssetOnlyReason", UNLISTED_MESSAGES.NET_ASSET_ONLY_REASON_ERA);
    if (reads.acquisition && !isNetAssetOnlyReasonInEra(data.acquisitionNetAssetOnlyReason, transferDateForEra))
      issue("acquisitionNetAssetOnlyReason", UNLISTED_MESSAGES.NET_ASSET_ONLY_REASON_ERA);
  }
  if (!splitOrLots) {
    if (
      data.transferPriceMode === "actual" &&
      data.transferActualInputMode === "per_share" &&
      !((data.perShareTransferPrice ?? 0) > 0)
    )
      issue("perShareTransferPrice", "1주당 양도가액을 입력하세요");
    if (
      data.transferPriceMode === "exchange" &&
      !((data.exchangePropertyValue ?? 0) > 0) &&
      !((data.exchangeDebtRelief ?? 0) > 0) &&
      !((data.exchangeCash ?? 0) > 0)
    )
      issue("exchangePropertyValue", "교환 양도가액: 부동산 가액·채무면제액·현금 중 1개 이상 양수로 입력하세요");
    if (data.acquisitionMode === "actual") {
      if (data.acquisitionActualInputMode === "total") {
        if (!((data.acquisitionTotalPrice ?? 0) > 0)) issue("acquisitionTotalPrice", "취득가액 합계를 입력하세요");
      } else if (data.perShareAcquisitionPrice === undefined) {
        // ⑧은 0을 허용한다(무상 취득 등) — 빈 값만 막는다.
        issue("perShareAcquisitionPrice", "1주당 취득가액을 입력하세요");
      }
    }
  }
  // 소칙 §81④1호 월할 가산 — 동일 사업연도 토글이면 전전사업연도 평가가 필요하다.
  if (data.acquisitionMode === "estimated" && data.unlistedSameBizYearToggle === true) {
    if (!niSkip.transfer && data.prePriorYearNetIncomePerShare === undefined)
      issue("prePriorYearNetIncomePerShare", "전전사업연도 1주당 순손익가치를 입력하세요 (소득세법 시행규칙 §81④1호)");
    if (data.prePriorYearNetAssetPerShare === undefined)
      issue("prePriorYearNetAssetPerShare", "전전사업연도 1주당 순자산가치를 입력하세요 (소득세법 시행규칙 §81④1호)");
  }
  // 납부지연가산세 — 법정납부기한이 경과일수 기산점이다(국세기본법 §47의4①1호). 없으면 엔진이 0.
  if ((data.unpaidTax ?? 0) > 0 && !data.paymentDeadline)
    issue("paymentDeadline", "납부지연가산세를 계산하려면 법정납부기한이 필요합니다 (국세기본법 §47의4①1호)");

  // ── 2차(B5·B6·B8~B11) — 환산·매매사례 입력. 비우면 엔진이 0으로 읽어 취득가액이 조용히 바뀌었다.
  // ⑧ `stock-transfer-tax-validate-step2.ts`와 같은 조건(분할 모드는 거기서도 먼저 끝난다).
  // 순손익가치 0은 적법(결손 법인)이라 **존재**만 본다 — 키 집합은 ⑧과 공용 술어.
  if (!splitOrLots && data.acquisitionMode === "estimated") {
    const listed = ["kospi", "kosdaq", "konex"].includes(data.marketType as string);
    // 비상장·기타자산 또는 양도일 거래정지 → 양·취 보충평가 / 취득일 거래정지 → 취득측만(시행령 §165③·④)
    const scope = !listed || data.tradingHaltAtTransfer
      ? ("both" as const)
      : data.tradingHaltAtAcquisition
        ? ("acquisition" as const)
        : null;
    if (eraUnsupported && (scope || (listed && data.acquiredBeforeListing)))
      issue("acquisitionMode", UNLISTED_MESSAGES.SECTION_165_4_ERA_UNSUPPORTED);
    if (scope) {
      for (const key of requiredUnlistedValuationKeys({
        scope,
        niSkip,
        acqFaceValueOnly: data.acqFaceValueOnly === true,
      })) {
        if (data[key] === undefined)
          issue(key, `${UNLISTED_VALUATION_LABEL[key]} 입력하세요 (소득세법 시행령 §165④ 보충적 평가)`);
      }
    }
    // Q-4b — 양도기준시가(1주당 보충평가액) 0 이하면 환산 산식의 분모가 0이다. ⑧과 같은 술어·문구.
    // 결산서 모드도 ④ 어댑터가 집계한 값을 같은 필드로 싣는다.
    if (scope === "both" && !eraUnsupported) {
      const td = toOptionalDate(data.transferDate);
      const na = data.transferYearNetAssetPerShare;
      const ni = data.transferYearNetIncomePerShare;
      if (
        td &&
        na !== undefined &&
        (niSkip.transfer || ni !== undefined) &&
        isTransferSupplementaryNonPositive(
          ni ?? 0,
          na,
          isSection165_4_1ReversalCorp({
            isHeavyRealEstateForValuation: data.isHeavyRealEstateForValuation as boolean | undefined,
            isQualifyingBlockShareholder: data.isQualifyingBlockShareholder as boolean | undefined,
            blockShareholderRealEstateRatio: data.blockShareholderRealEstateRatio as number | undefined,
            isHeavyRealEstateForRate: data.isHeavyRealEstateForRate as boolean | undefined,
          }),
          td,
          niSkip.transfer,
        )
      )
        issue("transferYearNetAssetPerShare", UNLISTED_MESSAGES.TRANSFER_STD_NON_POSITIVE);
    }
    // 취득 후 상장 간이 입력(시행령 §165⑤) — 상세 모드(`postListingDetail`)는 결산 원자료로 따로 온다.
    if (listed && data.acquiredBeforeListing && !data.tradingHaltAtTransfer && !data.postListingDetail) {
      for (const [key, label] of POST_LISTING_SIMPLE_REQUIRED) {
        if (data[key] === undefined) issue(key, `${label} 입력하세요 (소득세법 시행령 §165⑤)`);
      }
    }
  }
  // 매매사례가액(시행령 §176의2③1호) — 사례가액 또는 1주당 취득가액 중 하나(⑧ step2 R-1').
  if (
    !splitOrLots &&
    data.acquisitionMode === "sale_case" &&
    !((data.acquisitionMarketSamplePrice ?? 0) > 0) &&
    !((data.perShareAcquisitionPrice ?? 0) > 0)
  )
    issue("acquisitionMarketSamplePrice", "취득 매매사례 1주당 가액을 입력하세요 (소득세법 시행령 §176의2③1호)");
  // 의제취득일 축(영 §162⑦) — 입력은 엔진 단위(0~1 소수)라 leaf에 그대로 넘기고 날짜만 Date화한다
  const is94_4 = isSection94_4Asset({
    marketType: data.marketType as string | undefined,
    isHeavyRealEstateForRate: data.isHeavyRealEstateForRate as boolean | undefined,
    isQualifyingBlockShareholder: data.isQualifyingBlockShareholder as boolean | undefined,
    blockShareholderRealEstateRatio: data.blockShareholderRealEstateRatio as number | undefined,
    blockShareholderOwnershipRatio: data.blockShareholderOwnershipRatio as number | undefined,
    cumulativeTransferRatio: data.cumulativeTransferRatio as number | undefined,
    aggregationFirstTransferDate: toOptionalDate(data.aggregationFirstTransferDate),
    transferDate: toOptionalDate(data.transferDate),
  });
  // 영 §176의2④2호 — 1965.01 이전 취득의 ②는 PPI 계열 밖이라 직접 입력 배율이 필요하다(Z-1). ⑧ step2와 같은 규칙.
  if (
    !splitOrLots &&
    isBeforePpiSeries(data.acquisitionDate as string | Date | undefined) &&
    isPreDeemedPurchase({
      marketType: data.marketType as string | undefined,
      acquisitionCause: data.acquisitionCause,
      acquisitionDate: data.acquisitionDate as string | Date | undefined,
      is94_4,
      isSplitOrLots: false,
    }) &&
    // ②가 산정되는 입력일 때만 — 실가 모드는 항상, 환산·매매사례 모드는 실가를 함께 입력한 경우
    (data.acquisitionMode === "actual" || (data.preDeemedActualPricePerShare ?? 0) > 0) &&
    !((data.preDeemedPpiRatio ?? 0) > 0)
  )
    issue("preDeemedPpiRatio", PRE_DEEMED_PPI_RATIO_REQUIRED_MESSAGE);
  // 영 §163⑨ — 증여·상속 취득가액은 평가액(실가 의제) → 매매사례 불가 · 환산은 장부분실일 때만(국심2007중1761). ⑧ step2와 같은 술어.
  if (
    !splitOrLots &&
    isGiftLikeEstimationBlocked(
      data.acquisitionCause,
      data.acquisitionMode,
      isBookLostAtAcquisition({
        acqFaceValueOnly: data.acqFaceValueOnly === true,
        acqFaceValuePerShare: data.acqFaceValuePerShare,
        marketType: data.marketType as string | undefined,
        tradingHaltAtTransfer: data.tradingHaltAtTransfer === true,
      }),
    )
  )
    issue("acquisitionMode", GIFT_LIKE_ESTIMATION_BLOCKED_MESSAGE);
  // 이월과세 증여자 매매사례 — 상장 제외(영 §176의2③1호 본문 괄호) · ⑧ step1과 같은 규칙
  if (
    data.acquisitionCause === "carryover_gift" &&
    data.donorAcquisitionMethod === "sale_case" &&
    ["kospi", "kosdaq", "konex"].includes(data.marketType as string)
  )
    issue("donorAcquisitionMethod", "상장주식은 매매사례가액을 쓸 수 없습니다 (소득세법 시행령 §176의2③1호 — 주권상장법인 주식등 제외)");
  // 이월과세 증여자 기준 환산의 분모 — ⑧ step2와 같은 조건(비면 A 취득가액 0 → 조용한 과대과세)
  if (
    !splitOrLots &&
    data.acquisitionCause === "carryover_gift" &&
    data.donorAcquisitionMethod === "estimated" &&
    data.acquisitionMode !== "estimated"
  ) {
    const listed = ["kospi", "kosdaq", "konex"].includes(data.marketType as string);
    if (listed && !data.tradingHaltAtTransfer) {
      if (data.transferDatePriceAvg1Month === undefined)
        issue("transferDatePriceAvg1Month", "양도일 이전 1개월 종가 평균을 입력하세요 (이월과세 증여자 기준 환산의 분모 — 시행령 §176의2②1호)");
    } else {
      for (const key of requiredUnlistedValuationKeys({
        scope: "transfer",
        niSkip,
        acqFaceValueOnly: false,
      })) {
        if (data[key] === undefined)
          issue(key, `${UNLISTED_VALUATION_LABEL[key]} 입력하세요 (이월과세 증여자 기준 환산의 분모 — 소득세법 시행령 §165④)`);
      }
    }
  }
  // 매매사례가액 취득의 개산공제 base = 취득당시 기준시가(영 §163⑥4) → §165④ 보충평가 입력 — ⑧ step2와 공용 술어.
  if (
    !splitOrLots &&
    data.acquisitionMode === "sale_case" &&
    !["kospi", "kosdaq", "konex"].includes(data.marketType as string)
  ) {
    if (eraUnsupported) issue("acquisitionMode", UNLISTED_MESSAGES.SECTION_165_4_ERA_UNSUPPORTED);
    for (const key of requiredUnlistedValuationKeys({
      scope: "acquisition",
      niSkip,
      acqFaceValueOnly: false,
    })) {
      if (data[key] === undefined)
        issue(key, `${UNLISTED_VALUATION_LABEL[key]} 입력하세요 (소득세법 시행령 §163⑥4 개산공제 기준시가 · §165④ 보충적 평가)`);
    }
  }
}
