"use client";

/**
 * Buppyo2GaSection — 부표 2 「가. 상속인별 상속현황」 (헤더 + 데이터행 1, 8칼럼).
 * 출력 전용 — buildBuppyo2Data 의 Buppyo2SectionA 소비.
 */

import type { Buppyo2SectionA } from "@/lib/calc/besshi-buppyo-2-data";
import { BP2_GA_LABELS as G } from "./besshi-buppyo-2-constants";

const HEAD =
  "border border-black p-1 bg-gray-100 dark:bg-gray-800 text-micro font-medium text-center align-middle";
const CELL = "border border-black p-1 text-caption text-center align-middle";
const AMT =
  "border border-black p-1 text-caption text-right font-mono tabular-nums whitespace-nowrap align-middle";
const NBSP = " ";

const fmt = (n: number) => n.toLocaleString("ko-KR");
const pct = (r: number) => `${parseFloat((r * 100).toFixed(2))}%`;

export function Buppyo2GaSection({
  data,
  idx,
}: {
  data: Buppyo2SectionA;
  idx: number;
}) {
  const t = (k: string) => `buppyo2-ga-${idx}-${k}`;
  return (
    <div data-testid={`buppyo2-heir-${idx}-ga`}>
      <p className="mb-1 text-caption font-semibold">가. 상속인별 상속현황</p>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={HEAD}>{G.relation}</th>
            <th className={HEAD}>{G.name}</th>
            <th className={HEAD}>{G.rrn}</th>
            <th className={HEAD}>{G.address}</th>
            <th className={HEAD}>{G.legalRatio}</th>
            <th className={HEAD}>{G.legalValue}</th>
            <th className={HEAD}>{G.actualRatio}</th>
            <th className={HEAD}>{G.actualValue}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={CELL} data-testid={t("relation")}>
              {data.relation || NBSP}
            </td>
            <td className={CELL} data-testid={t("name")}>
              {data.name || NBSP}
            </td>
            <td className={CELL} data-testid={t("rrn")}>
              {data.residentId || NBSP}
            </td>
            <td className={CELL} data-testid={t("address")}>
              {data.address || NBSP}
            </td>
            <td className={CELL} data-testid={t("legal-ratio")}>
              {data.legalShareLabel || NBSP}
            </td>
            <td className={AMT} data-testid={t("legal-value")}>
              {data.legalShareAmount != null ? fmt(data.legalShareAmount) : NBSP}
            </td>
            <td className={CELL} data-testid={t("actual-ratio")}>
              {pct(data.actualShareRatio)}
            </td>
            <td className={AMT} data-testid={t("actual-value")}>
              {fmt(data.actualShareAmount)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
