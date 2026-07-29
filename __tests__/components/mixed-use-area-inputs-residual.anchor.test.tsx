/**
 * anchor: MixedUseAreaInputs 전용/공통 → 연면적 파생 시 잔액 흡수 정본(`residualArea`) 사용.
 *
 * 회귀 대상: `round2(exTotal + common) - r` 인라인은 바깥 round2 누락으로
 * round2 확정값끼리의 뺄셈이 2자리로 닫히지 않아 store에 "283.04999999999995"가 저장됐다
 * (그 값이 건물기준시가 모달의 연면적 prefill로 그대로 노출됨).
 *
 * 정책: lib/tax-engine/area-utils.ts — round2 + 마지막 항목 residualArea 잔액 흡수.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { MixedUseAreaInputs } from "@/components/calc/transfer/mixed-use/MixedUseAreaInputs";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

/** 전용주택·전용상가·공통을 채운 뒤 마지막 입력의 patch를 회수한다. */
function deriveFloorAreas(exR: string, exC: string, common: string): Partial<AssetForm> {
  let patch: Partial<AssetForm> = {};
  const asset: AssetForm = {
    ...makeDefaultAsset(1),
    residentialExclusiveArea: exR,
    commercialExclusiveArea: exC,
    commonArea: "",
  };
  const { getByPlaceholderText } = render(
    <MixedUseAreaInputs asset={asset} onChange={(p) => (patch = p)} />,
  );
  fireEvent.change(getByPlaceholderText("공용(공통)면적"), { target: { value: common } });
  return patch;
}

describe("MixedUseAreaInputs 연면적 파생 — 잔액 흡수 (residualArea)", () => {
  it("소수 2자리로 닫힌다 — 부동소수점 잔재 노출 금지", () => {
    const patch = deriveFloorAreas("0.10", "282.95", "0.10");
    // 회귀 전: "283.04999999999995"
    expect(patch.nonResidentialFloorArea).toBe("283.05");
    expect(patch.residentialFloorArea).toBe("0.1");
  });

  it("주택 + 상가 연면적 합 = 전용합 + 공통 (불변식)", () => {
    const cases: Array<[string, string, string, number]> = [
      ["0.10", "282.95", "0.10", 283.15],
      ["0.35", "282.70", "0.35", 283.4],
      ["100", "100", "100", 300],
      ["33.33", "33.33", "33.34", 100],
    ];
    for (const [exR, exC, common, total] of cases) {
      cleanup();
      const patch = deriveFloorAreas(exR, exC, common);
      const r = Number(patch.residentialFloorArea);
      const c = Number(patch.nonResidentialFloorArea);
      expect(r + c).toBeCloseTo(total, 10);
    }
  });

  it("저장 문자열이 표시 자리수(2자리)를 초과하지 않는다", () => {
    const patch = deriveFloorAreas("150.10", "132.85", "0.10");
    for (const v of [patch.residentialFloorArea, patch.nonResidentialFloorArea]) {
      const decimals = (v ?? "").split(".")[1] ?? "";
      expect(decimals.length).toBeLessThanOrEqual(2);
    }
  });

  it("전용면적이 모두 비면 연면적을 write 하지 않는다 (legacy 이력 보존)", () => {
    const patch = deriveFloorAreas("", "", "50");
    expect(patch.residentialFloorArea).toBeUndefined();
    expect(patch.nonResidentialFloorArea).toBeUndefined();
  });
});
