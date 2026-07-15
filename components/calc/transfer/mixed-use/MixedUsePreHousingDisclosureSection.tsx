"use client";

/**
 * 겸용주택 + 개별주택가격 미공시 (§164⑦) 3-시점 환산 패널
 *
 * 일반 자산용 PreHousingDisclosureSection과 동일한 PHD 알고리즘을 사용하지만:
 *  - 토지 면적은 겸용주택의 "주택부수토지" 면적으로 자동 계산되어 readonly 표시
 *  - 양도시 개별주택가격은 mixedTransferHousingPrice를 자동 mirror
 *
 * 법령 근거: 소득세법 시행령 §164 ⑦ (개별주택가격·공동주택가격 미공시 주택 환산.
 *   건물분 기준시가는 §164⑤ 준용)
 */

import { useEffect, useMemo } from "react";
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ThreePointStandardPriceInput } from "../ThreePointStandardPriceInput";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { derivePhdResidentialLandArea } from "@/lib/calc/transfer-pre1990-phd-bridge";
import { round2 } from "@/lib/tax-engine/area-utils";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { derivePre1990PhdLandPricePerSqmAtAcqString } from "@/lib/calc/transfer-pre1990-phd-bridge";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  /** 양도일 (양도시 공시지가 기준연도용) */
  transferDate: string;
  onChange: (patch: Partial<AssetForm>) => void;
}

function LegalBadge() {
  return (
    <LawArticleModal
      legalBasis="소득세법 시행령 §164 ⑦"
      label="소득세법 시행령 §164⑦"
      className="inline-flex items-center rounded border border-blue-200 bg-blue-50/60 px-1.5 py-0.5 text-micro font-medium text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer dark:text-blue-300 dark:border-blue-900/50 dark:bg-blue-950/30"
    />
  );
}

export function MixedUsePreHousingDisclosureSection({
  asset,
  transferDate,
  onChange,
}: Props) {
  // 주택부수토지 면적 자동 계산 (겸용주택) — 사용자 미입력 시 기본값
  const residential = parseDecimal(asset.residentialFloorArea);
  const commercial = parseDecimal(asset.nonResidentialFloorArea);
  const totalLand = parseDecimal(asset.mixedUseTotalLandArea);
  const totalFloor = residential + commercial;
  // 자동 안분값 — 아래 표시(:119·:227)에서도 사용
  const autoLandArea = round2(totalFloor > 0 ? totalLand * (residential / totalFloor) : 0);
  // 주택부수토지 — bridge 단일 소스(`derivePhdResidentialLandArea`).
  // 자체 재구현(`parseDecimal(x) || autoLandArea`)은 적법한 0을 자동값으로 덮어써
  // bridge·API와 어긋났다(three-state 파괴 — D2와 동일 계열).
  const effectiveLandArea = derivePhdResidentialLandArea(asset);

  // 보유 중 일부 용도변경 케이스: 시점별 면적이 자동 분리 적용됨 (엔진에서 처리)
  const hasUsageChange =
    asset.hasPartialUsageChange === true &&
    !!asset.partialChangeDirection &&
    !!asset.partialChangeDate;

  // PHD §164⑦ Case A 식별 — 최초공시일 < 용도변경일 (전체 건물이 주택이었던 시점)
  // Case A: 취득시·최초공시 시점 입력란은 "전체 건물 기준시가" 의미 (주택+상가 합계 = 그 시점엔 모두 주택)
  // Case B: 모든 시점이 겸용 상태 → "주택분만" 의미 (현재 로직)
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

  // [의도적 예외] "useEffect → store 미러링 금지" 정책의 명시적 예외로 유지한다.
  // pre1990Enabled를 true로 한 번만 세팅하는 "수렴하는 boolean 래치"다 — 가드(!pre1990Enabled)가
  // 재발동을 차단해 무한 루프 위험이 없다(값 미러링이 아닌 단방향 latch). effect ②(phdLandPricePerSqmAtAcq
  // 값 미러링)는 제거했으나 이 래치는 유지: 깔끔한 제거는 hasPre1990 의미를 API 7곳·validate 3곳
  // (실가 §622 취득가액 필수 등) + companion 쌍둥이까지 재파생해야 하고, 실가/일반 환산 pre-1990 토지
  // 검증을 뒤집을 silent 회귀 위험이 커 tax-correctness 우선으로 보류한다.
  // (companion 동일 패턴: CompanionAcqPurchaseBlock.tsx)
  useEffect(() => {
    if (isPre1990 && !asset.pre1990Enabled) {
      onChange({ pre1990Enabled: true });
    }
  }, [isPre1990, asset.pre1990Enabled, onChange]);

  // 토지등급가액 환산 ㎡당 가액 — 단일 진실 헬퍼로 파생 (store 미저장 → display fallback로 전달).
  // 과거 useEffect → store(onChange) 미러링으로 이 값을 phdLandPricePerSqmAtAcq에 주입했으나,
  // "파생 계산 결과를 store에 저장"하는 정책 위반(무한 루프 위험)이라 제거됨. 동일 헬퍼를
  // API 변환(transfer-tax-api.ts)·validate(transfer-tax-validate-asset.ts)도 fallback으로 공유.
  const pre1990AutoPricePerSqmStr = derivePre1990PhdLandPricePerSqmAtAcqString(asset, transferDate);

  return (
    <div className="space-y-4 rounded-md border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">개별주택가격 미공시 취득 (3-시점 환산)</p>
        </div>
        <LegalBadge />
      </div>

      {/* ①② 주택부수토지 면적 · 최초 고시일 (한 행) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldCard
          label={hasUsageChange ? "주택부수토지 면적 (양도시 기준)" : "주택부수토지 면적"}
          unit="㎡"
          stacked
        >
          <DecimalInput
            value={asset.phdResidentialLandArea}
            onChange={(v) => onChange({ phdResidentialLandArea: v })}
            placeholder={autoLandArea > 0 ? autoLandArea.toFixed(2) : "면적 입력"}
            disabled={hasUsageChange}
          />
        </FieldCard>

        <FieldCard label="최초 고시일" required stacked>
          <DateInput
            value={asset.phdFirstDisclosureDate}
            onChange={(v) => onChange({ phdFirstDisclosureDate: v })}
          />
        </FieldCard>
      </div>

      {/* ③④ 최초 고시 개별주택가격 · 양도시 개별주택가격 (한 행, StandardPriceInput 자동조회) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StandardPriceInput
          propertyKind="house_individual"
          totalPrice={asset.phdFirstDisclosureHousingPrice}
          onTotalPriceChange={(v) => onChange({ phdFirstDisclosureHousingPrice: v })}
          jibun={asset.addressJibun || undefined}
          referenceDate={asset.phdFirstDisclosureDate}
          label="최초 고시 개별주택가격"
          required
        />
        {/* 양도시 개별주택가격 — 단일 입력(상단 양도 sub-block은 PHD ON 시 숨김) */}
        <StandardPriceInput
          propertyKind="house_individual"
          totalPrice={asset.mixedTransferHousingPrice}
          onTotalPriceChange={(v) => onChange({ mixedTransferHousingPrice: v })}
          jibun={asset.addressJibun || undefined}
          referenceDate={transferDate}
          label="양도시 개별주택가격"
          required
        />
      </div>

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
          enableBatchCalc
          jibun={asset.addressJibun || undefined}
          stdPriceSnapshotPrefix={`bsp-${asset.assetId}-phd`}
          stdPriceAddress={{
            road: asset.addressRoad,
            jibun: asset.addressJibun,
            building: asset.buildingName,
            detail: asset.addressDetail,
            lng: asset.longitude,
            lat: asset.latitude,
            pnu: asset.addressPnu,
          }}
          landArea={effectiveLandArea > 0 ? effectiveLandArea.toFixed(4) : undefined}
          // 3시점 일괄 계산 모달 첫 부분(주택) 연면적 자동채움 — 상위 화면의 **계산된 주택 연면적**
          // (residentialFloorArea = 전용+안분 공통, MixedUseAreaInputs 파생값·"주택 연면적" 표시값). 전용면적 아님.
          housingFloorArea={asset.residentialFloorArea || undefined}
          // Case A: ③ 양도시 컬럼은 MixedUseStandardPriceInputs 양도시 섹션으로 통합
          hideTransferColumn={isCaseA}
          // Case A 4부분 분리 모드 — ①·② 시점에서 토지·건물을 주택분/상가분 2 컬럼으로 분리
          splitHousingCommercialForAcqAndFirst={isCaseA}
          // Case A는 자산-우선(주택/상가 × 3시점) 전치 렌더. splitMode(데이터·배치)와 직교.
          // 양도까지 위젯이 흡수하므로 legacy 양도 4부분 섹션은 미렌더(MixedUseLegacyStdPrice).
          layout={isCaseA ? "asset-major" : undefined}
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
          // 건물 기준시가·batch·신축연도는 건물 취득일 기준(건물 std valuationYear ≥ 신축연도).
          // 단, 취득 부수토지 개별공시지가는 토지 취득일 기준(§166⑥, 부수토지 기준시가 = 공시지가 × 면적의
          // land value — 건물 위치지수용 아님) → acqLandReferenceDate로 분리(2026-07-11, B안).
          acquisitionDate={asset.acquisitionDate}
          acqLandReferenceDate={acqDate || undefined}
          landPriceYearAtAcq={asset.phdLandPriceYearAtAcq}
          landPriceYearAtAcqIsManual={asset.phdLandPriceYearAtAcqIsManual}
          onLandPriceYearAtAcqChange={(year, isManual) =>
            onChange({ phdLandPriceYearAtAcq: year, phdLandPriceYearAtAcqIsManual: isManual })
          }
          landPricePerSqmAtAcq={asset.phdLandPricePerSqmAtAcq || asset.mixedAcqLandPricePerSqm || pre1990AutoPricePerSqmStr}
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
          // 주택부수토지 공시지가는 독립 입력 — 연도 선택·Vworld 조회 버튼 노출.
          // 값은 phdLandPricePerSqm* (미입력 시 섹션 2 mixed 값으로 prefill·fallback).
        />
      </div>
    </div>
  );
}
