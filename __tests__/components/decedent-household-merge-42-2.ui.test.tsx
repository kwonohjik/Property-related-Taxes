/**
 * @vitest-environment jsdom
 *
 * #42-2 합침 — ⑤ 위젯: 상속 정보의 「피상속인과 같은 세대였습니까」 한 칸(별도세대·동일세대·모름)이 §155②와 §71의2①에 함께 쓰인다.
 *
 * | # | 주장 |
 * |---|---|
 * | U-1 | 상속 행에 3택 라디오가 열리고 미답이면 아무것도 선택돼 있지 않다 · 질문은 하나(문구 한 번)이고 두 규정에 쓰임을 한 문장으로 밝힌다 |
 * | U-2 | 선택 → patch가 boolean·모름 표시·예외 칩을 모순 없이 쓴다 (별도세대=false · 동일세대=true · 모름=표시) |
 * | U-3 | 동거봉양·재상속 칩은 동일세대일 때만 보인다 |
 * | U-4 | 상속 OFF → 모름 표시까지 리셋 |
 * | U-5 | §71의2 블록: 상속 행은 증여자 세대 질문을 열지 않고 「상속 정보」 답을 안내한다 · 증여 행은 종전 질문 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import { HouseEntryPopDeclineBlock } from "@/components/calc/transfer/HouseEntryPopDeclineBlock";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

function makeHouse(overrides: Partial<HouseEntry> = {}): HouseEntry {
  return {
    id: "h1",
    region: "capital",
    acquisitionDate: "2018-01-01",
    officialPrice: "300000000",
    isInherited: true,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...overrides,
  };
}

const radio = (v: string) => screen.getByTestId(`house-row-decedent-household-${v}`) as HTMLInputElement;
const PARENTAL_CARE = /동거봉양 합가 \+ 합가 전 피상속인 보유 주택/;

describe("U 상속 정보 — 피상속인 세대 한 칸", () => {
  it("U-1 상속 행에 3택이 열리고 미답이면 아무것도 선택돼 있지 않다", () => {
    render(<HouseEntryEditor house={makeHouse()} onUpdate={() => {}} />);
    for (const v of ["separate", "same", "unknown"]) expect(radio(v).checked, v).toBe(false);
    // 질문 문구는 한 번 — 종전 토글 문구(「…동일세대」 스위치)가 남아 있지 않다
    expect(screen.queryAllByText(/상속개시 당시 피상속인과 같은 세대였습니까/)).toHaveLength(1);
    expect(screen.queryByRole("switch", { name: /상속개시 당시 피상속인과 동일세대/ })).toBeNull();
    // 두 규정에 같은 답이 쓰임을 한 문장으로 밝힌다
    const hint = screen.getByTestId("house-row-decedent-household-hint").textContent ?? "";
    expect(hint).toContain("§155②");
    expect(hint).toContain("§71의2①");
    expect(hint).toContain("모르거나 답하지 않으면");
  });

  it("U-1b 상속이 아닌 행에는 열리지 않는다", () => {
    render(<HouseEntryEditor house={makeHouse({ isInherited: false })} onUpdate={() => {}} />);
    expect(screen.queryByTestId("house-row-decedent-household-block")).toBeNull();
  });

  it("U-1c 저장된 값은 라디오에 그대로 나타난다 — true=동일세대 · false=별도세대 · 모름 표시=모름", () => {
    const cases: [Partial<HouseEntry>, string][] = [
      [{ decedentSameHouseholdAtInheritance: false }, "separate"],
      [{ decedentSameHouseholdAtInheritance: true }, "same"],
      [{ decedentHouseholdUnknown: true }, "unknown"],
    ];
    for (const [over, expected] of cases) {
      const { unmount } = render(<HouseEntryEditor house={makeHouse(over)} onUpdate={() => {}} />);
      for (const v of ["separate", "same", "unknown"]) expect(radio(v).checked, `${expected}/${v}`).toBe(v === expected);
      unmount();
    }
  });

  it("U-2 선택하면 boolean·모름 표시를 모순 없이 쓴다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryEditor house={makeHouse({ parentalCareMergeInheritedHouse: true })} onUpdate={onUpdate} />);
    fireEvent.click(radio("same"));
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ decedentSameHouseholdAtInheritance: true, decedentHouseholdUnknown: undefined, parentalCareMergeInheritedHouse: true }),
    );
    fireEvent.click(radio("separate"));
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ decedentSameHouseholdAtInheritance: false, decedentHouseholdUnknown: undefined, parentalCareMergeInheritedHouse: undefined }),
    );
    fireEvent.click(radio("unknown"));
    const p = onUpdate.mock.lastCall![0];
    expect(p).toMatchObject({ decedentSameHouseholdAtInheritance: undefined, decedentHouseholdUnknown: true, parentalCareMergeInheritedHouse: undefined });
    // 키가 patch에 존재해야 한다(병합 시 낡은 boolean이 남지 않는다)
    expect(Object.keys(p)).toContain("decedentSameHouseholdAtInheritance");
  });

  it("U-3 동거봉양·재상속 칩은 동일세대일 때만 보인다", () => {
    const { unmount } = render(<HouseEntryEditor house={makeHouse({ decedentSameHouseholdAtInheritance: true })} onUpdate={() => {}} />);
    expect(screen.queryAllByText(PARENTAL_CARE).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("house-row-reinherited-from-separate-household")).not.toBeNull();
    unmount();
    for (const over of [{ decedentSameHouseholdAtInheritance: false }, { decedentHouseholdUnknown: true }, {}]) {
      const r = render(<HouseEntryEditor house={makeHouse(over)} onUpdate={() => {}} />);
      expect(screen.queryByText(PARENTAL_CARE), JSON.stringify(over)).toBeNull();
      expect(screen.queryByTestId("house-row-reinherited-from-separate-household")).toBeNull();
      r.unmount();
    }
  });

  it("U-4 상속 OFF → 모름 표시까지 리셋", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryEditor house={makeHouse({ decedentHouseholdUnknown: true })} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole("switch", { name: /피상속인으로부터 상속받은 주택/ }));
    const patch = onUpdate.mock.calls[0][0];
    expect(patch.isInherited).toBe(false);
    expect(Object.keys(patch)).toContain("decedentHouseholdUnknown");
    expect(patch.decedentHouseholdUnknown).toBeUndefined();
    expect(patch.decedentSameHouseholdAtInheritance).toBeUndefined();
  });
});

describe("U-5 §71의2 블록 — 질문은 하나", () => {
  const donorBlock = () => screen.queryByTestId("house-row-pop-decline-donor-block");

  it("상속 행은 증여자 세대 질문을 열지 않고 상속 정보의 답을 안내한다", () => {
    for (const [over, label] of [
      [{ decedentSameHouseholdAtInheritance: false }, "별도세대"],
      [{ decedentSameHouseholdAtInheritance: true }, "동일세대"],
      [{ decedentHouseholdUnknown: true }, "모름·미답"],
      [{}, "모름·미답"],
    ] as const) {
      const { unmount } = render(<HouseEntryPopDeclineBlock house={makeHouse(over)} onUpdate={vi.fn()} />);
      expect(donorBlock()).toBeNull();
      const note = screen.getByTestId("house-row-pop-decline-decedent-note").textContent ?? "";
      expect(note).toContain(`현재 답: ${label}`);
      expect(note).toContain("상속 정보");
      unmount();
    }
  });

  it("증여로 받은 행은 종전 증여자 세대 질문을 그대로 묻는다 · 상속 안내는 없다", () => {
    const onUpdate = vi.fn();
    render(
      <HouseEntryPopDeclineBlock house={makeHouse({ isInherited: false, popDeclAcquiredByGift: "yes" })} onUpdate={onUpdate} />,
    );
    expect(donorBlock()?.textContent).toContain("증여자");
    expect(screen.queryByTestId("house-row-pop-decline-decedent-note")).toBeNull();
    fireEvent.click(screen.getByTestId("house-row-pop-decline-donor-same"));
    expect(onUpdate).toHaveBeenLastCalledWith({ popDeclDonorHousehold: "same" });
  });

  it("상속도 증여도 아닌 행은 둘 다 열리지 않는다", () => {
    render(<HouseEntryPopDeclineBlock house={makeHouse({ isInherited: false })} onUpdate={vi.fn()} />);
    expect(donorBlock()).toBeNull();
    expect(screen.queryByTestId("house-row-pop-decline-decedent-note")).toBeNull();
  });
});
