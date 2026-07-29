import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import {
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";
import type { AmendmentDetail } from "@/lib/tax-engine/types/transfer-amendment.types";

/** 금액 행 — 라벨 좌 / 금액 우측정렬 고정폭(amount-column-align 정책). */
function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${
        muted ? "text-xs text-muted-foreground" : "text-sm"
      }`}
    >
      <span className={bold ? "font-semibold" : ""}>{label}</span>
      <span className={`font-mono tabular-nums whitespace-nowrap ${bold ? "font-bold" : ""}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * 수정신고(경정) 결과 카드 — result.amendmentDetail 존재 시 총 납부세액 hero를 교체.
 * 당초/수정 결정세액 비교 + 추가납부 본세 + 선택적 가산세 + 수정신고 총 납부세액.
 */
export function AmendmentResultCard({
  detail,
  fullTotalTax,
}: {
  detail: AmendmentDetail;
  fullTotalTax: number;
}) {
  const [open, setOpen] = useState(false);

  // ── 경정청구(세액 감소·환급) 분기 — hero=환급세액, emerald ──
  if (detail.correctionKind === "refund_claim") {
    const refund = detail.refundTax ?? 0;
    const noRefund = refund === 0;
    return (
      <div
        data-testid="amendment-result"
        className="rounded-xl border-2 border-emerald-400 bg-emerald-50/40 p-5 dark:border-emerald-700 dark:bg-emerald-950/20"
      >
        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300 mb-1">
          환급 청구세액
        </p>
        <p className="text-3xl font-bold">{formatKRW(refund)}</p>
        {noRefund && (
          <p className="mt-1 text-xs text-muted-foreground">
            환급액 없음 — 경정 결정세액이 당초 결정세액 이상입니다 (경정청구 실익 없음).
          </p>
        )}

        <div className="mt-4 space-y-1">
          <Row label="당초 결정세액" value={formatKRW(detail.originalDeterminedTax)} />
          <Row label="경정 결정세액" value={formatKRW(detail.amendedDeterminedTax)} />
          <div className="border-t border-emerald-300 pt-1 dark:border-emerald-800">
            <Row label="환급세액" value={formatKRW(refund)} bold />
          </div>
        </div>

        {detail.claimDeadline && (
          <div className="mt-2">
            <Row
              label={`청구기한 (${detail.claimReasonType === "posterior" ? "후발적 3개월" : "일반 5년"})`}
              value={detail.isDeadlineExceeded ? `${detail.claimDeadline} · 경과 ⚠️` : detail.claimDeadline}
            />
          </div>
        )}

        <div className="mt-2 space-y-0.5">
          <Row
            label="참고 · 지방소득세 환급 (지자체 별도 경정청구)"
            value={formatKRW(detail.refundLocalIncomeTax ?? 0)}
            muted
          />
          <Row label="참고 · 경정 후 전체 세액" value={formatKRW(fullTotalTax)} muted />
        </div>

        <p className="mt-2 text-caption leading-relaxed text-muted-foreground">
          ⓘ 환급금에는 국세환급가산금(납부일 다음날~지급결정일, 연 3.1%)이 가산되며 세무서가 산정·지급합니다.
        </p>

        {detail.steps.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setOpen((p) => !p)}
              aria-expanded={open}
              className={expandToggleClass("emerald")}
            >
              {expandToggleLabel(open)} · 산출근거
            </button>
            <div className={open ? "mt-2 space-y-1.5" : "mt-2 space-y-1.5 hidden print:block"}>
              {detail.steps.map((s, i) => (
                <div key={i}>
                  <Row label={s.label} value={formatKRW(s.amount)} />
                  {s.formula && (
                    <p className="pl-2 text-caption text-muted-foreground">{s.formula}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="amendment-result"
      className="rounded-xl border-2 border-amber-400 bg-amber-50/40 p-5 dark:border-amber-700 dark:bg-amber-950/20"
    >
      <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
        수정신고 추가 납부세액
      </p>
      <p className="text-3xl font-bold">{formatKRW(detail.totalPayable)}</p>

      <div className="mt-4 space-y-1">
        <Row label="당초 결정세액" value={formatKRW(detail.originalDeterminedTax)} />
        <Row label="수정 결정세액" value={formatKRW(detail.amendedDeterminedTax)} />
        <Row label="추가 납부 본세" value={formatKRW(detail.additionalTax)} bold />
        {detail.underReportingPenalty > 0 && (
          <Row
            label={`신고불성실가산세${
              detail.underReportingReductionRate > 0
                ? ` (§48② ${(detail.underReportingReductionRate * 100).toFixed(0)}% 감면)`
                : ""
            }`}
            value={formatKRW(detail.underReportingPenalty)}
          />
        )}
        {detail.latePaymentPenalty > 0 && (
          <Row label="납부지연가산세" value={formatKRW(detail.latePaymentPenalty)} />
        )}
        <div className="border-t border-amber-300 pt-1 dark:border-amber-800">
          <Row label="수정신고 총 납부세액" value={formatKRW(detail.totalPayable)} bold />
        </div>
      </div>

      <div className="mt-2 space-y-0.5">
        <Row
          label="참고 · 추가 지방소득세 (지자체 별도 신고)"
          value={formatKRW(detail.additionalLocalIncomeTax)}
          muted
        />
        <Row label="참고 · 수정 후 전체 세액" value={formatKRW(fullTotalTax)} muted />
      </div>

      {detail.steps.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen((p) => !p)}
            aria-expanded={open}
            className={expandToggleClass("amber")}
          >
            {expandToggleLabel(open)} · 산출근거
          </button>
          <div className={open ? "mt-2 space-y-1.5" : "mt-2 space-y-1.5 hidden print:block"}>
            {detail.steps.map((s, i) => (
              <div key={i}>
                <Row label={s.label} value={formatKRW(s.amount)} />
                {s.formula && (
                  <p className="pl-2 text-caption text-muted-foreground">{s.formula}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
