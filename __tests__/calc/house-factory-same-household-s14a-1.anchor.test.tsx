/**
 * S14a-1 anchor — 「+ 주택 추가」로 만든 행은 §155⑦1호 동일세대 여부를 **미리 답하지 않는다**.
 *
 * 결함: 팩토리가 `decedentSameHouseholdAtInheritance: false`를 넣어, 이 경로로 만든 상속 농어촌주택 행만
 * 「동일세대 여부를 선택하세요」(⑧ · D7 「모름」은 불리)를 건너뛰어 별도세대로 확정된 채 비과세가 났다.
 * 비농어촌 상속주택(§155②)에서는 **#42-2 합침으로 뒤집혔다** — 종전엔 `undefined`가 `false`(별도세대)와 같이 읽혀 답하지 않아도 특례가 적용됐으나,
 * 이제 미답은 「모름」과 같이 읽어 불성립 + 확인 필요다(아래 describe).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { useEffect, useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HousesListSection } from "@/app/calc/transfer-tax/steps/step4-sections/HousesListSection";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { buildCaseForm, observeCase, type RulingCase } from "./one-house-rulings/harness";
import cases from "./one-house-rulings/cases/E146.json";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(() => cleanup());

const ui: { latest?: TransferFormData } = {};
function Host() {
  const [f, setF] = useState<TransferFormData>(() => {
    const d = createDefaultTransferFormData();
    d.assets[0] = { ...d.assets[0], assetKind: "housing" };
    return { ...d, householdHousingCount: "2", transferDate: "2017-03-27" };
  });
  useEffect(() => { ui.latest = f; });
  return <HousesListSection form={f} onChange={(p) => setF((x) => ({ ...x, ...p }))} />;
}
const caseBase = (cases as RulingCase[]).find((c) => c.id === "E146-era-pos")!;
const ruralFacts = (() => {
  const { id: _i, decedentSameHouseholdAtInheritance: _d, ...rest } = caseBase.form!.houses![0] as Record<string, unknown>;
  void _i;
  void _d;
  return rest;
})();
function calcIssues(form: TransferFormData) {
  const out: string[] = [];
  for (let s = 0; s <= 5; s++) for (const i of collectStepIssues(s, form)) out.push(i.message);
  return out;
}

describe("S14a-1 anchor — 팩토리 기본값", () => {
  it("「+ 주택 추가」 행은 동일세대 여부를 미리 답하지 않고, 상속 농어촌 1호 칸만 채우면 두 ⑧이 막는다", () => {
    render(<Host />);
    fireEvent.click(screen.getByText("+ 주택 추가"));
    const created = ui.latest!.houses![ui.latest!.houses!.length - 1];
    expect(created.decedentSameHouseholdAtInheritance).toBeUndefined();
    const row = { ...created, ...ruralFacts, officialPrice: "100000000" } as HouseEntry;
    const jf = buildCaseForm({ ...caseBase, form: { ...caseBase.form!, houses: [] } });
    jf.houses = [row];
    expect(
      validateAllSteps(jf).some((e) => e.severity === "error" && e.field === "houses.0.decedentSameHouseholdAtInheritance"),
    ).toBe(true);
    const cf = { ...createDefaultTransferFormData(), householdHousingCount: "2", transferDate: "2017-03-27", houses: [row] } as TransferFormData;
    cf.assets[0] = { ...cf.assets[0], assetKind: "housing" };
    expect(calcIssues(cf).some((x) => /동일세대였는지 선택하세요/.test(x))).toBe(true);
  });

  // 긍정 짝 — 사용자가 「별도세대」를 고르면 ⑧이 통과한다(막다른 길이 아니다).
  it("긍정 짝: 동일세대 여부에 답하면(별도세대) 두 ⑧이 통과한다", () => {
    const row = { id: "x", region: "capital", acquisitionDate: "2000-01-01", officialPrice: "100000000", isInherited: false, isLongTermRental: false, isApartment: false, isOfficetel: false, isUnsoldHousing: false, ...ruralFacts, decedentSameHouseholdAtInheritance: false } as unknown as HouseEntry;
    const jf = buildCaseForm({ ...caseBase, form: { ...caseBase.form!, houses: [] } });
    jf.houses = [row];
    expect(validateAllSteps(jf).some((e) => e.severity === "error" && e.field === "houses.0.decedentSameHouseholdAtInheritance")).toBe(false);
  });
});

describe("S14a-1 anchor — 비농어촌 상속주택(§155②)은 미답 = 모름 (#42-2 합침 — 종전 undefined = false를 뒤집었다)", () => {
  const mk = (decedent: boolean | undefined, unknown = false): RulingCase =>
    ({
      id: "p", docNo: "", docDate: "", basis: "current", today: "2026-06-01", summary: "", bucket: "match",
      form: {
        isOneHousehold: true,
        transferDate: "2026-05-01",
        contractTotalPrice: "900000000",
        asset: { assetKind: "housing", acquisitionDate: "2016-01-01" },
        houses: [{
          id: "inh", acquisitionDate: "2020-01-01", officialPrice: "300000000", isInherited: true, inheritedDate: "2020-01-01",
          ...(decedent === undefined ? {} : { decedentSameHouseholdAtInheritance: decedent }),
          ...(unknown ? { decedentHouseholdUnknown: true } : {}),
        }],
      },
    }) as unknown as RulingCase;
  it("판정 route: 미답(undefined)은 명시한 모름과 같은 결론이고 별도세대(false)와 다르다", async () => {
    const u = await observeCase(mk(undefined));
    const m = await observeCase(mk(undefined, true));
    const f = await observeCase(mk(false));
    expect(u.status).toBe(200);
    expect([u.isExempt, u.excludedHouses, u.appliedExceptions, u.undetermined, u.unmetReasons, u.validationErrors]).toEqual([
      m.isExempt,
      m.excludedHouses,
      m.appliedExceptions,
      m.undetermined,
      m.unmetReasons,
      m.validationErrors,
    ]);
    // 별도세대로 답해야 상속주택이 주택 수에서 빠진다(§155②) — 미답·모름·동일세대(true)는 빠지지 않는다.
    expect(f.excludedHouses.map((h) => h.houseId)).toEqual(["inh"]);
    expect(u.excludedHouses).toEqual([]);
    expect(u.isExempt).not.toBe(f.isExempt);
    expect(Object.values(u.unmetReasons).flat().join(" ")).toContain("모르거나 답하지 않았습니다");
    const t = await observeCase(mk(true));
    expect(t.excludedHouses).toEqual([]);
  });
});
