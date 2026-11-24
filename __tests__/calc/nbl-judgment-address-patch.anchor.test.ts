/**
 * anchor — 소재지 patch leaf: 도로명·지번·좌표·시·군·구 코드 파생 (UV-14 의 «patch 계약» — 외부 API는 mock)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolve = vi.fn();
vi.mock("@/lib/calc/vworld-reverse-geocode", () => ({
  resolveSigunguCode: (...a: unknown[]) => resolve(...a),
  isReverseGeocodeError: (o: { code?: string }) => "code" in o,
}));

import { addressValueToAssetPatch } from "@/lib/calc/nbl-judgment-address-patch";

const base = { road: "서울 강남구 테헤란로 1", jibun: "서울 강남구 역삼동 1", building: "", detail: "", lng: "127.03", lat: "37.5" };

beforeEach(() => {
  resolve.mockReset();
});

describe("addressValueToAssetPatch", () => {
  it("PNU + 좌표 → 시·군·구 10자리를 acquisitionSigunguCode에 싣는다", async () => {
    resolve.mockResolvedValue({ sigunguCode: "1168000000", address: "", sidoName: "", sigunguName: "", source: "fallback_pnu" });
    const p = await addressValueToAssetPatch({ ...base, pnu: "1168010100100010000" });
    expect(resolve).toHaveBeenCalledWith("1168010100100010000", 37.5, 127.03);
    expect(p).toMatchObject({ addressRoad: base.road, addressJibun: base.jibun, latitude: "37.5", longitude: "127.03", acquisitionSigunguCode: "1168000000" });
  });

  it("조회 실패(오류 결과·예외)는 코드를 만들지 않는다 — 다른 칸은 그대로", async () => {
    resolve.mockResolvedValue({ code: "VWORLD_API_ERROR", message: "x" });
    expect((await addressValueToAssetPatch({ ...base, pnu: "x" })).acquisitionSigunguCode).toBeUndefined();
    resolve.mockImplementation(() => {
      throw new Error("net");
    });
    const p = await addressValueToAssetPatch({ ...base, pnu: "x" });
    expect(p.acquisitionSigunguCode).toBeUndefined();
    expect(p.addressJibun).toBe(base.jibun);
  });

  it("주소를 지우면(pnu 빈 문자열·좌표 없음) 파생 코드를 지운다 — 사라진 주소로 조회하지 않는다", async () => {
    const p = await addressValueToAssetPatch({ road: "", jibun: "", building: "", detail: "", lng: "", lat: "", pnu: "" });
    expect(p.acquisitionSigunguCode).toBe("");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("상세주소만 바뀐 호출(pnu undefined · 좌표 없음)은 같은 물건 — 코드를 건드리지 않는다", async () => {
    const p = await addressValueToAssetPatch({ road: base.road, jibun: base.jibun, building: "", detail: "101호", lng: "", lat: "" });
    expect("acquisitionSigunguCode" in p).toBe(false);
    expect(p.addressDetail).toBe("101호");
  });
});
