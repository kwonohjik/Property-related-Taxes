"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { OtherLandParcelSection } from "./OtherLandParcelSection";
import { FactoryLandSection } from "./FactoryLandSection";
import { NblLandValueAutoFetchButton } from "./NblLandAutoFetch";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { useMemo } from "react";
import { parseISO, getDaysInYear } from "date-fns";
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
  { value: "sports", label: "체육시설 (1호)", description: "선수전용·종업원 체육시설 — 별표3·4·5 기준면적 직접입력", testId: "nbl-other-related-sports" },
  { value: "youth_training", label: "청소년수련시설 (4호)", description: "수용정원 × 200㎡까지 사업용", testId: "nbl-other-related-youth_training" },
  { value: "reserve_forces", label: "예비군훈련시설 (5호 다목)", description: "별표6 제2호 기준면적 직접입력", testId: "nbl-other-related-reserve_forces" },
  { value: "resort", label: "휴양시설업 (6호)", description: "휴양시설업 합산 기준면적 직접입력", testId: "nbl-other-related-resort" },
  { value: "hatchang", label: "하치장·야적장·적치장 (7호)", description: "매년 최대 사용면적 × 120%까지 사업용", testId: "nbl-other-related-hatchang" },
  { value: "vacant_lot_1household", label: "무주택1세대 1필지 나지 (13호)", description: "660㎡ 이내까지 사업용 (고정)", testId: "nbl-other-related-vacant_lot" },
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
  { value: "single_building", label: "하나의 건축물 복합용도 (⑥1호)", description: "한 건물 일부만 거주·특정사업 사용 → 특정용도분 연면적 ÷ 건축물 연면적 비율로 부속토지 안분", testId: "nbl-other-mixed-single" },
  { value: "multiple_buildings", label: "동일경계 다수 건축물 (⑥2호)", description: "여러 건물 중 일부만 거주·특정사업 사용 → 특정용도분 바닥면적 ÷ 전체 바닥면적 비율로 부속토지 안분", testId: "nbl-other-mixed-multiple" },
];

// F2 Phase A/B — 체육시설 종목(실외 11 + 실내 3). 유형별 기준면적(별표3 직장 / 별표4 운동경기업)은 자동 산출 — 라벨은 종목명만.
const SPORTS_FACILITY_OPTIONS = [
  { value: "soccer", label: "축구장" },
  { value: "baseball", label: "야구장" },
  { value: "rugby", label: "럭비장" },
  { value: "field_hockey", label: "필드하키장" },
  { value: "tennis", label: "테니스장" },
  { value: "soft_tennis", label: "연식정구장" },
  { value: "american_football", label: "미식축구장" },
  { value: "equestrian", label: "승마장" },
  { value: "shooting", label: "사격장" },
  { value: "archery", label: "궁도장" },
  { value: "other_outdoor", label: "기타 실외" },
  { value: "ball_court", label: "실내 구기·격투·체조 등" },
  { value: "swimming", label: "수영·수구·다이빙" },
  { value: "ice_rink", label: "아이스하키·피겨·롤러" },
] as const;
const SPORTS_FACILITY_LABEL: Record<string, string> = Object.fromEntries(SPORTS_FACILITY_OPTIONS.map((o) => [o.value, o.label]));

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

// F2 Phase B — 체육시설 유형(별표3 직장운동경기부 / 별표4 운동경기업 / 별표5 종업원)
const SPORTS_CATEGORY_OPTIONS: RadioCardOption<"workplace" | "business" | "employee">[] = [
  { value: "workplace", label: "직장운동경기부 (별표3)", description: "선수전용 — §83의4①", testId: "nbl-other-sports-category-workplace" },
  { value: "business", label: "운동경기업 (별표4)", description: "선수전용 — §83의4③", testId: "nbl-other-sports-category-business" },
  { value: "employee", label: "종업원 (별표5)", description: "종업원수 기준 — §83의4④", testId: "nbl-other-sports-category-employee" },
];
const EMPLOYEE_FACILITY_OPTIONS = [
  { value: "field", label: "운동장" },
  { value: "court", label: "코트" },
  { value: "indoor", label: "실내체육시설" },
] as const;
const SPORTS_CATEGORY_BASIS: Record<string, { legalBasis: string; label: string }> = {
  workplace: { legalBasis: "소득세법 시행규칙 §83의4①", label: "§83의4①(별표3)" },
  business: { legalBasis: "소득세법 시행규칙 §83의4③", label: "§83의4③(별표4)" },
  employee: { legalBasis: "소득세법 시행규칙 §83의4④", label: "§83의4④(별표5)" },
};

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
  const sportsFacilityLabel: string = SPORTS_FACILITY_LABEL[asset.nblOtherSportsFacilityType] ?? "선택 안 함 (직접입력)";
  const reserveSizeLabel: string = RESERVE_SIZE_LABEL[asset.nblOtherReserveUnitSize] ?? "선택 안 함 (직접입력)";
  const sportsCategory = (asset.nblOtherSportsCategory || "workplace") as "workplace" | "business" | "employee";
  const sportsBasis = SPORTS_CATEGORY_BASIS[sportsCategory];

  // §168의11③3호 당해 연환산 preview — 엔진 헬퍼 단일 진실 (재구현 금지)
  const revenuePreview = useMemo(() => {
    if (!asset.nblRevenueBusinessType || !transferDate || !asset.acquisitionDate) return undefined;
    const rawCurrent = parseFloat((asset.nblRevenueCurrentRevenue || "0").replace(/,/g, "")) || 0;
    if (rawCurrent <= 0) return undefined;
    const transferObj = parseISO(transferDate);
    const acqObj = parseISO(asset.acquisitionDate);
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
      yearDays: getDaysInYear(new Date(taxYear, 0, 1)),
      annualized: res.annualizedCurrentRevenue,
      applied: res.annualizationApplied,
    };
  }, [
    asset.nblRevenueBusinessType,
    asset.nblRevenueCurrentRevenue,
    asset.nblRevenueCurrentLandValue,
    asset.nblRevenueCurrentBusinessStartDate,
    asset.acquisitionDate,
    transferDate,
  ]);

  return (
    <div className="space-y-3">
      <SectionHeader
        title="나대지·잡종지 세부 정보"
        description="§168-11 기타 토지 판정"
        action={<LawArticleModal legalBasis="소득세법 시행령 §168의11①" label="§168의11① 기타토지" />}
      />

      <ToggleCard
        tone="amber"
        title="건축물(건물·시설물) 있음"
        description="건물 없으면 나대지 간주(종합합산). 건물 있으면 시가표준액 2% 비교 후 재산세 유형 적용 — 소득세법 §104의3①4호나목·지방세법 시행령 §101①2호나목"
        checked={asset.nblOtherHasBuilding}
        onCheckedChange={(c) => onAssetChange({ nblOtherHasBuilding: c })}
      />

      <FieldCard label="재산세 과세 분류">
        <Select
          value={asset.nblOtherPropertyTaxType ?? ""}
          onValueChange={(v) => v && onAssetChange({ nblOtherPropertyTaxType: v as PropertyTaxType })}
        >
          <SelectTrigger>
            <SelectValue>
              {asset.nblOtherPropertyTaxType === "comprehensive" ? "종합합산"
                : asset.nblOtherPropertyTaxType === "separate" ? "별도합산"
                : asset.nblOtherPropertyTaxType === "special_sum" ? "분리과세"
                : asset.nblOtherPropertyTaxType === "exempt" ? "비과세·면제"
                : "선택 안 함"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="comprehensive">종합합산</SelectItem>
            <SelectItem value="separate">별도합산</SelectItem>
            <SelectItem value="special_sum">분리과세</SelectItem>
            <SelectItem value="exempt">비과세·면제</SelectItem>
          </SelectContent>
        </Select>
      </FieldCard>

      {asset.nblOtherHasBuilding && (
        <>
          <FieldCard label="건물가액" unit="원">
            <CurrencyInput
              label="건물가액"
              hideLabel
              value={asset.nblOtherBuildingValue}
              onChange={(v) => onAssetChange({ nblOtherBuildingValue: v })}
              hideUnit
            />
          </FieldCard>

          <FieldCard label="토지가액" unit="원">
            <CurrencyInput
              label="토지가액"
              hideLabel
              value={asset.nblOtherLandValue}
              onChange={(v) => onAssetChange({ nblOtherLandValue: v })}
              hideUnit
            />
          </FieldCard>

          <FieldCard
            label="건축물 바닥면적"
            unit="㎡"
            hint="건물 시가표준액이 토지 시가표준액의 2% 미만이면 이 바닥면적만 별도합산(사업용) 유지, 나머지 부속토지는 종합합산(비사업용)으로 부분 안분 — 지방세법 시행령 §101①2호나목"
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
        <RadioCardGroup
          name="nblOtherRelatedBusinessType"
          tone="sky"
          options={RELATED_BUSINESS_OPTIONS}
          value={asset.nblOtherRelatedBusinessType}
          onChange={(v) => onAssetChange({ nblOtherRelatedBusinessType: v })}
        />

        {/* parking_attached — 기준면적 직접입력 (별표 자동산출 미지원) */}
        {relatedType === "parking_attached" && (
          <FieldCard
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
            <FieldCard label="옥외 방목장·식물원 면적 (㎡)" unit="㎡" hint="§83의4⑫1호 — 옥외 동물방목장·식물원 토지 면적" trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}>
              <DecimalInput value={asset.nblOtherResortOutdoorArea} onChange={(v) => onAssetChange({ nblOtherResortOutdoorArea: v })} />
            </FieldCard>
            <FieldCard label="부설주차장 설치기준면적 (㎡)" unit="㎡" hint="§83의4⑫2호 — 「주차장법」 설치기준면적. 엔진이 ×2(2배 이내) 적용">
              <DecimalInput value={asset.nblOtherResortParkingStdArea} onChange={(v) => onAssetChange({ nblOtherResortParkingStdArea: v })} />
            </FieldCard>
            <FieldCard label="건축물 바닥면적 (㎡)" unit="㎡" hint="§83의4⑫3호 — 바닥면적 × 용도지역별 배율(지방세법 시행령 §101②) 자동 산출. 미매핑 용도지역(세분 전 주거지역 등)은 아래 직접입력.">
              <DecimalInput value={asset.nblOtherResortBuildingFloorArea} onChange={(v) => onAssetChange({ nblOtherResortBuildingFloorArea: v })} />
            </FieldCard>
            <FieldCard label="(또는) 건축물 부속토지 직접입력 (㎡)" unit="㎡" hint="용도지역별 배율 미매핑 시 배율 적용 후 부속토지 면적을 직접 입력">
              <DecimalInput value={asset.nblOtherResortBuildingArea} onChange={(v) => onAssetChange({ nblOtherResortBuildingArea: v })} />
            </FieldCard>
            {/*
              U2-02 (2026-09-02 코드리뷰) — 종전 조건은 `nblOtherResortBuildingFloorArea`를
              빠뜨린 3요소였다. 그래서 **바닥면적만 입력한 사용자**에게 직접입력 칸이 계속
              보였고, 거기 넣은 값은 엔진이 무시했다(3요소가 우선). ⑧ validate(:28)는 처음부터
              바닥면적을 포함한 4요소로 판정하고 있었으므로 **UI↔validate가 서로 반대**였다.
              ⇒ 게이트를 validate와 동일한 4요소로 맞춘다.
            */}
            {!(
              asset.nblOtherResortOutdoorArea ||
              asset.nblOtherResortParkingStdArea ||
              asset.nblOtherResortBuildingArea ||
              asset.nblOtherResortBuildingFloorArea
            ) && (
              <FieldCard label="기준면적 직접입력 (㎡)" unit="㎡" hint="위 3요소(옥외방목장·부설주차장·건축물)를 하나도 입력하지 않은 경우에만 사용합니다. 3요소 중 하나라도 입력하면 그 값이 우선하며 이 칸은 쓰이지 않습니다.">
                <DecimalInput value={asset.nblOtherStandardAreaLimit} onChange={(v) => onAssetChange({ nblOtherStandardAreaLimit: v })} />
              </FieldCard>
            )}
          </>
        )}

        {/* F2 Phase B — sports: 체육시설 유형(별표3/4/5) → 종목 lookup 또는 종업원수 선형보간 */}
        {relatedType === "sports" && (
          <>
            <FieldCard label="체육시설 유형">
              <RadioCardGroup
                name="nblOtherSportsCategory"
                tone="sky"
                layout="inline"
                options={SPORTS_CATEGORY_OPTIONS}
                value={sportsCategory}
                onChange={(v) => onAssetChange({ nblOtherSportsCategory: v })}
              />
            </FieldCard>

            {/* workplace(별표3) · business(별표4) — 종목 선택 */}
            {sportsCategory !== "employee" && (
              <>
                <FieldCard label="체육시설 종목" hint="유형(직장 별표3 / 운동경기업 별표4)에 따라 기준면적 자동 산출. 미선택 시 아래 직접입력." trailing={sportsBasis && <LawArticleModal legalBasis={sportsBasis.legalBasis} label={sportsBasis.label} />}>
                  <Select
                    value={asset.nblOtherSportsFacilityType || "__clear"}
                    onValueChange={(v) => onAssetChange({ nblOtherSportsFacilityType: v && v !== "__clear" ? v : "" })}
                  >
                    <SelectTrigger><SelectValue>{sportsFacilityLabel}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__clear">선택 안 함 (직접입력)</SelectItem>
                      {SPORTS_FACILITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FieldCard>
                {/* B-2 종목합산 — 추가 보유 종목(각 면적 합산, 5종목군은 그 중 1개만) */}
                {asset.nblOtherSportsFacilityType && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">추가 보유 종목 (각 면적 합산 — 축구·야구·럭비·필드하키·미식축구는 그 중 가장 넓은 1개만)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {SPORTS_FACILITY_OPTIONS.filter((o) => o.value !== asset.nblOtherSportsFacilityType).map((o) => (
                        <div key={o.value} data-testid={`nbl-other-sports-extra-${o.value}`}>
                          <ToggleCard
                            variant="chip"
                            tone="sky"
                            title={o.label}
                            checked={asset.nblOtherSportsExtraEvents?.includes(o.value) ?? false}
                            onCheckedChange={(c) => {
                              const cur = asset.nblOtherSportsExtraEvents ?? [];
                              onAssetChange({ nblOtherSportsExtraEvents: c ? [...cur, o.value] : cur.filter((x) => x !== o.value) });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* B-2 선수가산 — 테니스·연식정구 */}
                {(asset.nblOtherSportsFacilityType === "tennis" || asset.nblOtherSportsFacilityType === "soft_tennis") && (
                  <FieldCard label="선수 수 (명)" unit="명" hint={`2인 초과 시 2인마다 ${sportsCategory === "business" ? "725" : "483"}㎡ 가산 (별표 비고)`}>
                    <DecimalInput value={asset.nblOtherSportsPlayerCount} onChange={(v) => onAssetChange({ nblOtherSportsPlayerCount: v })} />
                  </FieldCard>
                )}
                {/* B-2 실내 부속토지 — 실내 종목 바닥면적 × 배율 (비고1·3) */}
                {["ball_court", "swimming", "ice_rink"].includes(asset.nblOtherSportsFacilityType) && (
                  <FieldCard label="실내 시설 바닥면적 (㎡)" unit="㎡" hint="별표 비고1·3 — 바닥면적 × 용도지역별 배율(지방세법 시행령 §101②) 자동 산출. 미입력 시 표값 기준면적 적용.">
                    <DecimalInput value={asset.nblOtherIndoorFloorArea} onChange={(v) => onAssetChange({ nblOtherIndoorFloorArea: v })} />
                  </FieldCard>
                )}
                {/* B-2 실내 미설치 — workplace 실내 종목 (별표3 비고4) */}
                {sportsCategory === "workplace" && ["ball_court", "swimming", "ice_rink"].includes(asset.nblOtherSportsFacilityType) && (
                  <div data-testid="nbl-other-indoor-not-installed">
                    <ToggleCard
                      variant="card"
                      tone="amber"
                      title="실내체육시설 미설치"
                      description="실내 운동경기부가 실내체육시설을 설치하지 않은 경우 → 800㎡ (별표3 비고4)"
                      checked={asset.nblOtherIndoorNotInstalled}
                      onCheckedChange={(c) => onAssetChange({ nblOtherIndoorNotInstalled: c })}
                    />
                  </div>
                )}
                {!asset.nblOtherSportsFacilityType && (
                  <FieldCard label="기준면적 직접입력 (㎡)" unit="㎡">
                    <DecimalInput value={asset.nblOtherStandardAreaLimit} onChange={(v) => onAssetChange({ nblOtherStandardAreaLimit: v })} />
                  </FieldCard>
                )}
              </>
            )}

            {/* employee(별표5) — 종업원수 + 보유 시설 다중 */}
            {sportsCategory === "employee" && (
              <>
                <FieldCard label="종업원 수 (명)" unit="명" hint="별표5 종업원수 구간 기준면적 자동 산출(50인 이하는 코트면적만). 미입력 시 아래 직접입력." trailing={sportsBasis && <LawArticleModal legalBasis={sportsBasis.legalBasis} label={sportsBasis.label} />}>
                  <DecimalInput value={asset.nblOtherEmployeeCount} onChange={(v) => onAssetChange({ nblOtherEmployeeCount: v })} />
                </FieldCard>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">보유 시설 (다중 — 각 기준면적 합산)</p>
                  {EMPLOYEE_FACILITY_OPTIONS.map((f) => (
                    <div key={f.value} data-testid={`nbl-other-employee-kind-${f.value}`}>
                      <ToggleCard
                        variant="chip"
                        tone="sky"
                        title={f.label}
                        checked={asset.nblOtherEmployeeFacilityKinds?.includes(f.value) ?? false}
                        onCheckedChange={(c) => {
                          const cur = asset.nblOtherEmployeeFacilityKinds ?? [];
                          onAssetChange({ nblOtherEmployeeFacilityKinds: c ? [...cur, f.value] : cur.filter((x) => x !== f.value) });
                        }}
                      />
                    </div>
                  ))}
                </div>
                {!(asset.nblOtherEmployeeCount && (asset.nblOtherEmployeeFacilityKinds?.length ?? 0) > 0) && (
                  <FieldCard label="기준면적 직접입력 (㎡)" unit="㎡">
                    <DecimalInput value={asset.nblOtherStandardAreaLimit} onChange={(v) => onAssetChange({ nblOtherStandardAreaLimit: v })} />
                  </FieldCard>
                )}
              </>
            )}
          </>
        )}

        {/* F2 Phase A — reserve_forces: 별표6 부대규모·시설 자동 합산, 미선택 시 직접입력 */}
        {relatedType === "reserve_forces" && (
          <>
            <FieldCard label="부대편성인원 (별표6)" hint="부대규모·시설 선택 시 기준면적 자동 합산. 미선택 시 아래 직접입력." trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}>
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
              <FieldCard label="기준면적 직접입력 (㎡)" unit="㎡">
                <DecimalInput value={asset.nblOtherStandardAreaLimit} onChange={(v) => onAssetChange({ nblOtherStandardAreaLimit: v })} />
              </FieldCard>
            )}
          </>
        )}

        {relatedType === "hatchang" && (
          <FieldCard label="매년 최대 사용면적 (㎡)" unit="㎡" hint="이 면적의 120%까지 사업용, 초과분 비사업용" trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}>
            <DecimalInput value={asset.nblOtherMaxAnnualArea} onChange={(v) => onAssetChange({ nblOtherMaxAnnualArea: v })} />
          </FieldCard>
        )}

        {relatedType === "youth_training" && (
          <FieldCard label="수용정원 (명)" unit="명" hint="수용정원 × 200㎡까지 사업용, 초과분 비사업용" trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}>
            <DecimalInput value={asset.nblOtherYouthCapacity} onChange={(v) => onAssetChange({ nblOtherYouthCapacity: v })} />
          </FieldCard>
        )}

        {relatedType === "parking_garage" && (
          <FieldCard label="최저차고기준면적 (㎡)" unit="㎡" hint="최저차고기준면적 × 1.5까지 사업용, 초과분 비사업용" trailing={areaBasis && <LawArticleModal legalBasis={areaBasis.legalBasis} label={areaBasis.label} />}>
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
            name="nblOtherMixedUseMode"
            tone="emerald"
            options={MIXED_USE_MODE_OPTIONS}
            value={asset.nblOtherMixedUseMode}
            onChange={(v) => onAssetChange({ nblOtherMixedUseMode: v })}
          />
          {asset.nblOtherMixedUseMode === "single_building" && (
            <>
              <FieldCard label="특정용도분 연면적 (㎡)" unit="㎡" hint="거주·특정사업에 사용되는 부분의 연면적 (안분 분자)">
                <DecimalInput value={asset.nblOtherMixedUseSpecificFloorArea} onChange={(v) => onAssetChange({ nblOtherMixedUseSpecificFloorArea: v })} />
              </FieldCard>
              <FieldCard label="건축물 전체 연면적 (㎡)" unit="㎡" hint="건축물 전체 연면적 (안분 분모). 특정용도분 ÷ 전체 비율로 부속토지 안분">
                <DecimalInput value={asset.nblOtherMixedUseTotalFloorArea} onChange={(v) => onAssetChange({ nblOtherMixedUseTotalFloorArea: v })} />
              </FieldCard>
            </>
          )}
          {asset.nblOtherMixedUseMode === "multiple_buildings" && (
            <>
              <FieldCard label="특정용도분 바닥면적 (㎡)" unit="㎡" hint="거주·특정사업에 사용되는 건축물의 바닥면적 (안분 분자)">
                <DecimalInput value={asset.nblOtherMixedUseSpecificFootprint} onChange={(v) => onAssetChange({ nblOtherMixedUseSpecificFootprint: v })} />
              </FieldCard>
              <FieldCard label="다수 건축물 전체 바닥면적 (㎡)" unit="㎡" hint="동일 경계 안 다수 건축물의 전체 바닥면적 (안분 분모)">
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
            <FieldCard label="당해 과세기간 수입금액" unit="원" hint="해당 기간 중 실제 수입금액(연환산 전). 양도일까지 1과세기간 미만 영위 시 아래에서 1년으로 환산됩니다.">
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
                    <p>영위 {revenuePreview.days}일 ÷ {revenuePreview.taxYear}년 {revenuePreview.yearDays}일 환산</p>
                    <p className="font-semibold">연간환산 수입금액 = {revenuePreview.annualized.toLocaleString()}원</p>
                  </div>
                ) : (
                  <p className="text-caption text-amber-700/80 dark:text-amber-300/80">영위 {revenuePreview.days}일 = {revenuePreview.taxYear}년 총일수 → 환산 없음(raw 그대로)</p>
                )
              ) : (
                <p className="text-caption text-muted-foreground">당해 수입금액·양도일·취득일 입력 시 연환산 금액이 표시됩니다.</p>
              )}
            </div>
            <NblLandValueAutoFetchButton
              jibun={asset.addressJibun}
              area={parseFloat(asset.acquisitionArea || "0") || 0}
              ratio={parseFloat(asset.nblOwnershipRatio || "1") || 1}
              transferDate={transferDate ?? ""}
              onResult={(cur, prior) =>
                onAssetChange({ nblRevenueCurrentLandValue: cur, nblRevenuePriorLandValue: prior })
              }
            />
            <FieldCard label="당해 토지가액 (양도일 기준시가)" unit="원">
              <CurrencyInput label="당해 토지가액" hideLabel hideUnit value={asset.nblRevenueCurrentLandValue} onChange={(v) => onAssetChange({ nblRevenueCurrentLandValue: v })} />
            </FieldCard>
            <FieldCard label="직전 과세기간 수입금액" unit="원" hint="입력 시 (당해+직전) 합산비율과 비교해 큰 값 적용 (§168의11②)">
              <CurrencyInput label="직전 수입금액" hideLabel hideUnit value={asset.nblRevenuePriorRevenue} onChange={(v) => onAssetChange({ nblRevenuePriorRevenue: v })} />
            </FieldCard>
            <FieldCard label="직전 과세기간 영위일수" unit="일" hint="직전연도 중 사업을 개시·폐업하여 영위기간이 1년 미만인 경우만 입력. 미입력 시 직전 수입금액은 연환산하지 않습니다 (§168의11③3호).">
              <DecimalInput value={asset.nblRevenuePriorBusinessDays} onChange={(v) => onAssetChange({ nblRevenuePriorBusinessDays: v })} />
            </FieldCard>
            <FieldCard label="직전 토지가액" unit="원">
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
              <FieldCard label="당해 공통수입금액" unit="원">
                <CurrencyInput label="당해 공통수입금액" hideLabel hideUnit value={asset.nblRevenueCommonRevenue} onChange={(v) => onAssetChange({ nblRevenueCommonRevenue: v })} />
              </FieldCard>
              <FieldCard label="당해 그 밖의 토지가액" unit="원" hint="안분 분모 = 당해 토지가액 + 그 밖의 토지가액">
                <CurrencyInput label="당해 그 밖의 토지가액" hideLabel hideUnit value={asset.nblRevenueOtherLandValue} onChange={(v) => onAssetChange({ nblRevenueOtherLandValue: v })} />
              </FieldCard>
              <FieldCard label="직전 공통수입금액" unit="원" hint="직전 과세기간도 공통수입이 있으면 입력(선택). 공통수입금액·그 밖의 토지가액을 함께 입력.">
                <CurrencyInput label="직전 공통수입금액" hideLabel hideUnit value={asset.nblRevenuePriorCommonRevenue} onChange={(v) => onAssetChange({ nblRevenuePriorCommonRevenue: v })} />
              </FieldCard>
              <FieldCard label="직전 그 밖의 토지가액" unit="원">
                <CurrencyInput label="직전 그 밖의 토지가액" hideLabel hideUnit value={asset.nblRevenuePriorOtherLandValue} onChange={(v) => onAssetChange({ nblRevenuePriorOtherLandValue: v })} />
              </FieldCard>
            </ToggleCard>
          </div>
        )}
      </div>

      {isLikelyBareground && (
        <div className="rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 space-y-1">
          <p>건물가액이 토지가액의 2% 미만 — 건축물 바닥면적분 토지는 별도합산(사업용) 유지, 그 외 부속토지만 별도합산에서 제외(종합합산)되어 비사업용으로 부분 안분됩니다. 위 &ldquo;건축물 바닥면적&rdquo;을 입력하면 안분이 반영됩니다.</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <LawArticleModal legalBasis="소득세법 §104의3 ① 4호 나목" label="§104의3①4호나목" />
            <LawArticleModal legalBasis="지방세법 시행령 §101 ① 2호 나목" label="지방세법시행령 §101①2호나목" />
          </div>
        </div>
      )}

      <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground space-y-1">
        <p>건물가액이 토지가액의 2% 미만이면 건축물 바닥면적분 토지는 별도합산(사업용) 유지, 그 외 부속토지만 종합합산되어 비사업용으로 부분 안분됩니다(바닥면적 미입력 시 전량 비사업용).</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 §104의3 ① 4호 나목" label="§104의3①4호나목" />
          <LawArticleModal legalBasis="지방세법 시행령 §101 ① 2호 나목" label="지방세법시행령 §101①2호나목" />
        </div>
      </div>
    </div>
  );
}
