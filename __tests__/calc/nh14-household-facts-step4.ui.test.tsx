/**
 * @vitest-environment jsdom
 *
 * NH-14 ⑤ — 보유 상황 단계(Step4)의 «① 세대·주택 현황»이 첫 자산이 토지·건물이어도 함께 양도 주택이 있으면 열린다.
 * 계산 경로(④·⑧)는 `nh14-household-facts-companion.anchor.test.ts`.
 *
 * 열리는 것: ① 세대·주택 현황(1세대 여부 · 세대 보유 주택 수 · «다른 보유 주택이 없습니다» 확인) + 세대 보유 주택 목록(분양권·입주권 포함).
 * 열리지 않는 것: ② 1세대1주택 비과세 판정(취득일 조정대상지역·거주기간 — 첫 자산 주소·거주 입력에 묶여 있다).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { houseRow } from "./_helpers/redev-one-house-route";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
}));

afterEach(cleanup);

type Kind = "housing" | "land" | "general_building" | "redevelopment_apt";

/** 중과 한시배제 종료(2026-05-09) 이후 양도 — ④ 섹션이 열리는 축. 자산 종류만 바꾼다. */
function form(kinds: Kind[], overrides: Partial<TransferFormData> = {}): TransferFormData {
  const base = createDefaultTransferFormData();
  const proto = base.assets[0];
  return {
    ...base,
    transferDate: "2026-06-01",
    assets: kinds.map((assetKind, i) => ({ ...proto, assetId: `a${i + 1}`, assetKind, acquisitionDate: "2015-01-10" })),
    ...overrides,
  };
}

const SECTION = "① 세대·주택 현황";
const NO_OTHER_TOGGLE = "다른 보유 주택이 없습니다";
const NOTICE = "household-facts-companion-notice";

describe("NH-14 ⑤ — 세대·주택 현황 칸의 표시 조건", () => {
  it("🔑 첫 자산 토지 + 함께 양도 주택 → ① 세대·주택 현황 · «다른 보유 주택이 없습니다» 확인 · 고지 (종전: 칸 없음)", () => {
    render(<Step4 form={form(["land", "housing"])} onChange={() => {}} />);
    expect(screen.queryAllByText(SECTION)).toHaveLength(1);
    expect(screen.queryAllByText(NO_OTHER_TOGGLE)).toHaveLength(1);
    expect(screen.getByTestId(NOTICE)).toBeTruthy();
  });

  it("🔑 ⑧이 요구하는 두 확인 토글이 모두 화면에 있다 — 다른 보유 주택 없음 · 분양권·조합원입주권 없음 (막다른 길 방지: ⑧↔⑤ 같은 기준 자산)", () => {
    render(<Step4 form={form(["land", "housing"])} onChange={() => {}} />);
    expect(screen.queryAllByText(NO_OTHER_TOGGLE)).toHaveLength(1);
    expect(screen.queryAllByText("보유한 분양권·조합원입주권이 없습니다")).toHaveLength(1);
  });

  it("첫 자산 일반건물 + 함께 양도 재개발 완공주택 → 칸이 열린다", () => {
    render(<Step4 form={form(["general_building", "redevelopment_apt"])} onChange={() => {}} />);
    expect(screen.queryAllByText(SECTION)).toHaveLength(1);
    expect(screen.queryAllByText(NO_OTHER_TOGGLE)).toHaveLength(1);
  });

  it("짝 — 첫 자산 토지 + 함께 양도 토지 → 칸 숨김 유지", () => {
    render(<Step4 form={form(["land", "land"])} onChange={() => {}} />);
    expect(screen.queryAllByText(SECTION)).toHaveLength(0);
    expect(screen.queryAllByText(NO_OTHER_TOGGLE)).toHaveLength(0);
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });

  it("짝 — 첫 자산 토지 단건 → 칸 숨김 유지", () => {
    render(<Step4 form={form(["land"])} onChange={() => {}} />);
    expect(screen.queryAllByText(SECTION)).toHaveLength(0);
  });

  it("짝 — 첫 자산이 주택이면 종전과 같다(칸 1벌 · 함께 양도 고지 없음)", () => {
    render(<Step4 form={form(["housing", "land"])} onChange={() => {}} />);
    expect(screen.queryAllByText(SECTION)).toHaveLength(1);
    expect(screen.queryAllByText(NO_OTHER_TOGGLE)).toHaveLength(1);
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });

  it("② 1세대1주택 비과세 판정(거주기간 등)은 첫 자산 기준이라 열리지 않는다 — 첫 자산 거주 입력으로 함께 양도 주택을 판정하지 않는다", () => {
    render(<Step4 form={form(["land", "housing"])} onChange={() => {}} />);
    expect(screen.queryAllByText("② 1세대1주택 비과세 판정")).toHaveLength(0);
  });

  it("명부 행이 있으면 세대 보유 주택 수는 명부에서 도출(1 + 행 수) · «없음» 토글은 숨는다", () => {
    const f = form(["land", "housing"], {
      houses: [houseRow("o1", "2010-01-01")],
      householdHousingCount: "1",
    });
    render(<Step4 form={f} onChange={() => {}} />);
    expect(screen.getByTestId("household-house-count-derived").textContent).toContain("2채");
    expect(screen.queryAllByText(NO_OTHER_TOGGLE)).toHaveLength(0);
  });

  it("🔑 명부에 주택을 추가하면 같은 patch에 파생 주택 수와 «없음» 확인 해제가 실린다 — 기준 자산이 함께 양도 주택이라 첫 자산(토지) 종류로는 도출하지 않는다", () => {
    const onChange = vi.fn();
    const f = form(["land", "housing"], { houses: [houseRow("o1", "2010-01-01")], householdHousingCount: "2", householdNoOtherHousesConfirmed: true });
    render(<Step4 form={f} onChange={onChange} />);
    fireEvent.click(screen.getByText("+ 주택 추가"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ householdNoOtherHousesConfirmed: false, householdHousingCount: "2" }));
  });
});

describe("NH-14 후속 ⑤ — 세대 축 섹션은 함께 양도 주택을 「양도 주택」으로 읽는다 (계획서 nh14-companion-household-followups)", () => {
  it("🔴 첫 자산 토지 + 함께 양도 주택 + 명부 1행 → 양도 주택 취득 경위를 묻고, 답은 **주택 카드**에 저장된다 (종전: 토지 카드)", () => {
    const onChange = vi.fn();
    render(<Step4 form={form(["land", "housing"], { houses: [houseRow("o1", "2024-06-01")], householdHousingCount: "2" })} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("selling-house-origin-self_rebuild"));
    const patch = onChange.mock.calls.map((c) => c[0]).find((p: Partial<TransferFormData>) => p.assets) as Partial<TransferFormData>;
    expect(patch.assets?.map((a) => a.assetId)).toEqual(["a1", "a2"]);
    expect((patch.assets?.[1] as unknown as { sellingHouseRebuildKind?: string }).sellingHouseRebuildKind).toBe("self_rebuild");
    expect((patch.assets?.[0] as unknown as { sellingHouseRebuildKind?: string }).sellingHouseRebuildKind).toBeUndefined();
  });

  it("대조군 — 주택 먼저는 첫 카드에 저장된다(종전과 같다)", () => {
    const onChange = vi.fn();
    render(<Step4 form={form(["housing", "land"], { houses: [houseRow("o1", "2024-06-01")], householdHousingCount: "2" })} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("selling-house-origin-self_rebuild"));
    const patch = onChange.mock.calls.map((c) => c[0]).find((p: Partial<TransferFormData>) => p.assets) as Partial<TransferFormData>;
    expect((patch.assets?.[0] as unknown as { sellingHouseRebuildKind?: string }).sellingHouseRebuildKind).toBe("self_rebuild");
  });
});

