"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { OtherLandParcelSection } from "./OtherLandParcelSection";
import { OtherLandHoSection } from "./OtherLandHoSection";
import { OtherLandStateHistorySection } from "./OtherLandStateHistorySection";
import { RevenuePeriodSection } from "./RevenuePeriodSection";
import { RevenueWholesaleItemField } from "./RevenueWholesaleItemField";
import { OtherLandPropertyTaxBasisField } from "./OtherLandPropertyTaxBasisField";
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
import { effectiveOtherHasBuildingOf } from "@/lib/calc/nbl-other-state-history-scope";
import { nblOtherBuildingToggleHidden } from "@/lib/calc/nbl-other-state-history-scope";
import { nblOtherStateEventsInUse } from "@/lib/calc/nbl-other-state-history-scope";
import { nblOtherStateHistoryApplies } from "@/lib/calc/nbl-other-state-history-scope";
import { nblRevenuePeriodInUse } from "@/lib/calc/nbl-revenue-period-scope";
import { revenuePeriodRange } from "@/lib/calc/nbl-revenue-period-scope";
import { operatingDaysInYear } from "@/lib/tax-engine/non-business-land/revenue-history";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { PROPERTY_TAX_TYPE_LABEL } from "@/lib/tax-engine/non-business-land/property-tax-type-label";
import { NBL_PROPERTY_TAX_TYPE_MIXED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_PROPERTY_TAX_TYPE_SOURCE_HINT } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_REVENUE_START_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";

export interface OtherLandDetailSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
  /** form-level 양도일 — 토지가액 자동조회 당해/직전 연도 결정 */
  transferDate?: string;
}

type PropertyTaxType = "" | "comprehensive" | "separate" | "special_sum" | "exempt";

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

const REVENUE_BIZ_LABEL: Record<string, string> = {
  none: "해당 없음",
  parking_operation: "주차장운영업 (3%)",
  mineral_spring: "광천지 (4%)",
  fish_farm_other: "양어장·지소 기타 (4%)",
  block_stone_pipe_mfg: "블록·석물·토관 제조 (20%)",
  landscaping_floriculture: "조경식재·화훼판매 (7%)",
  vehicle_repair_academy: "자동차·중장비 정비/운전 학원 (10%)",
  agriculture_academy: "농업 학원 (7%)",
  wholesale_retail: "도소매업 — 규칙 §83의4⑭ 열거 품목만 (10%)",
};

export function OtherLandDetailSection({
  asset,
  onAssetChange,
  transferDate,
}: OtherLandDetailSectionProps) {
  // NBL-STATE-HISTORY-U0 — 양도일 현재 「건축물 있음」: `changed`이면 마지막 사건이 정한다(아래 하위 칸 노출 3곳과 호별·근거 칸이 모두 이 값을 읽는다).
  const hasBuilding = effectiveOtherHasBuildingOf(asset);
  // 이력(`changed`)이 판정에 쓰이면 「건축물 있음」 토글은 숨기고(사건이 정한다 — 같은 사실을 두 곳에서 받지 않는다) 「재산세 과세 분류」 라벨에 «양도일 현재»를 붙인다.
  const stateEventsInUse = nblOtherStateEventsInUse(asset);
  // E3-① — 토글은 건축물 사건(신축·멸실)이 1건 이상일 때만 숨긴다. 재산세 과세 구분 변경만 입력한 이력은 건축물 유무를 이 토글이 받는다(숨기면 입력처가 없다).
  const buildingToggleHidden = nblOtherBuildingToggleHidden(asset);
  const buildingVal = parseFloat(asset.nblOtherBuildingValue || "0") || 0;
  const landVal = parseFloat(asset.nblOtherLandValue || "0") || 0;
  const isLikelyBareground = landVal > 0 && buildingVal < landVal * 0.02;
  // §168의11③3호 당해 연환산 preview — 엔진 헬퍼 단일 진실 (재구현 금지)
  const nblAcq = nblAcquisitionDateOf(asset); // 이월과세는 증여자 취득일 — 판정(④)과 같은 값
  // E3-② 「영위 기간」 — 켜지면 개시일 칸은 위 영위 기간 블록으로 옮겨 가고(같은 키 한 인스턴스), 당해 영위일수는 영위 기간(개시·폐업)에서 계산한 값이다.
  const periodOn = nblRevenuePeriodInUse(asset); // 양도일 의제로 영위 기간이 쓰이지 않으면 현행(OFF) 배치 — 엔진도 OFF 경로를 탄다
  // 영위 기간 ON — 엔진 leaf(`operatingDaysInYear`)와 같은 양도연도 영위일수(폐업일 전날까지). 0이면 이 해는 판정에 쓰지 않는다.
  const periodCurrentDays = periodOn && transferDate ? operatingDaysInYear(revenuePeriodRange(asset, transferDate), Number.parseInt(transferDate.slice(0, 4), 10)) : undefined;
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
    const derived = deriveCurrentBusinessDays(
      transferObj,
      acqObj,
      startOverride && !Number.isNaN(startOverride.getTime()) ? startOverride : undefined,
    );
    if (periodCurrentDays !== undefined && periodCurrentDays <= 0) return undefined;
    const taxYear = derived.taxYear;
    const days = periodCurrentDays ?? derived.days;
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
    periodCurrentDays,
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

      {/* NBL-STATE-HISTORY-U1 — 소유기간 중 건축물 유무 이력(질문 → 사건 행 → 미리보기). 건축물 관련 모든 칸을 지배하는 모드 선택이라 맨 위(영향받는 칸 직전)에 둔다. */}
      {nblOtherStateHistoryApplies(asset) && <OtherLandStateHistorySection asset={asset} onAssetChange={onAssetChange} transferDate={transferDate} />}

      {!buildingToggleHidden && (
        <ToggleCard
          data-testid="nbl-other-has-building-toggle"
          tone="amber"
          title="건축물(건물·시설물) 있음"
          description="건물 없으면 재산세 분류 근거를 확인한 선언만 인정하고, 근거가 없으면 종합합산으로 봅니다. 건물 있으면 시가표준액 2% 비교 후 재산세 유형 적용 — 소득세법 §104의3①4호나목·지방세법 시행령 §101①2호나목"
          checked={hasBuilding}
          onCheckedChange={(c) => onAssetChange({ nblOtherHasBuilding: c })}
        />
      )}

      {/* NBL2611-V1-OL06 (Q-2 (가)) — 출처 안내 + 혼재 고지서 선택 안내. 판정 로직은 바꾸지 않는다. 라벨은 엔진과 같은 표다(V10-K). */}
      <FieldCard field="nblOtherPropertyTaxType" label={stateEventsInUse ? "재산세 과세 분류 (양도일 현재)" : "재산세 과세 분류"} hint={NBL_PROPERTY_TAX_TYPE_SOURCE_HINT}>
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

      {/* NBL2611-V1-A (Q-1) — 재산세 분류 «근거». 선택지·표시 조건은 엔진 술어(`property-tax-basis.ts`)가 정한다. */}
      <OtherLandPropertyTaxBasisField asset={asset} onAssetChange={onAssetChange} />

      {hasBuilding && (
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

      {/* §168의11① 호별 면적기준 정밀판정 — 호 목록은 엔진 호 메타 표가 단일 소스(NBL2611-V7-S) */}
      <OtherLandHoSection asset={asset} onAssetChange={onAssetChange} transferDate={transferDate} />

      {/* §168의11⑤ 연접 다필지 취득시기순 안분 */}
      <OtherLandParcelSection asset={asset} onAssetChange={onAssetChange} />

      {/* 공장용 건축물 부속토지 기준면적 (§102①1호 별표6 / §101①1호) — 800줄 정책으로 분리 */}
      <FactoryLandSection asset={asset} onAssetChange={onAssetChange} transferDate={transferDate} />

      {/* §168의11⑥ 복합용도 건축물 부속토지 안분 (건축물 존재 시) */}
      {hasBuilding && (
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
              <SelectItem value="wholesale_retail">{REVENUE_BIZ_LABEL.wholesale_retail}</SelectItem>
            </SelectContent>
          </Select>
        </FieldCard>

        {/* NBL2611-V7-S · Q-6 (다) — 12호 도소매업은 규칙 §83조의4⑭ 품목 한정(농·수·축산물은 시장·유사 장소 한정) */}
        {asset.nblRevenueBusinessType === "wholesale_retail" && (
          <RevenueWholesaleItemField asset={asset} onAssetChange={onAssetChange} />
        )}

        {asset.nblRevenueBusinessType && (
          <div className="space-y-2">
            {/* NBL-STATE-HISTORY-E3-② — 업종 영위 기간(개시·폐업) 토글. 계산 순서(영위 기간 → 과세기간별 표 → 당해·직전)대로 당해 수입금액 칸 앞에 둔다. 꺼짐 = 현행. */}
            <RevenuePeriodSection asset={asset} onAssetChange={onAssetChange} transferDate={transferDate} />
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
              {/* 영위 기간 ON이면 이 칸(같은 키)은 위 «업종 영위 기간» 블록으로 옮겨 가 한 시점에 한 인스턴스만 보인다(E3-② UQ-3). */}
              {!periodOn && (
                <FieldCard field="nblRevenueCurrentBusinessStartDate" label="당해 사업개시일" hint="사업을 개시한 날(어느 해든 입력 가능 — 연환산은 당해 과세기간 안의 영위일만 셉니다). 미입력 시 1.1 또는 당해연도 취득일이 기산일. 입력하면 직전 비율②가 기준 미달일 때 사업 구간을 「사업개시일 ~ 양도일」로 보아 기간기준(영 §168의6)도 판정합니다.">
                  <DateInput value={asset.nblRevenueCurrentBusinessStartDate} onChange={(v) => onAssetChange({ nblRevenueCurrentBusinessStartDate: v })} />
                </FieldCard>
              )}
              {/* NBL-STATE-HISTORY-U1 (통합 Q-15 (가′)) — 건축물 이력이 판정에 쓰이면 개시일은 이력과 합쳐 판정한다(건너뛰지 않는다). 칸은 숨기지 않는다(복원 보존). */}
              {stateEventsInUse && !periodOn && (
                <ToneCard tone="amber">
                  <p className="text-caption leading-snug" data-testid="nbl-state-history-revenue-start-notice">{NBL_STATE_HISTORY_REVENUE_START_NOTICE}</p>
                </ToneCard>
              )}
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
            {/* 영위 기간 ON이면 직전 영위일수는 개시·폐업일에서 계산한다 — 직접 입력은 엔진이 읽지 않는다(`evaluateRevenueHistory`). */}
            {!periodOn && (
              <FieldCard label="직전 과세기간 영위일수" unit="일" hint="직전연도 중 사업을 개시·폐업하여 영위기간이 1년 미만인 경우만 입력. 미입력 시 직전 수입금액은 연환산하지 않습니다 (§168의11③3호).">
                <DecimalInput value={asset.nblRevenuePriorBusinessDays} onChange={(v) => onAssetChange({ nblRevenuePriorBusinessDays: v })} />
              </FieldCard>
            )}
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
