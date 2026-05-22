"use client";

import type { CalculationStep } from "@/lib/tax-engine/types/inheritance-gift.types";

interface Props {
  /** result.deductionDetail.breakdown */
  breakdown: CalculationStep[];
}

const formatKRW = (n: number): string => `${n.toLocaleString()}원`;

/**
 * §24 종합한도 발동 안내 카드.
 *
 * - 발동 조건: breakdown에 정확 라벨 "한도 초과 — 종합한도 적용" (코드 inheritance-deductions.ts L712) 포함
 * - 매칭은 `.includes("한도 초과")`로 라벨 부분 변경에 안전
 * - 미발동 시 null 반환 (자동 숨김)
 *
 * 노출 정보:
 *   ① §24 한도 (ceiling, breakdown "§24 종합한도 (...)" 라인)
 *   ② 한도 적용 후 공제액 (limitedDeduction, "한도 초과" 라인)
 *   ③ 미적용 차감액 (rawTotal − ceiling, "공제 소계" − ceiling)
 *   ④ 산식 안내 (한국어 풀어쓰기)
 *
 * 14지점 ⑦(결과 카드) 전용. 엔진/타입 변경 0.
 */
export function DeductionLimitNoticeCard({ breakdown }: Props) {
  const limitLine = breakdown.find((s) => s.label?.includes("한도 초과"));
  if (!limitLine) return null;

  const ceilingLine = breakdown.find((s) => s.label?.includes("§24 종합한도"));
  const rawTotalLine = breakdown.find((s) => s.label === "공제 소계");

  const ceiling = ceilingLine?.amount ?? limitLine.amount;
  const rawTotal = rawTotalLine?.amount ?? limitLine.amount;
  const cappedAmount = limitLine.amount;
  const excludedAmount = Math.max(0, rawTotal - cappedAmount);

  return (
    <div
      data-testid="deduction-limit-notice"
      className="rounded-md border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-1.5 print:bg-amber-50 print:border-amber-300"
    >
      <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
        ⓘ §24 종합한도 적용 — 공제 한도 초과
      </p>
      <ul className="text-[11px] text-amber-700 dark:text-amber-300 space-y-0.5 list-disc list-inside">
        <li>
          공제 신청 합계: <span className="font-medium">{formatKRW(rawTotal)}</span>
        </li>
        <li>
          §24 한도(과세가액 − 사전증여 등): <span className="font-medium">{formatKRW(ceiling)}</span>
        </li>
        <li>
          한도 적용 공제: <span className="font-medium">{formatKRW(cappedAmount)}</span>
        </li>
        <li>
          미적용 차감: <span className="font-medium">{formatKRW(excludedAmount)}</span>
        </li>
      </ul>
      <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-relaxed">
        상속세및증여세법 §24 — 상속공제 총액은 상속세 과세가액에서 상속인·수유자에 대한 사전증여재산
        가산액(증여재산공제·재해손실공제 차감) 및 상속인 외 자에 대한 유증액을 차감한 금액을 한도로 합니다.
      </p>
    </div>
  );
}
