"use client";

/**
 * 건물 기준시가 인쇄·PDF 서식 테이블 — 국세청 「기준시가의 계산」 양식 재현.
 * 3열(구분·적용지수·적용요령). 취득/양도/평가 각 1테이블(시점별 별도). 흑백 인쇄 최적화.
 * 적용지수는 엔진 결과, 적용요령은 breakdown.applyNotes echo(산식 무관 표시 전용).
 */
import type { BuildingStdPriceBreakdown } from "@/lib/tax-engine/building-standard-price";

const fmt = (n: number) => n.toLocaleString("ko-KR");
const idx2 = (n: number | undefined) => (n === undefined ? "" : (n / 100).toFixed(2));

interface Row {
  label: string;
  value: string;
  note?: string;
  /** 강조(굵게) — 신축가격기준액·조정률·기준시가 */
  bold?: boolean;
}

function buildRows(bd: BuildingStdPriceBreakdown, floorArea: number): Row[] {
  const isMech = bd.parkingLotCount !== undefined;
  if (isMech) {
    return [
      { label: "연도별 단가", value: `${fmt(bd.basePrice)}원`, bold: true },
      { label: "잔가율", value: String(bd.residualRate), note: `(내용연수 ${bd.mechDurableYears}년)` },
      { label: "주차대수", value: `${fmt(bd.parkingLotCount ?? 0)}대` },
      { label: "기준시가", value: `${fmt(bd.standardPrice)}원`, bold: true, note: "(구조·용도·위치지수·조정률 미적용)" },
    ];
  }
  const n = bd.applyNotes ?? {};
  const rows: Row[] = [
    { label: "신축가격기준액", value: `${fmt(bd.basePrice)}원/㎡`, bold: true },
    { label: "구조지수", value: idx2(bd.structureIndex), note: n.structure ? `(${n.structure})` : undefined },
    { label: "용도지수", value: idx2(bd.usageIndex), note: n.usage ? `(${n.usage})` : undefined },
    { label: "위치지수", value: idx2(bd.locationIndex), note: n.location ? `(${n.location})` : undefined },
    { label: "잔가율", value: String(bd.residualRate), note: n.residual ? `(${n.residual})` : undefined },
  ];
  if (bd.adjustmentRate !== undefined) {
    rows.push({ label: "조정률", value: bd.adjustmentRate.toFixed(2), note: "(건물 특성 적용)", bold: true });
  }
  rows.push({ label: "㎡당 가액", value: `${fmt(bd.pricePerM2 ?? 0)}원`, note: "(천원미만 절사)" });
  if (bd.acqBaseRate !== undefined) {
    rows.push({ label: "산정기준율", value: String(bd.acqBaseRate), note: "(2000.12.31 이전 취득)" });
  }
  rows.push({ label: "면적", value: `${floorArea}㎡` });
  rows.push({ label: "기준시가", value: `${fmt(bd.standardPrice)}원`, bold: true });
  return rows;
}

export function BuildingStdPricePrintTable({
  title,
  bd,
  floorArea,
}: {
  title: string;
  bd: BuildingStdPriceBreakdown;
  floorArea: number;
}) {
  const rows = buildRows(bd, floorArea);
  return (
    <section className="mb-6 break-inside-avoid">
      <h3 className="mb-2 text-[13px] font-bold text-black">○ {title}</h3>
      <table className="w-full border-collapse text-[12px] text-black">
        <thead>
          <tr className="bg-neutral-200">
            <th className="w-[28%] border border-neutral-400 px-2 py-1.5 text-center font-semibold">구 분</th>
            <th className="w-[24%] border border-neutral-400 px-2 py-1.5 text-center font-semibold">적용지수</th>
            <th className="border border-neutral-400 px-2 py-1.5 text-center font-semibold">적용요령</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="border border-neutral-400 px-2 py-1.5 text-center">{r.label}</td>
              <td
                className={`border border-neutral-400 px-2 py-1.5 text-center font-mono tabular-nums ${
                  r.bold ? "font-bold" : ""
                }`}
              >
                {r.value}
              </td>
              <td className="border border-neutral-400 px-2 py-1.5 text-left text-neutral-700">{r.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
