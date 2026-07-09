"use client";

/**
 * 계산서 Ⅰ. 구분 — 세목별 작성구분(○)·일자. 5열 매트릭스.
 * 양도소득세(양도당시 | 취득당시[2001.1.1이후 | 2000.12.31이전]) | 상속세 | 증여세.
 */
import type { NtsMarkCell } from "@/lib/calc/nts-report-adapter";

const TD = "border border-neutral-400 px-1.5 py-1 text-center text-[11px] text-black";
const TH = "border border-neutral-400 px-1.5 py-1 text-center text-[11px] font-semibold text-black bg-neutral-100";

const mark = (cell: NtsMarkCell, active: NtsMarkCell, text?: string) =>
  cell === active ? (text ? text : "○") : "";

export function ReportSection1Category({
  markCell,
  dateLabel,
  acqNoteLabel,
}: {
  markCell: NtsMarkCell;
  dateLabel: string;
  acqNoteLabel?: string;
}) {
  return (
    <section className="mb-3">
      <h4 className="mb-1 text-xs font-bold text-black">Ⅰ. 구분</h4>
      <table className="w-full border-collapse text-black">
        <thead>
          <tr>
            <th className={TH} rowSpan={2}>
              세목별
            </th>
            <th className={TH} colSpan={3}>
              양도소득세
            </th>
            <th className={TH} rowSpan={2}>
              상속세
            </th>
            <th className={TH} rowSpan={2}>
              증여세
            </th>
          </tr>
          <tr>
            <th className={TH}>양도당시</th>
            <th className={TH}>2001.1.1이후 취득</th>
            <th className={TH}>2000.12.31이전 취득</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={TH}>작성구분</td>
            <td className={TD} data-testid="nts-bsp-1-transfer">
              {mark("transfer", markCell)}
              {acqNoteLabel ? acqNoteLabel : ""}
            </td>
            <td className={TD} data-testid="nts-bsp-1-acq2001">
              {mark("acq2001", markCell)}
            </td>
            <td className={TD} data-testid="nts-bsp-1-acq2000">
              {mark("acq2000", markCell)}
            </td>
            <td className={TD} data-testid="nts-bsp-1-inh">
              {mark("inheritance", markCell)}
            </td>
            <td className={TD} data-testid="nts-bsp-1-gift">
              {mark("gift", markCell)}
            </td>
          </tr>
          <tr>
            <td className={TH}>일 자</td>
            <td className={TD} data-testid="nts-bsp-1-transfer-date">
              {markCell === "transfer" ? dateLabel : ""}
            </td>
            <td className={TD}>{markCell === "acq2001" ? dateLabel : ""}</td>
            <td className={TD} data-testid="nts-bsp-1-acq2000-date">
              {markCell === "acq2000" ? dateLabel : ""}
            </td>
            <td className={TD}>{markCell === "inheritance" ? dateLabel : ""}</td>
            <td className={TD}>{markCell === "gift" ? dateLabel : ""}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
