/**
 * anchor: 분리 OFF 단일 취득원인 → **건물 축까지** 이월과세로 기록한다 (Q09 · ⑤).
 *
 * 여기가 결함의 발원지였다 — `toBuildingCause`가 `carryover_gift`를 `purchase`로 강등해,
 * 화면에는 「이월과세(증여)」인데 건물만 매매로 계산됐다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { GeneralBuildingAcquisitionCards } from "../../components/calc/transfer/GeneralBuildingAcquisitionCards";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-store";
import type { AssetForm } from "../../lib/stores/calc-wizard-asset";

afterEach(cleanup);

function asset(over: Record<string, unknown> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    hasSeperateLandAcquisitionDate: false,
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    ...over,
  } as unknown as AssetForm;
}

describe("일반건물 분리 OFF — 단일 취득원인 → 건물 축 매핑", () => {
  it("🔑 「이월과세(증여)」를 고르면 건물 축도 carryover_gift로 간다 (한 patch에)", () => {
    const onChange = vi.fn();
    render(
      <GeneralBuildingAcquisitionCards
        asset={asset()}
        onChange={onChange}
        transferDate="2027-03-10"
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "이월과세(증여)" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({
      acquisitionCause: "carryover_gift",
      gbBuildingAcquisitionCause: "carryover_gift",
    });
  });

  it("상속·증여는 종전대로 그대로 따라간다", () => {
    const onChange = vi.fn();
    render(
      <GeneralBuildingAcquisitionCards
        asset={asset()}
        onChange={onChange}
        transferDate="2027-03-10"
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "상속" }));
    expect(onChange.mock.calls[0][0]).toMatchObject({
      acquisitionCause: "inheritance",
      gbBuildingAcquisitionCause: "inheritance",
    });
  });

  it("🔑 분리 OFF + 이월과세면 건물 파트 카드가 렌더된다 (평가액 두 칸)", () => {
    render(
      <GeneralBuildingAcquisitionCards
        asset={asset({
          acquisitionCause: "carryover_gift",
          gbBuildingAcquisitionCause: "carryover_gift",
        })}
        onChange={() => {}}
        transferDate="2027-03-10"
      />,
    );
    expect(screen.getByText(/건물 파트 이월과세/)).toBeTruthy();
    // 「증여 당시 평가액」 칸이 토지·건물 두 벌 있어야 한다.
    expect(screen.getAllByText(/증여 당시 평가액/).length).toBeGreaterThanOrEqual(2);
  });

  it("부담부증여에서는 건물 파트 카드를 띄우지 않는다 (§159 경로가 취득가액을 정한다)", () => {
    render(
      <GeneralBuildingAcquisitionCards
        asset={asset({
          acquisitionCause: "carryover_gift",
          gbBuildingAcquisitionCause: "carryover_gift",
          transferType: "burdened_gift",
        })}
        onChange={() => {}}
        transferDate="2027-03-10"
      />,
    );
    expect(screen.queryByText(/건물 파트 이월과세/)).toBeNull();
  });
});
