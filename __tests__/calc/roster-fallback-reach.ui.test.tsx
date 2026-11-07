/**
 * @vitest-environment jsdom
 *
 * 명부 없는 fallback 중과로 가는 **화면 경로** 차단 — 리뷰 US-31 · US-70(계획서 `docs/00-pm/roster-fallback-surcharge-bundle.plan.md`).
 * US-30(레거시 표식)은 `house-roster-required.anchor.test.ts` HR-4·HR-7e.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { confirmClearPatchOnKindChange, confirmedNoOtherHousesDiverges } from "@/lib/calc/household-house-count";
import { HouseholdHousingCountSection } from "@/app/calc/transfer-tax/steps/step4-sections/HouseholdHousingCountSection";
import { SurchargeRateImpactCard } from "@/components/calc/results/surcharge/SurchargeRateImpactCard";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

const confirmed = (kind: string, count: string, over: Partial<TransferFormData> = {}): TransferFormData => {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...f.assets[0], assetKind: kind as never };
  return { ...f, houses: [], householdHousingCount: count, householdNoOtherHousesConfirmed: true, ...over };
};
const step1Fields = (f: TransferFormData) => collectStepIssues(1, f).map((i) => i.field);

describe("US-31 ⑧ — 「다른 보유 주택 없음」 확정과 저장 주택 수의 정합", () => {
  it("D-1: 🔴 주택 · 확정 ✓ · 주택 수 2(분양권 화면에서 바꾼 값) → 차단 (종전: 통과 → fallback 2주택 중과)", () => {
    expect(confirmedNoOtherHousesDiverges(confirmed("housing", "2"), "housing")).toBe(true);
    expect(step1Fields(confirmed("housing", "2"))).toContain("householdNoOtherHousesConfirmed");
  });

  it("D-2: 🔴 입주권으로 확정(0) 뒤 주택으로 정정 → 차단", () => {
    expect(confirmedNoOtherHousesDiverges(confirmed("housing", "0"), "housing")).toBe(true);
  });

  it.each([
    ["housing", "1"],
    ["redevelopment_apt", "1"],
    ["right_to_move_in", "0"],
  ])("D-3: 짝 — %s · 확정 ✓ · 자기 몫(%s) → 통과", (kind, count) => {
    expect(confirmedNoOtherHousesDiverges(confirmed(kind, count), kind)).toBe(false);
  });

  it("D-4: 짝 — 명부 행이 있거나 레거시 표식이거나 분양권 자신의 양도면 대상이 아니다", () => {
    const row = { id: "o1", region: "capital", acquisitionDate: "2015-01-01", officialPrice: "300000000" } as never;
    expect(confirmedNoOtherHousesDiverges(confirmed("housing", "2", { houses: [row] }), "housing")).toBe(false);
    expect(confirmedNoOtherHousesDiverges(confirmed("housing", "2", { legacyHouseCountPrecedence: true }), "housing")).toBe(false);
    expect(confirmedNoOtherHousesDiverges(confirmed("presale_right", "2"), "presale_right")).toBe(false);
  });
});

describe("US-31 ⑤ — 확정의 의미가 바뀌는 조작은 확정을 해제한다", () => {
  it.each([
    ["housing", "presale_right", true],
    ["right_to_move_in", "housing", true],
    ["housing", "land", true],
    ["housing", "redevelopment_apt", false],
    ["housing", "housing", false],
  ] as const)("K: 자산 종류 %s → %s · 해제=%s", (from, to, cleared) => {
    expect(confirmClearPatchOnKindChange(from, to, true)).toEqual(cleared ? { householdNoOtherHousesConfirmed: false } : {});
  });

  it("K-0: 확정이 꺼져 있으면 아무것도 바꾸지 않는다", () => {
    expect(confirmClearPatchOnKindChange("housing", "presale_right", false)).toEqual({});
  });

  it("B-1: 🔴 분양권 화면의 주택 수 버튼은 확정을 함께 해제한다 (종전: 주택 수만 바뀌어 확정 ✓ + 2채가 남았다)", () => {
    const onChange = vi.fn();
    const f = confirmed("presale_right", "1");
    render(<HouseholdHousingCountSection form={f} onChange={onChange} primaryKind="presale_right" derivedHouseholdHousingCount={1} houseCountLocked={false} />);
    fireEvent.click(screen.getByText("2채"));
    expect(onChange).toHaveBeenCalledWith({ householdHousingCount: "2", householdNoOtherHousesConfirmed: false });
  });
});

describe("US-70 — 판정 메뉴 세율 영향 카드: 5호·3호 선언이면 특례세율·감면은 계산기에서 확인하라고 알린다", () => {
  const impact = {
    surchargeType: "none" as const,
    isSurchargeCase: false,
    isRateSurchargeApplied: false,
    addonRate: null,
    lthdExcluded: false,
    suspension: null,
    rateSurchargeStatutoryExcluded: false,
  };
  it("R-1: 🔴 선언 → 안내 표시", () => {
    render(<SurchargeRateImpactCard rateImpact={impact} incentiveHouseDeclared />);
    expect(screen.getByTestId("surcharge-rate-incentive-note").textContent).toContain("양도소득세 계산기");
  });
  it("R-2: 짝 — 선언 없음 → 안내 없음", () => {
    render(<SurchargeRateImpactCard rateImpact={impact} />);
    expect(screen.queryByTestId("surcharge-rate-incentive-note")).toBeNull();
  });
});

describe("US-31 ⑤ 배선 — Step1 자산 종류 버튼이 같은 patch에 확정 해제를 싣는다", () => {
  it("W-1: 🔴 주택(확정 ✓) → 단순토지 클릭 → onChange에 householdNoOtherHousesConfirmed: false", async () => {
    const { Step1 } = await import("@/app/calc/transfer-tax/steps/Step1");
    const onChange = vi.fn();
    const f = { ...confirmed("housing", "1"), transferDate: "2026-07-01" };
    render(<Step1 form={f} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("button").find((b) => b.textContent?.startsWith("단순토지"))!);
    const patch = onChange.mock.calls.map((c) => c[0]).find((p: Partial<TransferFormData>) => p.assets);
    expect(patch?.assets?.[0].assetKind).toBe("land");
    expect(patch?.householdNoOtherHousesConfirmed).toBe(false);
  });
});
