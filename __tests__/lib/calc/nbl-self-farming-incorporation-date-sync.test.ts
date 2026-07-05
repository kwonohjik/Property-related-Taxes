/**
 * NBL 도시편입일 ← §66 자경 편입 부분감면 편입일 fallback 동기화
 *
 * 버그: §66 감면(Step5)의 편입일(selfFarmingIncorporationDate)과 NBL 판정(Step4)의
 *   도시편입일(nblUrbanIncorporationDate)이 별도 필드로 미동기화. 사용자가 §66 감면쪽에만
 *   편입일을 입력하면 NBL은 편입일 미제공 → 편입 3년 유예(소득세법 시행령 §168의8⑤⑥) 미적용
 *   → 재촌·자경 농지가 비사업용으로 오판정 → +10%p 중과(42%→52%).
 *
 * 수정: buildNonBusinessLandRaw에서 nblUrbanIncorporationDate가 비면 §66 편입일로 fallback.
 * 계획/원인: 소득세법 §104의3①1호 나목 + 시행령 §168의8⑤1호·⑥ (편입 전 1년+ 재촌·자경 → 편입 3년 사업용)
 */
import { describe, it, expect } from "vitest";
import { buildNonBusinessLandRaw, buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand, DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;

/** 도시지역 편입 농지 + 재촌·자경 baseline. reductions/편입일만 케이스별로 주입. */
function urbanFarmlandAsset(over: Record<string, unknown>) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    nblUseDetailedJudgment: true,
    nblLandType: "farmland",
    nblZoneType: "general_residential", // 도시지역(주거)
    acquisitionArea: "1000",
    acquisitionDate: "1985-01-01",
    nblFarmingSelf: true,
    nblFarmerResidenceDistance: "10",
    nblBusinessUsePeriods: [{ startDate: "1985-01-01", endDate: "2023-02-14", usageType: "자경" }],
    nblResidenceHistories: [],
    nblUrbanIncorporationDate: "",
    ...over,
  } as unknown as Parameters<typeof buildNonBusinessLandRaw>[0];
}

const selfFarmingReduction = (date: string, on = true) => [
  {
    type: "self_farming",
    farmingYears: "8",
    useSelfFarmingIncorporation: on,
    selfFarmingIncorporationDate: date,
  },
];

describe("[NBL-SF-SYNC] NBL 도시편입일 ← §66 편입일 fallback", () => {
  it("SYNC-1: NBL 도시편입일 미입력 + §66 편입일 활성 → raw·엔진 input에 §66 편입일 반영", () => {
    const asset = urbanFarmlandAsset({ reductions: selfFarmingReduction("2023-02-14") });
    const raw = buildNonBusinessLandRaw(asset, "2026-01-12");
    expect(raw!.nblUrbanIncorporationDate).toBe("2023-02-14"); // fallback 적용

    const input = buildNblEngineInput(raw as never);
    expect(input!.urbanIncorporationDate).toEqual(new Date("2023-02-14"));
  });

  it("SYNC-2: NBL 도시편입일 직접 입력 시 우선 (§66 값이 덮어쓰지 않음)", () => {
    const asset = urbanFarmlandAsset({
      nblUrbanIncorporationDate: "2020-05-01",
      reductions: selfFarmingReduction("2023-02-14"),
    });
    const raw = buildNonBusinessLandRaw(asset, "2026-01-12");
    expect(raw!.nblUrbanIncorporationDate).toBe("2020-05-01"); // 명시 입력 우선
  });

  it("SYNC-3: §66 편입 감면 OFF → fallback 없음 (빈 값 유지)", () => {
    const asset = urbanFarmlandAsset({ reductions: selfFarmingReduction("2023-02-14", false) });
    const raw = buildNonBusinessLandRaw(asset, "2026-01-12");
    expect(raw!.nblUrbanIncorporationDate).toBe("");
  });

  it("SYNC-4: 판정 flip — §66 편입일 fallback 시 편입 3년 이내 → 사업용, 미적용 시 비사업용", () => {
    // 편입 2023-02-14 + 3년 = 2026-02-14 > 양도 2026-01-12 → 유예 내 → 사업용
    const withSync = urbanFarmlandAsset({ reductions: selfFarmingReduction("2023-02-14") });
    const rWith = judgeNonBusinessLand(buildNblEngineInput(buildNonBusinessLandRaw(withSync, "2026-01-12") as never)!, R);

    // 대조: fallback 없으면(감면 OFF) 편입일 미제공 → 비사업용
    const noSync = urbanFarmlandAsset({ reductions: selfFarmingReduction("2023-02-14", false) });
    const rNo = judgeNonBusinessLand(buildNblEngineInput(buildNonBusinessLandRaw(noSync, "2026-01-12") as never)!, R);

    expect(rWith.isNonBusinessLand).toBe(false); // 사업용 (+10%p 없음)
    expect(rNo.isNonBusinessLand).toBe(true); // 비사업용 (버그 재현)
  });
});
