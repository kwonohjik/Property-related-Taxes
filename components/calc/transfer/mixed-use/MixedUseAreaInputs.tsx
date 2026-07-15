"use client";

import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { computeDerivedAreas, round2 } from "@/lib/tax-engine/mixed-use-derived-areas";
import { residualArea } from "@/lib/tax-engine/area-utils";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  sectionNum?: number;
}

/**
 * 면적·부수토지·지역 통합 카드 (섹션 ①).
 * - 전용/공통면적 입력 → 공통면적을 전용비율로 안분해 주택/상가 연면적 자동 파생(read-only).
 * - 부수토지 안분은 아래 상가 기준시가란에서 자동 표시·수정 (dual display 회피).
 * - 수도권 배율 지역 토글(§168의12) 흡수.
 */
export function MixedUseAreaInputs({ asset, onChange, sectionNum }: Props) {
  const residential = parseDecimal(asset.residentialFloorArea) ?? 0;
  const commercial = parseDecimal(asset.nonResidentialFloorArea) ?? 0;
  const total = residential + commercial;
  const totalLand = parseDecimal(asset.mixedUseTotalLandArea) ?? 0;
  const footprint = parseDecimal(asset.buildingFootprintArea) ?? 0;

  // 부수토지 파생(주택/상가) — override(주택) 반영 (PHD OFF 전용, 상가 기준시가란과 동일 leaf)
  const overrideStr = asset.mixedResidentialLandAreaOverride ?? "";
  const hasOverride = !asset.usePreHousingDisclosure && overrideStr.trim() !== "";
  const derived = computeDerivedAreas({
    residentialFloorArea: residential,
    nonResidentialFloorArea: commercial,
    buildingFootprintArea: parseDecimal(asset.buildingFootprintArea) ?? 0,
    totalLandArea: totalLand,
    ...(hasOverride ? { residentialLandAreaOverride: parseDecimal(overrideStr) ?? 0 } : {}),
  });

  // 전용/공통 변경 → 연면적 파생(같은 patch 동시 write, useEffect 미러링 없음).
  const onExclusiveChange = (patch: Partial<AssetForm>) => {
    const next = { ...asset, ...patch };
    const exR = parseDecimal(next.residentialExclusiveArea) ?? 0;
    const exC = parseDecimal(next.commercialExclusiveArea) ?? 0;
    const common = parseDecimal(next.commonArea) ?? 0;
    const exTotal = exR + exC;
    if (exTotal > 0) {
      const r = round2(exR + (common * exR) / exTotal);
      const c = residualArea(exTotal + common, r); // 잔액흡수: 합 = 전용합+공통 보장
      onChange({ ...patch, residentialFloorArea: String(r), nonResidentialFloorArea: String(c) });
    } else {
      // 전용 둘 다 빈값이면 연면적 write 안 함 (legacy 이력 보존)
      onChange(patch);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        {sectionNum !== undefined && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-micro font-bold text-slate-800 select-none">
            {sectionNum}
          </span>
        )}
        <p className="text-xs font-semibold text-slate-700">면적·부수토지·지역 정보</p>
      </div>

      {/* 면적 소그룹 (sky) */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-3">
        <p className="text-xs font-semibold text-sky-700">면적 (건축물대장 기준)</p>

        {/* 전용/공통 3열 한 행 */}
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">주택 전용면적 (㎡)</label>
            <DecimalInput
              value={asset.residentialExclusiveArea}
              onChange={(v) => onExclusiveChange({ residentialExclusiveArea: v })}
              placeholder="주택 전용면적"
              unit="㎡"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">상가 전용면적 (㎡)</label>
            <DecimalInput
              value={asset.commercialExclusiveArea}
              onChange={(v) => onExclusiveChange({ commercialExclusiveArea: v })}
              placeholder="상가(비주택) 전용면적"
              unit="㎡"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">공통면적 (㎡)</label>
            <DecimalInput
              value={asset.commonArea}
              onChange={(v) => onExclusiveChange({ commonArea: v })}
              placeholder="공용(공통)면적"
              unit="㎡"
            />
          </div>
        </div>

        {/* 정착·전체토지 2열 한 행 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">건물 정착면적 (수평 투영, ㎡)</label>
            <DecimalInput
              value={asset.buildingFootprintArea}
              onChange={(v) => onChange({ buildingFootprintArea: v })}
              placeholder="건축물대장의 건축면적"
              unit="㎡"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">전체 토지 면적 (㎡)</label>
            <DecimalInput
              value={asset.mixedUseTotalLandArea}
              onChange={(v) =>
                // 전체 토지 변경 시 부수토지 override 클리어 (stale 방지)
                onChange({ mixedUseTotalLandArea: v, mixedResidentialLandAreaOverride: "" })
              }
              placeholder="전체 토지 면적"
              unit="㎡"
            />
          </div>
        </div>

        {/* 계산 결과 6열 한 행 (연면적 + 정착면적 + 부수토지) — 항상 표시, 미입력은 "—" */}
        <div
          className="grid grid-cols-3 sm:grid-cols-6 gap-2 px-3 py-2 rounded-lg bg-sky-100/60 border border-sky-200"
          data-testid="mixed-derived-floor"
        >
          <div>
            <span className="block text-caption text-sky-700">주택 연면적</span>
            <span className="font-semibold text-sky-900">
              {total > 0 ? `${residential.toFixed(2)}㎡` : "—"}
            </span>
          </div>
          <div>
            <span className="block text-caption text-sky-700">상가 연면적</span>
            <span className="font-semibold text-sky-900">
              {total > 0 ? `${commercial.toFixed(2)}㎡` : "—"}
            </span>
          </div>
          <div>
            <span className="block text-caption text-sky-700">주택 정착면적</span>
            <span className="font-semibold text-sky-900">
              {footprint > 0 && total > 0 ? `${derived.residentialFootprintArea.toFixed(2)}㎡` : "—"}
            </span>
          </div>
          <div>
            <span className="block text-caption text-sky-700">상가 정착면적</span>
            <span className="font-semibold text-sky-900">
              {footprint > 0 && total > 0
                ? `${round2(footprint - derived.residentialFootprintArea).toFixed(2)}㎡`
                : "—"}
            </span>
          </div>
          <div>
            <span className="block text-caption text-sky-700">주택 부수토지</span>
            <span className="font-semibold text-sky-900">
              {totalLand > 0 ? `${derived.residentialLandArea.toFixed(2)}㎡` : "—"}
            </span>
          </div>
          <div>
            <span className="block text-caption text-sky-700">상가 부수토지</span>
            <span className="font-semibold text-sky-900">
              {totalLand > 0 ? `${derived.commercialLandArea.toFixed(2)}㎡` : "—"}
            </span>
          </div>
        </div>

        <p className="text-caption text-sky-700/80">
          ※ 주택·상가 부수토지 면적은 아래 상가 기준시가란에서 수정합니다.
        </p>
      </div>

      {/* 지역 소그룹 (rose) */}
      <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-rose-700">부수토지 배율 지역</p>
          <LawArticleModal legalBasis="소득세법 시행령 §168의12" label="§168의12 배율" />
        </div>
        <ToggleCard
          tone="rose"
          title="수도권 지역"
          description="배율 3배·5배 구분 — 수도권 주·상·공: 3배 / 수도권 녹지·밖: 5배 / 도시 외: 10배 (시행령 §168의12)"
          checked={!!asset.mixedIsMetropolitanArea}
          onCheckedChange={(v) => onChange({ mixedIsMetropolitanArea: v })}
        />
      </div>
    </div>
  );
}
