/**
 * anchor — 조특법 §99·§99의3 **상속·증여로 받은 종전주택의 재개발 조합원 갈래** (레인 L14 · 계획서 `docs/00-pm/nh99-redev-inherited-member.plan.md`).
 *
 * 취득 원인 게이트(`new-99-acquisition-cause.ts`)가 읽는 «상속·증여»는 신축주택의 취득 원인이다. 조합원 갈래의 신축주택은 조합에서 받은
 * 것이므로, 종전주택(입주권)을 상속·증여로 취득해 조합원이 된 경우는 법문에 한정이 없다(조특법 §99①1호 괄호 · §99의3①2호).
 *  Q-1 a — 인가일 전 취득 원조합원: 게이트 면제 + 「확인 필요」 고지.
 *  Q-2 a — 인가일 뒤 상속·증여 승계: §99는 사용승인일 현재 조합원이면 허용, §99의3은 `NOT_MEMBER_AT_APPROVAL` 유지.
 *  Q-3 b — 지분별 판정(자산 카드별 취득 원인).
 * 화면 경로(폼 → route)는 `__tests__/api/transfer.route.nh99-l14-redev-inherited-member.anchor.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import {
  redevMemberGateCause,
  redevMemberNewHouseOf,
  withRedevMemberGateNotice,
  type RedevMemberNewHouse,
} from "@/lib/tax-engine/transfer-reductions/new-99-redev-member";
import { makeMockRates, makeMockRatesWithHouseEngine, baseTransferInput } from "../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "../transfer-tax/redevelopment/_helpers";

const D = (s: string) => new Date(s);

describe("redevMemberGateCause — 조합원 갈래 취득 원인 게이트 면제 판정", () => {
  const original: RedevMemberNewHouse = {
    houseContributed: true, isSuccessorMember: false, completionDate: D("2002-05-25"), rightAcquisitionDate: D("1996-03-01"), approvalDate: D("2000-09-01"),
  };
  const successor: RedevMemberNewHouse = {
    houseContributed: false, isSuccessorMember: true, completionDate: D("1999-03-01"), rightAcquisitionDate: D("1998-08-01"), approvalDate: D("1996-09-01"),
  };
  const ex = (cause: Parameters<typeof redevMemberGateCause>[0]["acquisitionCause"], member?: RedevMemberNewHouse) =>
    redevMemberGateCause({ acquisitionCause: cause, member });

  it("원조합원(주택 출자) · 인가일 전 상속·증여·이월과세 증여 → 면제(취득 원인 비움)", () => {
    for (const c of ["inheritance", "gift", "carryover_gift"] as const) {
      expect(ex(c, original)).toEqual({ acquisitionCause: undefined, exempted: true, successor: false, priorRuleSuccessor: false });
    }
  });
  it("인가일 당일 취득도 인가일 현재 조합원 — 면제", () => {
    expect(ex("inheritance", { ...original, rightAcquisitionDate: D("2000-09-01") }).exempted).toBe(true);
  });
  it("매매 등 다른 취득 원인 · 조합원 갈래가 아닌 자산 → 입력을 그대로 돌려준다(면제 아님)", () => {
    expect(ex("purchase", original)).toEqual({ acquisitionCause: "purchase", exempted: false, successor: false, priorRuleSuccessor: false });
    expect(ex(undefined, original).exempted).toBe(false);
    expect(ex("inheritance", undefined)).toEqual({ acquisitionCause: "inheritance", exempted: false, successor: false, priorRuleSuccessor: false });
  });
  it("불성립 유지 — 인가일 뒤 취득인데 승계 표시가 없는 모순 · 취득일 없음(「모름」=불성립) (토지만 출자는 L16에서 면제로 바뀜 — nh99-l16 anchor)", () => {
    expect(ex("inheritance", { ...original, rightAcquisitionDate: D("2000-09-02") }).exempted).toBe(false);
    expect(ex("inheritance", { ...original, rightAcquisitionDate: undefined }).exempted).toBe(false);
    expect(ex("inheritance", { ...original, approvalDate: undefined }).exempted).toBe(false);
  });
  it("승계조합원 — 준공일(사용승인일) 이전 상속·증여는 면제 · 이후는 완성된 신축주택을 받은 것이라 불성립 유지(서일46014-11107)", () => {
    // 승계일 1998-08-01 ≤ 2001-12-31 → priorRuleSuccessor는 §99의3 소비자용 사실(§99는 읽지 않는다 · L16)
    expect(ex("inheritance", successor)).toEqual({ acquisitionCause: undefined, exempted: true, successor: true, priorRuleSuccessor: true });
    expect(ex("gift", { ...successor, rightAcquisitionDate: D("1999-03-01") }).exempted).toBe(true);
    expect(ex("inheritance", { ...successor, rightAcquisitionDate: D("1999-03-02") }).exempted).toBe(false);
    expect(ex("inheritance", { ...successor, completionDate: undefined }).exempted).toBe(false);
  });
});

describe("redevMemberNewHouseOf — 조합원 지위 시점 사실을 싣는다", () => {
  it("취득일·인가일·승계 여부", () => {
    const m = redevMemberNewHouseOf({ subject: "apt", originalAssetType: "housing", approvalDate: D("2000-09-01"), completionDate: D("2002-05-25") }, D("1996-03-01"));
    expect(m).toMatchObject({ houseContributed: true, isSuccessorMember: false, rightAcquisitionDate: D("1996-03-01"), approvalDate: D("2000-09-01") });
    expect(redevMemberNewHouseOf({ subject: "apt", isSuccessorMember: true }, D("2002-08-01"))).toMatchObject({ houseContributed: false, isSuccessorMember: true });
  });
});

describe("withRedevMemberGateNotice — 「확인 필요」 고지는 면제로 적용된 결과에만", () => {
  const gate = { acquisitionCause: undefined, exempted: true, successor: false, priorRuleSuccessor: false } as const;
  const d = (isEligible: boolean, warnings?: string[]): { isEligible: boolean; warnings?: string[] } => ({ isEligible, warnings });
  it("적격이면 붙인다 · 정면 해석례 없음 · 기존 warnings 보존", () => {
    const r = withRedevMemberGateNotice(d(true, ["기존"]), gate, "new_99_3");
    expect(r.warnings?.[0]).toBe("기존");
    expect(r.warnings?.[1]).toMatch(/^확인 필요: 종전주택을 상속·증여로 취득했으나 관리처분계획 인가일 전부터 조합원이므로/);
    expect(r.warnings?.[1]).toContain("정면으로 다룬 해석례는 확인하지 못했습니다");
    expect(r.warnings?.[1]).toContain("조특법 §99의3①2호");
    expect(r.warnings?.[1]).not.toMatch(/유리|불리|절감/);
  });
  it("불성립이거나 면제가 아니면 붙이지 않는다 · 승계는 문구가 다르다", () => {
    expect(withRedevMemberGateNotice(d(false), gate, "new_99_3").warnings).toBeUndefined();
    expect(withRedevMemberGateNotice(d(true), { ...gate, exempted: false }, "new_99").warnings).toBeUndefined();
    const s = withRedevMemberGateNotice(d(true), { ...gate, successor: true }, "new_99");
    expect(s.warnings?.[0]).toContain("§99는 인가일 요건이 없음");
    expect(s.warnings?.[0]).toContain("조특법 §99①1호");
  });
});

/* ── 엔진 Step C.5 · STEP 0.45 배선 (mock 세율 — 정본 세액 아님) ───────────────────────── */
const rates = makeMockRates();
const R993 = {
  type: "new_99_3" as const, standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 160_000_000, standardPriceAtTransfer993: 250_000_000,
  region993: "outside_speculation" as const, remainderContract993: "yes" as const, previousHouseStdPrice993: 80_000_000,
};
/** 원조합원 완공 아파트 — 종전주택 취득 2000-03-01 · case44 인가일(`approvalDate`) 이전이어야 원조합원이다. */
function redevApt(over: Partial<TransferTaxInput> = {}, redevOver: Record<string, unknown> = {}): TransferTaxInput {
  const base = case44RedevelopmentInfo();
  return baseTransferInput({
    propertyType: "redevelopment_apt", transferPrice: 525_000_000, transferDate: new Date("2026-02-16"), acquisitionDate: new Date("2005-04-09"),
    acquisitionPrice: 0, expenses: 0, useEstimatedAcquisition: true, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
    redevelopment: { ...base, completionDate: new Date("2012-06-01"), ...redevOver },
    reductions: [R993] as unknown as TransferTaxInput["reductions"],
    ...over,
  });
}

describe("Step C.5 — 원조합원이 종전주택을 상속·증여로 취득 (L14 Q-1 a)", () => {
  it("인가일 전 상속 → 매매와 같은 감면 적용(세액 동일) + 「확인 필요」 고지 · 감면 미선택 대조보다 낮다", () => {
    const approval = (redevApt().redevelopment as { approvalDate: Date }).approvalDate;
    const before = new Date(approval.getTime() - 86_400_000 * 400);
    const inh = calculateTransferTax(redevApt({ acquisitionCause: "inheritance", decedentAcquisitionDate: new Date("1990-01-01"), acquisitionDate: before }), rates);
    const pur = calculateTransferTax(redevApt({ acquisitionDate: before }), rates);
    expect(inh.new993Detail?.isEligible).toBe(true);
    expect(inh.new993Detail?.warnings?.some((w) => w.includes("정면으로 다룬 해석례는 확인하지 못했습니다"))).toBe(true);
    expect(pur.new993Detail?.warnings?.some((w) => w.includes("정면으로 다룬 해석례는 확인하지 못했습니다")) ?? false).toBe(false);
    expect(inh.new993Detail?.reducibleTransferIncome).toBe(pur.new993Detail?.reducibleTransferIncome);
    expect(inh.new993Detail?.reducibleTransferIncome).toBeGreaterThan(0);
  });
});

describe("STEP 0.45 — 원조합원 상속 × 중과 배제 (mock 세율 · 3주택 · 조정대상지역 · 양도 2021-09-01)", () => {
  const houseRates = makeMockRatesWithHouseEngine();
  const h = (id: string, acq: string) => ({ id, region: "capital", acquisitionDate: new Date(acq), officialPrice: 800_000_000, isInherited: false, isLongTermRental: false });
  const surcharge = (over: Partial<TransferTaxInput>, red = true) =>
    ({
      ...redevApt({ transferDate: new Date("2021-09-01"), ...over }), isOneHousehold: true, householdHousingCount: 3, isRegulatedArea: true, wasRegulatedAtAcquisition: false,
      sellingHouseId: "s", houses: [h("s", "2000-03-01"), h("h2", "2015-01-01"), h("h3", "2015-01-01")], reductions: (red ? [R993] : []) as unknown as TransferTaxInput["reductions"],
    }) as TransferTaxInput;
  const reasons = (r: ReturnType<typeof calculateTransferTax>) => (r.multiHouseSurchargeEvaluation?.exclusionReasons ?? []).map((e: { type: string }) => e.type);
  const earlier = () => new Date("2000-03-01");

  it("상속 원조합원 — Step C.5와 같은 판정으로 중과 배제 (수정 전: 감면 불성립 + 중과 유지)", () => {
    const r = calculateTransferTax(surcharge({ acquisitionCause: "inheritance", decedentAcquisitionDate: new Date("1990-01-01"), acquisitionDate: earlier() }), houseRates);
    expect(r.new993Detail?.isEligible).toBe(true);
    expect(reasons(r)).toEqual(["tax_special_exemption"]);
  });
  it("짝 — 매매 원조합원은 종전과 같이 배제 · 세액은 상속과 같다", () => {
    const inh = calculateTransferTax(surcharge({ acquisitionCause: "inheritance", decedentAcquisitionDate: new Date("1990-01-01"), acquisitionDate: earlier() }), houseRates);
    const pur = calculateTransferTax(surcharge({ acquisitionDate: earlier() }), houseRates);
    expect(reasons(pur)).toEqual(["tax_special_exemption"]);
    expect(inh.totalTax).toBe(pur.totalTax);
  });
  it("짝 — 감면 미선택이면 상속은 중과 유지(대조)", () => {
    const r = calculateTransferTax(surcharge({ acquisitionCause: "inheritance", decedentAcquisitionDate: new Date("1990-01-01"), acquisitionDate: earlier() }, false), houseRates);
    expect(reasons(r)).not.toContain("tax_special_exemption");
    expect(r.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(true);
  });
});
