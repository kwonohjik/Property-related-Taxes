/**
 * 기타토지 꼬리(양도일 현재) 근거 «철거ㆍ멸실» — **④ 전송 · ⑤ 렌더 · ⑧ 검증이 같이 읽는 술어** (NBL-STATE-HISTORY-E3-⑤ · E3f-1b · U-2 · 단일 소스).
 *
 * 엔진 leaf `demolished-input-issue.ts`가 «철거ㆍ멸실일 칸이 필요한가 · 종전 바닥면적·용도지역을 엔진이 읽는가 · 첫 결함 하나»를 소유한다 — 이 파일은 AssetForm에서 그 leaf가 읽는 사실(`DemolishedOnFacts`)을
 * 만들고 호출만 한다(자체 날짜·시행본 비교 금지). ⑤가 칸을 그리는 조건 = ⑧이 막는 조건 = ⑫′가 400을 내는 조건 = ④가 보내는 조건 = ⑭가 읽는 조건이 한 술어로 모인다(3중 패턴 — useEffect → store 미러링 없음).
 *
 * 사실의 출처: 모드·사건은 **와이어 값**(`stateHistoryWireFields` — 이력 질문이 적용되지 않거나 `changed`가 아니면 `""`·`[]`), 양도일 현재 「건축물 있음」은 ④가 싣는 값과 같은 `effectiveOtherHasBuildingOf`.
 * 축 B 둘째 이후 지분 카드는 칸이 없다 — `buildFractionalShareNblRecord`가 첫 카드의 nbl 칸을 상속하므로 첫 카드의 값이 ⑫에 같이 간다(엔진 계획서 K-28 구현 정정).
 *
 * 이 파일은 서버 모듈(`non-business-land-request.ts`)도 import하므로 React 컴포넌트를 import하지 않는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { getZoneAreaMultiplier } from "@/lib/tax-engine/local-tax-zone-multiplier";
import {
  demolishedFloorAreaRequired,
  demolishedFloorAreaWireValue,
  demolishedInputIssue,
  demolishedOnRequired,
  demolishedOnWireValue,
  type DemolishedInputIssuePart,
  type DemolishedOnFacts,
} from "@/lib/tax-engine/non-business-land/demolished-input-issue";
import type { PropertyTaxBasis } from "@/lib/tax-engine/non-business-land/property-tax-basis";
import type { PropertyTaxType } from "@/lib/tax-engine/non-business-land/types";
import { parseDecimal } from "./number-parse";
import { effectiveOtherHasBuildingOf, stateHistoryWireFields } from "./nbl-other-state-history-scope";

/**
 * 엔진 leaf가 읽는 사실. 기타토지 카드에서만 의미가 있어 호출처(아래 세 함수·⑫ refine)가 `other_land`로 게이트한다.
 * `declared`의 `|| "comprehensive"`는 ⑫·⑭와 같은 접기다 — 미선택 선언은 종합합산이라 근거 칸이 없고(leaf 거짓), 그 미선택 자체는 ⑧이 앞에서 따로 막는다.
 */
export function demolishedTailFactsOf(asset: AssetForm): DemolishedOnFacts {
  const wire = stateHistoryWireFields(asset);
  return {
    declared: (asset.nblOtherPropertyTaxType || "comprehensive") as PropertyTaxType,
    mode: wire.nblOtherStateHistoryMode,
    events: wire.nblOtherStateEvents,
    rawHasBuilding: effectiveOtherHasBuildingOf(asset),
    basis: (asset.nblOtherPropertyTaxBasis || undefined) as PropertyTaxBasis | undefined,
  };
}

/** 근거 «철거ㆍ멸실»(꼬리)의 철거ㆍ멸실일 **새 칸**이 필요한가 — ⑤ 칸 노출 · ⑧ 요구 · ④ 전송이 같은 값. 기타토지 카드가 아니면 거짓. */
export function demolishedOnFieldNeededOf(asset: AssetForm): boolean {
  return asset.nblLandType === "other_land" && demolishedOnRequired(demolishedTailFactsOf(asset));
}

/** 종전 바닥면적(과 용도지역)을 엔진이 읽는가 — 양도일 직전 과세기준일 ≥ 2024.6.1. 시행본. ⑤ 칸 노출 · ⑧ · ④가 같은 값(양도일 미입력·해석 불가 = 요구). */
export function demolishedFloorAreaNeededOf(asset: AssetForm, transferDate: string | undefined): boolean {
  return asset.nblLandType === "other_land" && demolishedFloorAreaRequired({ ...demolishedTailFactsOf(asset), transferDate });
}

/**
 * ④ 덮어쓰기 값 — `nbl*` prefix-pick은 저장된 stale 값을 그대로 싣는다. 칸이 필요하지 않으면 `""`로 덮어 숨은 값이 ⑫·엔진에 닿지 않게 한다(저장값은 지우지 않는다 — 이력 복원).
 * 기타토지 카드가 아니면 둘 다 `""`.
 */
export function demolishedTailWireFields(asset: AssetForm, transferDate: string | undefined): { nblOtherDemolishedOn: string; nblOtherDemolishedFloorArea: string } {
  if (asset.nblLandType !== "other_land") return { nblOtherDemolishedOn: "", nblOtherDemolishedFloorArea: "" };
  const facts = demolishedTailFactsOf(asset);
  return {
    nblOtherDemolishedOn: demolishedOnWireValue({ ...facts, demolishedOn: asset.nblOtherDemolishedOn }),
    nblOtherDemolishedFloorArea: demolishedFloorAreaWireValue({ ...facts, transferDate, floorArea: asset.nblOtherDemolishedFloorArea }),
  };
}

/** ⑧ — 철거ㆍ멸실일 → 종전 바닥면적 → 용도지역 순의 첫 결함(엔진 leaf — ⑫′와 같은 함수·같은 문구). 기타토지 카드가 아니거나 근거가 «철거ㆍ멸실»이 아니면 null. */
export function demolishedTailInputIssueOf(asset: AssetForm, transferDate: string | undefined): { part: DemolishedInputIssuePart; message: string } | null {
  if (asset.nblLandType !== "other_land") return null;
  return demolishedInputIssue({
    ...demolishedTailFactsOf(asset),
    demolishedOn: asset.nblOtherDemolishedOn,
    transferDate,
    floorArea: parseDecimal(asset.nblOtherDemolishedFloorArea),
    zoneType: asset.nblZoneType,
    zoneMapped: !!getZoneAreaMultiplier(asset.nblZoneType),
  });
}
