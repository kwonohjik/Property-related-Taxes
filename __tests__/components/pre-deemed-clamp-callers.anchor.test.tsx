/**
 * anchor — 1985.1.1. 전 매매 취득일 덮어쓰기는 **호출부의 날짜 키**로 써야 한다 (PR-2 회귀 · PR-3a)
 * 계획서: docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md §12
 *
 * PR-2는 덮어쓰기와 원값 보존을 한 패치 `{ acquisitionDate, preDeemedOriginalAcquisitionDate }`로 썼다.
 * 일반건물 매매 카드는 같은 칸에 `landAcquisitionDate`를 넘기고 날짜 핸들러가 분리 여부에 따라 키를 고른다 —
 * 그 패치가 분리 OFF에선 토지 키를 1984로 남기고, 분리 ON에선 **건물 취득일을 1985-01-01로 덮었다**.
 * 실제 호출부(`GeneralBuildingAcquisitionCards` · `CompanionAcquisitionCauseSection`)를 렌더해 고정한다.
 */
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GeneralBuildingAcquisitionCards } from "@/components/calc/transfer/GeneralBuildingAcquisitionCards";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const asset = (o: Partial<AssetForm>) => ({ ...makeDefaultAsset(1), acquisitionCause: "purchase", ...o }) as AssetForm;
const state = (a: AssetForm) =>
  `${a.acquisitionDate}|${a.landAcquisitionDate}|${a.preDeemedOriginalAcquisitionDate}|${a.preDeemedOriginalLandAcquisitionDate}`;

function GbHarness({ initial }: { initial: Partial<AssetForm> }) {
  const [a, setA] = useState<AssetForm>(
    asset({ assetKind: "general_building", gbBuildingAcquisitionCause: "purchase", ...initial }),
  );
  return (
    <>
      <GeneralBuildingAcquisitionCards asset={a} onChange={(p) => setA((x) => ({ ...x, ...p }))} transferDate="2026-02-16" />
      <output data-testid="state">{state(a)}</output>
    </>
  );
}

function SingleHarness({ initial }: { initial: Partial<AssetForm> }) {
  const [a, setA] = useState<AssetForm>(asset(initial));
  return (
    <>
      <CompanionAcquisitionCauseSection
        asset={a}
        onChange={(p) => setA((x) => ({ ...x, ...p }))}
        transferDate="2026-02-16"
        isNewConstruction={false}
      />
      <output data-testid="state">{state(a)}</output>
    </>
  );
}

describe("일반건물 매매 — 덮어쓰기가 토지·건물 날짜 키를 지킨다", () => {
  it("분리 OFF 1984-06-01 → 토지·건물 둘 다 1985-01-01 (불변식 land = acq)", () => {
    render(<GbHarness initial={{ acquisitionDate: "1984-06-01", landAcquisitionDate: "1984-06-01" }} />);
    fireEvent.blur(screen.getByTestId("acq-date-building"));
    expect(screen.getByTestId("state").textContent).toBe("1985-01-01|1985-01-01|1984-06-01|");
  });
  it("분리 ON 토지 1984-06-01 · 건물 1995-03-01 → 토지만 1985-01-01 · 건물 1995 유지", () => {
    render(
      <GbHarness
        initial={{ hasSeperateLandAcquisitionDate: true, acquisitionDate: "1995-03-01", landAcquisitionDate: "1984-06-01" }}
      />,
    );
    fireEvent.blur(screen.getByTestId("acq-date-building"));
    expect(screen.getByTestId("state").textContent).toBe("1995-03-01|1985-01-01||1984-06-01");
  });
});

describe("토지·건물 취득일 분리 — 파트 칸", () => {
  it("일반건물 분리 ON 건물 칸 1984 → 건물 1985-01-01 · 건물 실제 취득일 보존", () => {
    render(<GbHarness initial={{ hasSeperateLandAcquisitionDate: true, acquisitionDate: "1984-06-01", landAcquisitionDate: "1995-03-01" }} />);
    const card = screen.getByText("건물 취득일").closest('[data-field="acquisitionDate"]') as HTMLElement;
    fireEvent.blur(card.querySelector("input")!);
    expect(screen.getByTestId("state").textContent).toBe("1985-01-01|1995-03-01|1984-06-01|");
  });
  it("주택 토지 칸 1984 → 토지 1985-01-01 · 토지 실제 취득일 보존 · 건물 그대로", () => {
    render(<SingleHarness initial={{ assetKind: "housing", hasSeperateLandAcquisitionDate: true, acquisitionDate: "1990-03-01", landAcquisitionDate: "1984-06-01" }} />);
    fireEvent.blur(screen.getByTestId("acq-date-land").querySelector("input")!);
    expect(screen.getByTestId("state").textContent).toBe("1990-03-01|1985-01-01||1984-06-01");
  });
});

describe("토지·주택 매매(1차 범위) — 덮어쓰기와 원값 보존은 그대로", () => {
  it("토지 1984-06-01 → 취득일 1985-01-01 · 실제 취득일 1984-06-01", () => {
    render(<SingleHarness initial={{ assetKind: "land", acquisitionDate: "1984-06-01" }} />);
    fireEvent.blur(screen.getByTestId("acq-date-building"));
    expect(screen.getByTestId("state").textContent).toMatch(/^1985-01-01\|.*\|1984-06-01\|$/);
  });
});
