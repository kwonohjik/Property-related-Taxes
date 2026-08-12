/**
 * `stdPriceAddressOf` — 건물기준시가 모달 소재지 단일 출처.
 *
 * 종전에는 같은 리터럴이 8개 컴포넌트에 복제돼 있었고, 그 구조가 실제로 터진 적이 있다
 * (`0bb6d345` / PR #1054 — `pnu` 미전달로 건축물대장 조회가 죽었고 「5개 호출부가 모두
 * 같은 상태였다」). 여기서 고정하는 것은 **필드가 하나도 빠지지 않는다**는 계약이다.
 */
import { describe, it, expect } from "vitest";
import { stdPriceAddressOf } from "@/components/calc/transfer/asset-std-price-address";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

const filled = {
  ...makeDefaultAsset(1),
  addressRoad: "서울특별시 강남구 테헤란로 1",
  addressJibun: "서울특별시 강남구 역삼동 1-1",
  buildingName: "테스트빌딩",
  addressDetail: "3층",
  longitude: "127.0",
  latitude: "37.5",
  addressPnu: "1168010100100010001",
  addressDong: "201동",
  addressHo: "3204",
};

describe("stdPriceAddressOf", () => {
  it("9필드를 모두 옮긴다 — 하나라도 빠지면 모달 조회가 죽는다", () => {
    expect(stdPriceAddressOf(filled)).toEqual({
      road: "서울특별시 강남구 테헤란로 1",
      jibun: "서울특별시 강남구 역삼동 1-1",
      building: "테스트빌딩",
      detail: "3층",
      lng: "127.0",
      lat: "37.5",
      pnu: "1168010100100010001",
      dong: "201동",
      ho: "3204",
    });
  });

  it("🔑 pnu — 지번만으로는 건축물대장 조회가 활성되지 않는다 (PR #1054의 결함)", () => {
    expect(stdPriceAddressOf(filled).pnu).toBe("1168010100100010001");
  });

  it("빈 동·호는 undefined로 접는다 — 빈 문자열이 유효한 세대 식별자로 오인되면 안 된다", () => {
    const r = stdPriceAddressOf({ ...filled, addressDong: "", addressHo: "" });
    expect(r.dong).toBeUndefined();
    expect(r.ho).toBeUndefined();
  });
});
