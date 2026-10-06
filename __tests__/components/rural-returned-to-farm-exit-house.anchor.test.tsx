/**
 * @vitest-environment jsdom
 *
 * §155⑦2호·3호 「이농 후 이 주택으로 다시 귀농」 — 클라이언트 층. 엔진 술어는
 * `__tests__/tax-engine/transfer/rural-returned-to-farm-exit-house.anchor.test.ts`, route 결론은 해석례 평가셋
 * `E156-farmexit`·`P-E156-farmexit-not-returned`가 고정한다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | P-1 | ④ | 2호·3호 행의 답이 `ruralHouse.returnedToFarmExitHouse`로 실린다 · 1호에는 싣지 않는다 |
 * | V-1 | ⑧ leaf | 2호·3호 미응답이면 막고, 답했으면 통과 · 1호·농어촌 표시 없음은 묻지 않는다 |
 * | V-2 | ⑧ 계산기 | 계산기 Step1도 같은 leaf로 막는다 |
 * | V-3 | ⑧ 판정 메뉴 | 판정 메뉴 `validateAllSteps`도 같은 leaf로 그 행의 칸에 오류를 낸다 |
 * | W-1 | ⑤ | 2호·3호 블록에만 라디오가 있고, 고르면 같은 칸으로 올라간다 · 농어촌 표시를 끄면 지운다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HouseEntryRuralHouseBlock } from "@/components/calc/transfer/HouseEntryRuralHouseBlock";
import { deriveOneHouseFactsFromHouses } from "@/lib/calc/one-house-row-facts";
import { ruralReturnedToFarmExitIssue } from "@/lib/calc/one-house-row-facts";
import { collectStep1Issues } from "@/lib/calc/transfer-tax-validate-step1";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

afterEach(cleanup);

const ruralRow = (over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id: "rural",
    region: "non_capital",
    acquisitionDate: "1985-05-15",
    officialPrice: "100000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    oneHouseRuralHouse: true,
    ruralHouseKind: "farm_exit",
    ruralOwnerResidenceYears: "20",
    ruralOutsideCapitalEupMyeon: true,
    ...over,
  }) as HouseEntry;

describe("P-1 ④ payload", () => {
  it("2호·3호 행의 답이 실린다", () => {
    expect(deriveOneHouseFactsFromHouses([ruralRow({ ruralReturnedToFarmExitHouse: true })]).ruralHouse).toMatchObject({
      kind: "farm_exit",
      returnedToFarmExitHouse: true,
    });
    expect(
      deriveOneHouseFactsFromHouses([ruralRow({ ruralHouseKind: "return_to_farm", ruralReturnedToFarmExitHouse: false })])
        .ruralHouse,
    ).toMatchObject({ kind: "return_to_farm", returnedToFarmExitHouse: false });
  });
  it("1호(상속) 행에는 싣지 않는다", () => {
    const r = deriveOneHouseFactsFromHouses([ruralRow({ ruralHouseKind: "inherited", ruralReturnedToFarmExitHouse: true })]);
    expect(r.ruralHouse).not.toHaveProperty("returnedToFarmExitHouse");
  });
});

describe("V-1 ⑧ leaf", () => {
  it("2호·3호 미응답 → 막는다 / 답함(예·아니오) → 통과", () => {
    expect(ruralReturnedToFarmExitIssue(ruralRow())).toContain("다시 이 주택으로 돌아왔는지");
    expect(ruralReturnedToFarmExitIssue(ruralRow({ ruralHouseKind: "return_to_farm" }))).toContain("다시 이 주택으로 돌아왔는지");
    expect(ruralReturnedToFarmExitIssue(ruralRow({ ruralReturnedToFarmExitHouse: false }))).toBeNull();
    expect(ruralReturnedToFarmExitIssue(ruralRow({ ruralReturnedToFarmExitHouse: true }))).toBeNull();
  });
  it("1호 · 농어촌 표시 없음 → 묻지 않는다(짝)", () => {
    expect(ruralReturnedToFarmExitIssue(ruralRow({ ruralHouseKind: "inherited" }))).toBeNull();
    expect(ruralReturnedToFarmExitIssue(ruralRow({ oneHouseRuralHouse: false }))).toBeNull();
  });
});

describe("V-2 ⑧ 계산기 Step1", () => {
  const issues = (row: HouseEntry) => {
    const f = createDefaultTransferFormData();
    f.houses = [row];
    return collectStep1Issues(f).map((i) => i.message).join(" | ");
  };
  it("미응답이면 계산기도 막고, 답하면 이 사유는 사라진다", () => {
    expect(issues(ruralRow())).toContain("다시 이 주택으로 돌아왔는지");
    expect(issues(ruralRow({ ruralReturnedToFarmExitHouse: false }))).not.toContain("다시 이 주택으로 돌아왔는지");
  });
});

describe("V-3 ⑧ 판정 메뉴", () => {
  const errs = (row: HouseEntry) => {
    const f = createInitialOneHouseJudgmentForm();
    f.houses = [row];
    return validateAllSteps(f).filter((e) => e.severity === "error").map((e) => e.field);
  };
  it("미응답이면 그 행의 칸에 오류 / 답하면 없다", () => {
    expect(errs(ruralRow())).toContain("houses.0.ruralReturnedToFarmExitHouse");
    expect(errs(ruralRow({ ruralReturnedToFarmExitHouse: true }))).not.toContain("houses.0.ruralReturnedToFarmExitHouse");
  });
});

describe("W-1 ⑤ 라디오", () => {
  it("2호·3호 블록에 라디오가 있고 「그렇다」를 고르면 같은 칸으로 올라간다", () => {
    for (const kind of ["farm_exit", "return_to_farm"] as const) {
      const onUpdate = vi.fn();
      render(<HouseEntryRuralHouseBlock house={ruralRow({ ruralHouseKind: kind })} onUpdate={onUpdate} />);
      fireEvent.click(screen.getByTestId("house-row-rural-returned-yes"));
      expect(onUpdate).toHaveBeenCalledWith({ ruralReturnedToFarmExitHouse: true });
      cleanup();
    }
  });
  it("1호 블록에는 라디오가 없다(짝)", () => {
    render(<HouseEntryRuralHouseBlock house={ruralRow({ ruralHouseKind: "inherited" })} onUpdate={vi.fn()} />);
    expect(screen.queryByTestId("house-row-rural-returned")).toBeNull();
  });
  it("농어촌주택 표시를 끄면 답도 지운다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryRuralHouseBlock house={ruralRow({ ruralReturnedToFarmExitHouse: true })} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId("house-row-rural").querySelector("[role=switch], input[type=checkbox], button")!);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ ruralReturnedToFarmExitHouse: undefined }));
  });
});
