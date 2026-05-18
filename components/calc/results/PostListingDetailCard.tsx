"use client";

/**
 * PostListingDetailCard — 취득 후 상장 환산 결과 카드 (P2 G-03 분리).
 *
 * 노출 게이트 (Round 4 D-03):
 *   - result.acquiredBeforeListing === true
 *   - result.postListingDetail 존재
 *
 * 표시 항목:
 *   - 모드 배지 (simple/listing_only/full)
 *   - 6 중간값 (종가평균·상장연도·취득연도·환산비율·1주당·총취득가)
 *   - 80% 하한 미적용 안내 + §81④ 월할 가산 echo
 *   - 5 법조문 배지 (LawArticleModal 통합 — G-07)
 */

import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

interface PostListingDetailCardProps {
  result: StockTransferResult;
}

export function PostListingDetailCard({ result }: PostListingDetailCardProps) {
  if (!result.acquiredBeforeListing || !result.postListingDetail) return null;

  const post = result.postListingDetail;

  return (
    <div className="rounded-lg border border-violet-300 bg-violet-50 p-4 space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-violet-900">
          취득 후 상장 환산취득가 (소령 §165⑤)
        </h3>
        <span className="text-[10px] uppercase rounded-full bg-violet-200 text-violet-800 px-2 py-0.5">
          {post.detail?.mode ?? "simple"} mode
        </span>
      </div>

      {/* 6 중간값 */}
      <div className="space-y-1 text-xs text-violet-800">
        {post.detail?.closing && (
          <p>
            상장일 이후 1개월 종가평균 = 합계{" "}
            {post.detail.closing.sum.toLocaleString()} ÷ 거래일{" "}
            {post.detail.closing.tradingDays}일 ={" "}
            <strong>{post.detail.closing.avg.toLocaleString()}</strong>
          </p>
        )}
        <p>
          상장연도 1주당 가중평균 ={" "}
          <strong>{post.listingYearPerShareValue.toLocaleString()}</strong>
        </p>
        <p>
          취득연도 1주당 가중평균 ={" "}
          <strong>{post.acquisitionYearPerShareValue.toLocaleString()}</strong>
        </p>
        <p>
          환산비율 = 취득연도 ÷ 상장연도 ={" "}
          <strong>{post.conversionRatio.toFixed(5)}</strong>
        </p>
        <p className="font-medium">
          1주당 취득기준시가 = 종가평균 × 환산비율 (절사) ={" "}
          <strong>{post.finalPerShareValue.toLocaleString()}</strong>{" "}
          <span className="text-violet-600">(§163⑨ 분자)</span>
        </p>
        <p className="font-medium text-violet-900">
          §163⑨ 환산취득가 = 양도가 × (1주당 취득기준 ÷ 1주당 양도기준)
          <br />
          = <strong>{result.transferPrice.toLocaleString()}</strong> × (
          <strong>{(result.valuationDetail?.conversionAcqStdPerShare ?? post.finalPerShareValue).toLocaleString()}</strong> ÷{" "}
          <strong>{(result.valuationDetail?.conversionTransferStd ?? 0).toLocaleString()}</strong>) ={" "}
          <strong>{result.acquisitionPrice.toLocaleString()}</strong>
        </p>
        {result.valuationDetail?.conversionUsedFallback && (
          <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1 mt-1">
            ⚠ 양도일 직전 1개월 종가평균 미입력 — 1주당 양도가({(result.valuationDetail?.conversionTransferStd ?? 0).toLocaleString()})를 §163⑨ 환산 분모로 자동 사용.
            정확한 환산을 위해 PostListing 카드의 &quot;양도일 직전 1개월 종가 평균&quot;에 실제 값을 입력하세요.
          </p>
        )}
      </div>

      {/* 80% 하한 미적용 안내 (Round 4 C-05) */}
      <div className="mt-2 pt-2 border-t border-violet-200 text-[10px] text-violet-700">
        ※ 환산비율 산정에는 80% 하한이 적용되지 않습니다 (양도일 비상장 평가와 별개 — §165④1 단서)
        {post.monthlyAccrualApplied && " · 시행규칙 §81④ 월할 가산 발동"}
      </div>

      {/* 법조문 배지 — G-07 LawArticleModal 통합 */}
      <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
        <LawArticleModal
          legalBasis="소득세법 시행령 §165 ⑤"
          label="§165⑤"
          className="rounded-full bg-violet-200 text-violet-900 px-2 py-0.5 hover:bg-violet-300"
        />
        <LawArticleModal
          legalBasis="소득세법 시행령 §165 ④ 1호"
          label="§165④1"
          className="rounded-full bg-violet-200 text-violet-900 px-2 py-0.5 hover:bg-violet-300"
        />
        <LawArticleModal
          legalBasis="소득세법 시행규칙 §81 ②"
          label="시행규칙 §81②"
          className="rounded-full bg-violet-200 text-violet-900 px-2 py-0.5 hover:bg-violet-300"
        />
        <LawArticleModal
          legalBasis="상속세 및 증여세법 시행규칙 §17"
          label="상증령 §17"
          className="rounded-full bg-violet-200 text-violet-900 px-2 py-0.5 hover:bg-violet-300"
        />
        <LawArticleModal
          legalBasis="소득세법 시행규칙 §81 ④"
          label="§81④"
          className="rounded-full bg-violet-200 text-violet-900 px-2 py-0.5 hover:bg-violet-300"
        />
      </div>
    </div>
  );
}
