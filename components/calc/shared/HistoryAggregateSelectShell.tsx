"use client";

/**
 * 이력 합산 선택 모달 — **세목 중립 껍데기**.
 *
 * `components/calc/transfer/HistoryAggregateSelectModal.tsx`(부동산 다건)가 들고 있던 화면을
 * 그대로 추출했다. 주식 합산(PR-3)이 같은 화면을 쓰는데, 복제하면 이 파일이 담고 있는
 * **실측으로 얻은 규약들**까지 복제된다:
 *
 *  · `data-testid="history-aggregate-modal"` — E2E 가 「열려 있는가」를 판정하는 유일한 신호.
 *    항목 텍스트로 판정하면 닫히는 중인 모달의 잔상과 구분되지 않는다.
 *  · 비활성 후보를 **지우지 않고 사유를 붙인다** — 왜 못 고르는지 보여야 한다.
 *  · 기준 record 는 해제 불가.
 *  · 진행 전 폐기 확인 — `window.confirm` 금지 규약에 따라 `ConfirmDialog`.
 *
 * 세목별로 다른 것은 **props 로 주입**한다(문구·후보 선별·진입·라벨·금액·폐기 판정).
 * 판정·조립은 각 세목의 `*-aggregate-entry.ts` 순수 함수가 하고 이 파일은 화면만 든다.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import type { CalculationRecord, LocalTaxType } from "@/lib/storage/types";
import type { AggregateCandidate } from "@/lib/calc/aggregate-candidate";

export interface HistoryAggregateAdapter {
  /** 이력에서 어떤 세목을 읽어 올 것인가 */
  taxType: LocalTaxType;
  /** 모달 제목의 앞부분 (의뢰인·연도는 껍데기가 붙인다) */
  titlePrefix: string;
  description: string;
  /** 하단 안내 — 없으면 렌더하지 않는다 */
  footnote?: ReactNode;
  emptyMessage: string;
  /** 후보 선별 — 순수 함수 */
  selectCandidates: (records: CalculationRecord[], base: CalculationRecord) => AggregateCandidate[];
  /** 편입 + 이동 */
  enter: (records: CalculationRecord[]) => void;
  /** 목록 1행의 왼쪽 라벨 */
  itemLabel: (record: CalculationRecord) => string;
  /** 목록 1행의 오른쪽 금액 */
  itemAmount: (record: CalculationRecord) => number;
  /**
   * 진입하면 **사라질 사용자 실입력**이 있는가.
   * true 면 폐기 확인을 받는다. 자동 백업·빈 세션은 지워도 잃을 것이 없으므로 false.
   */
  hasPendingWork: () => boolean;
  /** 폐기 확인 다이얼로그 제목 — 세목별 문구를 **그대로** 보존한다(표시 문자열 회귀 방지) */
  discardTitle: string;
  /** 폐기 확인 다이얼로그 본문 — 선택 건수를 받는다 */
  discardDescription: (selectedCount: number) => string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 「합산」을 누른 이력 — 기준 record(항상 선택 고정) */
  base: CalculationRecord;
  /** 세무사 모드 의뢰인명 (없으면 「내 계산」) */
  clientName?: string | null;
  adapter: HistoryAggregateAdapter;
}

export function HistoryAggregateSelectShell({
  open,
  onOpenChange,
  base,
  clientName,
  adapter,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<CalculationRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([base.id]);
  const [discardOpen, setDiscardOpen] = useState(false);

  // 오픈 시점에만 fetch — setState는 Promise 콜백·cleanup에만(set-state-in-effect 회피).
  // 전 의뢰인 이력을 받아 오고 「같은 양도인」 판정은 selectCandidates 가 한다.
  useEffect(() => {
    if (!open) {
      return () => {
        setLoading(true);
        setSelectedIds([base.id]);
      };
    }
    let alive = true;
    calculationRepository
      .list({ taxType: adapter.taxType })
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
  }, [open, base, adapter.taxType]);

  const candidates: AggregateCandidate[] = useMemo(
    () => adapter.selectCandidates(records, base),
    [records, base, adapter],
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
    adapter.enter(selected.map((c) => c.record));
  }

  function handleConfirm() {
    if (adapter.hasPendingWork()) {
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
              {adapter.titlePrefix} — {clientName || "내 계산"}
              {taxYear !== null && ` · ${taxYear}년`}
            </DialogTitle>
            <DialogDescription className="text-xs">{adapter.description}</DialogDescription>
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
                        <span className="truncate font-medium">{adapter.itemLabel(c.record)}</span>
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
                      {formatKRW(adapter.itemAmount(c.record))}
                    </span>
                  </button>
                );
              })}
              {candidates.length === 1 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  {adapter.emptyMessage}
                </p>
              )}
            </div>
          )}

          {adapter.footnote && (
            <p className="border-t pt-3 text-xs text-muted-foreground">{adapter.footnote}</p>
          )}

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
        title={adapter.discardTitle}
        description={adapter.discardDescription(selected.length)}
        confirmLabel="교체하고 합산"
        destructive
        onConfirm={proceed}
      />
    </>
  );
}
