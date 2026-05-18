"use client";

/**
 * PostListingFormulaPreview — 취득 후 상장 환산 미리보기 (Phase G + P2 G-02·G-05 분리).
 *
 * 6단계 환산 산출 표시:
 *   [1] 종가 1개월 평균 (H-01)
 *   [2] 상장연도 1주당 가중평균 (H-02 + H-03 + H-04)
 *   [3] 취득연도 1주당 가중평균 (full/listing_only 분기)
 *   [4] 환산비율 + 1주당 취득기준시가 + 총취득가
 *
 * D-12 점진적 표시 (M-08 placeholder 표준):
 *   - 단계별 미완 시 회색 placeholder 표시
 *   - 입력 완성도에 따라 자동 단계 활성화
 *
 * 이중 진실 차단 — H-01·H-02·H-03·H-04 엔진 함수 직접 import.
 */

import { useMemo } from "react";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import {
  calcUnlistedPerShareWeighted,
} from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import {
  adaptFlatToPostListingDetail,
  buildPostListingFromDetail,
} from "@/lib/tax-engine/stock-transfer/post-listing-flat-adapter";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface PostListingFormulaPreviewProps {
  form: StockTransferFormData;
}

interface StageData {
  listingAvg: number;
  listingNI: number;
  listingNA: number;
  acqNI: number;
  acqNA: number;
  listingEval: number;
  acqEval: number;
  ratio: number;
  perShareStdPrice: number;
  totalAcqPrice: number;
  shareCount: number;
  isHeavyRE: boolean;
}

function PlaceholderRow({ message }: { message: string }) {
  return (
    <p className="text-xs text-muted-foreground italic">{message}</p>
  );
}

export function PostListingFormulaPreview({ form }: PostListingFormulaPreviewProps) {
  const mode = form.unlistedDetailMode || "simple";
  const isHeavyRE = form.isHeavyRealEstateForValuation;
  const shareCount = parseInt(form.shareCount || "0", 10);

  // 입력값 합성 (mode별)
  const data = useMemo<Partial<StageData>>(() => {
    let listingAvg: number;
    let listingNI: number;
    let listingNA: number;
    let acqNI: number;
    let acqNA: number;

    if (mode === "simple") {
      listingAvg = parseAmount(form.listingDatePriceAvg1Month);
      listingNI = parseAmount(form.listingYearNetIncomePerShare);
      listingNA = parseAmount(form.listingYearNetAssetPerShare);
      acqNI = parseAmount(form.acquisitionYearNetIncomePerShare);
      acqNA = parseAmount(form.acquisitionYearNetAssetPerShare);
    } else {
      const detail = adaptFlatToPostListingDetail(form);
      const synth = buildPostListingFromDetail(detail);
      listingAvg = synth.listingDatePriceAvg1Month || parseAmount(form.listingDatePriceAvg1Month);
      listingNI = synth.listingYearNetIncomePerShare || parseAmount(form.listingYearNetIncomePerShare);
      listingNA = synth.listingYearNetAssetPerShare || parseAmount(form.listingYearNetAssetPerShare);
      if (mode === "full") {
        acqNI = synth.acquisitionYearNetIncomePerShare;
        acqNA = synth.acquisitionYearNetAssetPerShare;
      } else {
        acqNI = parseAmount(form.acquisitionYearNetIncomePerShare);
        acqNA = parseAmount(form.acquisitionYearNetAssetPerShare);
      }
    }

    // 단계별 활성화 — 단계별로 정의된 임계 부분 입력 시도
    const stage1Active = listingAvg > 0;
    const stage2Active = listingNI > 0 && listingNA > 0;
    const stage3Active = acqNI > 0 && acqNA > 0;

    const listingEval = stage2Active ? calcUnlistedPerShareWeighted(listingNI, listingNA, isHeavyRE) : 0;
    const acqEval = stage3Active ? calcUnlistedPerShareWeighted(acqNI, acqNA, isHeavyRE) : 0;

    const stage4Active = stage1Active && stage2Active && stage3Active && listingEval > 0;
    const ratio = stage4Active ? acqEval / listingEval : 0;
    const perShareStdPrice = stage4Active ? Math.floor(listingAvg * ratio) : 0;
    const totalAcqPrice = stage4Active && shareCount > 0 ? perShareStdPrice * shareCount : 0;

    return {
      listingAvg, listingNI, listingNA, acqNI, acqNA,
      listingEval, acqEval, ratio,
      perShareStdPrice, totalAcqPrice, shareCount, isHeavyRE,
    };
  }, [form, mode, isHeavyRE, shareCount]);

  return (
    <div className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-3 text-sm">
      <p className="font-semibold text-violet-800 mb-2">환산취득가 미리보기</p>

      <div className="space-y-2 text-violet-700 text-xs">
        {/* [1] 종가 평균 */}
        <div>
          <p className="font-medium text-violet-800">[1] 종가 1개월 평균</p>
          {(data.listingAvg ?? 0) > 0 ? (
            <p>
              상장일 이후 1개월 종가평균 ={" "}
              <strong>{(data.listingAvg ?? 0).toLocaleString()}</strong>
            </p>
          ) : (
            <PlaceholderRow message="거래일별 종가 입력 시 평균이 표시됩니다" />
          )}
        </div>

        {/* [2] 상장연도 가중평균 */}
        <div>
          <p className="font-medium text-violet-800">[2] 상장연도 1주당 가중평균</p>
          {(data.listingEval ?? 0) > 0 ? (
            <p>
              = {(data.listingNI ?? 0).toLocaleString()}×{isHeavyRE ? "2/5" : "3/5"} +{" "}
              {(data.listingNA ?? 0).toLocaleString()}×{isHeavyRE ? "3/5" : "2/5"} ={" "}
              <strong>{(data.listingEval ?? 0).toLocaleString()}</strong>
            </p>
          ) : (
            <PlaceholderRow message="상장연도 결산서 입력 완료 시 1주당 가중평균이 표시됩니다" />
          )}
        </div>

        {/* [3] 취득연도 가중평균 */}
        <div>
          <p className="font-medium text-violet-800">[3] 취득연도 1주당 가중평균</p>
          {(data.acqEval ?? 0) > 0 ? (
            <p>
              = {(data.acqNI ?? 0).toLocaleString()}×{isHeavyRE ? "2/5" : "3/5"} +{" "}
              {(data.acqNA ?? 0).toLocaleString()}×{isHeavyRE ? "3/5" : "2/5"} ={" "}
              <strong>{(data.acqEval ?? 0).toLocaleString()}</strong>
            </p>
          ) : (
            <PlaceholderRow message="취득연도 결산서 입력 완료 시 환산비율이 표시됩니다" />
          )}
        </div>

        {/* [4] 환산비율 + 1주당 + 총취득가 */}
        <div>
          <p className="font-medium text-violet-800">[4] 환산비율 → 1주당 취득기준시가 → 총취득가</p>
          {(data.perShareStdPrice ?? 0) > 0 ? (
            <div className="space-y-0.5">
              <p>
                환산비율 = {(data.acqEval ?? 0).toLocaleString()} ÷{" "}
                {(data.listingEval ?? 0).toLocaleString()} ={" "}
                <strong>{(data.ratio ?? 0).toFixed(5)}</strong>
              </p>
              <p>
                1주당 취득기준시가 = 종가평균 {(data.listingAvg ?? 0).toLocaleString()} ×{" "}
                {(data.ratio ?? 0).toFixed(5)} ={" "}
                <strong>{(data.perShareStdPrice ?? 0).toLocaleString()}</strong>
              </p>
              {(data.shareCount ?? 0) > 0 && (
                <p className="text-violet-900 font-medium">
                  취득가액 = {(data.perShareStdPrice ?? 0).toLocaleString()} ×{" "}
                  {(data.shareCount ?? 0).toLocaleString()}주 ={" "}
                  <strong>{(data.totalAcqPrice ?? 0).toLocaleString()}</strong>
                </p>
              )}
            </div>
          ) : (
            <PlaceholderRow message="위 3단계 완료 시 1주당 취득기준시가가 표시됩니다" />
          )}
        </div>
      </div>

      {/* 80% 하한 미적용 안내 (D-12 강화) */}
      <div className="mt-3 pt-2 border-t border-violet-200 text-[10px] text-violet-600">
        ※ 환산비율 산정에는 80% 하한이 적용되지 않습니다 (양도일 비상장 평가와 별개 — §165④1 단서)
      </div>
    </div>
  );
}
