/**
 * 의제취득일(1985.1.1.) 전 상속·증여 자산 × 부담부증여 — §159①1호 A를 3자 max(시가 평가)·의제취득일 기준시가(기준시가 평가)로 정하는 범위.
 * ⑤ 노출(①② 칸·산정방식 라디오 숨김)·④ 전송(`inheritedAcquisition`)·⑧ 검사가 같은 술어를 쓴다
 * (계획서 `inheritance-pre-deemed-clause-b-revisit.plan.md` §18 · 사용자 결정 Q-24·Q-25).
 *
 * 범위는 토지·주택(겸용 제외)·상가·건물(토지 제외)(PR-7b-1)과 재개발·재건축 완공 아파트(원조합원 — PR-7b-4)다
 * (`inheritance-pre-deemed-bg-pr7b.plan.md`). 완공 아파트의 ③은 §166③(Q-8 a)이라 ⑤ §166③ 칸이 늘 뜬다(`redevPreApprovalAcqMode`).
 * 입주권(Q-30 — 범위 밖)·승계조합원(§166 밖)·일반건물·겸용은 빠진다 — 그 자산에는 ④가 상속 의제 입력을 싣지 않는다(화면에 없는 ①이 엔진에 닿지 않게).
 * ⑫ 면제 범위(`transfer-tax-schema-required-refines.ts` `BG_PRE_DEEMED_ENGINE_PROPERTY_TYPES`)와 같은 자산 종류다.
 */
import { deriveSec163_9BaseDate, isSec163_9Cause } from "./transfer-163-9-base-date";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const BG_PRE_DEEMED_ASSET_KINDS: ReadonlySet<string> = new Set(["land", "housing", "commercial_building", "building"]);

/**
 * 재개발·재건축 완공 아파트 원조합원 — 엔진 `redevSec166Conversion`과 같은 축(승계조합원 제외).
 * 양도 대상이 입주권으로 남은 stale 값이면 엔진 자산 종류가 `right_to_move_in`이 된다(④ `primaryEnginePropertyType` · 입주권은 Q-30 범위 밖).
 */
function isRedevAptOriginalMember(asset: AssetForm): boolean {
  return asset.assetKind === "redevelopment_apt" && asset.redevIsSuccessorMember !== "yes" && asset.redevSubject !== "right";
}

export function isBgPreDeemedAsset(asset: AssetForm): boolean {
  if (asset.transferType !== "burdened_gift" || !isSec163_9Cause(asset.acquisitionCause)) return false;
  if (!BG_PRE_DEEMED_ASSET_KINDS.has(asset.assetKind) && !isRedevAptOriginalMember(asset)) return false;
  if (asset.isMixedUseHouse) return false;
  const base = deriveSec163_9BaseDate(asset);
  return !!base && base < "1985-01-01";
}
