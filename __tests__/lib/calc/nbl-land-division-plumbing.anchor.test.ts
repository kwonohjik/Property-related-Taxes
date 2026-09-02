/**
 * anchor: `nblLandDivision`(소재지 행정구역 단위)이 폼 → Zod → 엔진까지 살아서 도달한다
 *
 * 발견 E2-01 (docs/reviews/nbl-code-review-2026-09.md) — 신규 입력 축이라 14 동기화 지점을 탄다.
 * ⑫Zod·⑬body·⑭엔진 매핑은 TypeScript가 잡지 못해 누락 시 **침묵 stripping**이 된다.
 *
 * ⑧ validation은 「자동 추정 금지」 정책에 따라 판정 불가를 차단한다 —
 * 시(市)·특별자치시는 읍·면 여부가 §104의3①1호나목·3호가목 지역 열거를 가르기 때문이다.
 */
import { describe, it, expect } from "vitest";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { validateNblDetailedJudgment } from "@/lib/calc/transfer-tax-validate-nbl";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { nonBusinessLandRawSchema } from "@/lib/api/transfer-tax-schema-nbl";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/** 충주시(43130 · 도농복합시) 일반주거 농지 — 읍·면 여부가 결과를 가른다 */
function farmAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(),
    assetKind: "land",
    nblUseDetailedJudgment: true,
    isNonBusinessLand: true,
    nblLandType: "farmland",
    nblZoneType: "general_residential",
    acquisitionArea: "1000",
    acquisitionDate: "2014-01-01",
    nblLandSigunguCode: "43130",
    nblFarmingSelf: true,
    ...over,
  } as AssetForm;
}

describe("[E2-01] ④⑭ raw → 엔진 input", () => {
  it("🔴 읍·면 선택이 엔진 input의 landDivision으로 도달한다", () => {
    const input = buildNblEngineInput({
      nblUseDetailedJudgment: true,
      nblLandType: "farmland",
      nblZoneType: "general_residential",
      acquisitionArea: "1000",
      acquisitionDate: "2014-01-01",
      transferDate: "2024-01-01",
      nblLandDivision: "eup_myeon",
      nblBusinessUsePeriods: [],
      nblResidenceHistories: [],
      nblGracePeriods: [],
    } as never);
    expect(input?.landDivision).toBe("eup_myeon");
  });

  it("미입력·미지원 값은 undefined로 접는다 (자동 추정 금지)", () => {
    const build = (v: string) =>
      buildNblEngineInput({
        nblUseDetailedJudgment: true,
        nblLandType: "farmland",
        nblZoneType: "general_residential",
        acquisitionArea: "1000",
        acquisitionDate: "2014-01-01",
        transferDate: "2024-01-01",
        nblLandDivision: v,
        nblBusinessUsePeriods: [],
        nblResidenceHistories: [],
        nblGracePeriods: [],
      } as never);
    expect(build("")?.landDivision).toBeUndefined();
    expect(build("myeon")?.landDivision).toBeUndefined();
  });
});

describe("[E2-01] ⑫ Zod — 침묵 strip 방지", () => {
  it("🔴 nblLandDivision이 스키마를 통과해 살아남는다", () => {
    const parsed = nonBusinessLandRawSchema.partial().safeParse({ nblLandDivision: "eup_myeon" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.nblLandDivision).toBe("eup_myeon");
  });
});

describe("[E2-01] ⑧ validation", () => {
  it("🔴 도시지역 주·상·공 농지 + 시(市) 소재 + 구분 미선택 → 차단", () => {
    const err = validateNblDetailedJudgment(farmAsset(), "자산1", "2024-01-01");
    expect(err).toContain("행정구역 단위");
  });

  it("구분을 선택하면 그 차단은 풀린다", () => {
    const err = validateNblDetailedJudgment(
      farmAsset({ nblLandDivision: "eup_myeon" }),
      "자산1",
      "2024-01-01",
    );
    expect(err ?? "").not.toContain("행정구역 단위");
  });

  it("군(郡) 소재는 구분을 묻지 않는다 — 이미 지역 열거 밖 (과차단 방지)", () => {
    const err = validateNblDetailedJudgment(
      farmAsset({ nblLandSigunguCode: "26710" }), // 부산 기장군
      "자산1",
      "2024-01-01",
    );
    expect(err ?? "").not.toContain("행정구역 단위");
  });

  it("자치구 소재도 묻지 않는다 — 읍·면이 없다 (과차단 방지)", () => {
    const err = validateNblDetailedJudgment(
      farmAsset({ nblLandSigunguCode: "11680" }),
      "자산1",
      "2024-01-01",
    );
    expect(err ?? "").not.toContain("행정구역 단위");
  });

  it("도시지역이 아니면 묻지 않는다 — 지역 열거를 따질 일이 없다 (과차단 방지)", () => {
    const err = validateNblDetailedJudgment(
      farmAsset({ nblZoneType: "agriculture_forest" }),
      "자산1",
      "2024-01-01",
    );
    expect(err ?? "").not.toContain("행정구역 단위");
  });

  it("군 소재는 도시지역 편입일도 요구하지 않는다 — 지역기준 미적용 (E2-01 연동)", () => {
    const err = validateNblDetailedJudgment(
      farmAsset({ nblLandSigunguCode: "26710" }),
      "자산1",
      "2024-01-01",
    );
    expect(err ?? "").not.toContain("도시지역 편입일");
  });
});
