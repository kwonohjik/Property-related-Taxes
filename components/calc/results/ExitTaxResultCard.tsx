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
import { fmt, Row, Divider } from "./exit-tax-result-parts";
import {
  ExitTaxBucketBreakdown,
  ExitTaxExclusionNotice,
  HoldingBucketBadge,
  fxPerShareText,
  hasHoldingBadge,
  isMultiBucketResult,
  shouldShowBucketBreakdown,
} from "./ExitTaxBucketCard";

interface ExitTaxResultCardProps {
  result: ExitTaxResult;
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
function valuationModeLabel(mode: ExitTaxHoldingResult["valuationMode"]): string {
  switch (mode) {
    case "market_price":
      return "거래가액";
    case "prior_year_std":
      return "기준시가";
    case "unlisted_sample":
      return "매매사례가";
    case "foreign_market_price":
      return "외화 거래가액 환산";
    case "foreign_decree_178_3":
      return "영 §178의3 시가 환산";
    default:
      return "비상장기준시가";
  }
}

function HoldingDetailRow({ h, from2027 }: { h: ExitTaxHoldingResult; from2027: boolean }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3 space-y-1 text-xs dark:bg-amber-950/40">
      {/* 호·제외 뱃지는 2027 결과(`scope`·`rateBucket` echo)에서만 — 없으면 종전 마크업 그대로(이름 한 줄) */}
      {hasHoldingBadge(h, from2027) ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-amber-800 dark:text-amber-200">{h.stockName}</p>
          <HoldingBucketBadge h={h} from2027={from2027} />
        </div>
      ) : (
        <p className="font-semibold text-amber-800 dark:text-amber-200">{h.stockName}</p>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-600 dark:text-slate-400">
        <span>간주양도가액</span>
        <span className="text-right tabular-nums">{fmt(h.departureDayValue)}</span>
        <span className="pl-2 text-slate-600 dark:text-slate-400">
          1주당 시가 ({valuationModeLabel(h.valuationMode)})
        </span>
        <span className="text-right tabular-nums text-slate-600 dark:text-slate-400">
          {fmt(h.departureDayValuePerShare)}
        </span>
        <span>취득가액</span>
        <span className="text-right tabular-nums">{fmt(h.acquisitionCost)}</span>
        <span className={h.transferGain >= 0 ? "font-medium text-slate-700 dark:text-slate-300" : "font-medium text-rose-700 dark:text-rose-400"}>
          양도차익
        </span>
        <span
          className={[
            "text-right tabular-nums font-medium",
            h.transferGain >= 0 ? "text-slate-700 dark:text-slate-300" : "text-rose-700 dark:text-rose-400",
          ].join(" ")}
        >
          {h.transferGain < 0 ? "▼ " : ""}{fmt(Math.abs(h.transferGain))}
        </span>
        {/* 외화 환산 echo — 외화 경로 종목만(엔진 `fx`). 총액은 위 «간주양도가액»·«취득가액» 행이다 */}
        {h.fx && (
          <>
            <span className="pl-2">출국일 시가 (외화 1주당 × 출국일 기준환율)</span>
            <span className="text-right font-mono tabular-nums whitespace-nowrap">
              {fxPerShareText(h.fx.departureForeign, h.fx.currency, h.fx.departureRate)}
            </span>
            <span className="pl-2">취득가액 (외화 1주당 × 취득일 기준환율)</span>
            <span className="text-right font-mono tabular-nums whitespace-nowrap">
              {fxPerShareText(h.fx.acquisitionForeign, h.fx.currency, h.fx.acquisitionRate)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function ExitTaxResultCard({ result }: ExitTaxResultCardProps) {
  // ── 납세의무 없음 ──
  if (!result.isLiable) {
    // 국외주식등 전부가 제외돼 과세 대상이 없는 경우(2027.1.1. 개정) — 제외 판정을 같이 보인다(echo 없으면 아무것도 안 보인다)
    if (result.foreignExclusion) {
      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:bg-amber-950/40">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">납세의무 없음 (§118의9)</span>
              <EligibilityBadge label="거주자 요건" ok={result.residencyEligible} />
              <EligibilityBadge label="대주주 요건" ok={result.majorShareholderEligible} />
            </div>
            <p className="text-sm text-amber-700 leading-relaxed dark:text-amber-300">
              {result.ineligibleReason ?? "§118의9① 요건 미충족으로 납세의무가 없습니다."}
            </p>
            <p className="text-xs text-amber-700 mt-2 dark:text-amber-400">세액: 0</p>
          </div>
          <ExitTaxExclusionNotice result={result} />
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:bg-amber-950/40">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">납세의무 없음 (§118의9)</span>
          <EligibilityBadge label="거주자 요건" ok={result.residencyEligible} />
          <EligibilityBadge label="대주주 요건" ok={result.majorShareholderEligible} />
        </div>
        <p className="text-sm text-amber-700 leading-relaxed dark:text-amber-300">
          {result.ineligibleReason ?? "§118의9① 요건 미충족으로 납세의무가 없습니다."}
        </p>
        <p className="text-xs text-amber-700 mt-2 dark:text-amber-400">세액: 0</p>
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
  // 2027.1.1. 이후 출국분 — 엔진 echo가 있을 때만 호별 조각을 보인다(echo 없는 옛 이력·국내 1호 단독은 현행 렌더 그대로)
  const from2027 = result.exitTaxRegime === "from2027";
  const showBuckets = shouldShowBucketBreakdown(result);
  const multiBucket = isMultiBucketResult(result);
  const hasLocalAlt = result.localIncomeTaxAlternative !== undefined;
  const hasExcluded = result.foreignExclusion?.applied === true;

  return (
    <div className="space-y-4">
      {/* ── 요건 충족 배지 ── */}
      <div className="flex gap-2 flex-wrap">
        <EligibilityBadge label="거주자 요건 충족" ok={result.residencyEligible} />
        <EligibilityBadge label="대주주 요건 충족" ok={result.majorShareholderEligible} />
      </div>

      {/* ── 국외주식등 제외 판정 (시행령 §178의8②) — 국외 종목이 있을 때만 ── */}
      <ExitTaxExclusionNotice result={result} />

      {/* ── 종목별 결과 ── */}
      {result.holdingDetails.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">종목별 계산 결과 (§178의9)</p>
          {result.holdingDetails.map((h) => (
            <HoldingDetailRow key={h.id} h={h} from2027={from2027} />
          ))}
        </div>
      )}

      {/* ── 메인 산식 카드 ── */}
      <div className="rounded-xl border border-slate-200 bg-white dark:bg-gray-900 p-5 space-y-1">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">산출세액 계산 (§118의10~§118의11)</p>

        <Row
          label={
            hasExcluded
              ? "합산 양도차익 (제외한 종목을 뺀 과세 대상 종목 양도차익 합계)"
              : "합산 양도차익 (전 종목 양도차익 합계)"
          }
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

        {showBuckets ? (
          <ExitTaxBucketBreakdown result={result} />
        ) : (
          <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed px-1">
            세율: §118의11 → §104①11가목2) — 과세표준 3억 이하 20%, 초과분 25%
            (누진공제: 3억 초과 시 15,000,000)
          </div>
        )}

        <Divider />
        <Row
          label={
            showBuckets
              ? multiBucket
                ? "산출세액 = 세율 구분별 산출세액의 합계"
                : "산출세액 = 과세표준 × 세율 (§118의11 2호)"
              : "산출세액 = 과세표준 × 세율 − 누진공제"
          }
          value={result.incomeTax}
          highlight
        />
        {hasLocalAlt ? (
          <>
            {/* 지방세법 §103의3⑧ 표는 호 구분이 없어 2호 세율(10%·20%)과 어긋날 수 있다 — 주값과 참고값을 둘 다 보인다(확인 필요) */}
            <Row
              label={
                multiBucket
                  ? "지방소득세 = 1호 구분은 산출세액 × 10%, 2호 구분은 지방세법 §103의3⑧ 표 적용 (구분별 10원 미만 절사의 합)"
                  : "지방소득세 = 과세표준에 지방세법 §103의3⑧ 표 적용 (10원 미만 절사)"
              }
              value={result.localIncomeTax}
            />
            <Row
              label="참고: 산출세액 × 10%로 본 지방소득세 (10원 미만 절사)"
              value={result.localIncomeTaxAlternative!}
              indent
              sub="지방세법 §103의3⑧ 표가 호 구분 없는 단일표라 두 값이 다를 수 있습니다 — 확인 필요"
            />
          </>
        ) : (
          <Row
            label="지방소득세 = 산출세액 × 10% (10원 미만 절사)"
            value={result.localIncomeTax}
          />
        )}

        {/* ── 납부유예 ── */}
        {result.deferredTaxAmount > 0 && (
          <>
            <Divider />
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 pt-1">납부유예 (§118의16)</p>
            <Row
              label={`납부유예 세액 (${result.deferralYears}년 유예)`}
              value={result.deferredTaxAmount}
              sub="유예기간 동안 이자상당액 추가 부담"
            />
            {result.deferralInterest !== undefined && (
              <Row
                label="이자상당액 (§118의16④·§178의12③)"
                value={result.deferralInterest}
                sub="유예세액 × 일수 × 1일당 이자율"
              />
            )}
            {result.deferralInterestNote && (
              <p className="text-xs text-slate-600 dark:text-slate-400 px-1 leading-relaxed">
                {result.deferralInterestNote}
              </p>
            )}
          </>
        )}

        {/* ── 재전입 환급 §118의17①1호 ── */}
        {result.reentryRefund && (
          <>
            <Divider />
            <p className="text-xs font-semibold text-emerald-700 pt-1 dark:text-emerald-400">재전입 환급 (§118의17①1호)</p>
            <Row
              label={result.reentryRefund.isDeferralCancel ? "납부유예 취소 예정액" : "환급 예정액"}
              value={result.reentryRefund.amount}
            />
            <p className="text-xs text-slate-600 dark:text-slate-400 px-1 leading-relaxed">{result.reentryRefund.note}</p>
          </>
        )}

        {/* ── 경정 후 조정 (실양도 완료 시) ── */}
        {(hasAdjDeduction || hasForeignCredit || hasDomesticCredit) && (
          <>
            <Divider />
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 pt-1">경정청구 공제 (실양도 완료 시)</p>
            {hasAdjDeduction && (
              <Row
                label="조정공제 (§118의12) = 출국일 시가 - 실양도가액 차이분"
                value={result.adjustmentDeduction!}
                indent
              />
            )}
            {hasForeignCredit && (
              <Row
                label="외국납부세액공제 (§118의13) = 외국납부세액과 한도 중 작은 금액"
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
            <p className="text-xs font-semibold text-rose-700 pt-1 dark:text-rose-400">가산세</p>
            <Row
              label="보유현황 미신고 가산세 (§118의15) = 액면금액 합계 × 2%"
              value={result.holdingsReportPenalty!}
              warn
            />
          </>
        )}

        {/* ── 총계 ── */}
        <Divider />
        <Row
          label={
            hasPenalty
              ? "결정세액 = 산출세액 + 보유현황 미신고 가산세 (§118의15④)"
              : "결정세액"
          }
          value={result.finalTax}
          highlight
        />
        <Row
          label="총 납부세액 = 결정세액 + 지방소득세"
          value={result.totalTax}
          highlight
        />
      </div>

      {/* ── 경고·적용 규칙 ── */}
      {result.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1 dark:bg-amber-950/40">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">주의사항</p>
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700 leading-relaxed dark:text-amber-400">
              • {w}
            </p>
          ))}
        </div>
      )}

      {result.appliedRules.length > 0 && (
        <div className="rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/20 p-3 space-y-1">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">적용 규칙</p>
          {result.appliedRules.map((r, i) => (
            <p key={i} className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              • {r}
            </p>
          ))}
        </div>
      )}

      {/* ── 면책 고지 ── */}
      <div className="rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 px-3 py-2 text-caption text-slate-600 dark:text-slate-400 leading-relaxed">
        국외전출세는 2016.1.1. 도입 후 개정이 잦아 출국일 당시 시행 법령 확인이 필요합니다.
        본 계산 결과는 참고용이며 세무전문가 확인을 권장합니다.
      </div>
    </div>
  );
}
