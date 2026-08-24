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

  it("재개발 §164⑦ PHD 환산 통합 스냅샷(-redev-phd) — 취득시·최초공시일 2벌 + 조문 라벨 분기", async () => {
    const { initialBuildingStdPriceForm } = await import("../../lib/calc/building-std-price-form");
    // 재개발 §166③ 환산의 §164⑦ 본문 — 취득일(2003) < 최초공시일(2005-04-30) 발동 케이스.
    // 감면 PHD(-red-phd)와 **같은 2시점 구조**이고 조문 라벨만 다르다.
    const redevForm = {
      ...initialBuildingStdPriceForm,
      taxType: "transfer" as const,
      builtYear: "2001", floorArea: "84.9",
      acquisitionYear: "2003", transferYear: "2005",
      acqStructureKey: "rc", acqUsageNo: "2", acqLandPrice: "1400000",
      transStructureKey: "rc", transUsageNo: "2", transLandPrice: "1400000",
    };
    useBuildingStdSnapshotStore.setState({ snapshots: { "bsp-asset-r-redev-phd": redevForm } });
    // 트리거 필드를 실제 폼과 같이 채운다 — 적용성 게이트(L-1)가 이 값으로 판정한다.
    const inputData = {
      assets: [{
        assetId: "asset-r",
        useEstimatedAcquisition: true,
        acquisitionDate: "2003-05-10",
        redevFirstDisclosureDate: "2005-04-30",
      }],
    };

    // 규약 편입(idOfSnapshotKey) 미적용이면 여기서 false — 계산서가 조용히 사라진다.
    expect(hasBuildingStdReport(inputData)).toBe(true);
    render(<BuildingStdPriceReportSection inputData={inputData} />);

    expect(screen.getAllByTestId("nts-bsp-report").length).toBe(2);
    expect(screen.getAllByText(/취득시 \(재개발 환산 §164⑦/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/최초공시일 \(재개발 환산 §164⑦/).length).toBeGreaterThan(0);
    // 🔑 감면(§164⑤) 라벨이 섞이지 않는다 — 조문 분기 구별력
    expect(screen.queryByText(/감면 PHD 환산/)).toBeNull();
    // 두 시점 모두 "취득 시점 측" — 취득당시(acq2001) 칸 마킹, 양도당시 아님
    expect(
      screen.getAllByTestId("nts-bsp-1-acq2001").filter((el) => (el.textContent ?? "").includes("○")).length,
    ).toBe(2);
    expect(
      screen.getAllByTestId("nts-bsp-1-transfer").filter((el) => (el.textContent ?? "").includes("○")).length,
    ).toBe(0);
  });

  /**
   * L-1 — §164⑦ 트리거가 꺼지면 그 스냅샷의 계산서도 사라져야 한다.
   * 계획서: docs/00-pm/redev-phd-snapshot-staleness-gate.plan.md
   *
   * 소속 판정이 `inputStr.includes(id)` 뿐이라, 스냅샷을 만든 **조건이 아직 성립하는지**는
   * 아무도 보지 않았다. 취득일을 정정해 트리거가 풀려도 계산서 2장이 계속 찍혔다(2026-08-24 실측).
   */
  describe("L-1: §164⑦ 트리거 상태와 계산서 노출", () => {
    const redevSnap = () => ({
      ...initialBuildingStdPriceForm,
      taxType: "transfer" as const,
      builtYear: "2001", floorArea: "84.9",
      acquisitionYear: "2003", transferYear: "2005",
      acqStructureKey: "rc", acqUsageNo: "2", acqLandPrice: "1400000",
      transStructureKey: "rc", transUsageNo: "2", transLandPrice: "1400000",
    });
    const assetOf = (over: Record<string, unknown>) => ({
      assets: [{
        assetId: "asset-r",
        assetKind: "redevelopment_apt",
        useEstimatedAcquisition: true,
        acquisitionDate: "2003-05-10",
        redevFirstDisclosureDate: "2005-04-30",
        ...over,
      }],
    });

    it("V-1 트리거 OFF(취득일을 최초공시일 이후로 정정) → 계산서 0장", () => {
      useBuildingStdSnapshotStore.setState({ snapshots: { "bsp-asset-r-redev-phd": redevSnap() } });
      const inputData = assetOf({ acquisitionDate: "2010-03-01" });
      expect(hasBuildingStdReport(inputData)).toBe(false);
      const { container } = render(<BuildingStdPriceReportSection inputData={inputData} />);
      expect(container.firstChild).toBeNull();
    });

    it("V-2 트리거 ON은 그대로 2장 (과잉 차단 방지)", () => {
      useBuildingStdSnapshotStore.setState({ snapshots: { "bsp-asset-r-redev-phd": redevSnap() } });
      const inputData = assetOf({});
      expect(hasBuildingStdReport(inputData)).toBe(true);
      render(<BuildingStdPriceReportSection inputData={inputData} />);
      expect(screen.getAllByTestId("nts-bsp-report").length).toBe(2);
    });

    it("V-3 실가 모드로 되돌리면(useEstimatedAcquisition=false) 0장", () => {
      useBuildingStdSnapshotStore.setState({ snapshots: { "bsp-asset-r-redev-phd": redevSnap() } });
      const inputData = assetOf({ useEstimatedAcquisition: false });
      expect(hasBuildingStdReport(inputData)).toBe(false);
    });
  });

  /**
   * B-4 — 한 자산에 **두 조문**의 감면 PHD 계산서가 나란히 뜬다.
   * 종전 키는 조문 구분이 없어 나중 계산이 앞 계산을 덮어썼다 → 계산서가 1장뿐이었다.
   */
  it("두 조문(§99의3 · §98의8)의 감면 PHD 스냅샷 → 계산서 4장 + 제목에 조문 구별", async () => {
    const { initialBuildingStdPriceForm } = await import("../../lib/calc/building-std-price-form");
    const snap = {
      ...initialBuildingStdPriceForm,
      taxType: "transfer" as const,
      builtYear: "2001", floorArea: "84.9",
      acquisitionYear: "2003", transferYear: "2006",
      acqStructureKey: "rc", acqUsageNo: "2", acqLandPrice: "2000000",
      transStructureKey: "rc", transUsageNo: "2", transLandPrice: "2100000",
    };
    useBuildingStdSnapshotStore.setState({
      snapshots: {
        "bsp-asset-k-red993-phd": snap,
        "bsp-asset-k-red988-phd": snap,
      },
    });
    const inputData = { assets: [{ assetId: "asset-k" }] };
    expect(hasBuildingStdReport(inputData)).toBe(true);
    render(<BuildingStdPriceReportSection inputData={inputData} />);

    // 조문 2개 × 시점 2개
    expect(screen.getAllByTestId("nts-bsp-report").length).toBe(4);
    // 제목은 접힘 헤더와 펼친 서식 양쪽에 렌더되므로 개수 대신 **존재**로 단언한다
    // (개수에 기대면 렌더 구조 변경에 취약하다). 핵심은 두 조문이 **구별된다**는 것.
    expect(screen.getAllByText(/§99의3 감면 PHD 환산/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/§98의8 감면 PHD 환산/).length).toBeGreaterThan(0);
  });

  it("구 키(`-red-phd`)는 조문 표기 없이 종전 제목 그대로 — 저장분 호환", async () => {
    const { initialBuildingStdPriceForm } = await import("../../lib/calc/building-std-price-form");
    useBuildingStdSnapshotStore.setState({
      snapshots: {
        "bsp-asset-k-red-phd": {
          ...initialBuildingStdPriceForm,
          taxType: "transfer" as const,
          builtYear: "2001", floorArea: "84.9",
          acquisitionYear: "2003", transferYear: "2006",
          acqStructureKey: "rc", acqUsageNo: "2", acqLandPrice: "2000000",
          transStructureKey: "rc", transUsageNo: "2", transLandPrice: "2100000",
        },
      },
    });
    render(<BuildingStdPriceReportSection inputData={{ assets: [{ assetId: "asset-k" }] }} />);
    expect(screen.getAllByTestId("nts-bsp-report").length).toBe(2);
    // 조문 표기가 붙지 않은 종전 제목 그대로
    expect(screen.getAllByText(/취득시 \(감면 PHD 환산 §164⑤\)/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/§99의3 감면 PHD 환산/)).toBeNull();
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

/**
 * 접힘 헤더 제목 구별 (H1) — 2026-08-12 사용자 제보
 *
 * 종전 헤더는 `titleOverride`가 없으면 전부 "(인쇄 서식)"이라, 한 계산에 계산서가 여러 장이면
 * **제목만 보고는 어느 것인지 알 수 없었다**(실측 스크린샷: 세 장 중 두 장이 동일 제목).
 * 시점·건물 구분·소재지는 서식 안에 이미 있으므로 헤더로 끌어올린다.
 *
 * ⚠️ 펼친 서식의 제목(`INSTANCE_TITLE`)과 Ⅰ.구분 마킹은 **변경 대상이 아니다** — 위 S9가 고정한다.
 */
describe("BuildingStdPriceReportSection — 접힘 헤더 제목 구별", () => {
  const snapshot = (address?: string): BuildingStdPriceFormState => ({
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
    ...(address ? { addressJibun: address } : {}),
  });

  const headers = () =>
    screen
      .getAllByRole("button", { name: /국세청.*계산서/ })
      .map((el) => (el.textContent ?? "").replace(/▼|▲|펼치기|접기/g, "").trim());

  it("H1-a 같은 자산의 취득·양도 + 증축분이 서로 다른 제목", () => {
    useBuildingStdSnapshotStore.setState({
      snapshots: {
        "bsp-asset-x-gb-acq": snapshot(),
        "bsp-asset-x-gb-transfer": snapshot(),
        "bsp-asset-x-gb-ext-transfer": snapshot(),
      },
    });
    render(<BuildingStdPriceReportSection inputData={{ assets: [{ assetId: "asset-x" }] }} />);

    const titles = headers();
    expect(titles.length).toBe(3);
    // 🔑 회귀의 본질 — 제목이 서로 달라야 한다(종전엔 3장 모두 "(인쇄 서식)")
    expect(new Set(titles).size).toBe(3);
    expect(titles.some((t) => t.includes("일반건물") && t.includes("취득당시"))).toBe(true);
    expect(titles.some((t) => t.includes("일반건물") && t.includes("양도당시"))).toBe(true);
    expect(titles.some((t) => t.includes("증축분(건물2)"))).toBe(true);
    expect(titles.some((t) => t.includes("인쇄 서식"))).toBe(false);
  });

  it("H1-b 시점·구분이 같아도 소재지가 다르면 갈린다(다건 결과뷰)", () => {
    useBuildingStdSnapshotStore.setState({
      snapshots: {
        "bsp-a1-gb-transfer": snapshot("서울 강남구 역삼동 1"),
        "bsp-a2-gb-transfer": snapshot("서울 마포구 공덕동 2"),
      },
    });
    render(
      <BuildingStdPriceReportSection inputData={{ assets: [{ assetId: "a1" }, { assetId: "a2" }] }} />,
    );

    const titles = headers();
    expect(titles.length).toBe(2);
    expect(new Set(titles).size).toBe(2);
    expect(titles.some((t) => t.includes("역삼동 1"))).toBe(true);
    expect(titles.some((t) => t.includes("공덕동 2"))).toBe(true);
  });

  it("H1-c 배치 스냅샷은 종전 제목 유지 + 구분 라벨 미중복", () => {
    useBuildingStdSnapshotStore.setState({ snapshots: phdBatchToSnapshots(INPUT, PREFIX) });
    render(<BuildingStdPriceReportSection inputData={{ assets: [{ assetId: "asset-x" }] }} />);

    const titles = headers();
    expect(titles.length).toBe(3);
    expect(titles.some((t) => t.includes("취득시 · 주택분"))).toBe(true);
    // 배치 제목에는 건물 구분 라벨을 붙이지 않는다(주택분/상가분이 이미 있다)
    expect(titles.some((t) => t.includes("일반건물"))).toBe(false);
  });
});
