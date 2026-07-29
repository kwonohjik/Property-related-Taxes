/**
 * validate anchor — 겸용주택 토지 취득일 요구는 상속·증여 취득에서 발동하지 않는다.
 *
 * 배경(버그): 겸용주택 토글은 MixedUseSection에서 hasSeperateLandAcquisitionDate를
 * 강제 ON 하지만, 상속·증여 취득 UI에는 별도 "토지 취득일" 입력란이 없다(토지·건물 모두
 * 상속개시일/증여일 = acquisitionDate). API는 landAcquisitionDate || acquisitionDate 로
 * fallback(transfer-tax-api-mixed-use.ts:77)하는데 validate만 이를 무시해 API/UI 통과 ↔
 * validate 차단 모순이 발생했다. 매매 split(실제 입력란 존재)은 그대로 요구를 유지한다.
 */
import { describe, it, expect } from "vitest";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

function mixed(over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing" as const,
    isMixedUseHouse: true,
    hasSeperateLandAcquisitionDate: true, // 겸용 토글이 강제 ON 하는 값
    acquisitionDate: "2015-03-10", // 건물 취득일(상속개시일/증여일과 동일 기록)
    landAcquisitionDate: "", // 상속·증여 경로는 항상 빈 값
    ...over,
  };
}

describe("겸용주택 토지 취득일 요구 — 취득원인별", () => {
  it("상속 취득 + 토지 취득일 미입력 → '토지 취득일' 오요구 없음", () => {
    const err = validateAssetAcquisition(mixed({ acquisitionCause: "inheritance" }), "자산");
    expect(err).not.toMatch(/토지 취득일/);
  });

  it("증여 취득 + 토지 취득일 미입력 → '토지 취득일' 오요구 없음", () => {
    const err = validateAssetAcquisition(mixed({ acquisitionCause: "gift" }), "자산");
    expect(err).not.toMatch(/토지 취득일/);
  });

  it("매매 split 취득 + 토지 취득일 미입력 → '토지 취득일' 요구 유지(회귀 방지)", () => {
    const err = validateAssetAcquisition(mixed({ acquisitionCause: "purchase" }), "자산");
    expect(err).toMatch(/토지 취득일을 입력하세요/);
  });
});
