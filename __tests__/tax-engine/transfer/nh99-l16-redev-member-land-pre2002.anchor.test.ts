/**
 * anchor — 조특법 §99·§99의3 재개발 조합원 갈래 후속 (레인 L16 · 계획서 `docs/00-pm/nh99-redev-inherited-member.plan.md` V-5 · V-10).
 *
 *  L14-1  토지만 출자한 원조합원이 종전 토지를 상속·증여로 취득한 경우도 취득 원인 게이트를 면제한다 — 조합원 갈래 법문
 *         「조합원이 취득하는 주택」(조특법 §99①1호·§99의3①2호)에 주택 출자를 요건으로 한 문언이 없다. 재개발 변형 산식(분모)만 갈린다.
 *  L14-2  §99의3 — 2001.12.31. 이전에 조합원 지위를 승계취득한 분은 종전 규정이다: «관리처분계획 인가일 현재의 조합원»(조특령 §99의3③2호 괄호·⑤)은
 *         이 영 시행(2002.1.1.) 후 최초로 조합원의 지위를 취득하는 분부터 적용한다(대통령령 제17458호 부칙 제11조).
 * 화면 경로(폼 → route)는 `__tests__/api/transfer.route.nh99-l16-redev-member-land-pre2002.anchor.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import {
  isLandOnlyOriginalMember,
  isPriorRuleSuccessor993,
  redevMemberGateCause,
  withRedevMemberGateNotice,
  type RedevMemberNewHouse,
} from "@/lib/tax-engine/transfer-reductions/new-99-redev-member";
import { makeMockRates, makeMockRatesWithHouseEngine, baseTransferInput } from "../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "../transfer-tax/redevelopment/_helpers";

const D = (s: string) => new Date(s);

describe("isPriorRuleSuccessor993 — 2001.12.31.까지 조합원 지위를 승계취득한 승계조합원", () => {
  const succ = (acq: string | undefined): RedevMemberNewHouse => ({
    houseContributed: false, isSuccessorMember: true, completionDate: D("2002-05-25"), rightAcquisitionDate: acq ? D(acq) : undefined, approvalDate: D("2000-09-01"),
  });
  it("2001-12-31 승계는 종전 규정 · 2002-01-01 승계는 아니다(경계 1일)", () => {
    expect(isPriorRuleSuccessor993(succ("2001-12-31"))).toBe(true);
    expect(isPriorRuleSuccessor993(succ("2002-01-01"))).toBe(false);
    expect(isPriorRuleSuccessor993(succ("2000-12-01"))).toBe(true);
  });
  it("승계일이 비어 있으면(「모름」) 판정할 수 없어 해당하지 않는다 · 원조합원·조합원 갈래 아님도 아니다", () => {
    expect(isPriorRuleSuccessor993(succ(undefined))).toBe(false);
    expect(isPriorRuleSuccessor993({ ...succ("2001-06-01"), isSuccessorMember: false })).toBe(false);
    expect(isPriorRuleSuccessor993(undefined)).toBe(false);
  });
});

describe("redevMemberGateCause — 토지만 출자한 원조합원 (L14-1)", () => {
  const land: RedevMemberNewHouse = {
    houseContributed: false, isSuccessorMember: false, completionDate: D("2002-05-25"), rightAcquisitionDate: D("1996-03-01"), approvalDate: D("2000-09-01"),
  };
  const ex = (cause: Parameters<typeof redevMemberGateCause>[0]["acquisitionCause"], member?: RedevMemberNewHouse) => redevMemberGateCause({ acquisitionCause: cause, member });
  it("인가일 전 상속·증여·이월과세 증여 → 면제(주택 출자와 같은 취급)", () => {
    for (const c of ["inheritance", "gift", "carryover_gift"] as const) {
      expect(ex(c, land)).toEqual({ acquisitionCause: undefined, exempted: true, successor: false, priorRuleSuccessor: false });
    }
  });
  it("짝 — 인가일 뒤 취득(승계 표시 없음) · 취득일/인가일 없음 → 불성립 유지", () => {
    expect(ex("inheritance", { ...land, rightAcquisitionDate: D("2000-09-02") }).exempted).toBe(false);
    expect(ex("inheritance", { ...land, rightAcquisitionDate: undefined }).exempted).toBe(false);
    expect(ex("inheritance", { ...land, approvalDate: undefined }).exempted).toBe(false);
  });
  it("isLandOnlyOriginalMember — 토지만 출자한 원조합원만 참 (승계·주택 출자는 거짓)", () => {
    expect(isLandOnlyOriginalMember(land)).toBe(true);
    expect(isLandOnlyOriginalMember({ ...land, houseContributed: true })).toBe(false);
    expect(isLandOnlyOriginalMember({ ...land, isSuccessorMember: true })).toBe(false);
    expect(isLandOnlyOriginalMember(undefined)).toBe(false);
  });
});

describe("redevMemberGateCause — 승계조합원 priorRuleSuccessor 전달", () => {
  const succ = (acq: string): RedevMemberNewHouse => ({
    houseContributed: false, isSuccessorMember: true, completionDate: D("2002-05-25"), rightAcquisitionDate: D(acq), approvalDate: D("2000-09-01"),
  });
  it("매매 승계도 priorRuleSuccessor가 실린다(면제는 상속·증여만) · 2002 이후 승계는 거짓", () => {
    expect(redevMemberGateCause({ acquisitionCause: "purchase", member: succ("2001-06-01") })).toEqual({
      acquisitionCause: "purchase", exempted: false, successor: false, priorRuleSuccessor: true,
    });
    expect(redevMemberGateCause({ acquisitionCause: "purchase", member: succ("2002-01-01") }).priorRuleSuccessor).toBe(false);
    expect(redevMemberGateCause({ acquisitionCause: "inheritance", member: succ("2001-06-01") })).toEqual({
      acquisitionCause: undefined, exempted: true, successor: true, priorRuleSuccessor: true,
    });
  });
});

describe("withRedevMemberGateNotice — L16 고지", () => {
  const g = (over: Partial<Parameters<typeof withRedevMemberGateNotice>[1]>) => ({ acquisitionCause: undefined, exempted: false, successor: false, priorRuleSuccessor: false, ...over });
  const d = (isEligible: boolean, warnings?: string[]): { isEligible: boolean; warnings?: string[] } => ({ isEligible, warnings });
  it("§99의3 매매 2001.12.31. 이전 승계 → 종전 규정 적용 근거 고지(「확인 필요」 아님)", () => {
    const r = withRedevMemberGateNotice(d(true), g({ priorRuleSuccessor: true }), "new_99_3");
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings?.[0]).toContain("조특령 대통령령 제17458호 부칙 제11조");
    expect(r.warnings?.[0]).toContain("사용승인일 현재 조합원");
    expect(r.warnings?.[0]).not.toMatch(/^확인 필요/);
    expect(r.warnings?.[0]).not.toMatch(/유리|불리|절감/);
  });
  it("§99에는 붙이지 않는다(인가일 요건이 없는 조문) · 불성립이면 붙이지 않는다", () => {
    expect(withRedevMemberGateNotice(d(true), g({ priorRuleSuccessor: true }), "new_99").warnings).toBeUndefined();
    expect(withRedevMemberGateNotice(d(false), g({ priorRuleSuccessor: true }), "new_99_3").warnings).toBeUndefined();
  });
  it("§99의3 상속·증여 승계(2001.12.31. 이전) → 종전 규정 고지 + 「확인 필요」 (인가일 요건이 없다는 §99 문구가 아니다)", () => {
    const r = withRedevMemberGateNotice(d(true), g({ priorRuleSuccessor: true, exempted: true, successor: true }), "new_99_3");
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings?.[1]).toMatch(/^확인 필요: 2001\.12\.31\. 이전에 입주권을 상속·증여로 승계했고 사용승인일 현재 조합원이므로/);
    expect(r.warnings?.[1]).toContain("정면으로 다룬 해석례는 확인하지 못했습니다");
    expect(r.warnings?.[1]).not.toContain("§99는 인가일 요건이 없음");
  });
  it("토지만 출자 원조합원 → 「종전 토지」 문구", () => {
    const r = withRedevMemberGateNotice(d(true), g({ exempted: true }), "new_99_3", true);
    expect(r.warnings?.[0]).toMatch(/^확인 필요: 종전 토지를 상속·증여로 취득했으나 관리처분계획 인가일 전부터 조합원이므로/);
    const h = withRedevMemberGateNotice(d(true), g({ exempted: true }), "new_99_3");
    expect(h.warnings?.[0]).toMatch(/^확인 필요: 종전주택을 상속·증여로 취득했으나/);
  });
});

/* ── 엔진 Step C.5 · STEP 0.45 배선 (mock 세율 — 정본 세액 아님) ───────────────────────── */
const rates = makeMockRates();
const R993 = {
  type: "new_99_3" as const, standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 160_000_000, standardPriceAtTransfer993: 250_000_000,
  region993: "outside_speculation" as const, remainderContract993: "yes" as const, previousHouseStdPrice993: 80_000_000,
};
/** 승계조합원 완공 아파트 — 입주권 승계일(`acquisitionDate`)만 바꾼다. 승계는 실지 취득가액이 필요하다. */
function successorApt(acq: string, over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt", transferPrice: 525_000_000, transferDate: new Date("2026-02-16"), acquisitionDate: D(acq),
    acquisitionPrice: 300_000_000, expenses: 0, useEstimatedAcquisition: false, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
    redevelopment: { ...case44RedevelopmentInfo(), approvalDate: D("2000-09-01"), completionDate: D("2012-06-01"), isSuccessorMember: true },
    reductions: [R993] as unknown as TransferTaxInput["reductions"],
    ...over,
  });
}
const codes = (r: ReturnType<typeof calculateTransferTax>) => r.new993Detail?.ineligibleReasons.map((x) => x.code) ?? [];

describe("Step C.5 — §99의3 승계조합원 × 승계일 (L14-2)", () => {
  it("2001-12-31 승계(인가 2000-09-01 뒤) → 적용 · 종전 규정 고지", () => {
    const r = calculateTransferTax(successorApt("2001-12-31"), rates);
    expect(r.new993Detail?.isEligible).toBe(true);
    expect(codes(r)).toEqual([]);
    expect(r.new993Detail?.warnings?.some((w) => w.includes("조특령 대통령령 제17458호 부칙 제11조"))).toBe(true);
  });
  it("🔑 경계 짝 — 2002-01-01 승계 → NOT_MEMBER_AT_APPROVAL (세액 = 감면 미선택 대조)", () => {
    const r = calculateTransferTax(successorApt("2002-01-01"), rates);
    const ctl = calculateTransferTax(successorApt("2002-01-01", { reductions: [] }), rates);
    expect(codes(r)).toEqual(["NOT_MEMBER_AT_APPROVAL"]);
    expect(r.totalTax).toBe(ctl.totalTax);
    expect(r.new993Detail?.warnings?.some((w) => w.includes("부칙 제11조")) ?? false).toBe(false);
  });
  it("적용되는 쪽이 감면 미선택 대조보다 낮다(감면이 실제로 서 있다)", () => {
    const r = calculateTransferTax(successorApt("2001-06-01"), rates);
    const ctl = calculateTransferTax(successorApt("2001-06-01", { reductions: [] }), rates);
    expect(r.new993Detail?.reducibleTransferIncome).toBeGreaterThan(0);
    expect(r.totalTax).toBeLessThan(ctl.totalTax);
  });
});

describe("STEP 0.45 — 2001.12.31. 이전 승계조합원 × 중과 배제 (mock 세율 · 3주택 · 조정대상지역 · 양도 2021-09-01)", () => {
  const houseRates = makeMockRatesWithHouseEngine();
  const h = (id: string, acq: string) => ({ id, region: "capital", acquisitionDate: D(acq), officialPrice: 800_000_000, isInherited: false, isLongTermRental: false });
  const surcharge = (acq: string, red = true) =>
    ({
      ...successorApt(acq, { transferDate: D("2021-09-01") }), isOneHousehold: true, householdHousingCount: 3, isRegulatedArea: true, wasRegulatedAtAcquisition: false,
      sellingHouseId: "s", houses: [h("s", acq), h("h2", "2015-01-01"), h("h3", "2015-01-01")], reductions: (red ? [R993] : []) as unknown as TransferTaxInput["reductions"],
    }) as TransferTaxInput;
  const reasons = (r: ReturnType<typeof calculateTransferTax>) => (r.multiHouseSurchargeEvaluation?.exclusionReasons ?? []).map((e: { type: string }) => e.type);

  it("2001-06-01 승계 → Step C.5와 같은 판정으로 중과 배제", () => {
    const r = calculateTransferTax(surcharge("2001-06-01"), houseRates);
    expect(r.new993Detail?.isEligible).toBe(true);
    expect(reasons(r)).toEqual(["tax_special_exemption"]);
  });
  it("🔑 짝 — 2002-01-01 승계는 중과 배제 없음(감면 불성립)", () => {
    const r = calculateTransferTax(surcharge("2002-01-01"), houseRates);
    expect(codes(r)).toEqual(["NOT_MEMBER_AT_APPROVAL"]);
    expect(reasons(r)).not.toContain("tax_special_exemption");
    expect(r.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(true);
  });
});
