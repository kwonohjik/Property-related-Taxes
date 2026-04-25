"use client";

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { UnconditionalExemptionSection } from "./UnconditionalExemptionSection";
import { ResidenceHistorySection } from "./ResidenceHistorySection";
import { GracePeriodSection } from "./GracePeriodSection";
import { FarmlandDetailSection } from "./FarmlandDetailSection";
import { ForestDetailSection } from "./ForestDetailSection";
import { PastureDetailSection } from "./PastureDetailSection";
import { HousingLandDetailSection } from "./HousingLandDetailSection";
import { VillaLandDetailSection } from "./VillaLandDetailSection";
import { OtherLandDetailSection } from "./OtherLandDetailSection";

const LAND_TYPE_OPTIONS = [
  { value: "farmland",     label: "농지 (전·답·과수원)" },
  { value: "forest",       label: "임야" },
  { value: "pasture",      label: "목장용지" },
  { value: "housing_site", label: "주택 부수 토지" },
  { value: "villa_land",   label: "별장 부수 토지" },
  { value: "other_land",   label: "기타 토지 (나대지·잡종지)" },
] as const;

const ZONE_TYPE_OPTIONS = [
  { value: "exclusive_residential", label: "전용주거지역" },
  { value: "general_residential",   label: "일반주거지역" },
  { value: "semi_residential",      label: "준주거지역" },
  { value: "commercial",            label: "상업지역" },
  { value: "industrial",            label: "공업지역" },
  { value: "green",                 label: "녹지지역" },
  { value: "management",            label: "관리지역" },
  { value: "agriculture_forest",    label: "농림지역" },
  { value: "natural_env",           label: "자연환경보전지역" },
  { value: "undesignated",          label: "미지정" },
] as const;

export function NblSectionContainer({
  asset,
  onAssetChange,
}: {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}) {
  const anyExempt =
    asset.nblExemptInheritBefore2007 ||
    asset.nblExemptLongOwned20y ||
    asset.nblExemptAncestor8YearFarming ||
    asset.nblExemptPublicExpropriation ||
    asset.nblExemptFactoryAdjacent ||
    asset.nblExemptJongjoongOwned ||
    asset.nblExemptUrbanFarmlandJongjoong;

  if (!asset.nblUseDetailedJudgment) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => onAssetChange({ nblUseDetailedJudgment: true })}
          className="w-full rounded-lg border border-dashed border-primary/40 px-4 py-3 text-sm text-primary hover:border-primary hover:bg-primary/5 transition-colors text-left"
        >
          <span className="font-medium">+ 상세 판정 시작</span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            지목·거주 이력·부득이한 사유 등을 입력하여 엔진이 자동으로 사업용/비사업용을 판정합니다.
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader title="비사업용 토지 정밀 판정" description="지목별 상세 정보를 입력하면 엔진이 자동 판정합니다." />
        <button
          type="button"
          onClick={() => onAssetChange({ nblUseDetailedJudgment: false })}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0"
        >
          접기
        </button>
      </div>

      {/* 1. 무조건 면제 (§168-14③) — 최우선 */}
      <UnconditionalExemptionSection asset={asset} onAssetChange={onAssetChange} />

      {/* 2. 공통 — 지목·용도지역 */}
      <div className={anyExempt ? "opacity-50 pointer-events-none" : undefined}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldCard label="토지 지목">
            <select
              value={asset.nblLandType}
              onChange={(e) => onAssetChange({ nblLandType: e.target.value as AssetForm["nblLandType"] })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">선택 안 함</option>
              {LAND_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </FieldCard>

          <FieldCard label="용도지역">
            <select
              value={asset.nblZoneType}
              onChange={(e) => onAssetChange({ nblZoneType: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">선택 안 함</option>
              {ZONE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </FieldCard>
        </div>

        {/* 3. 거주 이력 (농지·임야·목장 공통) */}
        {(asset.nblLandType === "farmland" || asset.nblLandType === "forest" || asset.nblLandType === "pasture") && (
          <div className="mt-3">
            <ResidenceHistorySection asset={asset} onAssetChange={onAssetChange} />
          </div>
        )}

        {/* 4. 지목별 세부 */}
        {asset.nblLandType && (
          <div className="mt-3">
            {asset.nblLandType === "farmland"     && <FarmlandDetailSection asset={asset} onAssetChange={onAssetChange} />}
            {asset.nblLandType === "forest"       && <ForestDetailSection asset={asset} onAssetChange={onAssetChange} />}
            {asset.nblLandType === "pasture"      && <PastureDetailSection asset={asset} onAssetChange={onAssetChange} />}
            {asset.nblLandType === "housing_site" && <HousingLandDetailSection asset={asset} onAssetChange={onAssetChange} />}
            {asset.nblLandType === "villa_land"   && <VillaLandDetailSection asset={asset} onAssetChange={onAssetChange} />}
            {asset.nblLandType === "other_land"   && <OtherLandDetailSection asset={asset} onAssetChange={onAssetChange} />}
          </div>
        )}

        {/* 5. 공통 지원 필드 */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldCard label="도시편입일" hint="도시지역 편입 시 3년 유예 적용">
            <input
              type="text"
              value={asset.nblUrbanIncorporationDate}
              onChange={(e) => onAssetChange({ nblUrbanIncorporationDate: e.target.value })}
              placeholder="YYYY-MM-DD"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FieldCard>
          <FieldCard label="공동소유 지분" hint="예: 0.5 (50%), 기본 1">
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={asset.nblOwnershipRatio}
              onChange={(e) => onAssetChange({ nblOwnershipRatio: e.target.value })}
              placeholder="1"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FieldCard>
        </div>

        {/* 6. 부득이한 사유 */}
        <div className="mt-3">
          <GracePeriodSection asset={asset} onAssetChange={onAssetChange} />
        </div>
      </div>
    </div>
  );
}
