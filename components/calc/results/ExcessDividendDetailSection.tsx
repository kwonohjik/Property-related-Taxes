"use client";

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { ExpandToggleButton } from "@/components/calc/results/shared/ExpandToggleButton";
import type { ExcessDividendDetail } from "@/lib/tax-engine/gift-deemed/types";

// ─────────────────────────────────────────────────────────────
// §41의2 초과배당 상세 섹션 (ExcessDividendDetail echo)
// ─────────────────────────────────────────────────────────────

export function ExcessDividendDetailSection({ detail }: { detail: ExcessDividendDetail }) {
  const [showCalcDetail, setShowCalcDetail] = useState(true);

  // 율표 세트 표시 라벨
  const rateTableLabel =
    detail.appliedRateTableSet === "6bracket_2018"
      ? "6구간 율표 (2018~2024.3.21 시행)"
      : detail.appliedRateTableSet === "7bracket_2024"
        ? "7구간 율표 (2024.3.22 이후)"
        : null;

  // 소득세 모드 표시 라벨
  const incomeTaxModeLabel: Record<string, string> = {
    undetermined: "미확정 — 율표 자동",
    separate: "분리과세 확정",
    comprehensive: "종합과세 확정",
    exempt: "비과세",
  };

  return (
    <>
      {/* ── A: 초과배당금액 자동산정 내역 ── */}
      <div
        className="rounded-lg border border-sky-200 bg-sky-50/40 p-4"
        data-testid="ed-calc-detail"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-sky-800">
            초과배당금액 자동산정 내역 (시행령 §31의2②)
          </span>
          <ExpandToggleButton
            open={showCalcDetail}
            onClick={() => setShowCalcDetail(!showCalcDetail)}
            tone="sky"
          />
        </div>

        <div className={showCalcDetail ? "mt-3 block" : "mt-3 hidden print:block"}>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-t border-sky-100">
                <td className="py-1.5 pr-2 text-muted-foreground">법인 전체 배당총액</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(detail.totalDividend)}
                </td>
              </tr>
              <tr className="border-t border-sky-100">
                <td className="py-1.5 pr-2 text-muted-foreground">특수관계인 비례배당액 (지분율 × 총배당)</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(detail.proportionalDividend)}
                </td>
              </tr>
              <tr className="border-t border-sky-100">
                <td className="py-1.5 pr-2 text-muted-foreground">① 가액 (실수령 − 비례배당)</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(detail.excessBeforeRatio)}
                </td>
              </tr>
              <tr className="border-t border-sky-100">
                <td className="py-1.5 pr-2 text-muted-foreground">최대주주등 과소배당금액</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(detail.majorShortfall)}
                </td>
              </tr>
              <tr className="border-t border-sky-100">
                <td className="py-1.5 pr-2 text-muted-foreground">총과소배당금액 (전체 주주)</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(detail.totalShortfall)}
                </td>
              </tr>
              <tr className="border-t border-sky-100">
                <td className="py-1.5 pr-2 text-muted-foreground">
                  ② 비율 (최대주주 과소 ÷ 총과소배당)
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {detail.ratioDenom > 0
                    ? `${((detail.ratioNumer / detail.ratioDenom) * 100).toFixed(4)}%`
                    : "—"}
                </td>
              </tr>
              <tr className="border-t border-sky-200 bg-sky-50">
                <td className="py-1.5 pr-2 font-semibold text-sky-900">
                  초과배당금액 (① × ②)
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap font-bold text-sky-900">
                  {formatKRW(detail.excessDividendAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── B: 소득세 상당액 산정 내역 ── */}
      <div
        className="rounded-lg border border-amber-200 bg-amber-50/40 p-4"
        data-testid="ed-income-tax-detail"
      >
        <p className="text-sm font-semibold text-amber-800">소득세 상당액 산정 내역</p>
        <table className="mt-2 w-full text-sm">
          <tbody>
            <tr className="border-t border-amber-100">
              <td className="py-1.5 pr-2 text-muted-foreground">확정 유형</td>
              <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                {incomeTaxModeLabel[detail.incomeTaxMode] ?? detail.incomeTaxMode}
              </td>
            </tr>
            {rateTableLabel && (
              <tr className="border-t border-amber-100">
                <td className="py-1.5 pr-2 text-muted-foreground">적용 율표</td>
                <td className="py-1.5 text-right text-xs text-amber-700">{rateTableLabel}</td>
              </tr>
            )}
            {detail.comprehensiveMaxDetail && (
              <>
                <tr className="border-t border-amber-100">
                  <td className="py-1.5 pr-2 text-muted-foreground">ⓐ 과세표준 세율 적용액</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {formatKRW(detail.comprehensiveMaxDetail.taxA)}
                  </td>
                </tr>
                <tr className="border-t border-amber-100">
                  <td className="py-1.5 pr-2 text-muted-foreground">ⓑ 차감액 세율 적용액</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {formatKRW(detail.comprehensiveMaxDetail.taxB)}
                  </td>
                </tr>
                <tr className="border-t border-amber-100">
                  <td className="py-1.5 pr-2 text-muted-foreground">ⓐ − ⓑ</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {formatKRW(detail.comprehensiveMaxDetail.taxAminusB)}
                  </td>
                </tr>
                <tr className="border-t border-amber-100">
                  <td className="py-1.5 pr-2 text-muted-foreground">초과배당금액 × 14%</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {formatKRW(detail.comprehensiveMaxDetail.taxFloor)}
                  </td>
                </tr>
                <tr className="border-t border-amber-100">
                  <td className="py-1.5 pr-2 text-muted-foreground">Max(ⓐ−ⓑ, 14%) 적용액</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap font-semibold">
                    {formatKRW(detail.comprehensiveMaxDetail.appliedAmount)}
                  </td>
                </tr>
              </>
            )}
            <tr className="border-t border-amber-200 bg-amber-50">
              <td className="py-1.5 pr-2 font-semibold text-amber-900">소득세 상당액</td>
              <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap font-bold text-amber-900">
                {formatKRW(detail.incomeTaxEquivalent)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── C: 구법(2018~2020) 산출세액공제 ── */}
      {detail.taxMethod === "legacy_credit_from_tax" && detail.legacyCredit && (
        <div
          className="rounded-lg border border-violet-200 bg-violet-50/40 p-4"
          data-testid="ed-legacy-credit"
        >
          <p className="text-sm font-semibold text-violet-800">
            구법 적용 — 소득세 상당액 산출세액공제 (2018~2020 배당)
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            구법(2018~2020): 소득세 상당액을 과세표준에서 차감하지 않고 산출세액에서 직접 공제합니다.
          </p>
          <table className="mt-2 w-full text-sm">
            <tbody>
              <tr className="border-t border-violet-100">
                <td className="py-1.5 pr-2 text-muted-foreground">할증 포함 산출세액</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(detail.legacyCredit.grossGiftTax)}
                </td>
              </tr>
              <tr className="border-t border-violet-100">
                <td className="py-1.5 pr-2 text-muted-foreground">
                  소득세 상당액 공제 (산출세액과 소득세 중 작은 값)
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(detail.legacyCredit.legacyCreditAmount)}
                </td>
              </tr>
              <tr className="border-t border-violet-200 bg-violet-50">
                <td className="py-1.5 pr-2 font-semibold text-violet-900">공제 후 산출세액</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap font-bold text-violet-900">
                  {formatKRW(detail.legacyCredit.finalTax)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── D: 정산 추납/환급 ── */}
      {detail.settlement && (
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4"
          data-testid="ed-settlement"
        >
          <p className="text-sm font-semibold text-emerald-800">
            정산 증여세 (§41의2②③)
          </p>
          <table className="mt-2 w-full text-sm">
            <tbody>
              <tr className="border-t border-emerald-100">
                <td className="py-1.5 pr-2 text-muted-foreground">㉮ 당초 증여세액 (율표 소득세 기준)</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(detail.settlement.initialGiftTax)}
                </td>
              </tr>
              <tr className="border-t border-emerald-100">
                <td className="py-1.5 pr-2 text-muted-foreground">⑭ 정산 증여세액 (실제소득세 기준)</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(detail.settlement.settlementGiftTax)}
                </td>
              </tr>
              <tr className="border-t border-emerald-200 bg-emerald-50">
                <td className="py-1.5 pr-2 font-semibold text-emerald-900">
                  정산 {detail.settlement.isRefund ? "환급" : "추납"} 세액
                  <span
                    className={`ml-1.5 rounded px-1.5 py-0.5 text-xs font-medium ${
                      detail.settlement.isRefund
                        ? "bg-sky-100 text-sky-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {detail.settlement.isRefund ? "환급" : "추납"}
                  </span>
                </td>
                <td
                  className={`py-1.5 text-right font-mono tabular-nums whitespace-nowrap font-bold ${
                    detail.settlement.isRefund ? "text-sky-700" : "text-amber-700"
                  }`}
                >
                  {formatKRW(Math.abs(detail.settlement.settlementDue))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── E: §47② 합산배제 안내 ── */}
      {detail.isAggregationExcluded && (
        <div
          className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-700"
          data-testid="ed-aggregation-excluded"
        >
          <p className="font-semibold">§47② 동일인 재차증여 합산 적용 배제</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            초과배당 증여재산은 동일인으로부터 이전에 증여받은 재산과의 합산 과세(§47②) 대상에서 배제됩니다.
          </p>
        </div>
      )}

      {/* ── F: 연대납부의무 면제 안내 ── */}
      <div
        className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600"
        data-testid="ed-joint-liability-exempt"
      >
        <p className="text-xs">
          ※ 초과배당에 대한 증여세는 수증자(초과배당 수령 주주)의 단독 납부 의무 — 증여자(배당 포기 주주)의
          연대납부의무가 면제됩니다 (§4의2⑥ 단서).
        </p>
      </div>
    </>
  );
}
