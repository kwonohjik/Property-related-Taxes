/**
 * 납부지연가산세 산출근거 카드 — 상속·증여 **공용** (🔴 G-07 B3)
 *
 * 「국세기본법」 §47의4①1호 — 「납부하지 아니한 세액 × **법정납부기한의 다음 날부터
 * 납부일의 전날까지**의 기간 × 대통령령으로 정하는 이자율」.
 *
 * 🔑 **이자율 구간이 둘 이상이면 대표 이자율 하나를 적지 않는다.** 시행령 §27의4 이자율은
 *    개정마다 시행일이 있고 경과조치는 시행일 이후 기간분에 신율을 적용한다 — 단일 이자율로
 *    적으면 산식이 금액을 재현하지 못한다(양도세 G-04 가 정확히 그 결함이었다).
 *
 * 적용제외(§47의4③)로 0이 된 경우에는 **그 호를 밝힌다** — 금액만 0으로 두면 화면이
 * 「가산세가 없다」고 말할 뿐 왜 없는지를 말하지 못한다.
 */
import {
  LATE_PAYMENT_EXCLUSION_LABELS,
  type InheritanceGiftLatePaymentResult,
} from "@/lib/tax-engine/inheritance-gift-penalty";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";

export function LatePaymentPenaltyDetailCard({
  detail,
}: {
  detail: InheritanceGiftLatePaymentResult;
}) {
  return (
    <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50/60 px-4 py-3 text-sm">
      <p className="font-semibold text-rose-800 mb-1.5">납부지연가산세</p>
      {detail.exclusionApplied ? (
        <p className="text-xs text-rose-700">
          납부지연가산세 적용제외 — {LATE_PAYMENT_EXCLUSION_LABELS[detail.exclusionApplied]}
        </p>
      ) : (
        <div className="space-y-1">
          {detail.breakdown.map((seg, i) => (
            <div key={i} className="flex justify-between">
              <span className="text-rose-600">
                {formatKRW(detail.unpaidTax)} × {seg.days}일 ×{" "}
                {(seg.dailyRate * 100).toFixed(4)}%
                <span className="block text-caption text-rose-500">
                  국세기본법 §47의4①1호 · 이자율 {seg.effectiveFrom}
                </span>
              </span>
              <span className="font-mono tabular-nums text-rose-900">
                {formatKRW(seg.amount)}
              </span>
            </div>
          ))}
          <div className="flex justify-between border-t border-rose-200 pt-1 font-semibold">
            <span className="text-rose-800">가산세 합계 (총 {detail.elapsedDays}일)</span>
            <span className="font-mono tabular-nums text-rose-900">
              {formatKRW(detail.penalty)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
