"use client";

/**
 * 이력 화면 → **다건 합산** 선택 모달 (양도소득세).
 *
 * 계획서: `docs/00-pm/transfer-history-multi-aggregate-entry.plan.md`
 *
 * 버튼을 누른 이력(base)을 **기준**으로, 같은 양도인(의뢰인)·같은 과세연도의 **단건** 양도세
 * 이력을 체크박스로 함께 골라 다건 세션으로 편입한다. 선택·진입 로직은 전부
 * `lib/calc/transfer-aggregate-entry.ts`에 있다.
 *
 * 화면은 세목 중립 껍데기(`HistoryAggregateSelectShell`)가 든다 — 주식 합산이 같은 화면을
 * 쓰기 때문이다(계획서 `stock-history-aggregate-filing.plan.md` V-3). 이 파일은 **부동산
 * 어댑터**이고, 문구·동작은 추출 전과 한 글자도 다르지 않다.
 *
 * 카드(`HistoryClient`)와 드로어(`HistoryDetailDrawer`) 양쪽에서 같은 컴포넌트를 쓴다.
 */

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  HistoryAggregateSelectShell,
  type HistoryAggregateAdapter,
} from "@/components/calc/shared/HistoryAggregateSelectShell";
import type { CalculationRecord } from "@/lib/storage/types";
import {
  selectAggregateCandidates,
  enterMultiAggregate,
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

  const adapter: HistoryAggregateAdapter = useMemo(
    () => ({
      taxType: "transfer",
      titlePrefix: "📊 다건 합산",
      description:
        "같은 과세연도에 양도한 다른 신고서를 함께 선택하면 연간 합산(확정신고)으로 다시 계산합니다. 양도차손 통산·기본공제 연 1회·비교과세가 자동 적용됩니다.",
      footnote: (
        <>
          ⓘ 불러온 결정세액은 기납부세액 <b>참고 추정값</b>으로 채워집니다. 확정 basis와 예정신고
          산출세액은 다를 수 있으니 <b>실제 예정신고 납부액으로 확인</b>하세요.
        </>
      ),
      emptyMessage: "같은 과세연도에 합산할 다른 양도세 이력이 없습니다.",
      selectCandidates: selectAggregateCandidates,
      enter: (records) => enterMultiAggregate(records, router),
      itemLabel: transferDateLabel,
      itemAmount: determinedTaxOf,
      // 다건 세션에 **사용자 실입력**이 남아 있을 때만 폐기 확인을 받는다.
      // 직전 단건 계산의 자동 백업은 지워도 잃을 것이 없다(원본은 이력에 있다).
      hasPendingWork: () => {
        const { properties } = useMultiTransferStore.getState().form;
        return multiStoreHasUserWork(properties, readAutoBackupPropertyId());
      },
      discardTitle: "입력 중인 다건 작업이 있습니다",
      discardDescription: (n) =>
        `선택한 이력 ${n}건으로 교체하면 현재 입력 중인 자산이 사라집니다.`,
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
