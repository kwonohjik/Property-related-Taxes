"use client";

/**
 * 검용주택 + 개별주택가격 미공시 (§164⑤) 3-시점 환산 패널
 *
 * 일반 자산용 PreHousingDisclosureSection과 동일한 PHD 알고리즘을 사용하지만:
 *  - 토지 면적은 검용주택의 "주택부수토지" 면적으로 자동 계산되어 readonly 표시
 *  - 양도시 개별주택가격은 mixedTransferHousingPrice를 자동 mirror
 *
 * 법령 근거: 소득세법 시행령 §164 ⑤
 */

import { useEffect, useMemo } from "react";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ThreePointStandardPriceInput } from "../ThreePointStandardPriceInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import {
  calculatePre1990LandValuation,
  type LandGradeInput,
} from "@/lib/tax-engine/pre-1990-land-valuation";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  /** 양도일 (양도시 공시지가 기준연도용) */
  transferDate: string;
  onChange: (patch: Partial<AssetForm>) => void;
}

function LegalBadge() {
  return (
    <span className="inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      소득세법 시행령 §164 ⑤
    </span>
  );
}

export function MixedUsePreHousingDisclosureSection({
  asset,
  transferDate,
  onChange,
}: Props) {
  // 주택부수토지 면적 자동 계산 (검용주택) — 사용자 미입력 시 기본값
  const residential = parseDecimal(asset.residentialFloorArea);
  const commercial = parseDecimal(asset.nonResidentialFloorArea);
  const totalLand = parseDecimal(asset.mixedUseTotalLandArea);
  const totalFloor = residential + commercial;
  // 소수점 2자리 반올림 — 화면 표시와 계산값 일치
  const autoLandArea = parseFloat(
    (totalFloor > 0 ? totalLand * (residential / totalFloor) : 0).toFixed(2),
  );
  // 사용자 직접 지정값 우선, 없으면 자동 계산값
  const effectiveLandArea = parseDecimal(asset.phdResidentialLandArea) || autoLandArea;

  // 보유 중 일부 용도변경 케이스: 시점별 면적이 자동 분리 적용됨 (엔진에서 처리)
  const hasUsageChange =
    asset.hasPartialUsageChange === true &&
    !!asset.partialChangeDirection &&
    !!asset.partialChangeDate;

  // 양도시 개별주택가격: 검용주택 입력(mixedTransferHousingPrice) → PHD 양도시 주택가격 자동 mirror
  // PHD 입력이 비어 있을 때만 mixed 값을 자동 채움 (사용자 수동 입력 시 보호)
  useEffect(() => {
    const mixedAmount = parseAmount(asset.mixedTransferHousingPrice);
    const phdAmount = parseAmount(asset.phdTransferHousingPrice);
    if (mixedAmount > 0 && phdAmount === 0) {
      onChange({ phdTransferHousingPrice: String(mixedAmount) });
    }
  }, [asset.mixedTransferHousingPrice, asset.phdTransferHousingPrice, onChange]);

  // ─── 1990.8.30. 이전 취득 토지 환산 자동 활성화 ───
  const acqDate = asset.landAcquisitionDate || asset.acquisitionDate;
  const isPre1990 = !!acqDate && acqDate < "1990-08-30";

  useEffect(() => {
    if (isPre1990 && !asset.pre1990Enabled) {
      onChange({ pre1990Enabled: true });
    }
  }, [isPre1990, asset.pre1990Enabled, onChange]);

  // 토지등급가액 환산 ㎡당 가액 자동 계산 (모든 입력 충족 시)
  const pre1990AutoPricePerSqm = useMemo<number | null>(() => {
    if (!isPre1990 || !asset.pre1990Enabled) return null;
    if (effectiveLandArea <= 0) return null;
    if (!acqDate || !transferDate) return null;
    const buildGrade = (raw: string | undefined): LandGradeInput | undefined => {
      if (!raw) return undefined;
      const n = parseFloat(raw.replace(/,/g, ""));
      if (!Number.isFinite(n) || n <= 0) return undefined;
      return asset.pre1990GradeMode === "number" ? Math.trunc(n) : { gradeValue: n };
    };
    const gCur = buildGrade(asset.pre1990Grade_current);
    const gPrev = buildGrade(asset.pre1990Grade_prev);
    const gAcq = buildGrade(asset.pre1990Grade_atAcq);
    const p1990 = parseAmount(asset.pre1990PricePerSqm_1990 || "");
    if (!gCur || !gPrev || !gAcq || p1990 <= 0) return null;
    try {
      const r = calculatePre1990LandValuation({
        acquisitionDate: new Date(acqDate),
        transferDate: new Date(transferDate),
        areaSqm: effectiveLandArea,
        pricePerSqm_1990: p1990,
        // 환산엔 미사용, validateInput 통과용 동일값 주입
        pricePerSqm_atTransfer: p1990,
        grade_1990_0830: gCur,
        gradePrev_1990_0830: gPrev,
        gradeAtAcquisition: gAcq,
      });
      return r.pricePerSqmAtAcquisition;
    } catch {
      return null;
    }
  }, [
    isPre1990,
    asset.pre1990Enabled,
    asset.pre1990GradeMode,
    asset.pre1990Grade_current,
    asset.pre1990Grade_prev,
    asset.pre1990Grade_atAcq,
    asset.pre1990PricePerSqm_1990,
    acqDate,
    transferDate,
    effectiveLandArea,
  ]);

  // 자동 계산값을 phdLandPricePerSqmAtAcq 에 주입
  useEffect(() => {
    if (pre1990AutoPricePerSqm === null || pre1990AutoPricePerSqm <= 0) return;
    const current = parseAmount(asset.phdLandPricePerSqmAtAcq || "");
    const next = pre1990AutoPricePerSqm;
    if (current !== next) {
      onChange({ phdLandPricePerSqmAtAcq: String(next) });
    }
  }, [pre1990AutoPricePerSqm, asset.phdLandPricePerSqmAtAcq, onChange]);

  return (
    <div className="space-y-4 rounded-md border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">개별주택가격 미공시 취득 (3-시점 환산)</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            검용주택의 주택부분 취득시 개별주택가격을 최초 공시일 기준으로 역산합니다.
            토지면적은 주택부수토지(자동 계산)를 사용합니다.
            {isPre1990 && " 1990.8.30. 이전 취득 토지는 토지등급가액 환산 결과를 자동 적용합니다."}
            {hasUsageChange && " 보유 중 일부 용도변경 입력이 있어 취득시·양도시 주택부수토지 면적이 시점별로 자동 분리되어 PHD 환산에 적용됩니다 (최초공시일 면적은 용도변경일 기준 자동 판정)."}
          </p>
        </div>
        <LegalBadge />
      </div>

      {/* ① 주택부수토지 면적 (수정 가능) */}
      <FieldCard
        label={hasUsageChange ? "주택부수토지 면적 (양도시 기준)" : "주택부수토지 면적"}
        hint={
          hasUsageChange
            ? `용도변경 입력 감지 — 양도시 면적 ${autoLandArea.toFixed(2)} ㎡ 자동 적용. 취득시 면적은 용도변경 입력값으로 별도 계산되어 PHD 환산에 자동 반영됩니다.`
            : autoLandArea > 0
            ? `자동 계산: ${autoLandArea.toFixed(2)} ㎡ (전체 토지 × 주택연면적 비율). 최초 공시 당시 전체가 주택이었다면 전체 토지 면적으로 수정하세요.`
            : "면적 정보가 없어 자동 계산 불가. 직접 입력하세요."
        }
        unit="㎡"
      >
        <DecimalInput
          value={asset.phdResidentialLandArea}
          onChange={(v) => onChange({ phdResidentialLandArea: v })}
          placeholder={autoLandArea > 0 ? autoLandArea.toFixed(2) : "면적 입력"}
          disabled={hasUsageChange}
        />
      </FieldCard>

      {/* ② 최초 고시일 */}
      <FieldCard
        label="최초 고시일"
        required
        hint="개별주택가격이 처음 고시된 날짜 (주택공시가격알리미 확인)"
      >
        <DateInput
          value={asset.phdFirstDisclosureDate}
          onChange={(v) => onChange({ phdFirstDisclosureDate: v })}
        />
      </FieldCard>

      {/* ③ 최초 고시 개별주택가격 P_F */}
      <FieldCard
        label="최초 고시 개별주택가격"
        required
        hint="최초 고시일 당시 공시된 개별주택가격 (원)"
        unit="원"
      >
        <CurrencyInput
          label=""
          value={asset.phdFirstDisclosureHousingPrice}
          onChange={(v) => onChange({ phdFirstDisclosureHousingPrice: v })}
          placeholder="원"
          hideUnit
          required
        />
      </FieldCard>

      {/* ④ 양도시 개별주택가격 P_T (검용주택 입력과 자동 동기화) */}
      <FieldCard
        label="양도시 개별주택가격"
        required
        hint="양도일 당시 공시된 개별주택가격. 위 검용주택 영역의 양도시 개별주택공시가격과 자동 동기화"
        unit="원"
      >
        <CurrencyInput
          label=""
          value={asset.phdTransferHousingPrice || asset.mixedTransferHousingPrice}
          onChange={(v) => onChange({ phdTransferHousingPrice: v })}
          placeholder="원"
          hideUnit
          required
        />
      </FieldCard>

      {/* ⑤ 1990.8.30. 이전 취득 토지 환산 (조건부) */}
      {isPre1990 && (
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
          acquisitionArea={effectiveLandArea > 0 ? String(effectiveLandArea) : undefined}
          jibun={asset.addressJibun || undefined}
          acquisitionDate={acqDate || undefined}
          transferDate={transferDate}
          /* onCalculatedPrice 콜백은 미사용 — 위 useMemo가 ㎡당 가액을 직접 phdLandPricePerSqmAtAcq에 주입 */
        />
      )}

      {/* ⑥ 3-시점 기준시가 입력 */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">
          3시점 기준시가 입력 — 토지 단위 공시지가(원/㎡) + 건물 기준시가(원)
        </p>

        <ThreePointStandardPriceInput
          targetLabel="주택"
          jibun={asset.addressJibun || undefined}
          landArea={effectiveLandArea > 0 ? effectiveLandArea.toFixed(4) : undefined}
          // 취득시 — 토지 취득일 기준
          acquisitionDate={asset.landAcquisitionDate || asset.acquisitionDate}
          landPriceYearAtAcq={asset.phdLandPriceYearAtAcq}
          landPriceYearAtAcqIsManual={asset.phdLandPriceYearAtAcqIsManual}
          onLandPriceYearAtAcqChange={(year, isManual) =>
            onChange({ phdLandPriceYearAtAcq: year, phdLandPriceYearAtAcqIsManual: isManual })
          }
          landPricePerSqmAtAcq={asset.phdLandPricePerSqmAtAcq}
          onLandPricePerSqmAtAcqChange={(v) => onChange({ phdLandPricePerSqmAtAcq: v })}
          buildingStdPriceAtAcq={asset.phdBuildingStdPriceAtAcq}
          onBuildingStdPriceAtAcqChange={(v) => onChange({ phdBuildingStdPriceAtAcq: v })}
          // 최초공시일
          firstDisclosureDate={asset.phdFirstDisclosureDate}
          landPriceYearAtFirst={asset.phdLandPriceYearAtFirst}
          landPriceYearAtFirstIsManual={asset.phdLandPriceYearAtFirstIsManual}
          onLandPriceYearAtFirstChange={(year, isManual) =>
            onChange({ phdLandPriceYearAtFirst: year, phdLandPriceYearAtFirstIsManual: isManual })
          }
          landPricePerSqmAtFirst={asset.phdLandPricePerSqmAtFirst}
          onLandPricePerSqmAtFirstChange={(v) => onChange({ phdLandPricePerSqmAtFirst: v })}
          buildingStdPriceAtFirst={asset.phdBuildingStdPriceAtFirst}
          onBuildingStdPriceAtFirstChange={(v) => onChange({ phdBuildingStdPriceAtFirst: v })}
          // 양도시
          transferDate={transferDate}
          landPriceYearAtTransfer={asset.phdLandPriceYearAtTransfer}
          landPriceYearAtTransferIsManual={asset.phdLandPriceYearAtTransferIsManual}
          onLandPriceYearAtTransferChange={(year, isManual) =>
            onChange({
              phdLandPriceYearAtTransfer: year,
              phdLandPriceYearAtTransferIsManual: isManual,
            })
          }
          landPricePerSqmAtTransfer={asset.phdLandPricePerSqmAtTransfer}
          onLandPricePerSqmAtTransferChange={(v) => onChange({ phdLandPricePerSqmAtTransfer: v })}
          buildingStdPriceAtTransfer={asset.phdBuildingStdPriceAtTransfer}
          onBuildingStdPriceAtTransferChange={(v) =>
            onChange({ phdBuildingStdPriceAtTransfer: v })
          }
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        공시지가는{" "}
        <span className="font-medium">부동산공시가격알리미(realtyprice.kr)</span>
        에서, 건물기준시가는{" "}
        <span className="font-medium">국세청 홈택스 &gt; 기준시가 조회</span>를 이용하세요.
      </p>
    </div>
  );
}
