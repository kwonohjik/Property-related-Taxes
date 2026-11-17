"use client";

/**
 * 연도별 산출근거 표 — 과세연도 · 경감세액 · 이자 기산일 · 일수 · 율 · 이자.
 * 이자율이 갈리는 해는 하위 행으로 구간을 풀어 쓴다(「2018.12.18.~2019.2.11. 56일 × 1일 10만분의 30」).
 * 금액·일수 칸은 amount-column-align 표준(font-mono tabular-nums 우측 정렬).
 * 기산일 설명(12.15.가 토·일·공휴일이라 넘어간 해)은 가로 스크롤 영역 밖에 둔다(375px).
 */
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { RecaptureAnnualInterest } from "@/lib/tax-engine/types/comprehensive.types";
import { COMPREHENSIVE_EXCL } from "@/lib/tax-engine/legal-codes";
import { deadlineCarryText, dotDate } from "./shared";

const NUM = "text-right font-mono tabular-nums whitespace-nowrap";
const TH = "px-2 py-1.5 text-xs font-medium text-muted-foreground whitespace-nowrap";

/** 「1일 10만분의 30」 */
function rateText(ratePer100k: number): string {
  return `1일 10만분의 ${ratePer100k}`;
}

export function AnnualInterestTable({ rows }: { rows: RecaptureAnnualInterest[] }) {
  const carried = rows
    .map((r) => ({ r, text: deadlineCarryText(r.taxYear, r.paymentDeadline) }))
    .filter((x): x is { r: RecaptureAnnualInterest; text: string } => x.text !== null);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto print:overflow-visible rounded-md border">
        <table className="w-full min-w-[34rem] text-sm" data-testid="rc-annual-table">
          <thead className="bg-muted/40">
            <tr>
              <th className={`${TH} text-left`}>과세연도</th>
              <th className={`${TH} text-right`}>경감받은 세액</th>
              <th className={`${TH} text-right`}>이자 기산일</th>
              <th className={`${TH} text-right`}>일수</th>
              <th className={`${TH} text-right`}>율</th>
              <th className={`${TH} text-right`}>이자상당가산액</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const split = r.segments.length >= 2;
              return (
                <RowGroup key={r.taxYear} r={r} split={split} />
              );
            })}
          </tbody>
        </table>
      </div>
      {carried.length > 0 && (
        <ul className="space-y-1 text-caption text-muted-foreground" data-testid="rc-deadline-carry">
          {carried.map(({ r, text }) => (
            <li key={r.taxYear}>
              {r.taxYear}년분 이자 기산일은 {dotDate(r.interestFrom)}입니다 — 납부기한 {text} 다음 날(12.16.이 아닙니다 · {COMPREHENSIVE_EXCL.RECAPTURE_DEADLINE_CARRY_BASIS}).
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RowGroup({ r, split }: { r: RecaptureAnnualInterest; split: boolean }) {
  const only = r.segments.length === 1 ? r.segments[0] : null;
  return (
    <>
      <tr data-testid={`rc-annual-${r.taxYear}`}>
        <td className="px-2 py-1.5 font-medium whitespace-nowrap">{r.taxYear}년분</td>
        <td className={`px-2 py-1.5 ${NUM}`}>{formatKRW(r.amount)}</td>
        <td className={`px-2 py-1.5 ${NUM}`}>{dotDate(r.interestFrom)}</td>
        <td className={`px-2 py-1.5 ${NUM}`}>{r.days.toLocaleString()}일</td>
        <td className="px-2 py-1.5 text-right whitespace-nowrap text-xs">
          {only ? rateText(only.ratePer100k) : split ? "구간별(아래)" : "—"}
        </td>
        <td className={`px-2 py-1.5 font-semibold ${NUM}`}>{formatKRW(r.interest)}</td>
      </tr>
      {split &&
        r.segments.map((g, i) => (
          <tr key={`${r.taxYear}-${i}`} className="bg-muted/20 text-xs" data-testid={`rc-seg-${r.taxYear}-${i}`}>
            <td colSpan={3} className="px-2 py-1 pl-6 text-muted-foreground">
              {dotDate(g.from)}~{dotDate(g.to)}
            </td>
            <td className={`px-2 py-1 ${NUM}`}>{g.days.toLocaleString()}일</td>
            <td className="px-2 py-1 text-right whitespace-nowrap">× {rateText(g.ratePer100k)}</td>
            <td className={`px-2 py-1 ${NUM}`}>{formatKRW(g.interest)}</td>
          </tr>
        ))}
      {r.segments.length === 0 && (
        <tr className="bg-muted/20 text-xs">
          <td colSpan={6} className="px-2 py-1 pl-6 text-muted-foreground">
            고지일이 이자 기산일보다 앞서 이자 기간이 없습니다.
          </td>
        </tr>
      )}
    </>
  );
}
