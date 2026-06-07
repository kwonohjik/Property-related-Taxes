"use client";

/**
 * DeductionBesshiFormsSection — 부표3·별지5호·별지1호 3종 오케스트레이터.
 * 어댑터 호출 → open 토글 + PDF 버튼 + 서식별 렌더 가드(b5·b1 null 시 숨김).
 *
 * 계획: docs/00-pm/inheritance-deduction-besshi-forms.plan.md
 */

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type {
  DebtItem,
  EstateItem,
  Heir,
  InheritanceTaxResult,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FamilyBusinessInheritanceInput } from "@/lib/tax-engine/types/inheritance-family-business.types";
import {
  buildBuppyo3Data,
  buildBesshi5Data,
  buildBesshi1Data,
} from "@/lib/calc/deduction-besshi-data";
import { buildBesshi6_2Data } from "@/lib/calc/cohabit-besshi-data";
import { ExpandToggleButton } from "@/components/calc/results/shared/ExpandToggleButton";
import { Buppyo3FormTable } from "./Buppyo3FormTable";
import { Besshi5FormTable } from "./Besshi5FormTable";
import { Besshi1FormTable } from "./Besshi1FormTable";
import { Besshi6_2FormTable } from "./Besshi6_2FormTable";

const DeductionBesshiPdfButtons = dynamic(
  () => import("./DeductionBesshiPdfButtons").then((m) => m.DeductionBesshiPdfButtons),
  { ssr: false },
);

interface Props {
  result: InheritanceTaxResult;
  heirs?: Heir[];
  debtItems?: DebtItem[];
  estateItems?: EstateItem[];
  familyBusinessInput?: FamilyBusinessInheritanceInput;
  deathDate?: string;
  decedentName?: string;
  decedentResidentNumber?: string;
}

export function DeductionBesshiFormsSection({
  result,
  heirs,
  debtItems,
  estateItems,
  familyBusinessInput,
  deathDate,
  decedentName,
  decedentResidentNumber,
}: Props) {
  const [open, setOpen] = useState(false);

  const bp3 = useMemo(() => buildBuppyo3Data(result, debtItems), [result, debtItems]);
  const b5 = useMemo(
    () => buildBesshi5Data(result, estateItems, debtItems, heirs, decedentName, decedentResidentNumber),
    [result, estateItems, debtItems, heirs, decedentName, decedentResidentNumber],
  );
  const b1 = useMemo(
    () =>
      buildBesshi1Data(
        result,
        estateItems,
        familyBusinessInput,
        heirs,
        decedentName,
        decedentResidentNumber,
      ),
    [result, estateItems, familyBusinessInput, heirs, decedentName, decedentResidentNumber],
  );
  const b6_2 = useMemo(
    () => buildBesshi6_2Data(result, heirs, decedentName, decedentResidentNumber, deathDate),
    [result, heirs, decedentName, decedentResidentNumber, deathDate],
  );

  if (!result.deductionDetail) return null;

  return (
    <section
      data-testid="besshi-forms-root"
      className="rounded-2xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950/40 print:border-black print:bg-white"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
          채무·공과금·장례비·상속공제 명세 (부표3·별지5호·별지1호·별지6호의2)
        </h3>
        <div className="flex items-center gap-2">
          <DeductionBesshiPdfButtons bp3={bp3} b5={b5} b1={b1} deathDate={deathDate} />
          <ExpandToggleButton open={open} onClick={() => setOpen((v) => !v)} tone="slate" />
        </div>
      </div>

      <div className={open ? "block space-y-4 px-4 pb-4" : "hidden space-y-4 px-4 pb-4 print:block"}>
        <Buppyo3FormTable data={bp3} />
        {b5 ? <Besshi5FormTable data={b5} /> : null}
        {b1 ? <Besshi1FormTable data={b1} /> : null}
        {b6_2 ? <Besshi6_2FormTable data={b6_2} /> : null}
      </div>
    </section>
  );
}
