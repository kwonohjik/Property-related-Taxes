/**
 * 증환지 증가분 — 자동복사(Phase A) + 면적 정합(Phase B) 회귀 앵커
 *
 * Phase B: 당초분 양도면적 = 권리면적(교부면적은 allocatedArea만, transferArea 미오염)
 *          → 환산취득가·안분·신고서 면적 정합 (docs/00-pm/transfer-replot-increase-autofill.plan.md §6)
 * Phase A: 증가분 자동추가 시 소재지·양도시 공시가격·토지 성격 자동복사, 사용자는 취득가액만 입력.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { ReplotIncreaseFields } from "@/components/calc/transfer/CompanionAssetCardReplot";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

function baseAsset(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    areaScenario: "increase",
    ...overrides,
  };
}

describe("증환지 증가분 자동복사 + 면적 정합 (Phase A+B)", () => {
  it("Phase B: 권리면적 입력 → entitlementArea·transferArea write (당초분 양도면적=권리, acquisitionArea 미오염)", () => {
    const onChange = vi.fn();
    render(<ReplotIncreaseFields asset={baseAsset()} onChange={onChange} onAddAsset={vi.fn()} />);
    fireEvent.change(screen.getByTestId("replot-inc-entitlement-area"), { target: { value: "396.8" } });
    expect(onChange).toHaveBeenCalledWith({
      entitlementArea: "396.8",
      transferArea: "396.8",
    });
    // 취득면적(acquisitionArea)은 건드리지 않음 — 종전토지 면적은 ③ 취득정보에서 별도 입력
    expect(onChange.mock.calls[0][0]).not.toHaveProperty("acquisitionArea");
  });

  it("Phase B: 교부면적 입력 → allocatedArea만 write (transferArea 미오염)", () => {
    const onChange = vi.fn();
    render(<ReplotIncreaseFields asset={baseAsset()} onChange={onChange} onAddAsset={vi.fn()} />);
    fireEvent.change(screen.getByTestId("replot-inc-allocated-area"), { target: { value: "429" } });
    expect(onChange).toHaveBeenCalledWith({ allocatedArea: "429" });
    // transferArea를 건드리지 않아야 함 (이중계상 방지)
    expect(onChange.mock.calls[0][0]).not.toHaveProperty("transferArea");
  });

  it("Phase A: 증가분 추가 → 소재지·공시가격·토지성격 자동복사 + 총액 재계산 + 취득가액 제외", () => {
    const onAddAsset = vi.fn();
    const asset = baseAsset({
      entitlementArea: "400",
      allocatedArea: "432",
      transferArea: "400",
      replottingConfirmDate: "2007-04-26",
      addressRoad: "테헤란로 1",
      addressJibun: "서울시 강남구 역삼동 1",
      landNature: "standalone",
      standardPricePerSqmAtTransfer: "1000000",
      standardPriceAtTransferLabel: "2023년 공시지가",
      regionCode: "1168010100",
      nblLandSigunguCode: "11680",
      nblLandSigunguName: "강남구",
    });
    render(<ReplotIncreaseFields asset={asset} onChange={vi.fn()} onAddAsset={onAddAsset} />);
    fireEvent.click(screen.getByTestId("replot-inc-add-btn"));

    expect(onAddAsset).toHaveBeenCalledTimes(1);
    const patch = onAddAsset.mock.calls[0][0];

    // 면적: 증가분 = 432 − 400 = 32
    expect(parseFloat(patch.acquisitionArea)).toBeCloseTo(32, 4);
    expect(parseFloat(patch.transferArea)).toBeCloseTo(32, 4);
    // 취득일 = 환지처분확정일(2007-04-26) 익일 (증가분은 환지익일 자동)
    expect(patch.acquisitionDate).toBe("2007-04-27");
    // Live fallback 마커 — 당초분 양도시 기준시가 파생 대상
    expect(patch.isReplotIncrement).toBe(true);

    // 소재지 자동복사
    expect(patch.addressRoad).toBe("테헤란로 1");
    expect(patch.addressJibun).toBe("서울시 강남구 역삼동 1");
    // 토지 성격 자동복사
    expect(patch.landNature).toBe("standalone");
    // 양도당시 공시가격: ㎡당 복사 + 총액 재계산(= floor(1,000,000 × 32) = 32,000,000)
    expect(patch.standardPricePerSqmAtTransfer).toBe("1000000");
    expect(patch.standardPriceAtTransfer).toBe("32000000");
    expect(patch.standardPriceAtTransferLabel).toBe("2023년 공시지가");
    // 조정지역·시군구 자동복사
    expect(patch.regionCode).toBe("1168010100");
    expect(patch.nblLandSigunguCode).toBe("11680");

    // 취득가액은 자동복사 대상 아님 → 사용자 입력 (patch에 미포함)
    expect(patch.fixedAcquisitionPrice).toBeUndefined();
    // 증가분은 실지 취득(환산 아님) → useEstimatedAcquisition 미설정
    expect(patch.useEstimatedAcquisition).toBeUndefined();
  });

  it("Phase A: 양도시 ㎡당 기준시가 미입력 시 총액은 빈 문자열(안전)", () => {
    const onAddAsset = vi.fn();
    const asset = baseAsset({
      entitlementArea: "400",
      allocatedArea: "432",
      standardPricePerSqmAtTransfer: "",
    });
    render(<ReplotIncreaseFields asset={asset} onChange={vi.fn()} onAddAsset={onAddAsset} />);
    fireEvent.click(screen.getByTestId("replot-inc-add-btn"));
    const patch = onAddAsset.mock.calls[0][0];
    expect(patch.standardPriceAtTransfer).toBe("");
  });
});
