/**
 * @vitest-environment jsdom
 *
 * PR1b ⑤ 앵커 — §154① 단서 카드는 ④·⑧과 같은 맥락(제외 후 주택 수 · 양도 대상 종류)에서만 뜬다.
 * - S10-5: 판정 메뉴 입주권 양도(§89①4호)에는 §154① 단서가 적용되지 않으므로 카드가 없어야 한다.
 * - S03-4: 제외 후 1주택(§155② 상속주택 제외)이면 판정 메뉴·계산기 양쪽에 카드가 뜬다. 순수 2주택이면 없다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import { judgmentProvisoMode } from "@/lib/calc/one-house-judgment-section-scope";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const H = {
  id: "h1",
  region: "capital",
  acquisitionDate: "2020-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};

function form(kind: "housing" | "right_to_move_in", houses: unknown[]): OneHouseJudgmentFormData {
  return {
    ...createInitialOneHouseJudgmentForm(),
    assets: [{ ...makeDefaultAsset(1), assetKind: kind, acquisitionCause: "purchase", acquisitionDate: "2015-01-01" }],
    transferDate: "2026-06-01",
    isOneHousehold: true,
    houses,
    presaleRights: [],
  } as unknown as OneHouseJudgmentFormData;
}

const cardShown = (f: OneHouseJudgmentFormData) => {
  render(<Step2 form={f} onChange={() => {}} />);
  const v = !!screen.queryByTestId("proviso-reason-none");
  cleanup();
  return v;
};

describe("S10-5 anchor draft", () => {
  it("입주권 양도 + 명부 주택 1채 — 카드 없음(④·⑧ 맥락 null과 일치)", () => {
    const f = form("right_to_move_in", [H]);
    expect(judgmentProvisoMode(f)).toBeNull();
    expect(cardShown(f)).toBe(false);
  });
  it("대조 — 주택 양도 + 명부 0채면 카드가 뜨고 맥락 one_house", () => {
    const f = form("housing", []);
    expect(judgmentProvisoMode(f)).toBe("one_house");
    expect(cardShown(f)).toBe(true);
  });
});

// ── S03-4 — 제외 후 주택 수로 카드가 열린다 ─────────────────────────────────
const INH = {
  ...H,
  id: "INH",
  acquisitionDate: "2024-09-01",
  isApartment: false,
  isInherited: true,
  inheritedDate: "2024-09-01",
  isCoInherited: false,
  decedentSameHouseholdAtInheritance: false,
  parentalCareMergeInheritedHouse: false,
};
const PLAIN = { ...H, id: "P", acquisitionDate: "2010-01-01", isApartment: false }; // 양도 주택보다 먼저 취득 — 일시적 2주택 아님

describe("S03-4 ⑤ — 제외 후 1주택이면 단서 카드가 뜬다", () => {
  it("판정 메뉴 · §155② 상속주택 1채 + 일반주택 양도 → 카드 · 맥락 one_house", () => {
    const f = form("housing", [INH]);
    expect(judgmentProvisoMode(f)).toBe("one_house");
    expect(cardShown(f)).toBe(true);
  });
  it("[짝] 판정 메뉴 · 상속이 아닌 일반주택 1채(순수 2주택)면 카드 없음", () => {
    const f = form("housing", [PLAIN]);
    expect(judgmentProvisoMode(f)).toBeNull();
    expect(cardShown(f)).toBe(false);
  });

  function calcForm(houses: unknown[]): TransferFormData {
    const base = createDefaultTransferFormData();
    return {
      ...base,
      assets: base.assets.map((a, i) =>
        i === 0 ? { ...a, assetKind: "housing" as const, acquisitionCause: "purchase" as const, acquisitionDate: "2024-03-01" } : a,
      ),
      transferDate: "2025-06-02",
      isOneHousehold: true,
      houses,
      householdHousingCount: String(1 + houses.length),
      householdNoPresaleRightsConfirmed: true,
    } as unknown as TransferFormData;
  }
  const calcCard = (f: TransferFormData) => {
    render(<Step4 form={f} onChange={() => {}} />);
    const v = !!screen.queryByTestId("proviso-reason-none");
    cleanup();
    return v;
  };
  it("계산기 · §155② 상속주택 1채 + 일반주택 양도 → 카드가 뜬다", () => {
    expect(calcCard(calcForm([INH]))).toBe(true);
  });
  it("[짝] 계산기 · 상속이 아닌 일반주택 1채(순수 2주택)면 카드 없음", () => {
    expect(calcCard(calcForm([PLAIN]))).toBe(false);
  });
});
