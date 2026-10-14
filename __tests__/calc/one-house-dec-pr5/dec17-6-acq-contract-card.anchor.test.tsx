/**
 * #17-6 ⑤ — 분리 카드의 «취득 당시 계약서 토지·건물 구분금액» 칸 노출 ⇔ 술어(`housingExcessNeedsAcqContract`) · 단서 토글은 양도일 2025.1.1. 이후만.
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { HousingExcessSplitCard } from "@/components/calc/transfer/HousingExcessSplitCard";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const patches: Partial<AssetForm>[] = [];
afterEach(() => {
  cleanup();
  patches.length = 0;
});

const BASE: Partial<AssetForm> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2012-01-02",
  addressJibun: "서울 테스트동 1",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  areaScenario: "same",
  acquisitionArea: "500",
  transferArea: "500",
  fixedAcquisitionPrice: "500000000",
};

function Harness({ init, transferDate = "2026-02-16" }: { init?: Partial<AssetForm>; transferDate?: string }) {
  const [asset, setAsset] = useState<AssetForm>({ ...makeDefaultAsset(1), ...BASE, ...init } as AssetForm);
  return (
    <HousingExcessSplitCard
      asset={asset}
      onChange={(patch) => {
        patches.push(patch);
        setAsset((a) => ({ ...a, ...patch }));
      }}
      transferDate={transferDate}
    />
  );
}

describe("#17-6 계약서 구분금액 칸 노출", () => {
  it("🔑 실지거래가액 취득 + 분리 경로 → 토지·건물 2칸이 열리고 입력이 폼 필드에 기록된다 (④ 전송 소스)", () => {
    render(<Harness />);
    expect(screen.getByTestId("housing-excess-acq-contract")).toBeTruthy();
    fireEvent.change(screen.getByTestId("housing-excess-acq-contract-land"), { target: { value: "300,000,000" } });
    fireEvent.change(screen.getByTestId("housing-excess-acq-contract-building"), { target: { value: "200,000,000" } });
    const merged = Object.assign({}, ...patches) as Partial<AssetForm>;
    expect(merged.acqContractLandPrice).toContain("300");
    expect(merged.acqContractBuildingPrice).toContain("200");
    expect(screen.getByTestId("housing-excess-acq-contract-sum").textContent).toContain("취득가액과 같음");
  });

  it("합이 취득가액과 다르면 화면이 그 사실을 보인다 (⑧이 같은 값으로 막는다)", () => {
    render(<Harness init={{ acqContractLandPrice: "300000000", acqContractBuildingPrice: "100000000" }} />);
    expect(screen.getByTestId("housing-excess-acq-contract-sum").textContent).toContain("취득가액 500,000,000과 다름");
  });

  it.each([
    ["환산 취득", { useEstimatedAcquisition: true }],
    ["별개취득 토글 ON(같은 날짜) — 분리 섹션의 파트 취득가액 칸이 받는다(이중 입력 금지)", { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2012-01-02" }],
  ])("대조 — %s이면 계약서 구분금액 칸이 없다 (카드는 그대로)", (_n, init) => {
    render(<Harness init={init} />);
    expect(screen.getByTestId("housing-excess-split-card")).toBeTruthy();
    expect(screen.queryByTestId("housing-excess-acq-contract")).toBeNull();
  });

  it("대조 — 면적이 한도 이내라 카드 자체가 없으면 칸도 없다", () => {
    render(<Harness init={{ acquisitionArea: "300", transferArea: "300" }} />);
    expect(screen.queryByTestId("housing-excess-split-card")).toBeNull();
    expect(screen.queryByTestId("housing-excess-acq-contract")).toBeNull();
  });
});

describe("#17-6 연혁 — 단서 토글(영 §166⑧1호)은 양도일 2025.1.1. 이후만", () => {
  it("2025-01-01 양도 → 토글이 있고 켜면 acqContractOtherLaw=true 가 기록된다 (기본은 꺼짐)", () => {
    render(<Harness transferDate="2025-01-01" />);
    const toggle = screen.getByTestId("housing-excess-acq-contract-other-law");
    const sw = within(toggle).getByRole("switch");
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect((Object.assign({}, ...patches) as Partial<AssetForm>).acqContractOtherLaw).toBe(true);
  });

  it("2024-12-31 양도 → 토글 없음, 30% 판정 안내는 있다", () => {
    render(<Harness transferDate="2024-12-31" />);
    expect(screen.queryByTestId("housing-excess-acq-contract-other-law")).toBeNull();
    expect(screen.getByTestId("housing-excess-acq-contract").textContent).toContain("100분의 30");
  });

  it("2015-12-31 양도 → 판정 없음 안내(입력 금액을 그대로 씀) · 토글 없음 / 2016-01-01 → 30% 판정 안내", () => {
    const { unmount } = render(<Harness transferDate="2015-12-31" init={{ acquisitionArea: "800", transferArea: "800" }} />);
    expect(screen.getByTestId("housing-excess-acq-contract").textContent).toContain("판정을 하지 않고 입력한 금액을 그대로 씁니다");
    expect(screen.queryByTestId("housing-excess-acq-contract-other-law")).toBeNull();
    unmount();
    render(<Harness transferDate="2016-01-01" init={{ acquisitionArea: "800", transferArea: "800" }} />);
    expect(screen.getByTestId("housing-excess-acq-contract").textContent).not.toContain("판정을 하지 않고");
  });
});
