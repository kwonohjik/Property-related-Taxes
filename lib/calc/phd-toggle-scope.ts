/**
 * 「§164⑤ 3-시점 환산(PHD) 토글이 **화면에 있는가**」 — ⑤ 리셋 · ⑧ 검증 · ④ 전송 공용 술어.
 *
 * ## 왜 필요한가 — 사용자가 켠 적도 없는 모드가 계산을 영구 차단했다 (2026-09-07 UI 리뷰)
 *
 * 취득일이 2005-04-29(개별주택가격 최초 고시) 이전인 **주택**을 환산 모드로 입력하면
 * `CompanionAcqPurchaseBlock`의 `useEffect`가 `usePreHousingDisclosure`를 **자동으로 켠다**
 * (사용자가 켠 적이 없다). 그 상태에서 자산 종류를 토지·상가 등으로 바꾸면
 *
 * - ⑤ 토글은 사라진다 — 렌더 조건이 `assetKind === "housing" || (building && 분리취득)`이다.
 * - ⑧은 자산 종류를 보지 않아 「최초 고시일을 입력하세요」 → 「최초 고시 개별주택가격을
 *   입력하세요」 → … 순으로 **11칸**을 요구한다. 그 칸은 화면 어디에도 없다.
 *
 * ⇒ 끄는 수단도 채울 칸도 없는 영구 차단이고, 사용자는 자기가 켜지도 않은 모드 때문이라
 *   원인을 추정할 수조차 없다.
 *
 * ## ④도 같은 술어를 쓴다 — 여기는 no-op이 아니다
 *
 * `buildPreHousingDisclosurePayload`는 `usePreHousingDisclosure`만 보고 보낸다. 11칸을
 * **다 채운 뒤** 종류를 바꾸면 ⑧이 통과하고 ④가 그대로 실어, 토지·상가 양도에
 * **주택 3-시점 환산 산식**이 적용된다(§164⑤·⑦은 「개별주택가격」이 축인 주택 전용 규정이다).
 * 차단이 아니라 **조용한 오산**이므로 여기서도 같은 술어로 막는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/**
 * 이 자산에서 §164⑤ PHD 토글에 **도달할 수 있는가**.
 *
 * ⑤ `CompanionAcqPurchaseBlock`의 렌더 조건 중 **자산 종류 축**만 뽑았다 —
 * 환산 모드·첫 자산 여부는 호출부가 각자 이미 판정한다(⑧의 `isEstimated`·`isNonPrimaryAsset`).
 *
 * ⚠️ 겸용주택은 `true`다. 그쪽 PHD는 겸용 전용 패널(`MixedUseLegacyStdPrice`)이 담당하고
 *    ⑧·④도 겸용 전용 분기로 먼저 빠지므로, 여기서 `false`로 만들면 그 경로를 잘못 막는다.
 */
export function phdToggleReachable(asset: {
  assetKind: AssetForm["assetKind"];
  hasSeperateLandAcquisitionDate?: boolean;
}): boolean {
  if (asset.assetKind === "housing") return true;
  return asset.assetKind === "building" && !!asset.hasSeperateLandAcquisitionDate;
}
