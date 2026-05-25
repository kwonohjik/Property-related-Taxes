"use client";

/**
 * HeirAllocationTable — 상속세 종합사례 PDF 책 1859 표 재현
 *
 * 상속인별 17행 × 6열 표 (배우자·장남·차남·손녀·영리법인 + 합계).
 * `heirAllocationResult` 가 결과에 포함된 경우만 렌더 (협의분할 입력 시).
 *
 * Plan: docs/00-pm/inheritance-comprehensive-case.plan.md (§1 결과 표)
 * Design: docs/02-design/features/inheritance-comprehensive-case.engine.design.md §6
 */

import type {
  InheritanceTaxResult,
  Heir,
  HeirTaxBreakdown,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";

interface HeirAllocationTableProps {
  result: InheritanceTaxResult;
  heirs: Heir[];
}

// 행 정의 — PDF 책 1859 표 17행
type RowDef =
  | { type: "section"; label: string }
  | {
      type: "data";
      label: string;
      pick: (h: HeirTaxBreakdown) => number;
      highlight?: boolean;
      indented?: boolean;
    };

const ROWS: RowDef[] = [
  { type: "section", label: "과세가액 구성" },
  {
    type: "data",
    label: "본래·간주상속재산",
    pick: (h) => h.directEstateAmount,
    indented: true,
  },
  { type: "data", label: "추정상속재산", pick: (h) => h.presumedAmount, indented: true },
  { type: "data", label: "사전증여 가산", pick: (h) => h.priorGiftAmount, indented: true },
  { type: "data", label: "채무·공과·장례 차감", pick: (h) => -h.debtShare, indented: true },
  {
    type: "data",
    label: "과세가액상당액",
    pick: (h) => h.taxableValueShare,
    highlight: true,
  },
  { type: "section", label: "과세표준상당액 (§3·§28 안분)" },
  { type: "data", label: "직접배부", pick: (h) => h.directTaxBaseShare, indented: true },
  { type: "data", label: "간접배부", pick: (h) => h.indirectTaxBaseShare, indented: true },
  {
    type: "data",
    label: "과세표준상당액",
    pick: (h) => h.taxBaseShare,
    highlight: true,
  },
  { type: "section", label: "세액" },
  { type: "data", label: "산출세액상당액", pick: (h) => h.computedTaxShare },
  { type: "data", label: "세대생략 할증", pick: (h) => h.generationSkipSurcharge },
  { type: "data", label: "사전증여세액공제", pick: (h) => -h.priorGiftCredit },
  {
    type: "data",
    label: "차가감 세액",
    pick: (h) => h.preFilingCreditTax,
    highlight: true,
  },
  { type: "data", label: "신고세액공제 (3%)", pick: (h) => -h.filingCredit },
  {
    type: "data",
    label: "자진납부세액",
    pick: (h) => h.finalTax,
    highlight: true,
  },
];

function heirLabel(h: Heir): string {
  const name = h.name ?? "";
  const relMap: Record<string, string> = {
    spouse: "배우자",
    child: "자녀",
    lineal_ascendant: "직계존속",
    sibling: "형제자매",
    other: "기타",
    legatee: "수유자",
    corporate: "영리법인",
  };
  const rel = relMap[h.relation] ?? h.relation;
  return name ? `${rel} (${name})` : rel;
}

export function HeirAllocationTable({
  result,
  heirs,
}: HeirAllocationTableProps) {
  const allocation = result.heirAllocationResult;
  if (!allocation || allocation.perHeir.size === 0) return null;

  // 표시 순서 — Heir 배열 순서 유지 + 영리법인은 마지막
  const orderedHeirs = [...heirs].sort((a, b) => {
    if (a.relation === "corporate" && b.relation !== "corporate") return 1;
    if (a.relation !== "corporate" && b.relation === "corporate") return -1;
    return 0;
  });

  const breakdowns: { heir: Heir; data: HeirTaxBreakdown }[] = [];
  for (const heir of orderedHeirs) {
    const data = allocation.perHeir.get(heir.id);
    if (data) breakdowns.push({ heir, data });
  }

  return (
    <div className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/30 dark:bg-indigo-950/20">
      <div className="px-4 py-3 border-b border-indigo-200 dark:border-indigo-900">
        <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
          상속인별 세부담액 집계
        </h3>
        <p className="text-xs text-indigo-700 dark:text-indigo-400 mt-1">
          상증법 §3·§28 안분 — 직접배부 + 간접배부 + 세대생략 할증 + 사전증여세액공제 + 신고세액공제
        </p>
        {allocation.usedLegalShareFallback && (
          <p className="mt-1.5 rounded bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 px-2 py-1 text-[11px] text-sky-800 dark:text-sky-200">
            ℹ️ 협의분할을 입력하지 않은 재산은 <strong>법정상속분</strong>(민법 §1009·§1003)으로 자동 배분되었습니다.
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-indigo-100 dark:bg-indigo-900/40">
            <tr>
              <th className="px-3 py-2 text-left font-semibold w-44 sticky left-0 bg-indigo-100 dark:bg-indigo-900/40">
                구분
              </th>
              {breakdowns.map(({ heir }) => (
                <th
                  key={heir.id}
                  className="px-3 py-2 text-right font-semibold whitespace-nowrap"
                >
                  {heirLabel(heir)}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                합계
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, idx) => {
              if (row.type === "section") {
                return (
                  <tr key={`sec-${idx}`} className="bg-indigo-50/60 dark:bg-indigo-950/40">
                    <td
                      colSpan={breakdowns.length + 2}
                      className="px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300"
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              }
              const values = breakdowns.map(({ data }) => row.pick(data));
              const sum = values.reduce((s, v) => s + v, 0);
              return (
                <tr
                  key={`row-${idx}`}
                  className={`border-t border-indigo-100 dark:border-indigo-900/40 ${
                    row.highlight ? "bg-indigo-100/40 dark:bg-indigo-900/20 font-semibold" : ""
                  }`}
                >
                  <td
                    className={`px-3 py-1.5 text-left ${
                      row.indented ? "pl-6 text-muted-foreground" : ""
                    } sticky left-0 ${
                      row.highlight
                        ? "bg-indigo-100/40 dark:bg-indigo-900/20"
                        : "bg-indigo-50/30 dark:bg-indigo-950/20"
                    }`}
                  >
                    {row.label}
                  </td>
                  {values.map((v, i) => (
                    <td
                      key={i}
                      className={`px-3 py-1.5 text-right font-mono ${
                        v < 0 ? "text-blue-600 dark:text-blue-400" : ""
                      }`}
                    >
                      {v === 0 ? "—" : formatKRW(v)}
                    </td>
                  ))}
                  <td
                    className={`px-3 py-1.5 text-right font-mono ${
                      sum < 0 ? "text-blue-600 dark:text-blue-400" : ""
                    }`}
                  >
                    {sum === 0 ? "—" : formatKRW(sum)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 산정 분모·분자 정보 */}
      <div className="px-4 py-3 border-t border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/30">
        <p className="text-xs text-indigo-700 dark:text-indigo-300 font-semibold mb-1">
          안분 산정 기준
        </p>
        <ul className="text-xs space-y-0.5 text-muted-foreground">
          <li>
            · 배부대상 산출세액 = 산출세액 − 영리법인 면제 ={" "}
            <span className="font-mono">{formatKRW(allocation.distributableTax)}</span>
          </li>
          <li>
            · 간접배부 분자 (상속세 과세표준 − 상속인 직접 − 영리법인 과세표준) ={" "}
            <span className="font-mono">{formatKRW(allocation.indirectNumerator)}</span>
          </li>
          <li>
            · 간접배부 분모 (과세가액 − 모든 사전증여 가산) ={" "}
            <span className="font-mono">{formatKRW(allocation.indirectDistributionBase)}</span>
          </li>
          <li>
            · 산출세액상당액 분모 (과세표준 − 영리법인 과세표준) ={" "}
            <span className="font-mono">{formatKRW(allocation.computedTaxShareDenominator)}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
