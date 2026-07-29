/**
 * anchor: MixedUseAreaInputs 파생 6칸 편집 (면적 단일 소스화).
 *
 * 설계: docs/02-design/features/mixed-use-area-single-source-editable.ui.design.md §5
 *
 * 검증 축:
 * - U3/U4  연면적 직접 입력 · 편집 시 전용/공통 클리어(§2-A2 "가")
 * - BADGE  자동/수동 배지 + ↻ 리셋
 * - F3     상가 정착면적 → 주택분 역산 write
 * - V2     부수토지 합계 불일치 경고 (amber · rose 아님)
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { MixedUseAreaInputs } from "@/components/calc/transfer/mixed-use/MixedUseAreaInputs";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

/** 주택:상가 = 60:40 연면적 120, 전체 토지 200, 건물 정착 100. */
function baseAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    isMixedUseHouse: true,
    residentialFloorArea: "72",
    nonResidentialFloorArea: "48",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    ...over,
  };
}

function setup(asset: AssetForm) {
  let patch: Partial<AssetForm> = {};
  const utils = render(<MixedUseAreaInputs asset={asset} onChange={(p) => (patch = p)} />);
  return { ...utils, getPatch: () => patch };
}

/** patch를 실제 asset에 반영하는 harness — 마법사 store 왕복(리렌더) 재현용. */
function StatefulAreaInputs({ initial }: { initial: AssetForm }) {
  const [asset, setAsset] = useState(initial);
  return (
    <MixedUseAreaInputs asset={asset} onChange={(p) => setAsset((a) => ({ ...a, ...p }))} />
  );
}

describe("[표시] 파생값이 편집칸의 값으로 나온다", () => {
  it("override 미설정 → 자동 안분값 표시 (주택 120 / 상가 잔액 80)", () => {
    const { getByTestId } = setup(baseAsset());
    expect((getByTestId("mixed-area-residential-land") as HTMLInputElement).value).toBe("120");
    expect((getByTestId("mixed-area-commercial-land") as HTMLInputElement).value).toBe("80");
    // 정착면적 100 × 0.6 = 60 / 잔액 40
    expect((getByTestId("mixed-area-residential-footprint") as HTMLInputElement).value).toBe("60");
    expect((getByTestId("mixed-area-commercial-footprint") as HTMLInputElement).value).toBe("40");
  });

  it("override 설정 → 원문 그대로 표시 + 상대편이 잔액 흡수", () => {
    const { getByTestId } = setup(baseAsset({ mixedResidentialLandAreaOverride: "90.29" }));
    expect((getByTestId("mixed-area-residential-land") as HTMLInputElement).value).toBe("90.29");
    expect((getByTestId("mixed-area-commercial-land") as HTMLInputElement).value).toBe("109.71");
  });

  it("면적 미입력 → 빈칸 (0 표시 금지)", () => {
    const { getByTestId } = setup(
      baseAsset({ residentialFloorArea: "", nonResidentialFloorArea: "", mixedUseTotalLandArea: "" }),
    );
    expect((getByTestId("mixed-area-residential-land") as HTMLInputElement).value).toBe("");
    expect((getByTestId("mixed-area-residential-footprint") as HTMLInputElement).value).toBe("");
  });
});

describe("[UI-U3/U4] 연면적 직접 편집 → 전용/공통 클리어", () => {
  it("연면적 write + 전용/공통 3필드 동시 클리어 (같은 patch)", () => {
    const { getByTestId, getPatch } = setup(
      baseAsset({
        residentialExclusiveArea: "60",
        commercialExclusiveArea: "40",
        commonArea: "20",
      }),
    );
    fireEvent.change(getByTestId("mixed-area-residential-floor"), { target: { value: "80" } });
    expect(getPatch()).toEqual({
      residentialFloorArea: "80",
      residentialExclusiveArea: "",
      commercialExclusiveArea: "",
      commonArea: "",
    });
  });

  it("상가 연면적도 동일", () => {
    const { getByTestId, getPatch } = setup(baseAsset({ commonArea: "20" }));
    fireEvent.change(getByTestId("mixed-area-commercial-floor"), { target: { value: "50" } });
    expect(getPatch().nonResidentialFloorArea).toBe("50");
    expect(getPatch().commonArea).toBe("");
  });
});

describe("[UI-BADGE] 자동/수동 + ↻ 리셋", () => {
  it("override 미설정 → '자동', 설정 → '수동' + ↻ 자동 버튼", () => {
    const auto = setup(baseAsset());
    expect(auto.queryAllByText("자동").length).toBeGreaterThan(0);
    expect(auto.queryByText("수동")).toBeNull();
    cleanup();

    const manual = setup(baseAsset({ mixedResidentialLandAreaOverride: "90.29" }));
    expect(manual.queryAllByText("수동").length).toBe(1);
    expect(manual.queryAllByText("↻ 자동").length).toBe(1);
  });

  it("↻ 자동 클릭 → override를 \"\"로 write (0이 아님 — three-state)", () => {
    const { queryAllByText, getPatch } = setup(
      baseAsset({ mixedResidentialLandAreaOverride: "90.29" }),
    );
    fireEvent.click(queryAllByText("↻ 자동")[0]);
    expect(getPatch()).toEqual({ mixedResidentialLandAreaOverride: "" });
  });

  it("연면적 2칸은 배지 대상이 아니다 (W1 — 되돌아갈 자동 상태가 없음)", () => {
    // 부수토지·정착 override를 모두 수동으로 두면 배지 '수동'은 정확히 4칸 중 3그룹.
    // 연면적에 배지가 달렸다면 '자동' 배지가 남는다.
    const { queryAllByText } = setup(
      baseAsset({
        mixedResidentialLandAreaOverride: "90.29",
        mixedCommercialLandAreaOverride: "109.71",
        mixedResidentialFootprintOverride: "60",
      }),
    );
    expect(queryAllByText("자동").length).toBe(0);
  });
});

describe("[UI-F3] 상가 정착면적 → 주택분 역산", () => {
  it("46.35 입력 → mixedResidentialFootprintOverride = \"53.65\"", () => {
    const { getByTestId, getPatch } = setup(baseAsset());
    fireEvent.change(getByTestId("mixed-area-commercial-footprint"), { target: { value: "46.35" } });
    expect(getPatch()).toEqual({ mixedResidentialFootprintOverride: "53.65" });
  });

  it("빈값 → override 클리어 (자동 복귀)", () => {
    const { getByTestId, getPatch } = setup(baseAsset({ mixedResidentialFootprintOverride: "60" }));
    fireEvent.change(getByTestId("mixed-area-commercial-footprint"), { target: { value: "" } });
    expect(getPatch()).toEqual({ mixedResidentialFootprintOverride: "" });
  });

  it("UI-F3-BOUND: 역산 손실 경계 — 입력을 round2로 확정한 뒤 역산한다", () => {
    // ⚠️ 46.354로는 판별 불가(vacuous) — `residualArea`가 내부에서 이미 round2하므로
    //    round2(100−46.354)=53.65 == 100−round2(46.354)=53.65 로 두 구현이 같은 값을 낸다.
    //    46.355는 갈라진다: 현행 round2(46.355)=46.36 → 53.64
    //                      / 입력 round2 누락 시 round2(100−46.355)=round2(53.645)=53.65
    const { getByTestId, getPatch } = setup(baseAsset());
    fireEvent.change(getByTestId("mixed-area-commercial-footprint"), { target: { value: "46.355" } });
    expect(getPatch().mixedResidentialFootprintOverride).toBe("53.64");
  });

  it("건물 정착면적 미입력 → 음수 override를 write하지 않는다", () => {
    // residualArea(0, 46) = −46 이 저장되면 DecimalInput이 "−"를 막아 되돌릴 수 없다.
    const { getByTestId, getPatch } = setup(baseAsset({ buildingFootprintArea: "" }));
    fireEvent.change(getByTestId("mixed-area-commercial-footprint"), { target: { value: "46" } });
    expect(getPatch().mixedResidentialFootprintOverride).toBeUndefined();
  });

  it("소수점 입력이 가능하다 — store 왕복 후에도 원문 보존", () => {
    // 역산 칸은 store 축이 주택이라, 표시까지 역산 결과에서 되돌리면 사용자가 친 "46."이
    // String(number)로 정규화(→"46")돼 **소수점을 칠 수 없다**. 로컬 원문 버퍼가 이를 막는다.
    // ⚠️ patch를 실제로 asset에 반영하는 stateful harness여야 왕복 정규화를 재현한다
    //    (기록만 하는 harness는 리렌더 값이 자동 안분값이라 이 결함을 놓친다).
    const { getByTestId } = render(<StatefulAreaInputs initial={baseAsset()} />);
    const cell = getByTestId("mixed-area-commercial-footprint") as HTMLInputElement;
    fireEvent.change(cell, { target: { value: "46." } });
    expect(cell.value).toBe("46.");
    // 한 글자 더 — 소수부가 실제로 이어서 입력된다
    fireEvent.change(cell, { target: { value: "46.3" } });
    expect(cell.value).toBe("46.3");
  });

  it("stale 버퍼 방어 — store가 다른 경로로 움직이면 버퍼를 버린다 (이력 불러오기 등)", () => {
    // 버퍼 무효화를 조작 지점마다의 명시 클리어에 맡기면 asset이 통째 교체되는 경로를 놓친다.
    // → 버퍼를 역산해 현재 store 값이 안 나오면 스스로 버려져야 한다.
    const { getByTestId, rerender } = render(
      <MixedUseAreaInputs asset={baseAsset()} onChange={() => {}} />,
    );
    fireEvent.change(getByTestId("mixed-area-commercial-footprint"), { target: { value: "46.3" } });
    // patch를 반영하지 않은 채 다른 asset으로 교체 → 버퍼가 store를 설명하지 못한다
    rerender(
      <MixedUseAreaInputs asset={baseAsset({ buildingFootprintArea: "200" })} onChange={() => {}} />,
    );
    // 자동 안분값(200 × 0.6 = 120 → 상가 잔액 80)이 나와야 한다 — stale "46.3" 아님
    expect((getByTestId("mixed-area-commercial-footprint") as HTMLInputElement).value).toBe("80");
  });

  it("역산이 store에 반영된다 — 상가 46.3 입력 후 주택칸이 53.7", () => {
    const { getByTestId } = render(<StatefulAreaInputs initial={baseAsset()} />);
    fireEvent.change(getByTestId("mixed-area-commercial-footprint"), { target: { value: "46.3" } });
    expect((getByTestId("mixed-area-residential-footprint") as HTMLInputElement).value).toBe("53.7");
  });
});

describe("[UI-V2] 부수토지 합계 불일치 경고", () => {
  it("두 칸 모두 수동 + 합 불일치(168.3 ≠ 200) → 경고", () => {
    const { getByTestId } = setup(
      baseAsset({
        mixedResidentialLandAreaOverride: "90.29",
        mixedCommercialLandAreaOverride: "78.01",
      }),
    );
    expect(getByTestId("mixed-area-land-sum-warning").textContent).toMatch(/168\.30.*200\.00/);
  });

  it("합 일치 → 경고 없음", () => {
    const { queryByTestId } = setup(
      baseAsset({
        mixedResidentialLandAreaOverride: "90.29",
        mixedCommercialLandAreaOverride: "109.71",
      }),
    );
    expect(queryByTestId("mixed-area-land-sum-warning")).toBeNull();
  });

  it("한 칸만 수동 → 상대편이 잔액 흡수하므로 경고 없음", () => {
    const { queryByTestId } = setup(baseAsset({ mixedResidentialLandAreaOverride: "90.29" }));
    expect(queryByTestId("mixed-area-land-sum-warning")).toBeNull();
  });

  it("UI-NO-ROSE: 경고 톤이 rose가 아니다 (배율 지역 소그룹과 2역 충돌 회피)", () => {
    const { getByTestId } = setup(
      baseAsset({
        mixedResidentialLandAreaOverride: "90.29",
        mixedCommercialLandAreaOverride: "78.01",
      }),
    );
    const cls = getByTestId("mixed-area-land-sum-warning").className;
    expect(cls).not.toMatch(/rose/);
    expect(cls).toMatch(/amber/);
  });
});

// 2026-07-15 배타 해제 — 종전에는 PHD ON 시 이 2칸을 disabled로 막았다.
// 명분은 "§164⑦ 법정 입력(preHousingDisclosure.landArea)이 담당"이었으나 그 필드는
// ⑫ Zod(phdForMixedUseSchema)가 strip해 **엔진에 도달한 적이 없다** → PHD ON이면
// 사용자가 부수토지를 어디서도 지정할 수 없고 자동 안분이 강제됐다.
// 부수토지 면적은 §164⑦이 정하는 값이 아니라 건축물대장·등기의 사실관계다.
describe("[PHD 무관] PHD ON에서도 부수토지 2칸 편집 가능", () => {
  it("★편집 가능 + override 값 표시 (엔진도 derived로 같은 값을 쓴다)", () => {
    const { getByTestId } = setup(
      baseAsset({
        usePreHousingDisclosure: true,
        mixedResidentialLandAreaOverride: "90.29",
      }),
    );
    const cell = getByTestId("mixed-area-residential-land") as HTMLInputElement;
    expect(cell.disabled).toBe(false);
    expect(cell.value).toBe("90.29"); // 자동 안분값(120)이 아니라 사용자 지정값
  });

  it("PHD ON + 상가 부수토지도 편집 가능 — 주택 override의 잔액 표시", () => {
    const { getByTestId } = setup(
      baseAsset({ usePreHousingDisclosure: true, mixedResidentialLandAreaOverride: "90.29" }),
    );
    const cell = getByTestId("mixed-area-commercial-land") as HTMLInputElement;
    expect(cell.disabled).toBe(false);
    expect(cell.value).toBe("109.71");
  });

  it("PHD ON에서도 자동/수동 배지·↻ 리셋 노출 (해소 경로 보장)", () => {
    const { queryAllByText } = setup(
      baseAsset({ usePreHousingDisclosure: true, mixedResidentialLandAreaOverride: "90.29" }),
    );
    expect(queryAllByText("수동").length).toBeGreaterThan(0);
    expect(queryAllByText("↻ 자동").length).toBeGreaterThan(0);
  });

  it("정착면적은 PHD 무관하게 편집 가능 (§168의12 배율 판정 축)", () => {
    const { getByTestId } = setup(baseAsset({ usePreHousingDisclosure: true }));
    expect((getByTestId("mixed-area-residential-footprint") as HTMLInputElement).disabled).toBe(
      false,
    );
  });
});
