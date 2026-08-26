/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — §89② 판정에 필요한 **주택 양도 화면**의 권리 선언 경로 (C1-01 · Phase 1)
 *
 * 「소득세법」 §89②은 「1세대가 주택과 조합원입주권 또는 분양권을 보유하다가 **그 주택을 양도**하는
 * 경우」를 다룬다 — 즉 판정이 필요한 화면은 **주택 양도**다. 엔진 술어만 만들면 no-op이고
 * (memory `feedback_api_trigger_without_input_path_is_noop`), 반대로 화면만 열면 세액이 안 움직인다.
 *
 * ## 🔑 종전 렌더 위치가 **중과 트랙 안**이었다
 *
 * 목록은 ④ 「주택수·중과 판정」 섹션 안에 있었는데, 그 섹션은 다주택 중과 **한시배제 기간**
 * (2022-05-10~2026-05-09 + 보유 2년 이상)에는 통째로 안내 카드로 대체된다. §89②은 중과가 아니라
 * **비과세** 규칙이라 그 기간에도 선언 경로가 있어야 한다 ⇒ ② 「1세대1주택 비과세 판정」으로 옮겼다.
 *
 * ⚠️ 중복 렌더 금지 — 2채 이상에서는 ④의 `HousesListSection`이 같은 `form.presaleRights`를
 *    렌더한다. 두 벌이 뜨면 같은 배열을 두 컴포넌트가 각각 patch해 마지막 것이 이긴다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
}));

afterEach(cleanup);

const PRESALE_SECTION = /분양권·입주권/;
const SUSPENDED_NOTICE = "surcharge-suspended-notice";

/** 주택 1채 양도 — §89② 판정이 필요한 바로 그 상태. */
function form(overrides: Partial<TransferFormData> = {}): TransferFormData {
  const base = createDefaultTransferFormData();
  return {
    ...base,
    assets: base.assets.map((a, i) =>
      i === 0
        ? { ...a, assetKind: "housing" as const, acquisitionDate: "2015-06-01" }
        : a,
    ),
    transferDate: "2026-06-01", // 한시배제 창(2026-05-09) 밖
    isOneHousehold: true,
    householdHousingCount: "1",
    ...overrides,
  };
}

function presaleSectionCount(): number {
  return screen.queryAllByText(PRESALE_SECTION).length;
}

describe("§89② ⑤ — 주택 양도 화면의 권리 선언 경로", () => {
  it("주택 1채 → 분양권·입주권 목록이 렌더된다", () => {
    render(<Step4 form={form()} onChange={() => {}} />);
    expect(presaleSectionCount()).toBe(1);
  });

  it("★ 중과 한시배제 기간에도 렌더된다 — §89②은 중과가 아니라 비과세 규칙이다", () => {
    render(<Step4 form={form({ transferDate: "2024-06-01" })} onChange={() => {}} />);
    // 전제 확인: 그 기간이라 ④ 중과 섹션은 실제로 안내 카드로 대체돼 있다
    expect(screen.queryByTestId(SUSPENDED_NOTICE)).not.toBeNull();
    expect(presaleSectionCount()).toBe(1);
  });

  it("🔑 주택 2채 → ④가 이미 렌더하므로 정확히 1벌만 뜬다", () => {
    render(<Step4 form={form({ householdHousingCount: "2" })} onChange={() => {}} />);
    expect(presaleSectionCount()).toBe(1);
  });

  it("상속받은 권리 선언 칩이 목록 안에 있다 (§156의2⑥·§156의3④ 판정 불가 신호)", () => {
    const base = form();
    render(
      <Step4
        form={{
          ...base,
          presaleRights: [
            {
              id: "r1",
              type: "redevelopment_right",
              acquisitionDate: "2016-10-01",
              region: "capital",
            },
          ],
        }}
        onChange={() => {}}
      />,
    );
    expect(screen.queryAllByText("상속받은 권리").length).toBeGreaterThan(0);
  });
});
