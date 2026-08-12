/**
 * 건물기준시가 모달에 넘길 자산 소재지 — **단일 출처**.
 *
 * ## 왜 뽑았는가
 *
 * 같은 9필드 리터럴이 8개 컴포넌트에 복제돼 있었다. 값이 우연히 일치한다는 것은
 * 안전을 뜻하지 않는다 — **이미 한 번 터졌다**:
 *
 *   `0bb6d345`(PR #1054) 「자산 카드 소재지·동호 미전달로 **조회 기능이 죽어 있었다**」
 *   지번만 넘어가 `pnu`가 없었고 건축물대장 조회가 비활성이었다. 커밋 메시지 그대로
 *   「**5개 호출부가 모두 같은 상태였다**」 — 복제본 하나를 고쳐도 나머지가 남는 구조였다.
 *
 * ⇒ 주소 필드가 늘어날 때 고칠 곳을 8 → 1로 줄인다. 줄 수가 아니라 **동기화 지점 수**가
 *   이 추출의 목적이다(`asset-labels.ts`가 라벨 dual-truth를 막는 것과 같은 이유).
 *
 * ⚠️ `AddressValue`의 `exclusiveArea`·`standardPrice`는 **의도적으로 넘기지 않는다** —
 *    복제본 8곳 중 어느 것도 넘기지 않았다. 추출은 배선을 바꾸는 작업이 아니다.
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { AddressValue } from "@/components/ui/address-search";

type AddressAsset = Pick<
  AssetForm,
  | "addressRoad"
  | "addressJibun"
  | "buildingName"
  | "addressDetail"
  | "longitude"
  | "latitude"
  | "addressPnu"
  | "addressDong"
  | "addressHo"
>;

/** 자산 카드 ① 기본정보의 소재지를 모달 `initialAddress` 형태로 변환한다. */
export function stdPriceAddressOf(asset: AddressAsset): AddressValue {
  return {
    road: asset.addressRoad,
    jibun: asset.addressJibun,
    building: asset.buildingName,
    detail: asset.addressDetail,
    lng: asset.longitude,
    lat: asset.latitude,
    pnu: asset.addressPnu,
    // 빈 문자열을 undefined로 접는다 — 조회 API가 빈 동/호를 유효한 세대 식별자로 오인하지 않도록.
    dong: asset.addressDong || undefined,
    ho: asset.addressHo || undefined,
  };
}
