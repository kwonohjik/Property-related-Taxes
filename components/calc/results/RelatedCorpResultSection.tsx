"use client";

/** §45의3 일감몰아주기 결과 섹션 — 과세요건·수증자별 표·보유비율 raw (DeemedGiftResultView 800줄 분리). */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { DeemedGiftResult } from "@/lib/tax-engine/gift-deemed/types";
import { Frac } from "@/components/calc/results/shared/FormulaParts";

export function RelatedCorpResultSection({
  result,
  selectedDoneeIndex = 0,
  onSelectDonee,
}: {
  result: DeemedGiftResult;
  /** 과세 수증자(소계 > 0) 중 몇 번째를 증여세 마법사로 이관할지 */
  selectedDoneeIndex?: number;
  onSelectDonee?: (i: number) => void;
}) {
  const breakdown = result.recipientBreakdown;
  if (!breakdown) return null;

  // 지배주주등은 §45의3①상 이익을 「각각」 증여받은 것으로 보는 **독립 납세의무자**다.
  // 마법사 세션 1개 = 신고 1건이므로 선택된 1명만 이관한다(prefill과 같은 술어).
  const taxableRecipients = breakdown.filter((r) => r.subtotal > 0);
  const selectedRecipient = taxableRecipients[selectedDoneeIndex] ?? taxableRecipients[0];

  const tradeRatio = result.tradeRatio ?? { numer: 0, denom: 1 };
  const normalTradeRatio = result.normalTradeRatio ?? { numer: 0, denom: 1 };

  return (
    <div className="space-y-4">
      {/* 과세요건 공통부 카드 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-4">
        <p className="text-sm font-semibold text-sky-800">수혜법인 단위 과세요건</p>
        <table className="mt-2 w-full text-sm">
          <tbody>
            <tr>
              <td className="text-muted-foreground">지배주주</td>
              <td className="text-right">{result.rulingShareholder ?? "—"}</td>
            </tr>
            {result.relatedSales != null && (
              <tr>
                <td className="text-muted-foreground">특수관계매출</td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(result.relatedSales)}
                </td>
              </tr>
            )}
            <tr>
              <td className="text-muted-foreground">
                거래비율 <Frac top={(result.tradeRatioNumer ?? 0).toLocaleString()} bottom={(result.tradeRatioDenom ?? 0).toLocaleString()} />
              </td>
              <td className="text-right">
                {tradeRatio.denom > 0 ? ((tradeRatio.numer / tradeRatio.denom) * 100).toFixed(2) : "0.00"}%
              </td>
            </tr>
            <tr>
              <td className="text-muted-foreground">정상거래비율</td>
              <td className="text-right">
                {normalTradeRatio.denom > 0
                  ? ((normalTradeRatio.numer / normalTradeRatio.denom) * 100).toFixed(0)
                  : "0"}
                %
              </td>
            </tr>
            <tr>
              <td className="text-muted-foreground">과세요건</td>
              <td className="text-right" data-testid="rc-tax-requirement">
                {result.taxRequirementMet ? "충족" : "미충족"}
                {result.taxRequirementClause && (
                  <span className="ml-1 text-caption text-muted-foreground">{result.taxRequirementClause}</span>
                )}
              </td>
            </tr>
            {result.taxableExcludedSales != null && (
              <tr>
                <td className="text-muted-foreground">공통 과세제외매출</td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(result.taxableExcludedSales)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 수증자별 직접/간접 표 */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4" data-testid="rc-recipient-breakdown">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-emerald-800">수증자별 증여의제이익 내역</p>
          {taxableRecipients.length > 0 && onSelectDonee && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-emerald-800" htmlFor="rc-donee-selector">
                증여세로 이관할 수증자
              </label>
              <select
                id="rc-donee-selector"
                value={selectedDoneeIndex}
                onChange={(e) => onSelectDonee(Number(e.target.value))}
                data-testid="rc-donee-selector"
                className="rounded-md border border-emerald-300 bg-white dark:bg-gray-900 px-2 py-0.5 text-sm text-emerald-900 focus:border-emerald-400 focus:outline-none"
              >
                {taxableRecipients.map((r, i) => (
                  <option key={i} value={i}>
                    {r.recipientName.trim() || "지배주주등"}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left">수증자</th>
                <th className="text-right">세후영업이익</th>
                <th className="text-right">거래비율차감후</th>
                <th className="text-right">보유비율차감후</th>
                <th className="text-right">직접이익</th>
                <th className="text-right">간접이익</th>
                <th className="text-right">소계</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((r, i) => (
                <tr key={i} className="border-t border-emerald-100" data-testid={`rc-recipient-row-${i}`}>
                  <td className="py-1.5 pr-2 text-emerald-700">{r.recipientName.trim() || "지배주주등"}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(r.pretaxProfit)}</td>
                  <td className="py-1.5 text-right">{r.tradeRatioOver.numer}/{r.tradeRatioOver.denom}</td>
                  <td className="py-1.5 text-right">{r.directOwnershipOver.numer}/{r.directOwnershipOver.denom}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(r.directGain)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {r.indirectGain > 0 ? formatKRW(r.indirectGain) : "—"}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap font-semibold">{formatKRW(r.subtotal)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-emerald-200 font-semibold">
                <td colSpan={6} className="py-1.5 pr-2">합계 (인별 신고 별도)</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(result.deemedGiftValue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {taxableRecipients.length > 0 && (
          <p className="mt-2 text-caption text-muted-foreground" data-testid="rc-per-donee-notice">
            지배주주와 그 친족은 이익을 «각각» 증여받은 것으로 봅니다(상증법 §45의3①) — 수증자별로
            <b> 별도 신고</b>가 필요합니다. 「이 금액으로 증여세 계산하기」는 위에서 선택한{" "}
            <b>{selectedRecipient?.recipientName.trim() || "지배주주등"}</b>의{" "}
            <b className="font-mono tabular-nums">{formatKRW(selectedRecipient?.subtotal ?? 0)}</b> 1건만 이관합니다.
          </p>
        )}
      </div>

      {/* 보유비율 raw — 직접·간접 대칭 echo (RC-INDIRECT-ECHO) */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
        <p className="text-xs font-semibold text-amber-800">보유비율 산출 내역 (직접·간접 raw)</p>
        <table className="mt-1 w-full text-xs">
          <thead>
            <tr className="text-caption text-muted-foreground">
              <th className="text-left">수증자</th>
              <th className="text-right">직접보유 raw</th>
              <th className="text-right">간접보유 raw</th>
              <th className="text-right">직접이익</th>
              <th className="text-right">간접이익</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((r, i) => (
              <tr key={i} className="border-t border-amber-100">
                <td className="py-1 pr-2 text-amber-700">{r.recipientName.trim() || "지배주주등"}</td>
                <td className="py-1 text-right text-muted-foreground">{r.directRatioRaw.numer}/{r.directRatioRaw.denom}</td>
                <td className="py-1 text-right text-muted-foreground">
                  {r.indirectRatioRaw.numer > 0 ? `${r.indirectRatioRaw.numer}/${r.indirectRatioRaw.denom}` : "—"}
                </td>
                <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(r.directGain)}</td>
                <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap">
                  {r.indirectGain > 0 ? formatKRW(r.indirectGain) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-caption text-muted-foreground">
          간접이익=0은 &quot;미작동&quot;이 아닙니다. 간접보유 전부를 한계보유비율 차감에 우선 사용하여 직접이익에 산입합니다 (§34의3⑬).
        </p>
      </div>

      {/* 종전에는 특정 교재 사례(수혜법인 A, 2023 귀속)의 anchor 금액 두 개를 조건 없이
          「본 시스템 산출」로 찍어, 사용자가 어떤 값을 넣든 같은 숫자가 나왔다. 수치를 뺀다. */}
      <p className="text-caption text-muted-foreground">
        ※ 교재의 거래비율 반올림 표기와 달리 본 시스템은 정확분수 정수연산을 적용합니다.
      </p>
    </div>
  );
}
