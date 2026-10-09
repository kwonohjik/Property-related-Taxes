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
import { effectiveSelfOwns } from "./self-owns-scope";
import { isSec163_9BuildingProviso } from "@/lib/tax-engine/transfer-split-part-cause";

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
): "" | "inheritance" | "gift" {
  if (!landPartCauseApplicable(asset) || !asset.hasSeperateLandAcquisitionDate) return "";
  // D1-2 — 토글을 켠 호스트가 지금 취득원인과 같아야 한다. 신축에서 켠 뒤 매매로 바꾸면 매매에서도 「취득일 다름」이
  // 켜진 채라(`CompanionAcquisitionCauseSection`은 비-매매 전환에서만 끈다) 잔재가 되살아났다(UI 설계 §3 S1·S2').
  if (asset.landCauseHost !== asset.acquisitionCause) return "";
  // D2의 `"purchase"`(상속·증여 호스트 전용)가 D1 호스트에 남아도 D1 의미로 읽지 않는다 — 반환형이 곧 안전장치다.
  // (런타임 값은 종전 그대로 — 타입에 없는 `carryover_gift`가 저장 이력·테스트 시드로 흘러와도 D1 격자(⑧≡⑫)가 같은 값을 읽는다.)
  return asset.landAcquisitionCause === "purchase" ? "" : ((asset.landAcquisitionCause ?? "") as "" | "inheritance" | "gift");
}

// ─── D2 — 건물 상속·증여 + 토지 매매 (계획서 §12 · D2 UI 설계 §3.1) ───────────────────────────────
// D1 술어를 `"purchase"`까지 넓히지 않는다: truthy 소비처 약 9곳이 매매 토지를 상속 토지 UI·검증으로 읽는다.
// D2는 별도 술어 + 합성 술어(`landCauseMixActive`·`engineLandOverlay`)로 ④·⑧·PHD·소유자 분리·같은 날에 공급한다.

type BuildingCauseMixScope = LandPartCauseScope & {
  landAcquisitionCause?: AssetForm["landAcquisitionCause"];
  hasSeperateLandAcquisitionDate?: boolean;
  landCauseHost?: string;
  transferType?: string;
};

/** D2 토글이 놓일 수 있는 건물 취득원인(= 상속·증여 호스트). 주택·건물(겸용 아님). */
export function buildingCauseMixApplicable(asset: LandPartCauseScope): boolean {
  return (asset.acquisitionCause === "inheritance" || asset.acquisitionCause === "gift")
    && isLandBuildingSplitable(asset.assetKind) && !asset.isMixedUseHouse;
}

/**
 * D2 유효 여부 — 반환 = **건물** 원인(`inheritance`·`gift`) 또는 `""`.
 * 호스트 태그가 지금 취득원인과 같고 overlay가 `purchase`일 때만 성립한다(D1 잔재 `inheritance`·`gift` overlay는 무효 —
 * 상속 → 증여 전환은 태그를 비운다). 부담부증여는 ④가 분리 입력을 보내지 않으므로(`isSplitPayloadActive`) 무효.
 */
export function effectiveBuildingCauseMix(asset: BuildingCauseMixScope): "" | "inheritance" | "gift" {
  if (!buildingCauseMixApplicable(asset) || !asset.hasSeperateLandAcquisitionDate) return "";
  if (asset.landCauseHost !== asset.acquisitionCause) return "";
  if (asset.landAcquisitionCause !== "purchase" || asset.transferType === "burdened_gift") return "";
  return asset.acquisitionCause === "gift" ? "gift" : "inheritance";
}

/** 합성 술어 — D1(토지 상속·증여) 또는 D2(건물 상속·증여 + 토지 매매) 중 하나라도 유효. PHD 무시·소유자 분리 상호 잠금·같은 날의 기준. */
export function landCauseMixActive(asset: Parameters<typeof effectiveLandAcquisitionCause>[0] & BuildingCauseMixScope): boolean {
  return !!effectiveLandAcquisitionCause(asset) || !!effectiveBuildingCauseMix(asset);
}

/**
 * 화면에 없는 **stale 분리 입력**인가 — 상속·증여 호스트(주택·건물, 겸용 아님)에서 D2 토글이 유효하지 않은데
 * `hasSeperateLandAcquisitionDate`만 켜져 있는 상태.
 *
 * 상속·증여 호스트에는 「취득일 다름」을 따로 켤 UI가 없다(`CompanionAcquisitionCauseSection`이 비-매매 전환에서 끈다) — 일반건물에서
 * 켠 뒤 자산 종류를 주택·건물로 바꾸거나(`hasSeperate…`를 끄지 않는 전환 patch), 2026-07-30 이전 저장분이 이 상태를 만든다.
 * 화면은 자산 단위 상속 계산을 보여주는데 ④·⑧이 토지 취득일 분리를 읽으면 입력 칸 없는 요구(D2 Y8)나 토지를 상속으로 읽는
 * 침묵 계산이 된다 → 읽는 쪽이 「분리 없음」으로 읽는다(D0 G-6 방식 — 저장값은 지우지 않는다).
 * ⚠️ 소유자 분리(`selfOwns≠both`)는 건드리지 않는다(그 경로의 `landAcquisitionDate` 후퇴 송신은 종전 그대로).
 */
export function hasStaleSplitInput(
  asset: BuildingCauseMixScope & { selfOwns?: "both" | "building_only" | "land_only" },
): boolean {
  if (!asset.hasSeperateLandAcquisitionDate) return false;
  if (!buildingCauseMixApplicable(asset) || effectiveBuildingCauseMix(asset)) return false;
  // 부담부증여는 자체 경로의 분리 입력을 보호한다(④가 이미 분리 입력을 보내지 않는다). 단 D2 토글이 만든 잔재(호스트 태그 상속·증여 +
  // overlay `purchase`)는 stale이다 — 증여 D2 ON 뒤 양도 형태를 부담부증여로 바꾸면 토글(`BuildingCauseMixBlock`)이 숨어 끌 수 없는데
  // `hasSeperate…`만 켜져 ⑧이 화면에 없는 칸(`landAcquisitionPrice`)을 요구했다(D2-2 Check). 부담부증여 자체 경로는 이 두 키를 쓰지 않는다.
  if (asset.transferType === "burdened_gift") {
    const d2Residue = asset.landAcquisitionCause === "purchase" && (asset.landCauseHost === "inheritance" || asset.landCauseHost === "gift");
    if (!d2Residue) return false;
  }
  return (effectiveSelfOwns(asset as Pick<AssetForm, "assetKind" | "isMixedUseHouse" | "selfOwns">) ?? "both") === "both";
}

/**
 * ④·⑧·⑥이 자산을 읽기 전에 통과시키는 **D2 정규화 사본** — (1) stale 분리 입력을 「분리 없음」으로, (2) D2 유효 시 건물 방식을
 * `actual`로. 둘 다 해당 없으면 같은 객체를 돌려준다.
 */
export function normalizeBuildingCauseInputs<T extends BuildingCauseMixScope & { selfOwns?: "both" | "building_only" | "land_only"; buildingAcqMode?: string }>(asset: T): T {
  if (hasStaleSplitInput(asset)) return { ...asset, hasSeperateLandAcquisitionDate: false };
  return withBuildingActualWhenMix(asset);
}

/**
 * D2 유효 시 건물 파트 방식을 `"actual"`로 고정한 사본 — 상속·증여 건물의 평가액은 실지거래가액이다(영 §163⑨). ④가 전송하는 값과
 * ⑧·⑥이 읽는 값을 하나로 맞춘다(3중 패턴): 남은 환산·감정 플래그(stale)가 ⑧ 요구·⑥ 합계를 바꾸지 않는다.
 * D2가 아니면 같은 객체를 돌려준다.
 */
export function withBuildingActualWhenMix<T extends BuildingCauseMixScope & { buildingAcqMode?: string }>(asset: T): T {
  return effectiveBuildingCauseMix(asset) && asset.buildingAcqMode !== "actual" ? { ...asset, buildingAcqMode: "actual" } : asset;
}

/** ④·⑧이 엔진에 보낼 토지 overlay — D1 유효 원인, 없으면 D2의 `"purchase"`, 둘 다 없으면 `""`. */
export function engineLandOverlay(
  asset: Parameters<typeof effectiveLandAcquisitionCause>[0] & BuildingCauseMixScope,
): "" | "inheritance" | "gift" | "purchase" {
  return effectiveLandAcquisitionCause(asset) || (effectiveBuildingCauseMix(asset) ? "purchase" : "");
}

/**
 * Q-4(계획서 §6 · D1 §10.2 T-4) — 토지 취득일(상속개시일·증여일)이 건물 취득일과 **같은 날**이면 원인 혼합을 받지 않는다.
 * 같은 날이면 주택 세율 기산 `max(법정 기산일, 건물 취득일)`이 통산을 무효로 만들고 `isSeparateAcquisition`도
 * false가 되어 파트 완결 규칙이 꺼진다 — 엔진은 틀리지 않으므로 ⑫는 막지 않고 ⑤ 안내·⑧ 차단만 둔다.
 */
export const LAND_CAUSE_SAME_DAY_MESSAGE =
  "토지와 건물의 취득일이 같으면 토지 취득원인을 따로 지정할 수 없습니다 — 토지 취득일(상속개시일·증여일)을 확인하세요";

export function landPartCauseSameDay(
  asset: Parameters<typeof effectiveLandAcquisitionCause>[0] & BuildingCauseMixScope & { landAcquisitionDate?: string; acquisitionDate?: string },
): boolean {
  // D2 합성(Q-D2-6): 같은 날은 엔진·⑫가 통과시키지만(원인이 세율을 가르므로 값은 맞다) `isSeparateAcquisition`이 false가 되어
  // 파트 완결 규칙(V1·V2)이 꺼진다 — UI 단순화를 위해 ⑧만 차단한다.
  return landCauseMixActive(asset) && !!asset.landAcquisitionDate && asset.landAcquisitionDate === asset.acquisitionDate;
}

/**
 * D2 ⑤ — 건물 상속개시일 입력의 **3키 동시 기록**(상속개시일 = `acquisitionDate`·`inheritanceStartDate`·`inheritanceDate`).
 * 상속 블록(`CompanionAcqInheritanceBlock`)과 D2 날짜 2열의 건물 칸이 **같은 patch**를 쓴다 — 한쪽만 3키를 쓰면 다른 쪽이 만든
 * stale(`inheritanceStartDate`)을 ④ 폴백(`inheritanceDate || acquisitionDate`)·⑥ 자산 행이 읽는다. 증여는 `acquisitionDate` 1키.
 */
export function buildingDatePatch(
  cause: string | undefined,
  v: string,
): Pick<AssetForm, "acquisitionDate"> & Partial<Pick<AssetForm, "inheritanceStartDate" | "inheritanceDate">> {
  return cause === "inheritance" ? { acquisitionDate: v, inheritanceStartDate: v, inheritanceDate: v } : { acquisitionDate: v };
}

/** D2 ⑤ 날짜 안내 문구 — 건물 상속개시일·증여일이 영 §163⑨ 단서 2호 구간(< 2005-04-30)일 때(차단은 ⑧·⑫·엔진 Y4 — 같은 술어). */
export const BUILDING_CAUSE_PRE_DISCLOSURE_NOTICE =
  "건물 기준시가(주택은 개별주택가격·공동주택가격)가 고시되기 전에 상속·증여받은 건물은 평가액과 영 §164⑤~⑦ 가액 중 많은 금액이 취득가액인데, "
  + "토지를 따로 매수한 계산에서는 이 비교를 지원하지 않습니다(소득세법 시행령 §163조 제9항 단서 2호) — 개별주택가격 최초공시일(2005.4.30.) 이전 취득은 "
  + "보수적으로 모두 계산하지 않습니다. 건물 상속개시일(증여일)을 확인하세요";

/**
 * D2-4a 임시 — ⑧이 단서 2호 구간(2005.4.30. 전 상속·증여 건물, 단독·다가구주택)에서 ② 필수 위반을 말하는 문구. 엔진·⑫는 ②(영 §164⑦ 가액)를
 * 받아 계산하지만 이 화면에는 ② 입력 칸이 없다 — 「입력하세요」가 아니라 **화면 사실**로 말한다(D1-4a 규약). D2-4b가 칸과 함께 삭제한다.
 */
export const BUILDING_SEC164_SCREEN_MESSAGE =
  "건물 기준시가(개별주택가격)가 고시되기 전에 상속·증여받은 단독·다가구주택의 건물 취득가액은 상속개시일(증여일) 평가액과 영 §164⑦ 가액의 건물 몫 중 많은 금액인데, "
  + "이 계산기 화면은 영 §164⑦ 가액 입력을 받지 않아 계산하지 못합니다 (소득세법 시행령 §163조 제9항 단서 2호) — "
  + "건물 상속개시일(증여일)을 확인하거나 「토지는 다른 원인으로 취득」을 끄세요";

/** D2 유효일 때 입력 중 안내 목록(경계일 전 · 같은 날) — D2가 아니면 빈 배열. ⑧과 같은 술어. */
export function buildingCauseDateNotices(
  asset: Parameters<typeof landPartCauseSameDay>[0],
): string[] {
  const mix = effectiveBuildingCauseMix(asset);
  if (!mix) return [];
  const out: string[] = [];
  if (isSec163_9BuildingProviso(mix, asset.acquisitionDate)) out.push(BUILDING_CAUSE_PRE_DISCLOSURE_NOTICE);
  if (landPartCauseSameDay(asset)) out.push(LAND_CAUSE_SAME_DAY_MESSAGE);
  return out;
}

/**
 * ⑤ 날짜 안내(신축 블록·매매 날짜 영역 공용) — ⑧과 같은 술어. 차단은 ⑧(·⑫)이 하고 여기는 입력 중 안내.
 * Q-4 같은 날만 낸다. 1990.8.30. 전(영 §163⑨ 단서 1호)은 차단이 아니라 입력 카드(`LandSec164Card`)가 연다(D1-4b).
 */
export function landPartCauseDateNotice(
  asset: Parameters<typeof landPartCauseSameDay>[0],
): string | null {
  if (landPartCauseSameDay(asset)) return LAND_CAUSE_SAME_DAY_MESSAGE;
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
