/**
 * anchor: 상속·증여 estate 주소 저장이 전체 PNU(19자리)를 보존 (건축물대장 조회 활성화 전제).
 *
 * 양도세 자산은 주소 조회 시 PNU를 slice(0,10)로 버려 모달 건축물대장 조회가 비활성이던 버그가
 * 있었으나(별건 정정), 상속·증여는 buildAddressPatch가 estateAddress.pnu에 전체 PNU를 보존하므로
 * addrValue.pnu → 모달 initialAddress.pnu → 버튼 활성으로 이미 정상. 이 보존을 회귀 가드로 잠근다.
 *
 * 계획서: docs/02-design/features/building-std-modal-prefill-pnu-register-lookup.plan.md §8
 */
import { describe, it, expect } from "vitest";
import { buildAddressPatch } from "../../components/calc/inheritance/estate-card/variants/EstateBodyHelpers";

describe("상속·증여 estate 주소 — 전체 PNU 보존", () => {
  it("buildAddressPatch가 estateAddress.pnu에 전체 19자리 PNU 보존", () => {
    const patch = buildAddressPatch(
      {
        road: "경상북도 안동시 서후면 명리독점길 224-1",
        jibun: "경상북도 안동시 서후면 명리 733",
        building: "",
        detail: "",
        pnu: "4717032026101070001", // 19자리
        lng: "128.7",
        lat: "36.6",
      },
      { fishing: false },
    );
    expect(patch.estateAddress?.pnu).toBe("4717032026101070001");
  });

  it("pnu 없으면 estateAddress.pnu undefined (모달 재조회 fallback — 종전)", () => {
    const patch = buildAddressPatch(
      { road: "", jibun: "안동시 명리 733", building: "", detail: "", lng: "", lat: "" },
      { fishing: false },
    );
    expect(patch.estateAddress?.pnu).toBeUndefined();
  });
});
