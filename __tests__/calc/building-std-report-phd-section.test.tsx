/**
 * 결과탭 「건물 기준시가 계산서」가 PHD 일괄 스냅샷을 시점 라벨과 함께 렌더하는지 검증(P5/C1).
 * phdBatchToSnapshots로 재구성한 스냅샷을 스토어에 심고 실제 엔진 재유도 경로로 렌더.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  BuildingStdPriceReportSection,
  hasBuildingStdReport,
} from "../../components/calc/results/BuildingStdPriceReportSection";
import { useBuildingStdSnapshotStore } from "../../lib/stores/building-std-snapshot-store";
import { phdBatchToSnapshots } from "../../lib/calc/phd-batch-snapshots";

const tp = (usageNo: number) => ({ structureKey: "rc", usageNo });
const INPUT = {
  building: {
    builtYear: 2010,
    parts: [
      { floorArea: 100, category: "housing" as const, acquisition: tp(2), firstDisclosure: tp(2), transfer: tp(2) },
    ],
  },
  acquisition: { year: 2014, landPricePerM2: 2_360_000 },
  firstDisclosure: { year: 2016, landPricePerM2: 2_369_000 },
  transfer: { year: 2025, landPricePerM2: 3_486_000 },
};
const PREFIX = "bsp-asset-x-phd";

afterEach(() => {
  cleanup();
  useBuildingStdSnapshotStore.setState({ snapshots: {} });
});

describe("BuildingStdPriceReportSection — PHD 일괄 스냅샷", () => {
  it("3시점 계산서를 시점 라벨(양도 맥락)과 함께 렌더", () => {
    useBuildingStdSnapshotStore.setState({ snapshots: phdBatchToSnapshots(INPUT, PREFIX) });
    const inputData = { assets: [{ assetId: "asset-x" }] };

    expect(hasBuildingStdReport(inputData)).toBe(true);
    render(<BuildingStdPriceReportSection inputData={inputData} />);

    // 시점 라벨 — 취득/최초공시/양도 시점 구분("양도" 접두 제거: 양도·상속 공용)
    expect(screen.getAllByText(/취득시 · 주택분/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/최초공시일 · 주택분/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/양도시 · 주택분/).length).toBeGreaterThan(0);
    // "양도" 접두 제거 확인 (상속 맥락 오표기 방지)
    expect(screen.queryByText(/양도 취득시/)).toBeNull();
    expect(screen.queryByText(/양도 최초공시일/)).toBeNull();
    // 상속 제목 미노출(맥락 정정)
    expect(screen.queryByText(/상속 건물 기준시가 계산/)).toBeNull();
    // Ⅰ.구분 — 상속세 열 마킹 없음(양도 맥락). 취득당시(2001↑)·양도당시에 ○.
    screen.getAllByTestId("nts-bsp-1-inh").forEach((el) => expect(el.textContent ?? "").not.toContain("○"));
    expect(screen.getAllByTestId("nts-bsp-1-acq2001").some((el) => (el.textContent ?? "").includes("○"))).toBe(true);
    expect(screen.getAllByTestId("nts-bsp-1-transfer").some((el) => (el.textContent ?? "").includes("○"))).toBe(true);
    // 3벌 서식 렌더
    expect(screen.getAllByTestId("nts-bsp-report").length).toBe(3);
  });

  it("취득<2001 주택분 — acq2000 취득 계산서 + ※산정기준율 표 + 양도 dummy 제거", () => {
    const PRE2001 = {
      building: {
        builtYear: 1997,
        parts: [
          { floorArea: 327.6, category: "housing" as const, acquisition: tp(1), firstDisclosure: tp(2), transfer: tp(2) },
        ],
      },
      acquisition: { year: 1997, landPricePerM2: 1_200_000 },
      firstDisclosure: { year: 2005, landPricePerM2: 3_000_000 },
      transfer: { year: 2026, landPricePerM2: 6_216_000 },
    };
    useBuildingStdSnapshotStore.setState({ snapshots: phdBatchToSnapshots(PRE2001, PREFIX) });
    const inputData = { assets: [{ assetId: "asset-x" }] };
    render(<BuildingStdPriceReportSection inputData={inputData} />);

    // 취득시 연도 = acquisitionYear(1997) — valuationYear 부재 fallback
    expect(screen.getAllByText(/취득시 · 주택분 \(1997년\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/최초공시일 · 주택분/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/양도시 · 주택분/).length).toBeGreaterThan(0);
    // Ⅰ.구분 — 취득당시 2000.12.31 이전(acq2000) 칸에 ○
    expect(screen.getAllByTestId("nts-bsp-1-acq2000").some((el) => (el.textContent ?? "").includes("○"))).toBe(true);
    // ※ 산정기준율 표(nts-bsp-x-2) 노출
    expect(screen.getAllByTestId("nts-bsp-x-2").length).toBeGreaterThan(0);
    // 3벌(취득 acq2000 + 최초공시 + 양도) — 취득 스냅샷의 양도 dummy 인스턴스는 필터로 제거
    expect(screen.getAllByTestId("nts-bsp-report").length).toBe(3);
    // 양도 dummy(2001년) 미노출
    expect(screen.queryByText(/양도시 · 주택분 \(2001년\)/)).toBeNull();
  });

  it("소속되지 않는 스냅샷(다른 assetId)은 렌더 안 함", () => {
    useBuildingStdSnapshotStore.setState({ snapshots: phdBatchToSnapshots(INPUT, PREFIX) });
    expect(hasBuildingStdReport({ assets: [{ assetId: "other" }] })).toBe(false);
    const { container } = render(
      <BuildingStdPriceReportSection inputData={{ assets: [{ assetId: "other" }] }} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
