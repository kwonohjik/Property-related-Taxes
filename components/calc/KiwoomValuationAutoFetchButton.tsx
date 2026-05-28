"use client";

/**
 * KiwoomValuationAutoFetchButton — F-01 §63①1가목 상속·증여 평가 자동조회.
 *
 * 평가기준일(상속개시일·증여일) 전후 2개월 종가 평균을 자동 산정 → listedStockAvgPrice mirror.
 *
 * variant:
 *   - "card" (기본): 헤더+설명+버튼+결과 카드 통합 sky 박스 (기존 동작).
 *   - "inline": 버튼만 단독 렌더. disabled 사유·error·결과 카드는 부모가 별도 위치에 노출.
 *
 * 정책:
 *   - useEffect → store 미러링 0건 (onClick 핸들러 직접)
 *   - 자동 fallback 채움 0건
 *   - 비상장·거래정지 종목 활성화 차단
 *   - onResponse 있으면 onFill 호출 skip (stale closure 방지)
 *
 * Plan: docs/00-pm/listed-stock-security-info-layout-reorder.plan.md §3 Step B-2/B-4
 */

import type { KiwoomValuation2MonthResponse } from "@/lib/calc/listed-stock-besshi";
import { useKiwoomValuationFetch } from "@/components/calc/inheritance/listed-stock/useKiwoomValuationFetch";
import { KiwoomValuationResultCard } from "@/components/calc/inheritance/listed-stock/KiwoomValuationResultCard";

interface Props {
  stockCode: string;
  valuationDate: string; // 상속개시일 또는 증여일
  /**
   * 평균가·종목명 patch 콜백 (선택).
   * onResponse 가 제공된 경우 호출자가 모든 patch를 책임하므로 본 콜백은 호출되지 않음
   * (stale closure 덮어쓰기 방지 — listed-stock-besshi-page2-empty-bug-fix.plan §2).
   */
  onFill?: (patch: { listedStockAvgPrice: number; stockName?: string }) => void;
  /**
   * 응답 전체를 받아 4그룹 분할 등 별지부표 echo channel-fill에 사용 (선택).
   * onFill 과 동시 전달 시 onResponse 만 호출.
   */
  onResponse?: (response: KiwoomValuation2MonthResponse) => void;
  /** §52의2② 평가구간 단축 — capitalIncreaseDate || mergerDate ∈ [D−2월, D] 일 때 전달 (선택). */
  startOverrideDate?: string;
  /** 종목명 자동 갱신 여부 (true 시 응답의 stockName으로 덮어쓰기) */
  syncName?: boolean;
  /** 렌더 형태 — "card" 기본(헤더+버튼+결과 통합), "inline" 버튼만. */
  variant?: "card" | "inline";
}

export function KiwoomValuationAutoFetchButton({
  stockCode,
  valuationDate,
  onFill,
  onResponse,
  startOverrideDate,
  syncName = false,
  variant = "card",
}: Props) {
  const {
    loading,
    error,
    info,
    showDetail,
    canFetch,
    disabledReason,
    fetch,
    setShowDetail,
  } = useKiwoomValuationFetch({
    stockCode,
    valuationDate,
    onFill,
    onResponse,
    startOverrideDate,
    syncName,
  });

  const button = (
    <button
      type="button"
      disabled={!canFetch}
      onClick={fetch}
      className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700 disabled:bg-sky-200 disabled:text-sky-500 disabled:cursor-not-allowed"
      title={disabledReason ?? "전후 2개월 평균 자동 계산"}
    >
      {loading ? "🔄 조회 중..." : "🔍 키움 자동조회"}
    </button>
  );

  if (variant === "inline") {
    // inline — 버튼만 렌더. disabled 사유·error·결과 카드는 부모가 별도 위치에 노출.
    return button;
  }

  // card (기본) — 헤더+설명+버튼+결과 카드 통합 sky 박스 (기존 동작)
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-sky-900">
          <p className="font-semibold">키움증권 자동조회 (전후 2개월 평균)</p>
          <p className="text-xs text-sky-700 mt-0.5">
            종목코드 + 평가기준일 입력 후 클릭 시 전후 2개월 종가 단순평균이 자동 계산됩니다 (§63①1가).
          </p>
        </div>
        {button}
      </div>
      {disabledReason && !loading && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          ⚠️ {disabledReason}
        </p>
      )}
      <KiwoomValuationResultCard
        info={info}
        error={error}
        valuationDate={valuationDate}
        showDetail={showDetail}
        onToggleDetail={() => setShowDetail((v) => !v)}
      />
    </div>
  );
}
