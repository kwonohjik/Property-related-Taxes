/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — §89② 3년 초과 예외의 **선언 경로** (C1-01 Phase 2)
 *
 * 엔진 술어만 만들면 no-op이다(memory `feedback_api_trigger_without_input_path_is_noop`).
 * 이 카드가 없으면 3년 초과 세대는 영원히 `undetermined`에 머문다.
 *
 * ## 🔑 「3년 초과」 판정은 엔진 술어를 그대로 쓴다
 *
 * `isRightThreeYearExceeded`를 화면이 **직접 호출**한다. 화면이 자체 계산하면
 * 「화면엔 칸이 없는데 엔진은 요구하는」(또는 그 반대) 어긋남이 생긴다.
 *
 * ## ⚠️ 「선택 안 함」과 「해당 없음」은 다르다
 *
 * 🔴 2026-08-27 정정(R-3) — 갈래가 셋이 되어 문구가 「어느 것에도 해당하지 않는다」로 바뀌었다.
 *    ④2호가 **전단(완성 전)·후단(완성 후 3년 이내)** 으로 갈리기 때문이다.
 *
 * 미선택은 판정 불가로 남는다. 배제가 확정되려면 「어느 것에도 해당하지 않는다」를 **명시 선택**해야
 * 한다 — 그 선택지가 화면에 실제로 있는지 여기서 고정한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
}));

afterEach(cleanup);

const CARD_TITLE = /권리 취득 후 3년이 지나 양도/;

/** 주택 1채 양도 + 세대 보유 입주권 1개. 권리 취득일과 양도일로 3년 초과 여부를 만든다. */
function form(rightAcquisitionDate: string, over: Partial<TransferFormData> = {}): TransferFormData {
  const base = createDefaultTransferFormData();
  return {
    ...base,
    assets: base.assets.map((a, i) =>
      i === 0 ? { ...a, assetKind: "housing" as const, acquisitionDate: "2015-06-01" } : a,
    ),
    transferDate: "2024-06-01",
    isOneHousehold: true,
    householdHousingCount: "1",
    presaleRights: [
      {
        id: "r1",
        type: "redevelopment_right" as const,
        acquisitionDate: rightAcquisitionDate,
        region: "capital" as const,
      },
    ],
    ...over,
  };
}

const shows = (re: RegExp | string) => screen.queryAllByText(re).length > 0;

describe("§89② 3년 초과 예외 ⑤ — 카드 가시성", () => {
  it("★ 3년을 넘겨 양도 → 카드가 열린다", () => {
    // 권리 2016-10-01 + 3년 = 2019-10-01 < 양도 2024-06-01
    render(<Step4 form={form("2016-10-01")} onChange={() => {}} />);
    expect(shows(CARD_TITLE)).toBe(true);
  });

  it("🔑 3년 이내 양도 → 열리지 않는다 (§156의2③이 먼저 충족하므로 물을 필요가 없다)", () => {
    // 권리 2022-01-01 + 3년 = 2025-01-01 > 양도 2024-06-01
    render(<Step4 form={form("2022-01-01")} onChange={() => {}} />);
    expect(shows(CARD_TITLE)).toBe(false);
  });

  it("경계: 권리 취득일 + 3년 **당일** 양도는 「3년 이내」라 열리지 않는다", () => {
    render(<Step4 form={form("2021-06-01")} onChange={() => {}} />);
    expect(shows(CARD_TITLE)).toBe(false);
  });

  it("세대 보유 권리가 없으면 열리지 않는다", () => {
    render(<Step4 form={form("2016-10-01", { presaleRights: [] })} onChange={() => {}} />);
    expect(shows(CARD_TITLE)).toBe(false);
  });

  it("권리 취득일이 비어 있으면(입력 중) 열리지 않는다", () => {
    render(<Step4 form={form("")} onChange={() => {}} />);
    expect(shows(CARD_TITLE)).toBe(false);
  });
});

describe("§89② 3년 초과 예외 ⑤ — 선택지", () => {
  describe("R-3 — ④2호 전단(완성 전 양도)", () => {
    it("★ 「완성되기 전」을 고르면 **완성일 칸이 사라진다**", () => {
      render(
        <Step4
          form={{ ...form("2016-10-01"), rightThreeYearExceptionKind: "before_completion" }}
          onChange={() => {}}
        />,
      );
      expect(shows(/신축주택 완성일/)).toBe(false);
      // 1호는 장래 요건이라 여전히 묻는다.
      expect(shows(/완성 후 3년 이내에 세대전원이 이사할 예정이다/)).toBe(true);
      expect(shows(/그 주택에 1년 이상 계속하여 거주할 예정이다/)).toBe(true);
    });

    it("🔑 「완성된 뒤」 갈래는 완성일을 그대로 요구한다", () => {
      render(
        <Step4
          form={{ ...form("2016-10-01"), rightThreeYearExceptionKind: "new_house" }}
          onChange={() => {}}
        />,
      );
      expect(shows(/신축주택 완성일/)).toBe(true);
      // 완료된 사실이므로 문구가 과거형이다.
      expect(shows(/완성 후 3년 이내에 세대전원이 이사했다/)).toBe(true);
      expect(shows(/완성 후 3년 이내에 세대전원이 이사할 예정이다/)).toBe(false);
    });
  });

  it("★ **네** 갈래가 모두 있다 — 「해당 없음」이 없으면 배제를 확정할 수 없다", () => {
    // 🔴 2026-08-27(R-3): ④2호가 전단·후단으로 갈려 신축주택 갈래가 둘이 됐다.
    render(<Step4 form={form("2016-10-01")} onChange={() => {}} />);
    expect(shows(/신축주택이 완성된 뒤 양도했다/)).toBe(true);
    expect(shows(/신축주택이 완성되기 전에 양도했다/)).toBe(true);
    expect(shows(/경매·공매 등으로 3년 내 양도하지 못했다/)).toBe(true);
    expect(shows(/어느 것에도 해당하지 않는다/)).toBe(true);
  });

  it("미선택 시 「종전대로 계산」 안내가 뜬다 — 침묵하지 않는다", () => {
    render(<Step4 form={form("2016-10-01")} onChange={() => {}} />);
    expect(shows(/종전대로 계산/)).toBe(true);
  });

  it("new_house 선택 → 완성일·이사·거주 입력이 나타난다", () => {
    render(
      <Step4
        form={form("2016-10-01", { rightThreeYearExceptionKind: "new_house" })}
        onChange={() => {}}
      />,
    );
    expect(shows(/신축주택 완성일/)).toBe(true);
    expect(shows(/완성 후 3년 이내에 세대전원이 이사했다/)).toBe(true);
    expect(shows(/1년 이상 계속하여 거주했다/)).toBe(true);
  });

  it("🔑 delay 선택 → §75①의 **둘째 요건**(그 방법으로 양도)까지 묻는다", () => {
    render(
      <Step4
        form={form("2016-10-01", { rightThreeYearExceptionKind: "delay" })}
        onChange={() => {}}
      />,
    );
    expect(shows(/한국자산관리공사 매각 의뢰/)).toBe(true);
    expect(shows(/법원 경매 신청/)).toBe(true);
    expect(shows(/공매 진행 중/)).toBe(true);
    expect(shows(/그 방법에 따라 양도되었다/)).toBe(true);
  });

  it("🔑 §155⑱의 4·5호(현금청산 소송·수용재결)는 선택지에 **없다**", () => {
    render(
      <Step4
        form={form("2016-10-01", { rightThreeYearExceptionKind: "delay" })}
        onChange={() => {}}
      />,
    );
    expect(shows(/현금청산/)).toBe(false);
    expect(shows(/수용재결/)).toBe(false);
  });
});
