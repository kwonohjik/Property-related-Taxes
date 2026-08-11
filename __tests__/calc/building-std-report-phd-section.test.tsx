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
import {
  initialBuildingStdPriceForm,
  type BuildingStdPriceFormState,
} from "../../lib/calc/building-std-price-form";

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

  it("gb 2시점 스냅샷(-gb-acq·-gb-transfer) — 시점 전용 필터로 취득·양도 각 1벌(중복 제거)", async () => {
    const { initialBuildingStdPriceForm } = await import("../../lib/calc/building-std-price-form");
    const gbForm = {
      ...initialBuildingStdPriceForm,
      taxType: "transfer" as const,
      builtYear: "1997", floorArea: "327.6",
      acquisitionYear: "1997", transferYear: "2026",
      acqStructureKey: "rc", acqUsageNo: "1", acqLandPrice: "1200000",
      transStructureKey: "rc", transUsageNo: "2", transLandPrice: "6216000",
    };
    useBuildingStdSnapshotStore.setState({
      snapshots: { "bsp-asset-x-gb-transfer": gbForm, "bsp-asset-x-gb-acq": gbForm },
    });
    render(<BuildingStdPriceReportSection inputData={{ assets: [{ assetId: "asset-x" }] }} />);
    // 2 스냅샷 → 2 계산서(-gb-acq=취득당시 1벌, -gb-transfer=양도당시 1벌). 중복 없음.
    expect(screen.getAllByTestId("nts-bsp-report").length).toBe(2);
    // 취득당시(acq2000, 취득<2001) 1벌 + 양도당시 1벌 — 각 markCell ○ 1개씩
    expect(screen.getAllByTestId("nts-bsp-1-acq2000").filter((el) => (el.textContent ?? "").includes("○")).length).toBe(1);
    expect(screen.getAllByTestId("nts-bsp-1-transfer").filter((el) => (el.textContent ?? "").includes("○")).length).toBe(1);
    // 취득 계산서에 ※산정기준율 표(nts-bsp-x-2) 1개
    expect(screen.getAllByTestId("nts-bsp-x-2").length).toBe(1);
  });

  it("🔴 일반건물 2시점 일괄(-gb-*) 배치 스냅샷 — 양도 맥락으로 표기(상속 오표기 정정)", () => {
    // 배치는 계산서를 valuation(taxType=inheritance_gift) 스냅샷으로 **재구성**한다.
    // Ⅰ.구분 마킹·제목 override가 종전에는 배치 전용 키(-phd-*·-cb-first)에만 걸려,
    // 일반건물 배치 키(-gb-acq/-gb-transfer)는 재구성 맥락(상속)이 그대로 표시됐다.
    // 실측(2026-08-11 브라우저): 제목 "상속 건물 기준시가 계산" + 상속세 칸 ○.
    useBuildingStdSnapshotStore.setState({
      snapshots: phdBatchToSnapshots(
        {
          building: {
            builtYear: 2022,
            parts: [{ floorArea: 300, category: "housing" as const, acquisition: tp(2), transfer: tp(2) }],
          },
          acquisition: { year: 2022, landPricePerM2: 3_000_000 },
          transfer: { year: 2026, landPricePerM2: 5_000_000 },
        },
        "bsp-asset-x-gb",
      ),
    });
    const inputData = { assets: [{ assetId: "asset-x" }] };
    render(<BuildingStdPriceReportSection inputData={inputData} />);

    // 취득시·양도시 2벌
    expect(screen.getAllByTestId("nts-bsp-report").length).toBe(2);
    // 🔑 상속세 칸에 ○가 없어야 한다 (양도 계산이다)
    screen.getAllByTestId("nts-bsp-1-inh").forEach((el) => expect(el.textContent ?? "").not.toContain("○"));
    // 🔑 취득당시(2001↑)·양도당시 칸에 각각 ○
    expect(screen.getAllByTestId("nts-bsp-1-acq2001").filter((el) => (el.textContent ?? "").includes("○")).length).toBe(1);
    expect(screen.getAllByTestId("nts-bsp-1-transfer").filter((el) => (el.textContent ?? "").includes("○")).length).toBe(1);
    // 🔑 제목이 상속 맥락이 아니다
    expect(screen.queryByText(/상속 건물 기준시가 계산/)).toBeNull();
  });

  it("감면 PHD 환산 통합 스냅샷(-red-phd) — 취득시·최초공시일 2벌 렌더(계산서 미출력 결함 정정)", async () => {
    const { initialBuildingStdPriceForm } = await import("../../lib/calc/building-std-price-form");
    // 취득시+최초공시시 2시점을 한 모달에서 계산하는 단일 스냅샷(transfer 모드, 최초공시=transYear).
    const redForm = {
      ...initialBuildingStdPriceForm,
      taxType: "transfer" as const,
      builtYear: "2001", floorArea: "84.9",
      acquisitionYear: "2003", transferYear: "2006",
      acqStructureKey: "rc", acqUsageNo: "2", acqLandPrice: "2000000",
      transStructureKey: "rc", transUsageNo: "2", transLandPrice: "2100000",
    };
    useBuildingStdSnapshotStore.setState({ snapshots: { "bsp-asset-x-red-phd": redForm } });
    const inputData = { assets: [{ assetId: "asset-x" }] };

    expect(hasBuildingStdReport(inputData)).toBe(true); // 규약 편입 → 소속 판정 통과
    render(<BuildingStdPriceReportSection inputData={inputData} />);

    // 단일 스냅샷 2 인스턴스 → 시점별 계산서 2벌
    expect(screen.getAllByTestId("nts-bsp-report").length).toBe(2);
    expect(screen.getAllByText(/취득시 \(감면 PHD 환산/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/최초공시일 \(감면 PHD 환산/).length).toBeGreaterThan(0);
    // §164⑤ 환산은 두 시점 모두 "취득 시점 측" — 취득당시(acq2001) 칸 마킹, 양도당시(transfer) 아님
    expect(
      screen.getAllByTestId("nts-bsp-1-acq2001").filter((el) => (el.textContent ?? "").includes("○")).length,
    ).toBe(2);
    expect(
      screen.getAllByTestId("nts-bsp-1-transfer").filter((el) => (el.textContent ?? "").includes("○")).length,
    ).toBe(0);
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

/**
 * 시점 전용 스냅샷의 반대 시점 인스턴스 제거 (S9)
 *
 * 계획서: docs/02-design/features/building-std-modal-single-timepoint.plan.md (§3 D5)
 * 키 접두 열거가 누락되면 계산서가 **조용히 2벌** 출력된다 — split-acq·split-transfer·cbinh-acq가
 * 그 상태였다(2026-07-29 실측). 단일 시점 모드 도입 이전에 저장된 2시점 스냅샷이 대상이다.
 */
describe("BuildingStdPriceReportSection — 시점 전용 키 필터", () => {
  /** 단일 시점 모드 이전에 저장된 2시점 양도 스냅샷(플래그 없음) */
  const legacyTwoPointSnapshot = (): BuildingStdPriceFormState => ({
    ...initialBuildingStdPriceForm,
    taxType: "transfer",
    builtYear: "2010",
    floorArea: "200",
    acquisitionYear: "2015",
    acqStructureKey: "rc",
    acqUsageNo: "1",
    acqLandPrice: "5000000",
    transferYear: "2025",
    transStructureKey: "rc",
    transUsageNo: "1",
    transLandPrice: "7500000",
  });

  const renderWithKey = (key: string) => {
    useBuildingStdSnapshotStore.setState({ snapshots: { [key]: legacyTwoPointSnapshot() } });
    const inputData = { assets: [{ assetId: "asset-x" }] };
    render(<BuildingStdPriceReportSection inputData={inputData} />);
  };

  it("S9-a split-transfer: 양도당시 계산서 1벌만", () => {
    renderWithKey("bsp-asset-x-split-transfer");
    expect(screen.getAllByText(/양도당시 기준시가 계산/).length).toBe(1);
    expect(screen.queryAllByText(/취득당시 기준시가 계산/).length).toBe(0);
  });

  it("S9-b split-acq: 취득당시 계산서 1벌만", () => {
    renderWithKey("bsp-asset-x-split-acq");
    expect(screen.getAllByText(/취득당시 기준시가 계산/).length).toBe(1);
    expect(screen.queryAllByText(/양도당시 기준시가 계산/).length).toBe(0);
  });

  it("S9-c cbinh-acq(상속취득 상가): 취득당시 계산서 1벌만", () => {
    renderWithKey("bsp-asset-x-cbinh-acq");
    expect(screen.getAllByText(/취득당시 기준시가 계산/).length).toBe(1);
    expect(screen.queryAllByText(/양도당시 기준시가 계산/).length).toBe(0);
  });

  it("S9-d gb-transfer(기존 커버 키) 회귀", () => {
    renderWithKey("bsp-asset-x-gb-transfer");
    expect(screen.getAllByText(/양도당시 기준시가 계산/).length).toBe(1);
    expect(screen.queryAllByText(/취득당시 기준시가 계산/).length).toBe(0);
  });

  // 겸용 상가(-mx-commercial)는 onApplyBoth로 취득·양도 두 시점을 모두 쓰므로 2벌이 정상이다
  it("S9-e 2시점 키(-mx-commercial)는 취득·양도 2벌 그대로", () => {
    renderWithKey("bsp-asset-x-mx-commercial");
    expect(screen.getAllByText(/취득당시 기준시가 계산/).length).toBe(1);
    expect(screen.getAllByText(/양도당시 기준시가 계산/).length).toBe(1);
  });
});
