import { describe, it, expect } from "vitest";
import { extractSidoSigunguName } from "@/lib/calc/address-sigungu-name";

describe("extractSidoSigunguName", () => {
  it("일반 시 — 지번 주소에서 시·도+시 추출 (테이블 누락 시군구도 동작)", () => {
    expect(extractSidoSigunguName("경상남도 거제시 장승포동 24")).toBe("경상남도 거제시");
  });

  it("자치구가 있는 시 — 시 뒤 구까지 이어붙인다", () => {
    expect(extractSidoSigunguName("경상남도 창원시 성산구 상남동 12-3")).toBe("경상남도 창원시 성산구");
    expect(extractSidoSigunguName("경기도 성남시 분당구 판교로 100")).toBe("경기도 성남시 분당구");
  });

  it("특별시·광역시 자치구", () => {
    expect(extractSidoSigunguName("서울특별시 종로구 세종로 1")).toBe("서울특별시 종로구");
    expect(extractSidoSigunguName("부산광역시 해운대구 우동")).toBe("부산광역시 해운대구");
  });

  it("군 — 군에서 종료", () => {
    expect(extractSidoSigunguName("경상남도 함안군 가야읍 말산리")).toBe("경상남도 함안군");
  });

  it("세종특별자치시 — 시·군·구 레벨 없음", () => {
    expect(extractSidoSigunguName("세종특별자치시 한누리대로 2130")).toBe("세종특별자치시");
  });

  it("읍·면 소재 시 — 시까지만", () => {
    expect(extractSidoSigunguName("충청남도 아산시 배방읍 세출리")).toBe("충청남도 아산시");
  });

  it("빈 값·공백 방어", () => {
    expect(extractSidoSigunguName("")).toBe("");
    expect(extractSidoSigunguName(undefined)).toBe("");
    expect(extractSidoSigunguName("   ")).toBe("");
  });
});
