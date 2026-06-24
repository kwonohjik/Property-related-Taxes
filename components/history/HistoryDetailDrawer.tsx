"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CalculationRecord, LocalTaxType } from "@/lib/storage/types";
import { EditTitleDialog } from "./EditTitleDialog";

const TAX_TYPE_ROUTES: Partial<Record<string, string>> = {
  transfer: "/calc/transfer-tax",
  acquisition: "/calc/acquisition-tax",
  inheritance: "/calc/inheritance-tax",
  gift: "/calc/gift-tax",
  property: "/calc/property-tax",
  comprehensive_property: "/calc/comprehensive-tax",
};

interface Props {
  record: CalculationRecord;
  taxTypeLabel: string;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
  onTitleUpdate: (id: string, title: string) => Promise<void>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function extractTotalTax(resultData: Record<string, unknown>): string {
  const inner = resultData?.result as Record<string, unknown> | undefined;
  if (inner) {
    if (inner.isExempt) return "비과세";
    if (typeof inner.totalTax === "number") return inner.totalTax.toLocaleString();
    if (typeof inner.finalTax === "number") return inner.finalTax.toLocaleString();
  }
  const agg = resultData?.aggregated as Record<string, unknown> | undefined;
  if (typeof agg?.totalTax === "number") return agg.totalTax.toLocaleString();
  if (resultData?.isExempt) return "비과세";
  if (typeof resultData?.totalTax === "number") return resultData.totalTax.toLocaleString();
  if (typeof resultData?.finalTax === "number") return resultData.finalTax.toLocaleString();
  return "-";
}

/** 결과 데이터에서 주요 항목을 key-value 목록으로 추출 */
export function extractResultSummaryItems(
  resultData: Record<string, unknown>,
  taxType: LocalTaxType
): { label: string; value: string }[] {
  const items: { label: string; value: string }[] = [];

  // single/mixed-use 모드: resultData.result 안에 실제 값이 있음
  const src = (resultData?.result as Record<string, unknown> | undefined) ?? resultData;

  function addNum(label: string, key: string) {
    const v = src[key];
    if (typeof v === "number") items.push({ label, value: v.toLocaleString() });
  }

  if (src.isExempt === true) {
    items.push({ label: "과세 여부", value: "비과세" });
  } else if (taxType === "gift" || taxType === "inheritance") {
    // 증여세·상속세: computedTax(산출) / taxBase(과세표준) / finalTax(결정세액)
    addNum("증여재산가액", "grossGiftValue");
    addNum("상속재산가액", "grossEstateValue");
    addNum("과세표준", "taxBase");
    addNum("산출세액", "computedTax");
    addNum("결정세액", "finalTax");
  } else {
    addNum("양도차익", "transferGain");
    addNum("장기보유특별공제", "longTermDeduction");
    addNum("양도소득 과세표준", "taxBase");
    addNum("산출세액", "calculatedTax");
    addNum("결정세액", "determinedTax");
    addNum("납부세액", "totalTax");
  }

  // bundled 모드: aggregated 안에 합산 세액
  const agg = resultData?.aggregated as Record<string, unknown> | undefined;
  if (agg && typeof agg.totalTax === "number") {
    items.push({ label: "합산 납부세액", value: agg.totalTax.toLocaleString() });
  }

  return items;
}

export function HistoryDetailDrawer({
  record,
  taxTypeLabel,
  onClose,
  onDelete,
  onTitleUpdate,
}: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const route = TAX_TYPE_ROUTES[record.taxType];

  function handleResume() {
    if (!route) return;
    // 양도세 전용: zustand store에 inputData hydrate
    if (record.taxType === "transfer") {
      // dynamic import로 store 순환 참조 방지
      import("@/lib/stores/calc-wizard-store").then(({ useCalcWizardStore }) => {
        const { updateFormData, setStep } = useCalcWizardStore.getState();
        // Date 필드는 string으로 저장되어 있으므로 그대로 복원 (zustand store는 string 허용)
        updateFormData(record.inputData as Parameters<typeof updateFormData>[0]);
        setStep(0);
        router.push(route);
      });
    } else if (record.taxType === "gift") {
      // 증여세 — GiftTaxForm은 자체 useState 기반이라 sessionStorage 경유로 hydrate
      sessionStorage.setItem("giftTaxResumeInput", JSON.stringify(record.inputData));
      router.push(route);
    } else if (record.taxType === "inheritance") {
      // 상속세 — InheritanceTaxForm은 자체 useState 기반이라 sessionStorage 경유로 hydrate
      sessionStorage.setItem("inheritanceTaxResumeInput", JSON.stringify(record.inputData));
      router.push(route);
    } else if (record.taxType === "stock_valuation") {
      // 주식 평가 도구 — 이력 inputData를 평가 store에 hydrate
      import("@/lib/stores/calc-stock-valuation-store").then(
        ({ useStockValuationStore, normalizeStockValuationFormData }) => {
          useStockValuationStore.setState({
            formData: normalizeStockValuationFormData(record.inputData),
          });
          router.push(route);
        },
      );
    } else {
      router.push(route);
    }
  }

  const summaryItems = extractResultSummaryItems(record.resultData, record.taxType);

  async function handleDelete() {
    if (!confirm("이 계산 이력을 삭제하시겠습니까?")) return;
    setIsDeleting(true);
    try {
      await onDelete(record.id);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      {/* 백드롭 */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 드로어 */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-background shadow-xl flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {taxTypeLabel}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDate(record.createdAt)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
            aria-label="닫기"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 제목 */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs text-muted-foreground">이름</p>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="text-xs text-primary hover:underline"
              >
                수정
              </button>
            </div>
            <p className="text-sm font-medium break-words">{record.title}</p>
          </div>

          {/* 납부세액 */}
          <div className="rounded-lg bg-muted/40 px-4 py-3">
            <p className="text-xs text-muted-foreground mb-0.5">납부세액</p>
            <p className="text-xl font-bold">{extractTotalTax(record.resultData)}</p>
          </div>

          {/* 주요 결과 항목 */}
          {summaryItems.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">계산 결과 요약</p>
              <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                {summaryItems.map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between px-4 py-2.5 bg-background">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="text-sm font-medium tabular-nums">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 저장 일시 */}
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>저장</span>
              <span>{formatDate(record.createdAt)}</span>
            </div>
            {record.updatedAt !== record.createdAt && (
              <div className="flex justify-between">
                <span>수정</span>
                <span>{formatDate(record.updatedAt)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>세율 기준일</span>
              <span>{record.taxLawVersion}</span>
            </div>
          </div>
        </div>

        {/* 하단 액션 */}
        <div className="border-t px-5 py-4 space-y-2">
          {route && (
            <button
              type="button"
              onClick={handleResume}
              className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              이 조건으로 재계산
            </button>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex-1 rounded-lg border border-destructive/40 py-2 text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50"
            >
              {isDeleting ? "삭제 중..." : "삭제"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-border py-2 text-sm font-medium hover:bg-muted/60 transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      </div>

      {/* 제목 수정 다이얼로그 */}
      {editOpen && (
        <EditTitleDialog
          currentTitle={record.title}
          onSave={async (newTitle) => {
            await onTitleUpdate(record.id, newTitle);
            setEditOpen(false);
          }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}
