"use client";

import { useState } from "react";
import Link from "next/link";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import { MultiTransferTaxResultView } from "@/components/calc/results/MultiTransferTaxResultView";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";

function formatKRW(amount: number): string {
  return amount.toLocaleString() + "원";
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

function Row({
  label,
  value,
  sub = false,
  highlight = false,
}: {
  label: string;
  value: string;
  sub?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-center justify-between px-4 py-2.5",
        highlight ? "bg-muted/50 font-semibold" : "",
        sub ? "pl-7 text-muted-foreground" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={sub ? "text-xs" : ""}>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

interface ResultDetailClientProps {
  id: string;
  taxType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any;
  inputData: Record<string, unknown>;
}

export function ResultDetailClient({ id, taxType, result, inputData }: ResultDetailClientProps) {
  const [showSteps, setShowSteps] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  async function handlePdfDownload() {
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/pdf/result/${id}`);
      if (!res.ok) throw new Error("PDF 생성 실패");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `세금계산결과_${taxType}_${id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("PDF 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPdfLoading(false);
    }
  }

  if (taxType === "transfer_multi") {
    const multiResult = result as AggregateTransferResult;
    const taxYear = (inputData?.taxYear as number) ?? new Date().getFullYear();
    const properties = (inputData?.properties as Array<{ propertyId: string; propertyLabel: string }>) ?? [];
    const propertyItems = properties.map((p) => ({
      propertyId: p.propertyId,
      propertyLabel: p.propertyLabel,
      form: {} as Parameters<typeof MultiTransferTaxResultView>[0]["properties"][number]["form"],
      completionPercent: 100,
    }));
    return (
      <div className="space-y-5">
        <div className="flex justify-end gap-2 print:hidden">
          <button
            type="button"
            onClick={handlePdfDownload}
            disabled={pdfLoading}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pdfLoading ? "생성 중..." : "PDF 저장"}
          </button>
        </div>
        <MultiTransferTaxResultView
          result={multiResult}
          properties={propertyItems}
          taxYear={taxYear}
          isLoggedIn
          savedId={id}
        />
        <DisclaimerBanner />
      </div>
    );
  }

  if (taxType !== "transfer") {
    return (
      <div className="rounded-lg border border-border bg-muted/30 px-6 py-8 text-center text-sm text-muted-foreground">
        이 세금 유형의 상세 결과 뷰는 준비 중입니다.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 액션 버튼 */}
      <div className="flex justify-end gap-2 print:hidden">
        <button
          type="button"
          onClick={handlePdfDownload}
          disabled={pdfLoading}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pdfLoading ? "생성 중..." : "PDF 저장"}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          🖨️ 인쇄
        </button>
      </div>

      {/* 핵심 결과 카드 */}
      {result.isExempt ? (
        <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 p-6 text-center">
          <div className="text-4xl mb-2">🎉</div>
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
            {result.exemptReason ?? "비과세"}
          </p>
          <p className="text-2xl font-bold mt-1">납부세액 0원</p>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-primary bg-primary/5 p-5">
          <p className="text-sm font-medium text-muted-foreground mb-1">총 납부세액</p>
          <p className="text-3xl font-bold">{formatKRW(result.totalTax)}</p>
          <div className="mt-3 flex gap-4 text-sm text-muted-foreground">
            <span>결정세액 {formatKRW(result.determinedTax)}</span>
            <span>+</span>
            <span>지방소득세 {formatKRW(result.localIncomeTax)}</span>
          </div>
        </div>
      )}

      {/* 상세 내역 */}
      {!result.isExempt && (
        <div className="rounded-lg border border-border divide-y divide-border text-sm">
          <Row label="양도차익" value={formatKRW(result.transferGain)} />
          {result.taxableGain !== result.transferGain && (
            <Row label="과세 양도차익 (12억 초과분)" value={formatKRW(result.taxableGain)} sub />
          )}
          <Row
            label={`장기보유특별공제 (${formatRate(result.longTermHoldingRate)})`}
            value={
              result.longTermHoldingDeduction > 0
                ? `- ${formatKRW(result.longTermHoldingDeduction)}`
                : "해당없음"
            }
          />
          <Row
            label="기본공제"
            value={result.basicDeduction > 0 ? `- ${formatKRW(result.basicDeduction)}` : "0원"}
          />
          <Row label="과세표준" value={formatKRW(result.taxBase)} highlight />
          <Row
            label={`산출세액 (${formatRate(result.appliedRate)}${result.surchargeRate ? ` + 중과 ${formatRate(result.surchargeRate)}` : ""})`}
            value={formatKRW(result.calculatedTax)}
          />
          {result.reductionAmount > 0 && (
            <Row
              label={`감면 (${result.reductionType ?? ""})`}
              value={`- ${formatKRW(result.reductionAmount)}`}
            />
          )}
          <Row label="결정세액" value={formatKRW(result.determinedTax)} highlight />
          <Row label="지방소득세 (10%)" value={formatKRW(result.localIncomeTax)} />
        </div>
      )}

      {/* 중과세 정보 */}
      {result.surchargeType && !result.isSurchargeSuspended && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-400">
            ⚠️ 중과세 적용 —{" "}
            {result.surchargeType === "multi_house_2"
              ? "2주택"
              : result.surchargeType === "multi_house_3plus"
                ? "3주택+"
                : "비사업용토지"}{" "}
            (+{formatRate(result.surchargeRate ?? 0)})
          </p>
        </div>
      )}
      {result.isSurchargeSuspended && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm">
          <p className="font-medium text-blue-800 dark:text-blue-400">
            ℹ️ 다주택 중과세 유예 기간 적용 — 일반세율로 계산됩니다.
          </p>
        </div>
      )}

      {/* 계산 과정 토글 */}
      {!result.isExempt && (
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
              {(result.steps as Array<{ label: string; formula?: string; amount: number }>).map((step, i) => (
                <div key={i} className="px-4 py-3 flex justify-between gap-4">
                  <div>
                    <p className="font-medium">{step.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{step.formula}</p>
                  </div>
                  <p className="font-mono font-medium shrink-0">{formatKRW(step.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 입력 데이터 토글 */}
      <button
        type="button"
        onClick={() => setShowInput((v) => !v)}
        className="w-full flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors print:hidden"
      >
        <span>입력 조건 보기</span>
        <span className="text-muted-foreground">{showInput ? "▲" : "▼"}</span>
      </button>

      {showInput && (
        <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs font-mono break-all">
          <pre>{JSON.stringify(inputData, null, 2)}</pre>
        </div>
      )}

      <DisclaimerBanner />

      {/* 하단 네비게이션 */}
      <div className="flex gap-3 print:hidden">
        <Link
          href="/history"
          className="flex-1 rounded-lg border border-border py-2.5 text-center text-sm font-medium hover:bg-muted/40 transition-colors"
        >
          이력 목록
        </Link>
        <Link
          href="/calc/transfer-tax"
          className="flex-1 rounded-lg bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          다시 계산하기
        </Link>
      </div>
    </div>
  );
}
