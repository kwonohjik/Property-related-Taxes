"use client";

/**
 * 과점주주 특정주식 — **기신고 이력 선택 합산** 모달 (영 §158② · §168②)
 *
 * 같은 법인 주식을 **여러 번에 걸쳐** 양도하면 영 §158②이 소급 3년 내 양도분을 합산해
 * 재계산하도록 한다. 그때 필요한 다섯 값(양도가액·취득가액·필요경비·누적 양도비율·
 * 기납부세액)을 **손으로 합산하면 서로 어긋나도 아무 게이트가 잡지 못한다.**
 * 이 모달은 그 다섯을 **한 소스에서 파생**시킨다.
 *
 * 🔴 **수동 입력 경로를 대체하지 않는다.** 1차 신고를 다른 프로그램으로 했거나 기기를 바꿔
 *    IndexedDB 가 비었으면 후보가 **0건**이다. 그런 사용자가 계산 자체를 못 하면 안 된다 —
 *    여섯 칸은 전부 직접 입력할 수 있고, 이 모달은 **채워 주는 보조**일 뿐이다.
 *
 * ⚠️ **다건 신고 이력은 «마지막 종목»만 남는다**(`StockTransferTaxCalculator.tsx:165-167`).
 *    그 사실을 문구로 알린다 — 있지도 않은 완전성을 약속하지 않는다.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { calculationRepository } from "@/lib/storage/calculation-repository";
import {
  filterPriorStockTransferCandidates,
  aggregatePriorStockTransfers,
  type PriorStockTransferCandidate,
  type BlockShareholderAggregation,
} from "@/lib/calc/stock-prior-transfer-lookup";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 이번(최종) 양도일 — 3년 창 기산점 */
  transferDate: string;
  securityName: string;
  securityCode?: string;
  activeClientId: string | null;
  /** 이미 반영된 출처 id — 재선택 시 표시 */
  selectedIds: readonly string[];
  onConfirm: (agg: BlockShareholderAggregation) => void;
}

export function BlockShareholderPriorTransferModal({
  open,
  onOpenChange,
  transferDate,
  securityName,
  securityCode,
  activeClientId,
  selectedIds,
  onConfirm,
}: Props) {
  /** `null` = **아직 안 읽음**(로딩). 빈 배열과 구분해야 「이력 없음」 문구가 깜빡이지 않는다. */
  const [candidates, setCandidates] = useState<PriorStockTransferCandidate[] | null>(null);
  const [excludedCount, setExcludedCount] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // 🔑 `setState` 를 effect 안에서 **동기적으로** 부르지 않는다(cascading render).
    //    로딩 표시는 `candidates === null` 로 파생한다.
    (async () => {
      const records = await calculationRepository.list({ taxType: "stock_transfer" });
      if (cancelled) return;
      const d = transferDate ? new Date(transferDate) : undefined;
      if (!d || Number.isNaN(d.getTime())) {
        setCandidates([]);
        setExcludedCount(0);
        return;
      }
      const { candidates: found, warnings } = filterPriorStockTransferCandidates(records, {
        transferDate: d,
        securityName,
        securityCode,
        clientId: activeClientId,
      });
      setCandidates(found);
      // 「다른 법인」은 사용자가 이해할 이유가 없다 — 같은 법인인데 제외된 것만 센다.
      setExcludedCount(warnings.filter((w) => w.reason !== "different_security").length);
      setChecked(new Set(selectedIds.filter((id) => found.some((c) => c.calculationId === id))));
    })();
    return () => {
      cancelled = true;
      setCandidates(null);
    };
  }, [open, transferDate, securityName, securityCode, activeClientId, selectedIds]);

  const toggle = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const loading = candidates === null;
  const selected = (candidates ?? []).filter((c) => checked.has(c.calculationId));
  const preview = selected.length > 0 ? aggregatePriorStockTransfers(selected) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>기신고 이력에서 합산 (영 §158②)</DialogTitle>
          <DialogDescription>
            같은 법인({securityName || "종목명 미입력"}) 주식을 이번 양도일부터 <strong>소급 3년</strong>{" "}
            내에 양도한 기신고 건입니다. 선택하면 양도가액·취득가액·필요경비·누적 양도비율·
            기납부세액이 함께 채워집니다.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">불러오는 중…</p>
        ) : (candidates?.length ?? 0) === 0 ? (
          <div className="space-y-2 py-6 text-sm text-slate-600">
            <p className="font-medium">합산할 수 있는 기신고 이력이 없습니다.</p>
            <p className="text-xs">
              1차 신고를 다른 프로그램으로 했거나 이 기기에 이력이 없으면 후보가 나오지 않습니다.
              그럴 때는 <strong>각 칸을 직접 입력</strong>하면 됩니다 — 합산값(1·2차 합계)을 넣으세요.
            </p>
            {excludedCount > 0 && (
              <p className="text-xs text-amber-700">
                같은 법인 이력 {excludedCount}건이 3년 창 밖이거나 계산 결과가 없어 제외됐습니다.
              </p>
            )}
          </div>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {(candidates ?? []).map((c) => (
              <label
                key={c.calculationId}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked.has(c.calculationId)}
                  onChange={() => toggle(c.calculationId)}
                  data-testid={`prior-transfer-${c.calculationId}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{c.transferDate}</span>
                    <span className="text-xs text-slate-500">{c.title}</span>
                    {c.wasAlreadyBlockShareholder && (
                      <Badge variant="outline" className="border-amber-300 text-amber-700">
                        이미 기타자산(§94①4다) — 기납부 합산 제외
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-caption text-slate-600 sm:grid-cols-4">
                    <span>주식수 {c.shareCount.toLocaleString()}주</span>
                    <span className="font-mono tabular-nums">양도 {formatKRW(c.transferPrice)}</span>
                    <span className="font-mono tabular-nums">취득 {formatKRW(c.acquisitionPrice)}</span>
                    <span className="font-mono tabular-nums">산출 {formatKRW(c.calculatedTax)}</span>
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}

        {preview && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-xs">
            <p className="font-semibold text-emerald-800">선택 {selected.length}건 합계</p>
            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
              <span className="font-mono tabular-nums">양도가액 {formatKRW(preview.priorTransferPrice)}</span>
              <span className="font-mono tabular-nums">취득가액 {formatKRW(preview.priorAcquisitionPrice)}</span>
              <span className="font-mono tabular-nums">필요경비 {formatKRW(preview.priorExpenses)}</span>
              <span>주식수 {preview.priorShareCount.toLocaleString()}주</span>
              <span className="font-mono tabular-nums">
                기납부(영 §168②) {formatKRW(preview.priorMajorShareholderTax)}
              </span>
              <span>최초 양도일 {preview.aggregationFirstTransferDate}</span>
            </div>
            {preview.excludedFromPriorTaxIds.length > 0 && (
              <p className="mt-1 text-amber-700">
                {preview.excludedFromPriorTaxIds.length}건은 이미 기타자산(§94①4 다목)으로 신고돼
                「대주주로서 납부한 세액」이 아니므로 기납부 합산에서 제외했습니다(영 §168②).
              </p>
            )}
          </div>
        )}

        <p className="text-caption text-slate-500">
          ⚠️ 여러 종목을 함께 신고한 건은 <strong>마지막 종목만</strong> 이력에 남습니다. 이 법인이
          그 대표가 아니었다면 후보로 뜨지 않으니 직접 입력하세요.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            disabled={selected.length === 0}
            onClick={() => {
              if (!preview) return;
              onConfirm(preview);
              onOpenChange(false);
            }}
          >
            선택 {selected.length}건 합산
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
