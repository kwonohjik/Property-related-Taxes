"use client";

/**
 * BesshiSharedAtoms — 별지 부표3 5쪽 양식의 공용 atom 컴포넌트
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-besshi-form-full-replica.plan.md
 * Design: docs/02-design/features/inheritance-unlisted-stock-besshi-form-full-replica.engine.design.md §3
 */

import type React from "react";

export function fmt(n: number): string {
  return n.toLocaleString();
}

export function renderDelta(n: number): string {
  return n < 0 ? `△${fmt(Math.abs(n))}` : fmt(n);
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[12px] font-bold border-l-4 border-black pl-2 mb-2 mt-3 print:text-black">
      {children}
    </h2>
  );
}

export interface ResultTableRowProps {
  cellNum: string;
  label: string;
  value: string;
  emphasized?: boolean;
  testid?: string;
  unit?: string;
}

export function ResultTableRow({ cellNum, label, value, emphasized, testid, unit = "" }: ResultTableRowProps) {
  return (
    <tr
      className={emphasized ? "bg-yellow-50 font-bold print:bg-yellow-50" : ""}
      data-testid={testid}
      data-besshi-cell={testid}
    >
      <td className="border border-black p-1 w-12 text-center font-mono">{cellNum}</td>
      <td className="border border-black p-1">{label}</td>
      <td className="border border-black p-1 text-right font-mono">
        {value}
        {unit}
      </td>
    </tr>
  );
}

export interface BreakdownRowProps {
  label: string;
  values: number[];
  emphasized?: boolean;
  unit?: string;
  testid?: string;
}

export function BreakdownRow({ label, values, emphasized, unit = "", testid }: BreakdownRowProps) {
  return (
    <tr
      className={emphasized ? "bg-yellow-50 font-bold print:bg-yellow-50" : ""}
      data-testid={testid}
      data-besshi-cell={testid}
    >
      <td className="border border-black p-1">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="border border-black p-1 text-right font-mono">
          {fmt(v)}
          {unit}
        </td>
      ))}
    </tr>
  );
}
