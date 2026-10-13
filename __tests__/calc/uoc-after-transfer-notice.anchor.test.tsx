/**
 * §155⑧ 행 — 양도일 당일·뒤 취득 행의 「반영 안 됨」 안내 (PR #2170 후속 · 사용자 결정 2026-10-13).
 *
 * #2170으로 ⑧ 중복 차단은 양도일 현재 보유 행(`housesOwnedAtTransfer`)만 센다. 그 결과 양도일 뒤 취득 행에 ⑧ 표시를 켜도
 * 막히지 않지만 세대 판정·④ 엔진 명부 어디에도 실리지 않는다 — 그 행 ⑤ 카드가 사실을 밝힌다.
 * 안내는 저장하지 않고 취득일·양도일에서 도출하며(`uocRowAcquiredAfterTransfer`), 보유 판정과 같은 leaf(`isOwnedAtTransfer`)를 쓴다.
 *
 * 격자: 토글 ON/OFF × 취득일 전/당일/후 × 양도일 유/무 (+ 취득일 없음).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HouseEntryUnavoidableOutsideCapitalBlock } from "@/components/calc/transfer/HouseEntryUnavoidableOutsideCapitalBlock";
import { HousesListSection } from "@/app/calc/transfer-tax/steps/step4-sections/HousesListSection";
import { uocRowAcquiredAfterTransfer } from "@/lib/calc/house-row-required-issues";
import { housesOwnedAtTransfer } from "@/lib/calc/household-house-count";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { hrow } from "./_owned-at-transfer-pr1a-helpers";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const TD = "2026-09-18";
const NOTICE = "house-row-uoc-after-transfer-notice";
const uoc = { oneHouseUnavoidableOutsideCapital: true, unavoidableOutsideCapitalReason: "work" } as const;
const house = (over: Partial<HouseEntry> = {}): HouseEntry => hrow({ id: "h1", region: "non_capital", acquisitionDate: "2019-01-01", ...over });

describe("uocRowAcquiredAfterTransfer — 노출 격자", () => {
  const cases: Array<[string, boolean, string | undefined, string | undefined, boolean]> = [
    // [이름, ⑧ 토글, 취득일, 양도일, 안내]
    ["ON · 취득일 전 · 양도일 유", true, "2026-09-17", TD, false],
    ["ON · 취득일 당일 · 양도일 유", true, TD, TD, true],
    ["ON · 취득일 후 · 양도일 유", true, "2026-10-01", TD, true],
    ["ON · 취득일 전 · 양도일 무", true, "2026-09-17", "", false],
    ["ON · 취득일 후 · 양도일 무 — 모름은 단정하지 않는다", true, "2026-10-01", "", false],
    ["ON · 취득일 후 · 양도일 undefined", true, "2026-10-01", undefined, false],
    ["ON · 취득일 없음 · 양도일 유", true, undefined, TD, false],
    ["ON · 취득일 없음 · 양도일 무", true, undefined, "", false],
    ["OFF · 취득일 전", false, "2026-09-17", TD, false],
    ["OFF · 취득일 당일", false, TD, TD, false],
    ["OFF · 취득일 후", false, "2026-10-01", TD, false],
    ["OFF · 취득일 후 · 양도일 무", false, "2026-10-01", "", false],
  ];
  for (const [name, on, acq, td, expected] of cases) {
    it(`${name} → ${expected ? "안내" : "없음"}`, () => {
      const h = house({ acquisitionDate: acq, ...(on ? uoc : {}) });
      expect(uocRowAcquiredAfterTransfer(h, td)).toBe(expected);
      // 위젯 — 같은 격자가 렌더에도 그대로 나온다
      render(<HouseEntryUnavoidableOutsideCapitalBlock house={h} onUpdate={() => {}} transferDate={td} />);
      expect(screen.queryByTestId(NOTICE) !== null).toBe(expected);
    });
  }

  it("술어 공유 — 안내 ⇔ 보유 명부(`housesOwnedAtTransfer`)에서 날짜로 빠진 행 (손술어 사본 없음)", () => {
    for (const acq of ["2018-01-01", "2026-09-17", TD, "2026-09-19", "2030-01-01"]) {
      for (const td of [TD, "", undefined]) {
        const h = house({ acquisitionDate: acq, ...uoc });
        const dropped = !housesOwnedAtTransfer([h], td, "housing").includes(h);
        expect(uocRowAcquiredAfterTransfer(h, td)).toBe(dropped);
      }
    }
  });

  it("안내 문구 — 한국어 풀어쓰기 · 절감·유리 표현 없음", () => {
    render(<HouseEntryUnavoidableOutsideCapitalBlock house={house({ acquisitionDate: "2026-10-01", ...uoc })} onUpdate={() => {}} transferDate={TD} />);
    const t = screen.getByTestId(NOTICE).textContent ?? "";
    expect(t).toContain("양도일 당일 또는 그 뒤에 취득");
    expect(t).toContain("반영되지 않습니다");
    expect(t).not.toMatch(/절감|유리|불리/);
  });
});

function form(houses: HouseEntry[], transferDate = TD, assetKind = "housing"): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = transferDate;
  Object.assign(f.assets[0], { assetKind, acquisitionDate: "2018-01-05" });
  f.householdHousingCount = String(houses.length + 1);
  f.houses = houses;
  return f;
}

describe("HousesListSection → 편집 모달 배선 (계산기·판정 메뉴 같은 위젯)", () => {
  const rows = () => [house({ id: "ha", ...uoc }), house({ id: "hl", acquisitionDate: "2026-10-01", ...uoc })];
  for (const judgmentMenu of [false, true]) {
    const label = judgmentMenu ? "판정 메뉴" : "계산기";
    it(`${label} — 양도일 뒤 취득 ⑧ 행을 열면 안내 · 보유 ⑧ 행을 열면 없음`, () => {
      render(<HousesListSection form={form(rows())} onChange={() => {}} judgmentMenu={judgmentMenu} />);
      fireEvent.click(screen.getByLabelText("주택 2 편집"));
      expect(screen.getByTestId(NOTICE)).toBeTruthy();
      cleanup();
      render(<HousesListSection form={form(rows())} onChange={() => {}} judgmentMenu={judgmentMenu} />);
      fireEvent.click(screen.getByLabelText("주택 1 편집"));
      expect(screen.getByTestId("house-row-unavoidable-outside-capital")).toBeTruthy();
      expect(screen.queryByTestId(NOTICE)).toBeNull();
    });
    it(`${label} — 양도일이 없으면 안내하지 않는다(양도일이 배선된다)`, () => {
      render(<HousesListSection form={form(rows(), "")} onChange={() => {}} judgmentMenu={judgmentMenu} />);
      fireEvent.click(screen.getByLabelText("주택 2 편집"));
      expect(screen.getByTestId("house-row-unavoidable-outside-capital")).toBeTruthy();
      expect(screen.queryByTestId(NOTICE)).toBeNull();
    });
  }
});
