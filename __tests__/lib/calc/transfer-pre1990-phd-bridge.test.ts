/**
 * 겸용주택 PHD + 1990.8.30. 이전 취득 토지 환산 브리지 헬퍼 anchor.
 *
 * useEffect→store 미러링 제거 후, 컴포넌트 표시·API 변환·validate가 공유하는
 * 단일 진실 헬퍼가 엔진(calculatePre1990LandValuation)과 동일 ㎡당 가액을 도출함을 보장.
 */
import { describe, it, expect } from "vitest";
import {
  derivePre1990PhdLandPricePerSqmAtAcq,
  derivePhdResidentialLandArea,
} from "@/lib/calc/transfer-pre1990-phd-bridge";
import { calculatePre1990LandValuation } from "@/lib/tax-engine/pre-1990-land-valuation";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const TRANSFER_DATE = "2024-05-01";

function mixedPre1990Asset(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(),
    assetKind: "housing",
    isMixedUseHouse: true,
    acquisitionDate: "1988-03-01", // < 1990-08-30
    pre1990Enabled: true,
    pre1990GradeMode: "number",
    pre1990Grade_current: "120",
    pre1990Grade_prev: "118",
    pre1990Grade_atAcq: "100",
    pre1990PricePerSqm_1990: "150,000",
    // 겸용 면적 — 주택부수토지 자동 산정용
    residentialFloorArea: "60",
    nonResidentialFloorArea: "40",
    mixedUseTotalLandArea: "200",
    ...overrides,
  } as AssetForm;
}

describe("derivePre1990PhdLandPricePerSqmAtAcq", () => {
  it("엔진 calculatePre1990LandValuation.pricePerSqmAtAcquisition과 동일 (단일 진실)", () => {
    const asset = mixedPre1990Asset();
    const area = derivePhdResidentialLandArea(asset);
    expect(area).toBeGreaterThan(0); // 200 × 60/100 = 120㎡

    const derived = derivePre1990PhdLandPricePerSqmAtAcq(asset, TRANSFER_DATE);
    expect(derived).not.toBeNull();
    expect(derived!).toBeGreaterThan(0);

    const direct = calculatePre1990LandValuation({
      acquisitionDate: new Date("1988-03-01"),
      transferDate: new Date(TRANSFER_DATE),
      areaSqm: area,
      pricePerSqm_1990: 150_000,
      pricePerSqm_atTransfer: 150_000,
      grade_1990_0830: 120,
      gradePrev_1990_0830: 118,
      gradeAtAcquisition: 100,
    });
    expect(derived).toBe(direct.pricePerSqmAtAcquisition);
  });

  it("pre1990Enabled=false → null", () => {
    expect(
      derivePre1990PhdLandPricePerSqmAtAcq(mixedPre1990Asset({ pre1990Enabled: false }), TRANSFER_DATE),
    ).toBeNull();
  });

  it("취득일 1990-08-30 이후 → null", () => {
    expect(
      derivePre1990PhdLandPricePerSqmAtAcq(mixedPre1990Asset({ acquisitionDate: "1995-01-01" }), TRANSFER_DATE),
    ).toBeNull();
  });

  it("등급 입력 부족 → null", () => {
    expect(
      derivePre1990PhdLandPricePerSqmAtAcq(mixedPre1990Asset({ pre1990Grade_atAcq: "" }), TRANSFER_DATE),
    ).toBeNull();
  });

  it("면적 0(겸용 면적 미입력) → null", () => {
    expect(
      derivePre1990PhdLandPricePerSqmAtAcq(
        mixedPre1990Asset({ residentialFloorArea: "", nonResidentialFloorArea: "", mixedUseTotalLandArea: "", phdResidentialLandArea: "" }),
        TRANSFER_DATE,
      ),
    ).toBeNull();
  });
});
