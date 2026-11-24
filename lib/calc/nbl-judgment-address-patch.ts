/**
 * 소재지 선택 → 자산 patch (비사업용 토지 판정 메뉴 전용 leaf · 계획서 `nbl-judgment-menu.ui.plan.md` §2 ①)
 *
 * `AssetSectionBasic`의 소재지 `onChange`(인라인)와 같은 시·군·구 파생을 메뉴용으로 최소만 옮겼다 — 도로명·지번·건물·상세·좌표·`acquisitionSigunguCode`.
 * 이 파생이 **빠지면** 컨테이너의 「양도 물건 소재지 자동 입력됨」 · ④의 `nblLandSigunguCodeOf` fallback · ⑧이 모두 빈 코드로 돌아
 * 농지·임야에서 사용자가 시·군·구를 손으로 골라야 한다(`nbl-land-sigungu.ts` 머리 주석).
 *
 * 계산기(`AssetSectionBasic`)·1주택 Step3의 복제는 건드리지 않는다(Surgical — 정리는 후속 후보 UV-8). 조정대상지역·공시가격용 파생(`regionCode`·`addressPnu`)은
 * 이 메뉴가 쓰지 않아 옮기지 않는다.
 */
import type { AddressValue } from "@/components/ui/address-search";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isReverseGeocodeError } from "./vworld-reverse-geocode";
import { resolveSigunguCode } from "./vworld-reverse-geocode";

export async function addressValueToAssetPatch(v: AddressValue): Promise<Partial<AssetForm>> {
  const patch: Partial<AssetForm> = {
    addressRoad: v.road,
    addressJibun: v.jibun,
    buildingName: v.building,
    addressDetail: v.detail,
    longitude: v.lng,
    latitude: v.lat,
  };
  // PNU가 오면 「주소를 새로 골랐다」, 주소가 비면 「지웠다」 — 상세주소만 바뀐 호출(pnu undefined)은 같은 물건이라 시·군·구를 건드리지 않는다.
  const addressCleared = v.pnu !== undefined || (!v.road && !v.jibun);
  const latNum = v.lat ? parseFloat(v.lat) : NaN;
  const lngNum = v.lng ? parseFloat(v.lng) : NaN;
  const hasCoord = Number.isFinite(latNum) && Number.isFinite(lngNum);
  if (v.pnu || hasCoord) {
    try {
      const outcome = await resolveSigunguCode(v.pnu || undefined, hasCoord ? latNum : undefined, hasCoord ? lngNum : undefined);
      if (!isReverseGeocodeError(outcome)) patch.acquisitionSigunguCode = outcome.sigunguCode;
    } catch {
      /* 네트워크 실패 — 조용히 건너뛴다(사용자가 컨테이너의 시·군·구 칸에서 직접 고른다) */
    }
  } else if (addressCleared) {
    patch.acquisitionSigunguCode = "";
  }
  return patch;
}
