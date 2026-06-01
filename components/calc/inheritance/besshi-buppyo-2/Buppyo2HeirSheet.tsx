"use client";

/**
 * Buppyo2HeirSheet — 부표 2 단일 상속인 1장 (가·나·계 3블록 + 상속인번호 헤더).
 * 나 섹션만 HorizontalScrollContainer(가로 스크롤) — 가(8칼럼)·계(2칼럼)는 일반 div.
 */

import type { Buppyo2HeirData } from "@/lib/calc/besshi-buppyo-2-data";
import { HorizontalScrollContainer } from "@/components/calc/shared/HorizontalScrollContainer";
import { Buppyo2GaSection } from "./Buppyo2GaSection";
import { Buppyo2NaTable } from "./Buppyo2NaTable";
import { Buppyo2KyeSection } from "./Buppyo2KyeSection";

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

export function Buppyo2HeirSheet({
  heirData,
  idx,
}: {
  heirData: Buppyo2HeirData;
  idx: number;
}) {
  const num = CIRCLED[idx] ?? `${idx + 1}`;
  const a = heirData.sectionA;
  return (
    <div
      data-testid={`buppyo2-sheet-${idx}`}
      className="mb-6 border border-black p-3 print:break-inside-avoid"
    >
      <p className="mb-2 text-[11px] font-semibold">
        상속인 {num} {a.name || a.relation}
      </p>

      {heirData.usedLegalShareFallback && (
        <p
          data-testid={`buppyo2-sheet-${idx}-fallback`}
          className="mb-2 rounded border border-amber-300 bg-amber-50 p-1.5 text-[10px] text-amber-700"
        >
          협의분할 미입력 자산은 명세(나) 행에서 생략되며, 계 합계에는 법정상속분 기준으로 포함됩니다.
        </p>
      )}

      <Buppyo2GaSection data={a} idx={idx} />

      <div className="mt-3" data-testid={`buppyo2-heir-${idx}-na`}>
        <p className="mb-1 text-[11px] font-semibold">나. 상속인별 상속재산명세</p>
        <HorizontalScrollContainer
          hint="← → 좌우 스크롤 또는 thumb 드래그로 모든 컬럼 보기"
          contentPadding="p-0"
        >
          <Buppyo2NaTable rows={heirData.itemRows} idx={idx} />
        </HorizontalScrollContainer>
      </div>

      <div className="mt-3" data-testid={`buppyo2-heir-${idx}-kye`}>
        <Buppyo2KyeSection total={heirData.sectionTotal} idx={idx} />
      </div>
    </div>
  );
}
