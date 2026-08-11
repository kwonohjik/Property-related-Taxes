"use client";

/**
 * 3-시점 공시지가 입력 컴포넌트
 *
 * 취득시 / 최초공시일 / 양도시 3개 시점의 토지 단위 공시지가와
 * 건물 기준시가를 입력받는다.
 *
 * 각 시점별 연도 선택은 landPriceYearOptions()의 추천값이 기본으로 선택되며,
 * 사용자가 수동 변경 시 "수동" 배지와 "↻ 자동" 복원 버튼이 표시된다.
 *
 * jibun + year 제공 시 Vworld 개별공시지가 자동 조회 버튼 활성화.
 * 공시지가(원/㎡)와 면적(㎡)이 모두 있으면 토지기준시가를 표시한다.
 *
 * 법령 근거: 소득세법 시행령 §164 ⑤
 */

import { PointBlock } from "./ThreePointPointBlock";
import { ThreePointAssetMajorRender } from "./ThreePointAssetMajorRender";
import {
  MultiPointBuildingStdPriceModal,
  type MultiPointStdPriceApply,
} from "@/components/calc/building-std-price/MultiPointBuildingStdPriceModal";
import type { AddressValue } from "@/components/ui/address-search";
import { isAcq2001LocationIndexTrack } from "@/lib/calc/phd-acq-land-price-track";
import { pickAcqLocationIndexLandPrice } from "@/lib/calc/phd-acq-land-price-track";
import { landPriceYearOf } from "@/lib/calc/building-std-batch-apply";
import { sameLandPriceYear } from "@/lib/calc/building-std-batch-apply";
import { SEPARATE_LAND_ACQ_LANDPRICE_HINT } from "@/lib/calc/building-std-batch-apply";

// ─── Props ────────────────────────────────────────────────────────

export interface ThreePointStandardPriceInputProps {
  // 취득시
  acquisitionDate: string;
  /**
   * 취득시 **부수토지 개별공시지가** 추천 연도 전용 기준일(선택). 이 값은 부수토지 기준시가
   * (= 공시지가 × 면적, land value)용이므로 **토지 취득일** 기준이어야 한다(§166⑥ 토지·건물 취득일 상이).
   * ※ 건물 위치지수용 공시지가가 아니다 — 건물 기준시가·batch·신축연도는 acquisitionDate(건물 취득일) 유지.
   * 미주입 시 acquisitionDate fallback(토지·건물 취득일 동일 시 동일값).
   */
  acqLandReferenceDate?: string;
  landPriceYearAtAcq: string;
  landPriceYearAtAcqIsManual: boolean;
  onLandPriceYearAtAcqChange: (year: string, isManual: boolean) => void;
  landPricePerSqmAtAcq: string;
  onLandPricePerSqmAtAcqChange: (v: string) => void;
  /**
   * 취득 ≤2000 — 2001.1.1 현재 공시지가(원/㎡). **위치지수 트랙**(§164⑤·`phd-acq-land-price-track.ts`).
   * 배치 모달이 입력받은 2001값의 저장처 + 재오픈 시 복원 시드.
   * 미주입 시 종전 동작(≤2000 취득은 빈 값 시드 + applyBatch 드롭) 유지 — 단독주택 경로 회귀 방어.
   */
  landPricePerSqmAtAcq2001?: string;
  onLandPricePerSqmAtAcq2001Change?: (v: string) => void;
  buildingStdPriceAtAcq: string;
  onBuildingStdPriceAtAcqChange: (v: string) => void;

  // 최초공시일
  firstDisclosureDate: string;
  landPriceYearAtFirst: string;
  landPriceYearAtFirstIsManual: boolean;
  onLandPriceYearAtFirstChange: (year: string, isManual: boolean) => void;
  landPricePerSqmAtFirst: string;
  onLandPricePerSqmAtFirstChange: (v: string) => void;
  buildingStdPriceAtFirst: string;
  onBuildingStdPriceAtFirstChange: (v: string) => void;

  // 양도시
  transferDate: string;
  landPriceYearAtTransfer: string;
  landPriceYearAtTransferIsManual: boolean;
  onLandPriceYearAtTransferChange: (year: string, isManual: boolean) => void;
  landPricePerSqmAtTransfer: string;
  onLandPricePerSqmAtTransferChange: (v: string) => void;
  buildingStdPriceAtTransfer: string;
  onBuildingStdPriceAtTransferChange: (v: string) => void;

  /** 지번 주소 — Vworld 개별공시지가 조회용 */
  jibun?: string;
  /** 토지 면적 (㎡) — 토지기준시가 = 공시지가 × 면적 */
  landArea?: string;
  /**
   * 주택 건물 연면적 (㎡) — 3시점 일괄 계산 모달의 첫 부분(주택) 연면적 자동채움용.
   * 겸용주택 주택분 등에서 상위 화면 주택 연면적을 전달. 미주입 시 모달 연면적 빈 값(종전).
   */
  housingFloorArea?: string;
  /** 상가 연면적(문자열) — 겸용 배치 모달 상가 행 자동채움용. 미주입 시 주택 행만 시드. */
  commercialFloorArea?: string;
  /**
   * 입력값의 대상 명시 — 라벨에 prefix 적용. 겸용주택 PHD 등 주택분과 상가분이
   * 같은 화면에 노출되는 컨텍스트에서 어느 쪽 입력인지 구별 표시용.
   * 예: "주택" → "주택부수토지 공시지가", "주택 건물기준시가".
   * 미주입 시 기존 라벨 유지 (단일 자산 PHD 등 backward compat).
   */
  targetLabel?: string;
  /**
   * 겸용주택 + 보유 중 일부 용도변경에서 최초공시일 < 용도변경일 인 경우(Case A) 전용.
   * true 일 때 ① 취득시 · ② 최초공시일 시점에 토지·건물 기준시가를
   * "주택분 / 상가분" 두 컬럼으로 분리 입력·표시한다 (양도시 면적 기준 분리).
   * ③ 양도시는 그대로 주택분만 표시.
   */
  splitHousingCommercialForAcqAndFirst?: boolean;
  /**
   * Case A 분리 모드에서 ① 취득시 · ② 최초공시일 토지기준시가 표시용.
   * 주택부수토지 면적(㎡) — `splitHousingCommercialForAcqAndFirst === true` 일 때만 의미.
   */
  housingLandArea?: string;
  /**
   * Case A 분리 모드에서 상가부수토지 면적(㎡).
   */
  commercialLandArea?: string;
  /**
   * Case A 분리 모드 — 취득시 상가건물 기준시가 (원). 미주입 시 입력 위젯 표시 안 함.
   */
  commercialBuildingStdPriceAtAcq?: string;
  onCommercialBuildingStdPriceAtAcqChange?: (v: string) => void;
  /**
   * Case A 분리 모드 — 최초공시일 상가건물 기준시가 (원).
   */
  commercialBuildingStdPriceAtFirst?: string;
  onCommercialBuildingStdPriceAtFirstChange?: (v: string) => void;
  /**
   * Case A 분리 모드 — 양도시 상가건물 기준시가 (원). 메인 양도시 섹션의
   * `mixedTransferCommercialBuildingPrice` 와 동일 필드를 양방향 read/write 한다 (별도 폼 필드 X).
   */
  commercialBuildingStdPriceAtTransfer?: string;
  onCommercialBuildingStdPriceAtTransferChange?: (v: string) => void;
  /**
   * true 시 ③ 양도시 컬럼 전체를 렌더링하지 않음.
   * Case A 4-part 통합 모드에서 양도시 섹션이 외부(MixedUseStandardPriceInputs)로 이동 시 사용.
   */
  hideTransferColumn?: boolean;
  /**
   * 건물기준시가 계산기 모달(BuildingStdPriceModalButton) snapshotKey 접두.
   * 예: `bsp-${assetId}-phd`. 주입 시 시점·주택/상가별 고유 key로 입력 스냅샷 복원.
   * 미주입 시 계산기 버튼은 표시되나 스냅샷 복원은 생략.
   */
  stdPriceSnapshotPrefix?: string;
  /** 건물기준시가 계산기 모달 소재지 주소 prefill (미주입 시 모달 내 재입력). */
  stdPriceAddress?: AddressValue;
  /**
   * true 시 시점별 필드별 계산기 버튼 대신 **3시점 일괄 계산 버튼 1개**를 노출한다.
   * (단일 주택 PHD 전용. 미주입 시 기존 필드별 버튼 유지 — mixed-use 회귀 방지.)
   */
  enableBatchCalc?: boolean;
  /**
   * 렌더 축. "asset-major"(겸용 Case A 전용) 시 시점별 대신 자산별(주택/상가) 그룹 × 3시점으로 전치.
   * splitMode(데이터·6값 배치)와 직교 — asset-major는 splitMode=true 유지 전제.
   */
  layout?: "time-major" | "asset-major";
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────

export function ThreePointStandardPriceInput(props: ThreePointStandardPriceInputProps) {
  // Case A 분기 라벨 결정 (4부분 분리 모드)
  const splitMode = props.splitHousingCommercialForAcqAndFirst === true;

  // 시점별 섹션 헤더 라벨
  const targetSuffix = props.targetLabel ? `${props.targetLabel}분 ` : "";
  const acqLabel = splitMode
    ? "① 취득시 기준시가 (양도시 면적 기준 분리)"
    : `① 취득시 ${targetSuffix}기준시가`;
  const firstLabel = splitMode
    ? "② 최초공시일 기준시가 (양도시 면적 기준 분리)"
    : `② 최초공시일 ${targetSuffix}기준시가`;
  // 양도시는 Case A 여부와 무관하게 항상 겸용 상태 (주택분만)
  const transferLabel = `③ 양도시 ${targetSuffix}기준시가`;

  // 3시점 일괄 계산 — 연도는 이벤트 날짜에서 도출(공시지가 기준연도 landPriceYear*와 구분).
  const yearOf = (d?: string) => {
    const y = d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : NaN;
    return Number.isFinite(y) && y > 1900 ? y : undefined;
  };
  // 취득연도 ≤ 2000이면 건물기준시가는 2001.1.1. 체계로 산정하므로 위치지수 공시지가도 2001.1.1. 현재 값이다
  // (§164⑤). props.landPricePerSqmAtAcq(취득연도 공시지가·**토지 트랙**)를 전용하면 오입력 →
  // 전용 위치지수 트랙(landPricePerSqmAtAcq2001)에서 시드해 재오픈 시 이전 입력을 복원한다.
  // 트랙 판정은 phd-acq-land-price-track.ts 단일 소스(모달 prefill 게이트와 동일 규칙).
  const acqYear = yearOf(props.acquisitionDate);
  const acqLandPerM2 = pickAcqLocationIndexLandPrice(
    acqYear,
    props.landPricePerSqmAtAcq,
    props.landPricePerSqmAtAcq2001,
  );
  /**
   * 공시지가 기준연도 — 아래 `PointBlock`이 실제로 쓰는 연도를 그대로 싣는다(사용자가 수동
   * 변경한 연도 포함). 미선택이면 5/31 공시 규칙 추천값. `year`(고시 체계 연도)와 별개 축이다.
   */
  const lpYear = (selected: string, refDate?: string) =>
    Number(selected) || landPriceYearOf(refDate);
  /**
   * 취득시 위치지수 공시지가의 축은 **건물 취득일**이다(§166⑥ 분리 — 부수토지 공시지가는
   * 토지 취득일, 건물 기준시가·batch는 건물 취득일. `transfer-phd-building-stdprice-calculator`
   * T9가 이 계약을 고정한다). ① 취득시 블록이 채우는 `landPricePerSqmAtAcq`는 **토지 취득일**
   * 기준연도 값이므로, 두 기준연도가 다르면 그대로 쓸 수 없다 — 비우고 조회 필드로 연다.
   */
  const acqLandRefDate = props.acqLandReferenceDate ?? props.acquisitionDate;
  const acqLandYearShared = sameLandPriceYear(props.acquisitionDate, acqLandRefDate);
  const acqPre2001Track = isAcq2001LocationIndexTrack(acqYear);
  const acqLandPriceSplit = !acqPre2001Track && !acqLandYearShared;
  const batchPoints = [
    {
      key: "acquisition" as const,
      label: "취득시",
      year: acqYear,
      landPriceYear: acqLandPriceSplit
        ? landPriceYearOf(props.acquisitionDate)
        : lpYear(props.landPriceYearAtAcq, acqLandRefDate),
      landPricePerM2: acqLandPriceSplit ? "" : acqLandPerM2,
      ...(acqLandPriceSplit
        ? { lookupLandPrice: true, landPriceHint: SEPARATE_LAND_ACQ_LANDPRICE_HINT }
        : {}),
    },
    {
      key: "firstDisclosure" as const,
      label: "최초공시일",
      year: yearOf(props.firstDisclosureDate),
      landPriceYear: lpYear(props.landPriceYearAtFirst, props.firstDisclosureDate),
      landPricePerM2: props.landPricePerSqmAtFirst,
    },
    {
      key: "transfer" as const,
      label: "양도시",
      year: yearOf(props.transferDate),
      landPriceYear: lpYear(props.landPriceYearAtTransfer, props.transferDate),
      landPricePerM2: props.landPricePerSqmAtTransfer,
    },
  ];
  // housing 3시점 + commercial(양도 항상, 취득·최초공시는 Case A 산출 시) 라우팅. 값 있는 시점만.
  const applyBatch = (v: MultiPointStdPriceApply) => {
    if (v.acquisition?.housing != null) props.onBuildingStdPriceAtAcqChange(String(v.acquisition.housing));
    if (v.firstDisclosure?.housing != null) props.onBuildingStdPriceAtFirstChange(String(v.firstDisclosure.housing));
    if (v.transfer?.housing != null) props.onBuildingStdPriceAtTransferChange(String(v.transfer.housing));
    if (v.acquisition?.commercial != null)
      props.onCommercialBuildingStdPriceAtAcqChange?.(String(v.acquisition.commercial));
    if (v.firstDisclosure?.commercial != null)
      props.onCommercialBuildingStdPriceAtFirstChange?.(String(v.firstDisclosure.commercial));
    if (v.transfer?.commercial != null)
      props.onCommercialBuildingStdPriceAtTransferChange?.(String(v.transfer.commercial));
    // 공시지가 되돌려쓰기 — 모달에서 입력한 시점 공시지가를 외부 3시점 섹션에 반영.
    // 최초공시·양도는 동일 연도값이라 그대로 반영.
    if (v.landPrices?.firstDisclosure != null)
      props.onLandPricePerSqmAtFirstChange(v.landPrices.firstDisclosure);
    if (v.landPrices?.transfer != null)
      props.onLandPricePerSqmAtTransferChange(v.landPrices.transfer);
    // 취득은 **트랙이 갈린다**(§164⑤): ≤2000이면 모달 입력값은 2001.1.1 기준(위치지수 전용)이라
    // 취득당시 연도 토지값 필드에 넣으면 오염 → 전용 필드로 라우팅. ≥2001은 두 트랙이 같은 값 → 종전대로.
    // 종전에는 ≤2000을 **드롭**해 사용자 입력이 소실됐다(받을 그릇 부재). 핸들러 미주입 시 종전 동작 유지.
    // 토지·건물 취득일의 기준연도가 다르면 모달 값은 **건물 취득일 연도**라 ① 취득시 블록의
    // 토지축 필드에 덮으면 부수토지 기준시가가 조용히 오염된다 — 받을 그릇이 없어 드롭한다
    // (일반건물 `buildGeneralBuildingBatchPatch`와 동일 규칙).
    if (v.landPrices?.acquisition != null && !acqLandPriceSplit) {
      if (isAcq2001LocationIndexTrack(acqYear))
        props.onLandPricePerSqmAtAcq2001Change?.(v.landPrices.acquisition);
      else props.onLandPricePerSqmAtAcqChange(v.landPrices.acquisition);
    }
  };

  // 겸용 상가(취득·양도)는 전용 ③ 상가 기준시가 섹션(MixedUseAssetMajorStdPrice/Legacy)이 전담한다.
  // PHD 3시점 버튼은 주택분 전용 — Case A(splitMode·4부분 분리)만 상가 포함(양도 상가 콜백 라우팅은
  // splitMode에서만 발화하므로 M1 일치). Case B는 상가 UI 미노출, 양도 상가는 ③ 섹션에서 동일 필드로 입력.
  const enableCommercial = splitMode;

  // asset-major(Case A)는 상단 단일 버튼 대신 주택/상가 섹션 헤더에 런처 2개를 배치한다(D1) —
  // 버튼 조립은 자식(ThreePointAssetMajorRender)이 담당, 여기선 배치 데이터만 전달(800줄 정책).
  // 두 런처 모두 동일한 결합 모달(6값·commercialAcqFirstMode)을 열어 일관성·스냅샷을 보존한다.
  // (계획: mixed-use-case-a-per-section-stdprice-calculator.plan.md §4)
  const assetMajor = props.layout === "asset-major";

  return (
    <div className="space-y-3">
      {props.enableBatchCalc && !assetMajor && (
        <div className="flex justify-end">
          <MultiPointBuildingStdPriceModal points={batchPoints} onApply={applyBatch} enableCommercial={enableCommercial} commercialAcqFirstMode={splitMode} snapshotPrefix={props.stdPriceSnapshotPrefix} jibun={props.jibun} initialAddress={props.stdPriceAddress} housingFloorAreaPrefill={props.housingFloorArea} commercialFloorAreaPrefill={props.commercialFloorArea} />
        </div>
      )}
      {assetMajor ? (
        <ThreePointAssetMajorRender {...props} batchPoints={batchPoints} onBatchApply={applyBatch} />
      ) : (
      <>
      <PointBlock
        label={acqLabel}
        hideBuildingCalcButton={props.enableBatchCalc}
        tone="amber"
        referenceDate={props.acqLandReferenceDate ?? props.acquisitionDate}
        selectedYear={props.landPriceYearAtAcq}
        isManual={props.landPriceYearAtAcqIsManual}
        onYearChange={props.onLandPriceYearAtAcqChange}
        landPricePerSqm={props.landPricePerSqmAtAcq}
        onLandPricePerSqmChange={props.onLandPricePerSqmAtAcqChange}
        buildingStdPrice={props.buildingStdPriceAtAcq}
        onBuildingStdPriceChange={props.onBuildingStdPriceAtAcqChange}
        jibun={props.jibun}
        landArea={props.landArea}
        housingFloorArea={props.housingFloorArea}
        commercialFloorArea={props.commercialFloorArea}
        targetLabel={props.targetLabel}
        splitMode={splitMode}
        housingLandArea={props.housingLandArea}
        commercialLandArea={props.commercialLandArea}
        commercialBuildingStdPrice={props.commercialBuildingStdPriceAtAcq}
        onCommercialBuildingStdPriceChange={props.onCommercialBuildingStdPriceAtAcqChange}
        buildingStdSnapshotKey={props.stdPriceSnapshotPrefix ? `${props.stdPriceSnapshotPrefix}-acq` : undefined}
        commercialBuildingStdSnapshotKey={props.stdPriceSnapshotPrefix ? `${props.stdPriceSnapshotPrefix}-acq-commercial` : undefined}
        stdPriceAddress={props.stdPriceAddress}
      />

      <PointBlock
        label={firstLabel}
        hideBuildingCalcButton={props.enableBatchCalc}
        tone="violet"
        referenceDate={props.firstDisclosureDate}
        selectedYear={props.landPriceYearAtFirst}
        isManual={props.landPriceYearAtFirstIsManual}
        onYearChange={props.onLandPriceYearAtFirstChange}
        landPricePerSqm={props.landPricePerSqmAtFirst}
        onLandPricePerSqmChange={props.onLandPricePerSqmAtFirstChange}
        buildingStdPrice={props.buildingStdPriceAtFirst}
        onBuildingStdPriceChange={props.onBuildingStdPriceAtFirstChange}
        jibun={props.jibun}
        landArea={props.landArea}
        housingFloorArea={props.housingFloorArea}
        commercialFloorArea={props.commercialFloorArea}
        targetLabel={props.targetLabel}
        splitMode={splitMode}
        housingLandArea={props.housingLandArea}
        commercialLandArea={props.commercialLandArea}
        commercialBuildingStdPrice={props.commercialBuildingStdPriceAtFirst}
        onCommercialBuildingStdPriceChange={props.onCommercialBuildingStdPriceAtFirstChange}
        buildingStdSnapshotKey={props.stdPriceSnapshotPrefix ? `${props.stdPriceSnapshotPrefix}-first` : undefined}
        commercialBuildingStdSnapshotKey={props.stdPriceSnapshotPrefix ? `${props.stdPriceSnapshotPrefix}-first-commercial` : undefined}
        stdPriceAddress={props.stdPriceAddress}
      />

      {!props.hideTransferColumn && (
        <PointBlock
          label={transferLabel}
          hideBuildingCalcButton={props.enableBatchCalc}
          tone="emerald"
          referenceDate={props.transferDate}
          selectedYear={props.landPriceYearAtTransfer}
          isManual={props.landPriceYearAtTransferIsManual}
          onYearChange={props.onLandPriceYearAtTransferChange}
          landPricePerSqm={props.landPricePerSqmAtTransfer}
          onLandPricePerSqmChange={props.onLandPricePerSqmAtTransferChange}
          buildingStdPrice={props.buildingStdPriceAtTransfer}
          onBuildingStdPriceChange={props.onBuildingStdPriceAtTransferChange}
          jibun={props.jibun}
          landArea={props.landArea}
          housingFloorArea={props.housingFloorArea}
          commercialFloorArea={props.commercialFloorArea}
          targetLabel={props.targetLabel}
          splitMode={splitMode}
          housingLandArea={props.housingLandArea}
          commercialLandArea={props.commercialLandArea}
          commercialBuildingStdPrice={props.commercialBuildingStdPriceAtTransfer}
          onCommercialBuildingStdPriceChange={props.onCommercialBuildingStdPriceAtTransferChange}
          buildingStdSnapshotKey={props.stdPriceSnapshotPrefix ? `${props.stdPriceSnapshotPrefix}-transfer` : undefined}
          commercialBuildingStdSnapshotKey={props.stdPriceSnapshotPrefix ? `${props.stdPriceSnapshotPrefix}-transfer-commercial` : undefined}
          stdPriceAddress={props.stdPriceAddress}
        />
      )}
      </>
      )}
    </div>
  );
}
