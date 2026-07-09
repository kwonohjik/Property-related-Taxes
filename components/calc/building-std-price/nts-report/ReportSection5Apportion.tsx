"use client";

/**
 * 계산서 Ⅴ. 주용도에 의한 부속시설 면적 안분 — 10열(구분·주용도지수·Ai·Bi·Ci~Hi).
 * 산식 머리: At=ΣAi, Bi=Ai/At, Ci=Ct×Bi … Hi=Ht×Bi.
 */
import type { AncillaryApportionment, AncillaryApportionRow } from "@/lib/tax-engine/types/building-standard-price.types";
import type { AncillaryFacilityKind } from "@/lib/tax-engine/types/building-standard-price.types";
import { AMOUNT_CELL } from "./format";

const TD = "border border-neutral-400 px-1.5 py-1 text-center text-caption text-black";
const TH = "border border-neutral-400 px-1.5 py-1 text-center text-caption font-semibold text-black bg-neutral-100";

const KINDS: { kind: AncillaryFacilityKind; label: string }[] = [
  { kind: "parking", label: "주차장(Ci)" },
  { kind: "machine", label: "기계실(Di)" },
  { kind: "boiler", label: "보일러실(Ei)" },
  { kind: "shelter", label: "대피소(Fi)" },
  { kind: "rooftop", label: "옥탑(Gi)" },
  { kind: "other", label: "기타(Hi)" },
];

const area = (n: number | undefined) => (n ? `${n}㎡` : "");

export function ReportSection5Apportion({ apportionment }: { apportionment: AncillaryApportionment }) {
  const rowCell = (row: AncillaryApportionRow, kind: AncillaryFacilityKind) => area(row.byKind[kind]);
  return (
    <section className="mb-3 break-inside-avoid">
      <h4 className="mb-1 text-xs font-bold text-black">Ⅴ. 주용도에 의한 부속시설 면적 안분</h4>
      <p className="mb-1 text-micro text-neutral-600">
        ＊ At = ΣAi, Bi = Ai ÷ At, Ci = Ct × Bi … Hi = Ht × Bi
      </p>
      <table className="w-full border-collapse text-black">
        <thead>
          <tr>
            <th className={TH}>구분</th>
            <th className={TH}>주용도지수</th>
            <th className={TH}>해당면적(Ai)</th>
            <th className={TH}>면적비율(Bi)</th>
            {KINDS.map((k) => (
              <th key={k.kind} className={TH}>
                {k.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="bg-neutral-100 font-semibold">
            <td className={TD}>계(t)</td>
            <td className={TD} />
            <td className={`${TD} ${AMOUNT_CELL}`} data-testid="nts-bsp-5-total-area">
              {area(apportionment.totalArea)}
            </td>
            <td className={TD}>1.0</td>
            {KINDS.map((k) => (
              <td key={k.kind} className={`${TD} ${AMOUNT_CELL}`}>
                {area(apportionment.totalByKind[k.kind])}
              </td>
            ))}
          </tr>
          {apportionment.rows.map((row, i) => (
            <tr key={i} data-testid={`nts-bsp-5-row${i}`}>
              <td className={TD}>{row.label ?? `부분 ${i + 1}`}</td>
              <td className={TD}>{(row.usageIndex / 100).toFixed(2)}</td>
              <td className={`${TD} ${AMOUNT_CELL}`}>{area(row.areaSum)}</td>
              <td className={TD}>{row.ratio.toFixed(2)}</td>
              {KINDS.map((k) => (
                <td key={k.kind} className={`${TD} ${AMOUNT_CELL}`}>
                  {rowCell(row, k.kind)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
