"use client";

/**
 * 다건 양도세 "이력에서 불러오기" 모달 (Phase 2).
 *
 * transfer 이력(활성 clientId) → classifyLoadableTransfer(single·multi)만 노출.
 *   - 단건 클릭 → onSelectSingle (자산 1건 append)
 *   - 다건 클릭 → onSelectMulti (세션 전체 replace)
 * 동일 과세연도만 활성(taxYear 불일치 비활성+사유). 이미 로드한 record는 배지.
 * 자동채움 기납부세액은 참고 추정 — 하단 안내.
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { calculationRepository } from "@/lib/storage/calculation-repository";
import type { CalculationRecord } from "@/lib/storage/types";
import { classifyLoadableTransfer } from "@/lib/calc/transfer-multi-load-entry";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 현재 세션 과세연도 — 불일치 record 비활성 */
  taxYear: number;
  activeClientId: string | null;
  /** 이미 세션에 로드된 원본 record id (중복 경고) */
  existingSourceIds: Set<string>;
  onSelectSingle: (record: CalculationRecord) => void;
  onSelectMulti: (record: CalculationRecord) => void;
}

/** record의 과세연도 도출 — multi=inputData.taxYear, single=transferDate 연도 */
function recordTaxYear(record: CalculationRecord, kind: "single" | "multi"): number | null {
  const input = record.inputData as { taxYear?: number; transferDate?: string } | null;
  if (!input) return null;
  if (kind === "multi") return input.taxYear ?? null;
  return input.transferDate ? new Date(input.transferDate).getFullYear() : null;
}

function determinedTaxOf(record: CalculationRecord, kind: "single" | "multi"): number {
  const rd = record.resultData as { determinedTax?: number; result?: { determinedTax?: number } } | null;
  if (!rd) return 0;
  return kind === "single" ? rd.result?.determinedTax ?? 0 : rd.determinedTax ?? 0;
}

export function MultiTransferHistoryLoadModal({
  open,
  onOpenChange,
  taxYear,
  activeClientId,
  existingSourceIds,
  onSelectSingle,
  onSelectMulti,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<CalculationRecord[]>([]);

  // 오픈 시점에만 fetch — setState는 Promise 콜백·cleanup에만 (set-state-in-effect 회피)
  useEffect(() => {
    if (!open) {
      return () => {
        setLoading(true);
      };
    }
    let alive = true;
    calculationRepository
      .list({ taxType: "transfer", clientId: activeClientId })
      .then((all) => {
        if (!alive) return;
        setRecords(all.filter((r) => classifyLoadableTransfer(r) !== null));
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setRecords([]);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, activeClientId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>📂 이력에서 불러오기</DialogTitle>
          <DialogDescription className="text-xs">
            같은 과세연도({taxYear}년)의 양도세 계산 이력을 불러와 합산합니다. 단건은 자산으로 추가,
            다건은 현재 입력을 대체합니다.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</p>
        ) : records.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            불러올 수 있는 양도세 이력이 없습니다.
          </p>
        ) : (
          <div className="space-y-2">
            {records.map((r) => {
              const kind = classifyLoadableTransfer(r)!;
              const ry = recordTaxYear(r, kind);
              const yearMismatch = ry !== null && ry !== taxYear;
              const already = existingSourceIds.has(r.id);
              const disabled = yearMismatch;
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={disabled}
                  data-testid={`load-record-${r.id}`}
                  onClick={() => {
                    if (disabled) return;
                    onOpenChange(false);
                    if (kind === "single") onSelectSingle(r);
                    else onSelectMulti(r);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors enabled:hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={kind === "multi" ? "default" : "outline"} className="text-xs">
                        {kind === "multi" ? "다건" : "단건"}
                      </Badge>
                      <span className="truncate font-medium">{r.title}</span>
                      {already && (
                        <Badge variant="secondary" className="text-micro">불러옴</Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>결정세액 {formatKRW(determinedTaxOf(r, kind))}</span>
                      {yearMismatch && (
                        <span className="text-rose-600">· {ry}년 (과세연도 불일치)</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <p className="border-t pt-3 text-xs text-muted-foreground">
          ⓘ 불러온 결정세액은 기납부세액 <b>참고 추정값</b>으로 채워집니다. 확정 basis와 예정신고
          산출세액은 다를 수 있으니 <b>실제 예정신고 납부액으로 확인</b>하세요.
        </p>
      </DialogContent>
    </Dialog>
  );
}
