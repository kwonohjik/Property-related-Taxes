/**
 * NBL 도시편입일 깨진 형식("20230214") → §66 편입일 fallback 회귀.
 *
 * 버그: 도시편입일 필드가 raw <input type="text">라 "20230214"(하이픈 없음)이 그대로 저장됨.
 * new Date("20230214")=Invalid → toOptionalDate=undefined → "편입일 미제공" → 편입유예 미적용
 * → 재촌·자경 농지가 비사업용으로 오판(+10%p 중과). 삭제하면(§66 fallback) 사업용으로 정상 판정.
 *
 * 수정: (1) UI를 DateInput으로 교체(향후 차단) (2) buildNonBusinessLandRaw에서 비-ISO 직접입력은
 * 미입력 취급 → §66 편입일 fallback(현재 저장된 깨진 값 자동 치유).
 */
import { describe, it, expect } from "vitest";
import { buildNonBusinessLandRaw, buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/** 도시지역(공업지역) 편입 농지 + 재촌·자경 baseline. 편입일 필드만 케이스별로 주입. */
function urbanFarmlandAsset(nblUrbanIncorporationDate: string, sfDate: string | undefined): AssetForm {
  const a = makeDefaultAsset();
  a.assetKind = "land";
  a.nblUseDetailedJudgment = true;
  a.acquisitionArea = "661";
  a.acquisitionDate = "1975-05-24";
  a.nblLandType = "farmland";
  a.nblZoneType = "industrial";
  a.nblFarmingSelf = true;
  a.nblUrbanIncorporationDate = nblUrbanIncorporationDate;
  a.nblLandSigunguCode = "48310";
  a.nblResidenceHistories = [
    { sigunguCode: "48310", sigunguName: "경상남도 거제시", startDate: "1975-05-24", endDate: "2023-02-14", hasResidentRegistration: true },
  ];
  a.nblBusinessUsePeriods = [
    { startDate: "1975-05-24", endDate: "2023-02-14", usageType: "자경" },
  ];
  a.reductions = sfDate
    ? [{ type: "self_farming", farmingYears: "20", useSelfFarmingIncorporation: true, selfFarmingIncorporationDate: sfDate }]
    : [];
  return a;
}

const TRANSFER = "2025-06-01"; // 편입 2023-02-14 + 3년(2026-02-14) 이내 → 유예 적용 시 사업용

describe("NBL 도시편입일 깨진 형식 fallback", () => {
  it('직접입력이 "20230214"(비-ISO)면 §66 편입일("2023-02-14")로 fallback', () => {
    const asset = urbanFarmlandAsset("20230214", "2023-02-14");
    const raw = buildNonBusinessLandRaw(asset, TRANSFER);
    expect(raw?.nblUrbanIncorporationDate).toBe("2023-02-14");
  });

  it("깨진 직접입력 + §66 편입일 → 편입유예 적용 → 사업용(비사업용 아님)", () => {
    const asset = urbanFarmlandAsset("20230214", "2023-02-14");
    const engineInput = buildNblEngineInput(buildNonBusinessLandRaw(asset, TRANSFER) as never);
    const judged = judgeNonBusinessLand(engineInput!);
    expect(judged.isNonBusinessLand).toBe(false);
  });

  it("유효한 ISO 직접입력은 그대로 우선 적용", () => {
    const asset = urbanFarmlandAsset("2024-01-01", "2023-02-14");
    const raw = buildNonBusinessLandRaw(asset, TRANSFER);
    expect(raw?.nblUrbanIncorporationDate).toBe("2024-01-01");
  });

  it("깨진 직접입력 + §66 없음 → 빈 값(미입력)", () => {
    const asset = urbanFarmlandAsset("20230214", undefined);
    const raw = buildNonBusinessLandRaw(asset, TRANSFER);
    expect(raw?.nblUrbanIncorporationDate).toBe("");
  });
});
