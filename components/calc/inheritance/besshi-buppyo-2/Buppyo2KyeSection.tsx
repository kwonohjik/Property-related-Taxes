"use client";

/**
 * Buppyo2KyeSection — 부표 2 「계」 (⑰~㉘ 12행).
 * 좌측 "계" rowSpan 12 + 비과세재산가액/과세가액불산입액/가산하는 증여재산가액 그룹 라벨 rowSpan 3.
 * 비과세 3종·과세가액불산입 3종 = 공란(엔진 미분리, D-4). UI 무산술 — sectionTotal 값 직접 바인딩.
 */

import type { Buppyo2SectionTotal } from "@/lib/calc/besshi-buppyo-2-data";
import { BP2_KYE_ROWS, type Buppyo2KyeKey } from "./besshi-buppyo-2-constants";

const NBSP = " ";
const fmt = (n: number) => n.toLocaleString("ko-KR");

const KEY =
  "border border-black p-1 bg-gray-100 dark:bg-gray-800 text-[11px] font-semibold text-center align-middle";
const GRP =
  "border border-black p-1 bg-gray-50 dark:bg-gray-900 text-[10px] text-center align-middle";
const LBL = "border border-black p-1 text-[11px] text-left align-middle";
const AMT =
  "border border-black p-1 text-[11px] text-right font-mono tabular-nums whitespace-nowrap align-middle";

/** 계 행 key → 금액. 공란(비과세·과세불산입 세부)은 null. UI 무산술. */
function valueFor(key: Buppyo2KyeKey, t: Buppyo2SectionTotal): number | null {
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
    // 비과세 ⑲⑳㉑ · 과세가액불산입 ㉒㉓㉔ — per-heir 인정액
    case "nontax_farmland":
      return t.nonTaxableFarmland;
    case "nontax_public":
      return t.nonTaxablePublic;
    case "nontax_other":
      return t.nonTaxableOther;
    case "excl_public_corp":
      return t.exclusionPublicCorp;
    case "excl_public_trust":
      return t.exclusionPublicTrust;
    case "excl_other":
      return t.exclusionOther;
    default:
      return null;
  }
}

// 그룹 레이아웃 사전 계산: 그룹 시작 idx → {라벨·rowSpan}, 그룹 멤버 idx Set
const GROUP_START = new Map<number, { label: string; size: number }>();
const GROUP_MEMBER = new Set<number>();
BP2_KYE_ROWS.forEach((row, i) => {
  const r = row as { group?: string; groupSize?: number };
  if (r.group && r.groupSize) {
    GROUP_START.set(i, { label: r.group, size: r.groupSize });
    for (let k = 0; k < r.groupSize; k++) GROUP_MEMBER.add(i + k);
  }
});

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
          {BP2_KYE_ROWS.map((row, i) => {
            const v = valueFor(row.key, total);
            const isTotal = row.key === "total";
            const groupStart = GROUP_START.get(i);
            const isUngrouped = !GROUP_MEMBER.has(i); // ⑰⑱㉘ — 그룹 셀 없음
            return (
              <tr
                key={row.key}
                data-testid={`buppyo2-kye-row-${idx}-${row.key}`}
                className={isTotal ? "font-semibold" : undefined}
              >
                {i === 0 && (
                  <td className={KEY} rowSpan={BP2_KYE_ROWS.length}>
                    계
                  </td>
                )}
                {groupStart && (
                  <td className={GRP} rowSpan={groupStart.size}>
                    {groupStart.label}
                  </td>
                )}
                <td className={LBL} colSpan={isUngrouped ? 2 : 1}>
                  {row.no} {row.label}
                </td>
                <td className={AMT}>{v != null ? fmt(v) : NBSP}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
