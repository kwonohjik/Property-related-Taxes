"use client";

/**
 * 신축(자가건축) + 부수토지 일체과세 관련 UI 섹션 (사례 28)
 *
 * CompanionAssetCard.tsx 800줄 정책에 따라 분리.
 *
 * 포함 내용:
 * - MANUAL_RATE_OVERRIDE_OPTIONS: 수동 세율 오버라이드 옵션
 * - useUnifiedRateBadge: 일체과세 자동 분기 배지 판정 훅
 * - CompanionLandRateOverrideToggle: 토지 세율 수동 지정 토글
 * - NewConstructionPrimarySection: 주 자산(주택) 부수토지 한도 섹션
 */

import { useMemo } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { NewConstructionFootprintSection } from "./NewConstructionFootprintSection";

/** 수동 세율 오버라이드 옵션 (부수토지 일체과세 §104①2호·영§167의5) */
export const MANUAL_RATE_OVERRIDE_OPTIONS = [
  {
    value: "shortTermHousing70",
    label: "70% — 단기보유 주택 세율 적용",
    description: "§104①2·3호 괄호 — 주택·부수토지 일체과세(영 §167의5)",
  },
  {
    value: "shortTerm60",
    label: "40% — 1년~2년 보유 토지 세율 적용",
    description: "§104①3호 — 토지 1년 이상 2년 미만 보유",
  },
  {
    value: "progressive",
    label: "누진세율 — 기본세율 적용",
    description: "§104① 일반 누진세율 (6~45%)",
  },
] as const;

/**
 * 부수토지 일체과세 자동 분기 배지 판정 훅.
 * useEffect → store 미러링 금지 — useMemo로 파생값만 계산.
 *
 * 조건:
 *  1. 이 카드가 토지 자산
 *  2. primaryAsset이 신축(자가건축)
 *  3. 사용승인일 기준 보유 < 365일
 *  4. 면적이 한도 이내
 *  5. 수동 오버라이드 미지정
 */
export function useUnifiedRateBadge(
  asset: AssetForm,
  primaryAsset: AssetForm | undefined,
  transferDate: string | undefined,
): boolean {
  return useMemo(() => {
    if (!primaryAsset) return false;
    if (asset.assetKind !== "land") return false;
    if (asset.manualHoldingPeriodOverride !== undefined) return false;
    if (primaryAsset.acquisitionCause !== "newConstruction") return false;
    if (!primaryAsset.occupancyApprovalDate || !transferDate) return false;

    // 보유기간 < 12개월 판정 (사용승인일 기준)
    const acqDate = new Date(primaryAsset.occupancyApprovalDate);
    const trnDate = new Date(transferDate);
    if (!Number.isFinite(acqDate.getTime()) || !Number.isFinite(trnDate.getTime())) return false;
    const daysDiff = Math.floor((trnDate.getTime() - acqDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff >= 365) return false;

    // 면적 한도 판정
    const footprint = parseFloat(primaryAsset.buildingFootprintArea || "0");
    if (footprint <= 0) return false;
    const multiplier = primaryAsset.isUrbanArea === false ? 10 : 5;
    const limitArea = footprint * multiplier;
    const companionArea = parseFloat(asset.acquisitionArea || asset.transferArea || "0");
    if (companionArea <= 0) return false;
    if (companionArea > limitArea) return false;

    return true;
  }, [
    primaryAsset,
    asset.assetKind,
    asset.manualHoldingPeriodOverride,
    asset.acquisitionArea,
    asset.transferArea,
    transferDate,
  ]);
}

// ─────────────────────────────────────────────────────────────

interface LandRateOverrideProps {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

/**
 * companion 토지 — 수동 세율 오버라이드 토글 (부수토지 일체과세 §104①2호·영§167의5).
 * 렌더 조건: assetKind === "land" && !isPrimary (호출 측에서 제어).
 */
export function CompanionLandRateOverrideToggle({ asset, onChange }: LandRateOverrideProps) {
  return (
    <ToggleCard
      tone="amber"
      title="토지 세율 수동 지정"
      description="부수토지 자동 분기 결과를 직접 변경합니다. 세무 전문가 검토 후 사용하세요."
      checked={asset.manualHoldingPeriodOverride !== undefined}
      onCheckedChange={(checked) => {
        onChange({
          manualHoldingPeriodOverride: checked ? "shortTermHousing70" : undefined,
        });
      }}
    >
      <RadioCardGroup
        name="manualHoldingPeriodOverride"
        tone="amber"
        layout="stack"
        value={asset.manualHoldingPeriodOverride ?? ""}
        onChange={(v) =>
          onChange({
            manualHoldingPeriodOverride: v as AssetForm["manualHoldingPeriodOverride"],
          })
        }
        options={MANUAL_RATE_OVERRIDE_OPTIONS.map((opt) => ({
          value: opt.value,
          label: opt.label,
          description: opt.description,
        }))}
      />
    </ToggleCard>
  );
}

// ─────────────────────────────────────────────────────────────

interface PrimarySectionProps {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

/**
 * 신축(자가건축) 주 자산(주택) — 부수토지 한도 산정 섹션.
 * 렌더 조건: acquisitionCause === "newConstruction" && assetKind === "housing" (호출 측에서 제어).
 */
export function NewConstructionPrimarySection({ asset }: PrimarySectionProps) {
  // 표시 전용 — 정착면적·소재지 구분의 입력은 ① 기본정보가 담당한다
  // (`NewConstructionFootprintSection` Props 주석 참조). 여기에 onChange를 다시 배선하지 말 것.
  return (
    <NewConstructionFootprintSection
      buildingFootprintArea={asset.buildingFootprintArea ?? ""}
      appurtenantLandZone={asset.appurtenantLandZone}
    />
  );
}
