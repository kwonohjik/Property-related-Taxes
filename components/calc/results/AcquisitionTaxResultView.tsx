"use client";

/**
 * 취득세 계산 결과 표시 컴포넌트
 */

import { useState } from "react";
import type { AcquisitionTaxResult } from "@/lib/tax-engine/types/acquisition.types";

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

function formatRate(rate: number): string {
  return (rate * 100).toFixed(5).replace(/\.?0+$/, "") + "%";
}

interface Props {
  result: AcquisitionTaxResult;
}

// ============================================================
// 세목 행
// ============================================================

function TaxRow({
  label,
  amount,
  highlight = false,
  sub = false,
}: {
  label: string;
  amount: number;
  highlight?: boolean;
  sub?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-2 ${
        highlight
          ? "border-t-2 border-foreground font-bold text-base"
          : sub
          ? "pl-4 text-sm text-muted-foreground"
          : "text-sm"
      }`}
    >
      <span>{label}</span>
      <span className={highlight ? "text-primary" : ""}>{formatKRW(amount)}</span>
    </div>
  );
}

// ============================================================
// 메인 결과 컴포넌트
// ============================================================

export function AcquisitionTaxResultView({ result }: Props) {
  const [showSteps, setShowSteps] = useState(false);
  if (result.isExempt) {
    return (
      <div className="rounded-lg border bg-muted/50 p-4 text-center">
        <p className="text-lg font-semibold">비과세</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {result.exemptionType === "government_acquisition" && "국가·지방자치단체 취득 — 취득세 비과세 (지방세법 §9①1)"}
          {result.exemptionType === "trust_return" && "신탁 위탁자 반환 — 취득세 비과세 (지방세법 §9①2)"}
          {result.exemptionType === "cemetery" && "묘지 취득 — 취득세 비과세 (지방세법 §9①3)"}
          {result.exemptionType === "religious_nonprofit" && "종교·비영리 법인 용도 취득 — 취득세 비과세 (지방세법 §9①4)"}
          {result.exemptionType === "temporary_building" && "임시건축물 취득 — 취득세 비과세 (지방세법 §9①5)"}
          {result.exemptionType === "self_cultivated_farmland" && "자경농지 취득 — 취득세 비과세 (지방세법 §9①6)"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 과세 정보 요약 */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">과세 정보</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">과세표준</span>
            <p className="font-medium">{formatKRW(result.taxBase)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">적용세율</span>
            <p className="font-medium">
              {formatRate(result.appliedRate)}
              {result.isSurcharged && (
                <span className="ml-1 text-xs text-destructive font-normal">
                  중과
                </span>
              )}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">취득일</span>
            <p className="font-medium">{result.acquisitionDate}</p>
          </div>
          <div>
            <span className="text-muted-foreground">신고 기한</span>
            <p className="font-medium">{result.filingDeadline}</p>
          </div>
        </div>
      </div>

      {/* 세액 상세 */}
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">세액 명세</h3>

        {/* 부담부증여 분리 내역 */}
        {result.burdenedGiftBreakdown && (
          <div className="mb-3 rounded bg-muted/30 p-3 text-sm">
            <p className="mb-2 font-medium text-muted-foreground">부담부증여 분리 계산</p>
            <TaxRow
              label={`유상분 과세표준 (채무 ${formatKRW(result.burdenedGiftBreakdown.onerousTaxBase)})`}
              amount={result.burdenedGiftBreakdown.onerousTax}
              sub
            />
            <TaxRow
              label={`무상분 과세표준 (증여 ${formatKRW(result.burdenedGiftBreakdown.gratuitousTaxBase)})`}
              amount={result.burdenedGiftBreakdown.gratuitousTax}
              sub
            />
          </div>
        )}

        <TaxRow label="취득세 본세" amount={result.acquisitionTax} />
        <TaxRow label="농어촌특별세" amount={result.ruralSpecialTax} sub />
        <TaxRow label="지방교육세" amount={result.localEducationTax} sub />

        <div className="my-2 border-t" />
        <TaxRow label="납부세액 합계" amount={result.totalTax} />

        {result.reductionAmount > 0 && (
          <>
            <TaxRow
              label={`생애최초 감면 (-)`}
              amount={result.reductionAmount}
              sub
            />
            <TaxRow
              label="감면 후 최종 납부세액"
              amount={result.totalTaxAfterReduction}
              highlight
            />
          </>
        )}

        {result.reductionAmount === 0 && (
          <div className="mt-2 flex items-center justify-between border-t-2 border-foreground pt-2 font-bold">
            <span>최종 납부세액</span>
            <span className="text-primary text-lg">{formatKRW(result.totalTaxAfterReduction)}</span>
          </div>
        )}
      </div>

      {/* 중과 사유 */}
      {result.isSurcharged && result.surchargeReason && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">중과세 적용</p>
          <p className="mt-1 text-xs text-muted-foreground">{result.surchargeReason}</p>
        </div>
      )}

      {/* 경고 메시지 */}
      {result.warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950">
          <p className="mb-1 text-sm font-medium text-yellow-800 dark:text-yellow-200">
            유의사항
          </p>
          <ul className="space-y-1">
            {result.warnings.map((w, i) => (
              <li key={i} className="text-xs text-yellow-700 dark:text-yellow-300">
                • {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 계산 과정 토글 */}
      {result.steps.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowSteps((v) => !v)}
            className="w-full flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
          >
            <span>계산 과정 상세 보기</span>
            <span className="text-muted-foreground">{showSteps ? "▲" : "▼"}</span>
          </button>

          {showSteps && (
            <div className="rounded-lg border border-border divide-y divide-border text-sm">
              {result.steps.map((step, i) => (
                <div key={i} className="px-4 py-3 flex justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium">{step.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{step.formula}</p>
                    {step.legalBasis && (
                      <span className="inline-block mt-1 text-[10px] text-muted-foreground/70 border border-border/60 rounded px-1.5 py-0.5">
                        {step.legalBasis}
                      </span>
                    )}
                  </div>
                  <p className="font-mono font-medium shrink-0">
                    {step.amount < 0
                      ? `−${Math.abs(step.amount).toLocaleString("ko-KR")}원`
                      : formatKRW(step.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 법령 근거 */}
      {result.legalBasis.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">적용 법령: </span>
          {result.legalBasis.filter(Boolean).join(" / ")}
        </div>
      )}
    </div>
  );
}
