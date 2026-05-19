"use client";

/**
 * ExitTaxResultCard — 국외전출세 결과 카드 (PR-4B, ⑦ 동기화 지점)
 *
 * 법령: 소득세법 §118의9~§118의16 (2026.4.21. 시행)
 *
 * 결과 산식 한국어 풀어쓰기 (feedback_result_view_korean_formula):
 *   - 변수 약어·floor() 금지
 *   - 법정 용어 우선 (산출세액·과세표준·양도소득금액)
 *   - 숫자 끝 "원" 단위 표기 금지 (feedback_no_won_suffix)
 *
 * ExitTaxResult 타입: @/lib/tax-engine/stock-transfer/types/exit-tax.types
 */

import type {
  ExitTaxResult,
  ExitTaxHoldingResult,
} from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";

interface ExitTaxResultCardProps {
  result: ExitTaxResult;
}

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

// ── 항목 행 ──
function Row({
  label,
  value,
  sub,
  highlight,
  indent,
  warn,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
  indent?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-start justify-between py-1.5",
        indent ? "pl-4" : "",
        highlight ? "font-semibold text-sky-800" : warn ? "text-rose-700" : "text-slate-700",
      ].join(" ")}
    >
      <span className="text-sm leading-relaxed">{label}</span>
      <div className="text-right ml-4 shrink-0">
        <span className="text-sm tabular-nums">
          {typeof value === "number" ? fmt(value) : value}
        </span>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-slate-200 my-1" />;
}

// ── 요건 충족 배지 ──
function EligibilityBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        ok
          ? "bg-emerald-100 text-emerald-700"
          : "bg-rose-100 text-rose-700",
      ].join(" ")}
    >
      <span>{ok ? "✓" : "✗"}</span>
      {label}
    </span>
  );
}

// ── 종목별 결과 행 ──
function HoldingDetailRow({ h }: { h: ExitTaxHoldingResult }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3 space-y-1 text-xs">
      <p className="font-semibold text-amber-800">{h.stockName}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-600">
        <span>간주양도가액</span>
        <span className="text-right tabular-nums">{fmt(h.departureDayValue)}</span>
        <span className="pl-2 text-slate-400">
          1주당 시가 ({h.valuationMode === "market_price"
            ? "거래가액"
            : h.valuationMode === "prior_year_std"
            ? "기준시가"
            : h.valuationMode === "unlisted_sample"
            ? "매매사례가"
            : "비상장기준시가"})
        </span>
        <span className="text-right tabular-nums text-slate-400">
          {fmt(h.departureDayValuePerShare)}
        </span>
        <span>취득가액</span>
        <span className="text-right tabular-nums">{fmt(h.acquisitionCost)}</span>
        <span className={h.transferGain >= 0 ? "font-medium text-slate-700" : "font-medium text-rose-600"}>
          양도차익
        </span>
        <span
          className={[
            "text-right tabular-nums font-medium",
            h.transferGain >= 0 ? "text-slate-700" : "text-rose-600",
          ].join(" ")}
        >
          {h.transferGain < 0 ? "▼ " : ""}{fmt(Math.abs(h.transferGain))}
        </span>
      </div>
    </div>
  );
}

export function ExitTaxResultCard({ result }: ExitTaxResultCardProps) {
  // ── 납세의무 없음 ──
  if (!result.isLiable) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-sm font-semibold text-amber-800">납세의무 없음 (§118의9)</span>
          <EligibilityBadge label="거주자 요건" ok={result.residencyEligible} />
          <EligibilityBadge label="대주주 요건" ok={result.majorShareholderEligible} />
        </div>
        <p className="text-sm text-amber-700 leading-relaxed">
          {result.ineligibleReason ?? "§118의9① 요건 미충족으로 납세의무가 없습니다."}
        </p>
        <p className="text-xs text-amber-600 mt-2">세액: 0</p>
      </div>
    );
  }

  const hasAdjDeduction =
    result.adjustmentDeduction !== undefined && result.adjustmentDeduction > 0;
  const hasForeignCredit =
    result.foreignTaxCreditApplied !== undefined && result.foreignTaxCreditApplied > 0;
  const hasDomesticCredit =
    result.domesticTaxCreditApplied !== undefined && result.domesticTaxCreditApplied > 0;
  const hasFinalAdj = result.finalTaxAfterAdjustment !== undefined;
  const hasPenalty =
    result.holdingsReportPenalty !== undefined && result.holdingsReportPenalty > 0;

  return (
    <div className="space-y-4">
      {/* ── 요건 충족 배지 ── */}
      <div className="flex gap-2 flex-wrap">
        <EligibilityBadge label="거주자 요건 충족" ok={result.residencyEligible} />
        <EligibilityBadge label="대주주 요건 충족" ok={result.majorShareholderEligible} />
      </div>

      {/* ── 종목별 결과 ── */}
      {result.holdingDetails.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-600">종목별 계산 결과 (§178의9)</p>
          {result.holdingDetails.map((h) => (
            <HoldingDetailRow key={h.id} h={h} />
          ))}
        </div>
      )}

      {/* ── 메인 산식 카드 ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-1">
        <p className="text-sm font-semibold text-slate-700 mb-2">산출세액 계산 (§118의10~§118의11)</p>

        <Row
          label="합산 양도차익 (전 종목 양도차익 합계)"
          value={result.totalTransferGain}
        />
        <Row
          label={`기본공제 (§118의10④ — 연 250만)`}
          value={result.basicDeduction}
          indent
        />
        <Divider />
        <Row
          label="과세표준 = 양도차익 − 기본공제"
          value={result.taxBase}
          highlight
        />

        <div className="mt-2 text-xs text-slate-500 leading-relaxed px-1">
          세율: §118의11 → §104①11가목2) — 과세표준 3억 이하 20%, 초과분 25%
          (누진공제: 3억 초과 시 15,000,000)
        </div>

        <Divider />
        <Row
          label="산출세액 = 과세표준 × 세율 − 누진공제"
          value={result.incomeTax}
          highlight
        />
        <Row
          label="지방소득세 = 산출세액 × 10% (10원 미만 절사)"
          value={result.localIncomeTax}
        />

        {/* ── 납부유예 ── */}
        {result.deferredTaxAmount > 0 && (
          <>
            <Divider />
            <p className="text-xs font-semibold text-slate-500 pt-1">납부유예 (§118의16)</p>
            <Row
              label={`납부유예 세액 (${result.deferralYears}년 유예)`}
              value={result.deferredTaxAmount}
              sub="유예기간 동안 이자상당액 추가 부담"
            />
            {result.deferralInterestNote && (
              <p className="text-xs text-slate-400 px-1 leading-relaxed">
                {result.deferralInterestNote}
              </p>
            )}
          </>
        )}

        {/* ── 경정 후 조정 (실양도 완료 시) ── */}
        {(hasAdjDeduction || hasForeignCredit || hasDomesticCredit) && (
          <>
            <Divider />
            <p className="text-xs font-semibold text-slate-500 pt-1">경정청구 공제 (실양도 완료 시)</p>
            {hasAdjDeduction && (
              <Row
                label="조정공제 (§118의12) = 출국일 시가 - 실양도가액 차이분"
                value={result.adjustmentDeduction!}
                indent
              />
            )}
            {hasForeignCredit && (
              <Row
                label="외국납부세액공제 (§118의13) = min(외국납부세액, 한도)"
                value={result.foreignTaxCreditApplied!}
                indent
              />
            )}
            {hasDomesticCredit && (
              <Row
                label="비거주자 세액공제 (§118의14) = §156①7 원천징수액"
                value={result.domesticTaxCreditApplied!}
                indent
              />
            )}
            {hasFinalAdj && (
              <>
                <Divider />
                <Row
                  label="경정 후 최종세액 = 산출세액 − 조정공제 − 외국납부세액공제"
                  value={result.finalTaxAfterAdjustment!}
                  highlight
                />
              </>
            )}
          </>
        )}

        {/* ── 가산세 ── */}
        {hasPenalty && (
          <>
            <Divider />
            <p className="text-xs font-semibold text-rose-600 pt-1">가산세</p>
            <Row
              label="보유현황 미신고 가산세 (§118의15) = 액면금액 합계 × 2%"
              value={result.holdingsReportPenalty!}
              warn
            />
          </>
        )}
      </div>

      {/* ── 경고·적용 규칙 ── */}
      {result.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
          <p className="text-xs font-semibold text-amber-700">주의사항</p>
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-600 leading-relaxed">
              • {w}
            </p>
          ))}
        </div>
      )}

      {result.appliedRules.length > 0 && (
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-1">
          <p className="text-xs font-semibold text-slate-500">적용 규칙</p>
          {result.appliedRules.map((r, i) => (
            <p key={i} className="text-xs text-slate-400 leading-relaxed">
              • {r}
            </p>
          ))}
        </div>
      )}

      {/* ── 면책 고지 ── */}
      <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 text-[11px] text-slate-400 leading-relaxed">
        국외전출세는 2016.1.1. 도입 후 개정이 잦아 출국일 당시 시행 법령 확인이 필요합니다.
        본 계산 결과는 참고용이며 세무전문가 확인을 권장합니다.
      </div>
    </div>
  );
}
