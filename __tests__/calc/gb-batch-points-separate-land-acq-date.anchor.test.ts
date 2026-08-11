/**
 * Pre-Do anchor — 일반건물 배치 시점 구성: 토지·건물 취득일이 다를 때의 공시지가 축 (버그 ①).
 *
 * ## 실측 결함
 *
 * 토지 취득 2008 · 건물 취득 2022인 자산에서, 모달 「취득시 (2022년) 공시지가」 칸에
 * `gbAcqLandPricePerSqm`가 그대로 prefill됐다. 그런데 그 필드는 ① 토지 공시지가 카드가
 * **토지 취득일(2008) 기준연도 = 2007**로 조회해 넣은 값이다 — 2022년 위치지수에 2007년
 * 공시지가를 넣으면 건물 기준시가가 조용히 틀린다.
 *
 * 되돌려쓰기도 같은 오염의 반대 방향이다: 모달에서 2021년 기준 공시지가를 입력하면
 * `buildGeneralBuildingBatchPatch`가 그것을 `gbAcqLandPricePerSqm`(토지축 2007)에 덮어썼다.
 *
 * 판정 축은 "취득일이 같은가"가 아니라 **"공시지가 기준연도가 같은가"**다 — 개별공시지가는
 * 매년 5/31 공시라 2022-01-10과 2022-03-05는 둘 다 2021년 기준으로 같은 값을 쓴다.
 */
import { describe, it, expect } from "vitest";
import {
  buildGeneralBuildingBatchPoints,
  buildGeneralBuildingBatchPatch,
} from "@/lib/calc/building-std-batch-apply";

const baseAsset = {
  acquisitionDate: "2022-06-15",
  landAcquisitionDate: "2008-03-10",
  gbAcqLandPricePerSqm: "3,920,000",
  gbTransferLandPricePerSqm: "5,627,000",
};

describe("G-1 — 기준연도가 다르면 취득 공시지가를 prefill하지 않고 조회 필드로 연다", () => {
  const points = buildGeneralBuildingBatchPoints(baseAsset, "2026-02-19");
  const acq = points.find((p) => p.key === "acquisition")!;

  it("취득시 prefill이 비어 있다(토지축 값 유입 차단)", () => {
    expect(acq.landPricePerM2).toBe("");
  });

  it("취득시 공시지가 기준연도 = 건물 취득일(2022-06-15) 기준 2022", () => {
    // 6/15는 5/31 공시 이후 → 당해연도
    expect(acq.landPriceYear).toBe(2022);
    expect(acq.year).toBe(2022); // 고시 체계 연도는 그대로
  });

  it("조회 필드로 열리고 사유가 붙는다(dead-end 금지)", () => {
    expect(acq.lookupLandPrice).toBe(true);
    expect(acq.landPriceHint).toBeTruthy();
  });
});

describe("G-2 — 기준연도가 같으면 종전대로 prefill(회귀 0)", () => {
  it("분리 OFF(두 날짜 동일) → 상위 값 그대로", () => {
    const points = buildGeneralBuildingBatchPoints(
      { ...baseAsset, landAcquisitionDate: "2022-06-15" },
      "2026-02-19",
    );
    const acq = points.find((p) => p.key === "acquisition")!;
    expect(acq.landPricePerM2).toBe("3,920,000");
    expect(acq.lookupLandPrice).toBeFalsy();
  });

  it("날짜는 달라도 같은 공시지가 기준연도면 공유한다(2022-01-10 · 2022-03-05 → 둘 다 2021)", () => {
    const points = buildGeneralBuildingBatchPoints(
      { ...baseAsset, acquisitionDate: "2022-03-05", landAcquisitionDate: "2022-01-10" },
      "2026-02-19",
    );
    const acq = points.find((p) => p.key === "acquisition")!;
    expect(acq.landPriceYear).toBe(2021);
    expect(acq.landPricePerM2).toBe("3,920,000");
    expect(acq.lookupLandPrice).toBeFalsy();
  });
});

describe("G-3 — 양도시 공시지가 기준연도는 양도일의 5/31 규칙을 따른다", () => {
  it("양도 2026-02-19 → 2025 (고시 체계 연도 2026과 별개)", () => {
    const t = buildGeneralBuildingBatchPoints(baseAsset, "2026-02-19").find(
      (p) => p.key === "transfer",
    )!;
    expect(t.landPriceYear).toBe(2025);
    expect(t.year).toBe(2026);
    expect(t.landPricePerM2).toBe("5,627,000");
  });

  it("양도 2026-08-01 → 2026", () => {
    const t = buildGeneralBuildingBatchPoints(baseAsset, "2026-08-01").find(
      (p) => p.key === "transfer",
    )!;
    expect(t.landPriceYear).toBe(2026);
  });
});

describe("G-4 — 되돌려쓰기도 같은 게이트를 탄다", () => {
  it("기준연도가 다르면 취득 공시지가를 gbAcqLandPricePerSqm에 쓰지 않는다", () => {
    const patch = buildGeneralBuildingBatchPatch(
      { acquisition: { housing: 100 }, landPrices: { acquisition: "4,500,000" } },
      baseAsset,
    );
    expect(patch.gbAcqLandPricePerSqm).toBeUndefined();
    expect(patch.gbAcqBuildingValue).toBe("100"); // 건물 기준시가는 그대로 반영
  });

  it("기준연도가 같으면 종전대로 되돌려쓴다(회귀 0)", () => {
    const patch = buildGeneralBuildingBatchPatch(
      { acquisition: { housing: 100 }, landPrices: { acquisition: "4,500,000" } },
      { ...baseAsset, landAcquisitionDate: "2022-06-15" },
    );
    expect(patch.gbAcqLandPricePerSqm).toBe("4,500,000");
  });
});
