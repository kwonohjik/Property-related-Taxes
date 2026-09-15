"use client";

/**
 * 이력 화면 → **다건 합산** 선택 모달.
 *
 * 계획서: `docs/00-pm/transfer-history-multi-aggregate-entry.plan.md`
 *
 * 버튼을 누른 이력(base)을 **기준**으로, 같은 양도인(의뢰인)·같은 과세연도의 **단건** 양도세
 * 이력을 체크박스로 함께 골라 다건 세션으로 편입한다. 선택·진입 로직은 전부
 * `lib/calc/transfer-aggregate-entry.ts`에 있고 이 파일은 그 순수 함수의 화면이다.
 *
 * 카드(`HistoryClient`)와 드로어(`HistoryDetailDrawer`) 양쪽에서 같은 컴포넌트를 쓴다 —
 * 폐기 확인·진입까지 여기서 끝내야 두 진입점이 갈라지지 않는다.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { calculationRepository } from "@/lib/storage/calculation-repository";
import type { CalculationRecord } from "@/lib/storage/types";
import {
  selectAggregateCandidates,
  enterMultiAggregate,
  type AggregateCandidate,
} from "@/lib/calc/transfer-aggregate-entry";
import {
  useMultiTransferStore,
  multiStoreHasUserWork,
  readAutoBackupPropertyId,
} from "@/lib/stores/multi-transfer-tax-store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 「합산」을 누른 이력 — 기준 record(항상 선택 고정) */
  base: CalculationRecord;
  /** 세무사 모드 의뢰인명 (없으면 「내 계산」) */
  clientName?: string | null;
}

/** 단건 이력의 양도일 — 카드와 같은 표기(2026.10.05) */
function transferDateLabel(record: CalculationRecord): string {
  const raw = (record.inputData as { transferDate?: string } | null)?.transferDate;
  return raw ? `양도 ${raw.replace(/-/g, ".")}` : "양도일 미상";
}

/** 단건 이력의 결정세액 — `resultData.result.determinedTax` */
function determinedTaxOf(record: CalculationRecord): number {
  const rd = record.resultData as { result?: { determinedTax?: number } } | null;
  return rd?.result?.determinedTax ?? 0;
}

export function HistoryAggregateSelectModal({ open, onOpenChange, base, clientName }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<CalculationRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([base.id]);
  const [discardOpen, setDiscardOpen] = useState(false);

  // 오픈 시점에만 fetch — setState는 Promise 콜백·cleanup에만(set-state-in-effect 회피).
  // 전 의뢰인 이력을 받아 오고 「같은 양도인」 판정은 selectAggregateCandidates가 한다.
  useEffect(() => {
    if (!open) {
      return () => {
        setLoading(true);
        setSelectedIds([base.id]);
      };
    }
    let alive = true;
    calculationRepository
      .list({ taxType: "transfer" })
      .then((all) => {
        if (!alive) return;
        setRecords(all);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setRecords([base]);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, base]);

  const candidates: AggregateCandidate[] = useMemo(
    () => selectAggregateCandidates(records, base),
    [records, base],
  );

  const selected = useMemo(
    () => candidates.filter((c) => selectedIds.includes(c.record.id) && !c.disabledReason),
    [candidates, selectedIds],
  );

  const taxYear = candidates.find((c) => c.isBase)?.taxYear ?? null;

  function toggle(c: AggregateCandidate) {
    if (c.isBase || c.disabledReason) return; // 기준은 해제 불가, 비활성은 선택 불가
    setSelectedIds((prev) =>
      prev.includes(c.record.id)
        ? prev.filter((id) => id !== c.record.id)
        : [...prev, c.record.id],
    );
  }

  function proceed() {
    onOpenChange(false);
    enterMultiAggregate(
      selected.map((c) => c.record),
      router,
    );
  }

  function handleConfirm() {
    // 다건 세션에 **사용자 실입력**이 남아 있을 때만 폐기 확인을 받는다.
    // 직전 단건 계산의 자동 백업은 지워도 잃을 것이 없다(원본은 이력에 있다).
    const { properties } = useMultiTransferStore.getState().form;
    if (multiStoreHasUserWork(properties, readAutoBackupPropertyId())) {
      setDiscardOpen(true);
      return;
    }
    proceed();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* E2E가 「이 모달이 열려 있는가」를 판정하는 유일한 신호 — 항목 텍스트로 판정하면
            닫히는 중인 모달의 잔상과 구분되지 않는다(MultiTransferHistoryLoadModal의 실측 교훈). */}
        <DialogContent
          data-testid="history-aggregate-modal"
          className="max-w-2xl max-h-[85vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>
              📊 다건 합산 — {clientName || "내 계산"}
              {taxYear !== null && ` · ${taxYear}년`}
            </DialogTitle>
            <DialogDescription className="text-xs">
              같은 과세연도에 양도한 다른 신고서를 함께 선택하면 연간 합산(확정신고)으로 다시
              계산합니다. 양도차손 통산·기본공제 연 1회·비교과세가 자동 적용됩니다.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</p>
          ) : (
            <div className="space-y-2">
              {candidates.map((c) => {
                const checked = c.isBase || selectedIds.includes(c.record.id);
                const disabled = c.disabledReason !== null;
                return (
                  <button
                    key={c.record.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={checked}
                    data-testid={`aggregate-record-${c.record.id}`}
                    onClick={() => toggle(c)}
                    className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors enabled:hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span
                      aria-hidden
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-micro ${
                        checked ? "border-primary bg-primary text-primary-foreground" : "border-border"
                      }`}
                    >
                      {checked ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{transferDateLabel(c.record)}</span>
                        {c.isBase && (
                          <Badge variant="secondary" className="text-micro">
                            기준
                          </Badge>
                        )}
                      </span>
                      {c.disabledReason && (
                        <span className="mt-1 block text-xs text-rose-600">· {c.disabledReason}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-right font-mono text-sm tabular-nums">
                      {formatKRW(determinedTaxOf(c.record))}
                    </span>
                  </button>
                );
              })}
              {candidates.length === 1 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  같은 과세연도에 합산할 다른 양도세 이력이 없습니다.
                </p>
              )}
            </div>
          )}

          <p className="border-t pt-3 text-xs text-muted-foreground">
            ⓘ 불러온 결정세액은 기납부세액 <b>참고 추정값</b>으로 채워집니다. 확정 basis와 예정신고
            산출세액은 다를 수 있으니 <b>실제 예정신고 납부액으로 확인</b>하세요.
          </p>

          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted/60"
            >
              취소
            </button>
            <button
              type="button"
              disabled={selected.length < 2}
              data-testid="aggregate-confirm"
              onClick={handleConfirm}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {selected.length}건 합산하기
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="입력 중인 다건 작업이 있습니다"
        description={`선택한 이력 ${selected.length}건으로 교체하면 현재 입력 중인 자산이 사라집니다.`}
        confirmLabel="교체하고 합산"
        destructive
        onConfirm={proceed}
      />
    </>
  );
}
