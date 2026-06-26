/**
 * PNU 분해 anchor (decomposePnuForBuildingRegister).
 * 설계: docs/02-design/features/building-register-autofill.design.md §8.2.
 * platGbCd: pnu[10]="1"(대지)→"0" / "2"(산)→"1". (산 표본 무관 단위 검증)
 */
import { describe, it, expect } from "vitest";
import { decomposePnuForBuildingRegister } from "../../../lib/geo/pnu-building-register";

describe("decomposePnuForBuildingRegister", () => {
  it("대지(pnu[10]='1') → platGbCd '0' + 각 구간 분해", () => {
    // 역삼동 737: 1168010100 1 0737 0000
    const pnu = "1168010100107370000";
    expect(pnu).toHaveLength(19);
    expect(decomposePnuForBuildingRegister(pnu)).toEqual({
      sigunguCd: "11680",
      bjdongCd: "10100",
      platGbCd: "0",
      bun: "0737",
      ji: "0000",
    });
  });

  it("★산(pnu[10]='2') → platGbCd '1'", () => {
    const pnu = "1130510200206900000"; // 우이동 산69 형태
    expect(decomposePnuForBuildingRegister(pnu)?.platGbCd).toBe("1");
  });

  it("19자리 아니면 null", () => {
    expect(decomposePnuForBuildingRegister("116801010010737000")).toBeNull(); // 18
    expect(decomposePnuForBuildingRegister("11680101001073700000")).toBeNull(); // 20
    expect(decomposePnuForBuildingRegister("11680abc00107370000")).toBeNull(); // 비숫자
    expect(decomposePnuForBuildingRegister("")).toBeNull();
  });
});
