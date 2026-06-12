/**
 * 비과세 분기 정보용 취득가액 계산 (sibling helper).
 *
 * 비과세 케이스(§94①3 가목 단서 등)에서도 사용자가 입력한 데이터로 취득가액·평가 상세를
 * 결과 카드/신고서에 표시하기 위한 echo 헬퍼. 실 세액(finalTax)에는 영향 없음.
 * 입력 누락·내부 헬퍼 예외 시 안전하게 0/undefined로 fallback.
 *
 * 800줄 정책 회피로 stock-transfer-tax.ts에서 분리.
 */

import type {
  StockTransferInput,
  StockTransferResult,
  LotMatchingDetail,
} from "./types/stock-transfer.types";
import { calcPostListingConversion } from "./stock-valuation-post-listing";
import type { PostListingValuationResult } from "./stock-valuation-post-listing";
import { synthesizePostListingInput } from "./post-listing-flat-adapter";
import { apply163_9Conversion, resolveTransferStd } from "./apply-163-9-conversion";
import { calcListedValuation } from "./stock-valuation-listed";
import {
  calcUnlistedValuation,
  calcFaceValueTransferEstimated,
  calcTransferStdPriceForFaceValue,
  calcAcquisitionStdPerShareSupplementary,
} from "./stock-valuation-unlisted";

export interface InformationalAcquisitionResult {
  acquisitionPrice: number;
  usedEstimatedAcquisition: boolean;
  estimatedBase: number | undefined;
  postListingDetail: PostListingValuationResult | undefined;
  valuationDetail: StockTransferResult["valuationDetail"] | undefined;
}

export function computeInformationalAcquisition(
  input: StockTransferInput,
  transferPrice: number,
  lotMatchingDetail: LotMatchingDetail | undefined,
): InformationalAcquisitionResult {
  const empty: InformationalAcquisitionResult = {
    acquisitionPrice: 0,
    usedEstimatedAcquisition: false,
    estimatedBase: undefined,
    postListingDetail: undefined,
    valuationDetail: undefined,
  };
  try {
    const { shareCount, acquisitionMode } = input;

    if (lotMatchingDetail) {
      return {
        acquisitionPrice: lotMatchingDetail.totalAcquisitionPrice,
        usedEstimatedAcquisition: false,
        estimatedBase: undefined,
        postListingDetail: undefined,
        valuationDetail: {
          method: "actual_acquisition",
          netAssetFloorApplied: false,
          finalPerShareValue:
            lotMatchingDetail.weightedAvgPerShare ??
            (lotMatchingDetail.matched[0]?.perShareBuyPrice ?? 0),
        },
      };
    }

    if (
      acquisitionMode === "actual" ||
      acquisitionMode === "sale_case"
    ) {
      const per = input.perShareAcquisitionPrice ?? 0;
      return {
        acquisitionPrice: per * shareCount,
        usedEstimatedAcquisition: false,
        estimatedBase: undefined,
        postListingDetail: undefined,
        valuationDetail: {
          method: "actual_acquisition",
          netAssetFloorApplied: false,
          finalPerShareValue: per,
        },
      };
    }

    if (acquisitionMode === "face_value") {
      const faceValue = input.faceValuePerShare ?? 0;
      if (faceValue <= 0) return empty;
      const transferStdResult = calcTransferStdPriceForFaceValue(input);
      const price = calcFaceValueTransferEstimated(transferPrice, faceValue, transferStdResult.perShare);
      return {
        acquisitionPrice: price,
        usedEstimatedAcquisition: true,
        estimatedBase: faceValue * shareCount,
        postListingDetail: undefined,
        valuationDetail: {
          method: "face_value",
          netAssetFloorApplied: transferStdResult.netAssetFloorApplied,
          netAssetFloorValue: transferStdResult.netAssetFloorValue,
          finalPerShareValue: faceValue,
        },
      };
    }

    if (acquisitionMode === "estimated") {
      if (input.acquiredBeforeListing) {
        const synthesizedInput = synthesizePostListingInput(input);
        const r = calcPostListingConversion(synthesizedInput);
        // §163⑨ 환산 합성 — 양도가 × (취득기준 / 양도기준). transferStd 미입력 시 1주당 양도가 fallback.
        const acqStdPerShare = r.finalPerShareValue;
        const { transferStd } = resolveTransferStd(transferPrice, shareCount, input.transferDatePriceAvg1Month);
        const acquisitionPrice = apply163_9Conversion(
          transferPrice, acqStdPerShare, transferStd, r.totalAcquisitionPrice,
        );
        return {
          acquisitionPrice,
          usedEstimatedAcquisition: true,
          estimatedBase: acqStdPerShare * shareCount,
          postListingDetail: r,
          valuationDetail: {
            method: "post_listing_conversion",
            netAssetFloorApplied: false,
            finalPerShareValue: acqStdPerShare,
          },
        };
      }
      if (input.tradingHaltAtTransfer || input.marketType === "unlisted") {
        const r = calcUnlistedValuation(input, transferPrice);
        return {
          acquisitionPrice: r.totalAcquisitionPrice,
          usedEstimatedAcquisition: true,
          estimatedBase: r.acquisitionStdPriceTotal,
          postListingDetail: undefined,
          valuationDetail: {
            method: r.method === "net_asset_only" ? "net_asset_only" : "weighted_avg",
            netAssetFloorApplied: r.netAssetFloorApplied,
            netAssetFloorValue: r.netAssetFloorValue,
            finalPerShareValue: r.perShareValue,
            weightedAvgPerShare: r.weightedAvgRaw !== undefined ? Math.floor(r.weightedAvgRaw) : undefined,
          },
        };
      }
      if (input.tradingHaltAtAcquisition) {
        // [C-1] 취득일 거래정지 mirror — 본체 분기(stock-transfer-tax.ts)와 동일 산식
        const acqSide = calcAcquisitionStdPerShareSupplementary(input);
        const haltTransferStd = Math.floor(input.transferDatePriceAvg1Month ?? 0);
        const haltAcqPrice =
          acqSide.perShare > 0 && haltTransferStd > 0
            ? Number((BigInt(transferPrice) * BigInt(acqSide.perShare)) / BigInt(haltTransferStd))
            : 0;
        return {
          acquisitionPrice: haltAcqPrice,
          usedEstimatedAcquisition: true,
          estimatedBase: acqSide.perShare * shareCount,
          postListingDetail: undefined,
          valuationDetail: {
            method: "halt_acquisition_conversion",
            netAssetFloorApplied: false,
            finalPerShareValue: acqSide.perShare,
            conversionAcqStdPerShare: acqSide.perShare,
            conversionTransferStd: haltTransferStd,
          },
        };
      }
      const r = calcListedValuation(input, transferPrice);
      return {
        acquisitionPrice: r.totalAcquisitionPrice,
        usedEstimatedAcquisition: true,
        estimatedBase: r.stdPriceTotalForEstimatedDeduction,
        postListingDetail: undefined,
        valuationDetail: {
          method: "monthly_avg_listed",
          netAssetFloorApplied: false,
          finalPerShareValue: r.perShareAcquisitionPrice,
        },
      };
    }

    return empty;
  } catch {
    return empty;
  }
}
