"use client";

/**
 * RealEstateHeavyToggle — §54⑤ 부동산과다보유법인 자동 판정 (PR-F)
 *
 * 본 컴포넌트는 상증령 §54① 괄호 + 소법 §94①4호다목 50% 경계 기준 자동 판정.
 * isRealEstateHeavy=true 시 1주당 평가액 가중치 반전 (2·3/5):
 *   일반:        (1주당 순손익가치 × 3 + 1주당 순자산가치 × 2) / 5
 *   부동산과다:   (1주당 순손익가치 × 2 + 1주당 순자산가치 × 3) / 5
 *
 * 3-state RadioCardGroup:
 *   - "auto": totalAssetsForJudgment / realEstateAssetsForJudgment 비율 자동
 *   - "manual_on": 사용자 명시 ON
 *   - "manual_off": 사용자 명시 OFF
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-ui-integration.plan.md §3 PR-F
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation-ui-integration.design.md §2-2
 */

import { useMemo } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { judgeIsRealEstateHeavy } from "@/lib/tax-engine/property-valuation/auto-judgment";

export type RealEstateHeavyMode = "auto" | "manual_on" | "manual_off";

export interface RealEstateHeavyTogglePatch {
  realEstateHeavyMode?: RealEstateHeavyMode;
  totalAssetsForJudgment?: number;
  realEstateAssetsForJudgment?: number;
}

export interface RealEstateHeavyToggleProps {
  mode: RealEstateHeavyMode;
  totalAssetsForJudgment: number;
  realEstateAssetsForJudgment: number;
  onChange: (patch: RealEstateHeavyTogglePatch) => void;
}

export function RealEstateHeavyToggle({
  mode,
  totalAssetsForJudgment,
  realEstateAssetsForJudgment,
  onChange,
}: RealEstateHeavyToggleProps) {
  const autoResult = useMemo(
    () =>
      judgeIsRealEstateHeavy({
        totalAssets: totalAssetsForJudgment,
        realEstateAssets: realEstateAssetsForJudgment,
      }),
    [totalAssetsForJudgment, realEstateAssetsForJudgment],
  );

  const ratioPercent = (autoResult.ratio * 100).toFixed(2);
  const isAuto = mode === "auto";

  const appliedIsHeavy =
    mode === "manual_on"
      ? true
      : mode === "manual_off"
        ? false
        : autoResult.isRealEstateHeavy;

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-[10px] font-bold text-rose-800 select-none">
          3
        </span>
        <p className="text-xs font-semibold text-rose-700">
          §54⑤ 부동산과다보유법인 판정
        </p>
      </div>
      <p className="text-[11px] text-rose-700/80">
        ⓘ 가중치 반전: 일반 <span className="font-mono">(순손익×3 + 순자산×2)/5</span> vs 부동산과다{" "}
        <span className="font-mono">(순손익×2 + 순자산×3)/5</span> — 상증령 §54① 괄호 + 소법
        §94①4호다목
      </p>

      <RadioCardGroup
        name="real-estate-heavy-mode"
        tone="rose"
        layout="stack"
        value={mode}
        onChange={(next) => onChange({ realEstateHeavyMode: next })}
        options={[
          {
            value: "auto",
            label: "자동 판정 (자산 비율 기준)",
            description: "토지·건물·부동산권리 / 자산총액 ≥ 50% 시 부동산과다보유법인",
          },
          {
            value: "manual_on",
            label: "수동: 부동산과다 ON",
            description: "사용자 명시 — 자동 판정 우회",
          },
          {
            value: "manual_off",
            label: "수동: 부동산과다 OFF",
            description: "사용자 명시 — 일반법인 처리",
          },
        ]}
      />

      {isAuto && (
        <div className="space-y-2">
          <div className="grid grid-cols-[12rem_1fr] items-center gap-2">
            <div className="text-[11px]">
              <span className="font-semibold text-rose-700">자산총액</span>
              <span className="block text-[10px] text-gray-500">재무상태표상 자산총액</span>
            </div>
            <CurrencyInput
              label="자산총액"
              value={String(totalAssetsForJudgment || "")}
              onChange={(v) =>
                onChange({ totalAssetsForJudgment: Number(v.replace(/,/g, "")) || 0 })
              }
              placeholder="0"
              hideUnit
            />
          </div>
          <div className="grid grid-cols-[12rem_1fr] items-center gap-2">
            <div className="text-[11px]">
              <span className="font-semibold text-rose-700">부동산 자산 합계</span>
              <span className="block text-[10px] text-gray-500">
                토지 + 건물 + 부동산권리 (소법 §94①4호다목1·2)
              </span>
            </div>
            <CurrencyInput
              label="부동산 자산"
              value={String(realEstateAssetsForJudgment || "")}
              onChange={(v) =>
                onChange({
                  realEstateAssetsForJudgment: Number(v.replace(/,/g, "")) || 0,
                })
              }
              placeholder="0"
              hideUnit
            />
          </div>

          {totalAssetsForJudgment > 0 && (
            <div className="rounded border border-rose-300 bg-rose-100/60 p-2">
              <p className="text-[11px] text-rose-900">
                부동산 비율 = {realEstateAssetsForJudgment.toLocaleString()} /{" "}
                {totalAssetsForJudgment.toLocaleString()} = <strong>{ratioPercent}%</strong>
              </p>
              <p className="text-[11px] font-semibold text-rose-900 mt-1">
                → §54⑤{" "}
                <span
                  className={
                    autoResult.isRealEstateHeavy
                      ? "rounded bg-rose-600 text-white px-1.5 py-0.5"
                      : "rounded bg-slate-300 text-slate-800 px-1.5 py-0.5"
                  }
                >
                  {autoResult.isRealEstateHeavy
                    ? "부동산과다보유법인 (가중치 반전 2·3/5)"
                    : "일반법인 (가중치 3·2/5)"}
                </span>
              </p>
            </div>
          )}
        </div>
      )}

      {!isAuto && (
        <div className="rounded border border-rose-300 bg-rose-100/60 p-2">
          <p className="text-[11px] font-semibold text-rose-900">
            수동 지정 결과:{" "}
            <span
              className={
                appliedIsHeavy
                  ? "rounded bg-rose-600 text-white px-1.5 py-0.5"
                  : "rounded bg-slate-300 text-slate-800 px-1.5 py-0.5"
              }
            >
              {appliedIsHeavy ? "부동산과다 (가중치 2·3/5)" : "일반법인 (가중치 3·2/5)"}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
