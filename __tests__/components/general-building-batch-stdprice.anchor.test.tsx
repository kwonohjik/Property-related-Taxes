/**
 * P4 anchor — 일반건물 취득·양도 **2시점** 일괄 계산 배선
 *
 * 계획서: docs/02-design/features/building-std-price-modal-multipoint.plan.md §5 P4
 *
 * 고정 계약:
 *   A. patch는 2시점(`gbAcqBuildingValue`·`gbTransferBuildingValue`) — 최초고시 시점 없음
 *   B. 취득 ≤2000의 모달 공시지가는 취득당시 토지값에 넣지 않는다(2001.1.1 기준 트랙)
 *   C. 취득 시점은 **건물 취득일**이 따로 있으면 그것을 쓴다(§166⑥ 별개취득)
 *   D. 게이트가 막으면 배치 런처 대신 사유 + 시점별 계산기 유지
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GeneralBuildingBlock } from "../../components/calc/transfer/GeneralBuildingBlock";
import { buildGeneralBuildingBatchPatch } from "@/lib/calc/building-std-batch-apply";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    useEstimatedAcquisition: true, // ② 취득시 기준시가 카드 노출 조건
    acquisitionDate: "2010-06-01",
    gbLandArea: "200",
    gbBuildingArea: "300",
    ...over,
  } as AssetForm;
}

const twoPointResult = {
  acquisition: { housing: 40_000_000 },
  transfer: { housing: 90_000_000 },
};

describe("A — 2시점 patch", () => {
  it("취득·양도 건물기준시가만 담는다 (최초고시 시점 없음)", () => {
    const patch = buildGeneralBuildingBatchPatch(twoPointResult, { acquisitionDate: "2010-06-01", landAcquisitionDate: "2010-06-01" });
    expect(patch).toEqual({
      gbAcqBuildingValue: "40000000",
      gbTransferBuildingValue: "90000000",
    });
  });

  it("미산출 시점은 넣지 않는다 (기존 값 보존)", () => {
    const patch = buildGeneralBuildingBatchPatch(
      { transfer: { housing: 90_000_000 } },
      { acquisitionDate: "2010-06-01", landAcquisitionDate: "2010-06-01" },
    );
    expect(patch).toEqual({ gbTransferBuildingValue: "90000000" });
  });
});

describe("B·C — 공시지가 트랙과 취득 시점", () => {
  it("취득 ≤2000: 모달 공시지가를 취득당시 토지값에 넣지 않는다", () => {
    const patch = buildGeneralBuildingBatchPatch(
      { ...twoPointResult, landPrices: { acquisition: "300000", transfer: "1200000" } },
      { acquisitionDate: "1998-04-01", landAcquisitionDate: "1998-04-01" },
    );
    expect(patch.gbAcqLandPricePerSqm).toBeUndefined();
    expect(patch.gbTransferLandPricePerSqm).toBe("1200000");
  });

  it("취득 ≥2001: 취득 공시지가도 반영", () => {
    const patch = buildGeneralBuildingBatchPatch(
      { ...twoPointResult, landPrices: { acquisition: "300000" } },
      { acquisitionDate: "2010-06-01", landAcquisitionDate: "2010-06-01" },
    );
    expect(patch.gbAcqLandPricePerSqm).toBe("300000");
  });

  it("건물 취득일 연도로 트랙을 판정한다 (§166⑥ 별개취득)", () => {
    // 🔄 M-1a(2026-08-05): `acquisitionDate`가 곧 **건물** 취득일이다(토지는 landAcquisitionDate).
    //    건물 1999 → ≤2000 트랙 → 드롭
    const patch = buildGeneralBuildingBatchPatch(
      { ...twoPointResult, landPrices: { acquisition: "300000" } },
      { acquisitionDate: "1999-08-20", landAcquisitionDate: "1999-08-20" },
    );
    expect(patch.gbAcqLandPricePerSqm).toBeUndefined();
  });
});

describe("D — 게이트 연동", () => {
  /**
   * 🔄 **의도적으로 뒤집힌 계약** (2026-08-05) — 종전: "배치 런처 + 시점별 계산기 병존".
   * 배치가 있으면 시점별 2개는 중복이라 숨긴다(사용자 요청). 배치가 **없는** 경우
   * (아래 §164⑧ 케이스·실거래가 모드)에는 그대로 남아 dead-end가 생기지 않는다.
   */
  it("정상(취득 2010 · 양도 2025) → 배치 런처만 노출 (시점별 계산기 숨김)", () => {
    render(<GeneralBuildingBlock asset={gbAsset()} onChange={() => {}} transferDate="2025-05-01" />);
    expect(screen.getByTestId("gb-building-std-batch-open")).toBeTruthy();
    expect(screen.queryAllByText("건물 기준시가 계산")).toHaveLength(0);
  });

  it("취득연도 == 양도연도(§164⑧) → 사유 표시 + 시점별 계산기 유지", () => {
    render(
      <GeneralBuildingBlock
        asset={gbAsset({ acquisitionDate: "2025-02-01", landAcquisitionDate: "2025-02-01" })}
        onChange={() => {}}
        transferDate="2025-11-01"
      />,
    );
    expect(screen.queryByTestId("gb-building-std-batch-open")).toBeNull();
    expect(screen.getByText(/제164조 제8항/)).toBeTruthy();
    expect(screen.getAllByText("건물 기준시가 계산").length).toBeGreaterThan(0);
  });
});

describe("E — 취득 공시지가 자동입력 제외 안내 (2026-08-04)", () => {
  it("취득 ≤2000: 트랙 안내 hint", () => {
    render(
      <GeneralBuildingBlock
        asset={gbAsset({ acquisitionDate: "1998-04-01", landAcquisitionDate: "1998-04-01" })}
        onChange={() => {}}
        transferDate="2025-05-01"
      />,
    );
    expect(screen.getByText(/2001.1.1 기준 공시지가는 위치지수 산정용/)).toBeTruthy();
  });

  it("취득 ≥2001: 종전 hint 유지", () => {
    render(<GeneralBuildingBlock asset={gbAsset()} onChange={() => {}} transferDate="2025-05-01" />);
    expect(screen.getByText("취득일 전년도 기준 개별공시지가 (원/㎡)")).toBeTruthy();
    expect(screen.queryByText(/위치지수 산정용/)).toBeNull();
  });
});
