/**
 * @vitest-environment jsdom
 *
 * anchor: **일반건물 ⑦ 주택→상가 용도변경 — 시기 게이트가 화면에도 닿는다**
 *
 * 엔진(`resolveLTHDStartDate`)이 2012.1.1~2018.3.31 용도변경분을 「배제 자산일 수 없음」으로
 * 판정하는데(사전-2024-법규재산-0161) 화면이 여전히 「예(다주택) → 용도변경일 기산」이라 말하면
 * **표시와 세액이 갈린다**([[feedback_engine_result_display_drift]]).
 *
 * 이 anchor는 같은 leaf를 UI도 쓴다는 것을 고정한다:
 *   ① 가능기(2015 용도변경) → 「예」 선택지 **비활성** + 사유 표시
 *   ② 배제기(2020 용도변경) → 「예」 선택지 **활성**
 *   ③ 가능기에서 사용자가 이미 「예」를 골라둔 상태여도 미리보기 기산일은 **당초 취득일**
 *      (구형 sessionStorage에 true가 남아 있는 경우 — 값을 지우지 않고 판정으로 흡수한다)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { GeneralBuildingConversionSection } from "@/components/calc/transfer/GeneralBuildingConversionSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

function asset(conversionDate: string, wasMultiHouse: boolean | null): AssetForm {
  return {
    ...makeDefaultAsset(),
    assetKind: "general_building",
    acquisitionDate: "2005-01-01",
    gbHouseToCommercialConversion: true,
    gbConversionDate: conversionDate,
    gbWasMultiHouseAtConversion: wasMultiHouse,
  } as AssetForm;
}

/** 「예 (배제 자산)」 라디오의 input 엘리먼트 */
function yesRadio(container: HTMLElement): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(
    'input[name="gbWasMultiHouseAtConversion"][value="true"]',
  );
  if (!el) throw new Error("「예」 라디오를 찾지 못했다 — 셀렉터가 컴포넌트와 어긋났다");
  return el;
}

describe("GB ⑦ 용도변경 — §95② 배제 시기 게이트", () => {
  it("ERA-1 가능기(2015 용도변경) → 「예」 비활성 + 사유 표시", () => {
    const { container, getByText } = render(
      <GeneralBuildingConversionSection
        asset={asset("2015-06-01", null)}
        onChange={() => {}}
        transferDate="2024-02-01"
      />,
    );
    expect(yesRadio(container).disabled).toBe(true);
    expect(
      getByText(/그 시기 §95② 괄호는 다주택 주택을 배제하지 않았으므로/),
    ).toBeTruthy();
  });

  it("ERA-2 배제기(2020 용도변경) → 「예」 활성 (양성 대조군)", () => {
    // 이 단언이 없으면 「항상 비활성」 구현도 ERA-1을 통과한다.
    const { container } = render(
      <GeneralBuildingConversionSection
        asset={asset("2020-11-01", null)}
        onChange={() => {}}
        transferDate="2024-02-01"
      />,
    );
    expect(yesRadio(container).disabled).toBe(false);
  });

  it("ERA-3 경계 — 2018-03-31 비활성 / 2018-04-01 활성", () => {
    const a = render(
      <GeneralBuildingConversionSection
        asset={asset("2018-03-31", null)}
        onChange={() => {}}
        transferDate="2024-02-01"
      />,
    );
    expect(yesRadio(a.container).disabled).toBe(true);
    cleanup();
    const b = render(
      <GeneralBuildingConversionSection
        asset={asset("2018-04-01", null)}
        onChange={() => {}}
        transferDate="2024-02-01"
      />,
    );
    expect(yesRadio(b.container).disabled).toBe(false);
  });

  it("ERA-4 가능기 + 저장된 값이 true여도 미리보기 기산일은 당초 취득일", () => {
    // 구형 sessionStorage가 true를 들고 있어도 화면이 엔진과 같은 답을 내야 한다.
    const { getByText } = render(
      <GeneralBuildingConversionSection
        asset={asset("2015-06-01", true)}
        onChange={() => {}}
        transferDate="2024-02-01"
      />,
    );
    expect(getByText(/보유기간 기산일 = 당초 취득일 \(2005-01-01\)/)).toBeTruthy();
  });

  it("ERA-5 배제기 + true → 미리보기 기산일은 용도변경일 (양성 대조군)", () => {
    const { getByText } = render(
      <GeneralBuildingConversionSection
        asset={asset("2020-11-01", true)}
        onChange={() => {}}
        transferDate="2024-02-01"
      />,
    );
    expect(getByText(/보유기간 기산일 = 용도변경일 \(2020-11-01\)/)).toBeTruthy();
  });
});
