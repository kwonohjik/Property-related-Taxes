/**
 * 상속개시자료 요약 — 4표 오케스트레이터 (Table A·B·C·D 묶음).
 *
 * 결과뷰 최상단에 mount. 기본 접힘 (UX 부담 최소화).
 */
"use client";

import { useState } from "react";
import type {
  EstateItem,
  DebtItem,
  Heir,
  PresumedInheritanceItem,
  PresumedInheritanceItemResult,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-prior-gift.types";
import { EstateAllocationTable } from "./EstateAllocationTable";
import { PresumedInheritanceTable } from "./PresumedInheritanceTable";
import { DebtAllocationTable } from "./DebtAllocationTable";
import { PriorGiftSummaryTable } from "./PriorGiftSummaryTable";

interface Props {
  deathDate?: string;
  heirs: Heir[];
  estateItems?: EstateItem[];
  presumedItems?: PresumedInheritanceItem[];
  presumedResultItems?: PresumedInheritanceItemResult[];
  presumedTotal?: number;
  debtItems?: DebtItem[];
  priorGifts?: PriorGift[];
}

export function SourceDataSummarySection({
  deathDate,
  heirs,
  estateItems,
  presumedItems,
  presumedResultItems,
  presumedTotal,
  debtItems,
  priorGifts,
}: Props) {
  const [open, setOpen] = useState(false);

  const hasAny =
    (estateItems && estateItems.length > 0) ||
    (presumedItems && presumedItems.length > 0) ||
    (debtItems && debtItems.length > 0) ||
    (priorGifts && priorGifts.length > 0);

  if (!hasAny) return null;

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white shadow-sm"
      data-testid="source-data-summary"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-t-lg bg-slate-100 px-4 py-3 text-left hover:bg-slate-200"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-slate-800">
          상속개시자료 요약 (협의분할 · 추정상속 · 채무 · 사전증여)
        </span>
        <span className="text-xs text-slate-600">
          {open ? "▲ 접기" : "▼ 펼쳐서 표 4종 보기"}
        </span>
      </button>

      {open && (
        <div className="space-y-4 p-4">
          {estateItems && estateItems.length > 0 && heirs.length > 0 && (
            <EstateAllocationTable
              estateItems={estateItems}
              heirs={heirs}
              presumedTotal={presumedTotal}
              deathDate={deathDate}
            />
          )}

          {presumedItems && presumedItems.length > 0 && (
            <PresumedInheritanceTable
              presumedItems={presumedItems}
              resultItems={presumedResultItems}
            />
          )}

          {debtItems && debtItems.length > 0 && heirs.length > 0 && (
            <DebtAllocationTable
              debtItems={debtItems}
              heirs={heirs}
              deathDate={deathDate}
            />
          )}

          {priorGifts && priorGifts.length > 0 && (
            <PriorGiftSummaryTable priorGifts={priorGifts} />
          )}
        </div>
      )}
    </section>
  );
}
