"use client";

/**
 * 신축주택 부수토지 한도 산정 섹션 (영 §154⑦, 2022년 개정 후 3단계)
 *
 * 건물 정착면적 × 배율 = 부수토지 인정 한도
 *   - 수도권 도시지역(주거·상업·공업): 3배
 *   - 수도권 녹지 또는 수도권 외 도시지역: 5배
 *   - 도시지역 외: 10배
 *
 * companion 토지 면적이 한도를 초과하면 초과분은 일반 나대지로 분리과세.
 *
 * 렌더 조건:
 *   - acquisitionCause === "newConstruction" 이거나
 *   - isMixedUseHouse === true (겸용주택 PHD 재사용 컨텍스트)
 * 단, 이 컴포넌트는 신축주택 케이스 전용으로 호출 측에서 조건 제어.
 *
 * tone: sky (면적·규모 섹션)
 * 규칙: DecimalInput 사용 (소수점 허용), RadioCardGroup 사용 (3옵션 zone 선택)
 */

import { useMemo } from "react";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";

type AppurtenantLandZone =
  | "metropolitan_residential"
  | "non_metropolitan_or_green"
  | "non_urban";

interface Props {
  /** 건물 정착면적 (㎡, 문자열) */
  buildingFootprintArea: string;
  onBuildingFootprintAreaChange: (v: string) => void;
  /** 부수토지 인정 zone (3/5/10배 결정) */
  appurtenantLandZone: AppurtenantLandZone | undefined;
  onAppurtenantLandZoneChange: (v: AppurtenantLandZone) => void;
  /** companion 토지 면적 (㎡, 문자열) — 한도 초과 판정용. 없으면 계산 생략 */
  companionLandArea?: string;
}

const ZONE_OPTIONS: ReadonlyArray<{
  value: AppurtenantLandZone;
  label: string;
  description: string;
  multiplier: number;
}> = [
  {
    value: "metropolitan_residential",
    label: "수도권 도시지역 (주거·상업·공업)",
    description: "수도권정비계획법상 수도권 도시지역의 주거·상업·공업지역 — 정착면적 × 3배 한도",
    multiplier: 3,
  },
  {
    value: "non_metropolitan_or_green",
    label: "수도권 녹지 / 수도권 외 도시지역",
    description: "수도권 도시지역 중 녹지지역 또는 수도권 밖 도시지역 — 정착면적 × 5배 한도",
    multiplier: 5,
  },
  {
    value: "non_urban",
    label: "도시지역 외",
    description: "국토계획법상 도시지역 이외 (관리·농림·자연환경보전 등) — 정착면적 × 10배 한도",
    multiplier: 10,
  },
];

function multiplierOf(zone: AppurtenantLandZone | undefined): number {
  switch (zone) {
    case "metropolitan_residential":
      return 3;
    case "non_metropolitan_or_green":
      return 5;
    case "non_urban":
      return 10;
    default:
      return 3; // 미선택 시 가장 보수적인 3배 적용
  }
}

function zoneLabel(zone: AppurtenantLandZone | undefined): string {
  return ZONE_OPTIONS.find((o) => o.value === zone)?.label ?? "수도권 도시지역(기본)";
}

export function NewConstructionFootprintSection({
  buildingFootprintArea,
  onBuildingFootprintAreaChange,
  appurtenantLandZone,
  onAppurtenantLandZoneChange,
  companionLandArea,
}: Props) {
  const footprint = parseDecimal(buildingFootprintArea) || 0;
  const multiplier = multiplierOf(appurtenantLandZone);
  const limitArea = footprint * multiplier;

  const companionArea = companionLandArea ? parseDecimal(companionLandArea) || 0 : 0;
  const hasCompanionArea = companionArea > 0;
  const excessArea = hasCompanionArea ? Math.max(0, companionArea - limitArea) : 0;

  const isExcess = hasCompanionArea && excessArea > 0;

  const limitJudgment = useMemo(() => {
    if (!footprint || footprint <= 0) return null;
    if (!hasCompanionArea) return null;
    if (isExcess) {
      return {
        type: "excess" as const,
        message: `동반 토지 ${companionArea.toFixed(2)}㎡ > 인정 한도 ${limitArea.toFixed(2)}㎡ → 초과분 ${excessArea.toFixed(2)}㎡은 일반 나대지로 분리과세됩니다 (§154⑦)`,
      };
    }
    return {
      type: "ok" as const,
      message: `동반 토지 ${companionArea.toFixed(2)}㎡ ≤ 인정 한도 ${limitArea.toFixed(2)}㎡ → 전량 부수토지 인정 (§154⑦)`,
    };
  }, [footprint, companionArea, limitArea, excessArea, isExcess, hasCompanionArea]);

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-3">
      {/* 섹션 헤더 */}
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-micro font-bold text-sky-800 select-none">
          §
        </span>
        <p className="text-xs font-semibold text-sky-700">
          부수토지 한도 산정 (소득세법 시행령 §154⑦)
        </p>
      </div>

      <p className="text-caption text-sky-600 leading-relaxed">
        주택과 함께 양도되는 부수토지의 인정 한도 = 건물 정착면적 × 배율.
        수도권 도시지역(주거·상업·공업)은 3배, 수도권 녹지·수도권 외 도시지역은 5배, 도시지역 외는 10배입니다.
        한도 초과분은 일반 나대지로 분리하여 토지 보유기간 기준 세율을 적용합니다.
      </p>

      {/* ① 건물 정착면적 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-micro font-bold text-sky-800 select-none">
            ①
          </span>
          <p className="text-xs font-semibold text-sky-700">건물 정착면적 (㎡)</p>
        </div>
        <FieldCard
          label="건물 정착면적 (㎡)"
          hint="건물이 지면에 접한 1층 바닥면적(㎡)입니다. 소수점 2자리까지 입력 가능."
        >
          <DecimalInput
            value={buildingFootprintArea}
            onChange={onBuildingFootprintAreaChange}
          />
        </FieldCard>
      </div>

      {/* ② 부수토지 zone (3/5/10배) */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-micro font-bold text-sky-800 select-none">
            ②
          </span>
          <p className="text-xs font-semibold text-sky-700">소재지 구분 (영 §154⑦)</p>
        </div>
        <RadioCardGroup
          name="appurtenantLandZone"
          tone="sky"
          layout="stack"
          value={appurtenantLandZone ?? "metropolitan_residential"}
          onChange={(v) => onAppurtenantLandZoneChange(v as AppurtenantLandZone)}
          options={ZONE_OPTIONS.map((opt) => ({
            value: opt.value,
            label: opt.label,
            description: opt.description,
          }))}
        />
        <p className="text-caption text-sky-600">
          수도권정비계획법·국토계획법상 소재지에 따라 정착면적 배율이 달라집니다. 잘 모르겠으면 가장 보수적인 &quot;수도권 도시지역(주거·상업·공업) 3배&quot;를 선택하세요.
        </p>
      </div>

      {/* 자동 계산 결과 박스 */}
      {footprint > 0 && (
        <div className="rounded-md bg-sky-100/60 border border-sky-200 px-3 py-2 text-caption text-sky-800 space-y-1">
          <p className="font-semibold">부수토지 인정 한도 계산:</p>
          <p>
            건물 정착면적 {buildingFootprintArea}㎡ × {multiplier}배({zoneLabel(appurtenantLandZone)}) = <strong>{limitArea.toFixed(2)}㎡</strong>
          </p>
          {limitJudgment && (
            <p
              className={
                limitJudgment.type === "excess"
                  ? "text-rose-700 font-semibold"
                  : "text-sky-700"
              }
            >
              {limitJudgment.message}
            </p>
          )}
        </div>
      )}

      {/* 한도 초과 경고 배지 */}
      {isExcess && (
        <div className="rounded px-2 py-1.5 text-xs bg-rose-100 border border-rose-300 text-rose-800">
          <strong>부수토지 한도 초과 {excessArea.toFixed(2)}㎡</strong> —
          초과분은 일반 토지로 분리과세됩니다 (§154⑦).
          결과 표에서 &quot;토지(부수)&quot;와 &quot;토지(한도초과)&quot; 행이 분리 표시됩니다.
        </div>
      )}
    </div>
  );
}
