/**
 * anchor: 축 A 부속 — 감정평가가액 basis · §166⑧ 예외 **입력 위젯** (Phase 1-E · ⑤)
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §12.3 · §12.6
 *
 * ## 이 파일이 지키는 것
 *
 * 배관(E-2)이 값을 나르는 것은 확인했다. 여기서는 **사용자가 그 값을 넣을 칸이 실제로 화면에
 * 있는가**를 잡는다 — validate가 요구하는데 칸이 없으면 dead-end가 된다
 * (메모리 `feedback_ui_gate_removes_sole_input_path`).
 *
 * ## 노출 규칙 — **2026-08-08 계약 변경 (3-way 통합)**
 *
 * 종전에는 라디오(일괄/구분) 밖에 「감정평가가액으로 안분」 **토글**이 따로 있어, 「일괄양도
 * (양도시 **기준시가 안분**)」을 고른 채 토글을 켜면 실제로는 감정평가액으로 안분되는
 * **라벨-동작 모순**이 있었다(부가령 §64① 서열). 감정평가는 안분 방식의 한 선택지이므로
 * 라디오로 흡수했다 — 일반건물 경로와 같은 구조다.
 *
 * | 입력 | 기준시가 안분 | 감정평가 | 구분양도 |
 * |---|---|---|---|
 * | 감정평가가액 | **숨는다** — 라벨과 동작이 일치한다 | **보인다** (안분 basis) | 보인다 (30% 비교 대상) |
 * | §166⑧ 예외 | 숨는다 — 판정 자체가 돌지 않는다 | 숨는다 | 보인다 |
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LandBuildingSaleSplitSection } from "@/components/calc/transfer/LandBuildingSaleSplitSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { saleStdPlacement } from "@/lib/calc/transfer-tax-split-acq-mode";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

/**
 * ⚠️ `ToggleCard`는 `data-testid`를 DOM으로 흘리지 않는다 — testid는 **감싸는 div**에 있다.
 *    그리고 그 Switch는 Base UI `Switch.Root`라 **`role`을 노출하지 않는다** — `aria-label`
 *    (= ToggleCard의 `title`)만 있으므로 `getByRole("switch")`는 잡지 못한다
 *    (선례: `redev-exemption-toggle-tri-state.anchor.test.tsx:54`).
 */
const clickToggle = (name: string) => fireEvent.click(screen.getByLabelText(name));
const COMPARE_TOGGLE = "30% 판정 비교 기준으로 감정평가가액 사용";
const EXEMPTION_TOGGLE = "구분 기재 가액을 그대로 인정받는 예외";

/**
 * 컴포넌트가 **요청한 patch**를 그대로 본다. 렌더 중 외부 변수에 스냅샷을 담으면 react-hooks
 * 규칙 위반이고(부수효과), patch를 보는 쪽이 「무엇을 바꾸라고 했는가」를 더 정확히 잡는다.
 */
let lastPatch: Partial<AssetForm> = {};

function Harness({ init }: { init?: Partial<AssetForm> }) {
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    hasSeperateLandAcquisitionDate: true,
    saleSplitMode: "apportioned",
    ...init,
  } as AssetForm);

  // 실제 호출부 3곳 모두 두 콜백에 **같은 `onChange`**를 넘긴다 — 그대로 재현한다.
  const apply = (patch: Partial<AssetForm>) => {
    lastPatch = patch;
    setAsset((a) => ({ ...a, ...patch }));
  };

  return (
    <LandBuildingSaleSplitSection
      saleSplitMode={asset.saleSplitMode ?? "apportioned"}
      onSaleSplitModeChange={apply}
      landTransferPrice="" onLandTransferPriceChange={() => {}}
      buildingTransferPrice="" onBuildingTransferPriceChange={() => {}}
      showStdCard={saleStdPlacement().saleAxis}
      asset={asset}
      onAssetChange={apply}
      transferDate="2024-06-01"
    />
  );
}

describe("⑤-1 — 감정평가는 안분 방식의 한 선택지다 (3-way)", () => {
  it("🔴 기준시가 안분에서는 감정평가 칸이 없다 — 라벨과 동작이 일치한다", () => {
    render(<Harness />);
    expect(screen.queryByTestId("sale-appraisal-basis")).toBeNull();
    expect(screen.queryByTestId("sale-compare-basis-toggle")).toBeNull();
  });

  it("「감정평가」를 고르면 3필드가 바로 열린다 — 여기서는 basis 자체다", () => {
    render(<Harness init={{ saleSplitMode: "appraisal" }} />);
    expect(screen.getByTestId("sale-appraisal-land")).toBeTruthy();
    expect(screen.getByTestId("sale-appraisal-building")).toBeTruthy();
    expect(screen.getByTestId("sale-appraisal-date")).toBeTruthy();
  });

  it("구분양도에서는 30% 비교 기준 토글로 입력한다 (§100③)", () => {
    render(<Harness init={{ saleSplitMode: "actual" }} />);
    expect(screen.getByTestId("sale-compare-basis-toggle")).toBeTruthy();
  });

  it("🔴 비교 기준 토글을 끄면 3필드를 함께 비운다 — 화면에 없는 값이 전송되면 안 된다", () => {
    render(
      <Harness
        init={{
          saleSplitMode: "actual",
          landAppraisalAtTransfer: "1,200,000,000",
          appraisalDateAtTransfer: "2023-06-01",
        }}
      />,
    );
    // 값이 있으면 열린 채로 시작한다(세션 복원)
    expect(screen.getByTestId("sale-appraisal-land")).toBeTruthy();
    clickToggle(COMPARE_TOGGLE);
    expect(lastPatch.landAppraisalAtTransfer).toBe("");
    expect(lastPatch.appraisalDateAtTransfer).toBe("");
  });

  /**
   * 🔴 **유효 창 안내는 폐지됐다**(Q-9 — 계획서 §21). 엔진이 시기 요건을 판정하지 않으므로
   *    화면이 기간을 계산해 보여줄 근거도 없다. 대신 **요건이 존재한다는 사실과 미검증임**을
   *    알려 사용자가 스스로 확인하게 한다.
   */
  it("시기 요건을 검증하지 않는다는 사실을 알린다 — 침묵하지 않는다", () => {
    render(<Harness init={{ saleSplitMode: "appraisal" }} />);
    expect(screen.getByText(/검증하지 않으므로/)).toBeTruthy();
  });

  it("감정일자는 선택 입력임을 라벨에 밝힌다", () => {
    render(<Harness init={{ saleSplitMode: "appraisal" }} />);
    expect(screen.getByText(/안분 계산에는 쓰지 않습니다/)).toBeTruthy();
  });

  it("모드를 바꾸면 쓰지 않는 값을 함께 비운다 — 두 경로가 같은 규칙을 쓴다", () => {
    render(<Harness init={{ saleSplitMode: "appraisal", landAppraisalAtTransfer: "1,200,000,000" }} />);
    fireEvent.click(screen.getByText(/기준시가 안분/));
    expect(lastPatch).toMatchObject({
      saleSplitMode: "apportioned",
      landAppraisalAtTransfer: "",
      buildingAppraisalAtTransfer: "",
    });
  });
});

describe("⑤-2 — §166⑧ 예외는 구분양도 전용이다", () => {
  it("일괄양도에서는 숨는다 — 30% 판정 자체가 돌지 않는다", () => {
    render(<Harness />);
    expect(screen.queryByTestId("sale-split-exemption-toggle")).toBeNull();
  });

  it("구분양도에서 보인다", () => {
    render(<Harness init={{ saleSplitMode: "actual" }} />);
    expect(screen.getByTestId("sale-split-exemption-toggle")).toBeTruthy();
  });

  it("켜면 1호가 기본 선택된다 — 「켰는데 미선택」 중간 상태를 만들지 않는다", () => {
    render(<Harness init={{ saleSplitMode: "actual" }} />);
    clickToggle(EXEMPTION_TOGGLE);
    expect(lastPatch.saleSplitExemption).toBe("other_law");
  });

  it("끄면 사유와 근거를 함께 비운다", () => {
    render(
      <Harness init={{ saleSplitMode: "actual", saleSplitExemption: "other_law", saleSplitExemptionNote: "근거" }} />,
    );
    clickToggle(EXEMPTION_TOGGLE);
    expect(lastPatch.saleSplitExemption).toBe("");
    expect(lastPatch.saleSplitExemptionNote).toBe("");
  });

  it("근거 칸이 있다 — validate가 필수로 요구하므로 없으면 dead-end다", () => {
    render(<Harness init={{ saleSplitMode: "actual", saleSplitExemption: "other_law" }} />);
    const note = screen.getByTestId("sale-split-exemption-note");
    fireEvent.change(note, { target: { value: "철거 예정 확인서" } });
    expect(lastPatch.saleSplitExemptionNote).toBe("철거 예정 확인서");
  });

  it("2호(철거)를 고르면 건물 양도가액이 0에 가까운 것이 정상이라고 안내한다", () => {
    render(<Harness init={{ saleSplitMode: "actual", saleSplitExemption: "demolished_land_only" }} />);
    expect(screen.getByText(/0에 가까운 것이 정상/)).toBeTruthy();
  });
});
