/**
 * anchor — 재산세 별도합산 공장용지 기준면적: **조문 정정 before/after**
 *
 * ## 결함
 *
 * 「지방세법 시행령」의 두 조문은 **소재 지역으로 배타 분기**하고 한도 산식이 다르다:
 *
 * | 조문 | 과세구분 | 한도 |
 * |---|---|---|
 * | §101①1호 | **별도합산** | 공장용 건축물 **바닥면적 × §101② 적용배율** |
 * | §102①1호 | **분리과세** | **공장입지기준면적**(시행규칙 §50 [별표6]) |
 *
 * §101①1호 본문에는 **공장입지기준면적 개념이 아예 없다**(법제처 MST 287223 실측):
 *
 * > 1. …의 공장용 건축물의 부속토지로서 공장용 건축물의 바닥면적…에 제2항에 따른
 * >    용도지역별 적용배율을 곱하여 산정한 범위의 토지
 *
 * 그런데 종전 `calculateBaseArea`는 **별도합산** 판정에서 `factoryStandardArea`가 있으면
 * 그것을 기준면적으로 삼았고, 조문 라벨도 `§101①1호`를 달고 있었다(`BASE_AREA_FACTORY`).
 * UI 문구도 "공장입지기준면적 이내: **별도합산**"이라 안내했다 — 법문대로면 이내는 **분리과세**다.
 *
 * ## 이 파일이 고정하는 것
 *
 * 정정으로 **세액이 바뀐다**(별도합산 인정면적이 달라져 종합합산 이관분이 달라진다).
 * 그래서 before/after를 값으로 남긴다 — "왜 바뀌었는지"를 나중에 추적할 수 있게.
 */
import { describe, it, expect } from "vitest";
import { calculateBaseArea } from "@/lib/tax-engine/separate-aggregate-land";
import type { SeparateAggregateLandItem } from "@/lib/tax-engine/separate-aggregate-land";

/** 일반주거지역(§101② 4배) · 바닥면적 200㎡ → 본칙 기준면적 800㎡ */
function factoryLand(over: Partial<SeparateAggregateLandItem> = {}): SeparateAggregateLandItem {
  return {
    id: "L1",
    jurisdictionCode: "11110",
    landArea: 3000,
    officialLandPrice: 1_000_000,
    zoningDistrict: "general_residential",
    buildingFloorArea: 200,
    isFactory: true,
    ...over,
  } as SeparateAggregateLandItem;
}

describe("§101①1호 — 별도합산 공장용지 기준면적은 바닥면적 × 배율이다", () => {
  it("BASE-1: 공장입지기준면적을 입력해도 기준면적은 바닥면적 × 배율이다", () => {
    // 🔴 정정 전: factoryStandardArea(5,000)를 그대로 기준면적으로 썼다.
    //    정정 후: §101①1호 본칙(200㎡ × 4배 = 800㎡)만 적용한다.
    const r = calculateBaseArea(factoryLand({ factoryStandardArea: 5000 }));
    expect(r.baseArea).toBe(800);
    expect(r.multiplier).toBe(4);
  });

  it("BASE-2: 공장입지기준면적 미입력이어도 같은 결과다 (분기 자체가 사라졌다)", () => {
    const withValue = calculateBaseArea(factoryLand({ factoryStandardArea: 5000 }));
    const without = calculateBaseArea(factoryLand());
    expect(withValue).toEqual(without);
  });

  it("BASE-3: 용도지역이 바뀌면 배율이 바뀐다 (전용주거 5배 · 상업 3배 · 녹지 7배)", () => {
    expect(calculateBaseArea(factoryLand({ zoningDistrict: "exclusive_residential" })).baseArea).toBe(1000);
    expect(calculateBaseArea(factoryLand({ zoningDistrict: "commercial" })).baseArea).toBe(600);
    expect(calculateBaseArea(factoryLand({ zoningDistrict: "green" })).baseArea).toBe(1400);
  });

  it("BASE-4: 조문 라벨이 §101①1호 본칙과 일치한다", () => {
    const r = calculateBaseArea(factoryLand({ factoryStandardArea: 5000 }));
    expect(r.legalBasis).toContain("§101");
  });

  it("BASE-5: 공장용 외 건축물과 산식이 같다 (§101①1호·2호 모두 바닥면적 × 배율)", () => {
    const factory = calculateBaseArea(factoryLand({ factoryStandardArea: 5000 }));
    const general = calculateBaseArea(factoryLand({ isFactory: false }));
    expect(factory.baseArea).toBe(general.baseArea);
    expect(factory.multiplier).toBe(general.multiplier);
  });

  it("BASE-6: 바닥면적이 없으면 기준면적 0 (건축물 없는 토지 → 종합합산)", () => {
    const r = calculateBaseArea(factoryLand({ buildingFloorArea: 0, factoryStandardArea: 5000 }));
    expect(r.baseArea).toBe(0);
  });
});
