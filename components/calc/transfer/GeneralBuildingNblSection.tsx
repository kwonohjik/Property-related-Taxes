"use client";

/**
 * GeneralBuildingBlock ③ — **비사업용토지 판정** 섹션 (rose)
 *
 * 「소득세법」 제104조의3 제1항 제4호 나목 → 「지방세법」 제106조 제1항 제2호 →
 * 「지방세법 시행령」 제101조 제1항 제2호·제2항(적용배율표).
 *
 * `GeneralBuildingBlock`에서 분리했다(2026-08-04 P4 — 배치 런처 추가로 836줄 초과).
 * 배율·인정한도 파생값도 함께 옮겼다(이 섹션 전용).
 */

import { useMemo } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ReferenceSiteLinks, REFERENCE_SITES } from "@/components/calc/inputs/ReferenceSiteLink";
import { getBuildingSiteMultiplier } from "@/lib/tax-engine/non-business-land/urban-area";
import type { ZoneType } from "@/lib/tax-engine/non-business-land/types";

// 「지방세법 시행령」 제101조 제2항 적용배율표 기준 용도지역 선택지.
// 세분 전 주거지역(residential)은 표에 대응 항목이 없어 선택지에 두지 않는다(추정 배율 금지).
const GB_ZONE_OPTIONS = [
  { value: "exclusive_residential", label: "전용주거" },
  { value: "general_residential",   label: "일반주거" },
  { value: "semi_residential",      label: "준주거" },
  { value: "commercial",            label: "상업지역" },
  { value: "industrial",            label: "공업지역" },
  { value: "green",                 label: "녹지지역" },
  { value: "management",            label: "관리지역" },
  { value: "agriculture_forest",    label: "농림지역" },
  { value: "natural_env",           label: "자연환경보전" },
  { value: "unplanned",             label: "도시계획 미지정" },
];

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

export function GeneralBuildingNblSection({ asset, onChange }: Props) {
  // 자동 배율 표시 — 엔진 함수 재사용 (UI 재계산 금지)
  const zoneMultiplier = useMemo(
    () =>
      asset.gbZoneType
        ? getBuildingSiteMultiplier(asset.gbZoneType as ZoneType)
        : undefined,
    [asset.gbZoneType],
  );

  // 인정 한도 미리 계산 (바닥면적 × 배율)
  const footprint = parseDecimal(asset.gbBuildingFootprintArea);
  const landArea = parseDecimal(asset.gbLandArea);
  const multiplierNum = zoneMultiplier?.multiplier;
  const allowedArea =
    footprint > 0 && multiplierNum !== undefined ? footprint * multiplierNum : null;
  return (
    <>
        {/* ④ 비사업용토지 판정 (rose) — 항상 표시 */}
        <ToneCard
          tone="rose"
          sectionNum="③"
          title="비사업용토지 판정"
          titleExtra={
            <span className="text-micro text-rose-500">
              (§104의3①4호나목 · 지방세령 §101)
            </span>
          }
          noDark
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <LawArticleModal legalBasis="소득세법 §104의3" label="§104의3 비사업용" />
            <LawArticleModal legalBasis="지방세법 시행령 §101" label="지방세령 §101 배율" />
          </div>
          <p className="text-caption text-rose-600">
            부수토지 한도 = <strong>건축물 바닥면적</strong>(각 층 중 최대, 지하 포함) × 용도지역 배율.
            초과분에만 +10%p 중과.
          </p>

          {/* 무허가건축물 — 배율 무관 전체 NBL */}
          <ToggleCard
            tone="rose"
            variant="chip"
            title="무허가(미등재) 건축물"
            description="무허가건축물 부속토지는 재산세 별도합산에서 제외되어 토지 전체가 비사업용 (배율 계산 없음)"
            checked={asset.gbIsUnregistered}
            onCheckedChange={(v) => onChange({ gbIsUnregistered: v })}
          />
          {asset.gbIsUnregistered && (
            <div className="flex flex-wrap items-center gap-1.5">
              <LawArticleModal legalBasis="소득세법 §104의3 ① 4호 나목" label="§104의3①4호나목" />
              <LawArticleModal legalBasis="지방세법 시행령 §101 ① 단서" label="지방세법시행령 §101①단서" />
            </div>
          )}

          {!asset.gbIsUnregistered && (
            <>
              {/* 용도지역 */}
              <FieldCard
                label="용도지역 (필수)"
                hint="국토계획법상 용도지역. 미선택 시 계산이 진행되지 않습니다."
              >
                <RadioCardGroup
                  name="gbZoneType"
                  layout="inline"
                  value={asset.gbZoneType}
                  onChange={(v) => onChange({ gbZoneType: v })}
                  options={GB_ZONE_OPTIONS}
                />
              </FieldCard>
              <ReferenceSiteLinks className="-mt-1" sites={[REFERENCE_SITES.landUsePlan]} />

              {/* 수도권 토글 폐지 (2026-07-30) — 「지방세법 시행령」 제101조 제2항에는
                  수도권 축이 없다. 종전에는 「소득세법 시행령」 제168조의12(주택 부수토지)
                  배율을 잘못 적용해 수도권 여부가 배율을 바꿨다. */}

              {/* 배율·인정한도 자동 표시 */}
              {zoneMultiplier && (
                <div className="rounded bg-rose-100/60 border border-rose-200 px-3 py-2 text-xs text-rose-800 space-y-0.5">
                  <p>적용 배율: <span className="font-semibold">{zoneMultiplier.detail}</span></p>
                  {footprint > 0 && allowedArea !== null && (
                    <p>인정 한도: 바닥면적 {footprint}㎡ × {multiplierNum}배 = <span className="font-semibold tabular-nums">{allowedArea.toFixed(2)} ㎡</span></p>
                  )}
                  {footprint > 0 && landArea > 0 && allowedArea !== null && (
                    landArea <= allowedArea
                      ? <p className="text-emerald-700 font-semibold">→ 사업용 (중과 미발동)</p>
                      : <p className="text-rose-700 font-semibold">→ 초과분 {(landArea - allowedArea).toFixed(2)}㎡ 비사업용 (중과)</p>
                  )}
                </div>
              )}
            </>
          )}

          {asset.gbIsUnregistered && (
            <div className="rounded bg-rose-100/60 border border-rose-200 px-3 py-2 text-xs text-rose-700">
              무허가건축물 — 토지 전체 비사업용 (배율 계산 없음)
            </div>
          )}
        </ToneCard>
    </>
  );
}
