/**
 * 법령 별칭 해석 테스트 — 네트워크 호출 없음
 */

import { describe, it, expect } from "vitest";
import { resolveLawAlias, isAlias, LAW_ALIASES } from "@/lib/korean-law/aliases";

describe("lib/korean-law/aliases", () => {
  describe("resolveLawAlias", () => {
    it("상증법 → 상속세및증여세법", () => {
      expect(resolveLawAlias("상증법")).toBe("상속세및증여세법");
    });

    it("종부세법 → 종합부동산세법", () => {
      expect(resolveLawAlias("종부세법")).toBe("종합부동산세법");
    });

    it("조특법 → 조세특례제한법", () => {
      expect(resolveLawAlias("조특법")).toBe("조세특례제한법");
    });

    it("민특법 → 민간임대주택에 관한 특별법", () => {
      expect(resolveLawAlias("민특법")).toBe("민간임대주택에 관한 특별법");
    });

    it("이미 정식명인 경우 그대로 반환", () => {
      expect(resolveLawAlias("소득세법")).toBe("소득세법");
    });

    it("공백 트림", () => {
      expect(resolveLawAlias("  상증법  ")).toBe("상속세및증여세법");
    });

    it("매핑에 없는 이름은 입력 그대로", () => {
      expect(resolveLawAlias("허구의법")).toBe("허구의법");
    });
  });

  describe("isAlias", () => {
    it("약칭이면 true", () => {
      expect(isAlias("상증법")).toBe(true);
      expect(isAlias("조특법")).toBe(true);
    });

    it("정식명이면 false", () => {
      expect(isAlias("소득세법")).toBe(false);
      expect(isAlias("종합부동산세법")).toBe(false);
    });
  });

  describe("LAW_ALIASES 매핑", () => {
    it("부동산 세법 6종 모두 포함", () => {
      expect(LAW_ALIASES["소득세법"]).toBe("소득세법");
      expect(LAW_ALIASES["상증법"]).toBe("상속세및증여세법");
      expect(LAW_ALIASES["종부세법"]).toBe("종합부동산세법");
      expect(LAW_ALIASES["지방세법"]).toBe("지방세법");
      expect(LAW_ALIASES["조특법"]).toBe("조세특례제한법");
      expect(LAW_ALIASES["농특세법"]).toBe("농어촌특별세법");
    });
  });
});
