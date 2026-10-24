/**
 * 부담부증여(§159) × 이월과세 × **당초 증여자가 신축·증축한 건물**(소득세법 §114조의2) 입력 축의 **적용 범위** 단일 소스 (PR-4).
 *
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md (PR-4)
 *
 * ⑤(토글 노출)·④(전송)·⑧(필수 검증)이 같은 술어를 읽는다(3중 패턴). 엔진 `assertBgDonorBuiltInput`·⑫ `refineBgDonorBuilt`가 거부하는 조합을 UI에서 미리 비노출로 만든 것이다:
 *   · 이월과세 취득원인 + 부담부증여 · 시가 모드의 **환산취득가액(K-5)·감정가액(K-7)**만 — 실지(K-4)·기준시가(K-1~K-3)·매매사례가액(K-6)은 조문의 대상이 아니다
 *   · 주택·건물·일반건물만(겸용주택 제외). 일반건물(PR-5c)은 **환산취득가액(K-5)만** — 감정가액(K-7) 개방은 PR-2(`docs/00-pm/gb-bg-carryover-presumed-scenario-b.plan.md` — 시나리오 B 400은 PR-1에서 해소).
 *     일반건물은 단건(F27)만 — 지분 분할 취득(축 B)·함께 부담부증여 묶음은 이월과세 §97의2 를 타지 않는다(`bundled` 로 ⑧이 막고 ⑫가 거부한다). 건물 취득원인이 본인 신축(`newConstruction`)이면 다른 축이라 묻지 않는다.
 * 「당초 증여자」 = 지금 부담부증여를 하는 양도인에게 이 자산을 증여한 사람이다. 양도인 본인 신축(`isSelfBuilt` — `selfBuiltActive`는 매매 취득만)과는 **다른 축**이다.
 * 이 파일은 **leaf**다 — 자산 전체·분리 이월과세 술어(`donor-built-scope.ts`·`donor-built-part-scope.ts`)와 상호배타다(저쪽은 부담부증여를 거절한다).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 이 자산에서 «당초 증여자가 신축·증축한 건물인가» 질문을 묻는가 — ⑤ 노출 · ④ 전송 · ⑧ 요구가 이 하나를 읽는다. */
export function donorBuiltBgApplicable(asset: AssetForm | undefined): boolean {
  if (!asset?.carryover || asset.acquisitionCause !== "carryover_gift" || asset.transferType !== "burdened_gift") return false;
  if (asset.assetKind !== "housing" && asset.assetKind !== "building" && asset.assetKind !== "general_building") return false;
  if (asset.assetKind === "housing" && asset.isMixedUseHouse === true) return false;
  if (asset.assetKind === "general_building" && (asset.bgAcquisitionMethod !== "converted" || asset.gbBuildingAcquisitionCause === "newConstruction")) return false;
  if (asset.bgValuationMode !== "sangjeungbeop_market") return false;
  return asset.bgAcquisitionMethod === "converted" || asset.bgAcquisitionMethod === "appraisal";
}

/** 토글이 켜져 **계산에 실리는가** = 적용 범위 안 + 토글 ON. stale(범위 밖에서 켜 둔 값)은 false. */
export function donorBuiltBgActive(asset: AssetForm | undefined): boolean {
  return donorBuiltBgApplicable(asset) && asset?.carryover?.donorBuilt === true;
}
