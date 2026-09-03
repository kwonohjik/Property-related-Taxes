/**
 * 신고불성실가산세 산출근거 카드 — 상속·증여 **공용** (🔴 G-07 B1)
 *
 * 「국세기본법」 §47의2(무신고)·§47의3(과소신고)·§48②2호(기한후신고 감면).
 *
 * 🔑 **「기준금액 × 세율」을 그대로 보인다** — 「결정세액 × 세율」로 오해하지 않도록.
 *    과소신고는 base 가 결정세액이 아니라 **결정세액 − 당초 신고세액**이다(§47의3①).
 *
 * 적용제외(§47의3④1호)로 0이 된 경우에는 **그 사유를 밝힌다** — 금액만 0으로 두면
 * 화면이 「가산세가 없다」고 말할 뿐 왜 없는지를 말하지 못한다.
 */
import {
  UNDER_REPORT_EXCLUSION_LABELS,
  type InheritanceGiftPenaltyResult,
} from "@/lib/tax-engine/inheritance-gift-penalty";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";

export function FilingPenaltyDetailCard({ detail }: { detail: InheritanceGiftPenaltyResult }) {
  return (
    <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50/60 px-4 py-3 text-sm">
      <p className="font-semibold text-rose-800 mb-1.5">신고불성실가산세</p>
      {detail.exclusionApplied ? (
        <p className="text-xs text-rose-700">
          과소신고가산세 적용제외 — {UNDER_REPORT_EXCLUSION_LABELS[detail.exclusionApplied]}{" "}
          (국세기본법 §47의3④1호)
        </p>
      ) : (
        <div className="space-y-1">
          {/*
            🔴 B2 — 적용제외 사유를 골랐는데 단서에 걸려 성립하지 않은 경우. 금액만 보이면
            입력이 무시된 것처럼 읽힌다 — 왜 제외가 안 됐는지를 말한다.
          */}
          {detail.exclusionOverriddenByFraud && (
            <p className="text-caption text-rose-700">
              {UNDER_REPORT_EXCLUSION_LABELS[detail.exclusionOverriddenByFraud]} — 부정행위에
              해당해 적용제외가 성립하지 않습니다 (국세기본법 §47의3④1호 단서)
            </p>
          )}
          {detail.fraudSplit ? (
            <>
              {/*
                🔴 B2 — §47의3①1호는 「가목 + 나목을 **합한** 금액」이다. 혼합이면 단일 세율이
                없으므로 실효세율을 정수 %로 적으면 **산식이 금액을 재현하지 못한다**
                (양도세 G-06이 정확히 그 결함이었다). 두 목으로 분해해 적는다.
              */}
              <div className="flex justify-between">
                <span className="text-rose-600">
                  가목 — 부정행위분 {formatKRW(detail.fraudSplit.fraudBase)} ×{" "}
                  {Math.round(detail.fraudSplit.fraudRate * 100)}%
                  <span className="block text-caption text-rose-500">
                    국세기본법 §47의3①1호 가목
                  </span>
                </span>
                <span className="font-mono tabular-nums text-rose-900">
                  {formatKRW(Math.floor(detail.fraudSplit.fraudBase * detail.fraudSplit.fraudRate))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-rose-600">
                  나목 — 그 밖의 과소신고분 {formatKRW(detail.fraudSplit.normalBase)} ×{" "}
                  {Math.round(detail.fraudSplit.normalRate * 100)}%
                  <span className="block text-caption text-rose-500">
                    국세기본법 §47의3①1호 나목
                  </span>
                </span>
                <span className="font-mono tabular-nums text-rose-900">
                  {formatKRW(
                    Math.floor(detail.fraudSplit.normalBase * detail.fraudSplit.normalRate),
                  )}
                </span>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <span className="text-rose-600">
                기준금액 {formatKRW(detail.penaltyBase)} × {Math.round(detail.penaltyRate * 100)}%
                <span className="block text-caption text-rose-500">{detail.ruleRef}</span>
              </span>
              <span className="font-mono tabular-nums text-rose-900">
                {formatKRW(detail.grossPenalty)}
              </span>
            </div>
          )}
          {detail.reductionRate > 0 && (
            <div className="flex justify-between">
              <span className="text-emerald-600">
                기한후신고 감면 ({Math.round(detail.reductionRate * 100)}%)
                <span className="block text-caption text-emerald-500">국세기본법 §48②2호</span>
              </span>
              <span className="font-mono tabular-nums text-emerald-700">
                − {formatKRW(detail.reductionAmount)}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-rose-200 pt-1 font-semibold">
            <span className="text-rose-800">가산세 합계</span>
            <span className="font-mono tabular-nums text-rose-900">
              {formatKRW(detail.filingPenalty)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
