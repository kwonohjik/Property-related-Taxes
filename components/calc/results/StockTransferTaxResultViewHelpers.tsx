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

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-5 py-4 space-y-2">
      <p className="font-semibold text-amber-800 text-sm">환산취득가 산식 분해 (소령 §165⑤)</p>
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
      </div>
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

export function RuleBadges({ appliedRules }: { appliedRules: StockTransferResult["appliedRules"] }) {
  if (!appliedRules || appliedRules.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {appliedRules.map((rule) => (
        <span
          key={rule}
          className={`px-2 py-0.5 rounded border text-xs font-medium ${
            RULE_BADGE[rule] ?? "bg-slate-100 text-slate-600 border-slate-200"
          }`}
        >
          {rule}
        </span>
      ))}
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
