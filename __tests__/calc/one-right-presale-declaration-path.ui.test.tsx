/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — L1-03 : §89①4호 가목의 「또는 분양권」을 **선언할 입력 경로**.
 *
 * 엔진 게이트(`householdHoldsPresaleRight`)만 열면 no-op이다. 가목이 요구하는 상태는
 * 「양도일 현재 다른 주택 없음」이고, 종전 화면은 **세대 주택 2채 이상**에서만
 * `PresaleRightsSection`을 렌더했다(`Step4.tsx` ④ 주택수·중과 판정) — 즉 가목 판정이 필요한
 * 바로 그 상태(0채·1채)에서 분양권을 알릴 수단이 없었다.
 *
 * ⚠️ 중복 렌더 금지 — 2채 이상에서는 ④가 같은 `form.presaleRights`를 이미 렌더한다.
 *    두 벌이 뜨면 사용자가 어느 쪽에 적어야 할지 알 수 없고, 같은 배열을 두 컴포넌트가
 *    각각 patch해 마지막 것이 이긴다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
}));

afterEach(cleanup);

/** 분양권 섹션의 고유 문구 — 컴포넌트 헤더 */
const PRESALE_SECTION = /분양권·입주권/;

function form(overrides: Partial<TransferFormData> = {}): TransferFormData {
  const base = createDefaultTransferFormData();
  return {
    ...base,
    assets: base.assets.map((a, i) =>
      i === 0 ? { ...a, assetKind: "right_to_move_in" as const } : a,
    ),
    isOneHousehold: true,
    householdHousingCount: "0",
    householdRightCount: "1",
    ...overrides,
  };
}

describe("L1-03 ⑤ — 입주권 양도 시 세대 보유 분양권 선언 경로", () => {
  it("주택 0채 — 분양권 입력 섹션이 렌더된다 (§89①4호 가목 판정에 필요)", () => {
    render(<Step4 form={form()} onChange={() => {}} />);
    expect(screen.queryAllByText(PRESALE_SECTION).length).toBeGreaterThan(0);
  });

  it("주택 1채 — 나목 판정에도 분양권 미보유 요건이 있으므로 함께 렌더된다", () => {
    render(<Step4 form={form({ householdHousingCount: "1" })} onChange={() => {}} />);
    expect(screen.queryAllByText(PRESALE_SECTION).length).toBeGreaterThan(0);
  });

  it("🔑 주택 2채 — ④가 이미 렌더하므로 중복되지 않는다 (정확히 1벌)", () => {
    render(<Step4 form={form({ householdHousingCount: "2" })} onChange={() => {}} />);
    expect(screen.queryAllByText(PRESALE_SECTION).length).toBe(1);
  });

  it("주택 계열이 아닌 자산(토지)에는 이 경로가 열리지 않는다", () => {
    render(
      <Step4
        form={form({
          assets: createDefaultTransferFormData().assets.map((a, i) =>
            i === 0 ? { ...a, assetKind: "land" as const } : a,
          ),
        })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryAllByText(PRESALE_SECTION).length).toBe(0);
  });
});
