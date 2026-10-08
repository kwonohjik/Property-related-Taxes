/**
 * 「토지는 다른 원인으로 취득」(`landAcquisitionCause`) 입력 축의 **적용 범위** 단일 소스 — Phase D0 (G-6).
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §2.3 G-5·G-6
 *
 * 유일한 쓰기 지점(`NewConstructionLandAcqBlock`)은 건물 취득원인이 「신축」인 주택·건물(겸용 아님)에서만 렌더된다.
 * 그런데 ④는 저장값만 보고 보냈다 — 신축에서 켠 뒤 원인을 매매로 바꾸면 끄는 칸이 사라진 채 토지 상속 통산·
 * 신축비용 후퇴가 계속 계산에 쓰였다(실측). ⑤·④·⑥·⑧이 이 술어를 함께 쓴다(`self-owns-scope.ts`와 같은 규약 —
 * 범위 밖 잔재는 「없음」으로 읽고 값은 지우지 않는다).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isLandBuildingSplitable } from "./self-owns-scope";

/** 구조적 입력 — 사이드바 합계처럼 자산 일부만 들고 오는 호출부도 받는다(없으면 「범위 밖」). */
interface LandPartCauseScope {
  acquisitionCause?: string;
  assetKind?: string;
  isMixedUseHouse?: boolean;
}

/** ⑤ 블록 노출 — 건물 신축 + 주택·건물(겸용은 자체 4부분 안분이 축을 지배한다). */
export function landPartCauseApplicable(asset: LandPartCauseScope): boolean {
  return asset.acquisitionCause === "newConstruction" && isLandBuildingSplitable(asset.assetKind) && !asset.isMixedUseHouse;
}

/**
 * ⑤ 토글 상태·④·⑥·⑧이 읽는 **유효** 토지 취득원인 — 범위 밖 잔재는 `""`(토지도 자산 원인을 따른다).
 *
 * 취득일 분리(`hasSeperateLandAcquisitionDate`)도 켜져 있어야 한다 — 토글이 두 키를 함께 켜는데, 원인 전환이
 * 분리만 끄면(`CompanionAcquisitionCauseSection` 비-매매 전환 정리) 화면은 「켜짐」인데 ④가 토지 취득일을 보내지
 * 않아 토지 파트가 계산에서 빠졌다(화면 ≠ 계산). 남은 원인 값은 지우지 않는다 — 이 술어가 「없음」으로 읽는다.
 */
export function effectiveLandAcquisitionCause(
  asset: LandPartCauseScope & {
    landAcquisitionCause?: AssetForm["landAcquisitionCause"];
    hasSeperateLandAcquisitionDate?: boolean;
  },
): AssetForm["landAcquisitionCause"] {
  if (!landPartCauseApplicable(asset) || !asset.hasSeperateLandAcquisitionDate) return "";
  return asset.landAcquisitionCause ?? "";
}

/**
 * Q-4(계획서 §6 · D1 §10.2 T-4) — 토지 취득일(상속개시일·증여일)이 건물 취득일과 **같은 날**이면 원인 혼합을 받지 않는다.
 * 같은 날이면 주택 세율 기산 `max(법정 기산일, 건물 취득일)`이 통산을 무효로 만들고 `isSeparateAcquisition`도
 * false가 되어 파트 완결 규칙이 꺼진다 — 엔진은 틀리지 않으므로 ⑫는 막지 않고 ⑤ 안내·⑧ 차단만 둔다.
 */
export const LAND_CAUSE_SAME_DAY_MESSAGE =
  "토지와 건물의 취득일이 같으면 토지 취득원인을 따로 지정할 수 없습니다 — 토지 상속개시일(증여일)을 확인하세요";

export function landPartCauseSameDay(
  asset: Parameters<typeof effectiveLandAcquisitionCause>[0] & { landAcquisitionDate?: string; acquisitionDate?: string },
): boolean {
  return !!effectiveLandAcquisitionCause(asset) && !!asset.landAcquisitionDate && asset.landAcquisitionDate === asset.acquisitionDate;
}

/** 콤마 제거 후 정수 파싱 (CurrencyInput 저장 규약). */
function raw(v: string | undefined): number {
  const n = parseInt((v ?? "").replace(/,/g, ""), 10);
  return isFinite(n) ? n : 0;
}

/**
 * 별개 취득 **건물 파트 취득가액 입력값** — 「건물 신축 + 토지 상속·증여」에서는 「신축비용」 칸
 * (`fixedAcquisitionPrice`)이 정본이다(파트 칸을 따로 두면 같은 값을 두 번 받는다).
 * ④ 전송·⑥ 사이드바 합계·⑧ V1 필수가 **같은 후퇴**를 쓴다(3중 패턴 — 종전엔 ⑥만 없어 합계가 0으로 보였다).
 */
export function splitBuildingAcqPriceInput(
  asset: LandPartCauseScope & {
    landAcquisitionCause?: AssetForm["landAcquisitionCause"];
    hasSeperateLandAcquisitionDate?: boolean;
    buildingAcquisitionPrice?: string;
    fixedAcquisitionPrice?: string;
  },
): string | undefined {
  if (raw(asset.buildingAcquisitionPrice) > 0) return asset.buildingAcquisitionPrice;
  return effectiveLandAcquisitionCause(asset) ? asset.fixedAcquisitionPrice : asset.buildingAcquisitionPrice;
}
