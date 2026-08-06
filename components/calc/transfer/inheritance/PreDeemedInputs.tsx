"use client";

/**
 * 의제취득일(1985.1.1.) 이전 상속 취득가액 입력 (case A)
 *
 * 산식: **가목 우선** — `clauseA = max(① 상증법 §60~66 평가액, ② §164④~⑦ 취득당시 기준시가)`이고,
 *       가목이 0일 때만 ③ 환산취득가로 간다(`inheritance-acquisition-price.ts`).
 * 근거: 법 §97①1호 **단서**("가목의 실지거래가액을 확인할 수 없는 경우에 **한정**하여 나목")
 *       · 시행령 §163⑨ 본문·1호·2호(①②) · §163⑫ → §176조의2(③)
 *
 * ⚠️ 종전 주석은 「max(환산취득가, 피상속인 실가 × **물가상승률**)」이었다 — 물가상승률(CPI) 분기는
 *    법령 근거가 없어 제거됐고(#1080 계열), 3자 max도 #1089에서 가목 우선으로 재편됐다.
 *
 * UI 순서 = 엔진 계산 로직 순서:
 * ① 의제취득일 시점 기준시가 (토지: pre1990 환산 자동 계산 포함) → ② 양도시 기준시가 → ③ 상증법 평가액
 */

import { useMemo } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { HouseValuationSection } from "./HouseValuationSection";
import { InheritanceHouseKindPicker } from "./InheritanceHouseKindPicker";
import { deriveInheritanceHouseKind } from "@/lib/calc/transfer-tax-api-helpers";
import { calculatePre1990LandValuation, type LandGradeInput } from "@/lib/tax-engine/pre-1990-land-valuation";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 개별주택가격 최초 공시일 */
const HOUSE_FIRST_DISCLOSURE_DATE = "2005-04-30";
/** 1990.8.30. 토지등급 → 개별공시지가 전환일 */
const PRE_1990_DATE = "1990-08-30";

import { LAW_BADGE_CLASS } from "@/components/calc/shared/lawBadge";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 — 1990 토지 환산 계산에 필요 */
  transferDate?: string;
}

export function PreDeemedInputs({ asset, onChange, transferDate }: Props) {
  const isLand = asset.assetKind === "land";
  // 토지/주택 판정은 상단 assetKind로 파생(상속 자산구분 라디오 폐지 대응).
  const isHouse = asset.assetKind === "housing" || asset.assetKind === "redevelopment_apt";
  // 주택 개별/공동 — 미선택 시 동·호 유무로 기본 표시(세액 무관, 조회·라벨용). 파생은 공용 단일 소스.
  const houseKind = deriveInheritanceHouseKind(asset);

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
          의제취득일 이전 상속·증여 — ① 상증법 평가액과 ② 취득당시 기준시가 중 많은 금액
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {/* 가목이 먼저다 — §176조의2④(나목)은 가목을 확인할 수 없을 때만 온다(법 §97①1호 단서). */}
          <LawArticleModal
            legalBasis="소득세법 시행령 §163 ⑨"
            label="소령 §163 ⑨"
            className={LAW_BADGE_CLASS}
          />
          <LawArticleModal
            legalBasis="소득세법시행령 §176조의2"
            label="소령 §176조의2 ④"
            className={LAW_BADGE_CLASS}
          />
        </div>
      </div>

      {/* 주택 자산 + 상속개시일 < 2005-04-30: 개별주택가격 미공시 3-시점 보조 입력 */}
      {showHouseValuation && (
        <>
          <InheritanceHouseKindPicker
            value={houseKind}
            assetId={asset.assetId}
            onChange={onChange}
          />
          <HouseValuationSection
            asset={asset}
            onChange={onChange}
            transferDate={transferDate}
          />
        </>
      )}

      {/* ① 의제취득일(1985.1.1.) 시점 기준시가 */}
      <div className="space-y-1">
        <FieldCard
          label={showHouseValuation ? "의제취득일(1985.1.1.) 시점 합계 기준시가" : "의제취득일(1985.1.1.) 시점 기준시가"}
          unit="원"
          hint={
            stdPriceAtAcqAutoActive
              ? `자동 계산값: ${autoStdPriceAtAcq!.toLocaleString()} (위 환산 결과 사용 중). 직접 입력하려면 아래 override를 켜세요.`
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
          <ToggleCard
            tone="amber"
            size="sm"
            title="의제취득일 시점 기준시가 직접 입력"
            description="자동 계산값 override"
            checked={asset.useStandardPriceAtAcqOverride}
            onCheckedChange={(v) =>
              onChange({
                useStandardPriceAtAcqOverride: v,
                ...(!v && { standardPriceAtAcq: "" }),
              })
            }
          />
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
              ? `자동 계산값: ${autoStdPriceAtTransfer!.toLocaleString()} (양도 당시 공시된 개별주택가격 사용). 직접 입력하려면 아래 override를 켜세요.`
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
          <ToggleCard
            tone="emerald"
            size="sm"
            title="양도시 기준시가 직접 입력"
            description="자동 계산값 override"
            checked={asset.useStandardPriceAtTransferOverride}
            onCheckedChange={(v) =>
              onChange({
                useStandardPriceAtTransferOverride: v,
                ...(!v && { standardPriceAtTransfer: "" }),
              })
            }
          />
        )}
      </div>

      {/* ① 상증법 §60~66 평가액 (상속세 신고가액) — ②와 함께 **가목**을 이룬다(max(①,②)) */}
      <FieldCard
        label="상속세 신고가액 (상증법 평가액)"
        unit="원"
        // §163⑨ 본문 괄호가 소스 서열을 **강행**으로 정한다 — 결정·경정액이 있으면 그 가액이다(U2-F).
        hint="상속세 신고서상 평가액. 세무서장등이 결정·경정한 가액이 있으면 그 가액을 입력하세요(§163⑨ 본문). 이 값 또는 취득당시 기준시가(§164④~⑦)가 확인되면 그중 큰 금액이 취득가액이 되고, 환산취득가는 적용하지 않습니다(소득세법 §97①1호 단서)."
        trailing={
          <LawArticleModal
            legalBasis="상속세및증여세법 §60"
            label="상증법 §60~66"
            className={LAW_BADGE_CLASS}
          />
        }
      >
        <CurrencyInput
          label=""
          hideUnit
          value={asset.publishedValueAtInheritance}
          onChange={(v) => onChange({ publishedValueAtInheritance: v })}
          placeholder="신고가액 입력 (원)"
        />
      </FieldCard>

      <p className="text-caption text-muted-foreground">
        취득가액 = <b>① 상속세 신고가액</b>과 <b>② 취득당시 기준시가(§164④~⑦)</b> 중 많은 금액(가목).
        둘 다 확인할 수 없을 때에 <b>한정</b>해 <b>③ 환산취득가</b>를 적용합니다(법 §97①1호 단서).
        환산취득가 = 양도가액 × (의제취득일 기준시가 ÷ 양도시 기준시가)
      </p>
    </div>
  );
}
