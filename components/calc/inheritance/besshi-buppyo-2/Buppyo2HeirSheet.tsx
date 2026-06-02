"use client";

/**
 * Buppyo2HeirSheet — 부표 2 단일 상속인 2페이지 분리 (이미지 정합).
 *   - 1쪽: 가. 상속현황(①~⑧) + 나. 상속재산명세 "별첨" 스텁 + 계(⑰~㉘)
 *   - 2쪽: 「상속인별 상속재산명세」 독립 제목 + 실제 명세(⑨~⑯) + 계 행(⑮합계)
 * 나 섹션만 HorizontalScrollContainer(가로 스크롤, 277mm). 인쇄 시 1쪽 뒤 page break.
 */

import type { Buppyo2HeirData } from "@/lib/calc/besshi-buppyo-2-data";
import { HorizontalScrollContainer } from "@/components/calc/shared/HorizontalScrollContainer";
import { Buppyo2GaSection } from "./Buppyo2GaSection";
import { Buppyo2NaTable, Buppyo2NaPage1 } from "./Buppyo2NaTable";
import { Buppyo2KyeSection } from "./Buppyo2KyeSection";
import {
  BP2_NA_SECTION_TITLE,
  BP2_FORM_TITLE,
  BP2_FORM_SUBTITLE,
  splitBuppyo2NaRows,
} from "./besshi-buppyo-2-constants";

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
const SCROLL_HINT = "← → 좌우 스크롤 또는 thumb 드래그로 모든 컬럼 보기";

export function Buppyo2HeirSheet({
  heirData,
  idx,
}: {
  heirData: Buppyo2HeirData;
  idx: number;
}) {
  const num = CIRCLED[idx] ?? `${idx + 1}`;
  const a = heirData.sectionA;
  const who = a.name || a.relation;
  const { page1Rows, page2Rows, needsContinuation, needsPage2 } =
    splitBuppyo2NaRows(heirData.itemRows);

  return (
    <div data-testid={`buppyo2-sheet-${idx}`} className="mb-6">
      {/* ── 1쪽: 가 · 나(데이터/별지계속) · 계 ── */}
      <div
        data-testid={`buppyo2-sheet-${idx}-page1`}
        className={`border border-black p-3 print:break-inside-avoid${
          needsPage2 ? " print:break-after-page" : ""
        }`}
      >
        <header className="mb-3">
          <p className="text-[10px] text-slate-500">{BP2_FORM_SUBTITLE}</p>
          <p className="text-center text-lg font-bold tracking-wide text-slate-900 dark:text-slate-50">
            {BP2_FORM_TITLE}
          </p>
        </header>

        <Buppyo2GaSection data={a} idx={idx} />

        <div className="mt-3" data-testid={`buppyo2-heir-${idx}-na`}>
          <p className="mb-1 text-[11px] font-semibold">나. 상속인별 상속재산명세</p>
          <HorizontalScrollContainer hint={SCROLL_HINT} contentPadding="p-0">
            <Buppyo2NaPage1
              rows={page1Rows}
              idx={idx}
              needsContinuation={needsContinuation}
            />
          </HorizontalScrollContainer>
        </div>

        <div className="mt-3" data-testid={`buppyo2-heir-${idx}-kye`}>
          <Buppyo2KyeSection total={heirData.sectionTotal} idx={idx} />
        </div>
      </div>

      {/* ── 2쪽: 「상속인별 상속재산명세」 — 오버플로분(중복 없음) + 계. N>5일 때만 ── */}
      {needsPage2 && (
        <div
          data-testid={`buppyo2-sheet-${idx}-page2`}
          className="mt-4 border border-black p-3 print:break-inside-avoid"
        >
          <p
            data-testid={`buppyo2-na-section-title-${idx}`}
            className="mb-2 text-center text-base font-bold"
          >
            {BP2_NA_SECTION_TITLE}
          </p>
          <p className="mb-1 text-[11px] text-gray-600">
            상속인 {num} {who} (1쪽에서 계속)
          </p>
          <HorizontalScrollContainer hint={SCROLL_HINT} contentPadding="p-0">
            <Buppyo2NaTable
              rows={page2Rows}
              idx={idx}
              total={heirData.itemRowsTotal}
            />
          </HorizontalScrollContainer>
        </div>
      )}
    </div>
  );
}
