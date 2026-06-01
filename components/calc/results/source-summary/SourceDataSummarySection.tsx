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
import { expandToggleClass, expandToggleLabel } from "../shared/ExpandToggleButton";

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
      className="rounded-lg border border-sky-200 bg-white shadow-sm"
      data-testid="source-data-summary"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-t-lg bg-sky-50 px-4 py-3 text-left hover:bg-sky-100"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-sky-900">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-200 text-sky-800"
            aria-hidden
          >
            📋
          </span>
          상속개시자료 요약 (협의분할 · 추정상속 · 채무 · 사전증여)
        </span>
        <span className={expandToggleClass("sky")}>{expandToggleLabel(open)}</span>
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
