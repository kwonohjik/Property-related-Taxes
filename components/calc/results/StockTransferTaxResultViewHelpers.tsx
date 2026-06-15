"use client";

/**
 * StockTransferTaxResultView — 서브 컴포넌트 모음 (800줄 분할)
 *
 * ResultRow · EstimatedValuationBreakdown · ProgressiveTaxBreakdown
 * RuleBadges · Warnings · PrRoadmapCard
 *
 * 모두 순수 표시 컴포넌트 — hook 없음.
 */

import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { LawArticleModal } from "@/components/ui/law-article-modal";

export function fmt(n: number): string {
  return n.toLocaleString();
}

// ── ResultRow ──

export function ResultRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex justify-between items-center px-4 py-3 ${
        highlight ? "bg-white" : ""
      }`}
    >
      <span className={`text-sm ${highlight ? "font-medium text-slate-700" : "text-slate-500"}`}>
        {label}
      </span>
      <span
        className={`text-sm tabular-nums ${
          highlight ? "font-semibold text-slate-900" : "text-slate-700"
        }`}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}

// ── EstimatedValuationBreakdown ──

export function EstimatedValuationBreakdown({
  result,
  shareCount,
}: {
  result: StockTransferResult;
  shareCount: number;
}) {
  const detail = result.valuationDetail;
  if (!detail) return null;

  const isTradingHaltBypass = result.appliedRules?.includes("거래정지우회");
  const isHaltAcquisition = detail.method === "halt_acquisition_conversion";

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-5 py-4 space-y-2">
      <p className="font-semibold text-amber-800 text-sm">
        {isHaltAcquisition ? "환산취득가 산식 분해 (소령 §165③·§165④)" : "환산취득가 산식 분해 (소령 §165⑤)"}
      </p>
      {isTradingHaltBypass && (
        <p className="text-xs text-rose-700">
          양도일 거래정지·관리종목 — 소령 §165③에 따라 1개월 종가평균 대신 비상장 보충 평가(§165④)로 환산했습니다.
        </p>
      )}
      {isHaltAcquisition && (
        <p className="text-xs text-rose-700">
          취득일 거래정지·관리종목 — 소령 §165③에 따라 취득시 기준시가만 비상장 보충 평가(§165④)로
          산정했습니다 (양도시 기준시가는 1개월 종가평균 유지).
        </p>
      )}
      <div className="space-y-1 text-xs text-amber-700 font-mono">
        {detail.method === "post_listing_conversion" && detail.weightedAvgPerShare !== undefined && (
          <>
            <p>1주당 취득기준시가 = {fmt(detail.finalPerShareValue)}</p>
            <p>
              취득가액 = {fmt(detail.finalPerShareValue)} × {shareCount.toLocaleString()}주 ={" "}
              <strong>{fmt(result.acquisitionPrice)}</strong>
            </p>
          </>
        )}
        {isHaltAcquisition && detail.conversionAcqStdPerShare !== undefined && (
          <>
            {detail.netAssetOnlyReason ? (
              <p>취득시 보충평가액 (1주당) = 순자산가치 단독 (§165④3) = {fmt(detail.conversionAcqStdPerShare)}</p>
            ) : (
              <p>
                취득시 보충평가액 (1주당) = (순손익가치 {fmt(detail.niPerShare ?? 0)} × {detail.isHeavyRE ? 2 : 3} +
                순자산가치 {fmt(detail.naPerShare ?? 0)} × {detail.isHeavyRE ? 3 : 2}) ÷ 5 ={" "}
                {fmt(detail.conversionAcqStdPerShare)}
              </p>
            )}
            <p>양도시 1개월 종가평균 (1주당) = {fmt(detail.conversionTransferStd ?? 0)}</p>
            <p>
              환산취득가 = 양도가액 × 취득시 보충평가액 ÷ 양도시 1개월 종가평균 ={" "}
              <strong>{fmt(result.acquisitionPrice)}</strong>
            </p>
          </>
        )}
        {result.estimatedBase !== undefined && (
          <p>
            취득기준시가 합계 (개산공제 전) = {fmt(result.estimatedBase)}
          </p>
        )}
        {result.estimatedDeduction !== undefined && result.estimatedDeduction > 0 && (
          <p>
            개산공제 (취득기준시가 × 1%) = {fmt(result.estimatedDeduction)}
          </p>
        )}
        {detail.netAssetFloorApplied && detail.netAssetFloorValue !== undefined && (
          <p className="text-fuchsia-600 font-semibold">
            80% 하한 발동: 가중평균 &lt; 순자산 × 80% → max(가중평균, {fmt(detail.netAssetFloorValue)})
          </p>
        )}
        {detail.section1659Detail && (
          <div className="mt-1 rounded border border-sky-200 bg-sky-50/60 px-2 py-1.5 text-sky-700 not-italic space-y-0.5">
            <p className="font-semibold">§165⑨ 본체 — 양도·취득 기준시가 동일 → 소칙 §81④ 1호 월할 보정</p>
            <p>
              양도 기준시가 보정: {fmt(detail.section1659Detail.prior)} → {fmt(detail.section1659Detail.adjusted)}
            </p>
            <p>
              직전 사업연도 평가 {fmt(detail.section1659Detail.prior)} + (직전 {fmt(detail.section1659Detail.prior)} − 전전{" "}
              {fmt(detail.section1659Detail.prePrior)}) × {detail.section1659Detail.holdingMonths}개월 ÷{" "}
              {detail.section1659Detail.priorBizYearMonths}개월
            </p>
            <p>양도 기준시가가 상향되어 양도차익이 발생합니다 (취득 기준시가는 불변).</p>
          </div>
        )}
      </div>
      {result.swapComparison && (
        <SwapComparisonBlock result={result} />
      )}
    </div>
  );
}

// ── SwapComparisonBlock (B-2 §97②2호 단서) ──

export function SwapComparisonBlock({ result }: { result: StockTransferResult }) {
  const cmp = result.swapComparison;
  if (!cmp) return null;
  const applied = result.swapApplied === true;
  return (
    <div
      className={`mt-2 rounded-lg border px-4 py-3 space-y-1 text-xs ${
        applied
          ? "border-fuchsia-300 bg-fuchsia-50/70 text-fuchsia-800"
          : "border-slate-200 bg-slate-50/60 text-slate-600"
      }`}
    >
      <p className="font-semibold">
        {applied ? "§97②2호 단서 적용 — 실제 필요경비 선택" : "§97②2호 단서 비교 — 본문(개산공제) 적용"}
      </p>
      <div className="font-mono space-y-0.5">
        <p>가목 (환산취득가 + 개산공제) = {fmt(cmp.estimatedSide)}</p>
        <p>나목 (자본적지출 + 양도비) = {fmt(cmp.directSide)}</p>
      </div>
      {applied ? (
        <p>
          나목이 더 크므로 실제 필요경비를 적용합니다. 양도차익 계산에서 환산취득가는 차감되지 않습니다 (양도차익 = 양도가액 − 실제 필요경비).
        </p>
      ) : (
        <p>가목이 나목 이상이므로 환산취득가 + 개산공제를 필요경비로 적용합니다.</p>
      )}
    </div>
  );
}

// ── ProgressiveTaxBreakdown ──

export function ProgressiveTaxBreakdown({ result }: { result: StockTransferResult }) {
  const taxBase = result.taxBase;
  const THRESHOLD = 300_000_000; // 3억

  const lowerPart = Math.min(taxBase, THRESHOLD);
  const upperPart = Math.max(0, taxBase - THRESHOLD);

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-5 py-4 space-y-2">
      <p className="font-semibold text-sky-800 text-sm">누진세율 산식 분해 (§104①11 가목 2)</p>
      <div className="space-y-1 text-xs text-sky-700">
        {upperPart > 0 ? (
          <>
            <p>3억 이하 분: {fmt(lowerPart)} × 20% = {fmt(Math.floor(lowerPart * 0.2))}</p>
            <p>3억 초과 분: {fmt(upperPart)} × 25% = {fmt(Math.floor(upperPart * 0.25))}</p>
            <p>
              산출세액 (누진공제식): 과세표준 {fmt(taxBase)} × 25% − 누진공제 {fmt(result.progressiveDeduction!)} ={" "}
              <strong>{fmt(result.calculatedTax)}</strong>
            </p>
          </>
        ) : (
          <p>
            산출세액: 과세표준 {fmt(taxBase)} × {(result.appliedRate * 100).toFixed(0)}% ={" "}
            <strong>{fmt(result.calculatedTax)}</strong>
          </p>
        )}
      </div>
    </div>
  );
}

// ── RuleBadges ──

const RULE_BADGE: Record<string, string> = {
  "§94②우선": "bg-rose-100 text-rose-700 border-rose-200",
  "80%하한": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  "80%하한미적용": "bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200",
  "단기30%": "bg-rose-100 text-rose-700 border-rose-200",
  "거래정지우회": "bg-amber-100 text-amber-700 border-amber-200",
  "취득일거래정지우회": "bg-amber-100 text-amber-700 border-amber-200",
  "§97②단서swap": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  "KOTC중소중견비과세": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "KOTC벤처비과세": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "월할가산": "bg-sky-100 text-sky-700 border-sky-200",
  "의제취득일적용": "bg-amber-100 text-amber-700 border-amber-200",
  "장부분실액면가": "bg-amber-100 text-amber-700 border-amber-200",
  "기타자산우선§55누진": "bg-sky-100 text-sky-700 border-sky-200",
  "기본공제부동산그룹합산": "bg-sky-100 text-sky-700 border-sky-200",
  "로트개별법": "bg-violet-100 text-violet-700 border-violet-200",
  "로트선입선출": "bg-violet-100 text-violet-700 border-violet-200",
  "로트이동평균": "bg-violet-100 text-violet-700 border-violet-200",
};

// ── RuleBadges → legalBasis 매핑 (UI 레이어, 엔진 무변경) ──
// 기존 RULE_BADGE(tone)와 별개. appliedRules 20종 전수(Record 강제 — 누락 시 컴파일 에러).
// 대주주 판정 세부 3종(F15F16·판정기준일·본인미보유)은 §157/§167의8 세부 항 모호 → 링크 보류("", tone 배지만).
const RULE_BADGE_LAW_MAP: Record<
  NonNullable<StockTransferResult["appliedRules"]>[number],
  string
> = {
  "§94②우선": "소득세법 §94②",
  "80%하한": "소득세법 시행령 §165④1",
  "80%하한미적용": "소득세법 시행령 §165④1",
  "단기30%": "소득세법 §104①11",
  "거래정지우회": "소득세법 시행령 §165③",
  "취득일거래정지우회": "소득세법 시행령 §165③",
  "§97②단서swap": "소득세법 §97②",
  "KOTC중소중견비과세": "소득세법 §94①3 나목 단서",
  "KOTC벤처비과세": "조세특례제한법 §14①7호",
  "월할가산": "소득세법 시행규칙 §81④",
  "의제취득일적용": "소득세법 시행령 §162⑦3호",
  "장부분실액면가": "소득세법 §99①4",
  "기타자산우선§55누진": "소득세법 §55①",
  "기본공제부동산그룹합산": "소득세법 §103②",
  "로트개별법": "소득세법 시행령 §162⑤",
  "로트선입선출": "소득세법 시행령 §162⑤",
  "로트이동평균": "소득세법 시행령 §162⑤",
  "F15F16대차사모펀드자동가산": "",
  "판정기준일특수분기": "",
  "본인미보유강제합산": "",
};

export function RuleBadges({ appliedRules }: { appliedRules: StockTransferResult["appliedRules"] }) {
  if (!appliedRules || appliedRules.length === 0) return null;
  const badgeCls = "px-2 py-0.5 rounded border text-xs font-medium";
  return (
    <div className="flex flex-wrap gap-2">
      {appliedRules.map((rule) => {
        const tone = RULE_BADGE[rule] ?? "bg-slate-100 text-slate-600 border-slate-200";
        const legalBasis = RULE_BADGE_LAW_MAP[rule];
        return legalBasis ? (
          <LawArticleModal key={rule} legalBasis={legalBasis} label={rule} className={`${badgeCls} ${tone}`} />
        ) : (
          <span key={rule} className={`${badgeCls} ${tone}`}>
            {rule}
          </span>
        );
      })}
    </div>
  );
}

// ── Warnings ──

export function Warnings({ warnings }: { warnings: string[] }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 space-y-1">
      {warnings.map((w, i) => (
        <p key={i} className="text-xs text-amber-700">⚠ {w}</p>
      ))}
    </div>
  );
}

// ── PrRoadmapCard ──

export function PrRoadmapCard() {
  type PrStatus = "completed" | "current" | "pending";
  const stages: { label: string; desc: string; status: PrStatus }[] = [
    { label: "PR-1", desc: "상장 대주주·취득 후 상장", status: "completed" },
    { label: "PR-2", desc: "비상장·평가·시기별 연혁", status: "completed" },
    { label: "PR-3", desc: "다자산·가산세·신고서", status: "current" },
    { label: "후속", desc: "§97의2·국외전출세·해외주식", status: "pending" },
  ];

  const styleMap: Record<PrStatus, string> = {
    completed: "border-emerald-300 bg-emerald-50 text-emerald-800",
    current: "border-sky-400 bg-sky-100 text-sky-800",
    pending: "border-slate-200 bg-white text-slate-600 opacity-60",
  };

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-5 py-4">
      <p className="text-sm font-semibold text-sky-800 mb-3">구현 로드맵</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {stages.map((s) => (
          <div
            key={s.label}
            className={`rounded-lg border px-3 py-2 text-center ${styleMap[s.status]}`}
          >
            <p className="text-xs font-bold">{s.label}</p>
            <p className="text-xs mt-0.5">{s.desc}</p>
            {s.status === "completed" && (
              <span className="mt-1 inline-block text-xs bg-emerald-500 text-white px-1 rounded">✓ 완료</span>
            )}
            {s.status === "current" && (
              <span className="mt-1 inline-block text-xs bg-sky-400 text-white px-1 rounded">현재</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
