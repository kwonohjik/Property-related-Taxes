"use client";

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { RelatedCorpResultSection } from "./RelatedCorpResultSection";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import {
  ExpandToggleButton,
} from "@/components/calc/results/shared/ExpandToggleButton";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { CapitalDecreaseMultiResultView } from "./CapitalDecreaseMultiResultView";
import { SpecificCorpMultiResultView } from "./SpecificCorpMultiResultView";
import { ExcessDividendDetailSection } from "./ExcessDividendDetailSection";
import { AllocationResultView } from "./AllocationResultView";
import type { DeemedGiftAnyResult } from "@/lib/tax-engine/gift-deemed/types";
import { GIFT } from "@/lib/tax-engine/legal-codes/inheritance-gift";

// ─────────────────────────────────────────────────────────────
// 날짜 포맷 헬퍼
// ─────────────────────────────────────────────────────────────

/** subGifts.giftDate는 엔진에선 Date, NextResponse.json 경유 후 client에선 string → 양립 포맷 */
function fmtGiftDate(d?: Date | string): string {
  if (!d) return "미입력";
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 10);
}

export function DeemedGiftResultView({
  result,
  onToGiftTax,
  selectedDoneeIndex = 0,
  onSelectDonee,
}: {
  result: DeemedGiftAnyResult;
  onToGiftTax: () => void;
  selectedDoneeIndex?: number;
  onSelectDonee?: (i: number) => void;
}) {
  const [open, setOpen] = useState(true);

  if ("perBeneficiary" in result) {
    return <AllocationResultView result={result} onToGiftTax={onToGiftTax} />;
  }

  // §39의3 고가인수 과세 수증자 — prefill 대상 선택지(가액 0 = 기준금액 미달, 신고 대상 아님).
  // 인덱스 기준을 prefill(`buildGiftWizardPrefill`)과 동일하게 **과세 행만**으로 맞춘다.
  const contribTaxableDonees = (result.contributionBreakdown ?? []).filter((r) => r.value > 0);

  // §41의3④ 단서·령§31의3⑥ 평가손실 환급 — 증여이익(과세)과 별도 표시(정적 색조 매핑)
  const isRefund = result.direction === "refund";
  const headLabel = isRefund ? "평가손실 환급 대상액" : "증여재산가액 (증여이익)";
  const headValue = isRefund ? result.refundBase ?? 0 : result.deemedGiftValue;
  const cardCls = isRefund ? "border-blue-200 bg-blue-50/50" : "border-rose-200 bg-rose-50/50";
  const titleCls = isRefund ? "text-blue-800" : "text-rose-800";
  const valueCls = isRefund ? "text-blue-900" : "text-rose-900";
  const rowBorderCls = isRefund ? "border-blue-100" : "border-rose-100";
  const noteCls = isRefund ? "text-blue-600" : "text-rose-600";

  return (
    <div className="space-y-4" data-testid="deemed-result">
      <div className={`rounded-lg border p-4 ${cardCls}`}>
        <div className="flex items-center justify-between">
          <span className={`text-sm font-semibold ${titleCls}`}>{headLabel}</span>
          <ExpandToggleButton open={open} onClick={() => setOpen(!open)} tone={isRefund ? "sky" : "rose"} />
        </div>
        <p
          className={`mt-1 text-right font-mono text-2xl font-bold tabular-nums ${valueCls}`}
          data-testid="deemed-result-value"
        >
          {formatKRW(headValue)}
        </p>
        <div className="mt-1 flex justify-end">
          <LawArticleModal legalBasis={result.legalBasis} />
        </div>
        {isRefund && (
          <p className="mt-2 text-xs text-blue-700" data-testid="deemed-result-refund-notice">
            정산기준일 가액이 당초 증여세 과세가액보다 하락하여 그 차액이 기준금액 이상입니다. 당초 납부한 증여세액을 경정청구로 환급받을 수 있습니다 (§41의3④ 단서).
          </p>
        )}

        <div className={open ? "mt-3 block" : "mt-3 hidden print:block"}>
          <table className="w-full text-sm">
            <tbody>
              {result.breakdown.map((step, i) => (
                <tr key={i} className={`border-t ${rowBorderCls}`}>
                  <td className="py-1.5 pr-2 text-muted-foreground">
                    {step.label}
                    {step.note ? <span className={`ml-1 text-xs ${noteCls}`}>({step.note})</span> : null}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {formatKRW(step.amount)}
                  </td>
                  <td className="py-1.5 pl-2">
                    {step.lawRef ? <LawArticleModal legalBasis={step.lawRef} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {result.type === "related_corp" && result.recipientBreakdown && (
        <RelatedCorpResultSection result={result} />
      )}

      {result.nomineeCapitalIncrease && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4" data-testid="nominee-capital-increase">
          <p className="text-sm font-semibold text-emerald-800">유상증자 신주 명의신탁 평가 (§45의2 · 명의개서일 §63 평가)</p>
          <div className="mt-2 rounded-md border border-emerald-200 bg-white p-2 text-sm text-emerald-900">
            1주당 평가액{" "}
            <b className="font-mono tabular-nums">{result.nomineeCapitalIncrease.perSharePrice.toLocaleString("ko-KR")}</b>
            {" × 명의신탁 신주 "}
            <b className="font-mono tabular-nums">{result.nomineeCapitalIncrease.nomineeShares.toLocaleString("ko-KR")}</b>
            {"주 = "}
            <b className="font-mono tabular-nums">{formatKRW(result.deemedGiftValue)}</b>
          </div>
          {(result.nomineeCapitalIncrease.preIncreasePerShare ||
            result.nomineeCapitalIncrease.subscriptionPrice ||
            result.nomineeCapitalIncrease.theoreticalExRightsPrice) && (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {result.nomineeCapitalIncrease.preIncreasePerShare ? (
                <p>
                  증자 전 1주당 {result.nomineeCapitalIncrease.preIncreasePerShare.toLocaleString("ko-KR")} → 유상증자 희석으로 명의개서일 §63 평가{" "}
                  {result.nomineeCapitalIncrease.perSharePrice.toLocaleString("ko-KR")} <span className="text-emerald-700">(적용)</span>
                </p>
              ) : null}
              {result.nomineeCapitalIncrease.subscriptionPrice || result.nomineeCapitalIncrease.theoreticalExRightsPrice ? (
                <p>
                  신주인수가액 {result.nomineeCapitalIncrease.subscriptionPrice ? result.nomineeCapitalIncrease.subscriptionPrice.toLocaleString("ko-KR") : "-"}
                  {" · 이론적 권리락 "}
                  {result.nomineeCapitalIncrease.theoreticalExRightsPrice ? result.nomineeCapitalIncrease.theoreticalExRightsPrice.toLocaleString("ko-KR") : "-"}
                  {" — 평가에 미적용 (조심2012중3707·2019서2129)"}
                </p>
              ) : null}
            </div>
          )}
          <p className="mt-2 text-caption text-muted-foreground">
            증여의제 수증자 = 명의자 / 납세의무자 = 실제소유자 (§4의2②, 2018.12.31 개정 후). 합산배제증여재산 — 동일인 10년 합산·증여재산공제 비적용 (§47①).
          </p>
        </div>
      )}

      {result.capitalDecreaseMulti && (
        <CapitalDecreaseMultiResultView
          multi={result.capitalDecreaseMulti}
          selectedDoneeIndex={selectedDoneeIndex}
          onSelectDonee={onSelectDonee ?? (() => {})}
        />
      )}

      {result.specificCorpMulti && (
        <SpecificCorpMultiResultView
          multi={result.specificCorpMulti}
          selectedDoneeIndex={selectedDoneeIndex}
          onSelectDonee={onSelectDonee ?? (() => {})}
        />
      )}

      {result.subGifts && result.subGifts.length > 0 && (
        <div
          className="rounded-lg border border-violet-200 bg-violet-50/40 p-4"
          data-testid="deemed-subgifts"
        >
          <p className="text-sm font-semibold text-violet-800">
            증여시기별 분리 (§33①1·2호 — 원본·수익 별개 증여)
          </p>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {result.subGifts.map((sg, i) => (
                <tr key={i} className="border-t border-violet-100">
                  <td className="py-1.5 pr-2 text-violet-700">
                    {sg.right === "principal" ? "원본권 증여" : "수익권 증여"}
                    <span className="ml-1 text-xs text-muted-foreground">
                      (증여시기 {fmtGiftDate(sg.giftDate)})
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {formatKRW(sg.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            원본·수익 증여시기가 다르면 각 증여시기 기준으로 별도 신고합니다.
          </p>
        </div>
      )}

      {/* §39의3 현물출자 — gross echo + 당사자별 안분 명세 */}
      {result.grossDeemedGiftValue !== undefined && (
        <div
          className="rounded-lg border border-violet-200 bg-violet-50/40 p-4"
          data-testid="deemed-contribution-gross"
        >
          <p className="text-sm font-semibold text-violet-800">
            §39의3 현물출자 — 이익 산출 근거
          </p>
          <table className="mt-2 w-full text-sm">
            <tbody>
              <tr className="border-t border-violet-100">
                <td className="py-1.5 pr-2 text-muted-foreground">
                  gross 이익 (법문 §39의3① 1호·2호 산식 총액)
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(result.grossDeemedGiftValue)}
                </td>
                <td className="py-1.5 pl-2">
                  <LawArticleModal legalBasis={GIFT.CONTRIBUTION_TIMING} />
                </td>
              </tr>
              <tr className="border-t border-violet-100">
                <td className="py-1.5 pr-2 text-muted-foreground">
                  인별 안분 후 증여재산가액 (위 최종값)
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(result.deemedGiftValue)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>

          {/* roster 無 — 비율 입력 경로 안내 (저가: 자기지분 미제외 gross 주의) */}
          {!result.contributionBreakdown && (
            <p
              className="mt-2 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1"
              data-testid="deemed-contribution-roster-warning"
            >
              {result.caseType === "high"
                ? "지분비율(%) 단일 경로로 산출된 값입니다. 수증자 명부를 입력하면 1인별로 분리 계산합니다."
                : "현물출자자 본인 지분이 제외되지 않은 법문상 총액입니다. 증여자 명부를 입력하면 자기지분 제외 후 인별 과세액으로 안분합니다."}
            </p>
          )}

          {/* roster 有 — 당사자별 안분 표 */}
          {result.contributionBreakdown && result.contributionBreakdown.length > 0 && (
            <div className="mt-3" data-testid="deemed-contribution-breakdown">
              <p className="text-xs font-semibold text-violet-700 mb-1">
                {result.caseType === "high" ? "수증자별" : "증여자별"} 안분 명세
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-violet-600">
                    <th className="py-1 text-left font-medium">
                      {result.caseType === "high" ? "수증자" : "증여자"}
                    </th>
                    <th className="py-1 text-right font-medium">주식수</th>
                    <th className="py-1 text-right font-medium">비율</th>
                    <th className="py-1 text-right font-medium">증여이익</th>
                  </tr>
                </thead>
                <tbody>
                  {result.contributionBreakdown.map((row, i) => (
                    <tr key={i} className="border-t border-violet-100">
                      <td className="py-1.5 pr-2 text-muted-foreground">{row.party}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                        {row.preShares.toLocaleString()}주
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-xs">
                        {row.ratioLabel}
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                        {formatKRW(row.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                각 {result.caseType === "high" ? "수증자" : "증여자"}는 위 이익을 각자의 증여재산가액으로 별도 증여세를 신고합니다.
                &nbsp;<LawArticleModal legalBasis={GIFT.DUP_EXCLUSION_ANNUAL} />
              </p>

              {/* 고가 — 수증자는 각자 독립 납세의무자(동시증여 아님) ⇒ 이관 대상 1명 선택.
                  선례: 감자 §39의2 `cd-multi-donee-select` · 특정법인 §45의5 */}
              {result.caseType === "high" && contribTaxableDonees.length > 1 && (
                <div
                  className="mt-3 rounded-md border border-rose-200 bg-rose-50/40 p-3"
                  data-testid="con-high-donee-select"
                >
                  <p className="text-sm font-semibold text-rose-800">증여세 계산 대상 수증자 선택</p>
                  <select
                    value={selectedDoneeIndex}
                    onChange={(e) => onSelectDonee?.(Number(e.target.value))}
                    data-testid="con-high-donee-selector"
                    className="mt-2 w-full rounded-md border border-rose-200 bg-white px-2 py-1.5 text-sm"
                  >
                    {contribTaxableDonees.map((d, i) => (
                      <option key={`${d.party}-${i}`} value={i}>
                        {d.party} — 증여재산가액 {formatKRW(d.value)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    선택한 수증자의 건만 증여세 마법사로 이관됩니다. 나머지 수증자는 다시 선택해 각각 이관하세요.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {result.periodBreakdown && result.periodBreakdown.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4" data-testid="deemed-period-breakdown">
          <p className="text-sm font-semibold text-amber-800">
            {result.type === "free_loan"
              ? "연도별 증여 (§41의4② — 1년 되는 날 다음 날 매년 새로 대출받은 것으로 봄)"
              : "기간별 증여 (§37·시행령§27③⑤ — 5년/1년 단위)"}
          </p>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-xs text-amber-700">
                <th className="py-1 text-left font-medium">증여일</th>
                <th className="py-1 text-right font-medium">{result.type === "free_loan" ? "대출금액" : "평가액"}</th>
                {result.type === "free_loan" && <th className="py-1 text-right font-medium">일수</th>}
                <th className="py-1 text-right font-medium">증여이익</th>
                <th className="py-1 text-right font-medium">과세</th>
              </tr>
            </thead>
            <tbody>
              {result.periodBreakdown.map((p) => (
                <tr key={p.index} className="border-t border-amber-100">
                  <td className="py-1.5 pr-2 text-muted-foreground">{p.giftDate || "미입력"}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(p.baseValue)}</td>
                  {result.type === "free_loan" && (
                    <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-xs">
                      {p.dayCount !== undefined ? `${p.dayCount}/365일` : "—"}
                    </td>
                  )}
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(p.benefit)}</td>
                  <td className="py-1.5 text-right text-xs">{p.applied ? "○" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            각 기간은 별개 증여 — 해당 증여일 도래 시 별도 신고 대상입니다. 위 증여재산가액은 첫 기간(현재 증여) 기준입니다.
          </p>
          {result.type === "free_loan" && (
            <p className="mt-1 text-xs text-amber-600">
              ※ §41의4② 의제 도출 — 일수/365 명문 조항 없음, 분모 365 고정(교재 기준)
            </p>
          )}
        </div>
      )}

      {result.aggregationBreakdown && result.aggregationBreakdown.length > 0 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-4" data-testid="loan-aggregation-result">
          <p className="text-sm font-semibold text-sky-800">§43② 동일거래 합산 증여이익 (1년 이내)</p>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-xs text-sky-700">
                <th className="py-1 text-left font-medium">대출일</th>
                <th className="py-1 text-right font-medium">대출금액</th>
                <th className="py-1 text-right font-medium">건별 이익</th>
                <th className="py-1 text-right font-medium">누계</th>
              </tr>
            </thead>
            <tbody>
              {result.aggregationBreakdown.map((b, i) => (
                <tr
                  key={i}
                  className={`border-t ${b.isThresholdCrossing ? "bg-sky-100 font-semibold border-sky-300" : "border-sky-100"}`}
                >
                  <td className="py-1.5 pr-2 text-muted-foreground">
                    {b.loanDate}
                    {b.isThresholdCrossing && <span className="ml-1 text-xs font-medium text-sky-700">▶ 증여시기</span>}
                    {!b.eligible && <span className="ml-1 text-xs text-muted-foreground">(정당사유 제외)</span>}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(b.loanAmount)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(b.rawBenefit)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(b.cumulativeBenefit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-sm text-sky-800">합산 증여재산가액</p>
            <p className="text-right font-mono text-lg font-bold tabular-nums text-sky-900">{formatKRW(result.deemedGiftValue)}</p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            개별 건으로는 1천만 미만이더라도 1년 이내 동일거래를 합산하여 과세합니다.
            &nbsp;<LawArticleModal legalBasis={GIFT.DUP_EXCLUSION_ANNUAL} />
          </p>
        </div>
      )}

      {result.rectification && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4" data-testid="deemed-rectification">
          <p className="text-sm font-semibold text-emerald-800">경정청구 가능 세액 (§79②1호·시행령§81⑨)</p>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {result.rectification.steps.map((step, i) => (
                <tr key={i} className="border-t border-emerald-100">
                  <td className="py-1.5 pr-2 text-muted-foreground">
                    {step.label}
                    {step.note ? <span className="ml-1 text-xs text-emerald-600">({step.note})</span> : null}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(step.amount)}</td>
                  <td className="py-1.5 pl-2">{step.lawRef ? <LawArticleModal legalBasis={step.lawRef} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p
            className="mt-2 text-right font-mono text-lg font-bold tabular-nums text-emerald-900"
            data-testid="deemed-rectification-value"
          >
            {formatKRW(result.rectification.refundableTax)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            만료일 {result.rectification.expiryDate} 기준 잔여 {result.rectification.remainingMonths}/{result.rectification.totalMonths}개월.
          </p>
        </div>
      )}

      {result.mergerMatrix && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4" data-testid="merger-matrix">
          <p className="text-sm font-semibold text-emerald-800">수증자별 증여이익 (§38 합병 — 주주 매트릭스)</p>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left font-medium">수증자</th>
                <th className="text-right font-medium">차감전</th>
                <th className="text-right font-medium">자기증여</th>
                <th className="text-right font-medium">순이익</th>
                <th className="text-right font-medium">과세</th>
              </tr>
            </thead>
            <tbody>
              {result.mergerMatrix.recipients.map((r, i) => (
                <tr key={i} className="border-t border-emerald-100">
                  <td className="py-1.5 pr-2 text-emerald-700">{r.name.trim() || "주주"}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(r.grossGain)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{r.selfGift > 0 ? formatKRW(r.selfGift) : "-"}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(r.netGain)}</td>
                  <td className="py-1.5 pl-2 text-right text-xs text-muted-foreground">{r.applied ? "과세" : "제외"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs font-semibold text-emerald-700">증여자별 안분</p>
          {result.mergerMatrix.recipients.map((rec, i) => {
            const alloc = result.mergerMatrix!.allocation[rec.id] ?? {};
            const entries = Object.entries(alloc).filter(([, v]) => v > 0);
            if (entries.length === 0) return null;
            return (
              <p key={i} className="text-xs text-muted-foreground">
                {rec.name.trim() || "주주"} ← {entries.map(([donor, v]) => `${donor.trim() || "주주"} ${formatKRW(v)}`).join(" · ")}
              </p>
            );
          })}
          <p className="mt-2 text-caption text-muted-foreground">동일인 자기증여분 차감(재산세과-799). 각 수증자 §28④ 기준금액(합병후평가 30%·3억 중 적은 금액) 개별 판정.</p>
        </div>
      )}

      {!result.applied && result.exclusionReason && (
        <div
          className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          data-testid="deemed-exclusion"
        >
          증여세 미적용: {result.exclusionReason}
          {result.excessDividendDetail?.isAggregationExcluded && (
            <p className="mt-1 text-xs">
              ※ 이 초과배당 증여재산은 §47② 동일인 재차증여 합산 적용에서 배제됩니다.
            </p>
          )}
        </div>
      )}

      {/* ── §41의2 초과배당 전용 상세 섹션 ── */}
      {result.excessDividendDetail && (
        <ExcessDividendDetailSection detail={result.excessDividendDetail} />
      )}

      {/* ── §42의3 재산취득 후 가치증가 — 적용요건 echo ── */}
      {result.valueIncreaseDetail && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-4 space-y-1.5" data-testid="deemed-vi-detail">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-rose-800">재산취득 후 가치증가 — 적용요건 (상증법 §42의3)</span>
            <LawArticleModal legalBasis={GIFT.VALUE_INCREASE} />
          </div>
          {result.valueIncreaseDetail.acquisitionCauseLabel && (
            <p className="text-xs text-rose-700">취득사유: {result.valueIncreaseDetail.acquisitionCauseLabel}</p>
          )}
          {result.valueIncreaseDetail.reasonLabel && (
            <p className="text-xs text-rose-700">가치증가사유: {result.valueIncreaseDetail.reasonLabel}</p>
          )}
          {result.valueIncreaseDetail.withinFiveYears !== undefined && (
            <p className="text-xs text-rose-700">
              취득~사유발생 {result.valueIncreaseDetail.holdingYears}년 — 5년 이내{" "}
              {result.valueIncreaseDetail.withinFiveYears ? "○" : "✕ (초과)"}
            </p>
          )}
          {result.valueIncreaseDetail.isExchangeListingNotice && (
            <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-700" data-testid="deemed-vi-exchange-notice">
              ⚠ 현행 §42의3은 K-OTC 등록·코넥스 상장만 해당. 유가증권·코스닥시장 상장 이익은 §41의3 상장이익으로 과세됩니다.
              <span className="ml-1 inline-block align-middle">
                <LawArticleModal legalBasis={GIFT.LISTING_GAIN} />
              </span>
            </div>
          )}
        </div>
      )}

      {result.applied && (
        <button
          type="button"
          onClick={onToGiftTax}
          data-testid="deemed-to-wizard"
          className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700"
        >
          이 금액으로 증여세 계산하기 →
        </button>
      )}

      <DisclaimerBanner />
    </div>
  );
}
