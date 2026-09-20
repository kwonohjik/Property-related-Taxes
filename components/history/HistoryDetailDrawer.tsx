"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CalculationRecord, LocalTaxType } from "@/lib/storage/types";
import { EditTitleDialog } from "./EditTitleDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { buildBackup } from "@/lib/storage/backup-export";
import { downloadJson, formatIsoStamp } from "@/lib/utils/file-download";
import { enterAmendment, enterRefundClaim, classifyAmendableTransfer } from "@/lib/calc/transfer-amendment-entry";
import { canAggregateFromHistory } from "@/lib/calc/transfer-aggregate-entry";
import { canStockAggregateFromHistory } from "@/lib/calc/stock-aggregate-entry";
import { resumeCalculationRecord } from "@/lib/calc/history-resume-entry";
import { oneHouseVerdictLabel } from "@/lib/calc/one-house-judgment-verdict";
import { HistoryAggregateSelectModal } from "@/components/calc/transfer/HistoryAggregateSelectModal";
import { StockHistoryAggregateModal } from "@/components/calc/stock-transfer/StockHistoryAggregateModal";

/**
 * 🔴 **이 사본이 6/8이었다** — `stock_transfer`·`stock_valuation`이 빠져 있었다.
 *    `route && …` 가드 때문에 주식 2세목은 드로어에서 「편집」 버튼이 **아예 뜨지 않았고**,
 *    아래 `stock_valuation` 재개 분기는 `if (!route) return`에 막혀 **도달 불가**였다.
 *    `Partial<Record<string, …>>`라 `tsc`는 끝까지 침묵했다.
 *    ⇒ 정본(`lib/storage/tax-type-routes.ts`)을 import한다. 사본을 다시 만들지 말 것.
 */
import { TAX_TYPE_ROUTES } from "@/lib/storage/tax-type-routes";

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
  // 재산세(totalPayable) · 종부세(grandTotal) — 결과 객체를 최상위에 직접 저장(래핑 없음)
  if (typeof resultData?.totalPayable === "number") return resultData.totalPayable.toLocaleString();
  if (typeof resultData?.grandTotal === "number") return resultData.grandTotal.toLocaleString();
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

  /**
   * 1세대1주택 판정 — **세액이 없다**. 다른 세목 분기보다 먼저 가른다: `isExempt`가 true면
   * 위의 공통 분기가 「과세 여부: 비과세」 한 줄로 끝내 버려 주택 수·특례가 사라진다.
   */
  if (taxType === "one_house_exemption") {
    const judgment = resultData?.judgment as
      | { appliedExceptions?: unknown[]; pending?: unknown[] }
      | undefined;
    const houseCount = resultData?.houseCount as
      | { total?: number; countedForExemption?: number }
      | undefined;
    if (!judgment) return items;
    items.push({ label: "판정", value: oneHouseVerdictLabel(resultData) });
    if (typeof houseCount?.total === "number") {
      items.push({ label: "세대 보유 주택 수", value: `${houseCount.total}채` });
    }
    // 제외 후 유효 주택 수 — `total`과 같으면 제외가 없었다는 뜻이라 굳이 두 줄로 적지 않는다.
    if (
      typeof houseCount?.countedForExemption === "number" &&
      houseCount.countedForExemption !== houseCount.total
    ) {
      items.push({ label: "판정상 주택 수", value: `${houseCount.countedForExemption}채` });
    }
    const applied = judgment.appliedExceptions?.length ?? 0;
    if (applied > 0) items.push({ label: "적용 특례", value: `${applied}건` });
    const pending = judgment.pending?.length ?? 0;
    if (pending > 0) items.push({ label: "남은 조건", value: `${pending}건` });
    return items;
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
  } else if (taxType === "property") {
    // 재산세: 과세표준 / 본세(determinedTax) / 부가세 합계(totalSurtax) / 납부세액(totalPayable)
    addNum("과세표준", "taxBase");
    addNum("본세(결정세액)", "determinedTax");
    addNum("부가세 합계", "totalSurtax");
    addNum("납부세액", "totalPayable");
  } else if (taxType === "comprehensive_property") {
    // 종부세: 주택분 / 토지분 / 총 납부세액(grandTotal)
    addNum("주택분 종부세", "totalHousingTax");
    addNum("납부세액", "grandTotal");
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  /** 다건 합산 선택 모달 열림 — 이 드로어의 record가 기준이 된다 */
  const [aggregateOpen, setAggregateOpen] = useState(false);
  /** 재계산 진입이 차단된 사유 (구 stub 다건 등) */
  const [resumeBlocked, setResumeBlocked] = useState<string | null>(null);

  const route = TAX_TYPE_ROUTES[record.taxType];

  function handleResume() {
    /**
     * 🔑 분기·부수효과는 전부 **공유 진입점**이 갖는다(`history-resume-entry.ts`).
     *    이 드로어 사본에는 의뢰인 자동선택도 건물 기준시가 스냅샷 복원도 없었고,
     *    라우트 맵이 6/8이라 주식 2세목은 버튼조차 뜨지 않았다(P4-2b-3에서 해소).
     */
    setResumeBlocked(null);
    void resumeCalculationRecord(record, router).then(setResumeBlocked);
  }

  function handleAmend() {
    if (!route || record.taxType !== "transfer") return;
    enterAmendment(record, router);
  }

  // 경정청구(세액 감소·환급) 진입 — 수정신고와 방향만 다름(correctionKind)
  function handleRefundClaim() {
    if (!route || record.taxType !== "transfer") return;
    enterRefundClaim(record, router);
  }

  const summaryItems = extractResultSummaryItems(record.resultData, record.taxType);

  async function doDelete() {
    setIsDeleting(true);
    try {
      await onDelete(record.id);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleExportSingle() {
    const backup = await buildBackup(undefined, { ids: [record.id] });
    downloadJson(backup, `korean-tax-calc-backup_${formatIsoStamp()}.json`);
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

          {/* 납부세액 — 판정 메뉴는 세액이 없으므로 그 자리에 판정 결론을 띄운다 */}
          <div className="rounded-lg bg-muted/40 px-4 py-3">
            <p className="text-xs text-muted-foreground mb-0.5">
              {record.taxType === "one_house_exemption" ? "판정" : "납부세액"}
            </p>
            <p className="text-xl font-bold" data-testid="drawer-headline-value">
              {record.taxType === "one_house_exemption"
                ? oneHouseVerdictLabel(record.resultData)
                : extractTotalTax(record.resultData)}
            </p>
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
          {resumeBlocked && (
            <p
              data-testid="drawer-resume-blocked"
              className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
            >
              {resumeBlocked}
            </p>
          )}
          {(canAggregateFromHistory(record) || canStockAggregateFromHistory(record)) && (
            <button
              type="button"
              onClick={() => setAggregateOpen(true)}
              data-testid="drawer-aggregate"
              className="w-full rounded-lg border border-emerald-400 bg-emerald-50 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 transition-colors dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
            >
              {record.taxType === "stock_transfer" ? "합산신고로 재계산" : "다건 합산으로 재계산"}
            </button>
          )}
          {route &&
            classifyAmendableTransfer(record) !== null && (
              <button
                type="button"
                onClick={handleAmend}
                data-testid="drawer-amend"
                className="w-full rounded-lg border border-amber-400 bg-amber-50 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 transition-colors dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
              >
                수정신고 작성
              </button>
            )}
          {route &&
            classifyAmendableTransfer(record) !== null && (
              <button
                type="button"
                onClick={handleRefundClaim}
                data-testid="drawer-correction"
                className="w-full rounded-lg border border-sky-400 bg-sky-50 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 transition-colors dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-300"
              >
                경정청구 작성
              </button>
            )}
          <button
            type="button"
            onClick={handleExportSingle}
            data-testid="drawer-export-single"
            className="w-full rounded-lg border border-border py-2 text-sm font-medium hover:bg-muted/60 transition-colors"
          >
            이 계산 내보내기
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
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

      {/* 합산 선택 모달 — 이 드로어의 record가 기준. 세목으로 갈라 띄운다. */}
      {aggregateOpen && record.taxType === "stock_transfer" && (
        <StockHistoryAggregateModal open onOpenChange={setAggregateOpen} base={record} />
      )}
      {aggregateOpen && record.taxType !== "stock_transfer" && (
        <HistoryAggregateSelectModal
          open
          onOpenChange={setAggregateOpen}
          base={record}
        />
      )}

      {/* 삭제 확인 */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="이력 삭제"
        description="이 계산 이력을 삭제합니다. 되돌릴 수 없습니다."
        confirmLabel="삭제"
        destructive
        onConfirm={doDelete}
      />
    </>
  );
}
