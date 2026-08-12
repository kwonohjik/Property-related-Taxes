/**
 * anchor — 일반건물 건물기준시가 **일괄 계산(배치)의 3시점 확장**.
 *
 * 계획서: `docs/02-design/features/gb-first-disclosure-3point-integration.plan.md` §4.6·§6.2
 *
 * 고정 계약:
 *   FD-4  최초공시 토글 OFF → points가 **정확히 2개** (종전 동작 회귀 0)
 *   FD-5  토글 ON + 날짜 확정 → 3개, `firstDisclosure.year`가 최초공시일 연도
 *   FD-6  배치 결과의 `firstDisclosure.housing`이 **최초공시 필드로만** 가고
 *         `gbAcqBuildingValue`를 오염시키지 않는다
 *
 * ## FD-6이 중요한 이유
 *
 * 취득시와 최초공시시는 §99-164-10 산식의 **분자와 분모**다. 배치 결과가 서로 섞이면
 * 분자 = 분모가 되어 환산주택가격이 「최초공시주택가격 그대로」로 나온다 — 예외도 경고도
 * 없이 조용히 틀린다.
 */
import { describe, it, expect } from "vitest";
import {
  buildGeneralBuildingBatchPoints,
  buildGeneralBuildingBatchPatch,
} from "@/lib/calc/building-std-batch-apply";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const TRANSFER_DATE = "2024-03-01";

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionDate: "2009-03-01",
    landAcquisitionDate: "2009-03-01",
    gbAcqLandPricePerSqm: "3,560,000",
    gbTransferLandPricePerSqm: "4,200,000",
    ...over,
  };
}

describe("FD-4 — 최초공시 토글 OFF는 종전 2시점 그대로", () => {
  it("points가 정확히 2개다", () => {
    const pts = buildGeneralBuildingBatchPoints(
      gbAsset({ gbHasFirstDisclosure: false }),
      TRANSFER_DATE,
    );
    expect(pts).toHaveLength(2);
    expect(pts.map((p) => p.key)).toEqual(["acquisition", "transfer"]);
  });

  it("날짜가 남아 있어도 토글이 꺼져 있으면 끼지 않는다 (stale 방어)", () => {
    const pts = buildGeneralBuildingBatchPoints(
      gbAsset({ gbHasFirstDisclosure: false, gbFirstDisclosureDate: "2005-04-30" }),
      TRANSFER_DATE,
    );
    expect(pts).toHaveLength(2);
  });
});

describe("FD-5 — 토글 ON + 날짜 확정이면 3시점", () => {
  const on = gbAsset({
    gbHasFirstDisclosure: true,
    gbFirstDisclosureDate: "2005-04-30",
    gbFirstDisclosureLandPricePerSqm: "2,000,000",
  });

  it("points가 3개이고 순서가 취득 → 최초공시 → 양도다", () => {
    const pts = buildGeneralBuildingBatchPoints(on, TRANSFER_DATE);
    expect(pts.map((p) => p.key)).toEqual(["acquisition", "firstDisclosure", "transfer"]);
  });

  it("firstDisclosure.year가 최초공시일의 연도다", () => {
    const fd = buildGeneralBuildingBatchPoints(on, TRANSFER_DATE).find(
      (p) => p.key === "firstDisclosure",
    );
    expect(fd?.year).toBe(2005);
    // 공시지가 기준연도는 5/31 공시 규칙상 **다른 축**이다 — 2005-04-30이면 전년도.
    expect(fd?.landPriceYear).toBe(2004);
    expect(fd?.landPricePerM2).toBe("2,000,000");
  });

  it("날짜 미입력이면 2시점으로 남는다 — 산출 못 하는 빈 시점을 띄우지 않는다", () => {
    const pts = buildGeneralBuildingBatchPoints(
      gbAsset({ gbHasFirstDisclosure: true, gbFirstDisclosureDate: "" }),
      TRANSFER_DATE,
    );
    expect(pts).toHaveLength(2);
  });
});

describe("FD-6 — 배치 결과가 시점을 넘어 오염되지 않는다", () => {
  const asset = gbAsset({ gbHasFirstDisclosure: true, gbFirstDisclosureDate: "2005-04-30" });

  it("firstDisclosure.housing은 최초공시 필드로만 간다", () => {
    const patch = buildGeneralBuildingBatchPatch(
      {
        acquisition: { housing: 36_696_000 },
        firstDisclosure: { housing: 30_000_000 },
        transfer: { housing: 42_680_000 },
      },
      asset,
    );
    expect(patch.gbFirstDisclosureBuildingStdPrice).toBe("30000000");
    // 🔑 분자(취득)·분모(최초공시)가 섞이면 환산주택가격이 조용히 틀린다.
    expect(patch.gbAcqBuildingValue).toBe("36696000");
    expect(patch.gbTransferBuildingValue).toBe("42680000");
  });

  it("공시지가 되돌려쓰기도 시점별로 분리된다", () => {
    const patch = buildGeneralBuildingBatchPatch(
      {
        landPrices: {
          acquisition: "3,560,000",
          firstDisclosure: "2,000,000",
          transfer: "4,200,000",
        },
      },
      asset,
    );
    expect(patch.gbFirstDisclosureLandPricePerSqm).toBe("2,000,000");
    expect(patch.gbAcqLandPricePerSqm).toBe("3,560,000");
    expect(patch.gbTransferLandPricePerSqm).toBe("4,200,000");
  });

  it("최초공시 시점이 안 실리면 기존 값을 지우지 않는다", () => {
    const patch = buildGeneralBuildingBatchPatch(
      { acquisition: { housing: 1 }, transfer: { housing: 2 } },
      asset,
    );
    expect(patch).not.toHaveProperty("gbFirstDisclosureBuildingStdPrice");
    expect(patch).not.toHaveProperty("gbFirstDisclosureLandPricePerSqm");
  });
});
