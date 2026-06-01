"use client";

/**
 * AllocationBreakdownSection — 상속세 산출세액·증여세액공제 계산 근거 섹션
 * "상속공제 상세 내역"(DeductionBreakdownSection)과 동일 펼침(▼) 방식.
 * 6개 DetailCard: *1·*2·⑥·⑦⑧⑨⑪·⑩·⑫ (이미지5~7 산식 근거).
 * 신규 계산 0 — 엔진 echo 조립만.
 */

import { useState } from "react";
import type { Heir, InheritanceTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DistributableTaxBaseDetailCard } from "./DistributableTaxBaseDetailCard";
import { SurchargeTargetDetailCard } from "./SurchargeTargetDetailCard";
import { TaxBaseShareDetailCard } from "./TaxBaseShareDetailCard";
import { ComputedTaxDetailCard } from "./ComputedTaxDetailCard";
import { CorporateGiftCreditDetailCard } from "./CorporateGiftCreditDetailCard";
import { HeirGiftCreditDetailCard } from "./HeirGiftCreditDetailCard";
import { expandToggleClass, expandToggleLabel } from "../shared/ExpandToggleButton";

interface Props {
  result: InheritanceTaxResult;
  heirs: Heir[];
}

export function AllocationBreakdownSection({ result, heirs }: Props) {
  const [show, setShow] = useState(false);

  if (!result.heirAllocationResult || heirs.length === 0) return null;

  const hasCorporate = heirs.some((h) => h.relation === "corporate");

  return (
    <div className="border rounded-xl overflow-hidden" data-testid="allocation-breakdown-section">
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium print:hidden"
        data-testid="allocation-breakdown-toggle"
      >
        <span>상속세 산출세액·증여세액공제 계산 근거</span>
        <span className={expandToggleClass("slate")}>{expandToggleLabel(show)}</span>
      </button>
      <div className={show ? "block" : "hidden print:block"}>
        <div className="hidden print:block px-4 py-2 text-sm font-medium bg-muted/30">
          상속세 산출세액·증여세액공제 계산 근거
        </div>
        <div className="divide-y divide-border text-xs">
          <DistributableTaxBaseDetailCard result={result} heirs={heirs} />
          <SurchargeTargetDetailCard result={result} heirs={heirs} />
          <TaxBaseShareDetailCard result={result} heirs={heirs} />
          <ComputedTaxDetailCard result={result} heirs={heirs} />
          {hasCorporate && <CorporateGiftCreditDetailCard result={result} heirs={heirs} />}
          <HeirGiftCreditDetailCard result={result} heirs={heirs} />
          <div className="px-4 py-2 text-[10px] text-muted-foreground">
            산출 근거:
            <LawArticleModal legalBasis="상증법 §26" label="§26" className="ml-1" />
            <LawArticleModal legalBasis="상증법 §27" label="§27" className="ml-1" />
            <LawArticleModal legalBasis="상증법 §28" label="§28" className="ml-1" />
            <LawArticleModal legalBasis="상증법 §3의2" label="§3의2②" className="ml-1" />
            ·집행기준 19-17-1
          </div>
        </div>
      </div>
    </div>
  );
}
