/**
 * 의제취득일(1985.1.1.) 전 상속·증여 자산 × 부담부증여 — §159①1호 A를 3자 max(시가 평가)·의제취득일 기준시가(기준시가 평가)로 정하는 범위.
 * ⑤ 노출(①② 칸·산정방식 라디오 숨김)·④ 전송(`inheritedAcquisition`)·⑧ 검사가 같은 술어를 쓴다
 * (계획서 `inheritance-pre-deemed-clause-b-revisit.plan.md` §18 · 사용자 결정 Q-24·Q-25).
 *
 * 범위는 토지·주택(재개발·겸용 제외)이다. 상가·일반건물·건물·재개발·겸용은 자기 입력 경로가 있어 후속(PR-7b) —
 * 그 자산에는 ④가 상속 의제 입력을 싣지 않는다(화면에 없는 ①이 엔진에 닿지 않게).
 */
import { deriveSec163_9BaseDate, isSec163_9Cause } from "./transfer-163-9-base-date";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function isBgPreDeemedAsset(asset: AssetForm): boolean {
  if (asset.transferType !== "burdened_gift" || !isSec163_9Cause(asset.acquisitionCause)) return false;
  if (asset.assetKind !== "land" && asset.assetKind !== "housing") return false;
  if (asset.isMixedUseHouse) return false;
  const base = deriveSec163_9BaseDate(asset);
  return !!base && base < "1985-01-01";
}
