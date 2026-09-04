"use client";

/**
 * 겸용주택 — 보유 중 일부 용도변경 입력 섹션
 *
 * 시행령 §166⑥ + 양도소득세 집행기준 99-164-10 (재산-1384, 2009.7.8.).
 * 양도시 겸용이지만 취득시 단일 용도였던 경우 입력 UI.
 *
 * 마운트 조건: asset.isMixedUseHouse === true && asset.hasPartialUsageChange === true.
 * MixedUseExpandedPanel에서 ① MixedUseAreaInputs 직후 "1-A" 섹션으로 노출.
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 부모 섹션 번호 ("1-A" 형식 — MixedUseAreaInputs ① 직후) */
  sectionNum?: string | number;
}

export function PartialUsageChangeInputs({ asset, onChange, sectionNum }: Props) {
  // 양도시 합계 (자동 도출 기준)
  const transferRes = parseDecimal(asset.residentialFloorArea) ?? 0;
  const transferComm = parseDecimal(asset.nonResidentialFloorArea) ?? 0;
  const transferTotal = transferRes + transferComm;

  const direction = asset.partialChangeDirection || "house_to_commercial";
  const isHouseToComm = direction === "house_to_commercial";

  // 자동 면적 (수정값 우선)
  const acqResAuto = isHouseToComm ? transferTotal : 0;
  const acqCommAuto = isHouseToComm ? 0 : transferTotal;
  // parseDecimal("")=0 이므로 ?? 연산자로는 자동값 fallback 불가. 빈 문자열 여부로 분기.
  const acqResShown =
    asset.partialChangeAcqResidentialArea !== ""
      ? parseDecimal(asset.partialChangeAcqResidentialArea)
      : acqResAuto;
  const acqCommShown =
    asset.partialChangeAcqCommercialArea !== ""
      ? parseDecimal(asset.partialChangeAcqCommercialArea)
      : acqCommAuto;

  const isCustomized =
    !!asset.partialChangeAcqResidentialArea ||
    !!asset.partialChangeAcqCommercialArea;

  return (
    <ToneCard tone="amber" sectionNum={sectionNum} title="취득시점 자산 구성 (보유 중 일부 용도변경)" bodyClassName="space-y-3" noDark>

      {/* 방향 Select — 양도시점/취득시점 혼동 방지 라벨 */}
      <FieldCard label="취득시 자산 구성" hint="양도시와 다른 경우 선택">
        <Select
          value={direction}
          onValueChange={(v) =>
            onChange({
              partialChangeDirection: v as AssetForm["partialChangeDirection"],
            })
          }
        >
          <SelectTrigger className="h-9 w-full">
            <span className="text-left">
              {direction === "commercial_to_house"
                ? "취득시 전체 상가 (양도시 일부 주택화)"
                : "취득시 전체 주택 (양도시 일부 상가화)"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="house_to_commercial">
              취득시 전체 주택 (양도시 일부 상가화)
            </SelectItem>
            <SelectItem value="commercial_to_house">
              취득시 전체 상가 (양도시 일부 주택화)
            </SelectItem>
          </SelectContent>
        </Select>
      </FieldCard>

      {/* 자동 도출 면적 표시 */}
      <div className="rounded-lg bg-amber-100/60 border border-amber-200 px-3 py-2 text-sm space-y-1">
        <div className="flex justify-between text-xs text-amber-700">
          <span>취득시 주택 연면적 {isCustomized ? "(수정됨)" : "(자동)"}</span>
          <span className="font-mono">{acqResShown.toFixed(2)}㎡</span>
        </div>
        <div className="flex justify-between text-xs text-amber-700">
          <span>취득시 상가 연면적 {isCustomized ? "(수정됨)" : "(자동)"}</span>
          <span className="font-mono">{acqCommShown.toFixed(2)}㎡</span>
        </div>
      </div>

      {/* 안내 (이슈 4 — 항상 노출) */}
      <p className="text-caption text-amber-700/80 leading-relaxed">
        ※ 증축·일부 멸실 등으로 취득시 면적이 양도시 합계와 다른 경우 직접 수정하세요.
      </p>

      {/* 수정하기 chip 토글 */}
      <ToggleCard
        variant="chip"
        size="sm"
        tone="amber"
        title="취득시 면적 직접 입력"
        checked={isCustomized}
        onCheckedChange={(c) => {
          if (!c) {
            onChange({
              partialChangeAcqResidentialArea: "",
              partialChangeAcqCommercialArea: "",
            });
          } else {
            onChange({
              partialChangeAcqResidentialArea: acqResAuto.toFixed(2),
              partialChangeAcqCommercialArea: acqCommAuto.toFixed(2),
            });
          }
        }}
      />

      {isCustomized && (
        <div className="space-y-2">
          <FieldCard label="취득시 주택 연면적 (㎡)">
            <DecimalInput
              value={asset.partialChangeAcqResidentialArea}
              onChange={(v) => onChange({ partialChangeAcqResidentialArea: v })}
              placeholder={`자동: ${acqResAuto.toFixed(2)}`}
              unit="㎡"
            />
          </FieldCard>
          <FieldCard label="취득시 상가 연면적 (㎡)">
            <DecimalInput
              value={asset.partialChangeAcqCommercialArea}
              onChange={(v) => onChange({ partialChangeAcqCommercialArea: v })}
              placeholder={`자동: ${acqCommAuto.toFixed(2)}`}
              unit="㎡"
            />
          </FieldCard>
        </div>
      )}

      {/* 용도변경일 — 입력 시 LTHD 시간 비례 분할 적용 (집행기준 89-154-24) */}
      <FieldCard
        label="용도변경일 (선택)"
        hint="입력 시 장기보유특별공제를 용도변경일 전후로 분리 계산 (집행기준 89-154-24 — 주택 사용 기간 통산 취지)"
      >
        <DateInput
          value={asset.partialChangeDate}
          onChange={(v) => onChange({ partialChangeDate: v })}
        />
      </FieldCard>
    </ToneCard>
  );
}
