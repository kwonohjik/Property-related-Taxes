"use client";

/**
 * InstallmentResultCard — 연부취득 신고 일정 카드
 *
 * 설계 문서: docs/02-design/features/acquisition-tax-installment.sync-points.md (동기화 지점 ⑦)
 * 법령 근거: 지방세법 §10의5, §20⑤ (각 회차 지급일 + 60일 이내 신고)
 *
 * 표시 내용:
 *  - 각 회차 지급일, 신고기한 (지급일 + 60일), D-day
 *  - 다주택 + 연부 주의 배너 (조건부)
 *  - 합산 간이 계산 안내
 */

import { differenceInDays, parseISO } from "date-fns";
import type { AcquisitionTaxResult } from "@/lib/tax-engine/types/acquisition.types";

// ============================================================
// 유틸
// ============================================================

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR");
}

/** paymentDate + days 일 → YYYY-MM-DD */
function addDays(dateStr: string, days: number): string {
  try {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

// ============================================================
// D-day 뱃지
// ============================================================

function DdayBadge({ deadline }: { deadline: string }) {
  let dday: number;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dday = differenceInDays(parseISO(deadline), today);
  } catch {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  const isPast = dday < 0;
  const isUrgent5 = !isPast && dday <= 5;
  const isUrgent30 = !isPast && dday <= 30;

  let cls = "text-xs font-bold px-1.5 py-0.5 rounded ";
  if (isPast) {
    cls += "bg-destructive/20 text-destructive";
  } else if (isUrgent5) {
    cls += "bg-red-100 text-red-700 animate-pulse";
  } else if (isUrgent30) {
    cls += "bg-amber-100 text-amber-700";
  } else {
    cls += "bg-muted text-muted-foreground";
  }

  const label = isPast
    ? "경과"
    : dday === 0
    ? "D-day"
    : `D-${dday}`;

  return <span className={cls}>{label}</span>;
}

// ============================================================
// Props
// ============================================================

interface Props {
  installmentFilingSchedule: NonNullable<AcquisitionTaxResult["installmentFilingSchedule"]>;
  acquisitionTax: number;
  isSurcharged?: boolean;
  /** 폼에서 전달받은 회차 정보 (엔진 결과에 없을 경우 폼 데이터로 보충) */
  installmentRows?: Array<{
    label?: string;
    paymentDate: string;
    amount: string;
  }>;
}

// ============================================================
// 메인 카드
// ============================================================

export function InstallmentResultCard({
  installmentFilingSchedule,
  acquisitionTax,
  isSurcharged,
  installmentRows,
}: Props) {
  // 엔진 결과의 스케줄과 폼 rows를 병합하여 amount 정보 보강
  const scheduleWithAmount = installmentFilingSchedule.map((entry, idx) => {
    const row = installmentRows?.[idx];
    const amountStr = row?.amount ?? "";
    const amount = parseInt(amountStr.replace(/,/g, ""), 10) || 0;
    return {
      ...entry,
      amount,
      deadline: entry.deadline || addDays(entry.paymentDate, 60),
    };
  });

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none">
          연
        </span>
        <p className="text-sm font-semibold text-amber-800">연부취득 신고 일정 (§10의5·§20⑤)</p>
      </div>

      {/* 과세표준 결정 방식 안내 */}
      <div className="text-xs text-amber-700 space-y-1">
        <p>각 회차 지급액을 합산하여 과세표준 결정 (지방세법 §10의5)</p>
        <p>각 회차 지급일로부터 <strong>60일 이내</strong> 신고·납부 의무 (§20⑤)</p>
      </div>

      {/* 회차별 신고기한 표 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-amber-200 text-amber-700 text-left">
              <th className="py-1.5 pr-2 font-medium">회차</th>
              <th className="py-1.5 pr-2 font-medium">지급일</th>
              {installmentRows && installmentRows.some((r) => (parseInt(r.amount.replace(/,/g, ""), 10) || 0) > 0) && (
                <th className="py-1.5 pr-2 font-medium text-right">지급액</th>
              )}
              <th className="py-1.5 pr-2 font-medium">신고기한</th>
              <th className="py-1.5 font-medium">D-day</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100">
            {scheduleWithAmount.map((entry, idx) => {
              const showAmount = installmentRows && (parseInt(installmentRows[idx]?.amount?.replace(/,/g, "") ?? "0", 10) || 0) > 0;
              return (
                <tr key={idx} className="text-foreground">
                  <td className="py-1.5 pr-2">
                    {entry.label ? (
                      <span>{entry.label}</span>
                    ) : (
                      <span className="text-muted-foreground">{idx + 1}회차</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 font-mono text-muted-foreground">{entry.paymentDate}</td>
                  {showAmount && (
                    <td className="py-1.5 pr-2 text-right">
                      {entry.amount > 0 ? formatKRW(entry.amount) : "-"}
                    </td>
                  )}
                  <td className="py-1.5 pr-2 font-mono text-muted-foreground">{entry.deadline}</td>
                  <td className="py-1.5">
                    <DdayBadge deadline={entry.deadline} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 취득세 합산 참고 */}
      <div className="flex justify-between items-center text-xs border-t border-amber-200 pt-2">
        <span className="text-amber-700">합산 취득세 본세 (간이 계산)</span>
        <span className="font-bold text-amber-800">{formatKRW(acquisitionTax)}</span>
      </div>

      {/* 다주택 + 연부 주의 배너 */}
      {isSurcharged && (
        <div className="rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-xs text-amber-800 space-y-1">
          <p className="font-semibold">연부취득 + 다주택 주의사항</p>
          <p>
            이 결과는 취득 시점 기준 주택 수로 세율을 계산한 합산 간이 계산입니다.
            각 회차 지급일 시점의 주택 수가 달라 중과세율이 회차별로 다를 수 있습니다.
            정확한 회차별 세액은 세무사에게 상담하세요.
          </p>
        </div>
      )}

      {/* 간이 계산 안내 */}
      <div className="text-xs text-muted-foreground border-t border-amber-100 pt-2">
        이 계산은 전 회차 합산 기준 간이 계산입니다. 각 회차마다 별도 신고·납부 의무가 있습니다.
      </div>
    </div>
  );
}
