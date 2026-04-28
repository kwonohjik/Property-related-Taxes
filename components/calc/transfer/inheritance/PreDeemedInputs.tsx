"use client";

/**
 * 의제취득일(1985.1.1.) 이전 상속 취득가액 입력 (case A)
 *
 * 산식: max(환산취득가, 피상속인 실가 × 물가상승률)
 * 근거: 소득세법 시행령 §176조의2 ④
 *
 * UI 순서 = 엔진 계산 로직 순서:
 * ① 의제취득일 시점 기준시가 (토지: pre1990 환산 자동 계산 포함) → ② 양도시 기준시가 → ③ 피상속인 실가 입증
 */

import { useMemo } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { HouseValuationSection } from "./HouseValuationSection";
import { calculatePre1990LandValuation, type LandGradeInput } from "@/lib/tax-engine/pre-1990-land-valuation";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 개별주택가격 최초 공시일 */
const HOUSE_FIRST_DISCLOSURE_DATE = "2005-04-30";
/** 1990.8.30. 토지등급 → 개별공시지가 전환일 */
const PRE_1990_DATE = "1990-08-30";

const LAW_BADGE_CLASS =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium " +
  "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 " +
  "hover:bg-blue-100 dark:hover:bg-blue-950/70 transition-colors shrink-0 whitespace-nowrap cursor-pointer";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 — 1990 토지 환산 계산에 필요 */
  transferDate?: string;
}

export function PreDeemedInputs({ asset, onChange, transferDate }: Props) {
  const isLand = asset.assetKind === "land";
  const isHouse = asset.inheritanceAssetKind === "house_individual" || asset.inheritanceAssetKind === "house_apart";

  // 주택 자산 + 상속개시일 < 2005-04-30: 개별주택가격 미공시 → 3-시점 보조 입력
  const inheritanceDate = asset.inheritanceStartDate || asset.acquisitionDate || "";
  const showHouseValuation = isHouse && !!inheritanceDate && inheritanceDate < HOUSE_FIRST_DISCLOSURE_DATE;

  // 토지인 경우 의제취득일(1985.1.1.) 자체가 1990.8.30. 이전이므로 항상 환산 대상
  const showPre1990 = isLand;

  // hint 텍스트: 자산 종류에 따라 다르게 표시
  const stdPriceHint = isLand
    ? "1985.1.1. 개별공시지가 × 면적. 아래 토지등급가액 환산을 사용하면 자동 입력됩니다."
    : "국세청 기준시가 직접 입력.";

  // ── 자동 계산값 미리보기 (엔진 자동 주입 로직과 동일한 결과를 재현) ──
  // 엔진은 `inheritance-acquisition-helpers.ts`의 resolveInheritedAcquisitionInput에서
  // PHD 결과(houseValuationResult.housePriceAtInheritanceUsed) 또는 Pre1990 결과를 자동 주입.
  // UI에서도 동일한 로직을 미리 계산해 사용자에게 노출.
  const phdAutoDeemedPrice = useMemo<number | null>(() => {
    if (!showHouseValuation) return null;
    const area = parseFloat(asset.inhHouseValLandArea) || 0;
    const isBefore1990 = !!inheritanceDate && inheritanceDate < PRE_1990_DATE;

    // 상속개시일 시점 토지기준시가 (Sum_A의 토지 성분)
    let landStdA = 0;
    if (isBefore1990 && asset.pre1990Enabled) {
      const buildGrade = (raw: string | undefined): LandGradeInput | undefined => {
        if (!raw) return undefined;
        const n = parseFloat(raw);
        if (!Number.isFinite(n) || n <= 0) return undefined;
        return asset.pre1990GradeMode === "number" ? Math.trunc(n) : { gradeValue: n };
      };
      const gCur = buildGrade(asset.pre1990Grade_current);
      const gPrev = buildGrade(asset.pre1990Grade_prev);
      const gAcq = buildGrade(asset.pre1990Grade_atAcq);
      const p1990 = parseAmount(asset.pre1990PricePerSqm_1990 || "");
      if (gCur && gPrev && gAcq && p1990 > 0 && area > 0) {
        try {
          const r = calculatePre1990LandValuation({
            acquisitionDate: new Date(inheritanceDate),
            transferDate: new Date(transferDate || inheritanceDate),
            areaSqm: area,
            pricePerSqm_1990: p1990,
            pricePerSqm_atTransfer: p1990,
            grade_1990_0830: gCur,
            gradePrev_1990_0830: gPrev,
            gradeAtAcquisition: gAcq,
          });
          landStdA = r.standardPriceAtAcquisition;
        } catch {
          landStdA = 0;
        }
      }
    } else {
      landStdA = Math.floor(parseAmount(asset.inhHouseValLandPricePerSqmAtInheritance) * area);
    }

    const buildingA = parseAmount(asset.inhHouseValBuildingStdPriceAtInheritance) || 0;
    const landStdF = Math.floor(parseAmount(asset.inhHouseValLandPricePerSqmAtFirst) * area);
    const buildingStdF = parseAmount(asset.inhHouseValBuildingStdPriceAtFirst) || 0;
    const P_F = parseAmount(asset.inhHouseValHousePriceAtFirst) || 0;
    const sumA = landStdA + buildingA;
    const sumF = landStdF + buildingStdF;

    // override 사용 시 그 값을 그대로 반환
    if (asset.inhHouseValUseHousePriceOverride) {
      const override = parseAmount(asset.inhHouseValHousePriceAtInheritanceOverride) || 0;
      return override > 0 ? Math.floor(override) : null;
    }

    if (sumF <= 0 || P_F <= 0 || sumA <= 0) return null;
    return Math.floor((P_F * sumA) / sumF);
  }, [
    showHouseValuation,
    inheritanceDate,
    transferDate,
    asset.inhHouseValLandArea,
    asset.inhHouseValLandPricePerSqmAtFirst,
    asset.inhHouseValLandPricePerSqmAtInheritance,
    asset.inhHouseValBuildingStdPriceAtFirst,
    asset.inhHouseValBuildingStdPriceAtInheritance,
    asset.inhHouseValHousePriceAtFirst,
    asset.inhHouseValUseHousePriceOverride,
    asset.inhHouseValHousePriceAtInheritanceOverride,
    asset.pre1990Enabled,
    asset.pre1990PricePerSqm_1990,
    asset.pre1990Grade_current,
    asset.pre1990Grade_prev,
    asset.pre1990Grade_atAcq,
    asset.pre1990GradeMode,
  ]);

  // Pre1990 토지 자동값 (주택이 아닌 토지 자산일 때)
  const pre1990AutoDeemedPrice = useMemo<number | null>(() => {
    if (showHouseValuation) return null; // 주택은 PHD 우선
    if (!showPre1990 || !asset.pre1990Enabled) return null;
    const area = parseFloat(asset.acquisitionArea || "") || 0;
    const buildGrade = (raw: string | undefined): LandGradeInput | undefined => {
      if (!raw) return undefined;
      const n = parseFloat(raw);
      if (!Number.isFinite(n) || n <= 0) return undefined;
      return asset.pre1990GradeMode === "number" ? Math.trunc(n) : { gradeValue: n };
    };
    const gCur = buildGrade(asset.pre1990Grade_current);
    const gPrev = buildGrade(asset.pre1990Grade_prev);
    const gAcq = buildGrade(asset.pre1990Grade_atAcq);
    const p1990 = parseAmount(asset.pre1990PricePerSqm_1990 || "");
    if (!gCur || !gPrev || !gAcq || p1990 <= 0 || area <= 0) return null;
    try {
      const r = calculatePre1990LandValuation({
        acquisitionDate: new Date(asset.acquisitionDate || inheritanceDate),
        transferDate: new Date(transferDate || asset.acquisitionDate || inheritanceDate),
        areaSqm: area,
        pricePerSqm_1990: p1990,
        pricePerSqm_atTransfer: parseAmount(asset.pre1990PricePerSqm_atTransfer || "") || p1990,
        grade_1990_0830: gCur,
        gradePrev_1990_0830: gPrev,
        gradeAtAcquisition: gAcq,
      });
      return r.standardPriceAtAcquisition;
    } catch {
      return null;
    }
  }, [
    showHouseValuation,
    showPre1990,
    asset.pre1990Enabled,
    asset.acquisitionArea,
    asset.acquisitionDate,
    asset.pre1990PricePerSqm_1990,
    asset.pre1990PricePerSqm_atTransfer,
    asset.pre1990Grade_current,
    asset.pre1990Grade_prev,
    asset.pre1990Grade_atAcq,
    asset.pre1990GradeMode,
    inheritanceDate,
    transferDate,
  ]);

  // 양도시 기준시가 자동값: PHD inhHouseValHousePriceAtTransfer 사용
  const autoStdPriceAtTransfer = useMemo<number | null>(() => {
    if (!showHouseValuation) return null;
    const v = parseAmount(asset.inhHouseValHousePriceAtTransfer) || 0;
    return v > 0 ? v : null;
  }, [showHouseValuation, asset.inhHouseValHousePriceAtTransfer]);

  const autoStdPriceAtAcq = phdAutoDeemedPrice ?? pre1990AutoDeemedPrice;
  const stdPriceAtAcqAutoActive = autoStdPriceAtAcq !== null && !asset.useStandardPriceAtAcqOverride;
  const stdPriceAtTransferAutoActive = autoStdPriceAtTransfer !== null && !asset.useStandardPriceAtTransferOverride;

  return (
    <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
          의제취득일 이전 상속 — max(환산취득가, 피상속인 실가 × 물가상승률)
        </p>
        <LawArticleModal
          legalBasis="소득세법시행령 §176조의2"
          label="소령 §176조의2 ④"
          className={LAW_BADGE_CLASS}
        />
      </div>

      {/* 주택 자산 + 상속개시일 < 2005-04-30: 개별주택가격 미공시 3-시점 보조 입력 */}
      {showHouseValuation && (
        <HouseValuationSection
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
        />
      )}

      {/* ① 의제취득일(1985.1.1.) 시점 기준시가 */}
      <div className="space-y-1">
        <FieldCard
          label={showHouseValuation ? "의제취득일(1985.1.1.) 시점 합계 기준시가" : "의제취득일(1985.1.1.) 시점 기준시가"}
          unit="원"
          hint={
            stdPriceAtAcqAutoActive
              ? `자동 계산값: ${autoStdPriceAtAcq!.toLocaleString()}원 (위 환산 결과 사용 중). 직접 입력하려면 아래 override를 켜세요.`
              : showHouseValuation
                ? "위 3-시점 환산 결과(토지+주택 합계)가 있으면 자동 계산됩니다. 또는 직접 입력."
                : stdPriceHint
          }
          disabled={stdPriceAtAcqAutoActive}
          trailing={
            <LawArticleModal
              legalBasis="소득세법시행령 §164"
              label="소령 §164"
              className={LAW_BADGE_CLASS}
            />
          }
        >
          <CurrencyInput
            label=""
            hideUnit
            value={
              stdPriceAtAcqAutoActive
                ? String(autoStdPriceAtAcq ?? "")
                : asset.standardPriceAtAcq
            }
            onChange={(v) => onChange({ standardPriceAtAcq: v })}
            placeholder="기준시가 입력 (원)"
            disabled={stdPriceAtAcqAutoActive}
          />
        </FieldCard>
        {autoStdPriceAtAcq !== null && (
          <label className="flex items-center gap-2 cursor-pointer text-xs pl-3 text-muted-foreground">
            <input
              type="checkbox"
              checked={asset.useStandardPriceAtAcqOverride}
              onChange={(e) =>
                onChange({
                  useStandardPriceAtAcqOverride: e.target.checked,
                  ...(!e.target.checked && { standardPriceAtAcq: "" }),
                })
              }
            />
            의제취득일 시점 기준시가 직접 입력 (자동 계산값 override)
          </label>
        )}
      </div>

      {/* 토지 전용: 1990.8.30. 이전 취득 토지 등급가액 환산 */}
      {showPre1990 && (
        <Pre1990LandValuationInput
          form={{
            pre1990Enabled: asset.pre1990Enabled,
            pre1990PricePerSqm_1990: asset.pre1990PricePerSqm_1990,
            pre1990PricePerSqm_atTransfer: asset.pre1990PricePerSqm_atTransfer,
            pre1990Grade_current: asset.pre1990Grade_current,
            pre1990Grade_prev: asset.pre1990Grade_prev,
            pre1990Grade_atAcq: asset.pre1990Grade_atAcq,
            pre1990GradeMode: asset.pre1990GradeMode,
          }}
          onChange={(patch) => onChange(patch)}
          acquisitionArea={asset.acquisitionArea || undefined}
          jibun={asset.addressJibun || undefined}
          acquisitionDate={asset.acquisitionDate || undefined}
          transferDate={transferDate}
          onCalculatedPrice={(price) =>
            onChange({ standardPriceAtAcq: String(price) })
          }
        />
      )}

      {/* ② 양도시 기준시가 */}
      <div className="space-y-1">
        <FieldCard
          label="양도시 기준시가"
          unit="원"
          hint={
            stdPriceAtTransferAutoActive
              ? `자동 계산값: ${autoStdPriceAtTransfer!.toLocaleString()}원 (양도 당시 공시된 개별주택가격 사용). 직접 입력하려면 아래 override를 켜세요.`
              : "환산취득가 공식 분모 — 양도일 직전 공시된 기준시가."
          }
          disabled={stdPriceAtTransferAutoActive}
        >
          <CurrencyInput
            label=""
            hideUnit
            value={
              stdPriceAtTransferAutoActive
                ? String(autoStdPriceAtTransfer ?? "")
                : asset.standardPriceAtTransfer
            }
            onChange={(v) => onChange({ standardPriceAtTransfer: v })}
            placeholder="기준시가 입력 (원)"
            disabled={stdPriceAtTransferAutoActive}
          />
        </FieldCard>
        {autoStdPriceAtTransfer !== null && (
          <label className="flex items-center gap-2 cursor-pointer text-xs pl-3 text-muted-foreground">
            <input
              type="checkbox"
              checked={asset.useStandardPriceAtTransferOverride}
              onChange={(e) =>
                onChange({
                  useStandardPriceAtTransferOverride: e.target.checked,
                  ...(!e.target.checked && { standardPriceAtTransfer: "" }),
                })
              }
            />
            양도시 기준시가 직접 입력 (자동 계산값 override)
          </label>
        )}
      </div>

      {/* ③ 피상속인 실가 입증 */}
      <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={asset.hasDecedentActualPrice}
            onChange={(e) => {
              onChange({
                hasDecedentActualPrice: e.target.checked,
                ...(!e.target.checked && {
                  decedentAcquisitionDate: "",
                  decedentAcquisitionPrice: "",
                }),
              });
            }}
          />
          피상속인 실지취득가액을 입증할 수 있습니다
        </label>
        <p className="text-[11px] text-muted-foreground pl-5">
          입증 시 실가 × 물가상승률과 환산취득가 중 큰 금액 적용
        </p>

        {asset.hasDecedentActualPrice && (
          <div className="pl-5 space-y-3 pt-1">
            <FieldCard label="피상속인 취득일" required>
              <DateInput
                value={asset.decedentAcquisitionDate}
                onChange={(v) => onChange({ decedentAcquisitionDate: v })}
              />
            </FieldCard>
            <FieldCard label="피상속인 실지취득가액" required unit="원">
              <CurrencyInput
                label=""
                hideUnit
                value={asset.decedentAcquisitionPrice}
                onChange={(v) => onChange({ decedentAcquisitionPrice: v })}
                placeholder="피상속인이 실제 취득한 가액"
              />
            </FieldCard>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        환산취득가 = 양도가액 × (의제취득일 기준시가 ÷ 양도시 기준시가)
      </p>
    </div>
  );
}
