"use client";

/**
 * 계산서 Ⅲ(주용도)·Ⅳ(부속) 공용 평가표 — 11열.
 * 층별 | ⓐ | ① | 용도 | ② | ⑥ | ⑦ | 조정률(ⓧⓨⓩ 3칸) | ⑧ | ⑨ | ⑩.
 * 산식 머리(고시): ⑧ = ⓐ×①×②×⑥×⑦×ⓧⓨⓩ(천원미만 절사), ⑩ = ⑧×⑨.
 */
import type { NtsReportRow } from "@/lib/calc/nts-report-adapter";
import { fmt, idx2, ratio, adjCell, AMOUNT_CELL } from "./format";

const TH = "border border-neutral-400 px-1.5 py-1 text-center font-semibold text-caption";
const TD = "border border-neutral-400 px-1.5 py-1 text-center text-caption";

/** 빈 행 채우기 — Ⅲ 9행·Ⅳ 7행 고정(원본 양식). */
function padRows(count: number, used: number): number[] {
  return Array.from({ length: Math.max(0, count - used) }, (_, i) => i);
}

export function ReportEvalTable({
  title,
  rows,
  totalArea,
  total,
  rowSlots,
  section,
}: {
  title: string;
  rows: NtsReportRow[];
  totalArea: number;
  total: number;
  /** 빈 행 포함 고정 행 수(Ⅲ=9, Ⅳ=7) */
  rowSlots: number;
  /** testid 접두(예 "nts-bsp-3") */
  section: string;
}) {
  return (
    <section className="mb-4 break-inside-avoid">
      <h4 className="mb-1 text-xs font-bold text-black">{title}</h4>
      <p className="mb-1 text-micro text-neutral-600">
        ＊ ⑧ = ⓐ × ① × ② × ⑥ × ⑦ × ⓧ·ⓨ·ⓩ(천원미만 절사) ⑩ = ⑧ × ⑨
      </p>
      <table className="w-full border-collapse text-black">
        <thead>
          <tr className="bg-neutral-200">
            <th className={TH}>층별</th>
            <th className={TH}>기준금액ⓐ</th>
            <th className={TH}>구조①</th>
            <th className={TH}>용도</th>
            <th className={TH}>용도②</th>
            <th className={TH}>위치⑥</th>
            <th className={TH}>잔가⑦</th>
            <th className={TH} colSpan={3}>
              조정률(번호)
            </th>
            <th className={TH}>㎡당⑧</th>
            <th className={TH}>면적⑨</th>
            <th className={TH}>기준시가⑩</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} data-testid={`${section}-row${i}`}>
              <td className={TD}>{r.floorLabel}</td>
              <td className={`${TD} ${AMOUNT_CELL}`}>{fmt(r.basePrice)}</td>
              <td className={TD}>{idx2(r.structureIndex)}</td>
              <td className={TD}>{r.usageLabel ?? ""}</td>
              <td className={TD}>{idx2(r.usageIndex)}</td>
              <td className={TD}>{idx2(r.locationIndex)}</td>
              <td className={TD}>{ratio(r.residualRate)}</td>
              <td className={TD}>{adjCell(r.adjustmentItems?.[0])}</td>
              <td className={TD}>{adjCell(r.adjustmentItems?.[1])}</td>
              <td className={TD}>{adjCell(r.adjustmentItems?.[2])}</td>
              <td className={`${TD} ${AMOUNT_CELL}`}>{fmt(r.pricePerM2)}</td>
              <td className={`${TD} ${AMOUNT_CELL}`}>{r.floorArea ? `${r.floorArea}㎡` : ""}</td>
              <td className={`${TD} ${AMOUNT_CELL}`}>{fmt(r.standardPrice)}</td>
            </tr>
          ))}
          {padRows(rowSlots, rows.length).map((i) => (
            <tr key={`pad-${i}`}>
              <td className={TD}>&nbsp;</td>
              <td className={TD} />
              <td className={TD} />
              <td className={TD} />
              <td className={TD} />
              <td className={TD} />
              <td className={TD} />
              <td className={TD}>( )</td>
              <td className={TD}>( )</td>
              <td className={TD}>( )</td>
              <td className={TD} />
              <td className={TD} />
              <td className={TD} />
            </tr>
          ))}
          <tr className="bg-neutral-100 font-bold">
            <td className={TD} colSpan={10}>
              합계
            </td>
            <td className={TD} />
            <td className={`${TD} ${AMOUNT_CELL}`} data-testid={`${section}-sum-area`}>
              {totalArea ? `${totalArea}㎡` : ""}
            </td>
            <td className={`${TD} ${AMOUNT_CELL}`} data-testid={`${section}-sum`}>
              {fmt(total)}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
