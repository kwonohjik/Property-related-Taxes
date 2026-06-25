"use client";

/** 감자 §39의2 멀티(불균등 N:N) 결과 — 수증자별 증여재산가액·감자후평가·검증표·수증자 선택. */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { CapitalDecreaseMultiResult } from "@/lib/tax-engine/gift-deemed/types";

export function CapitalDecreaseMultiResultView({
  multi,
  selectedDoneeIndex,
  onSelectDonee,
}: {
  multi: CapitalDecreaseMultiResult;
  selectedDoneeIndex: number;
  onSelectDonee: (i: number) => void;
}) {
  const taxable = multi.donees.filter((d) => d.isTaxable);

  return (
    <>
      {/* 카드① 수증자별 증여재산가액 매트릭스 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4" data-testid="cd-multi-matrix">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-amber-800">
            수증자별 증여재산가액 ({multi.caseType === "high" ? "고가소각 §39의2①2호" : "저가소각 §39의2①1호"})
          </p>
          <LawArticleModal legalBasis="상증법 §39의2" />
        </div>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-xs text-amber-700">
              <th className="py-1 text-left font-medium">수증자</th>
              <th className="py-1 text-left font-medium">증여자별 내역</th>
              <th className="py-1 text-right font-medium">합계</th>
              <th className="py-1 text-right font-medium">과세</th>
            </tr>
          </thead>
          <tbody>
            {multi.donees.map((d) => (
              <tr key={d.name} className="border-t border-amber-100 align-top">
                <td className="py-1.5 pr-2 font-medium">{d.name}</td>
                <td className="py-1.5 pr-2 text-xs text-muted-foreground">
                  {d.isTaxable
                    ? d.fromDonors.map((fd) => `${fd.donorName} ${formatKRW(fd.amount)}`).join(" · ")
                    : d.potentialAmount
                      ? `참고 ${formatKRW(d.potentialAmount)}`
                      : "—"}
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {d.isTaxable ? formatKRW(d.total) : d.potentialAmount ? `(${formatKRW(d.potentialAmount)})` : "—"}
                </td>
                <td className="py-1.5 pl-2 text-right text-xs whitespace-nowrap">
                  {d.isTaxable ? "○ 과세" : `— ${d.nonTaxableReason ?? "비과세"}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 카드② 감자 후 1주당 평가액 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-4" data-testid="cd-multi-post-value">
        <p className="text-sm font-semibold text-sky-800">감자 후 1주당 평가액</p>
        <p className="mt-1 text-right font-mono text-lg font-bold tabular-nums text-sky-900">
          {formatKRW(multi.postPerShareDisplay)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          (감자 전 발행주식총수 × 1주당 평가액 − 총 소각대가) ÷ 감자 후 잔여 주식수. 원 미만 반올림 표시값이며, 증여이익·검증표
          계산은 반올림 전 정확값으로 합니다.
        </p>
      </div>

      {/* 카드③ 감자 전·후 검증표 */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-4" data-testid="cd-multi-verification">
        <p className="text-sm font-semibold text-violet-800">감자 전·후 검증</p>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-xs text-violet-700">
              <th className="py-1 text-left font-medium">주주</th>
              <th className="py-1 text-right font-medium">감자전 주식가액</th>
              <th className="py-1 text-right font-medium">감자대가</th>
              <th className="py-1 text-right font-medium">감자후 주식가액</th>
              <th className="py-1 text-right font-medium">증감</th>
            </tr>
          </thead>
          <tbody>
            {multi.verification.map((v) => (
              <tr key={v.name} className="border-t border-violet-100">
                <td className="py-1.5 pr-2 font-medium">{v.name}</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(v.preValue)}</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {v.redemptionPaid ? formatKRW(v.redemptionPaid) : "—"}
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(v.postValue)}</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(v.delta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted-foreground">
          증감 = 감자후 주식가액 + 감자대가 − 감자전 주식가액. 잔존주주 증감 합계 = 과세 증여이익 합계(자기일관).
        </p>
      </div>

      {/* 카드④ 과세 수증자 선택 (2명 이상일 때) */}
      {taxable.length > 1 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-4" data-testid="cd-multi-donee-select">
          <p className="text-sm font-semibold text-rose-800">증여세 계산 대상 수증자 선택</p>
          <select
            value={selectedDoneeIndex}
            onChange={(e) => onSelectDonee(Number(e.target.value))}
            data-testid="cd-multi-donee-selector"
            className="mt-2 w-full rounded-md border border-rose-200 bg-white px-2 py-1.5 text-sm"
          >
            {taxable.map((d, i) => (
              <option key={d.name} value={i}>
                {d.name} — 증여재산가액 {formatKRW(d.total)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">수증자별로 각각 별도 증여세 신고가 필요합니다.</p>
        </div>
      )}
    </>
  );
}
