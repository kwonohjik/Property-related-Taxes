/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — U2-05 : **주택 양도 × 세대 주택 1채**에서 분양권·입주권 입력 경로.
 *
 * ## 무엇이 끊겨 있었나
 *
 * `PresaleRightsSection`의 유일한 렌더 지점은 `HousesListSection`이고, 그 `HousesListSection`은
 * ④ 주택수·중과 판정 안에서 `parseInt(form.householdHousingCount) >= 2` 게이트에만 있었다.
 * 그런데 `householdHousingCount`는 「세대 보유 **주택** 수」이고 분양권·입주권은 **명시적으로 별도
 * 집계**다(`house-count-divergence.ts:43` 「①은 "주택"만 센다」, 화면 문구 「(분양권·입주권은 별도 집계)」).
 *
 * ⇒ 「1세대가 1주택과 분양권(또는 조합원입주권) 1개를 보유」한 **정확히 §104⑦2호 사안**에서
 *    분양권을 입력할 화면이 없었다. 엔진은 `presaleRights`를 받으면 그 중과를 이미 판정하므로
 *    (2호 = `multi_house_2`, 4호 = `multi_house_3plus`) **입력 경로만 끊긴 no-op**이었다.
 *
 * ## 조문
 *
 * · 「소득세법」 §104⑦2호 — 조정대상지역 주택으로서 「1세대가 1주택과 조합원입주권 또는 분양권을
 *   1개 보유한 경우의 해당 주택」 → §55① 세율 + **20%p**.
 * · 같은 항 4호 — 「주택과 조합원입주권 또는 분양권을 보유한 경우로서 그 수의 합이 3 이상」 → **30%p**.
 *
 * 리뷰 실측(mock 세율 · 조정대상지역 · 9억/5억): 분양권 0개 121,726,000원 /
 * 1주택+분양권 1개 233,816,000원(+112,090,000) / 2개 277,541,000원(+155,815,000).
 *
 * ## ⚠️ 중복 렌더 금지
 *
 * 2채 이상에서는 ④의 `HousesListSection`이 같은 `form.presaleRights`를 이미 렌더한다.
 * 두 벌이 뜨면 같은 배열을 두 컴포넌트가 각각 patch해 마지막 것이 이긴다.
 * 입주권 양도(`right_to_move_in`) 경로는 L1-03이 이미 열어 두었으므로
 * (`one-right-presale-declaration-path.ui.test.tsx`) 그쪽과도 겹치지 않아야 한다.
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

/** 주택 양도 · 중과 한시배제 종료(2026-05-09) 이후 양도 — ④ 섹션이 열리는 축. */
function form(overrides: Partial<TransferFormData> = {}): TransferFormData {
  const base = createDefaultTransferFormData();
  return {
    ...base,
    transferDate: "2026-06-01",
    assets: base.assets.map((a, i) =>
      i === 0
        ? { ...a, assetKind: "housing" as const, acquisitionDate: "2015-01-10", isRegulatedAreaAtTransfer: true }
        : a,
    ),
    isOneHousehold: true,
    householdHousingCount: "1",
    ...overrides,
  };
}

describe("U2-05 ⑤ — 주택 양도 × 1주택 세대의 분양권 입력 경로", () => {
  it("U2-05-01: 세대 주택 1채 — 분양권 입력 섹션이 렌더된다 (§104⑦2호 판정에 필요)", () => {
    render(<Step4 form={form()} onChange={() => {}} />);
    // 종전: 0벌 — 「1주택 + 1분양권」을 알릴 화면 자체가 없었다.
    expect(screen.queryAllByText(PRESALE_SECTION).length).toBe(1);
  });

  it("U2-05-02: 🔑 세대 주택 2채 — ④ HousesListSection이 이미 렌더하므로 정확히 1벌", () => {
    render(<Step4 form={form({ householdHousingCount: "2" })} onChange={() => {}} />);
    expect(screen.queryAllByText(PRESALE_SECTION).length).toBe(1);
  });

  /**
   * 🔴 2026-08-26 정정(C1-01): 종전 단언은 **0벌**이었다 — 「중과 판정 자체가 없으므로 렌더하지
   *    않는다」. 그 전제가 뒤집혔다. 이 목록은 이제 중과(§104⑦) 전용 입력이 아니라
   *    「소득세법」 §89②(1세대가 주택과 조합원입주권·분양권을 보유하다가 그 주택을 양도 →
   *    §89①3호 배제)의 **비과세 판정 입력**이기도 하다. 중과 한시배제는 §89②과 무관하므로
   *    그 기간에도 선언 경로가 있어야 한다 ⇒ 렌더 위치를 ② 비과세 판정으로 옮겼다.
   *    (`article-89-2-declaration-path.ui.test.tsx`가 그 이동을 별도로 고정한다.)
   */
  it("U2-05-03: 중과 한시배제 기간 양도에도 렌더된다 — §89②은 중과가 아니라 비과세 규칙", () => {
    render(
      <Step4
        form={form({ transferDate: "2025-06-01" })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryAllByText(PRESALE_SECTION).length).toBe(1);
  });

  it("U2-05-04: 토지 양도에는 이 경로가 열리지 않는다", () => {
    const base = createDefaultTransferFormData();
    render(
      <Step4
        form={form({
          assets: base.assets.map((a, i) => (i === 0 ? { ...a, assetKind: "land" as const } : a)),
        })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryAllByText(PRESALE_SECTION).length).toBe(0);
  });
});
