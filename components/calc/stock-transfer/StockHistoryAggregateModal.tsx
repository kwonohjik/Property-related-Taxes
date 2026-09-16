"use client";

/**
 * 이력 화면 → **주식 다종목 합산** 선택 모달.
 *
 * 계획서: `docs/00-pm/stock-history-aggregate-filing.plan.md` §4.4 (PR-3)
 *
 * 화면은 세목 중립 껍데기(`HistoryAggregateSelectShell`)를 쓰고 이 파일은 **주식 어댑터**다.
 * 선택·편입 로직은 전부 `lib/calc/stock-aggregate-entry.ts` 의 순수 함수에 있다.
 *
 * 🔒 엔진은 건드리지 않는다 — §102② 양도차손 통산과 §103① 그룹별 기본공제 연 1회는 이미
 *    합산 엔진이 한다. 이 경로는 이력을 마법사에 실어 주는 일만 한다.
 */

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  HistoryAggregateSelectShell,
  type HistoryAggregateAdapter,
} from "@/components/calc/shared/HistoryAggregateSelectShell";
import type { CalculationRecord } from "@/lib/storage/types";
import {
  selectStockAggregateCandidates,
  enterStockAggregate,
} from "@/lib/calc/stock-aggregate-entry";
import { extractStockSecurityName, extractStockTransferDate } from "@/lib/storage/title-generator";
import { useStockTransferStore } from "@/lib/stores/calc-wizard-stock-store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  base: CalculationRecord;
  clientName?: string | null;
}

/** 목록 1행 — 종목명 + 양도일. 주식은 「어느 종목인가」가 먼저다. */
function stockItemLabel(record: CalculationRecord): string {
  const input = (record.inputData ?? {}) as Record<string, unknown>;
  const name = extractStockSecurityName(input);
  const date = extractStockTransferDate(input);
  if (name && date) return `${name} (양도 ${date})`;
  return name ?? (date ? `양도 ${date}` : "종목 미상");
}

/** 단건 주식 이력의 결정세액 — 결과가 최상위에 저장된다(부동산과 래핑이 다르다) */
function stockFinalTaxOf(record: CalculationRecord): number {
  const rd = record.resultData as { finalTax?: number } | null;
  return rd?.finalTax ?? 0;
}

export function StockHistoryAggregateModal({ open, onOpenChange, base, clientName }: Props) {
  const router = useRouter();

  const adapter: HistoryAggregateAdapter = useMemo(
    () => ({
      taxType: "stock_transfer",
      titlePrefix: "📊 주식 합산신고",
      description:
        "같은 과세연도에 양도한 다른 종목을 함께 선택하면 한 신고로 합산해 다시 계산합니다. 양도차손 통산(§102②)과 기본공제 연 1회(§103①)가 자동 적용됩니다.",
      footnote: (
        <>
          ⓘ 주식등을 <b>2회 이상</b> 양도해 §103②를 적용하면 산출세액이 달라지므로{" "}
          <b>확정신고 의무</b>가 생깁니다(소득세법 시행령 §173⑤3호). 예정신고로 이미 낸 세액은
          3단계에서 <b>기납부세액</b>으로 적으면 공제됩니다(§111③).
        </>
      ),
      emptyMessage: "같은 과세연도에 합산할 다른 주식 양도세 이력이 없습니다.",
      selectCandidates: selectStockAggregateCandidates,
      enter: (records) => enterStockAggregate(records, router),
      itemLabel: stockItemLabel,
      itemAmount: stockFinalTaxOf,
      /**
       * 마법사에 **확정한 종목이 있으면** 사용자 실입력이다 — 교체하면 사라진다.
       * 편집기 한 칸만 있는 상태는 지워도 잃을 것이 없다(빈 폼이거나 이력에 원본이 있다).
       */
      hasPendingWork: () => useStockTransferStore.getState().savedItems.length > 0,
      discardTitle: "입력 중인 종목이 있습니다",
      discardDescription: (n) =>
        `선택한 이력 ${n}건으로 교체하면 현재 확정해 둔 종목이 사라집니다.`,
    }),
    [router],
  );

  return (
    <HistoryAggregateSelectShell
      open={open}
      onOpenChange={onOpenChange}
      base={base}
      clientName={clientName}
      adapter={adapter}
    />
  );
}
