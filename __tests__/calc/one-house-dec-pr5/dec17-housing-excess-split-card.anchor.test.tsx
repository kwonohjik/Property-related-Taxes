/**
 * #17 ⑤ — 같은 날 취득 주택의 배율 초과 부수토지 분리 입력 카드 노출 ⇔ 술어 (`housingExcessNeedsLandSplit`).
 * 카드는 조건이 아니면 렌더하지 않고(값은 지우지 않는다), 입력하면 폼 필드에 기록된다(④ 전송 소스 · ⑧ 필수 대상).
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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
};

function Harness({ init, isFirst = true, transferDate = "2026-02-16" }: { init?: Partial<AssetForm>; isFirst?: boolean; transferDate?: string }) {
  const [asset, setAsset] = useState<AssetForm>({ ...makeDefaultAsset(1), ...BASE, ...init } as AssetForm);
  return (
    <HousingExcessSplitCard
      asset={asset}
      onChange={(patch) => {
        patches.push(patch);
        setAsset((a) => ({ ...a, ...patch }));
      }}
      transferDate={transferDate}
      isFirst={isFirst}
    />
  );
}

describe("HousingExcessSplitCard 노출", () => {
  it("🔑 주 자산 + 초과 200㎡ → 카드와 초과 면적 안내가 뜬다", () => {
    render(<Harness />);
    expect(screen.getByTestId("housing-excess-split-card")).toBeTruthy();
    expect(screen.getByText(/200\.00㎡/)).toBeTruthy();
  });

  it.each([
    ["컴패니언 주택 카드", { isFirst: false }],
    ["면적이 한도 이내", { init: { acquisitionArea: "300", transferArea: "300" } }],
    ["양도일 미입력", { transferDate: "" }],
    ["상속 취득", { init: { acquisitionCause: "inheritance" as const } }],
    ["소유자 분리", { init: { selfOwns: "land_only" as const } }],
  ])("대조 — %s이면 카드가 없다", (_n, props) => {
    render(<Harness {...props} />);
    expect(screen.queryByTestId("housing-excess-split-card")).toBeNull();
  });

  it("#17-4 환산·감정·매매사례 취득 — 취득시 개별주택가격 칸은 취득가액 칸의 «취득시 기준시가»가 받으므로 여기서 빼고 네 칸만 그린다", () => {
    render(<Harness init={{ useEstimatedAcquisition: true }} />);
    expect(screen.getByTestId("housing-excess-split-card")).toBeTruthy();
    expect(screen.queryByTestId("housing-excess-acq-total")).toBeNull();
    expect(screen.getByTestId("housing-excess-acq-total-elsewhere")).toBeTruthy();
    expect(screen.getByText(/아래 네 칸을 모두 입력하세요/)).toBeTruthy();
    expect(screen.getByTestId("acq-building-std")).toBeTruthy();
    expect(screen.getByTestId("split-building-std-transfer")).toBeTruthy();
  });

  it("대조 — 실지거래가액이면 취득시 개별주택가격 칸까지 다섯 칸", () => {
    render(<Harness />);
    expect(screen.getByTestId("housing-excess-acq-total")).toBeTruthy();
    expect(screen.queryByTestId("housing-excess-acq-total-elsewhere")).toBeNull();
    expect(screen.getByText(/아래 다섯 칸을 모두 입력하세요/)).toBeTruthy();
  });

  it("입력값이 자산에 기록된다 (④ 전송 소스) — 취득시 개별주택가격·건물 기준시가·양도시 건물 기준시가", () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId("housing-excess-acq-total"), { target: { value: "300,000,000" } });
    fireEvent.change(screen.getByTestId("acq-building-std"), { target: { value: "150,000,000" } });
    fireEvent.change(screen.getByTestId("split-building-std-transfer"), { target: { value: "400,000,000" } });
    const merged = Object.assign({}, ...patches) as Partial<AssetForm>;
    expect(merged.standardPriceAtAcq).toContain("300");
    expect(merged.buildingStandardPriceAtAcq).toContain("150");
    expect(merged.buildingStandardPriceAtTransfer).toContain("400");
  });
});

describe("#17 후속 — 「그중 토지분 자본적지출」 칸 (⑤ ⇔ ⑧ ⇔ ④ 같은 술어 `housingExcessNeedsCapexSplit`)", () => {
  it("🔑 자산 전체 자본적지출이 있으면 토지분 칸이 열리고, 건물분 = 전체 − 토지분을 계산값으로 보인다", () => {
    render(<Harness init={{ capitalExpenditure: "100000000" }} />);
    expect(screen.getByTestId("housing-excess-land-capex")).toBeTruthy();
    expect(screen.getByText(/아래 여섯 칸을 모두 입력하세요/)).toBeTruthy();
    expect(screen.getByTestId("housing-excess-building-capex").textContent).toContain("토지분 입력 후 표시");
    fireEvent.change(screen.getByTestId("housing-excess-land-capex"), { target: { value: "60,000,000" } });
    const merged = Object.assign({}, ...patches) as Partial<AssetForm>;
    expect(merged.housingExcessLandCapex).toContain("60");
    expect(screen.getByTestId("housing-excess-building-capex").textContent).toContain("40,000,000");
  });

  it.each([
    ["자본적지출 없음", { capitalExpenditure: "0" }],
    ["별개취득 토글 ON(같은 날짜) — 분리 섹션의 파트 칸이 받는다(이중 입력 금지)", { capitalExpenditure: "100000000", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2012-01-02" }],
  ])("대조 — %s이면 토지분 칸이 없다", (_n, init) => {
    render(<Harness init={init} />);
    expect(screen.queryByTestId("housing-excess-land-capex")).toBeNull();
    expect(screen.queryByTestId("housing-excess-capex")).toBeNull();
  });
});
