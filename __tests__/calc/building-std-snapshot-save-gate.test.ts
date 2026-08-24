/**
 * V-5 — 이력 저장 시 stale 스냅샷을 동봉하지 않는다 (L-1).
 * 계획서: docs/00-pm/redev-phd-snapshot-staleness-gate.plan.md
 *
 * 서버 PDF(`building-std-pdf-data.ts`)는 저장된 `input_data.buildingStdSnapshots`에서
 * 계산서를 재유도한다 — **소속 판정을 다시 하지 않는다**. 따라서 여기서 거르지 않으면
 * 화면에서는 사라진 계산서가 PDF·이력 복원에는 남는다(화면↔PDF 어긋남).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { extractRelevantBuildingStdSnapshots } from "@/lib/storage/use-auto-save-calculation";
import { useBuildingStdSnapshotStore } from "@/lib/stores/building-std-snapshot-store";
import { initialBuildingStdPriceForm } from "@/lib/calc/building-std-price-form";

const snap = {
  ...initialBuildingStdPriceForm,
  taxType: "transfer" as const,
  builtYear: "2001", floorArea: "84.9",
  acquisitionYear: "2003", transferYear: "2005",
  acqStructureKey: "rc", acqUsageNo: "2", acqLandPrice: "1400000",
  transStructureKey: "rc", transUsageNo: "2", transLandPrice: "1400000",
};

const inputWith = (over: Record<string, unknown>) => ({
  assets: [{
    assetId: "asset-r",
    useEstimatedAcquisition: true,
    acquisitionDate: "2003-05-10",
    redevFirstDisclosureDate: "2005-04-30",
    ...over,
  }],
});

beforeEach(() => {
  useBuildingStdSnapshotStore.setState({
    snapshots: { "bsp-asset-r-redev-phd": snap, "bsp-asset-r-gb-acq": snap },
  });
});

describe("extractRelevantBuildingStdSnapshots — 적용성 게이트", () => {
  it("트리거 ON → -redev-phd 동봉", () => {
    const out = extractRelevantBuildingStdSnapshots(inputWith({}));
    expect(Object.keys(out ?? {}).sort()).toEqual(["bsp-asset-r-gb-acq", "bsp-asset-r-redev-phd"]);
  });

  it("트리거 OFF → -redev-phd만 제외, 다른 키는 그대로", () => {
    const out = extractRelevantBuildingStdSnapshots(inputWith({ acquisitionDate: "2010-03-01" }));
    expect(Object.keys(out ?? {})).toEqual(["bsp-asset-r-gb-acq"]);
  });

  it("적용 스냅샷이 하나도 안 남으면 undefined (input_data에 빈 객체를 넣지 않는다)", () => {
    useBuildingStdSnapshotStore.setState({ snapshots: { "bsp-asset-r-redev-phd": snap } });
    expect(extractRelevantBuildingStdSnapshots(inputWith({ useEstimatedAcquisition: false }))).toBeUndefined();
  });
});
