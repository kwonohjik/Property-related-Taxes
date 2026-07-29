/**
 * BuildingStdPriceForm — 단일 시점 모드 렌더 게이트 (S7·S8)
 *
 * 계획서: docs/02-design/features/building-std-modal-single-timepoint.plan.md (§6)
 *
 * 모달 호출부가 한 시점 필드에만 값을 주입할 때(applyTimePoint) 반대 시점 입력을 노출하지 않는다.
 * ⚠️ 취득연도 == 양도연도이면 §164⑧ 환산이 우선 — 2시점 입력을 모두 되살린다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { BuildingStdPriceForm } from "@/components/calc/building-std-price/BuildingStdPriceForm";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";

describe("S7 양도 전용(singleTimePoint='transfer')", () => {
  const renderTransferOnly = (acquisitionYear = "2015") =>
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        initialForm={{ singleTimePoint: "transfer", acquisitionYear, transferYear: "2025" }}
        onResult={() => {}}
      />,
    );

  it("S7-a 취득당시 구조·용도·공시지가가 렌더되지 않는다", () => {
    renderTransferOnly();
    expect(screen.queryByText("취득당시 구조")).toBeNull();
    expect(screen.queryByText("취득당시 용도")).toBeNull();
    expect(screen.queryByText("취득당시 ㎡당 개별공시지가")).toBeNull();
  });

  it("S7-b 취득연도 칸은 남는다 (§164⑧ 판정 근거)", () => {
    renderTransferOnly();
    expect(screen.getByText("취득연도")).toBeTruthy();
    expect(screen.getByTestId("bsp-transfer-only-note")).toBeTruthy();
  });

  it("S7-c 양도 시점 입력은 그대로 렌더된다", () => {
    renderTransferOnly();
    expect(screen.getByText("양도당시 구조")).toBeTruthy();
    expect(screen.getByText("양도당시 용도")).toBeTruthy();
  });

  it("S7-d 복합구조·공동주택 환산 토글 숨김 (엔진이 2시점 경로로 되돌리므로)", () => {
    renderTransferOnly();
    expect(screen.queryByText("복합구조 (층·구역별 구조·용도 상이)")).toBeNull();
    expect(screen.queryByText(/공동주택 고시 전 취득/)).toBeNull();
  });

  // §164⑧ — 동일연도이면 취득 입력이 양도값의 소스라 전부 되살아난다
  it("S7-e 동일연도: 취득 구조·용도·공시지가가 다시 렌더된다", () => {
    renderTransferOnly("2025");
    expect(screen.getByText("취득당시 구조")).toBeTruthy();
    expect(screen.getByText("취득당시 용도")).toBeTruthy();
    expect(screen.queryByTestId("bsp-transfer-only-note")).toBeNull();
  });
});

describe("S8 취득 전용(singleTimePoint='acquisition')", () => {
  const renderAcqOnly = () =>
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        initialForm={{ singleTimePoint: "acquisition", acquisitionYear: "2015", transferYear: "2025" }}
        onResult={() => {}}
      />,
    );

  it("S8-a 양도 시점 섹션이 렌더되지 않는다", () => {
    renderAcqOnly();
    expect(screen.queryByTestId("bsp-section-transfer")).toBeNull();
    expect(screen.queryByText("양도당시 구조")).toBeNull();
    expect(screen.queryByText("양도연도")).toBeNull();
  });

  it("S8-b 취득 시점 입력은 전부 렌더된다", () => {
    renderAcqOnly();
    expect(screen.getByTestId("bsp-section-acq")).toBeTruthy();
    expect(screen.getByText("취득당시 구조")).toBeTruthy();
    expect(screen.getByText("취득당시 용도")).toBeTruthy();
    expect(screen.getByText("취득일")).toBeTruthy();
  });
});

describe("S8-c 하위호환 — singleTimePoint 미지정은 2시점 전부 렌더", () => {
  it("기존 스냅샷(플래그 없음) 복원 시 종전 화면", () => {
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        initialForm={{ acquisitionYear: "2015", transferYear: "2025" }}
        onResult={() => {}}
      />,
    );
    expect(screen.getByText("취득당시 구조")).toBeTruthy();
    expect(screen.getByText("양도당시 구조")).toBeTruthy();
    expect(screen.getByText("복합구조 (층·구역별 구조·용도 상이)")).toBeTruthy();
  });
});

describe("S8-d 모달이 applyTimePoint를 폼 모드로 주입", () => {
  it("applyTimePoint='transfer' 모달을 열면 취득 구조·용도가 숨겨진다", async () => {
    const { getByRole } = render(
      <BuildingStdPriceModalButton
        lockedTaxType="transfer"
        applyTimePoint="transfer"
        buttonLabel="양도시 건물 기준시가 계산"
        prefill={{ acquisitionDate: "2015-03-02", transferDate: "2025-05-01" }}
        onApply={() => {}}
      />,
    );
    getByRole("button", { name: "양도시 건물 기준시가 계산" }).click();
    expect(await screen.findByTestId("bsp-transfer-only-note")).toBeTruthy();
    expect(screen.queryByText("취득당시 구조")).toBeNull();
  });

  // onApplyBoth(겸용 상가) = 2시점 동시 적용 — 단일 시점으로 좁히면 안 된다
  it("onApplyBoth 지정 시에는 2시점 전부 렌더", async () => {
    const { getByRole } = render(
      <BuildingStdPriceModalButton
        lockedTaxType="transfer"
        applyTimePoint="transfer"
        onApplyBoth={() => {}}
        buttonLabel="건물 기준시가 계산"
        prefill={{ acquisitionDate: "2015-03-02", transferDate: "2025-05-01" }}
      />,
    );
    getByRole("button", { name: "건물 기준시가 계산" }).click();
    expect(await screen.findByText("취득당시 구조")).toBeTruthy();
    expect(screen.queryByTestId("bsp-transfer-only-note")).toBeNull();
  });
});
