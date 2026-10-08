/**
 * @vitest-environment jsdom
 *
 * anchor — 판정 메뉴 비거주자 (소득세법 §121② 단서 · 시행령 §180의2 · §154⑧2호).
 * route 결론은 평가셋 F289-era · F307-era · S001-current · F390-current(양도일 현재 비거주자) · F038-current · F384-era(비거주 기간)가 고정한다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | N-1 | leaf | 주택 양도 — 2010.1.1. 이후 비과세를 끈다 · 나·다목 단서 성립이면 유지 · 그 전은 판정 보류 |
 * | N-2 | leaf | 입주권 양도 — 2020.1.1. 이후 §89①4호 불성립 · 그 전은 결론 유지 + 판정 보류 |
 * | N-3 | leaf | 비거주 기간 — 기산일을 비거주 기간만큼 미룬다 · 취득 당시 비거주자면 거주자가 된 날 · §154⑧2호면 그대로 |
 * | N-4 | ⑤④⑧ | 칸·본문·검증이 같은 게이트 · 계산기로는 넘기지 않는다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step1 } from "@/app/calc/one-house-exemption/steps/Step1";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateStep1 } from "@/lib/calc/one-house-exemption-validate";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { applyNonResidentVerdict } from "@/lib/tax-engine/one-house/non-resident";
import { excludeNonResidentHoldingPeriod } from "@/lib/tax-engine/one-house/non-resident-holding";
import { resolveOneRightExemptionClause } from "@/lib/tax-engine/transfer-tax-redevelopment-transforms";
import type { OneHouseJudgment } from "@/lib/tax-engine/one-house/types";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const D = (s: string) => new Date(s);
const exempt = {
  isExempt: true,
  isPartialExempt: false,
  exemptReason: "1세대1주택 비과세",
  appliedExceptions: [{ id: "155-1-temporary-two-house" }],
  pending: [],
  undetermined: [],
  unmetExceptions: [],
  legalBasis: [],
} as unknown as OneHouseJudgment;
const house = (t: string, patch: object = {}) =>
  ({ transferorNonResidentAtTransfer: true, transferDate: D(t), acquisitionDate: D("2015-03-15"), ...patch }) as never;

describe("N-1 주택 양도", () => {
  it("2010.1.1. 이후 비과세를 끄고 사유를 남긴다", () => {
    const j = applyNonResidentVerdict(exempt, house("2018-06-19"), false);
    expect(j.isExempt).toBe(false);
    expect(j.appliedExceptions).toEqual([]);
    expect(j.unmetExceptions.map((u) => u.id)).toEqual(["non-resident-121-2"]);
    expect(applyNonResidentVerdict(exempt, house("2010-01-01"), false).isExempt).toBe(false);
  });
  it("나·다목 단서 성립이면 유지 · 거주자면 유지 · 2010.1.1. 전은 판정 보류", () => {
    const proviso = { oneHouseExemptionProviso: { reason: "overseas_migration", departureDate: D("2017-06-01"), departureOnlyHouse: true } };
    expect(applyNonResidentVerdict(exempt, house("2018-06-19", proviso), false).isExempt).toBe(true);
    expect(applyNonResidentVerdict(exempt, house("2018-06-19", { transferorNonResidentAtTransfer: false }), false).isExempt).toBe(true);
    const pre = applyNonResidentVerdict(exempt, house("2009-12-31"), false);
    expect(pre.isExempt).toBe(true);
    expect(pre.undetermined.map((u) => u.id)).toEqual(["121-2-pre2010-non-resident-unverified"]);
  });
});

describe("N-2 입주권 양도", () => {
  const right = (t: string, nonResident = true) =>
    ({
      transferorNonResidentAtTransfer: nonResident,
      transferDate: D(t),
      isOneHousehold: true,
      householdRightCount: 1,
      householdHousingCount: 0,
      householdNoPresaleRightsConfirmed: true,
    }) as never;
  const facts = { exemptionEligibleAtApproval: true };
  it("2020.1.1. 이후 불성립 · 그 전과 거주자는 가목", () => {
    expect(resolveOneRightExemptionClause(facts, right("2020-01-01"))).toBeUndefined();
    expect(resolveOneRightExemptionClause(facts, right("2019-12-31"))).toBe("ga");
    expect(resolveOneRightExemptionClause(facts, right("2024-09-13", false))).toBe("ga");
  });
  it("2020.1.1. 전 비과세면 결론 유지 + 판정 보류", () => {
    const j = applyNonResidentVerdict(exempt, house("2018-09-19"), true);
    expect(j.isExempt).toBe(true);
    expect(j.undetermined.map((u) => u.id)).toEqual(["121-2-pre2020-non-resident-right-unverified"]);
  });
});

describe("N-3 비거주 기간", () => {
  const start = (p: object) =>
    excludeNonResidentHoldingPeriod({ acquisitionDate: D("2001-08-15"), nonResidentHoldingPeriod: p as never }, D("2001-08-15"))
      .toISOString()
      .slice(0, 10);
  it("비거주 기간만큼 미룬다 · 취득 당시 비거주자면 거주자가 된 날", () => {
    // 2002-02-15 ~ 2005-08-15 = 1277일 → 2001-08-15 + 1277일
    expect(start({ startDate: D("2002-02-15"), endDate: D("2005-08-15") })).toBe("2005-02-12");
    expect(start({ endDate: D("2005-08-15") })).toBe("2005-08-15");
  });
  it("§154⑧2호 — 그 주택 거주 상태로 3년 이상 보유 후 전환이면 통산 · 3년 미만이면 미룬다", () => {
    expect(start({ endDate: D("2005-08-15"), residedAtConversion: true })).toBe("2001-08-15");
    expect(start({ endDate: D("2003-08-15"), residedAtConversion: true })).toBe("2003-08-15");
  });
});

describe("N-4 ⑤④⑧ · 넘기기", () => {
  const form = (patch: Partial<OneHouseJudgmentFormData>): OneHouseJudgmentFormData =>
    ({ ...createInitialOneHouseJudgmentForm(), transferDate: "2026-08-14", ...patch }) as OneHouseJudgmentFormData;
  it("양도일 현재 비거주자 — 칸·본문·주의사항 · 그러면 비거주 기간 칸은 닫힌다", () => {
    const f = form({ transferorNonResident: true, nonResidentPeriod: true, residentFromDate: "2024-09-15" });
    render(<Step1 form={f} onChange={() => {}} />);
    expect(screen.getByTestId("one-house-non-resident")).toBeTruthy();
    expect(screen.queryByTestId("one-house-non-resident-period")).toBeNull();
    const body = buildOneHouseExemptionApiBody(f) as Record<string, unknown>;
    expect(body.transferorNonResidentAtTransfer).toBe(true);
    expect(body.nonResidentHoldingPeriod).toBeUndefined();
    expect(validateStep1(f).map((e) => e.field)).toContain("transferorNonResident");
  });
  it("비거주 기간 — 칸·본문 · 거주자가 된 날 필수 · 양도일 뒤면 오류", () => {
    const f = form({ nonResidentPeriod: true, nonResidentStartDate: "2020-01-01", residentFromDate: "2024-09-15" });
    render(<Step1 form={f} onChange={() => {}} />);
    expect(screen.getByTestId("one-house-resident-from")).toBeTruthy();
    expect((buildOneHouseExemptionApiBody(f) as Record<string, unknown>).nonResidentHoldingPeriod).toEqual({
      startDate: "2020-01-01",
      endDate: "2024-09-15",
    });
    const errs = (p: Partial<OneHouseJudgmentFormData>) =>
      validateStep1(form({ nonResidentPeriod: true, ...p })).filter((e) => e.severity === "error").map((e) => e.field);
    expect(errs({ residentFromDate: "" })).toEqual(["residentFromDate"]);
    expect(errs({ residentFromDate: "2026-09-01" })).toEqual(["residentFromDate"]);
    expect(errs({ nonResidentStartDate: "2025-01-01", residentFromDate: "2024-09-15" })).toEqual(["nonResidentStartDate"]);
    expect(errs({ residentFromDate: "2024-09-15" })).toEqual([]);
  });
  it("계산기로는 넘기지 않는다", () => {
    const patch = toTransferFormPatch(form({ transferorNonResident: true, nonResidentPeriod: true, residentFromDate: "2024-09-15" })) as Record<string, unknown>;
    for (const k of ["transferorNonResident", "nonResidentPeriod", "nonResidentStartDate", "residentFromDate", "nonResidentResidedAtConversion"]) {
      expect(k in patch).toBe(false);
    }
  });
});
