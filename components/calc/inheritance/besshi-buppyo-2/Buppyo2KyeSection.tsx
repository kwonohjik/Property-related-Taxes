"use client";

/**
 * Buppyo2KyeSection — 부표 2 「계」 (12행). 라벨 좌·금액 우.
 * 비과세 3종·과세가액불산입 3종 = 공란(엔진 미분리, D-4). UI 무산술 — sectionTotal 값 직접 바인딩.
 */

import type { Buppyo2SectionTotal } from "@/lib/calc/besshi-buppyo-2-data";
import { BP2_KYE_ROWS, type Buppyo2KyeKey } from "./besshi-buppyo-2-constants";

const NBSP = " ";
const fmt = (n: number) => n.toLocaleString("ko-KR");

const LBL = "border border-black p-1 text-[11px] text-left align-middle";
const AMT =
  "border border-black p-1 text-[11px] text-right font-mono tabular-nums whitespace-nowrap align-middle";

/** 계 행 key → 금액. 공란(비과세·과세불산입 세부)은 null. UI 무산술. */
function valueFor(
  key: Buppyo2KyeKey,
  t: Buppyo2SectionTotal,
): number | null {
  switch (key) {
    case "estate_total":
      return t.grossEstateValue;
    case "presumed":
      return t.presumedAmount;
    case "prior_gift_13":
      return t.priorGift13;
    case "prior_gift_30_5":
      return t.priorGift30_5;
    case "prior_gift_30_6":
      return t.priorGift30_6;
    case "total":
      return t.total;
    default:
      return null; // nontax_*, excl_* — 세부 미분리 공란
  }
}

export function Buppyo2KyeSection({
  total,
  idx,
}: {
  total: Buppyo2SectionTotal;
  idx: number;
}) {
  return (
    <div data-testid={`buppyo2-heir-${idx}-kye-wrap`}>
      <p className="mb-1 text-[11px] font-semibold">계</p>
      <table className="w-full border-collapse">
        <tbody>
          {BP2_KYE_ROWS.map((row) => {
            const v = valueFor(row.key, total);
            const isTotal = row.key === "total";
            return (
              <tr
                key={row.key}
                data-testid={`buppyo2-kye-row-${idx}-${row.key}`}
                className={isTotal ? "font-semibold" : undefined}
              >
                <td className={LBL}>{row.label}</td>
                <td className={AMT}>{v != null ? fmt(v) : NBSP}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
