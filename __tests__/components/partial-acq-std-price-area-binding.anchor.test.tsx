/**
 * anchor: **§9-7 — ⑤ 취득시 기준시가 위젯이 곱하는 면적 (JSX 바인딩 자체)**
 *
 * 자매 anchor `__tests__/lib/calc/partial-acq-std-price-ui-binding.anchor.test.ts`는
 * **술어와 산술**을 고정한다. 그런데 정작 결함이던 것은
 * `area={props.acquisitionArea}` **바인딩 한 줄**이었고, 그 줄을 되돌려도
 * 자매 anchor는 전부 통과한다 — 이 파일이 그 구멍을 막는다.
 *
 * ⇒ 여기서는 **렌더된 DOM**을 본다: 일부양도일 때 취득시 면적 칸이
 *   ① `transferArea` 값을 보여주고 ② 라벨이 「양도분 면적 (㎡)」이며
 *   ③ 편집이 `onTransferAreaChange`로 간다.
 *
 * 근거·세액 영향은 자매 anchor 헤더 참조(총세액 27,827,432 → 79,199,706).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const ACQ_AREA = "200";
const TRANSFER_AREA = "100";

function renderBlock(
  areaScenario: AssetForm["areaScenario"],
  over: Record<string, unknown> = {},
) {
  const onAcquisitionAreaChange = vi.fn();
  const onTransferAreaChange = vi.fn();
  const asset: AssetForm = {
    ...makeDefaultAsset(),
    assetKind: "land",
    areaScenario,
    acquisitionArea: ACQ_AREA,
    transferArea: TRANSFER_AREA,
    useEstimatedAcquisition: true,
  };
  render(
    <CompanionAcqPurchaseBlock
      acquisitionDate="2010-06-01"
      onAcquisitionDateChange={vi.fn()}
      useEstimatedAcquisition
      onUseEstimatedChange={vi.fn()}
      fixedAcquisitionPrice=""
      onFixedAcquisitionPriceChange={vi.fn()}
      standardPriceAtAcq=""
      onStandardPriceAtAcqChange={vi.fn()}
      standardPriceAtTransfer=""
      onStandardPriceAtTransferChange={vi.fn()}
      assetKind="land"
      acquisitionArea={ACQ_AREA}
      onAcquisitionAreaChange={onAcquisitionAreaChange}
      transferArea={TRANSFER_AREA}
      onTransferAreaChange={onTransferAreaChange}
      transferDate="2024-06-01"
      asset={asset}
      {...over}
    />,
  );
  return { onAcquisitionAreaChange, onTransferAreaChange };
}

/**
 * **취득시** 기준시가 영역의 면적 input.
 *
 * ⚠️ `screen.getByText("면적 (㎡)")`로 잡으면 안 된다 — `same` 모드에서는 취득시·양도시
 *    위젯이 **둘 다** 같은 라벨을 렌더해 strict mode 위반이 난다(실측).
 *    「취득시 기준시가」 섹션으로 먼저 범위를 좁힌다.
 */
function acqSection(): HTMLElement {
  const heading = screen.getByText(/취득시 기준시가/);
  const section = heading.closest("div");
  if (!section) throw new Error("취득시 기준시가 섹션을 찾지 못했다");
  return section as HTMLElement;
}

function areaInput(label: string): HTMLInputElement {
  const labelEl = within(acqSection()).getByText(label);
  const input = labelEl.parentElement?.querySelector("input");
  if (!input) throw new Error(`면적 input을 찾지 못했다: ${label}`);
  return input as HTMLInputElement;
}

describe("[§9-7] ⑤ 취득시 기준시가 — 일부양도에서는 양도분 면적을 곱한다", () => {
  it("S97-UI-1: partial → 라벨이 「양도분 면적 (㎡)」이고 값이 transferArea다", () => {
    renderBlock("partial");
    const input = areaInput("양도분 면적 (㎡)");
    expect(input.value).toBe(TRANSFER_AREA);
    // 🔴 되돌리면 여기가 "200"이 된다 — 그게 51,372,274원 과소과세의 입구였다.
    expect(input.value).not.toBe(ACQ_AREA);
  });

  it("S97-UI-2: partial → 면적 편집이 transferArea로 간다 (acquisitionArea 오염 금지)", () => {
    const { onAcquisitionAreaChange, onTransferAreaChange } = renderBlock("partial");
    fireEvent.change(areaInput("양도분 면적 (㎡)"), { target: { value: "120" } });
    expect(onTransferAreaChange).toHaveBeenCalledWith("120");
    expect(onAcquisitionAreaChange).not.toHaveBeenCalled();
  });

  it("S97-UI-3(대조군): same → 전체 취득면적을 그대로 쓴다", () => {
    const { onAcquisitionAreaChange, onTransferAreaChange } = renderBlock("same");
    // partial 전용 라벨은 뜨지 않는다
    expect(within(acqSection()).queryByText("양도분 면적 (㎡)")).toBeNull();

    const input = areaInput("면적 (㎡)");
    expect(input.value).toBe(ACQ_AREA);

    fireEvent.change(input, { target: { value: "250" } });
    expect(onAcquisitionAreaChange).toHaveBeenCalledWith("250");
    expect(onTransferAreaChange).not.toHaveBeenCalled();
  });
});
