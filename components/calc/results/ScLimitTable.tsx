"use client";

/**
 * §45의5② 증여세 한도 표 — single(지분율 직접)·roster(주주 명단) **양 모드 공용**.
 *
 * 조문(법 §45의5② · 영 §34의5⑨)에는 입력 모드 축이 없다. 종전에는 이 표가 roster 전용이라
 * 기본 모드인 single 사용자는 한도를 볼 수 없었고, 한도용 입력(증여재산공제)은 엔진까지
 * 도달한 뒤 버려지는 유령 필드였다. 표를 한 곳에 두어 두 경로가 갈리지 않게 한다.
 */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { SpecificCorpLimitCalc } from "@/lib/tax-engine/gift-deemed/types";

export function ScLimitTable({ limitCalc }: { limitCalc: SpecificCorpLimitCalc | undefined }) {
  return (
    <>
      {limitCalc ? (
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-t border-violet-100">
              <td className="py-1.5 pr-2 text-muted-foreground">
                적용 증여재산공제 (§53)
              </td>
              <td
                className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap"
                data-testid="sc-limit-deduction"
              >
                {formatKRW(limitCalc.giftDeductionApplied)}
              </td>
            </tr>
            {limitCalc.generationSkipSurcharge > 0 && (
              <tr className="border-t border-violet-100">
                <td className="py-1.5 pr-2 text-muted-foreground">
                  세대생략 할증 (§57) — ㉮·㉠에 포함
                </td>
                <td
                  className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-rose-700"
                  data-testid="sc-limit-generation-skip"
                >
                  {formatKRW(limitCalc.generationSkipSurcharge)}
                </td>
              </tr>
            )}
            <tr className="border-t border-violet-100">
              <td className="py-1.5 pr-2 text-muted-foreground">㉮ 일반 산출세액</td>
              <td
                className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap"
                data-testid="sc-limit-computed-tax"
              >
                {formatKRW(limitCalc.computedTax)}
              </td>
            </tr>
            <tr className="border-t border-violet-100">
              <td className="py-1.5 pr-2 text-muted-foreground">
                ㉠ 직접증여 가정 산출세액 (법인세 차감 전 거래이익을 직접 증여한 것으로 가정)
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                {formatKRW(limitCalc.directGiftTax)}
              </td>
            </tr>
            <tr className="border-t border-violet-100">
              <td className="py-1.5 pr-2 text-muted-foreground">
                ㉡ 법인세 상당액 × 지분율
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                {formatKRW(limitCalc.corpTaxShare)}
              </td>
            </tr>
            <tr className="border-t border-violet-200 bg-violet-50">
              <td className="py-1.5 pr-2 font-semibold text-violet-900">
                ㉯ 한도액 = ㉠ − ㉡
              </td>
              <td
                className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap font-bold text-violet-900"
                data-testid="sc-limit-amount"
              >
                {formatKRW(limitCalc.limitAmount)}
              </td>
            </tr>
            <tr className="border-t border-violet-200">
              <td className="py-1.5 pr-2 text-muted-foreground">
                적용 산출세액 = Min(㉮, ㉯)
              </td>
              <td
                className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap font-semibold"
                data-testid="sc-limit-final-tax"
              >
                {formatKRW(limitCalc.finalTax)}
              </td>
            </tr>
            <tr className="border-t border-violet-100">
              <td className="py-1.5 pr-2 text-muted-foreground">
                {/* 엔진 echo — 라벨에 3%를 박으면 거래일이 2019-01-01 이전일 때 stale해진다 */}
                신고세액공제 ({Math.round(limitCalc.filingCreditRate * 100)}%)
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-violet-700">
                −{formatKRW(limitCalc.filingCredit)}
              </td>
            </tr>
            <tr className="border-t border-violet-300 bg-violet-100/60">
              <td className="py-2 pr-2 font-bold text-violet-900">자진납부세액</td>
              <td
                className="py-2 text-right font-mono tabular-nums whitespace-nowrap text-lg font-bold text-violet-900"
                data-testid="sc-limit-self-pay-tax"
              >
                {formatKRW(limitCalc.selfPayTax)}
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-muted-foreground">한도 계산 정보를 불러올 수 없습니다.</p>
      )}
    </>
  );
}
