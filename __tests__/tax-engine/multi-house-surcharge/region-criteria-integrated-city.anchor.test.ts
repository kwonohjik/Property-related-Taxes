/**
 * anchor: 전남광주통합특별시(시도코드 12)의 지역기준/가액기준 분류 — D-4.
 *
 * 계획서: docs/02-design/features/sigungu-code-system-drift.plan.md §6-D (Y-9 판단 반영)
 *
 * 🔴 결함이었던 것: `classifyRegionCriteriaByCode`가 광주를 `29`로 하드코딩해
 *    통합 코드(`12xxx`)가 어느 분기도 타지 못하고 기본값 VALUE로 **조용히** 떨어졌다.
 *    VALUE는 「양도 공시가 3억 초과만 주택 수 산입」이라 광주 자치구 3억 이하 주택이
 *    주택 수에서 빠졌다 — 실측 세액 차 388,410,000.
 *
 * **판정 기준(2026-08-01 세무 판단)**: 전남광주통합특별시에서 **자치구만** 종전 광주광역시와
 * 같이 REGION으로 보고, **시·군은** 종전 전라남도와 같이 VALUE로 본다.
 * 「소득세법 시행령」 §167의3①1호가 「수도권 및 광역시·특별자치시(**광역시에 소속된 군** …
 * 제외) 외의 지역」으로 정하는 구조를 통합 전 실질 취급 그대로 옮긴 것이다.
 */
import { describe, it, expect } from "vitest";
import { classifyRegionCriteriaByCode } from "@/lib/tax-engine/multi-house-surcharge-count";

describe("[D-4] 전남광주통합특별시 지역기준 분류", () => {
  it.each([
    ["1221010100", "동구"],
    ["1224010100", "서구"],
    ["1227010100", "남구"],
    ["1230010100", "북구"],
    ["1233010100", "광산구"],
  ])("🔴 자치구 %s(%s) → REGION (종전 광주광역시 취급)", (code) => {
    expect(classifyRegionCriteriaByCode(code)).toBe("REGION");
  });

  it.each([
    ["1211010100", "목포시"],
    ["1213010100", "여수시"],
    ["1219010100", "광양시"],
    ["1285010100", "완도군"],
    ["1271010100", "담양군"],
  ])("시·군 %s(%s) → VALUE (종전 전라남도 취급)", (code) => {
    expect(classifyRegionCriteriaByCode(code)).toBe("VALUE");
  });

  it("구 코드도 종전대로 유지된다 (회귀 — 저장된 이력·수동 입력)", () => {
    expect(classifyRegionCriteriaByCode("2911010100")).toBe("REGION"); // 구 광주 동구
    expect(classifyRegionCriteriaByCode("4689010100")).toBe("VALUE"); // 구 전남 완도군
  });

  it("다른 시·도는 불변 (분기 추가가 번지지 않는다)", () => {
    expect(classifyRegionCriteriaByCode("1168010100")).toBe("REGION"); // 서울 강남
    expect(classifyRegionCriteriaByCode("2671010100")).toBe("VALUE"); // 부산 기장군
    expect(classifyRegionCriteriaByCode("2611010100")).toBe("REGION"); // 부산 중구
    expect(classifyRegionCriteriaByCode("5176010100")).toBe("VALUE"); // 강원 평창군
    expect(classifyRegionCriteriaByCode("5211010100")).toBe("VALUE"); // 전북 전주
  });

  it("5자리 코드도 동일하게 판정한다", () => {
    expect(classifyRegionCriteriaByCode("12210")).toBe("REGION");
    expect(classifyRegionCriteriaByCode("12850")).toBe("VALUE");
  });
});
