"use client";

/**
 * BesshiBuppyo2Section — 별지 제9호서식 부표 2 「상속인별 상속재산 및 평가명세서」 화면 재현.
 *
 * 출력 전용(엔진/타입/API/validate 변경 0). buildBuppyo2Data 단일 어댑터만 소비.
 * 상속인 수만큼 N장(Buppyo2HeirSheet) 렌더. 화면 토글 + PDF(별지9호 패턴 동일).
 * 렌더 가드: heirAllocationResult && heirs.length>0 (= FilingForm9CoverSection).
 *
 * Plan: docs/00-pm/inheritance-besshi-9-buppyo-2-property-valuation.plan.md
 * Design: docs/02-design/features/inheritance-besshi-9-buppyo-2-property-valuation.ui.design.md
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import type {
  Heir,
  InheritanceTaxResult,
  EstateItem,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { buildBuppyo2Data } from "@/lib/calc/besshi-buppyo-2-data";
import { ExpandToggleButton } from "@/components/calc/results/shared/ExpandToggleButton";
import { Buppyo2HeirSheet } from "./Buppyo2HeirSheet";
import { BP2_FORM_SUBTITLE } from "./besshi-buppyo-2-constants";

const Buppyo2PdfDownloadButton = dynamic(
  () =>
    import(
      "@/components/calc/inheritance/besshi-buppyo-2/Buppyo2PdfDownloadButton"
    ).then((m) => m.Buppyo2PdfDownloadButton),
  { ssr: false },
);

interface Props {
  result: InheritanceTaxResult;
  heirs?: Heir[];
  estateItems?: EstateItem[];
  priorGifts?: PriorGift[];
  /** 상속개시일 (ISO) — PDF 파일명용 */
  deathDate?: string;
}

export function BesshiBuppyo2Section({
  result,
  heirs,
  estateItems,
  priorGifts,
  deathDate,
}: Props) {
  const [open, setOpen] = useState(false);

  if (!result.heirAllocationResult || !heirs || heirs.length === 0) return null;

  const data = buildBuppyo2Data(
    result,
    heirs,
    estateItems ?? [],
    priorGifts ?? [],
  );

  // 상속인이 0명(전원 수유자·영리법인)이면 부표2 미표시
  if (data.length === 0) return null;

  return (
    <section
      data-testid="buppyo2-root"
      aria-labelledby="buppyo2-title"
      className="rounded-2xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950/40 print:border-black print:bg-white"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h3
          id="buppyo2-title"
          className="text-sm font-medium text-slate-900 dark:text-slate-100"
        >
          {BP2_FORM_SUBTITLE}
        </h3>
        <div className="flex items-center gap-2">
          <Buppyo2PdfDownloadButton data={data} deathDate={deathDate} />
          <span data-testid="buppyo2-toggle">
            <ExpandToggleButton
              open={open}
              onClick={() => setOpen((v) => !v)}
              tone="slate"
            />
          </span>
        </div>
      </div>

      <div className={open ? "block px-4 pb-4" : "hidden px-4 pb-4 print:block"}>
        <div className="print:bg-white print:text-black">
          {data.map((d, idx) => (
            <Buppyo2HeirSheet key={d.heirId} heirData={d} idx={idx} />
          ))}

          <p className="mt-2 text-[10px] text-slate-500">
            ※ 주민등록번호·주소·단가 등 미수집 칸과 비과세·과세가액불산입 세부 항목은
            자동 산출되지 않습니다 — 인쇄 후 수기 작성.
          </p>
        </div>
      </div>
    </section>
  );
}
