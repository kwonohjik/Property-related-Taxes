/**
 * @vitest-environment jsdom
 *
 * D7 — §155⑦1호 상속 농어촌주택에도 §155② 단서(동일세대 상속 배제)가 걸린다
 * (단서 괄호 「이하 제3항, 제7항제1호 … 에서 같다」 — 2010.2.18. 시행본 실독). 엔진 판정은 해석례 평가셋
 * `E145-era`·`E146-era`(과세)·`E146-era-pos`(별도세대 → 비과세)가 고정한다. 여기서는 클라이언트 층을 본다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | P-1 | ④ | 행의 동일세대·동거봉양 사실이 `ruralHouse` payload에 실린다(1호만) |
 * | V-1 | ⑧ leaf | 1호 행인데 미응답(undefined)이면 막고, 답했으면(true/false) 통과 · 다른 호는 묻지 않는다 |
 * | V-2 | ⑧ 계산기 | 계산기 Step1도 같은 leaf로 막는다 |
 * | V-3 | ⑧ 판정 메뉴 | 판정 메뉴 `validateAllSteps`도 같은 leaf로 막는다 |
 * | W-1 | ⑤ | 1호 블록에 동일세대 라디오가 있고, 고르면 같은 칸(`decedentSameHouseholdAtInheritance`)으로 올라간다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HouseEntryRuralHouseBlock } from "@/components/calc/transfer/HouseEntryRuralHouseBlock";
import {
  deriveOneHouseFactsFromHouses,
  ruralInheritedSameHouseholdIssue,
} from "@/lib/calc/one-house-row-facts";
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
    acquisitionDate: "1990-09-18",
    officialPrice: "100000000",
    isInherited: true,
    inheritedDate: "1990-09-18",
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    oneHouseRuralHouse: true,
    ruralHouseKind: "inherited",
    ruralDecedentResidenceYears: "10",
    ruralOutsideCapitalEupMyeon: true,
    ...over,
  }) as HouseEntry;

describe("P-1 ④ payload", () => {
  it("1호 행의 동일세대·동거봉양 사실이 실린다", () => {
    const r = deriveOneHouseFactsFromHouses([
      ruralRow({ decedentSameHouseholdAtInheritance: true, parentalCareMergeInheritedHouse: true }),
    ]);
    expect(r.ruralHouse).toMatchObject({
      kind: "inherited",
      decedentSameHouseholdAtInheritance: true,
      parentalCareMergeInheritedHouse: true,
    });
    expect(deriveOneHouseFactsFromHouses([ruralRow({ decedentSameHouseholdAtInheritance: false })]).ruralHouse)
      .toMatchObject({ decedentSameHouseholdAtInheritance: false });
  });
  it("3호(귀농) 행에는 싣지 않는다", () => {
    const r = deriveOneHouseFactsFromHouses([ruralRow({ ruralHouseKind: "return_to_farm" })]);
    expect(r.ruralHouse).not.toHaveProperty("decedentSameHouseholdAtInheritance");
  });
});

describe("V-1 ⑧ leaf", () => {
  it("1호 미응답 → 막는다 / 답함(예·아니오) → 통과", () => {
    expect(ruralInheritedSameHouseholdIssue(ruralRow({ decedentSameHouseholdAtInheritance: undefined }))).toContain(
      "동일세대",
    );
    expect(ruralInheritedSameHouseholdIssue(ruralRow({ decedentSameHouseholdAtInheritance: false }))).toBeNull();
    expect(ruralInheritedSameHouseholdIssue(ruralRow({ decedentSameHouseholdAtInheritance: true }))).toBeNull();
  });
  it("2호·3호 · 농어촌 표시 없음 → 묻지 않는다(짝)", () => {
    expect(ruralInheritedSameHouseholdIssue(ruralRow({ ruralHouseKind: "farm_exit" }))).toBeNull();
    expect(ruralInheritedSameHouseholdIssue(ruralRow({ oneHouseRuralHouse: false }))).toBeNull();
  });
});

describe("V-2 ⑧ 계산기 Step1", () => {
  const issues = (row: HouseEntry) => {
    const f = createDefaultTransferFormData();
    f.houses = [row];
    return collectStep1Issues(f).map((i) => i.message).join(" | ");
  };
  it("미응답이면 계산기도 막고, 답하면 이 사유는 사라진다", () => {
    expect(issues(ruralRow({ decedentSameHouseholdAtInheritance: undefined }))).toContain("§155⑦1호");
    expect(issues(ruralRow({ decedentSameHouseholdAtInheritance: false }))).not.toContain("§155⑦1호");
  });
});

describe("V-3 ⑧ 판정 메뉴", () => {
  const errs = (row: HouseEntry) => {
    const f = createInitialOneHouseJudgmentForm();
    f.houses = [row];
    return validateAllSteps(f).filter((e) => e.severity === "error").map((e) => e.field);
  };
  it("미응답이면 그 행의 동일세대 칸에 오류 / 답하면 없다", () => {
    expect(errs(ruralRow({ decedentSameHouseholdAtInheritance: undefined }))).toContain(
      "houses.0.decedentSameHouseholdAtInheritance",
    );
    expect(errs(ruralRow({ decedentSameHouseholdAtInheritance: true }))).not.toContain(
      "houses.0.decedentSameHouseholdAtInheritance",
    );
  });
});

describe("W-1 ⑤ 라디오", () => {
  it("1호 블록에 라디오가 있고 「동일세대」를 고르면 같은 칸으로 올라간다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryRuralHouseBlock house={ruralRow({ decedentSameHouseholdAtInheritance: undefined })} onUpdate={onUpdate} />);
    expect(screen.getByTestId("house-row-rural-same-household")).toBeTruthy();
    fireEvent.click(screen.getByTestId("house-row-rural-same-household-yes"));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ decedentSameHouseholdAtInheritance: true }));
  });
});
