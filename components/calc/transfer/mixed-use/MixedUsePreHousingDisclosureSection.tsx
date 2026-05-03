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

  // PHD §164⑤ Case A 식별 — 최초공시일 < 용도변경일 (전체 건물이 주택이었던 시점)
  // Case A: 취득시·최초공시 시점 입력란은 "전체 건물 기준시가" 의미 (주택+상가 합계 = 그 시점엔 모두 주택)
  // Case B: 모든 시점이 검용 상태 → "주택분만" 의미 (현재 로직)
  const isCaseA = useMemo(() => {
    if (!hasUsageChange) return false;
    if (!asset.phdFirstDisclosureDate || !asset.partialChangeDate) return false;
    const firstDate = new Date(asset.phdFirstDisclosureDate);
    const ucDate = new Date(asset.partialChangeDate);
    if (Number.isNaN(firstDate.getTime()) || Number.isNaN(ucDate.getTime())) return false;
    return firstDate < ucDate;
  }, [hasUsageChange, asset.phdFirstDisclosureDate, asset.partialChangeDate]);

  // 개별주택가격·토지 공시지가는 useEffect로 store 업데이트하지 않음 (무한 루프 방지).
  // 표시는 ThreePointStandardPriceInput에 mixed 값을 직접 전달, API는 fallback으로 처리.

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
            {hasUsageChange && !isCaseA && " 보유 중 일부 용도변경 입력이 있어 취득시·양도시 주택부수토지 면적이 시점별로 자동 분리되어 취득시 개별주택가격 역산에 적용됩니다 (최초공시일 면적은 용도변경일 기준 자동 판정)."}
          </p>
        </div>
        <LegalBadge />
      </div>

      {/* ① 주택부수토지 면적 (수정 가능) */}
      <FieldCard
        label={hasUsageChange ? "주택부수토지 면적 (양도시 기준)" : "주택부수토지 면적"}
        hint={
          hasUsageChange
            ? `용도변경 입력 감지 — 양도시 면적 ${autoLandArea.toFixed(2)} ㎡ 자동 적용. 취득시 면적은 용도변경 입력값으로 별도 계산되어 취득시 개별주택가격 역산에 자동 반영됩니다.`
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

      {/* 최초공시일 < 용도변경일 진입 안내 — Case A 4부분 분리 모드 */}
      {isCaseA && (
        <div className="rounded-lg bg-rose-100/60 border border-rose-200 px-3 py-2 text-xs text-rose-900 space-y-1">
          <p className="font-semibold">
            ⚠ 최초공시일({asset.phdFirstDisclosureDate || "—"})이 용도변경일보다 이전 — 4부분 안분 모드
          </p>
          <p>
            최초공시 시점에는 건물 전체가 아직 주택이었으나, 양도시 일부가 상가로 변경되었습니다.
            아래 ① 취득시·② 최초공시일 입력에서 건물기준시가를 <strong>주택건물 부분</strong>과 <strong>상가건물 부분</strong>으로 나누어 입력하세요(양도시 면적 기준).
          </p>
        </div>
      )}

      {/* ③ 최초 고시 개별주택가격 */}
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

      {/* ④ 양도시 개별주택가격 — 위 양도시 기준시가 섹션 값을 자동 사용 (read-only) */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-amber-800">양도시 개별주택가격 (자동)</p>
            <p className="mt-1 text-[11px] text-amber-700">
              위 양도시 기준시가 섹션의 개별주택공시가격을 자동으로 사용합니다.
            </p>
          </div>
          <p className="whitespace-nowrap text-sm font-semibold text-amber-900">
            {parseAmount(asset.mixedTransferHousingPrice) > 0
              ? `${parseAmount(asset.mixedTransferHousingPrice).toLocaleString()}`
              : "양도시 기준시가 섹션에서 입력하세요"}
          </p>
        </div>
      </div>

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
          // Case A: ③ 양도시 컬럼은 MixedUseStandardPriceInputs 양도시 섹션으로 통합
          hideTransferColumn={isCaseA}
          // Case A 4부분 분리 모드 — ①·② 시점에서 토지·건물을 주택분/상가분 2 컬럼으로 분리
          splitHousingCommercialForAcqAndFirst={isCaseA}
          housingLandArea={
            isCaseA && residential > 0 && totalFloor > 0
              ? autoLandArea.toFixed(2)
              : undefined
          }
          commercialLandArea={
            isCaseA && commercial > 0 && totalFloor > 0
              ? (totalLand - autoLandArea).toFixed(2)
              : undefined
          }
          // ① 취득시 상가건물 — 메인 취득시 섹션의 mixedAcqCommercialBuildingPrice 양방향 read/write
          // (별도 폼 필드 신설 X — 이전 phdCommercialBuildingStdPriceAtAcq deprecate, 동일 필드 공유)
          commercialBuildingStdPriceAtAcq={asset.mixedAcqCommercialBuildingPrice}
          onCommercialBuildingStdPriceAtAcqChange={(v) =>
            onChange({ mixedAcqCommercialBuildingPrice: v })
          }
          commercialBuildingStdPriceAtFirst={asset.phdCommercialBuildingStdPriceAtFirst}
          onCommercialBuildingStdPriceAtFirstChange={(v) =>
            onChange({ phdCommercialBuildingStdPriceAtFirst: v })
          }
          // ③ 양도시 상가건물 — 메인 양도시 섹션의 mixedTransferCommercialBuildingPrice를 양방향 read/write
          // (별도 폼 필드 신설 X — 같은 필드를 두 곳에서 편집 가능, 자동 동기화)
          commercialBuildingStdPriceAtTransfer={asset.mixedTransferCommercialBuildingPrice}
          onCommercialBuildingStdPriceAtTransferChange={(v) =>
            onChange({ mixedTransferCommercialBuildingPrice: v })
          }
          // 취득시 — 토지 취득일 기준
          acquisitionDate={asset.landAcquisitionDate || asset.acquisitionDate}
          landPriceYearAtAcq={asset.phdLandPriceYearAtAcq}
          landPriceYearAtAcqIsManual={asset.phdLandPriceYearAtAcqIsManual}
          onLandPriceYearAtAcqChange={(year, isManual) =>
            onChange({ phdLandPriceYearAtAcq: year, phdLandPriceYearAtAcqIsManual: isManual })
          }
          landPricePerSqmAtAcq={asset.phdLandPricePerSqmAtAcq || asset.mixedAcqLandPricePerSqm}
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
          landPricePerSqmAtTransfer={asset.phdLandPricePerSqmAtTransfer || asset.mixedTransferLandPricePerSqm}
          onLandPricePerSqmAtTransferChange={(v) => onChange({ phdLandPricePerSqmAtTransfer: v })}
          buildingStdPriceAtTransfer={asset.phdBuildingStdPriceAtTransfer}
          onBuildingStdPriceAtTransferChange={(v) =>
            onChange({ phdBuildingStdPriceAtTransfer: v })
          }
          // 검용주택 — 토지는 같은 지번이므로 섹션 2의 공시지가를 자동 미러링 (read-only 표시)
          landAutoSyncAtAcq={{
            label: "위 취득시 기준시가 섹션의 개별공시지가를 자동 사용",
          }}
          landAutoSyncAtTransfer={{
            label: "위 양도시 기준시가 섹션의 개별공시지가를 자동 사용",
          }}
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
