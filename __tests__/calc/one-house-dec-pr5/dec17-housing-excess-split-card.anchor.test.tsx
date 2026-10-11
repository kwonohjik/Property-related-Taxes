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
