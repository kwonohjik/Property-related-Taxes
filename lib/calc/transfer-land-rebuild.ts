/**
 * 구주택 멸실·신축 통산(`landRebuildPriorHouse`, 해석 (5)) 입력 축의 **적용 범위·전송·검증 사실** 단일 소스 — UI 설계 §2.
 *
 * 설계: docs/02-design/features/appurtenant-land-rebuild-rate-basis.ui.design.md
 * 엔진 leaf: lib/tax-engine/transfer-land-rebuild-rate.ts (`collectLandRebuildIssues` — 엔진 진입·⑫·⑧이 같은 함수를 부른다)
 *
 * ⑤ 블록 렌더 · ④ 전송 · ⑧ 검증이 모두 `effectiveLandRebuild` 하나를 읽는다(3중 패턴). 호스트가 닫힌 자산(토지 원인 토글 OFF·
 * 취득원인 변경·소유자 분리·부담부증여·겸용·함께 양도 자산)의 저장값은 지우지 않고 「없음」으로 읽는다 — `useEffect → store` 미러링 금지.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { effectiveSelfOwns } from "./self-owns-scope";
import { effectiveLandAcquisitionCause, effectiveLandCarryover } from "./transfer-land-part-cause";
import type { LandRebuildFacts, LandRebuildStartMode } from "@/lib/tax-engine/transfer-land-rebuild-rate";

export interface LandRebuildScopeOpts {
  /** 함께 양도하는 두 번째 이후 자산 — 이 입력을 받지 않는 자리(⑫가 400)라 「없음」으로 읽는다 */
  isNonPrimary?: boolean;
}

/** ④가 싣는 와이어 모양 — ⑫ `landRebuildPriorHouse`와 같다. */
export interface WireLandRebuild {
  startMode: LandRebuildStartMode;
  priorHouseStartDate?: string;
  demolitionDate?: string;
  footprintUnchanged: boolean;
}

/** 호스트 종류 — 건물 신축(토지는 상속·증여) / 매매 + 「토지·건물 취득일 다름」(토지 overlay 없음). */
export type LandRebuildHost = "newConstruction" | "purchase";

/**
 * ⑤ 블록 노출 · ④·⑧ 읽기의 호스트 판정 — **단일 소스**. 호스트가 아니면 `null`.
 *
 * 공통: 주택(겸용 아님) ∧ 토지·건물 취득일 분리 ∧ 소유자 같음 ∧ 부담부증여 아님 ∧ 첫 자산. 그 위에서 갈린다.
 *  · `newConstruction` — 「토지는 다른 원인으로 취득」 유효(UI 설계 §1 R-1 — 신축 건물에서 토지 취득일 칸이 열리는 유일한 경로이며 블록이 그 토글의 펼침 안에 있다).
 *  · `purchase` — 취득원인 매매 + 토지 상속·증여 overlay **없음**(UI 설계 §1 R-5). 「건물은 매수, 토지는 상속·증여」는 건물을 산 것이지 신축이 아니다.
 *    건물 원인 혼합(D2)은 건물 원인이 상속·증여일 때만 켜지므로 취득원인 `purchase` 조건이 이미 닫는다.
 */
export function landRebuildHost(asset: AssetForm, opts?: LandRebuildScopeOpts): LandRebuildHost | null {
  if (opts?.isNonPrimary) return null;
  if (asset.assetKind !== "housing" || asset.isMixedUseHouse) return null;
  if (asset.hasSeperateLandAcquisitionDate !== true) return null;
  if ((effectiveSelfOwns(asset) ?? "both") !== "both" || asset.transferType === "burdened_gift") return null;
  // P3 A(토지 이월과세)는 열지 않는다 — 토지 세율 기산은 이월과세 해결자가 증여자 취득일로 정하고, 이 통산과의 결합은 범위 밖이다(⑫·엔진 미설계).
  if (effectiveLandCarryover(asset)) return null;
  const landOverlay = !!effectiveLandAcquisitionCause(asset);
  if (asset.acquisitionCause === "newConstruction") return landOverlay ? "newConstruction" : null;
  if (asset.acquisitionCause === "purchase") return landOverlay ? null : "purchase";
  return null;
}

export function landRebuildApplicable(asset: AssetForm, opts?: LandRebuildScopeOpts): boolean {
  return landRebuildHost(asset, opts) !== null;
}

/**
 * ④·⑧이 읽는 **유효** 입력 — 호스트가 닫혔거나 토글이 꺼져 있으면 `undefined`.
 * 날짜는 빈 문자열을 `undefined`로, 구주택 취득일은 `later`일 때만 싣는다(`since_land`의 잔재 날짜는 leaf의 「stray」 위반을 만들지 않게 버린다).
 * `startMode`가 비어 있으면 `""` 그대로 둔다 — ⑧이 leaf로 「선택하세요」를 낸다(④는 이 상태에서 키를 보내지 않는다).
 */
export function effectiveLandRebuild(asset: AssetForm, opts?: LandRebuildScopeOpts): NonNullable<LandRebuildFacts["rebuild"]> | undefined {
  if (asset.landRebuildEnabled !== true || !landRebuildApplicable(asset, opts)) return undefined;
  const mode = asset.landRebuildStartMode ?? "";
  return {
    startMode: mode,
    priorHouseStartDate: mode === "later" ? asset.landRebuildPriorHouseStartDate || undefined : undefined,
    demolitionDate: asset.landRebuildDemolitionDate || undefined,
    footprintUnchanged: asset.landRebuildFootprintUnchanged === true,
  };
}

/** ④가 실제로 보내는 토지 취득일 — `buildSplitPayload`의 식(`hasSeperateLandAcquisitionDate && landAcquisitionDate`)과 같다(호스트 안에서는 두 조건이 참이다). */
function landDateSent(asset: AssetForm): string | undefined {
  return asset.hasSeperateLandAcquisitionDate && asset.landAcquisitionDate ? asset.landAcquisitionDate : undefined;
}

/** ⑧이 엔진 leaf에 넣는 사실 — ④가 보내는 값(유효 입력) 그대로. 입력이 없으면 leaf는 빈 배열을 돌려준다. */
export function landRebuildFactsOfAsset(asset: AssetForm, opts?: LandRebuildScopeOpts): LandRebuildFacts {
  const land = landDateSent(asset);
  return {
    isHousing: asset.assetKind === "housing",
    isMixedUse: !!asset.isMixedUseHouse,
    hostSupported: !opts?.isNonPrimary,
    buildingAcquisitionCause: asset.acquisitionCause,
    landAcquisitionCause: effectiveLandAcquisitionCause(asset) || undefined,
    buildingAcquisitionDate: asset.acquisitionDate || undefined,
    hasLandAcquisitionDate: !!land,
    landAcquisitionDate: land,
    selfOwns: effectiveSelfOwns(asset) ?? "both",
    isBurdenedGift: asset.transferType === "burdened_gift" || asset.acquisitionCause === "burdened_gift",
    rebuild: effectiveLandRebuild(asset, opts),
  };
}

/**
 * ④ 전송 — 유효 입력이 있고 `startMode`가 유효할 때만 `landRebuildPriorHouse` 키를 싣는다(거짓이면 키 없음 — 기존 body 불변).
 * `startMode`가 비었으면 보내지 않는다: ⑧이 계산 전에 막고, 엔진·⑫도 `startMode` 부재를 거부하므로 같은 결론이다.
 * 컴패니언 자리는 호출하지 않는다(⑫가 400) — 그래도 `opts.isNonPrimary`면 빈 객체를 돌려준다.
 */
export function buildLandRebuildPayload(asset: AssetForm, opts?: LandRebuildScopeOpts): { landRebuildPriorHouse?: WireLandRebuild } {
  const eff = effectiveLandRebuild(asset, opts);
  if (!eff || (eff.startMode !== "since_land" && eff.startMode !== "later")) return {};
  return {
    landRebuildPriorHouse: {
      startMode: eff.startMode,
      ...(eff.priorHouseStartDate ? { priorHouseStartDate: eff.priorHouseStartDate } : {}),
      ...(eff.demolitionDate ? { demolitionDate: eff.demolitionDate } : {}),
      footprintUnchanged: eff.footprintUnchanged === true,
    },
  };
}
