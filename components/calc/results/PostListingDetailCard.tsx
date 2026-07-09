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
        <span className="text-micro uppercase rounded-full bg-violet-200 text-violet-800 px-2 py-0.5">
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
        {post.capitalEventTruncation && (
          <div className="rounded-md border border-rose-200 bg-rose-50/60 px-2 py-1.5 my-1 space-y-0.5 text-rose-800">
            <p className="font-medium">증자·합병 기간 조정 (상증령 §52의2② · §63①1가목 준용 해석)</p>
            <p>
              발생일 {post.capitalEventTruncation.eventDate} — 상장일~발생일 전일 종가만 평균 (포함{" "}
              {post.capitalEventTruncation.includedDays}거래일 · 제외 {post.capitalEventTruncation.excludedDays}일)
            </p>
            <p className="text-amber-700">ⓘ 명문·예규 미확정 해석 적용</p>
          </div>
        )}
        <p>
          상장연도 1주당 가중평균 ={" "}
          <strong>{post.listingYearPerShareValue.toLocaleString()}</strong>
        </p>
        <p>
          취득연도 1주당 가중평균 ={" "}
          <strong>{post.acquisitionYearPerShareValue.toLocaleString()}</strong>
        </p>
        {post.monthlyAccrualDetail && (
          <div className="rounded-md border border-rose-200 bg-rose-50/60 px-2 py-1.5 my-1 space-y-0.5 text-rose-800">
            <p className="font-medium">월할 가산 보정 (소칙 §81④ 1호 — 같은 사업연도 취득·상장)</p>
            <p>
              전전사업연도 1주당 가중평균 ={" "}
              <strong>{post.monthlyAccrualDetail.prePriorYearPerShareValue.toLocaleString()}</strong>
            </p>
            <p>
              보유월수 = <strong>{post.monthlyAccrualDetail.holdingMonths}</strong>개월
              {" "}(취득일~상장일, 1개월 미만 절상)
            </p>
            <p>
              보정 상장일 평가액 = 직전 {post.acquisitionYearPerShareValue.toLocaleString()}
              {" "}+ (직전 − 전전) × 보유월수 ÷ 직전사업연도 월수(
              {post.monthlyAccrualDetail.priorBizYearMonths}) ={" "}
              <strong>{post.monthlyAccrualDetail.adjustedListingYearPerShareValue.toLocaleString()}</strong>
            </p>
          </div>
        )}
        <p>
          환산비율 ={" "}
          {post.monthlyAccrualDetail ? "취득연도 ÷ 보정 상장일 평가액" : "취득연도 ÷ 상장연도"} ={" "}
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
        {result.valuationDetail?.transferDailyModeUsed && (
          <p className="text-caption text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
            ✓ 양도일 직전 1개월 종가 일자별 입력 모드 — 자동 산정 평균{" "}
            <strong>{(result.valuationDetail?.transferDailyAverage ?? 0).toLocaleString()}</strong>
            {" "}을 §163⑨ 환산 분모로 사용
          </p>
        )}
        {result.valuationDetail?.conversionUsedFallback && (
          <p className="text-caption text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1 mt-1">
            ⚠ 양도일 직전 1개월 종가평균 미입력 — 1주당 양도가({(result.valuationDetail?.conversionTransferStd ?? 0).toLocaleString()})를 §163⑨ 환산 분모로 자동 사용.
            정확한 환산을 위해 PostListing 카드의 &quot;양도일 직전 1개월 종가 평균&quot;에 실제 값을 입력하세요.
          </p>
        )}
      </div>

      {/* 80% 하한 미적용 안내 (Round 4 C-05) */}
      <div className="mt-2 pt-2 border-t border-violet-200 text-micro text-violet-700">
        ※ 환산비율 산정에는 80% 하한이 적용되지 않습니다 (양도일 비상장 평가와 별개 — §165④1 단서)
        {post.monthlyAccrualApplied && " · 시행규칙 §81④ 월할 가산 발동"}
      </div>

      {/* 법조문 배지 — G-07 LawArticleModal 통합 */}
      <div className="mt-1 flex flex-wrap gap-1 text-micro">
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
