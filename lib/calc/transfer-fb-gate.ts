/**
 * 가업상속공제 §97의2④ 의제 취득가액 — **적용 대상 게이트** 단일 술어.
 *
 * ## 왜 단일 술어인가 (2026-09-02 · 코드리뷰 A04)
 *
 * 종전에는 ⑤ UI만 취득원인을 봤고(`CompanionAcquisitionCauseSection.tsx:303`)
 * ④·⑧·⑫·⑭·엔진 어디에도 조건이 없었다. 취득원인 라디오 핸들러는
 * `hasSeperateLandAcquisitionDate`만 정리하고 `familyBusinessInheritance`는 손대지 않으며
 * `updateAsset`은 단순 shallow merge라, **상속으로 입력해 두고 매매로 바꾸면 카드가 화면에서
 * 사라져 끌 방법이 없는 채로** stale 값이 ④를 그대로 통과했다.
 * ⇒ 실측 83,281,000원 과대(의제취득가 140,000,000이 실지 400,000,000을 대체).
 *
 * 취득원인만으로는 절반만 막힌다 — `assetKind`를 `general_building`으로 바꾸면
 * `CompanionAcquisitionCauseSection.tsx:58` 조기반환으로 FB 카드가 아예 렌더되지 않는데
 * 취득원인은 여전히 inheritance라 게이트를 통과한다(실측 71,242,600원 과대).
 * ⇒ **⑤의 렌더 조건과 같은 술어**여야 두 경로가 함께 닫힌다.
 *
 * ## 조문
 *
 * 「소득세법」 §97의2④: 「「상속세 및 증여세법」 제18조의2제1항에 따른 공제(…"가업상속공제"…)
 * **가 적용된 자산**의 양도차익을 계산할 때 …」 — 적용 대상은 **가업상속공제가 적용된 상속 자산**이다.
 * 설계문서도 같은 의도를 명시한다(`transfer-fb-cgt-credit-integration/…ui.design.md:167`
 * 「가업상속 자산은 반드시 상속 취득이어야 하므로」).
 *
 * ⚠️ **엔진 STEP 0.42에는 이 게이트를 넣지 말 것.** `__tests__/tax-engine/_helpers/mock-rates.ts`의
 *    `baseTransferInput`이 `acquisitionCause`를 설정하지 않고 타입 주석이 「미지정 시 매매로 간주」라,
 *    엔진에 걸면 FB 엔진 테스트가 전부 skip된다. 게이트는 calc 계층(④⑤⑧)이 담당한다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function allowsFamilyBusinessInheritance(
  asset: Pick<AssetForm, "assetKind" | "acquisitionCause">,
): boolean {
  // GB는 토지/건물 2카드로 분리 표시되며 FB 섹션을 렌더하지 않는다(⑤ 조기반환).
  if (asset.assetKind === "general_building") return false;
  return asset.acquisitionCause === "inheritance";
}
