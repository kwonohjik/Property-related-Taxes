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
import { effectiveLandAcquisitionCause } from "./transfer-land-part-cause";

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

/**
 * 이월과세(증여) 축에서 §164⑤ PHD·APD 환산을 **쓰고 있는가**.
 *
 * ## 왜 별도 술어인가 — ⑤·⑧은 요구하는데 ④만 안 보냈다 (2026-09-07 재검증 H3)
 *
 * `CarryoverEstimationSection`은 `PreHousingDisclosureSection`을 **렌더 사본에만**
 * `usePreHousingDisclosure: true`를 주입하고 store 패치에서는 그 키를 떼어낸다
 * (「carryover 모드 선택으로 제어」 — 자산-수준 토글과 축을 섞지 않으려는 의도다).
 * 그런데 ④ `buildPreHousingDisclosurePayload`는 **store 값**만 보고 전송을 결정했다.
 *
 * 그 플래그를 켜는 곳은 `CompanionAcqPurchaseBlock`(취득원인=매매 전용)뿐이라
 * `carryover_gift`에서는 결코 true가 되지 않는다 ⇒ 사용자가 3-시점 칸을 채우고
 * ⑧(`transfer-tax-validate-acquisition.ts`의 이월과세 전용 블록)도 그것을 **요구**하는데,
 * ④가 `preHousingDisclosure`를 통째로 안 보내 증여자 취득가액이 0이 됐다.
 *
 * ⇒ 축은 `carryover.estimationMode`다. ④·⑧·⑤가 같은 사실을 보게 한다.
 */
export function carryoverPhdMode(
  asset: Pick<AssetForm, "acquisitionCause" | "carryover">,
): boolean {
  if (asset.acquisitionCause !== "carryover_gift") return false;
  const c = asset.carryover;
  if (!c?.useEstimatedAcquisition) return false;
  return c.estimationMode === "phd" || c.estimationMode === "apd";
}

/**
 * 자산-수준 PHD 플래그가 **유효한가** — 원시 `usePreHousingDisclosure`를 읽는 곳(④ `usesPhd` 단건·다건, ⑧ 토지 취득일
 * 후퇴, ⑤ 기준시가 안내)이 공유한다(D1-2 Check F1).
 *
 * 「토지는 다른 원인으로 취득」이 유효하면 PHD는 성립하지 않는다(상속·증여 토지는 환산 불가 — 엔진 PHD 경로는 양쪽 환산
 * 전용). 플래그는 건물 취득일 < 2005-04-29 주택에서 매매 블록이 **자동으로 켜므로** 오래된 매매 주택에선 기본 상태다 —
 * 원시값을 읽으면 ⑧이 빈 토지 취득일을 건물 취득일로 후퇴시켜 G-12를 건너뛰고(토지 원인 침묵 탈락), ④가 자산 단위
 * 기준시가를 빼 ⑫ 400이 됐다.
 */
export function phdFlagEffective(
  asset: Pick<
    AssetForm,
    "usePreHousingDisclosure" | "acquisitionCause" | "assetKind" | "isMixedUseHouse" | "landAcquisitionCause" | "hasSeperateLandAcquisitionDate"
  > & { landCauseHost?: string },
): boolean {
  return asset.usePreHousingDisclosure === true && !effectiveLandAcquisitionCause(asset);
}

/**
 * ④가 `preHousingDisclosure` 페이로드를 **실어야 하는가** — 두 축의 합집합.
 *
 * ⚠️ `phdToggleReachable`은 **자산-수준 토글 축에만** 건다. 이월과세는 자기 패널·자기 ⑧
 *    게이트를 갖고 있어 stale 토글 문제가 없고, 여기에 자산 종류 축을 걸면 이번엔
 *    이월과세 경로가 조용히 막힌다(같은 결함의 거울상).
 */
export function phdPayloadActive(
  asset: Pick<
    AssetForm,
    | "assetKind"
    | "hasSeperateLandAcquisitionDate"
    | "usePreHousingDisclosure"
    | "acquisitionCause"
    | "carryover"
    | "isMixedUseHouse"
    | "landAcquisitionCause"
    | "landCauseHost"
  >,
): boolean {
  if (carryoverPhdMode(asset)) return true;
  // D1 T-3 — 토지 원인 혼합이 유효하면 PHD를 **무시**한다(차단은 ⑫ R-X2 — API 직접 호출 방어선). `phdFlagEffective` 참조.
  return phdFlagEffective(asset) && phdToggleReachable(asset);
}
