"use client";

/**
 * GiftDonorPaidGrossUpSection — 증여세 대납(代納) gross-up 상세 카드 (§36 채무면제이익)
 *
 * GiftTaxResultView에서 800줄 정책 준수를 위해 분리.
 * 기존 전액 대납(PR#323)과 부분 대납(doneePaidGiftTax > 0) 양쪽을 5행 구조로 표시.
 *
 * 행 구성:
 *   ① 원본 증여세 과세가액 (§53 공제 차감 전)      originalNetGift (A)
 *   ② 총 결정세액 (수렴값)                          totalGiftTax (T*)  — 신규, optional
 *   ③ 수증자 본인 납부                              doneePaidTax (P)   — 신규, P>0만 노출
 *   ④ 증여자 대납분 (총세액 − 수증자 납부)          donorPaidTax (D)
 *   ⑤ gross-up 후 최종 과세표준                     grossedUpNetGift (V*)
 *
 * 흐름행: A + D = V* (P는 V* 합산에 미포함)
 */

import type { GiftTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";

interface Props {
  grossUp: NonNullable<GiftTaxResult["donorPaidTaxGrossUp"]>;
}

export function GiftDonorPaidGrossUpSection({ grossUp }: Props) {
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-3 dark:border-violet-800 dark:bg-violet-950/20">
      <h3 className="text-sm font-semibold text-violet-800 dark:text-violet-200">
        대납(代納) gross-up 상세 (§36 채무면제이익)
      </h3>
      <p className="text-xs text-violet-600 dark:text-violet-400">
        증여자가 수증자의 증여세를 대납하면 그 세액 자체도 채무면제이익 증여로 보아 과세표준에 합산합니다.
        수렴할 때까지 반복 계산(최대 100회)한 결과입니다.
      </p>

      <div className="space-y-1.5 text-sm">
        {/* ① 원본 증여세 과세가액 (§53 공제 차감 전) */}
        <div className="flex items-center justify-between px-3 py-2">
          <span>원본 증여세 과세가액 (§53 공제 차감 전)</span>
          <span className="font-mono tabular-nums">{formatKRW(grossUp.originalNetGift)}</span>
        </div>

        {/* ② 총 결정세액 T* — 신규 (optional echo) */}
        {grossUp.totalGiftTax !== undefined && (
          <div className="flex items-center justify-between px-3 py-2">
            <span>총 결정세액 (수렴값)</span>
            <span className="font-mono tabular-nums">{formatKRW(grossUp.totalGiftTax)}</span>
          </div>
        )}

        {/* ③ 수증자 본인 납부 P — P > 0 인 경우만 노출 */}
        {grossUp.doneePaidTax !== undefined && grossUp.doneePaidTax > 0 && (
          <div className="flex items-center justify-between px-3 py-2">
            <span>수증자 본인 납부</span>
            <span className="font-mono tabular-nums">{formatKRW(grossUp.doneePaidTax)}</span>
          </div>
        )}

        {/* ④ 증여자 대납분 D */}
        <div className="flex items-center justify-between px-3 py-2 font-semibold text-violet-700 dark:text-violet-300">
          <span>증여자 대납분 (총세액 − 수증자 납부)</span>
          <span className="font-mono tabular-nums">{formatKRW(grossUp.donorPaidTax)}</span>
        </div>

        {/* ⑤ gross-up 후 최종 과세표준 V* */}
        <div className="flex items-center justify-between px-3 py-2 font-semibold bg-violet-100/60 dark:bg-violet-900/20 rounded-lg">
          <span>gross-up 후 최종 과세표준</span>
          <span className="font-mono tabular-nums">{formatKRW(grossUp.grossedUpNetGift)}</span>
        </div>
      </div>

      {/* P ≥ T* 경계 케이스 (A-3): 증여자 대납분 없음 안내 */}
      {grossUp.donorPaidTax === 0 && (
        <div className="rounded-md border border-violet-200 bg-violet-50/40 dark:border-violet-800 dark:bg-violet-950/20 px-3 py-2 text-xs text-violet-700 dark:text-violet-300">
          수증자 본인 납부액이 총 결정세액 이상이어서 증여자 대납분이 없습니다.
          재차증여 해당 없음 (§36 최대 0 게이트 적용).
        </div>
      )}

      {/* 흐름 표시 — A + D = V* (P 미포함) */}
      <div className="flex items-center gap-1.5 flex-wrap text-xs text-violet-700 dark:text-violet-300 bg-violet-100/60 dark:bg-violet-900/20 rounded-lg px-3 py-2">
        <span>{formatKRW(grossUp.originalNetGift)}</span>
        <span className="text-violet-400">+</span>
        <span>{formatKRW(grossUp.donorPaidTax)} (증여자 대납분)</span>
        <span className="text-violet-400">=</span>
        <span className="font-semibold">{formatKRW(grossUp.grossedUpNetGift)} (최종 과표)</span>
      </div>

      {/* 수렴 비교용 baseline */}
      <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
        <span>gross-up 전 기준 산출세액 (수렴 비교용, 반복 {grossUp.iterations}회)</span>
        <span className="font-mono tabular-nums">{formatKRW(grossUp.baselineTax)}</span>
      </div>
    </div>
  );
}
