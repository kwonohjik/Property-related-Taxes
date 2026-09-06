/**
 * 자산 종류 전환 시 **주택 전용 플래그** 정리 — `areaResetPatchForAssetKind`·
 * `redevSubjectPatchForAssetKind`와 같은 자리에 서는 순수 patch 함수 (2026-09-07 UI 리뷰).
 *
 * ## 왜 필요한가 — 칸 없는 입력을 요구하는 dead-end
 *
 * `isMixedUseHouse`·`hasNonHousingConversion`의 **유일한 쓰기 지점**은
 * `MixedUseToggleRow`·`NonHousingConversionToggleRow`인데, 둘 다
 * `AssetSectionBasic.tsx:201`의 `assetKind === "housing"` 게이트 안에 있다 —
 * 자산 종류를 주택에서 다른 것으로 바꾸는 순간 **끄는 수단이 사라진다**.
 *
 * 반면 ⑧은 자산 종류를 보지 않는다:
 *   `transfer-tax-validate-acquisition.ts:305`
 *     `if (asset.isMixedUseHouse === true) return validateMixedUseAsset(...)`
 *
 * 실측(2026-09-07) — 주택에서 토지로 바꾼 뒤:
 *
 * | 잔존 플래그 | ⑧이 요구하는 것 | 그 입력칸의 위치 |
 * |---|---|---|
 * | `isMixedUseHouse` | 「주택 연면적(㎡)을 입력하세요」 | `MixedUseExpandedPanel` — **housing 전용** |
 * | `hasNonHousingConversion` | 「사실상 주거용 사용 개시일을 입력하세요」 | 용도변경 패널 — **housing 전용** |
 *
 * ⇒ 화면에 없는 값을 요구받고, 끌 수단도 없어 **계산이 영구 차단**된다.
 *
 * ⚠️ `useEffect → store` 미러링 금지 — 전환 `onChange` 한 번에 단일 배치로 보낸다.
 */
import { RENTAL_HOUSING_EXCEPTION_DEFAULTS } from "@/lib/stores/calc-wizard-asset-factory";
import { isRentalHousingExceptionApplicable } from "@/lib/calc/rental-housing-exception-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/**
 * 주택이 아닌 종류로 바꿀 때 비울 플래그. 주택으로 바꾸는 경우엔 빈 patch —
 * 되돌리면 사용자가 다시 켤 수 있고, 잔재 값을 지울 이유가 없다
 * (`redevSubjectPatchForAssetKind`의 「다른 종류의 잔재는 건드리지 않는다」와 같은 방침).
 */
export function housingFlagResetPatchForAssetKind(
  nextKind: AssetForm["assetKind"],
): Partial<AssetForm> {
  /**
   * §155⑳ 특례는 **입주권도 대상**이라 축이 다르다 — 주택 전용 플래그와 조건을 공유할 수 없다.
   * 술어는 `rental-housing-exception-scope.ts` 단일 소스를 쓴다(⑤·⑧·④와 같은 것).
   *
   * ⚠️ 이 초기화만으로는 부족하다 — stale sessionStorage·이력 복원분은 전환을 거치지 않는다.
   *    정본 게이트는 ⑧·④에 있다.
   */
  const rhReset: Partial<AssetForm> = isRentalHousingExceptionApplicable(nextKind)
    ? {}
    : { rentalHousingException: { ...RENTAL_HOUSING_EXCEPTION_DEFAULTS } };

  /**
   * §164⑤ PHD — 종류를 바꾸면 토글이 사라지는데 플래그는 남는다. 취득일 < 2005-04-29 주택에서
   * ⑤가 **자동으로 켜 주는** 값이라 사용자는 켠 적조차 없다.
   *
   * ⚠️ `building`은 **분리취득이면 토글이 남는다** — 여기서는 종류만 알므로 `building`으로
   *    바꿀 때는 건드리지 않는다. 잔재를 실제로 무해하게 만드는 정본 게이트는 ⑧·④에 있다
   *    (`phdToggleReachable`) — 이 리셋은 stale sessionStorage·이력 복원분을 못 잡는다.
   */
  const phdReset: Partial<AssetForm> =
    nextKind === "building" ? {} : { usePreHousingDisclosure: false };

  if (nextKind === "housing") return rhReset;
  return {
    ...rhReset,
    ...phdReset,
    // 겸용주택 축 — 종속 필드(용도변경 부분·방향)까지 함께 비운다.
    isMixedUseHouse: false,
    hasPartialUsageChange: false,
    partialChangeDirection: "",
    // 비주택 → 주택 용도변경 축 (§95⑤·⑥) — 날짜는 플래그 ON일 때만 의미를 갖는다.
    hasNonHousingConversion: false,
    residentialUseStartDate: "",
  };
}
