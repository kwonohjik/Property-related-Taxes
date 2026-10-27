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
import { isGeneralBuildingBundledWindow, isSec163_9BuildingProviso } from "@/lib/tax-engine/transfer-split-part-cause";

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
  // 상속·증여만 D1이다 — 캐스트로 통과시키지 않는다(H-4). D2의 `"purchase"`(상속·증여 호스트 전용)·P3 A의 `"carryover_gift"`(별 술어
  // `effectiveLandCarryover`)·손상 저장값이 D1 소비처(라벨 META·§163⑨ 단서·피상속인 취득일)에 닿으면 화면이 크래시하거나 상속 토지로 읽힌다.
  const c = asset.landAcquisitionCause;
  return c === "inheritance" || c === "gift" ? c : "";
}

/**
 * P3 A — **토지만 이월과세**(소득세법 §97의2①) + 건물 매매·신축. 토지 파트를 배우자·직계존비속에게서 증여받았다.
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §2.2·§4. D1 토글(「토지는 다른 원인으로 취득」)의 세 번째 원인이라
 * 호스트·분리 조건은 D1과 같다. 소유자 분리·부담부증여·함께 양도 자산은 여기서 거르지 않는다 — leaf(S0·S4)가 ⑧·⑫에서 막는다(조용히 끄면
 * 토지가 «매매 토지 + 증여 신고가액»으로 계산된다). ④는 함께 양도 자산이면 키를 싣지 않는다(엔진 S0 자리).
 */
export function effectiveLandCarryover(
  asset: LandPartCauseScope & {
    landAcquisitionCause?: string;
    hasSeperateLandAcquisitionDate?: boolean;
    landCauseHost?: string;
  },
): boolean {
  if (!landPartCauseApplicable(asset) || !asset.hasSeperateLandAcquisitionDate) return false;
  if (asset.landCauseHost !== asset.acquisitionCause) return false;
  return asset.landAcquisitionCause === "carryover_gift";
}

/** ⑤ 토지 파트 라벨 원인 — D1 유효 원인, 아니면 A의 `"carryover_gift"`. 호출부가 1회 계산해 하위 칸에 주입한다(재파생 금지). */
export function landCauseDisplay(
  asset: Parameters<typeof effectiveLandAcquisitionCause>[0] & Parameters<typeof effectiveLandCarryover>[0],
): "" | "inheritance" | "gift" | "carryover_gift" {
  return effectiveLandAcquisitionCause(asset) || (effectiveLandCarryover(asset) ? "carryover_gift" : "");
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

// ─── P4 B — 건물만 이월과세(소득세법 §97의2①) + 토지 매매 (docs/02-design/features/transfer-split-part-carryover.ui.design.md §5) ───
// D2 술어(`effectiveBuildingCauseMix`)를 넓히지 않는다: 그 소비처 다수가 상속·증여 고유 의미(상속주택 특례·§164 카드·세대 사실)를 읽는다.
// 「건물은 비매매·토지는 매매」 구조만 읽는 흐름 소비처(정규화·합성 술어·매매 블록 건물 원인 모드)가 이 술어를 함께 본다.

/** B 토글이 놓일 수 있는 자산 — 취득 원인 「이월과세(증여)」 + 주택·건물(겸용 아님). */
export function buildingCarryoverMixApplicable(asset: LandPartCauseScope): boolean {
  return asset.acquisitionCause === "carryover_gift" && isLandBuildingSplitable(asset.assetKind) && !asset.isMixedUseHouse;
}

/**
 * B 유효 여부 — 호스트 태그가 「이월과세(증여)」이고 토지 overlay가 `purchase`일 때만(D2와 같은 성립 조건). 부담부증여는 ④가 분리 입력을 보내지 않아 무효(D2와 같다).
 * 소유자 분리·함께 양도 자산은 거르지 않는다 — leaf(S4·S0)가 ⑧·⑫에서 막는다(조용히 끄면 건물이 자산 전체 이월과세 1벌로 읽힌다 — U-20과 같은 이유).
 */
export function effectiveBuildingCarryoverMix(asset: BuildingCauseMixScope): boolean {
  if (!buildingCarryoverMixApplicable(asset) || !asset.hasSeperateLandAcquisitionDate) return false;
  if (asset.landCauseHost !== "carryover_gift") return false;
  return asset.landAcquisitionCause === "purchase" && asset.transferType !== "burdened_gift";
}

/** 합성 술어 — D1(토지 상속·증여)·P3 A(토지 이월과세)·D2(건물 상속·증여 + 토지 매매)·P4 B(건물 이월과세 + 토지 매매) 중 하나라도 유효. PHD 무시·소유자 분리 상호 잠금·같은 날의 기준. */
export function landCauseMixActive(asset: Parameters<typeof effectiveLandAcquisitionCause>[0] & BuildingCauseMixScope): boolean {
  return !!effectiveLandAcquisitionCause(asset) || effectiveLandCarryover(asset) || !!effectiveBuildingCauseMix(asset) || effectiveBuildingCarryoverMix(asset);
}

/**
 * 화면에 없는 **stale 분리 입력**인가 — 상속·증여 호스트(주택·건물, 겸용 아님)에서 D2 토글이 유효하지 않은데
 * `hasSeperateLandAcquisitionDate`만 켜져 있는 상태.
 *
 * 상속·증여 호스트에는 「취득일 다름」을 따로 켤 UI가 없다(`CompanionAcquisitionCauseSection`이 비-매매 전환에서 끈다) — 일반건물에서
 * 켠 뒤 자산 종류를 주택·건물로 바꾸거나(`hasSeperate…`를 끄지 않는 전환 patch), 2026-07-30 이전 저장분이 이 상태를 만든다.
 * 화면은 자산 단위 상속 계산을 보여주는데 ④·⑧이 토지 취득일 분리를 읽으면 입력 칸 없는 요구(D2 Y8)나 토지를 상속으로 읽는
 * 침묵 계산이 된다 → 읽는 쪽이 「분리 없음」으로 읽는다(D0 G-6 방식 — 저장값은 지우지 않는다).
 * ⚠️ 소유자 분리(`selfOwns≠both`)는 여기서 다루지 않는다 — 분리 플래그 말고도 파트 금액·토지 취득일이 함께 남으므로 `nonPurchaseOwnerSplit`이 맡는다.
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
 * 상속·증여 호스트(주택·건물, 겸용 아님)의 **소유자 분리**인가 — D2 유효·부담부증여는 제외.
 *
 * 이 화면(`NonPurchaseSplitInputsBlock`)에는 파트 취득가액·매매사례가액·산정 방식·토지 취득일 칸이 없다. 상속·증여 자산의 취득시기는
 * 상속개시일·증여일 하나다(「소득세법 시행령」 제162조 제1항 제5호). 그런데 D2를 끈 뒤의 토지 금액, 매매·D2에서 남은 파트 값, 상속개시일을
 * 고친 뒤의 옛 토지 취득일, 겸용을 켰다 끈 분리 플래그가 남아 ④가 그대로 읽었다 — 토지만 본인 100,740,000 ↔ 94,022,000 등 조용한 오계산과
 * ⑧ 「파트 취득가액」 막다른 길(계획서 `inherit-gift-owner-split-residue.plan.md` R-1~R-5). 저장값은 지우지 않는다(D2 다시 켜면 복원 — C10).
 */
export function nonPurchaseOwnerSplit(
  asset: BuildingCauseMixScope & { selfOwns?: "both" | "building_only" | "land_only" },
): boolean {
  if (!buildingCauseMixApplicable(asset) || effectiveBuildingCauseMix(asset)) return false;
  if (asset.transferType === "burdened_gift") return false;
  return (effectiveSelfOwns(asset as Pick<AssetForm, "assetKind" | "isMixedUseHouse" | "selfOwns">) ?? "both") !== "both";
}

/**
 * ④·⑧·⑥이 자산을 읽기 전에 통과시키는 **D2 정규화 사본** — (1) stale 분리 입력을 「분리 없음」으로, (2) 상속·증여 소유자 분리는
 * 화면에 없는 분리 입력을 읽지 않고 토지 취득일을 상속개시일·증여일로, (3) D2 유효 시 건물 방식을 `actual`로. 해당 없으면 같은 객체를 돌려준다.
 */
export function normalizeBuildingCauseInputs<
  T extends BuildingCauseMixScope & {
    selfOwns?: "both" | "building_only" | "land_only";
    buildingAcqMode?: string;
    landAcqMode?: string;
    carryoverDonorSplit?: boolean;
    landAcquisitionDate?: string;
    landCarryover?: { giftRegistryDate?: string };
    acquisitionDate?: string;
    carryover?: { giftRegistryDate?: string };
    landAcquisitionPrice?: string;
    buildingAcquisitionPrice?: string;
    landSalesCaseValue?: string;
    buildingSalesCaseValue?: string;
  },
>(asset: T): T {
  if (hasStaleSplitInput(asset)) return { ...asset, hasSeperateLandAcquisitionDate: false };
  // 상속·증여 소유자 분리 — 두 파트 모두 §163⑨ 평가액(실지거래가액)을 기준시가 비율로 안분한다. 소유자 분리 진입에 토지 취득일은 필요하다(④ `calcSplitGain`).
  if (nonPurchaseOwnerSplit(asset)) {
    return {
      ...asset,
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: asset.acquisitionDate ?? "",
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      landAcquisitionPrice: "",
      buildingAcquisitionPrice: "",
      landSalesCaseValue: "",
      buildingSalesCaseValue: "",
    };
  }
  // P2 C — 파트 이월과세는 두 파트 모두 실가(증여자 취득가액·증여 당시 평가액)다. 숨은 환산·감정 플래그(stale)가 ⑧ 요구·⑥ 합계·④ 전송 모드를 바꾸지 않게 한다.
  if (effectiveCarryoverDonorSplit(asset) && (asset.landAcqMode !== "actual" || asset.buildingAcqMode !== "actual"))
    return { ...asset, landAcqMode: "actual", buildingAcqMode: "actual" };
  // P3 A — 이월과세 토지의 취득일은 증여 등기접수일 한 곳이다(엔진 S5 — 어긋나면 400, UI 설계 §4.3 Q-8). 입력은 등기접수일 칸이 write-through하지만
  //   수동 편집 잔재가 남아도 ④·⑥·⑧이 같은 날짜를 읽게 덮는다. 토지 방식은 실가(증여 신고가액) 고정 — D1 토글 ON과 같은 규칙.
  if (effectiveLandCarryover(asset)) {
    const gift = asset.landCarryover?.giftRegistryDate ?? "";
    const fixed = asset.landAcqMode === "actual" && asset.landAcquisitionDate === gift ? asset : { ...asset, landAcqMode: "actual", landAcquisitionDate: gift };
    return withBuildingActualWhenMix(fixed);
  }
  // P4 B — 이월과세 건물의 취득일은 증여 등기접수일 한 곳이다(엔진 S5). 매매 블록의 건물 날짜 칸은 읽기 전용이라 남은 `acquisitionDate`(호스트를 바꾸기 전 입력)가
  //   이기지 않게 덮는다(④ `carryoverAcquisitionDateFallback`·⑥·⑧ 같은 값). 건물 방식은 실가(증여 신고가액) 고정 — `withBuildingActualWhenMix`.
  if (effectiveBuildingCarryoverMix(asset)) {
    const gift = asset.carryover?.giftRegistryDate ?? "";
    return withBuildingActualWhenMix(asset.acquisitionDate === gift ? asset : { ...asset, acquisitionDate: gift });
  }
  return withBuildingActualWhenMix(asset);
}

/**
 * D2 유효 시 건물 파트 방식을 `"actual"`로 고정한 사본 — 상속·증여 건물의 평가액은 실지거래가액이다(영 §163⑨). ④가 전송하는 값과
 * ⑧·⑥이 읽는 값을 하나로 맞춘다(3중 패턴): 남은 환산·감정 플래그(stale)가 ⑧ 요구·⑥ 합계를 바꾸지 않는다.
 * D2가 아니면 같은 객체를 돌려준다.
 */
export function withBuildingActualWhenMix<T extends BuildingCauseMixScope & { buildingAcqMode?: string }>(asset: T): T {
  return (effectiveBuildingCauseMix(asset) || effectiveBuildingCarryoverMix(asset)) && asset.buildingAcqMode !== "actual" ? { ...asset, buildingAcqMode: "actual" } : asset;
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

/**
 * D2 ⑤ 날짜 안내 문구 — 주택이 **아닌** 건물의 상속개시일·증여일이 2001-01-01 전(일반 건물 경계 `SEC_163_9_GENERAL_BUILDING_FIRST_NOTICE` — 영 §163⑨ 단서 2호)일 때
 * (차단은 ⑧·⑫·엔진 Y4a — 같은 술어). 2001.1.1.~2005.4.29.는 이 안내 대신 일괄 고시 여부 질문(`BuildingBundledStdPriceQuestion`)이 열린다.
 * 주택은 이 안내 대신 건물 평가액 아래 입력 카드(`BuildingSec164Card`)가 비교를 연다(D2-4b).
 */
export const BUILDING_CAUSE_PRE_DISCLOSURE_NOTICE =
  "건물 기준시가가 고시되기 전에 상속·증여받은 건물은 평가액과 영 §164⑤ 가액 중 많은 금액이 취득가액인데, 토지를 따로 매수한 계산에서 "
  + "이 비교는 지원하지 않아 일반 건물은 2001.1.1. 전 상속·증여분을 계산하지 않습니다(소득세법 시행령 §163조 제9항 단서 2호 · "
  + "상속세 및 증여세법 §61①2호). 건물 상속개시일(증여일)을 확인하세요";

/**
 * P4 B ⑤ 안내·⑧ 차단 — 건물 증여 등기접수일이 영 §163⑨ 단서 2호 구간(< 2005-04-30)이다. 그 구간의 건물 취득가액은 평가액과 영 §164⑤~⑦ 가액의 비교인데
 * B는 그 입력(주택 구분·② 카드·일괄 고시 질문)을 받지 않는다 — C(U-11)와 같이 막는다. 증여일이 그 구간이면 양도일 ≤ 2010-04-30(5년 적용기간)이라 도달이 매우 좁다.
 */
export const BUILDING_CARRYOVER_PRE_DISCLOSURE_MESSAGE =
  "건물 증여 등기접수일이 2005.4.30. 전이면 «건물만 이월과세 + 토지 매수»는 아직 계산하지 못합니다 — 건물 기준시가가 고시되기 전에 증여받은 건물의 취득가액은 평가액과 "
  + "영 §164⑤~⑦ 가액을 비교해야 하는데 이 입력은 그 비교를 받지 않습니다(소득세법 시행령 §163조 제9항 단서 2호). 증여 등기접수일을 확인하세요";

/** B의 건물 증여일(= 증여 등기접수일)이 단서 2호 구간인가 — ⑤ 안내·⑧ 차단이 같은 술어를 쓴다. */
export function buildingCarryoverPreDisclosure(asset: BuildingCauseMixScope & { carryover?: { giftRegistryDate?: string } }): boolean {
  return effectiveBuildingCarryoverMix(asset) && isSec163_9BuildingProviso("gift", asset.carryover?.giftRegistryDate);
}

/** D2·P4 B 유효일 때 입력 중 안내 목록(비주택 경계일 전 · B 고시 전 증여 · 같은 날) — 둘 다 아니면 빈 배열. ⑧과 같은 술어. */
export function buildingCauseDateNotices(
  rawAsset: Parameters<typeof landPartCauseSameDay>[0] & { carryover?: { giftRegistryDate?: string } },
): string[] {
  const mix = effectiveBuildingCauseMix(rawAsset);
  if (!mix && !effectiveBuildingCarryoverMix(rawAsset)) return [];
  // B의 건물 취득일은 증여 등기접수일이다 — ④·⑧과 같은 정규화 사본으로 같은 날을 판정한다.
  const asset = normalizeBuildingCauseInputs(rawAsset);
  const out: string[] = [];
  // 주택은 입력 카드가 안내한다(카드 게이트 `buildingSec164Applies`와 짝 — 주택 ∧ 같은 술어).
  if (mix && asset.assetKind !== "housing" && isSec163_9BuildingProviso(mix, asset.acquisitionDate) && !isGeneralBuildingBundledWindow(mix, asset.acquisitionDate))
    out.push(BUILDING_CAUSE_PRE_DISCLOSURE_NOTICE);
  if (buildingCarryoverPreDisclosure(asset)) out.push(BUILDING_CARRYOVER_PRE_DISCLOSURE_MESSAGE);
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
  // P3 A(토지 이월과세)도 같은 블록이라 같은 후퇴다 — 빠지면 신축 건물 취득가액이 비어 ⑧이 화면에 없는 건물 칸을 요구한다.
  return asset.acquisitionCause === "newConstruction" && landCauseDisplay(asset)
    ? asset.fixedAcquisitionPrice
    : asset.buildingAcquisitionPrice;
}

// ─── P2 C — 통째 이월과세인데 증여자가 토지·건물을 다른 날 취득 (docs/02-design/features/transfer-split-part-carryover.ui.design.md §2.2·§3) ───
// 증여자 취득일·가액이 파트(토지/건물)마다 다르다 — 자산 전체 1벌(`carryover`)로는 표현하지 못해 토지는 `landCarryover`, 건물은 기존 `carryover`가 받는다.
// 유효 여부는 이 술어 하나가 정한다(⑤ 카드·④ 전송·⑥ 사이드바·⑧ 검증이 같은 값을 읽는다). 저장 토글은 잔재일 수 있어 단독으로 읽지 않는다.

type CarryoverDonorSplitScope = BuildingCauseMixScope & {
  carryoverDonorSplit?: boolean;
  selfOwns?: "both" | "building_only" | "land_only";
  transferType?: string;
};

/**
 * C 유효 여부 — 토글 ∧ 취득 원인 「이월과세(증여)」 ∧ 주택·건물(겸용 아님) ∧ 소유자 분리 아님 ∧ 부담부증여 아님 ∧ **첫 자산**.
 *
 * 파트 이월과세는 첫 자산(주 자산)에서만 계산된다(엔진 S0 — 컴패니언은 신고 전체 결정세액 비교 불가). `opts.isNonPrimary`로 함께 양도 자산이면 「없음」으로 읽는다.
 * 호출부가 순서를 모르는 곳(정규화 사본·세대 사실 술어)은 생략한다 — 그 자리의 값은 표시·전송·검증이 모두 같은 술어를 읽으므로 어긋나지 않는다.
 * 값은 지우지 않는다(D0 G-6 — 토글을 되돌리면 복원).
 */
export function effectiveCarryoverDonorSplit(asset: CarryoverDonorSplitScope, opts?: { isNonPrimary?: boolean }): boolean {
  if (opts?.isNonPrimary) return false;
  if (asset.carryoverDonorSplit !== true || asset.acquisitionCause !== "carryover_gift") return false;
  if (!isLandBuildingSplitable(asset.assetKind) || asset.isMixedUseHouse) return false;
  if (asset.transferType === "burdened_gift") return false;
  // P4 B(건물만 이월과세 + 토지 매매)와 상호 잠금 — B 토글이 켜져 있으면 C 저장값은 잔재다(B 패널이 자산 전체 이월과세 블록을 대신해 C 토글이 화면에 없다).
  if (effectiveBuildingCarryoverMix(asset)) return false;
  return (effectiveSelfOwns(asset as Pick<AssetForm, "assetKind" | "isMixedUseHouse" | "selfOwns">) ?? "both") === "both";
}

/**
 * 함께 양도하는 두 번째 이후 자산(`isNonPrimary`)은 C 토글을 «꺼진 것»으로 읽는다 — 값은 지우지 않는다(D0 G-6).
 *
 * 토글은 첫 자산에서만 켤 수 있지만 값은 자산에 남는다. 켠 뒤 종류를 토지로 바꾸고 «주택 먼저로 교환»(`reverse-appurtenant-swap`)으로 그 자산이 두 번째로 내려간 다음
 * 다시 주택으로 바꾸면 컴패니언에 ON 잔재가 선다. 그대로 두면 `isSeparateAcquisition`·⑥이 컴패니언을 C로 읽어 ④ 본문(`companionAssets[].isSeparateAcquisition`)과
 * ⑥(취득가액 «계산 후 표시»)이 OFF 읽기와 갈린다(실측). 컴패니언을 읽는 두 지점(④ 본문 조립·⑥ 행 합계)이 이 한 함수로 같은 사실을 본다. ⑧은 `isNonPrimaryAsset` 옵션으로 이미 갈려 있어 같은 입력을 OFF와 같게 읽는다(뮤테이션으로 확인 — 별도 중화 불필요).
 */
export function neutralizeCarryoverDonorSplitForCompanion<T extends { carryoverDonorSplit?: boolean }>(asset: T, isNonPrimary: boolean): T {
  return isNonPrimary && asset.carryoverDonorSplit ? { ...asset, carryoverDonorSplit: false } : asset;
}

/** 파트별 이월과세 여부 — 사건·파트 서브객체를 ④가 싣는지, ⑧이 파트 입력을 요구하는지의 공통 질의. C(토지·건물 둘 다)·A(토지만)·B(건물만). */
export function partCarryover(
  asset: CarryoverDonorSplitScope & Parameters<typeof effectiveLandCarryover>[0],
  opts?: { isNonPrimary?: boolean },
): { land: boolean; building: boolean } {
  const c = effectiveCarryoverDonorSplit(asset, opts);
  // P3 A — 토지만 · P4 B — 건물만. 함께 양도 자산은 싣지 않는다(엔진 S0) — ⑧은 leaf S0가 막는다.
  const a = !opts?.isNonPrimary && effectiveLandCarryover(asset);
  const b = !opts?.isNonPrimary && effectiveBuildingCarryoverMix(asset);
  return { land: c || a, building: c || b };
}

/** 한 파트라도 이월과세인가 — ④가 자산 단위 필요경비 총액을 싣지 않는 조건(엔진 S8). ⑤·⑧이 기준시가 필요 판정에 넘기는 `expenses`도 같은 값을 쓴다(3중 패턴). */
export function anyPartCarryover(asset: Parameters<typeof partCarryover>[0], opts?: { isNonPrimary?: boolean }): boolean {
  const pc = partCarryover(asset, opts);
  return pc.land || pc.building;
}

/**
 * 파트 이월과세의 **증여자 취득가액 환산** 여부(P6) — 그 파트가 파트 이월과세이고 파트 서브폼의 `partEstimated`가 켜져 있다.
 * 토지는 `landCarryover`, 건물은 `carryover` 서브폼이다(C·A·B 공통). ⑤(토글·분자 칸 표시)·④(`useEstimatedAcquisition`·분자 전송)·⑧(분자·분모·같은 날 검증)이
 * 이 한 함수를 읽는다(3중 패턴) — 자산 전체 이월과세의 `useEstimatedAcquisition`·`estimationMode`는 읽지 않는다(옛 이력 잔재가 파트로 새지 않게).
 */
export function partDonorEstimated(
  asset: Parameters<typeof partCarryover>[0] & {
    landCarryover?: { partEstimated?: boolean };
    carryover?: { partEstimated?: boolean };
  },
  opts?: { isNonPrimary?: boolean },
): { land: boolean; building: boolean } {
  const pc = partCarryover(asset, opts);
  return {
    land: pc.land && asset.landCarryover?.partEstimated === true,
    building: pc.building && asset.carryover?.partEstimated === true,
  };
}

// ─── 비주택 건물 2001.1.1.~2005.4.29. 상속·증여 — 일괄 고시 오피스텔·상업용 건물인가 (계획서 §13.5) ───────────────

/**
 * 질문이 열리는가 — 「건물(토지 제외)」 ∧ D2 유효(건물 상속·증여 + 토지 매매) ∧ 건물 취득일(상속개시일·증여일)이 2001-01-01 ~ 2005-04-29.
 * leaf Y4e(`isGeneralBuildingBundledWindow`)와 같은 술어 — ⑤ 질문·④ 전송·⑧ 검증이 이 함수를 같이 읽는다. 답은 보지 않는다.
 * C(이월과세 + 증여자 취득일 상이)는 열지 않는다 — 건물 날짜가 증여 등기접수일이고 leaf가 종전 고정 경계로 막는다.
 */
export function buildingBundledQuestionApplies(asset: BuildingCauseMixScope & { acquisitionDate?: string }): boolean {
  if (asset.assetKind !== "building") return false;
  const mix = effectiveBuildingCauseMix(asset);
  return !!mix && isGeneralBuildingBundledWindow(mix, asset.acquisitionDate);
}

/** ④가 싣는 답 — 질문이 열린 자리에서 고른 값만(미선택은 보내지 않는다 = leaf가 확인을 요구한다). */
export function buildingBundledStdPriceSent(
  asset: Parameters<typeof buildingBundledQuestionApplies>[0] & { buildingBundledStdPrice?: string },
): "yes" | "no" | undefined {
  if (!buildingBundledQuestionApplies(asset)) return undefined;
  const v = asset.buildingBundledStdPrice;
  return v === "yes" || v === "no" ? v : undefined;
}
