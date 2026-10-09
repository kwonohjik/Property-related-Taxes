/**
 * 「토지는 다른 원인으로 취득」(`landAcquisitionCause`) 입력 축의 **적용 범위** 단일 소스 — Phase D0 (G-6).
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §2.3 G-5·G-6
 *
 * 유일한 쓰기 지점(`LandPartCauseBlock`)은 건물 취득원인이 「신축」·「매매」(D1-2)인 주택·건물(겸용 아님)에서만 렌더된다.
 * 그런데 ④는 저장값만 보고 보냈다 — 신축에서 켠 뒤 원인을 매매로 바꾸면 끄는 칸이 사라진 채 토지 상속 통산·
 * 신축비용 후퇴가 계속 계산에 쓰였다(실측). ⑤·④·⑥·⑧이 이 술어를 함께 쓴다(`self-owns-scope.ts`와 같은 규약 —
 * 범위 밖 잔재는 「없음」으로 읽고 값은 지우지 않는다).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isLandBuildingSplitable } from "./self-owns-scope";
import { isSec163_9LandProviso } from "@/lib/tax-engine/transfer-split-part-cause";

/**
 * ⑤ 안내·⑧ 차단 문구(D1-4a) — 1990.8.30. 전 상속·증여 토지. 엔진·⑫는 영 §164④ 가액(②)을 함께 받으면 계산하지만
 * (`landSec164Value`), 이 계산기 화면에는 그 입력 칸이 아직 없다 — **화면 사실**만 적는다(엔진 문구 `LAND_SEC164_REQUIRED_MESSAGE`와 다르다).
 * D1-4b가 입력 칸을 열면서 이 문구를 칸 이동 앵커가 있는 미완 오류로 교체한다.
 */
export const LAND_SEC164_SCREEN_MESSAGE =
  "1990.8.30. 개별공시지가 고시 전에 상속·증여받은 토지의 취득가액은 상속·증여 당시 평가액과 소득세법 시행령 §164④ 가액 중 "
  + "많은 금액인데, 이 계산기 화면은 §164④ 가액(토지등급 환산) 입력을 받지 않아 토지·건물을 따로 취득한 자산에서 "
  + "이 비교는 지원하지 않습니다 — 토지 상속개시일(증여일)을 확인하세요 (같은 법 시행령 §163⑨ 단서 1호)";

/** 구조적 입력 — 사이드바 합계처럼 자산 일부만 들고 오는 호출부도 받는다(없으면 「범위 밖」). */
interface LandPartCauseScope {
  acquisitionCause?: string;
  assetKind?: string;
  isMixedUseHouse?: boolean;
}

/** 토글을 둘 수 있는 건물 취득원인(= 호스트). 상속·증여 건물은 D2. */
export type LandCauseHost = "newConstruction" | "purchase";
export function isLandCauseHost(cause: string | undefined): cause is LandCauseHost {
  return cause === "newConstruction" || cause === "purchase";
}

/** ⑤ 블록 노출 — 건물 신축·매매 + 주택·건물(겸용은 자체 4부분 안분이 축을 지배한다). D1-2에서 매매로 확대. */
export function landPartCauseApplicable(asset: LandPartCauseScope): boolean {
  return isLandCauseHost(asset.acquisitionCause) && isLandBuildingSplitable(asset.assetKind) && !asset.isMixedUseHouse;
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
    landCauseHost?: string;
  },
): AssetForm["landAcquisitionCause"] {
  if (!landPartCauseApplicable(asset) || !asset.hasSeperateLandAcquisitionDate) return "";
  // D1-2 — 토글을 켠 호스트가 지금 취득원인과 같아야 한다. 신축에서 켠 뒤 매매로 바꾸면 매매에서도 「취득일 다름」이
  // 켜진 채라(`CompanionAcquisitionCauseSection`은 비-매매 전환에서만 끈다) 잔재가 되살아났다(UI 설계 §3 S1·S2').
  if (asset.landCauseHost !== asset.acquisitionCause) return "";
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

/**
 * ⑤ 날짜 안내(신축 블록·매매 날짜 영역 공용) — ⑧과 같은 술어. 차단은 ⑧(·⑫)이 하고 여기는 입력 중 안내.
 * Q-4 같은 날 → Q-7 1990.8.30. 전(영 §163⑨ 단서 1호) 순.
 */
export function landPartCauseDateNotice(
  asset: Parameters<typeof landPartCauseSameDay>[0],
): string | null {
  if (landPartCauseSameDay(asset)) return LAND_CAUSE_SAME_DAY_MESSAGE;
  if (isSec163_9LandProviso(effectiveLandAcquisitionCause(asset), asset.landAcquisitionDate)) return LAND_SEC164_SCREEN_MESSAGE;
  return null;
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
 * ⚠️ 신축 호스트만이다(D1-2) — 매매의 `fixedAcquisitionPrice`는 **총 취득가액**이고 별개 취득 중엔 숨겨진 칸이라,
 *    후퇴하면 화면에 없는 값이 건물 취득가액이 된다(UI 설계 §3 S7).
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
  return asset.acquisitionCause === "newConstruction" && effectiveLandAcquisitionCause(asset)
    ? asset.fixedAcquisitionPrice
    : asset.buildingAcquisitionPrice;
}
