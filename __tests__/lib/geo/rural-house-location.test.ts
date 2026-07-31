/**
 * §155⑦ 농어촌주택 소재 요건 자동 판별 (W-3).
 *
 * 실측 근거(2026-07-31 · Vworld):
 *   - `평창군 진부면 하진부리 760` → PNU `5176036021…`, 용도지역 uname 빈값(unknown)
 *   - `평창군 평창읍 하리 100` → **제2종일반주거지역 = 도시지역** → 읍이지만 §155⑦ 제외
 *   - Vworld `jibun`은 풀주소·축약형이 섞여 온다
 */
import { describe, it, expect } from "vitest";
import {
  classifyEupMyeon,
  isCapitalAreaByRegionCode,
  judgeRuralHouseLocation,
} from "@/lib/geo/rural-house-location";

describe("classifyEupMyeon", () => {
  it.each([
    ["강원특별자치도 평창군 진부면 하진부리 760", "myeon"],
    ["진부면 상진부리 1306-3", "myeon"], // 축약형 실측
    ["강원특별자치도 평창군 평창읍 하리 100", "eup"],
    ["서울특별시 강남구 삼성동 100", "other"],
    ["", "unknown"],
  ])("%s → %s", (jibun, expected) => {
    expect(classifyEupMyeon(jibun)).toBe(expected);
  });

  it("🔴 읍·면이 접두인 동 이름을 오탐하지 않는다", () => {
    // 서울 중랑구 면목동 / 대전 대덕구 읍내동 — 토큰 **끝**만 본다.
    expect(classifyEupMyeon("서울특별시 중랑구 면목동 100")).toBe("other");
    expect(classifyEupMyeon("대전광역시 대덕구 읍내동 50")).toBe("other");
  });
});

describe("isCapitalAreaByRegionCode", () => {
  it.each([
    ["1168010100", true], // 서울 강남구
    ["2818510300", true], // 인천 연수구
    ["4113510300", true], // 경기 성남시
    ["5176036021", false], // 강원 평창군 (실측 PNU 앞 10)
    ["2647010100", false], // 부산 (광역시는 수도권 아님)
  ])("%s → %s", (code, expected) => {
    expect(isCapitalAreaByRegionCode(code)).toBe(expected);
  });

  it("코드 미제공은 판정 불가(null) — false로 단정하지 않는다", () => {
    expect(isCapitalAreaByRegionCode(undefined)).toBeNull();
    expect(isCapitalAreaByRegionCode("")).toBeNull();
  });
});

describe("judgeRuralHouseLocation — §155⑦ 소재 요건", () => {
  it("수도권 소재 → 미충족", () => {
    const r = judgeRuralHouseLocation({ regionCode: "1168010100", jibun: "서울특별시 강남구 삼성동 100" });
    expect(r.verdict).toBe("not_qualified");
  });

  it("🔴 면지역은 도시지역 여부를 따지지 않는다 (괄호는 읍에만 걸린다)", () => {
    const base = { regionCode: "5176036021", jibun: "강원특별자치도 평창군 진부면 하진부리 760" };
    expect(judgeRuralHouseLocation({ ...base, urbanVerdict: "unknown" }).verdict).toBe("qualified");
    // 면이 도시지역이어도 충족이다 — 법문 괄호가 읍에만 붙어 있다.
    expect(judgeRuralHouseLocation({ ...base, urbanVerdict: "urban" }).verdict).toBe("qualified");
  });

  it("🔴 읍 + 도시지역 → 제외 (실측: 평창읍 하리 = 제2종일반주거지역)", () => {
    const r = judgeRuralHouseLocation({
      regionCode: "5176025021",
      jibun: "강원특별자치도 평창군 평창읍 하리 100",
      urbanVerdict: "urban",
    });
    expect(r.verdict).toBe("not_qualified");
    expect(r.reason).toContain("도시지역");
  });

  it("읍 + 비도시지역 → 충족", () => {
    const r = judgeRuralHouseLocation({
      regionCode: "5176025021",
      jibun: "강원특별자치도 평창군 평창읍 하리 100",
      urbanVerdict: "non_urban",
    });
    expect(r.verdict).toBe("qualified");
  });

  it("읍 + 용도지역 미확인 → **판정 불가**(미충족으로 단정하지 않는다)", () => {
    const r = judgeRuralHouseLocation({
      regionCode: "5176025021",
      jibun: "강원특별자치도 평창군 평창읍 하리 100",
      urbanVerdict: "unknown",
    });
    expect(r.verdict).toBe("unknown");
  });

  it("동 소재 → 미충족", () => {
    expect(
      judgeRuralHouseLocation({ regionCode: "5176025300", jibun: "강원특별자치도 평창군 대화면대화리" })
        .verdict,
    ).toBe("not_qualified"); // 공백 없는 붙임 표기는 토큰 분리가 안 돼 "other"로 떨어진다
  });

  it("소재지 미선택 → 판정 불가", () => {
    expect(judgeRuralHouseLocation({ jibun: "" }).verdict).toBe("unknown");
  });
});
