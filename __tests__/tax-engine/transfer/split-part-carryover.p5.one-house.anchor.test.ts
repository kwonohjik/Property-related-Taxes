/**
 * P5 — 주택 split 파트 이월과세 × 1세대1주택 비과세: 「소득세법」 §97의2②2호 판정 anchor (2026-10-21)
 *
 * 계획: docs/00-pm/transfer-split-part-carryover-p5.plan.md §3(실측)·§6(결정 Q1~Q5)
 *
 * 결정:
 *   · Q1 주택 일체 — 적격 파트 전부 적용(AA)이면 §89①3호에 해당하고 전부 미적용(BB)이면 해당하지 않을 때(상태 변화) 모든 적격 파트에 ①을 적용하지 않는다.
 *   · Q2 「해당」은 건물·토지 각각 — 나중에 취득한 토지만 보유요건에 미달해 토지분만 과세되는 G-3도 상태 변화로 센다.
 *   · Q4 배우자 예외는 통째 증여(C)만.
 *   · Q5 「취득 당시」 조정대상지역·경과규정 판정일 = 자산 단위와 같은 leaf(`giftHouseholdBasis`).
 * 시드는 계획서 §3 probe 격자 그대로(양도일 2025-06-30 · 1주택 · 거주 120개월 · 비조정). mock 세율이라 같은 시드끼리 상대 비교만 의미가 있다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { composeSplitCarryover } from "@/lib/tax-engine/transfer-split-carryover-compose";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { splitCarryoverNotices, splitCarryoverVerdictText, splitCarryoverView } from "@/lib/tax-engine/transfer-tax-split-carryover-display";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

const AX = { "8": { land: 480_000_000, bldg: 320_000_000 }, "15": { land: 900_000_000, bldg: 600_000_000 } } as const;
type Axis = keyof typeof AX;

interface Cell {
  axis: Axis;
  bldgDate: string;
  bldgCause: "purchase" | "carryover_gift";
  bldgPrice: number;
  landDate: string;
  landCause: "purchase" | "carryover_gift";
  landPrice: number;
  landPart?: { donorDate: string; donorPrice: number };
  bldgPart?: { donorDate: string; donorPrice: number };
  gift: { date: string; tax: number; base: number };
  event?: Record<string, unknown>;
  regulated?: boolean;
  residenceMonths?: number;
  isOneHousehold?: boolean;
}

function mk(c: Cell): TransferTaxInput {
  const a = AX[c.axis];
  const wire = composeSplitCarryover({
    carryoverGiftEvent: { giftRegistryDate: c.gift.date, giftTaxCalculated: c.gift.tax, giftTaxBase: c.gift.base, donorRelation: "lineal", ...c.event },
    landCarryoverPart: c.landPart ? { donorAcquisitionDate: c.landPart.donorDate, donorAcquisitionPrice: c.landPart.donorPrice } : undefined,
    buildingCarryoverPart: c.bldgPart ? { donorAcquisitionDate: c.bldgPart.donorDate, donorAcquisitionPrice: c.bldgPart.donorPrice } : undefined,
    landAcquisitionPrice: c.landPrice,
    buildingAcquisitionPrice: c.bldgPrice,
  });
  return baseTransferInput({
    transferPrice: a.land + a.bldg,
    transferDate: D("2025-06-30"),
    acquisitionPrice: 0,
    acquisitionDate: D(c.bldgDate),
    acquisitionCause: c.bldgCause,
    isOneHousehold: c.isOneHousehold ?? true,
    householdHousingCount: 1,
    residencePeriodMonths: c.residenceMonths ?? 120,
    wasRegulatedAtAcquisition: c.regulated ?? false,
    landAcquisitionDate: D(c.landDate),
    landAcquisitionCause: c.landCause,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    saleSplitMode: "actual",
    landTransferPrice: a.land,
    buildingTransferPrice: a.bldg,
    landStandardPriceAtTransfer: a.land,
    buildingStandardPriceAtTransfer: a.bldg,
    landAcquisitionPrice: c.landPrice,
    buildingAcquisitionPrice: c.bldgPrice,
    isSeparateAcquisition: c.landDate !== c.bldgDate,
    ...wire,
  });
}

const big = (axis: Axis) => axis === "15";
/** A1 — 건물 매매 2022-06-01(3년) / 토지 증여 2024-06-15(1년), 증여자 2005-01-01(20년) */
const A1 = (axis: Axis, over: Partial<Cell> = {}): Cell => ({
  axis, bldgDate: "2022-06-01", bldgCause: "purchase", bldgPrice: big(axis) ? 350_000_000 : 200_000_000,
  landDate: "2024-06-15", landCause: "carryover_gift", landPrice: big(axis) ? 500_000_000 : 300_000_000,
  landPart: { donorDate: "2005-01-01", donorPrice: 100_000_000 }, gift: { date: "2024-06-15", tax: 20_000_000, base: big(axis) ? 500_000_000 : 300_000_000 },
  ...over,
});
/** A2 — 건물 매매 2021-03-01 / 토지 증여 2023-03-01(2년 4개월) — 이미 둘 다 2년 이상 */
const A2 = (axis: Axis): Cell => ({
  axis, bldgDate: "2021-03-01", bldgCause: "purchase", bldgPrice: big(axis) ? 350_000_000 : 200_000_000,
  landDate: "2023-03-01", landCause: "carryover_gift", landPrice: big(axis) ? 500_000_000 : 300_000_000,
  landPart: { donorDate: "2000-01-01", donorPrice: 100_000_000 }, gift: { date: "2023-03-01", tax: 20_000_000, base: big(axis) ? 500_000_000 : 300_000_000 },
});
/** B1(2년 4개월)·B2(1년) — 건물 증여, 증여자 2015-06-01 / 토지 매매 2008-01-01 */
const Bx = (axis: Axis, gift: string, over: Partial<Cell> = {}): Cell => ({
  axis, bldgDate: gift, bldgCause: "carryover_gift", bldgPrice: big(axis) ? 400_000_000 : 200_000_000,
  landDate: "2008-01-01", landCause: "purchase", landPrice: 120_000_000,
  bldgPart: { donorDate: "2015-06-01", donorPrice: 100_000_000 }, gift: { date: gift, tax: 20_000_000, base: big(axis) ? 400_000_000 : 200_000_000 },
  ...over,
});
/** C1(2년 4개월)·C2(1년) — 통째 증여, 증여자 토지 1995-03-01 / 건물 2015-06-01 */
const Cx = (axis: Axis, gift: string, over: Partial<Cell> = {}): Cell => ({
  axis, bldgDate: gift, bldgCause: "carryover_gift", bldgPrice: big(axis) ? 450_000_000 : 200_000_000,
  landDate: gift, landCause: "carryover_gift", landPrice: big(axis) ? 400_000_000 : 200_000_000,
  landPart: { donorDate: "1995-03-01", donorPrice: 50_000_000 }, bldgPart: { donorDate: "2015-06-01", donorPrice: 50_000_000 },
  gift: { date: gift, tax: 30_000_000, base: big(axis) ? 850_000_000 : 400_000_000 },
  ...over,
});
/** X2 — 토지만 · 증여자 토지 취득가 1백만(이월과세를 적용하면 더 비싸다) */
const X2: Cell = {
  axis: "15", bldgDate: "2022-06-01", bldgCause: "purchase", bldgPrice: 590_000_000,
  landDate: "2024-06-15", landCause: "carryover_gift", landPrice: 890_000_000,
  landPart: { donorDate: "2005-01-01", donorPrice: 1_000_000 }, gift: { date: "2024-06-15", tax: 20_000_000, base: 890_000_000 },
};

const run = (c: Cell) => calculateTransferTax(mk(c), rates);
const parts = (r: ReturnType<typeof run>) => ({ land: r.splitDetail?.land.carryover, building: r.splitDetail?.building.carryover });

describe("②2호 발동 — 이월과세를 적용해야 비로소 1세대1주택(딸린 토지 포함) 양도가 되면 모든 적격 파트 미적용", () => {
  it.each([
    ["A1 8억 — 토지분만 뒤집힌다(토B는 G-3로 토지만 과세)", A1("8"), 106_500_000],
    ["A1 15억 — 고가 부분 비과세 둘 다지만 토지분이 뒤집힌다(Q2 각각)", A1("15"), 240_840_000],
    ["B2 8억 — 건물 증여 1년", Bx("8", "2024-06-15"), 221_700_000],
    ["B2 15억", Bx("15", "2024-06-15"), 446_100_000],
    ["C2 8억 — 주택 일체(Q1): ②3호만이면 AB 244,800,000", Cx("8", "2024-06-15"), 238_500_000],
    ["C2 15억 — ②3호만이면 AB 439,570,588", Cx("15", "2024-06-15"), 388_500_000],
    ["X2 15억 — 적용이 더 비싼데(②3호만이면 14,122,560) 토지분이 뒤집혀 ②2호", X2, 4_557_600],
  ])("%s", (_, cell, tax) => {
    const r = run(cell);
    expect(r.determinedTax).toBe(tax);
    expect(r.splitDetail?.carryoverEvent?.oneHouseExclusion).toBe(true);
    for (const e of Object.values(parts(r))) {
      if (!e) continue;
      expect(e.judgment).toBe("excluded");
      expect(e.exclusionReason).toBe("one_house_exemption");
      expect(e.comparison).toBeUndefined(); // ②2호가 걸리면 ②3호 비교를 하지 않는다
      expect(e.giftTaxAddedToExpense).toBe(0);
    }
  });
});

describe("②2호 — 건물만 뒤집히는 셀(적용 세계: 건물 비과세 + 나중 취득 토지만 과세 G-3)", () => {
  // B · 토지 매매 2024-01-01(1년 6개월) · 건물 증여 2024-06-15(증여자 2015-06-01). 적용(AA)이면 건물 취득일이 2015라 토지가 «나중 취득 + 2년 미만» → 토지분만 과세,
  // 건물은 전액 비과세 대상(`isExemptCore` — 조기반환하지 않아 isExempt·isPartialExempt가 둘 다 false). 미적용(BB)이면 건물 1년 → 주택 전체 과세.
  // 토지 상태는 두 세계 모두 «해당 아님»이라 건물 상태 항과 `isExemptCore`만이 이 발동을 만든다.
  const cell = () => Bx("8", "2024-06-15", { landDate: "2024-01-01" });
  it("AA 세계는 isExemptCore(건물 비과세 대상)이고 토지분만 과세된다", () => {
    const input = mk(cell());
    const aa = calculateTransferTax({
      ...input,
      acquisitionCause: "purchase",
      acquisitionDate: D("2015-06-01"),
      landAcquisitionCause: undefined,
      buildingAcquisitionPrice: 100_000_000,
      carryoverGiftEvent: undefined,
      buildingCarryoverTaxation: undefined,
      isSeparateAcquisition: true,
    }, rates);
    expect(aa.isExempt).toBe(false);
    expect(aa.isPartialExempt).toBeFalsy();
    expect(aa.isExemptCore).toBe(true);
  });
  it("발동 → 건물 미적용(one_house_exemption)", () => {
    const r = run(cell());
    expect(r.splitDetail?.carryoverEvent?.oneHouseExclusion).toBe(true);
    expect(r.splitDetail?.building.carryover?.exclusionReason).toBe("one_house_exemption");
    expect(r.determinedTax).toBeGreaterThan(0);
  });
});

describe("②2호 미발동 — 이월과세 없이도 이미 1세대1주택이면(0374) 이월과세를 그대로 두고 ②3호로 간다", () => {
  it.each([
    ["A2 8억 — 둘 다 전액 비과세, 동률 A", A2("8"), 0, "applied"],
    ["A2 15억 — 둘 다 고가, ②3호 B", A2("15"), 19_385_000, "excluded"],
    ["B1 8억", Bx("8", "2023-03-01"), 0, "applied"],
    ["B1 15억 — ②3호 B", Bx("15", "2023-03-01"), 35_905_000, "excluded"],
    ["C1 8억", Cx("8", "2023-03-01"), 0, "applied"],
  ])("%s", (_, cell, tax, landOrBuilding) => {
    const r = run(cell);
    expect(r.determinedTax).toBe(tax);
    expect(r.splitDetail?.carryoverEvent?.oneHouseExclusion).toBeUndefined();
    const e = parts(r).land ?? parts(r).building;
    expect(e!.judgment).toBe(landOrBuilding);
    if (landOrBuilding === "excluded") expect(e!.exclusionReason).toBe("tax_comparison");
  });

  it("C1 15억 — 비과세 판정이 모두 같으면 종전 ②3호 순차 고정점(AB) 그대로", () => {
    const r = run(Cx("15", "2023-03-01"));
    expect(r.determinedTax).toBe(35_143_235);
    expect(parts(r).land!.judgment).toBe("applied");
    expect(parts(r).building!.judgment).toBe("excluded");
  });
});

describe("배우자 예외(Q4) — 증여일 현재 1세대1주택을 배우자로부터 통째로 증여받았으면 ②2호를 적용하지 않는다 (C만)", () => {
  const spouse = { donorRelation: "spouse", spouseGiftOneHouseAtGiftDate: true };

  it("C2 8억 + 배우자 예외 → ②2호 취소 · ②3호(AB 244,800,000) · echo spouseOneHouseExceptionApplied", () => {
    const r = run(Cx("8", "2024-06-15", { event: spouse }));
    expect(r.determinedTax).toBe(244_800_000);
    expect(r.splitDetail?.carryoverEvent?.oneHouseExclusion).toBeUndefined();
    expect(r.splitDetail?.carryoverEvent?.spouseOneHouseExceptionApplied).toBe(true);
  });

  it("관계가 배우자가 아니면 사실이 있어도 예외 없음 → ②2호", () => {
    const r = run(Cx("8", "2024-06-15", { event: { spouseGiftOneHouseAtGiftDate: true } }));
    expect(r.determinedTax).toBe(238_500_000);
    expect(r.splitDetail?.carryoverEvent?.spouseOneHouseExceptionApplied).toBeUndefined();
  });

  it("건물만(B)이면 예외를 적용하지 않는다 — 해석례의 대상은 주택·주택 지분이다(엔진 직접 호출도 같다)", () => {
    const r = run(Bx("8", "2024-06-15", { event: spouse }));
    expect(r.determinedTax).toBe(221_700_000);
    expect(r.splitDetail?.carryoverEvent?.oneHouseExclusion).toBe(true);
  });
});

describe("「취득 당시」 판정일(Q5) — 건물 A도 증여일로 본다(사전-2023-법규재산-0444) · 자산 단위와 같은 leaf", () => {
  // 취득 당시 조정대상지역 + 거주 12개월 + 건물 증여 2024-06-15(증여자 2015-06-01 — 2017.8.3. 전)
  const reg = (donorDate: string) => Bx("8", "2024-06-15", { regulated: true, residenceMonths: 12, bldgPart: { donorDate, donorPrice: 100_000_000 } });

  it("건물 A는 증여자 취득일(2015)이 경과규정 앞이어도 거주요건을 면하지 않는다 — 종전 0원(침묵 비과세)", () => {
    const r = run(reg("2015-06-01"));
    expect(r.determinedTax).toBeGreaterThan(0);
    expect(r.splitDetail?.carryoverEvent?.oneHouseExclusion).toBeUndefined(); // AA도 비과세가 아니다 — 상태 변화 없음
  });

  it("같은 사실에서 증여자 취득일이 2015든 2019든 판정 경로가 같다(날짜 소스가 증여일)", () => {
    const a = run(reg("2015-06-01"));
    const b = run(reg("2019-06-01"));
    expect(a.isExempt).toBe(false);
    expect(b.isExempt).toBe(false);
    expect(a.isPartialExempt).toBeFalsy();
    expect(b.isPartialExempt).toBeFalsy();
  });

  it("계속 같은 세대(세대 보유 시작일 = 증여자 취득일)면 B 세계도 세대 통산으로 비과세 → ②2호 미발동 (조심-2022-서-7583)", () => {
    const sameHousehold = { donorRelation: "spouse", donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: "2015-06-01" };
    const r = run(Bx("8", "2024-06-15", { event: sameHousehold }));
    expect(r.splitDetail?.carryoverEvent?.oneHouseExclusion).toBeUndefined();
    expect(r.determinedTax).toBe(0);
  });
});

describe("회귀 0 — 1세대1주택이 아니면 P5 전과 같다", () => {
  it("C2 8억 isOneHousehold=false — ②2호는 보지 않고 ②3호(비과세 상태가 양쪽 다 거짓)", () => {
    const r = run(Cx("8", "2024-06-15", { isOneHousehold: false }));
    expect(r.splitDetail?.carryoverEvent?.oneHouseExclusion).toBeUndefined();
    expect(r.isExempt).toBe(false);
  });
});

describe("⑦ 결과 문구 — 4뷰 공통 view (P5)", () => {
  it("②2호 발동: 파트 판정에 ②2호 사유 · 고지는 ②2호 판정 방식(확인 필요)만 — ②3호 비교 고지·「세대 사실을 묻지 않았다」는 없다", () => {
    const v = splitCarryoverView(run(Cx("8", "2024-06-15")).splitDetail)!;
    expect(v.oneHouseExclusion).toBe(true);
    for (const p of v.parts) expect(splitCarryoverVerdictText(p)).toContain("§97조의2 ② 2호");
    const notes = splitCarryoverNotices(v);
    expect(notes.some((n) => n.startsWith("②2호(이월과세를 적용해야 비로소"))).toBe(true);
    expect(notes.some((n) => n.startsWith("②3호 비교"))).toBe(false);
    expect(notes.join()).not.toContain("계속 같은 세대였는지는 묻지 않았고");
  });

  it("배우자 예외: ②3호 비교 고지 + ②2호 판정 방식 + 예외 적용 문장", () => {
    const v = splitCarryoverView(run(Cx("8", "2024-06-15", { event: { donorRelation: "spouse", spouseGiftOneHouseAtGiftDate: true } })).splitDetail)!;
    const notes = splitCarryoverNotices(v);
    expect(v.spouseOneHouseExceptionApplied).toBe(true);
    expect(notes.some((n) => n.startsWith("②3호 비교"))).toBe(true);
    expect(notes.some((n) => n.startsWith("②2호(이월과세를 적용해야 비로소"))).toBe(true);
    expect(notes.some((n) => n.startsWith("증여일 현재 1세대1주택이던 주택을 배우자로부터"))).toBe(true);
  });

  it("미발동(이미 비과세): 전액 비과세 조기반환에도 파트 판정 echo가 붙는다 · 고지는 ②3호 비교만", () => {
    const r = run(A2("8"));
    expect(r.isExempt).toBe(true);
    const v = splitCarryoverView(r.splitDetail)!;
    expect(v.parts[0].applied).toBe(true);
    expect(splitCarryoverNotices(v)).toHaveLength(1);
  });
});
