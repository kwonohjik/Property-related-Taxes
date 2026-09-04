"use client";

import { useMemo } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { evaluateUnconditionalExemption } from "@/lib/calc/nbl-unconditional-exemption-status";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { SigunguSelect } from "./shared/SigunguSelect";
import { extractSidoSigunguName } from "@/lib/calc/address-sigungu-name";
import { UnconditionalExemptionSection } from "./UnconditionalExemptionSection";
import { ResidenceHistorySection } from "./ResidenceHistorySection";
import { GracePeriodSection } from "./GracePeriodSection";
import { FarmlandDetailSection } from "./FarmlandDetailSection";
import { ForestDetailSection } from "./ForestDetailSection";
import { PastureDetailSection } from "./PastureDetailSection";
import { HousingLandDetailSection } from "./HousingLandDetailSection";
import { VillaLandDetailSection } from "./VillaLandDetailSection";
import { OtherLandDetailSection } from "./OtherLandDetailSection";
import { DeemedTransferSection } from "./DeemedTransferSection";
import { NblUrbanZoneCheckButton } from "./NblLandAutoFetch";

const LAND_TYPE_OPTIONS = [
  { value: "farmland",     label: "농지 (전·답·과수원)" },
  { value: "forest",       label: "임야" },
  { value: "pasture",      label: "목장용지" },
  { value: "housing_site", label: "주택 부수 토지" },
  { value: "villa_land",   label: "별장 부수 토지" },
  { value: "other_land",   label: "기타 토지 (나대지·잡종지)" },
] as const;

/**
 * 법 §104조의3①1호나목 괄호의 「읍ㆍ면지역」 판별 — 자치단체 종류(군/시/구)는 시·군·구 코드에서
 * 도출되지만 읍·면 여부는 코드에 없다. 자동 추정 금지 정책상 사용자에게 받는다.
 */
const LAND_DIVISION_OPTIONS = [
  { value: "dong" as const, label: "동 지역" },
  { value: "eup_myeon" as const, label: "읍·면 지역" },
];

const ZONE_TYPE_OPTIONS = [
  { value: "exclusive_residential", label: "전용주거지역" },
  { value: "general_residential",   label: "일반주거지역" },
  { value: "semi_residential",      label: "준주거지역" },
  { value: "commercial",            label: "상업지역" },
  { value: "industrial",            label: "공업지역" },
  { value: "green",                 label: "녹지지역 (생산·자연)" },
  { value: "conservation_green",    label: "보전녹지지역" },
  { value: "management",            label: "관리지역" },
  { value: "agriculture_forest",    label: "농림지역" },
  { value: "natural_env",           label: "자연환경보전지역" },
  { value: "undesignated",          label: "미지정" },
] as const;

export function NblSectionContainer({
  asset,
  onAssetChange,
  transferDate,
}: {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
  /** form-level 양도일 — GracePeriodSection 5호 미리보기에 전달 */
  transferDate?: string;
}) {
  // 무조건 사업용 의제 — 엔진 실제 판정(날짜/지역/지목 조건) 기준. 토글 ON 여부만 보지 않는다.
  const exemptionStatus = useMemo(
    () => evaluateUnconditionalExemption(asset, transferDate ?? ""),
    [asset, transferDate],
  );

  // §66 자경 편입 부분감면 편입일 — NBL 도시편입일 미입력 시 판정에 자동 적용됨(buildNonBusinessLandRaw fallback).
  // UI에도 자동 적용 사실을 표시해 표시↔판정 일관성 확보.
  const sfIncorporationDate = (() => {
    const sf = asset.reductions?.find((r) => r.type === "self_farming");
    return sf?.type === "self_farming" && sf.useSelfFarmingIncorporation
      ? sf.selfFarmingIncorporationDate
      : undefined;
  })();

  // 도시편입일 직접입력값이 유효한 YYYY-MM-DD인지 — 깨진 형식(과거 raw text로 저장된 "20230214" 등)은
  // 미입력으로 간주해 §66 편입일 fallback이 동작하도록 한다. buildNonBusinessLandRaw의 판정 규칙과 일치(표시↔판정).
  const nblIncorpDateIsValid = /^\d{4}-\d{2}-\d{2}$/.test(asset.nblUrbanIncorporationDate);

  // 토지 소재지 = 양도 물건 소재지 자동연동. 판정용 코드는 acquisitionSigunguCode(10자리)를 5자리로 정규화,
  // 표시용 이름은 자산 주소 문자열에서 파싱(시군구 코드 테이블 누락 시군구도 표시됨).
  // nblLandSigunguCode 미입력 시 fallback으로 판정에 사용됨(buildNonBusinessLandRaw). 표시로 일관성 확보.
  const acqSigungu5 = (asset.acquisitionSigunguCode || "").slice(0, 5);
  const acqSigunguName = extractSidoSigunguName(asset.addressJibun || asset.addressRoad) || undefined;

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

      {/* 1. 무조건 면제 (§168의14③) — 최우선 */}
      <UnconditionalExemptionSection
        asset={asset}
        onAssetChange={onAssetChange}
        status={exemptionStatus}
      />

      {/* 2. 공통 — 지목·용도지역 (실제 의제 성립 시에만 비활성) */}
      <div
        data-testid="nbl-per-category"
        className={exemptionStatus.isExempt ? "opacity-50 pointer-events-none" : undefined}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldCard label="토지 지목">
            <Select
              value={asset.nblLandType ?? ""}
              onValueChange={(v) => v && onAssetChange({ nblLandType: v as AssetForm["nblLandType"] })}
            >
              <SelectTrigger>
                <SelectValue>
                  {LAND_TYPE_OPTIONS.find((o) => o.value === asset.nblLandType)?.label ?? "선택 안 함"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LAND_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldCard>

          <FieldCard label="용도지역">
            <Select
              value={asset.nblZoneType ?? ""}
              onValueChange={(v) => v && onAssetChange({ nblZoneType: v })}
            >
              <SelectTrigger>
                <SelectValue>
                  {ZONE_TYPE_OPTIONS.find((o) => o.value === asset.nblZoneType)?.label ?? "선택 안 함"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ZONE_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldCard>
        </div>

        {/* 3. 재촌 판정 (농지·임야·목장 공통) — 토지 소재지 → 거주 이력 순 */}
        {(asset.nblLandType === "farmland" || asset.nblLandType === "forest" || asset.nblLandType === "pasture") && (
          <div className="mt-3 space-y-3">
            <div data-testid="nbl-land-sigungu">
              <FieldCard
                label="토지 소재지 (시·군·구)"
                hint="재촌 판정 — 거주지와 동일/연접 시·군·구 또는 직선거리 30km 매칭에 사용됩니다."
                trailing={<LawArticleModal legalBasis="소득세법 시행령 §168의8" label="§168의8②·9②" />}
              >
                <SigunguSelect
                  code={asset.nblLandSigunguCode || acqSigungu5}
                  name={asset.nblLandSigunguName || (acqSigunguName ?? "")}
                  onChange={(c, n) => onAssetChange({ nblLandSigunguCode: c, nblLandSigunguName: n })}
                />
                {!asset.nblLandSigunguCode && acqSigunguName && (
                  <p className="mt-1 text-xs text-amber-700">
                    양도 물건 소재지 {acqSigunguName} 자동 입력됨 (직접 수정 가능).
                  </p>
                )}
              </FieldCard>
            </div>
            {(asset.nblLandType === "farmland" || asset.nblLandType === "pasture") && (
              <div data-testid="nbl-land-division">
                <FieldCard
                  label="소재지 행정구역 단위"
                  hint="법 §104조의3①1호나목·3호가목의 도시지역 판정은 특별시·광역시(군 제외)·특별자치시·특별자치도·시지역 안에서만 합니다. 읍·면지역은 제외되므로 도시지역이어도 지역기준이 적용되지 않습니다."
                  trailing={<LawArticleModal legalBasis="소득세법 §104조의3" label="§104의3①1호나" />}
                >
                  <RadioCardGroup
                    name={`nblLandDivision-${asset.assetId}`}
                    tone="rose"
                    layout="inline"
                    options={LAND_DIVISION_OPTIONS}
                    value={asset.nblLandDivision ?? ""}
                    onChange={(v) => onAssetChange({ nblLandDivision: v })}
                  />
                </FieldCard>
              </div>
            )}
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
            {asset.nblLandType === "other_land"   && <OtherLandDetailSection asset={asset} onAssetChange={onAssetChange} transferDate={transferDate} />}
          </div>
        )}

        {/* 5. 공통 지원 필드 */}
        <div className="mt-3">
          <FieldCard label="도시편입일" hint="도시지역 편입 시 3년 유예 적용. 편입일은 토지이용계획확인원에서 확인해 입력하세요(자동조회 불가)">
            <DateInput
              value={nblIncorpDateIsValid ? asset.nblUrbanIncorporationDate : ""}
              onChange={(v) => onAssetChange({ nblUrbanIncorporationDate: v })}
            />
            {!nblIncorpDateIsValid && sfIncorporationDate && (
              <p className="mt-1 text-xs text-amber-700">
                감면의 편입일 {sfIncorporationDate} 자동 적용 (편입 3년 유예 판정). 다르면 직접 입력하세요.
              </p>
            )}
            <NblUrbanZoneCheckButton jibun={asset.addressJibun} transferDate={transferDate ?? ""} />
          </FieldCard>
        </div>

        {/* 6. 부득이한 사유 */}
        <div className="mt-3">
          <GracePeriodSection asset={asset} onAssetChange={onAssetChange} transferDate={transferDate} />
        </div>

        {/* 7. 양도일 의제 (§168의14②) — 기간기준 5지목 (주택부수토지는 §168의6 미적용이라 제외) */}
        {asset.nblLandType && asset.nblLandType !== "housing_site" && (
          <div className="mt-3">
            <DeemedTransferSection asset={asset} onAssetChange={onAssetChange} />
          </div>
        )}
      </div>
    </div>
  );
}
