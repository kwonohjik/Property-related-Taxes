/**
 * anchor — ④ 명부 행 「기존주택의 연장」 취득일 전달 (결정 #43 · §156의2⑤).
 *
 * 명부 화면은 원조합원 신축주택의 취득일 칸에 완공일을 받고 경위·기존주택 취득일을 따로 받는다. 엔진 명부(`HouseInfo`)에는
 * 완공일만 가서 §156의2⑤가 그 신축주택을 「대체주택 뒤 취득분」으로 셌다(G120-era-origin · G128-era-origin).
 * ④가 §155① 명부 경로와 같은 술어(`effectiveNewHouseAcquisitionDate`)로 기존주택 취득일을 싣는지 고정한다.
 */
import { describe, it, expect } from "vitest";
import { buildOtherHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { makeHouse } from "./one-house-rulings/harness";

const payloadOf = (over: Parameters<typeof makeHouse>[1]) =>
  buildOtherHousesPayload([makeHouse("A", { acquisitionDate: "2018-12-31", ...over })])[0] as Record<string, unknown>;

describe("④ predecessorHouseAcquisitionDate", () => {
  it("원조합원(기존주택)·자가 재건축 + 기존주택 취득일 → 싣는다", () => {
    expect(payloadOf({ acquisitionOrigin: "original_member_house", rightAcquisitionDate: "1997-10-02" }).predecessorHouseAcquisitionDate).toBe("1997-10-02");
    expect(payloadOf({ acquisitionOrigin: "self_rebuild", rightAcquisitionDate: "1997-10-02" }).predecessorHouseAcquisitionDate).toBe("1997-10-02");
  });
  it("연장이 아닌 경위(분양권·승계 입주권·일반) · 기존주택 취득일 미입력 → 싣지 않는다", () => {
    expect(payloadOf({ acquisitionOrigin: "presale", rightAcquisitionDate: "2016-01-15" }).predecessorHouseAcquisitionDate).toBeUndefined();
    expect(payloadOf({ acquisitionOrigin: "successor_right", rightAcquisitionDate: "2016-01-15" }).predecessorHouseAcquisitionDate).toBeUndefined();
    expect(payloadOf({ acquisitionOrigin: "general" }).predecessorHouseAcquisitionDate).toBeUndefined();
    expect(payloadOf({ acquisitionOrigin: "original_member_house" }).predecessorHouseAcquisitionDate).toBeUndefined();
  });
  it("취득일 칸 자체는 완공일 그대로다(소유·완공 판정은 종전대로)", () => {
    expect(payloadOf({ acquisitionOrigin: "original_member_house", rightAcquisitionDate: "1997-10-02" }).acquisitionDate).toBe("2018-12-31");
  });
});
