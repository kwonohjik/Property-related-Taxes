/**
 * anchor: 주택 별개취득 — 취득시 토지 공시지가·면적 입력 노출 (§99①1호 가목).
 *
 * 계획서: docs/02-design/features/transfer-split-acq-std-gate-relaxation.plan.md (§4.7 / PR2)
 *
 * 🔴 결함: 종전에는 축 B 블록 전체가 `assetKind === "building"` 전용이라
 * **주택은 취득시 ㎡당 공시지가·토지 면적을 입력할 칸이 앱 어디에도 없었다**:
 *   · 공용 `StandardPriceInput`은 주택(`house_individual`)에서 총액 칸만 렌더
 *     (area 모드는 `land`·`building_non_residential` 전용 — StandardPriceInput.tsx:98-100)
 *   · 면적 블록은 `assetKind === "land"` 게이트 (AssetSectionBasic.tsx:298)
 *   · PHD 토글은 `phdLandPricePerSqmAtAcq`라는 **다른 필드**라 해소 불가
 * → 엔진 `calcAcqStdPair`가 항상 null → 환산·감정·매매사례 파트 취득가액이 조용히 0.
 *
 * 불변식: **토지분은 자산 종류 무관 노출**, **건물분 명시 입력은 `building` 전용**
 * (주택 라목은 결합 공시 — `총액 − 토지분` 역산만이 개산공제 법정액 §163⑥2호가목과 정합).
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LandBuildingSplitSection } from "@/components/calc/transfer/LandBuildingSplitSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

// ⚠️ 파트 모드 기본값이 **환산(estimated)**이다(2026-07-29). 취득시 기준시가 카드는
//    `requiresAcqStdPrice` 술어로 게이팅되므로 실가/실가에서는 노출되지 않는다
//    (계획서 transfer-split-part-std-card-gating.plan.md D1). 이 파일이 지키는 불변식
//    ("주택도 토지분 노출 / 건물분 명시 입력은 building 전용")은 **환산 모드에서** 성립하며,
//    원 결함(환산 파트 취득가액이 조용히 0)도 환산에서만 발생하므로 의도는 훼손되지 않는다.
function Harness({ init }: { init: Partial<AssetForm> }) {
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    hasSeperateLandAcquisitionDate: true,
    acquisitionDate: "2025-08-29",
    landAcquisitionDate: "2025-01-08",
    addressJibun: "서울특별시 강남구 삼성동 100",
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    ...init,
  } as AssetForm);

  return (
    <LandBuildingSplitSection
      selfOwns="both"
      acqStdPriceRequired
      isPhdBothEstimated={false}
      landAcqMode={asset.landAcqMode || "actual"}
      onLandAcqModeChange={() => {}}
      buildingAcqMode={asset.buildingAcqMode || "actual"}
      onBuildingAcqModeChange={() => {}}
      landAcquisitionPrice="" onLandAcquisitionPriceChange={() => {}}
      buildingAcquisitionPrice="" onBuildingAcquisitionPriceChange={() => {}}
      landSalesCaseValue="" onLandSalesCaseValueChange={() => {}}
      buildingSalesCaseValue="" onBuildingSalesCaseValueChange={() => {}}
      landDirectExpenses="" onLandDirectExpensesChange={() => {}}
      buildingDirectExpenses="" onBuildingDirectExpensesChange={() => {}}
      isSeparateAcq
      asset={asset}
      onAssetChange={(patch) => setAsset((a) => ({ ...a, ...patch }))}
      transferDate="2026-03-01"
    />
  );
}

const perSqm = () => screen.getByPlaceholderText("원/㎡") as HTMLInputElement;
const area = () => screen.getByTestId("split-land-std-acq-area") as HTMLInputElement;

describe("주택(housing) — 토지분 입력 노출", () => {
  it("🔴 취득시 토지 공시지가·면적 입력이 노출된다 (종전: 칸 자체가 없었다)", () => {
    render(<Harness init={{ assetKind: "housing" }} />);
    expect(perSqm()).toBeTruthy();
    expect(area()).toBeTruthy();
  });

  it("입력값이 자산에 기록된다 (엔진 calcAcqStdPair 소스)", () => {
    render(<Harness init={{ assetKind: "housing" }} />);
    fireEvent.change(perSqm(), { target: { value: "5000000" } });
    fireEvent.change(area(), { target: { value: "200" } });
    expect(perSqm().value).toBe("5,000,000");
    expect(area().value).toBe("200");
  });

  it("🔴 건물분 명시 입력은 노출하지 않는다 (라목 결합 공시 — 역산이 정본)", () => {
    render(<Harness init={{ assetKind: "housing" }} />);
    expect(
      screen.queryByTestId("split-building-std-acq"),
      "주택에 파트 독립 입력을 열면 개산공제 합계가 법정액(§163⑥2호가목)을 이탈한다",
    ).toBeNull();
  });

  it("건물분이 역산됨을 안내한다", () => {
    render(<Harness init={{ assetKind: "housing" }} />);
    expect(screen.getByTestId("split-housing-building-derived-note")).toBeTruthy();
  });
});

describe("일반 건물(building) — 회귀 0", () => {
  it("토지분·건물분 둘 다 종전대로 노출", () => {
    render(<Harness init={{ assetKind: "building" }} />);
    expect(perSqm()).toBeTruthy();
    expect(area()).toBeTruthy();
    expect(screen.getByTestId("split-building-std-acq")).toBeTruthy();
  });

  it("일반 건물에는 역산 안내를 띄우지 않는다 (나목 별도 공시)", () => {
    render(<Harness init={{ assetKind: "building" }} />);
    expect(screen.queryByTestId("split-housing-building-derived-note")).toBeNull();
  });
});

describe("게이트 — 별개취득이 아니면 미노출 (회귀 0)", () => {
  it("취득일이 같으면(겸용·소유자분리 경로) 축 B 블록 미노출", () => {
    render(<Harness init={{ assetKind: "housing" }} />);
    cleanup();
    // isSeparateAcq=false 재렌더
    render(
      <div>
        <LandBuildingSplitSection
          selfOwns="both"
          acqStdPriceRequired
          isPhdBothEstimated={false}
          landAcqMode="estimated" onLandAcqModeChange={() => {}}
          buildingAcqMode="estimated" onBuildingAcqModeChange={() => {}}
                  landAcquisitionPrice="" onLandAcquisitionPriceChange={() => {}}
          buildingAcquisitionPrice="" onBuildingAcquisitionPriceChange={() => {}}
          landSalesCaseValue="" onLandSalesCaseValueChange={() => {}}
          buildingSalesCaseValue="" onBuildingSalesCaseValueChange={() => {}}
                  landDirectExpenses="" onLandDirectExpensesChange={() => {}}
          buildingDirectExpenses="" onBuildingDirectExpensesChange={() => {}}
          isSeparateAcq={false}
          asset={{ ...makeDefaultAsset(1), assetKind: "housing" } as AssetForm}
          onAssetChange={() => {}}
        />
      </div>,
    );
    expect(screen.queryByTestId("split-land-std-acq-area")).toBeNull();
  });
});
