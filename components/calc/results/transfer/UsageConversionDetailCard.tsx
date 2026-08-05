"use client";

/**
 * 비주택 → 주택 용도변경 장기보유특별공제 산출근거
 * (「소득세법」 제95조 제5항·제6항 · 「소득세법 시행령」 제154조 제5항 단서).
 *
 * 보유기간별 공제율이 **「비주택으로 보유한 기간 표1 + 주택으로 보유한 기간 표2」**로 나뉘는 것이
 * 이 카드의 존재 이유다 — 총 보유기간에 표2를 적용한 값과 다르다.
 *
 * 공제율은 엔진이 **정수 %**로 넘긴다(소수 rate 합산의 1원 오차 회피). 여기서 다시 계산하지 않는다.
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

type Detail = NonNullable<TransferTaxResult["usageConversionDetail"]>;

export function UsageConversionDetailCard({
  detail,
  deduction,
}: {
  detail: Detail;
  /** 장기보유특별공제 총액 — 카드 머리글에 함께 보인다 */
  deduction: number;
}) {
  const holdingPct = detail.table1Pct + detail.table2HoldingPct;
  const appliedHoldingPct = detail.holdingRateCapped ? 40 : holdingPct;

  return (
    <div className="rounded-lg border border-fuchsia-500/50 bg-fuchsia-50/40 p-4 space-y-2 dark:bg-fuchsia-950/20">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-fuchsia-900 dark:text-fuchsia-200">
          비주택 → 주택 용도변경 장기보유특별공제
        </p>
        <span className="font-mono tabular-nums whitespace-nowrap text-sm font-semibold">
          {deduction.toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        주거용으로 사용하기 시작한 날({detail.residentialUseStartDate})을 기준으로 보유기간을 나누어
        각각의 공제율을 적용합니다.
      </p>

      <div className="mt-2 space-y-1 text-xs">
        <p className="font-medium text-fuchsia-800 dark:text-fuchsia-300">보유기간 공제율</p>
        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 pl-3">
          <span className="text-muted-foreground">
            비주택으로 보유한 기간 {detail.nonHousingYears}년 → 표1
          </span>
          <span className="font-mono tabular-nums whitespace-nowrap text-right">
            {detail.table1Pct}%
          </span>
          <span className="text-muted-foreground">
            주택으로 보유한 기간 {detail.housingYears}년 → 표2
          </span>
          <span className="font-mono tabular-nums whitespace-nowrap text-right">
            {detail.table2HoldingPct}%
          </span>
          <span className="font-medium">합계</span>
          <span className="font-mono tabular-nums whitespace-nowrap text-right font-medium">
            {appliedHoldingPct}%
          </span>
        </div>
        {detail.holdingRateCapped && (
          <p className="pl-3 text-caption text-fuchsia-700 dark:text-fuchsia-300">
            표1과 표2의 합계 {holdingPct}%가 한도를 넘어 40%를 적용했습니다 (제95조 제5항 제1호 단서).
          </p>
        )}

        <p className="pt-1 font-medium text-fuchsia-800 dark:text-fuchsia-300">거주기간 공제율</p>
        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 pl-3">
          <span className="text-muted-foreground">
            주택으로 보유한 기간 중 거주한 기간 → 표2
          </span>
          <span className="font-mono tabular-nums whitespace-nowrap text-right">
            {detail.residencePct}%
          </span>
        </div>

        <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 border-t border-fuchsia-200 pt-2 dark:border-fuchsia-800/60">
          <span className="font-semibold">공제율 합계</span>
          <span className="font-mono tabular-nums whitespace-nowrap text-right font-semibold">
            {appliedHoldingPct + detail.residencePct}%
          </span>
        </div>
      </div>

      {detail.residenceMonthsTrimmed > 0 && (
        <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-medium">
            거주기간 {detail.residenceMonthsTrimmed}개월이 공제 대상에서 제외되었습니다
          </p>
          <p className="mt-0.5 text-caption leading-relaxed">
            입주일이 주거용 사용 개시일보다 빨라, 주택으로 보유하기 전의 거주기간이 제외되었습니다
            (제95조 제5항 제2호). 주거용 사용 개시일을 앞당겨야 하는지 확인하세요.
          </p>
        </div>
      )}

      <p className="pt-1 text-caption text-muted-foreground">
        근거: 「소득세법」 제95조 제5항·제6항
      </p>
    </div>
  );
}
