"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { OtherLandParcelSection } from "./OtherLandParcelSection";
import { OtherLandSportsSection } from "./OtherLandSportsSection";
import { FactoryLandSection } from "./FactoryLandSection";
import { NblLandValueAutoFetchButton } from "./NblLandAutoFetch";
// 공유 지분은 자산-수준 「공유 지분율」(%) 단일 소스 — NBL 전용 지분 입력칸은 폐지됐다(2026-09-04).
import { getOwnershipRatio } from "@/lib/calc/transfer-tax-api-asset-basics";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { useMemo } from "react";
import { parseISO, getDaysInYear } from "@/lib/tax-engine/utc-date";
import { deriveCurrentBusinessDays, computeRevenueTest } from "@/lib/tax-engine/non-business-land/revenue-test";
import type { NblRevenueBusinessType } from "@/lib/tax-engine/legal-codes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { nblAcquisitionDateOf } from "@/lib/calc/nbl-unconditional-exemption-status";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { PROPERTY_TAX_TYPE_LABEL } from "@/lib/tax-engine/non-business-land/property-tax-type-label";
import { judgeHoRequirements } from "@/lib/tax-engine/non-business-land/other-land-ho-requirements";
import type { ZoneType } from "@/lib/tax-engine/non-business-land/types";
import { NBL_PROPERTY_TAX_TYPE_MIXED_NOTICE, NBL_PROPERTY_TAX_TYPE_SOURCE_HINT } from "@/lib/tax-engine/nbl-confirm-notices";

export interface OtherLandDetailSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
  /** form-level 양도일 — 토지가액 자동조회 당해/직전 연도 결정 */
  transferDate?: string;
}

type PropertyTaxType = "" | "comprehensive" | "separate" | "special_sum" | "exempt";

type RelatedBusinessType = AssetForm["nblOtherRelatedBusinessType"];

// §168의11① 호별 분기 옵션 (면적기준 정밀판정). 수입금액비율(2호다·10·11다·12호)은 아래 별도 섹션.
const RELATED_BUSINESS_OPTIONS: RadioCardOption<Exclude<RelatedBusinessType, "">>[] = [
  { value: "none", label: "해당 없음", description: "§168의11① 호에 해당하지 않음 (재산세 유형·기간기준만 판정)", testId: "nbl-other-related-none" },
  { value: "parking_attached", label: "부설주차장 (2호 가목)", description: "「주차장법」 부설주차장 설치기준면적 이내까지 사업용", testId: "nbl-other-related-parking_attached" },
  { value: "parking_garage", label: "업무용자동차 주차장 (2호 나목)", description: "최저차고기준면적 × 1.5까지 사업용", testId: "nbl-other-related-parking_garage" },
  { value: "sports", label: "체육시설 (1호)", description: "종목·종업원수로 별표3·4·5 기준면적 자동산출 (미선택 시 직접입력)", testId: "nbl-other-related-sports" },
  { value: "youth_training", label: "청소년수련시설 (4호)", description: "수용정원 × 200㎡까지 사업용", testId: "nbl-other-related-youth_training" },
  { value: "reserve_forces", label: "예비군훈련시설 (5호 다목)", description: "부대편성인원·시설로 별표6 제2호 기준면적 자동산출 (미선택 시 직접입력). 도시지역 주·상·공 지역 안은 불인정(나목) · 지목(대지·공장용지 아님)·시설기준·수임 군부대 소유(라목)는 직접 확인", testId: "nbl-other-related-reserve_forces" },
  { value: "resort", label: "휴양시설업 (6호)", description: "옥외시설·부설주차장·건축물 3요소 — 부설주차장·건축물은 상한(설치기준면적 × 2 · 바닥면적 × 배율) 이내의 실제 면적을 합산 (미입력 시 직접입력)", testId: "nbl-other-related-resort" },
  { value: "hatchang", label: "하치장·야적장·적치장 (7호)", description: "매년 최대 사용면적 × 120%까지 사업용", testId: "nbl-other-related-hatchang" },
  { value: "vacant_lot_1household", label: "무주택1세대 1필지 나지 (13호)", description: "건축물 없는 나지만 660㎡ 이내까지 사업용 (건축물이 있으면 불인정) · 무주택 1세대·1필지·주택 신축 가능 여부는 직접 확인", testId: "nbl-other-related-vacant_lot" },
  { value: "etc_14호", label: "기타 거주 및 사업관련 토지", description: "제1~13호와 유사한 거주·사업관련 토지 (면적기준 없음)", testId: "nbl-other-related-etc14" },
];

const AREA_LEGAL_BASIS: Partial<Record<Exclude<RelatedBusinessType, "">, { legalBasis: string; label: string }>> = {
  parking_attached: { legalBasis: "소득세법 시행령 §168의11①2호가목", label: "§168의11①2호가목" },
  parking_garage: { legalBasis: "소득세법 시행령 §168의11①2호나목", label: "§168의11①2호나목" },
  sports: { legalBasis: "소득세법 시행령 §168의11①1호", label: "§168의11①1호" },
  youth_training: { legalBasis: "소득세법 시행규칙 §83의4⑧", label: "§83의4⑧(4호)" },
  reserve_forces: { legalBasis: "소득세법 시행규칙 §83의4⑩", label: "§83의4⑩(5호다목)" },
  resort: { legalBasis: "소득세법 시행규칙 §83의4⑫", label: "§83의4⑫(6호)" },
  hatchang: { legalBasis: "소득세법 시행령 §168의11①7호", label: "§168의11①7호" },
  vacant_lot_1household: { legalBasis: "소득세법 시행령 §168의11①13호", label: "§168의11①13호" },
};

// §168의11⑥ 복합용도 건축물 부속토지 안분 모드 (건축물 존재 시)
const MIXED_USE_MODE_OPTIONS: RadioCardOption<"" | "single_building" | "multiple_buildings">[] = [
  { value: "", label: "미적용", description: "복합용도 안분 없음 — 위 §168의11① 호별 기준면적으로 판정", testId: "nbl-other-mixed-none" },
  {
    value: "single_building",
    label: "하나의 건축물 복합용도 (⑥1호)",
    description: (
      <>
        한 건물 일부만 거주·특정사업 사용 → <Frac top="특정용도분 연면적" bottom="건축물 연면적" /> 비율로 부속토지 안분
      </>
    ),
    testId: "nbl-other-mixed-single",
  },
  {
    value: "multiple_buildings",
    label: "동일경계 다수 건축물 (⑥2호)",
    description: (
      <>
        여러 건물 중 일부만 거주·특정사업 사용 → <Frac top="특정용도분 바닥면적" bottom="전체 바닥면적" /> 비율로 부속토지 안분
      </>
    ),
    testId: "nbl-other-mixed-multiple",
  },
];

const RESERVE_SIZE_OPTIONS = [
  { value: "le800", label: "중대·대대 (800명 이하)" },
  { value: "le2400", label: "대대·연대 (801~2,400명)" },
  { value: "le5000", label: "연대 (2,401~5,000명)" },
  { value: "gt5000", label: "여단 (5,001명 이상)" },
] as const;
const RESERVE_SIZE_LABEL: Record<string, string> = Object.fromEntries(RESERVE_SIZE_OPTIONS.map((o) => [o.value, o.label]));

const RESERVE_FAC_OPTIONS = [
  { value: "tactical", label: "전술교육장" },
  { value: "shooting_prep", label: "사격술예비훈련장" },
  { value: "range", label: "사격장" },
  { value: "basic", label: "기초훈련장" },
] as const;

const REVENUE_BIZ_LABEL: Record<string, string> = {
  none: "해당 없음",
  parking_operation: "주차장운영업 (3%)",
  mineral_spring: "광천지 (4%)",
  fish_farm_other: "양어장·지소 기타 (4%)",
  block_stone_pipe_mfg: "블록·석물·토관 제조 (20%)",
  landscaping_floriculture: "조경식재·화훼판매 (7%)",
  vehicle_repair_academy: "자동차·중장비 정비/운전 학원 (10%)",
  agriculture_academy: "농업 학원 (7%)",
  wholesale_retail: "도소매업 (10%)",
};

export function OtherLandDetailSection({
  asset,
  onAssetChange,
  transferDate,
}: OtherLandDetailSectionProps) {
  const buildingVal = parseFloat(asset.nblOtherBuildingValue || "0") || 0;
  const landVal = parseFloat(asset.nblOtherLandValue || "0") || 0;
  const isLikelyBareground = landVal > 0 && buildingVal < landVal * 0.02;
  const relatedType = asset.nblOtherRelatedBusinessType;
  const areaBasis = relatedType ? AREA_LEGAL_BASIS[relatedType] : undefined;
  const reserveSizeLabel: string = RESERVE_SIZE_LABEL[asset.nblOtherReserveUnitSize] ?? "선택 안 함 (직접입력)";
  // NBL2611-V7-DM02·V9-DM11 — 호의 면적 외 요건(5호 나목 용도지역 · 13호 나지)도 엔진 술어를 그대로 쓴다.
  const hoFail = judgeHoRequirements(relatedType || undefined, { hasBuilding: asset.nblOtherHasBuilding }, asset.nblZoneType as ZoneType).failStep;

  // §168의11③3호 당해 연환산 preview — 엔진 헬퍼 단일 진실 (재구현 금지)
  const nblAcq = nblAcquisitionDateOf(asset); // 이월과세는 증여자 취득일 — 판정(④)과 같은 값
  const revenuePreview = useMemo(() => {
    if (!asset.nblRevenueBusinessType || !transferDate || !nblAcq) return undefined;
    const rawCurrent = parseFloat((asset.nblRevenueCurrentRevenue || "0").replace(/,/g, "")) || 0;
    if (rawCurrent <= 0) return undefined;
    const transferObj = parseISO(transferDate);
    const acqObj = parseISO(nblAcq);
    if (Number.isNaN(transferObj.getTime()) || Number.isNaN(acqObj.getTime())) return undefined;
    const startOverride = asset.nblRevenueCurrentBusinessStartDate
      ? parseISO(asset.nblRevenueCurrentBusinessStartDate)
      : undefined;
    const { days, taxYear } = deriveCurrentBusinessDays(
      transferObj,
      acqObj,
      startOverride && !Number.isNaN(startOverride.getTime()) ? startOverride : undefined,
    );
    const res = computeRevenueTest({
      businessType: asset.nblRevenueBusinessType as NblRevenueBusinessType,
      currentRevenue: rawCurrent,
      currentLandValue: parseFloat((asset.nblRevenueCurrentLandValue || "0").replace(/,/g, "")) || 0,
      currentBusinessDays: days,
      currentTaxYear: taxYear,
    });
    return {
      days,
      taxYear,
      yearDays: getDaysInYear(new Date(Date.UTC(taxYear, 0, 1))),
      annualized: res.annualizedCurrentRevenue,
      applied: res.annualizationApplied,
    };
  }, [
    asset.nblRevenueBusinessType,
    asset.nblRevenueCurrentRevenue,
    asset.nblRevenueCurrentLandValue,
    asset.nblRevenueCurrentBusinessStartDate,
    nblAcq,
    transferDate,
  ]);

  return (
    <div className="space-y-3">
      <SectionHeader
        title="나대지·잡종지 세부 정보"
        description="소득령 §168의11 기타 토지 판정"
        action={<LawArticleModal legalBasis="소득세법 시행령 §168의11①" label="§168의11① 기타토지" />}
      />

      <ToggleCard
        tone="amber"
        title="건축물(건물·시설물) 있음"
        description="건물 없으면 나대지 간주(종합합산). 건물 있으면 시가표준액 2% 비교 후 재산세 유형 적용 — 소득세법 §104의3①4호나목·지방세법 시행령 §101①2호나목"
        checked={asset.nblOtherHasBuilding}
        onCheckedChange={(c) => onAssetChange({ nblOtherHasBuilding: c })}
      />

      {/* NBL2611-V1-OL06 (Q-2 (가)) — 출처 안내 + 혼재 고지서 선택 안내. 판정 로직은 바꾸지 않는다. 라벨은 엔진과 같은 표다(V10-K). */}
      <FieldCard field="nblOtherPropertyTaxType" label="재산세 과세 분류" hint={NBL_PROPERTY_TAX_TYPE_SOURCE_HINT}>
        <Select
          value={asset.nblOtherPropertyTaxType ?? ""}
          onValueChange={(v) => v && onAssetChange({ nblOtherPropertyTaxType: v as PropertyTaxType })}
        >
          <SelectTrigger>
            <SelectValue>
              {asset.nblOtherPropertyTaxType ? PROPERTY_TAX_TYPE_LABEL[asset.nblOtherPropertyTaxType] : "선택 안 함"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="comprehensive">{PROPERTY_TAX_TYPE_LABEL.comprehensive}</SelectItem>
            <SelectItem value="separate">{PROPERTY_TAX_TYPE_LABEL.separate}</SelectItem>
            <SelectItem value="special_sum">{PROPERTY_TAX_TYPE_LABEL.special_sum}</SelectItem>
            <SelectItem value="exempt">{PROPERTY_TAX_TYPE_LABEL.exempt}</SelectItem>
          </SelectContent>
        </Select>
        <ToneCard tone="amber" className="mt-2">
          <p className="text-caption leading-snug" data-testid="nbl-other-tax-type-mixed-notice">
            {NBL_PROPERTY_TAX_TYPE_MIXED_NOTICE}
          </p>
        </ToneCard>
      </FieldCard>

      {asset.nblOtherHasBuilding && (
        <>
          {/* NBL2611-V10-OL11 — 법문 기준은 「시가표준액」(지방세법 시행령 §101①2호나목)이다. 「가액」은 시가·실거래가로 읽힌다. */}
          <FieldCard label="건축물 시가표준액" unit="원">
            <CurrencyInput
              label="건축물 시가표준액"
              hideLabel
              value={asset.nblOtherBuildingValue}
              onChange={(v) => onAssetChange({ nblOtherBuildingValue: v })}
              hideUnit
            />
          </FieldCard>

          <FieldCard label="부속토지 시가표준액" unit="원">
            <CurrencyInput
              label="부속토지 시가표준액"
              hideLabel
              value={asset.nblOtherLandValue}
              onChange={(v) => onAssetChange({ nblOtherLandValue: v })}
              hideUnit
            />
          </FieldCard>

          <FieldCard
            field="nblOtherBuildingFloorArea"
            label="건축물 바닥면적"
            unit="㎡"
            hint="건축물이 있으면 필수. 부속토지 배율 한도(지방세법 시행령 §101①2호) 판정에 쓰입니다. 건물 시가표준액이 토지 시가표준액의 2% 미만인 경우에는 이 바닥면적만 별도합산(사업용)으로 남고 나머지 부속토지는 종합합산으로 안분됩니다(같은 호 나목)."
          >
            <DecimalInput
              value={asset.nblOtherBuildingFloorArea}
              onChange={(v) => onAssetChange({ nblOtherBuildingFloorArea: v })}
            />
          </FieldCard>
        </>
      )}

      {/* §168의11① 호별 면적기준 정밀판정 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 dark:bg-sky-950/20 dark:border-sky-800 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-micro font-bold text-sky-800 select-none">1</span>
          <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">§168의11① 거주·사업관련 토지 (호별 면적기준)</p>
          <LawArticleModal legalBasis="소득세법 시행령 §168의11①" label="§168의11①" />
        </div>
        {/* NBL2611-Q-10 (나) — 구 이력의 「거주·사업 직접 관련」은 복원 시 꺼지고(호 없이 사업용으로 읽던 fallback 폐지) 호를 다시 골라야 한다. */}
        {asset.nblOtherLegacyRelatedReselect && (
          <ToneCard tone="amber" title="호를 다시 선택하세요 — 확인 필요">
            <p data-testid="nbl-other-legacy-related-notice" className="text-xs text-amber-800 dark:text-amber-200 leading-snug">
              저장된 이력에 「거주·사업 직접 관련」이 켜져 있었지만 §168의11① 어느 호인지 기록이 없어 이제 판정에 반영하지 않습니다(호를 모르면 혜택을 인정하지 않습니다).
              해당하는 호를 아래에서 선택하면 그 호의 기준면적으로 판정합니다.
            </p>
          </ToneCard>
        )}
        <RadioCardGroup
          name={`nblOtherRelatedBusinessType-${asset.assetId ?? "primary"}`}
          tone="sky"
          options={RELATED_BUSINESS_OPTIONS}
          value={asset.nblOtherRelatedBusinessType}
          onChange={(v) => onAssetChange({ nblOtherRelatedBusinessType: v, nblOtherLegacyRelatedReselect: false })}
        />

        {/* NBL2611-V7-DM02·V9-DM11 — 엔진이 호를 인정하지 않는 사실(5호 나목 용도지역 · 13호 나지)을 판정 전에 알린다. 문구는 엔진 단계 사유 그대로. */}
        {hoFail && (
          <ToneCard tone="amber" title="이 호는 인정되지 않습니다">
            <p data-testid="nbl-other-ho-fail-notice" className="text-xs text-amber-800 dark:text-amber-200 leading-snug">{hoFail.detail}</p>
          </ToneCard>
        )}

        {/* parking_attached — 기준면적 직접입력 (별표 자동산출 미지원) */}
        {relatedType === "parking_attached" && (
          <FieldCard
            field="nblOtherStandardAreaLimit"
            label="기준면적 (㎡)"
            unit="㎡"
            hint="「주차장법」 부설주차장 설치기준면적. 이 면적까지 사업용, 초과분 비사업용"
            trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}
          >
            <DecimalInput value={asset.nblOtherStandardAreaLimit} onChange={(v) => onAssetChange({ nblOtherStandardAreaLimit: v })} />
          </FieldCard>
        )}

        {/* F2 Phase B(B-3) — resort: 6호 휴양 §83의4⑫ 3요소 합산 */}
        {relatedType === "resort" && (
          <>
            <FieldCard field="nblOtherResortOutdoorArea" label="옥외 방목장·식물원 면적 (㎡)" unit="㎡" trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}>
              <DecimalInput value={asset.nblOtherResortOutdoorArea} onChange={(v) => onAssetChange({ nblOtherResortOutdoorArea: v })} />
            </FieldCard>
            <FieldCard field="nblOtherResortParkingStdArea" label="부설주차장 설치기준면적 (㎡)" unit="㎡" hint="§83의4⑫2호 — 「주차장법」 설치기준면적. 그 2배가 인정 상한입니다(상한 자체가 면적은 아닙니다).">
              <DecimalInput value={asset.nblOtherResortParkingStdArea} onChange={(v) => onAssetChange({ nblOtherResortParkingStdArea: v })} />
            </FieldCard>
            <FieldCard field="nblOtherResortParkingActualArea" label="실제 부설주차장용 토지 면적 (㎡)" unit="㎡" hint="설치기준면적을 입력했으면 필수. 인정 면적 = 실제 면적과 설치기준면적 × 2 중 작은 값.">
              <DecimalInput value={asset.nblOtherResortParkingActualArea} onChange={(v) => onAssetChange({ nblOtherResortParkingActualArea: v })} />
            </FieldCard>
            <FieldCard label="건축물 바닥면적 (㎡)" unit="㎡" hint="§83의4⑫3호 — 바닥면적 × 용도지역별 배율(지방세법 시행령 §101②)이 인정 상한입니다. 미매핑 용도지역(세분 전 주거지역 등)은 상한을 계산할 수 없어 아래 면적을 그대로 씁니다.">
              <DecimalInput value={asset.nblOtherResortBuildingFloorArea} onChange={(v) => onAssetChange({ nblOtherResortBuildingFloorArea: v })} />
            </FieldCard>
            <FieldCard field="nblOtherResortBuildingArea" label="실제 건축물 부속토지 면적 (㎡)" unit="㎡" hint="바닥면적을 입력했으면 필수. 인정 면적 = 실제 면적과 바닥면적 × 배율 중 작은 값. 배율 미매핑 용도지역이면 상한 이내로 확정한 면적을 입력하세요.">
              <DecimalInput value={asset.nblOtherResortBuildingArea} onChange={(v) => onAssetChange({ nblOtherResortBuildingArea: v })} />
            </FieldCard>
            {/*
              U2-02 (2026-09-02 코드리뷰) — 종전 조건은 `nblOtherResortBuildingFloorArea`를
              빠뜨린 3요소였다. 그래서 **바닥면적만 입력한 사용자**에게 직접입력 칸이 계속
              보였고, 거기 넣은 값은 엔진이 무시했다(3요소가 우선). ⑧ validate(:28)는 처음부터
              바닥면적을 포함한 4요소로 판정하고 있었으므로 **UI↔validate가 서로 반대**였다.
              ⇒ 게이트를 validate와 동일한 요소로 맞춘다(NBL2611-V9-DM09로 실제 부설주차장 면적이 늘어 5요소).
            */}
            {!(
              asset.nblOtherResortOutdoorArea ||
              asset.nblOtherResortParkingStdArea ||
              asset.nblOtherResortParkingActualArea ||
              asset.nblOtherResortBuildingArea ||
              asset.nblOtherResortBuildingFloorArea
            ) && (
              <FieldCard field="nblOtherStandardAreaLimit" label="기준면적 직접입력 (㎡)" unit="㎡" hint="위 3요소(옥외방목장·부설주차장·건축물)를 하나도 입력하지 않은 경우에만 사용합니다. 3요소 중 하나라도 입력하면 그 값이 우선하며 이 칸은 쓰이지 않습니다.">
                <DecimalInput value={asset.nblOtherStandardAreaLimit} onChange={(v) => onAssetChange({ nblOtherStandardAreaLimit: v })} />
              </FieldCard>
            )}
          </>
        )}

        {/* F2 Phase B — sports: 체육시설 유형(별표3/4/5) — 800줄 정책으로 분리 */}
        {relatedType === "sports" && <OtherLandSportsSection asset={asset} onAssetChange={onAssetChange} />}

        {/* F2 Phase A — reserve_forces: 별표6 부대규모·시설 자동 합산, 미선택 시 직접입력 */}
        {relatedType === "reserve_forces" && (
          <>
            <FieldCard field="nblOtherReserveUnitSize" label="부대편성인원 (별표6)" hint="부대규모·시설 선택 시 기준면적 자동 합산. 미선택 시 아래 직접입력." trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}>
              <Select
                value={asset.nblOtherReserveUnitSize || "__clear"}
                onValueChange={(v) => onAssetChange({ nblOtherReserveUnitSize: v && v !== "__clear" ? v : "" })}
              >
                <SelectTrigger><SelectValue>{reserveSizeLabel}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear">선택 안 함 (직접입력)</SelectItem>
                  {RESERVE_SIZE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldCard>
            {asset.nblOtherReserveUnitSize && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">포함 시설 (전술교육장에서 실시 불가 시에만 포함)</p>
                {RESERVE_FAC_OPTIONS.map((f) => (
                  <div key={f.value} data-testid={`nbl-other-reserve-fac-${f.value}`}>
                    <ToggleCard
                      variant="chip"
                      tone="sky"
                      title={f.label}
                      checked={asset.nblOtherReserveFacilities?.includes(f.value) ?? false}
                      onCheckedChange={(c) => {
                        const cur = asset.nblOtherReserveFacilities ?? [];
                        onAssetChange({ nblOtherReserveFacilities: c ? [...cur, f.value] : cur.filter((x) => x !== f.value) });
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
            {!(asset.nblOtherReserveUnitSize && (asset.nblOtherReserveFacilities?.length ?? 0) > 0) && (
              <FieldCard field="nblOtherStandardAreaLimit" label="기준면적 직접입력 (㎡)" unit="㎡">
                <DecimalInput value={asset.nblOtherStandardAreaLimit} onChange={(v) => onAssetChange({ nblOtherStandardAreaLimit: v })} />
              </FieldCard>
            )}
          </>
        )}

        {relatedType === "hatchang" && (
          <FieldCard field="nblOtherMaxAnnualArea" label="매년 최대 사용면적 (㎡)" unit="㎡" hint="이 면적의 120%까지 사업용, 초과분 비사업용" trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}>
            <DecimalInput value={asset.nblOtherMaxAnnualArea} onChange={(v) => onAssetChange({ nblOtherMaxAnnualArea: v })} />
          </FieldCard>
        )}

        {relatedType === "youth_training" && (
          <FieldCard field="nblOtherYouthCapacity" label="수용정원 (명)" unit="명" hint="수용정원 × 200㎡까지 사업용, 초과분 비사업용" trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}>
            <DecimalInput value={asset.nblOtherYouthCapacity} onChange={(v) => onAssetChange({ nblOtherYouthCapacity: v })} />
          </FieldCard>
        )}

        {relatedType === "parking_garage" && (
          <FieldCard field="nblOtherMinGarageArea" label="최저차고기준면적 (㎡)" unit="㎡" hint="최저차고기준면적 × 1.5까지 사업용, 초과분 비사업용" trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}>
            <DecimalInput value={asset.nblOtherMinGarageArea} onChange={(v) => onAssetChange({ nblOtherMinGarageArea: v })} />
          </FieldCard>
        )}

        {relatedType === "vacant_lot_1household" && (
          <div className="rounded-md bg-sky-100/60 border border-sky-200 dark:bg-sky-950/40 dark:border-sky-800 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
            무주택1세대 1필지 나지는 660㎡ 이내까지 사업용으로 보며, 초과분은 비사업용입니다 (별도 면적 입력 불필요).
          </div>
        )}
      </div>

      {/* §168의11⑤ 연접 다필지 취득시기순 안분 */}
      <OtherLandParcelSection asset={asset} onAssetChange={onAssetChange} />

      {/* 공장용 건축물 부속토지 기준면적 (§102①1호 별표6 / §101①1호) — 800줄 정책으로 분리 */}
      <FactoryLandSection asset={asset} onAssetChange={onAssetChange} transferDate={transferDate} />

      {/* §168의11⑥ 복합용도 건축물 부속토지 안분 (건축물 존재 시) */}
      {asset.nblOtherHasBuilding && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-800 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">§168의11⑥ 복합용도 건축물 부속토지 안분</p>
            <LawArticleModal legalBasis="소득세법 시행령 §168의11⑥" label="§168의11⑥" />
          </div>
          <p className="text-caption text-muted-foreground leading-snug">
            건축물이 거주·특정사업 사용분(특정용도분)과 그 외로 함께 사용될 때, 특정용도분 부속토지만 사업용으로 보고 안분합니다. 선택 시 위 호별 기준면적(§168의11①)은 적용하지 않습니다.
          </p>
          <RadioCardGroup
            name={`nblOtherMixedUseMode-${asset.assetId ?? "primary"}`}
            tone="emerald"
            options={MIXED_USE_MODE_OPTIONS}
            value={asset.nblOtherMixedUseMode}
            onChange={(v) => onAssetChange({ nblOtherMixedUseMode: v })}
          />
          {asset.nblOtherMixedUseMode === "single_building" && (
            <>
              <FieldCard field="nblOtherMixedUseSpecificFloorArea" label="특정용도분 연면적 (㎡)" unit="㎡" hint="안분 분자">
                <DecimalInput value={asset.nblOtherMixedUseSpecificFloorArea} onChange={(v) => onAssetChange({ nblOtherMixedUseSpecificFloorArea: v })} />
              </FieldCard>
              <FieldCard field="nblOtherMixedUseTotalFloorArea" label="건축물 전체 연면적 (㎡)" unit="㎡" hint="안분 분모">
                <DecimalInput value={asset.nblOtherMixedUseTotalFloorArea} onChange={(v) => onAssetChange({ nblOtherMixedUseTotalFloorArea: v })} />
              </FieldCard>
            </>
          )}
          {asset.nblOtherMixedUseMode === "multiple_buildings" && (
            <>
              <FieldCard field="nblOtherMixedUseSpecificFootprint" label="특정용도분 바닥면적 (㎡)" unit="㎡" hint="안분 분자">
                <DecimalInput value={asset.nblOtherMixedUseSpecificFootprint} onChange={(v) => onAssetChange({ nblOtherMixedUseSpecificFootprint: v })} />
              </FieldCard>
              <FieldCard field="nblOtherMixedUseTotalFootprint" label="다수 건축물 전체 바닥면적 (㎡)" unit="㎡" hint="동일 경계 안 전체 — 안분 분모">
                <DecimalInput value={asset.nblOtherMixedUseTotalFootprint} onChange={(v) => onAssetChange({ nblOtherMixedUseTotalFootprint: v })} />
              </FieldCard>
            </>
          )}
        </div>
      )}

      {/* §168의11② 수입금액비율 (특정 업종 한정) */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 dark:bg-violet-950/20 dark:border-violet-800 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">§168의11② 수입금액비율 (해당 업종만)</p>
          <LawArticleModal legalBasis="소득세법 시행령 §168의11②" label="§168의11②" />
        </div>
        <FieldCard label="업종" hint="주차장운영·광천지·양어장·제조·학원·도소매 등 특정 업종만 수입금액비율로 사업용 판정. 체육·청소년·휴양시설은 면적기준(해당 없음)">
          <Select
            value={asset.nblRevenueBusinessType || "none"}
            onValueChange={(v) =>
              onAssetChange({ nblRevenueBusinessType: (v === "none" ? "" : v) as AssetForm["nblRevenueBusinessType"] })
            }
          >
            <SelectTrigger>
              <SelectValue>{REVENUE_BIZ_LABEL[asset.nblRevenueBusinessType || "none"]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">해당 없음</SelectItem>
              <SelectItem value="parking_operation">주차장운영업 (3%)</SelectItem>
              <SelectItem value="mineral_spring">광천지 (4%)</SelectItem>
              <SelectItem value="fish_farm_other">양어장·지소 기타 (4%)</SelectItem>
              <SelectItem value="block_stone_pipe_mfg">블록·석물·토관 제조 (20%)</SelectItem>
              <SelectItem value="landscaping_floriculture">조경식재·화훼판매 (7%)</SelectItem>
              <SelectItem value="vehicle_repair_academy">자동차·중장비 정비/운전 학원 (10%)</SelectItem>
              <SelectItem value="agriculture_academy">농업 학원 (7%)</SelectItem>
              <SelectItem value="wholesale_retail">도소매업 (10%)</SelectItem>
            </SelectContent>
          </Select>
        </FieldCard>

        {asset.nblRevenueBusinessType && (
          <div className="space-y-2">
            <FieldCard field="nblRevenueCurrentRevenue" label="당해 과세기간 수입금액" unit="원" hint="해당 기간 중 실제 수입금액(연환산 전). 양도일까지 1과세기간 미만 영위 시 아래에서 1년으로 환산됩니다.">
              <CurrencyInput label="당해 수입금액" hideLabel hideUnit value={asset.nblRevenueCurrentRevenue} onChange={(v) => onAssetChange({ nblRevenueCurrentRevenue: v })} />
            </FieldCard>

            {/* §168의11③3호 당해 연환산 — 사업개시일(선택) + 영위일수·환산 preview */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">연</span>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">당해 과세기간 연환산 (§168의11③3호)</p>
                <LawArticleModal legalBasis="소득세법 시행령 §168의11③" label="§168의11③" />
              </div>
              <FieldCard label="당해 사업개시일" hint="당해연도 중 사업을 개시한 경우만 입력. 미입력 시 과세기간개시일(1.1) 또는 당해연도 취득일을 기산일로 자동 적용.">
                <DateInput value={asset.nblRevenueCurrentBusinessStartDate} onChange={(v) => onAssetChange({ nblRevenueCurrentBusinessStartDate: v })} />
              </FieldCard>
              {revenuePreview ? (
                revenuePreview.applied ? (
                  <div className="rounded-md bg-amber-100/60 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 space-y-0.5">
                    <p>
                      영위{" "}
                      <Frac
                        top={`${revenuePreview.days}일`}
                        bottom={`${revenuePreview.taxYear}년 ${revenuePreview.yearDays}일`}
                      />{" "}
                      환산
                    </p>
                    <p className="font-semibold">연간환산 수입금액 = {revenuePreview.annualized.toLocaleString()}원</p>
                  </div>
                ) : (
                  <p className="text-caption text-amber-700 dark:text-amber-300/80">영위 {revenuePreview.days}일 = {revenuePreview.taxYear}년 총일수 → 환산 없음(raw 그대로)</p>
                )
              ) : (
                <p className="text-caption text-muted-foreground">당해 수입금액·양도일·취득일 입력 시 연환산 금액이 표시됩니다.</p>
              )}
            </div>
            <NblLandValueAutoFetchButton
              jibun={asset.addressJibun}
              area={parseFloat(asset.acquisitionArea || "0") || 0}
              ratio={getOwnershipRatio(asset)}
              transferDate={transferDate ?? ""}
              onResult={(cur, prior) =>
                onAssetChange({ nblRevenueCurrentLandValue: cur, nblRevenuePriorLandValue: prior })
              }
            />
            <FieldCard field="nblRevenueCurrentLandValue" label="당해 토지가액 (양도일 기준시가)" unit="원">
              <CurrencyInput label="당해 토지가액" hideLabel hideUnit value={asset.nblRevenueCurrentLandValue} onChange={(v) => onAssetChange({ nblRevenueCurrentLandValue: v })} />
            </FieldCard>
            <FieldCard label="직전 과세기간 수입금액" unit="원" hint="입력 시 (당해+직전) 합산비율과 비교해 큰 값 적용 (§168의11②)">
              <CurrencyInput label="직전 수입금액" hideLabel hideUnit value={asset.nblRevenuePriorRevenue} onChange={(v) => onAssetChange({ nblRevenuePriorRevenue: v })} />
            </FieldCard>
            <FieldCard label="직전 과세기간 영위일수" unit="일" hint="직전연도 중 사업을 개시·폐업하여 영위기간이 1년 미만인 경우만 입력. 미입력 시 직전 수입금액은 연환산하지 않습니다 (§168의11③3호).">
              <DecimalInput value={asset.nblRevenuePriorBusinessDays} onChange={(v) => onAssetChange({ nblRevenuePriorBusinessDays: v })} />
            </FieldCard>
            <FieldCard field="nblRevenuePriorLandValue" label="직전 토지가액" unit="원" hint="직전 수입금액을 입력했으면 필수입니다 — 없으면 (당해+직전) 합산비율②가 계산되지 않습니다.">
              <CurrencyInput label="직전 토지가액" hideLabel hideUnit value={asset.nblRevenuePriorLandValue} onChange={(v) => onAssetChange({ nblRevenuePriorLandValue: v })} />
            </FieldCard>

            {/* §168의11③1호 간주임대료 — 전세금·보증금 (부가세령 §65①·시행규칙 §47) */}
            <div className="rounded-lg border border-violet-200 bg-violet-50/40 dark:bg-violet-950/20 dark:border-violet-800 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-micro font-bold text-violet-800 select-none">임</span>
                <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">전세금·보증금 간주임대료 (§168의11③1호)</p>
                <LawArticleModal legalBasis="부가가치세법 시행령 §65①" label="간주임대료" />
              </div>
              <p className="text-caption text-muted-foreground leading-snug">전세·임대보증금이 있으면 정기예금이자율(부가세칙 §47, 현행 연 3.1%)로 환산한 간주임대료를 수입금액에 합산합니다. 입력 시에만 적용.</p>
              <FieldCard label="당해 전세금·보증금" unit="원">
                <CurrencyInput label="당해 보증금" hideLabel hideUnit value={asset.nblRevenueCurrentDeposit} onChange={(v) => onAssetChange({ nblRevenueCurrentDeposit: v })} />
              </FieldCard>
              <FieldCard label="당해 임대 과세대상기간" unit="일" hint="해당 보증금의 임대 일수. 미입력 시 간주임대료 미적용.">
                <DecimalInput value={asset.nblRevenueCurrentRentDays} onChange={(v) => onAssetChange({ nblRevenueCurrentRentDays: v })} />
              </FieldCard>
              <FieldCard label="직전 전세금·보증금" unit="원">
                <CurrencyInput label="직전 보증금" hideLabel hideUnit value={asset.nblRevenuePriorDeposit} onChange={(v) => onAssetChange({ nblRevenuePriorDeposit: v })} />
              </FieldCard>
              <FieldCard label="직전 임대 과세대상기간" unit="일">
                <DecimalInput value={asset.nblRevenuePriorRentDays} onChange={(v) => onAssetChange({ nblRevenuePriorRentDays: v })} />
              </FieldCard>
            </div>

            {/* §168의11③2호 공통수입 안분 */}
            <ToggleCard
              tone="violet"
              title="공통수입 안분 (§168의11③2호)"
              description="당해 토지와 그 밖의 토지에 공통으로 관련된 수입금액의 실지귀속을 구분할 수 없을 때, 토지가액 비율로 안분해 합산합니다."
              checked={asset.nblRevenueCommonApportion}
              onCheckedChange={(c) => onAssetChange({ nblRevenueCommonApportion: c })}
            >
              <FieldCard field="nblRevenueCommonRevenue" label="당해 공통수입금액" unit="원">
                <CurrencyInput label="당해 공통수입금액" hideLabel hideUnit value={asset.nblRevenueCommonRevenue} onChange={(v) => onAssetChange({ nblRevenueCommonRevenue: v })} />
              </FieldCard>
              <FieldCard field="nblRevenueOtherLandValue" label="당해 그 밖의 토지가액" unit="원" hint="안분 분모 = 당해 토지가액 + 그 밖의 토지가액">
                <CurrencyInput label="당해 그 밖의 토지가액" hideLabel hideUnit value={asset.nblRevenueOtherLandValue} onChange={(v) => onAssetChange({ nblRevenueOtherLandValue: v })} />
              </FieldCard>
              <FieldCard field="nblRevenuePriorCommonRevenue" label="직전 공통수입금액" unit="원" hint="직전 과세기간도 공통수입이 있으면 입력(선택). 공통수입금액·그 밖의 토지가액을 함께 입력.">
                <CurrencyInput label="직전 공통수입금액" hideLabel hideUnit value={asset.nblRevenuePriorCommonRevenue} onChange={(v) => onAssetChange({ nblRevenuePriorCommonRevenue: v })} />
              </FieldCard>
              <FieldCard field="nblRevenuePriorOtherLandValue" label="직전 그 밖의 토지가액" unit="원">
                <CurrencyInput label="직전 그 밖의 토지가액" hideLabel hideUnit value={asset.nblRevenuePriorOtherLandValue} onChange={(v) => onAssetChange({ nblRevenuePriorOtherLandValue: v })} />
              </FieldCard>
            </ToggleCard>
          </div>
        )}
      </div>

      {isLikelyBareground && (
        <div className="rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 space-y-1">
          <p>건축물 시가표준액이 부속토지 시가표준액의 2% 미만 — 건축물 바닥면적분 토지는 별도합산(사업용) 유지, 그 외 부속토지만 별도합산에서 제외(종합합산)되어 비사업용으로 부분 안분됩니다. 위 &ldquo;건축물 바닥면적&rdquo;을 입력하면 안분이 반영됩니다.</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <LawArticleModal legalBasis="소득세법 §104의3 ① 4호 나목" label="§104의3①4호나목" />
            <LawArticleModal legalBasis="지방세법 시행령 §101 ① 2호 나목" label="지방세법시행령 §101①2호나목" />
          </div>
        </div>
      )}

      <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground space-y-1">
        <p>건축물 시가표준액이 부속토지 시가표준액의 2% 미만이면 건축물 바닥면적분 토지는 별도합산(사업용) 유지, 그 외 부속토지만 종합합산되어 비사업용으로 부분 안분됩니다(바닥면적 미입력 시 전량 비사업용).</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 §104의3 ① 4호 나목" label="§104의3①4호나목" />
          <LawArticleModal legalBasis="지방세법 시행령 §101 ① 2호 나목" label="지방세법시행령 §101①2호나목" />
        </div>
      </div>
    </div>
  );
}
