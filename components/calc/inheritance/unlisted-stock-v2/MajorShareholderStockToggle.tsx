"use client";

/**
 * MajorShareholderStockToggle — §22② 최대주주 추가공제 제외 자동 도출 (PR-E)
 *
 * 본 컴포넌트는 §22②(추가공제 제외)만 다룬다. §63③(할증평가, isMaxShareholder)는
 * 선행 PR `max-shareholder-premium.ts` 별도 모듈에서 처리하며 의미가 다르다.
 *
 * 3-state RadioCardGroup:
 *   - "auto": 보유지분율 (ownedShares/totalShares) 자동 판정
 *   - "manual_on": 사용자 명시 ON (친족 합산 등 자동 판정으로 도달 불가한 시나리오)
 *   - "manual_off": 사용자 명시 OFF
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-ui-integration.plan.md §3 PR-E
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation-ui-integration.design.md §2-1
 */

import { useMemo } from "react";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { deriveSection22MajorShareholder } from "@/lib/tax-engine/property-valuation/auto-judgment";

export type Section22MajorShareholderMode = "auto" | "manual_on" | "manual_off";

export interface MajorShareholderStockToggleProps {
  mode: Section22MajorShareholderMode;
  ownedShares: number;
  totalShares: number;
  onChange: (mode: Section22MajorShareholderMode) => void;
}

export function MajorShareholderStockToggle({
  mode,
  ownedShares,
  totalShares,
  onChange,
}: MajorShareholderStockToggleProps) {
  const autoResult = useMemo(
    () => deriveSection22MajorShareholder({ ownedShares, totalShares }),
    [ownedShares, totalShares],
  );

  const ratioPercent = (autoResult.ownershipRatio * 100).toFixed(2);
  const isAuto = mode === "auto";

  // 적용될 결과 (mode에 따라)
  const appliedIsMajor =
    mode === "manual_on"
      ? true
      : mode === "manual_off"
        ? false
        : autoResult.isSection22Major;

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">
          10
        </span>
        <p className="text-xs font-semibold text-violet-700">
          §22② 최대주주 추가공제 제외 판정
        </p>
      </div>
      <p className="text-[11px] text-violet-700/80">
        ⓘ §22②는 <strong>추가공제 제외</strong>용. §63③ 할증평가(×120%)는 별도 모듈 (선행 PR
        max-shareholder-premium.ts).
      </p>

      <RadioCardGroup
        name="section22-major-mode"
        tone="violet"
        layout="stack"
        value={mode}
        onChange={onChange}
        options={[
          {
            value: "auto",
            label: "자동 판정 (보유지분율 기준)",
            description: "보유주식 ÷ 발행주식 비율로 자동 도출",
          },
          {
            value: "manual_on",
            label: "수동: 최대주주 해당 ON",
            description:
              "자동 판정과 다른 결론을 사용자가 직접 지정 (친족 합산 등 자동 판정으로 도달 불가한 시나리오)",
          },
          {
            value: "manual_off",
            label: "수동: 최대주주 해당 OFF",
            description: "보유지분이 높아도 최대주주 아님으로 처리 (특수 사실관계)",
          },
        ]}
      />

      {isAuto && totalShares > 0 && (
        <div className="rounded border border-violet-300 bg-violet-100/60 p-2">
          <p className="text-[11px] text-violet-900">
            보유지분율 = {ownedShares.toLocaleString()} / {totalShares.toLocaleString()} ={" "}
            <strong>{ratioPercent}%</strong>
          </p>
          <p className="text-[11px] font-semibold text-violet-900 mt-1">
            → §22② 최대주주{" "}
            <span
              className={
                autoResult.isSection22Major
                  ? "rounded bg-violet-600 text-white px-1.5 py-0.5"
                  : "rounded bg-slate-300 text-slate-800 px-1.5 py-0.5"
              }
            >
              {autoResult.isSection22Major ? "해당 (ON)" : "미달 (OFF)"}
            </span>
          </p>
        </div>
      )}

      {!isAuto && (
        <div className="rounded border border-violet-300 bg-violet-100/60 p-2">
          <p className="text-[11px] font-semibold text-violet-900">
            수동 지정 결과:{" "}
            <span
              className={
                appliedIsMajor
                  ? "rounded bg-violet-600 text-white px-1.5 py-0.5"
                  : "rounded bg-slate-300 text-slate-800 px-1.5 py-0.5"
              }
            >
              {appliedIsMajor ? "최대주주 해당 (ON)" : "비대주주 (OFF)"}
            </span>
          </p>
          {appliedIsMajor !== autoResult.isSection22Major && totalShares > 0 && (
            <p className="text-[10px] text-violet-700/80 mt-1">
              ※ 자동 판정값과 다름 — 자동: {autoResult.isSection22Major ? "ON" : "OFF"} (
              {ratioPercent}%)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
