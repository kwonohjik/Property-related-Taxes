"use client";

/**
 * RateScenarioTable — 보유 주택 수별 세율 시뮬레이션 표
 *
 * 입력값 변경 시 실시간 갱신 (현재 적용 세율 강조)
 * 조정지역 × 비조정지역 × 법인 매트릭스 표시
 */

import { linearInterpolationRate } from "@/lib/tax-engine/acquisition-tax-rate";
import { SURCHARGE_RATES } from "@/lib/tax-engine/acquisition-surcharge/multi-house";
import { ACQUISITION_CONST } from "@/lib/tax-engine/legal-codes";
import type { AcquisitionTaxResult } from "@/lib/tax-engine/types/acquisition.types";

interface Props {
  result: AcquisitionTaxResult;
  isRegulatedArea: boolean;
  isCorporation: boolean;
  acquisitionValue: number;
}

interface ScenarioRow {
  label: string;
  regulated: string;
  nonRegulated: string;
  isCurrent: boolean;
}

// ============================================================
// 세율 표 데이터 생성 — 세율·임계는 엔진 export 단일 진실
// ============================================================

function pctLabel(rate: number): string {
  return `${(rate * 100).toFixed(5).replace(/\.?0+$/, "")}%`;
}

function getHousingBaseRateLabel(value: number): string {
  const rate = linearInterpolationRate(value); // 경계 1%·3% 포함 (엔진)
  const isInterpolated =
    value > ACQUISITION_CONST.HOUSING_BRACKET_LOW &&
    value < ACQUISITION_CONST.HOUSING_BRACKET_HIGH;
  return isInterpolated ? `${pctLabel(rate)} (선형보간)` : pctLabel(rate);
}

function buildScenarioRows(
  result: AcquisitionTaxResult,
  isRegulated: boolean,
  isCorp: boolean,
  acqValue: number,
): ScenarioRow[] {
  const baseRateLabel = getHousingBaseRateLabel(acqValue);
  const currentSurcharge = result.rateType === "surcharge_regulated";
  const currentCorp = result.rateType === "surcharge_corporate";

  const rate8 = pctLabel(SURCHARGE_RATES.MULTI_HOUSE_8);
  const rate12 = pctLabel(SURCHARGE_RATES.MULTI_HOUSE_12);
  const rateCorp = pctLabel(SURCHARGE_RATES.CORP);

  const rows: ScenarioRow[] = [
    {
      label: "1주택 (기본세율)",
      regulated: baseRateLabel,
      nonRegulated: baseRateLabel,
      isCurrent: !currentSurcharge && !currentCorp,
    },
    {
      label: "2주택 (일시적 X)",
      regulated: rate8,
      nonRegulated: baseRateLabel,
      isCurrent: false,
    },
    {
      label: "3주택",
      regulated: rate12,
      nonRegulated: rate8,
      isCurrent: false,
    },
    {
      label: "4주택 이상",
      regulated: rate12,
      nonRegulated: rate12,
      isCurrent: false,
    },
    {
      label: "법인 (주택)",
      regulated: rateCorp,
      nonRegulated: rateCorp,
      isCurrent: currentCorp,
    },
  ];

  // 현재 적용 세율 행 강조 (임계 비교도 엔진 상수)
  if (currentSurcharge) {
    if (result.appliedRate === SURCHARGE_RATES.MULTI_HOUSE_8) {
      const idx = rows.findIndex(r => r.label === "2주택 (일시적 X)");
      if (idx >= 0) rows[idx] = { ...rows[idx], isCurrent: true };
    } else if (result.appliedRate === SURCHARGE_RATES.MULTI_HOUSE_12) {
      const idx = rows.findIndex(r => r.label === "3주택");
      if (idx >= 0) rows[idx] = { ...rows[idx], isCurrent: true };
    }
  }

  return rows;
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export function RateScenarioTable({ result, isRegulatedArea, isCorporation, acquisitionValue }: Props) {
  if (result.propertyType !== "housing") return null;

  const rows = buildScenarioRows(result, isRegulatedArea, isCorporation, acquisitionValue);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/30 border-b">
        <p className="text-sm font-semibold">보유 주택 수별 세율 시뮬레이션</p>
        <p className="text-xs text-muted-foreground">현재 취득가액 기준 — 강조 행이 현재 적용 세율</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/20 text-xs text-muted-foreground">
              <th className="text-left px-4 py-2 font-medium">구분</th>
              <th className="text-center px-3 py-2 font-medium">조정지역</th>
              <th className="text-center px-3 py-2 font-medium">비조정지역</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                key={row.label}
                className={row.isCurrent
                  ? "bg-primary/10 font-semibold"
                  : "hover:bg-muted/10"
                }
              >
                <td className="px-4 py-2">
                  {row.label}
                  {row.isCurrent && (
                    <span className="ml-2 text-xs text-primary font-normal">← 현재</span>
                  )}
                </td>
                <td className={`px-3 py-2 text-center ${
                  row.isCurrent && isRegulatedArea ? "text-rose-700 font-bold" : ""
                }`}>
                  {row.regulated}
                </td>
                <td className={`px-3 py-2 text-center ${
                  row.isCurrent && !isRegulatedArea ? "text-rose-700 font-bold" : ""
                }`}>
                  {row.nonRegulated}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 bg-muted/10 border-t text-xs text-muted-foreground">
        * 사치성 재산 중과(§13①) / 세율특례(§15) 적용 시 위 표와 다를 수 있음
      </div>
    </div>
  );
}
