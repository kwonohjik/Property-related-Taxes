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
  /**
   * 제외 사유별 건수 — **사유를 합쳐 말하지 않는다**.
   *
   * 종전 문구는 「3년 창 밖**이거나** 계산 결과가 없어 제외됐습니다」였다. 두 사유는 처방이
   * 정반대다(전자는 합산 대상이 아예 아니고, 후자는 값이 복원되지 않은 것) — 합쳐 말하면
   * 사용자가 어느 쪽인지 알 수 없다. 실제로 그 문구 때문에 결함 제보가 3년 창 문제로 오인됐다.
   *
   * `different_client`·`future_date`는 화면에서 다루지 않는다(사용자가 의도한 격리·입력 오류라
   * 안내 가치가 낮다) — 계획서 Q-2 결정.
   */
  const [excluded, setExcluded] = useState<{ exceed3y: number; resultMissing: number }>({
    exceed3y: 0,
    resultMissing: 0,
  });
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
        setExcluded({ exceed3y: 0, resultMissing: 0 });
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
      setExcluded({
        exceed3y: warnings.filter((w) => w.reason === "exceed_3y").length,
        resultMissing: warnings.filter((w) => w.reason === "result_missing").length,
      });
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
            내에 양도한 기신고 건입니다. 선택하면 <strong>기신고분</strong> 양도가액·취득가액·
            필요경비·주식수와 누적 양도비율·기납부세액이 채워집니다. 당회차 금액은 다음 단계에서
            평소대로 입력하세요 — 합계는 계산할 때 자동으로 더해집니다.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">불러오는 중…</p>
        ) : (candidates?.length ?? 0) === 0 ? (
          <div className="space-y-2 py-6 text-sm text-slate-600">
            <p className="font-medium">합산할 수 있는 기신고 이력이 없습니다.</p>
            <p className="text-xs">
              1차 신고를 다른 프로그램으로 했거나 이 기기에 이력이 없으면 후보가 나오지 않습니다.
              그럴 때는 이 창을 닫고 <strong>「기신고분 …」 칸에 직접 입력</strong>하면 됩니다 —
              <strong>기신고분만</strong> 넣으세요(당회차분을 더하지 않습니다).
            </p>
            {excluded.exceed3y > 0 && (
              <p className="text-xs text-amber-700">
                같은 법인 이력 {excluded.exceed3y}건은 <strong>양도일이 소급 3년을 넘어</strong>{" "}
                합산 대상이 아닙니다 (영 §158②).
              </p>
            )}
            {excluded.resultMissing > 0 && (
              <p className="text-xs text-amber-700">
                같은 법인 이력 {excluded.resultMissing}건은{" "}
                <strong>계산 결과(양도가액·주식수)가 저장돼 있지 않아</strong> 합산할 수 없습니다.
                해당 이력을 다시 계산해 저장하면 후보로 뜹니다.
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
                      // 정보 배지다 — 합산에서 빼지 않는다. 뺄지는 사용자가 선택 해제로 정한다.
                      <Badge variant="outline" className="border-slate-300 text-slate-600">
                        기타자산(§94①4다)으로 신고된 건
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
            <p className="font-semibold text-emerald-800">
              선택 {selected.length}건 합계 — <strong>기신고분만</strong> (당회차 제외)
            </p>
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
            {preview.alreadyBlockShareholderIds.length > 0 && (
              <p className="mt-1 text-slate-600">
                이 중 {preview.alreadyBlockShareholderIds.length}건은 기타자산(§94①4 다목)으로
                신고된 건입니다 — 기납부세액에 <strong>그대로 합산</strong>했습니다. 빼려면 위에서
                선택을 해제하세요.
              </p>
            )}
          </div>
        )}

        <p className="text-caption text-slate-500">
          ⚠️ 여러 종목을 함께 신고한 건은 <strong>마지막 종목만</strong> 이력에 남습니다. 이 법인이
          그 대표가 아니었다면 후보로 뜨지 않으니 직접 입력하세요.
        </p>
        <p className="text-caption text-amber-700">
          ⚠️ 합산기간 중 앞선 회차는 <strong>빠짐없이</strong> 고르세요. 일부만 고르면 고르지 않은
          회차의 <strong>기납부세액(영 §168②)이 차감되지 않아</strong> 그 부분을 두 번 내게 됩니다.
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
