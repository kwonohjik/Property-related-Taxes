"use client";

/**
 * 연부연납 일정표 결과 카드 (상속세, 상증법 §71·§72)
 *
 * 요약 카드(허가총세액·가산금 합계·총 납부세액) + 회차별 상세 표(일자·원금·가산금·합계).
 * 결정세액에 영향을 주지 않는 투영 — 폼 입력(여부·기간·가업·미래율)을 받아
 * 순수 엔진 calcInstallmentSchedule 호출(단일 진실, dual-truth 회피).
 *
 * 설계: docs/02-design/features/inheritance-installment-payment.design.md §5.2
 */

import { useState } from "react";
import { addMonths, endOfMonth, format } from "date-fns";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { ExpandToggleButton } from "@/components/calc/results/shared/ExpandToggleButton";
import {
  calcInstallmentSchedule,
  isInstallmentEligible,
  CURRENT_SURCHARGE_RATE,
  type FamilyBusinessInstallmentMode,
} from "@/lib/tax-engine/credits/installment-payment";
import type { InheritanceTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";

export interface InstallmentScheduleCardProps {
  result: InheritanceTaxResult;
  /** 상속개시일(ISO) — 신고기한 산정 (§67① 말일+6개월) */
  deathDate?: string;
  /** 거주자/비거주자 — 비거주자(외국 주소)는 신고기한 9개월 (§67④) */
  decedentType?: "resident" | "non_resident";
  enabled: boolean;
  /** 희망 연부연납 기간(년, 문자열) */
  years: string;
  familyBusiness: boolean;
  fbMode: FamilyBusinessInstallmentMode;
  /** 미래 회차 가산율(연 %, 문자열) */
  futureRate: string;
}

const cardWrap =
  "border border-amber-200 dark:border-amber-700 rounded-xl overflow-hidden";
const amountCell = "text-right font-mono tabular-nums whitespace-nowrap";

export function InstallmentScheduleCard({
  result,
  deathDate,
  decedentType = "resident",
  enabled,
  years,
  familyBusiness,
  fbMode,
  futureRate,
}: InstallmentScheduleCardProps) {
  const finalTax = result.finalTax;
  // 기본 접힘 — 다른 섹션(상장주식 평가조서 등)과 통일. 인쇄 시 CSS 자동 펼침.
  const [open, setOpen] = useState(false);

  // 부적격(2천만원 이하)이면 표시 안 함
  if (!isInstallmentEligible(finalTax)) return null;

  // ── 미신청: 적격 안내 요약만 ──────────────────────────────────────
  if (!enabled) {
    return (
      <div className={cardWrap}>
        <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <h4 className="text-sm font-medium text-amber-800 dark:text-amber-200">
            연부연납 안내 (상증법 §71)
          </h4>
          <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
            결정세액 2천만원 초과 — 분할납부 신청 가능 (일반 10년 / 가업상속 20년)
          </p>
        </div>
        <div className="p-3 text-xs text-gray-600 dark:text-gray-300">
          5단계(공제·세액공제) 하단에서 <b>연부연납 신청</b>을 켜면 회차별 납부
          일정표(일자·원금·가산금·합계)가 여기에 표시됩니다.
        </div>
      </div>
    );
  }

  // ── 신청: 일정표 계산 ─────────────────────────────────────────────
  const reqYears = parseInt(years, 10) || 5;
  const futureRateDecimal = (parseFloat(futureRate) || CURRENT_SURCHARGE_RATE * 100) / 100;

  // 신고기한 = 상속개시일이 속하는 달의 말일부터 6개월(거주자) / 9개월(비거주자, §67④)
  const filingMonths = decedentType === "non_resident" ? 9 : 6;
  const filingDeadline = deathDate
    ? addMonths(endOfMonth(new Date(deathDate)), filingMonths)
    : addMonths(endOfMonth(new Date()), filingMonths);

  const fbValue = result.deductionDetail.familyBusinessDetail?.finalValue ?? 0;
  const useFb = familyBusiness && fbValue > 0;

  const schedule = calcInstallmentSchedule({
    finalTax,
    filingDeadline,
    requestedYears: reqYears,
    futureSurchargeRate: futureRateDecimal,
    today: new Date(),
    familyBusiness: useFb
      ? {
          familyBusinessValue: fbValue,
          familyBusinessDeduction: result.deductionDetail.familyBusinessDeduction,
          grossEstateValue: result.grossEstateValue,
          mode: fbMode,
        }
      : undefined,
  });

  const immediate = schedule.rows
    .filter((r) => r.installmentNo === 0)
    .reduce((s, r) => s + r.principal, 0);

  const segLabel = (seg: "general" | "family_business") =>
    seg === "family_business" ? "가업" : "일반";

  return (
    <section
      className="border border-border rounded-xl overflow-hidden"
      data-testid="installment-schedule-card"
    >
      {/* 헤더 — 다른 섹션(상장주식 평가조서 등)과 통일된 접힘/펼침 */}
      <div className="px-4 py-3 bg-muted/30 flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">
          연부연납 일정표 (상증법 §71·§72)
        </h4>
        <ExpandToggleButton open={open} onClick={() => setOpen((v) => !v)} tone="slate" />
      </div>

      <div className={open ? "block" : "hidden print:block"}>
      {/* 부제 */}
      <p className="px-4 pt-3 text-xs text-muted-foreground">
        신고기한 즉납 1회 + 매년 분할납부 — 각 회분 납부일 현재 고시 가산율 적용
        {schedule.autoShortened && (
          <span className="ml-1 rounded bg-amber-200 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-800/40 dark:text-amber-200">
            §71② 단서로 {schedule.appliedYears}년 적용(희망 {reqYears}년)
          </span>
        )}
      </p>

      {/* 요약 */}
      <div className="space-y-1.5 border-b border-border p-3 text-xs text-gray-700 dark:text-gray-200">
        <div className="flex justify-between">
          <span>연부연납 대상 (결정세액)</span>
          <span className={amountCell}>{formatKRW(schedule.totalPrincipal)}</span>
        </div>
        <div className="flex justify-between">
          <span>허가 즉시 납부 (신고기한)</span>
          <span className={amountCell}>{formatKRW(immediate)}</span>
        </div>
        <div className="flex justify-between">
          <span>연부연납 허가 총세액</span>
          <span className={amountCell}>{formatKRW(schedule.deferredTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>가산금 합계</span>
          <span className={amountCell}>{formatKRW(schedule.totalSurcharge)}</span>
        </div>
        <div className="flex justify-between font-semibold text-amber-800 dark:text-amber-200">
          <span>총 납부세액</span>
          <span className={amountCell}>{formatKRW(schedule.grandTotal)}</span>
        </div>
      </div>

      {/* 회차별 상세 표 */}
      <div className="overflow-x-auto p-3">
        <table className="w-full text-xs" data-testid="installment-schedule-table">
          <thead>
            <tr className="border-b border-gray-300 text-gray-500 dark:border-gray-600 dark:text-gray-400">
              <th className="py-1.5 px-2 text-center">회차</th>
              <th className="py-1.5 px-2 text-left">납부일자</th>
              {useFb && <th className="py-1.5 px-2 text-center">구분</th>}
              <th className="py-1.5 px-2 text-right">납부원금</th>
              <th className="py-1.5 px-2 text-right">가산금</th>
              <th className="py-1.5 px-2 text-right">합계세액</th>
            </tr>
          </thead>
          <tbody>
            {schedule.rows.map((row, i) => (
              <tr
                key={`${row.installmentNo}-${row.segment}-${i}`}
                className="border-b border-gray-100 dark:border-gray-800"
              >
                <td className="py-1.5 px-2 text-center tabular-nums">
                  {row.installmentNo}
                  {row.installmentNo === 0 && (
                    <span className="ml-1 text-micro text-amber-600">즉납</span>
                  )}
                </td>
                <td className="py-1.5 px-2 text-left tabular-nums">
                  {format(row.dueDate, "yyyy-MM-dd")}
                </td>
                {useFb && (
                  <td className="py-1.5 px-2 text-center text-micro text-gray-500">
                    {segLabel(row.segment)}
                  </td>
                )}
                <td className={`py-1.5 px-2 ${amountCell}`}>
                  {formatKRW(row.principal)}
                </td>
                <td className={`py-1.5 px-2 ${amountCell}`}>
                  {formatKRW(row.surcharge)}
                </td>
                <td className={`py-1.5 px-2 ${amountCell} font-medium`}>
                  {formatKRW(row.total)}
                </td>
              </tr>
            ))}
            {/* 합계행 */}
            <tr className="border-t-2 border-gray-300 font-semibold dark:border-gray-600">
              <td className="py-1.5 px-2 text-center" colSpan={useFb ? 3 : 2}>
                합계
              </td>
              <td className={`py-1.5 px-2 ${amountCell}`}>
                {formatKRW(schedule.totalPrincipal)}
              </td>
              <td className={`py-1.5 px-2 ${amountCell}`}>
                {formatKRW(schedule.totalSurcharge)}
              </td>
              <td className={`py-1.5 px-2 ${amountCell}`}>
                {formatKRW(schedule.grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 주석 */}
      <div className="space-y-1 border-t border-border p-3 text-caption text-muted-foreground">
        {decedentType === "non_resident" && (
          <p>※ 비거주자 — 신고기한을 상속개시월 말일부터 9개월로 산정했습니다(§67④).</p>
        )}
        {schedule.notes.map((n, i) => (
          <p key={i}>※ {n}</p>
        ))}
        <p>
          ※ 가산금은 각 회분 납부일 현재 고시 가산율(상증령 §69 → 국기령 §43의3)을
          적용하며, 미래 회차는 입력 가산율 연 {futureRate}%를 가정합니다. 실제 세액은
          관할 세무서·세무사 확인을 권장합니다.
        </p>
      </div>
      </div>
    </section>
  );
}
