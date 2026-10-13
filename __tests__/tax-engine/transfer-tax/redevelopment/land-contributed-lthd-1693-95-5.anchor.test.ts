/**
 * 토지만 출자한 원조합원 완공APT — 기존건물분 장기보유특별공제율 (사용자 결정 2026-10-12 · ⓐ 사용승인일 · ⓑ 방법 1 · ⓒ §95⑤ 유추).
 *
 * 영 §166⑤2호나목은 기존건물분 보유기간을 토지 취득일부터 세지만, 사용승인 전에는 「주택」이 없었다. 종전 엔진은 그 기간 전부에
 * 표2(1세대1주택)를 줬다.
 *   · 2024-12-31 이전 양도 — 재산세과-1693(2009.08.17.): 「표1(토지 전체 보유기간)」과 「주택의 보유기간에 따른 표2」 중 큰 공제율.
 *     표2 주택 보유기간 = 사용승인일부터(ⓐ), 표2는 보유분 + 거주분 전체로 표1과 비교(ⓑ 방법 1).
 *   · 2025-01-01 이후 양도 — 「소득세법」 §95⑤·⑥ 유추(ⓒ): 사용승인 전 기간 표1 + 사용승인 후 기간 표2 보유분(합계 40% 한도) + 표2 거주분.
 *
 * 시료(mock 세율): 15억 · 1세대1주택 · 비조정 · 인가 2016-03-01 · 사용승인 2019-06-01 · 신축 거주 30개월(2년) · 청산금 납부.
 *
 * | 토지 취득 → 양도 | 기존건물분 전 → 후 | 청산금분 | 세액 |
 * |---|---|---|---|
 * | 2005 → 2024-06-01 | 48% → 30% (표1 30% > 표2 28%) | 40% → 28% | 35,081,844 → 51,646,535 |
 * | 2015 → 2024-06-01 | 44% → 28% (표2 28% > 표1 18%) | 40% → 28% | 37,766,072 → 53,103,688 |
 * | 2005 → 2025-06-01 | 48% (28 + 24 → 40 한도 + 거주 8) 불변 | 44% → 32% | 33,872,952 → 37,499,628 |
 * | 2015 → 2025-06-01 | 48% → 40% (8 + 24 + 거주 8) | 44% → 32% | 33,872,952 → 43,048,262 |
 *
 * 청산금 납부분(§166⑤2호가목)은 종전에 인가일부터 셌다(사용자 결정 2026-10-13: 토지만 출자한 원조합원은 사용승인 전에는 토지뿐이라
 * 청산금분도 **사용승인일 이후에야 주택** — 표2일 때 기산일 = 사용승인일). 청산금분 양도차익 78,499,482 · 사용승인 2019-06-01(5년) ·
 * 거주 30개월 → 보유 5×4% + 거주 8% = 28%(2025-06-01 양도는 6×4% + 8% = 32%).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { landContributedExistingLthdRate } from "@/lib/tax-engine/redevelopment-lthd";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

function apt(origin: "land" | "housing", acq: string, transfer: string, over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 1_500_000_000,
    transferDate: D(transfer),
    acquisitionDate: D(acq),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    redevelopment: {
      subject: "apt",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: D("2016-03-01"),
      rightsValue: 250_000_000,
      settlementDirection: "pay",
      settlementAmount: 136_000_000,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: origin,
      completionDate: D("2019-06-01"),
      newHouseResidenceMonths: 30,
    } as RedevelopmentInfo,
    ...over,
  } as Partial<TransferTaxInput>);
}

const calc = (i: TransferTaxInput) => calculateTransferTax(i, rates);
const pct = (r: number | undefined) => Math.round((r ?? 0) * 100);

describe("2024-12-31 이전 양도 — 재산세과-1693: max(표1 토지 전체, 표2 사용승인 후)", () => {
  it("★ 토지 2005 → 표1 30% > 표2 28% → 30% (전 48% · 35,081,844 → 후 청산금분 포함 51,646,535)", () => {
    const r = calc(apt("land", "2005-01-01", "2024-06-01"));
    const d = r.redevelopmentDetail!;
    expect(pct(d.preApproval.lthdRate)).toBe(30);
    expect(pct(d.postApprovalExistingHouse.lthdRate)).toBe(30);
    expect(r.totalTax).toBe(51_646_535);
    const step = r.steps.find((s) => s.label === "인가전 분 장기보유공제")?.formula ?? "";
    expect(step).toContain("재산세과-1693");
    expect(step).toContain("표1(토지 보유 19년) 30%");
    expect(step).toContain("표2(사용승인 후 5년 + 거주) 28%");
  });

  it("★ 토지 2015 → 표2 28% > 표1 18% → 28% (전 44% · 37,766,072 → 후 청산금분 포함 53,103,688)", () => {
    const r = calc(apt("land", "2015-01-01", "2024-06-01"));
    expect(pct(r.redevelopmentDetail!.preApproval.lthdRate)).toBe(28);
    expect(r.totalTax).toBe(53_103_688);
  });

});

describe("청산금 납부분 — 토지만 출자한 원조합원의 표2는 사용승인일 이후만 주택 (사용자 결정 2026-10-13)", () => {
  const settle = (i: TransferTaxInput) => calc(i).redevelopmentDetail!.settlement;
  const iso = (d: Date | undefined) => d?.toISOString().slice(0, 10);

  it("🔑 기산일 = 사용승인일(2019-06-01) · 5년 보유 20% + 거주 2년 8% = 28% (종전: 인가 2016-03-01부터 8년 → 40%)", () => {
    const s = settle(apt("land", "2005-01-01", "2024-06-01"));
    expect(pct(s.lthdRate)).toBe(28);
    expect(s.holdingMonths).toBe(60);
    expect(s.lthd).toBe(21_979_854);
    // 신고서 표시 기산일도 같은 값 — 계산과 표시가 어긋나면 신고서가 틀린다
    expect(iso(s.branchAcqDate)).toBe("2019-06-01");
    // 왜 5년인지 단계 화면이 말한다 — 인가일 8년으로 읽히면 사용자가 계산 오류로 오해한다
    const step = calc(apt("land", "2005-01-01", "2024-06-01")).steps.find((x) => x.label === "청산금 분 장기보유공제")?.formula ?? "";
    expect(step).toContain("청산금분은 사용승인일(2019-06-01)부터 주택으로 보아 보유기간을 셉니다");
  });
  it("2025-01-01 이후 양도도 같은 기산일 — 6년 24% + 거주 8% = 32%", () => {
    const s = settle(apt("land", "2005-01-01", "2025-06-01"));
    expect(pct(s.lthdRate)).toBe(32);
    expect(s.lthd).toBe(25_119_834);
  });
  it("거주 36개월이면 거주분 12% → 20% + 12% = 32%", () => {
    expect(pct(settle(apt("land", "2005-01-01", "2024-06-01", { redevelopment: { ...apt("land", "2005-01-01", "2024-06-01").redevelopment!, newHouseResidenceMonths: 36 } })).lthdRate)).toBe(32);
  });
  it("부정 짝 — 거주 12개월(표1 강등)이면 「주택」 개념이 걸리지 않아 인가일 기산 그대로 · 신고서 기산일도 인가일", () => {
    const i = apt("land", "2005-01-01", "2024-06-01");
    const s = settle({ ...i, redevelopment: { ...i.redevelopment!, newHouseResidenceMonths: 12 } });
    expect(pct(s.lthdRate)).toBe(16);
    expect(s.holdingMonths).toBe(99);
    expect(iso(s.branchAcqDate)).toBe("2016-03-01");
  });
  it("부정 짝 — 주택 출자 원조합원은 종전 그대로(인가일 기산 · §154⑧1호 통산)", () => {
    const s = settle(apt("housing", "2005-01-01", "2024-06-01"));
    expect(s.holdingMonths).toBe(99);
    expect(iso(s.branchAcqDate)).toBe("2016-03-01");
  });
  it("입력 오류 방어 — 사용승인일이 인가일 앞이거나 양도일 뒤면 인가일 기산(⑧·⑫가 먼저 막지만 엔진이 음수 기간을 만들지 않는다)", () => {
    const i = apt("land", "2005-01-01", "2024-06-01");
    for (const bad of ["2015-01-01", "2025-01-01"]) {
      const s = settle({ ...i, redevelopment: { ...i.redevelopment!, completionDate: D(bad) } });
      expect(iso(s.branchAcqDate)).toBe("2016-03-01");
      expect(s.holdingMonths).toBe(99);
    }
  });
  it("부정 짝 — 사용승인일 미입력이면 인가일 기산(토지 출자 판정 자체가 사용승인일을 요구한다)", () => {
    const i = apt("land", "2005-01-01", "2024-06-01");
    const s = settle({ ...i, redevelopment: { ...i.redevelopment!, completionDate: undefined } });
    expect(iso(s.branchAcqDate)).toBe("2016-03-01");
  });
});

describe("2025-01-01 이후 양도 — 「소득세법」 §95⑤ 유추: 표1(사용승인 전) + 표2 보유(사용승인 후) ≤ 40% + 표2 거주", () => {
  it("★ 토지 2015 → 4년 표1 8% + 6년 표2 24% = 32% + 거주 8% = 40% (전 48% · 33,872,952 → 후 청산금분 포함 43,048,262)", () => {
    const r = calc(apt("land", "2015-01-01", "2025-06-01"));
    expect(pct(r.redevelopmentDetail!.preApproval.lthdRate)).toBe(40);
    expect(r.totalTax).toBe(43_048_262);
    const step = r.steps.find((s) => s.label === "인가전 분 장기보유공제")?.formula ?? "";
    expect(step).toContain("사용승인 전 4년 표1 8% + 사용승인 후 6년 표2 24% = 보유 32% + 거주 8%");
    expect(step).toContain("§95⑤ 유추");
  });

  it("토지 2005 → 14년 표1 28% + 6년 표2 24% = 52% → 한도 40% + 거주 8% = 48% (기존건물분 불변 · 청산금분 변경으로 세액 37,499,628)", () => {
    const r = calc(apt("land", "2005-01-01", "2025-06-01"));
    expect(pct(r.redevelopmentDetail!.preApproval.lthdRate)).toBe(48);
    expect(r.totalTax).toBe(37_499_628);
    expect(r.steps.find((s) => s.label === "인가전 분 장기보유공제")?.formula).toContain("보유 40%(한도 40%)");
  });

  it("경계 — 2024-12-31 양도는 1693, 2025-01-01 양도는 §95⑤", () => {
    const before = landContributedExistingLthdRate({ acquisitionDate: D("2015-01-01"), completionDate: D("2019-06-01"), transferDate: new Date("2024-12-31T00:00:00"), residenceYears: 2 })!;
    const after = landContributedExistingLthdRate({ acquisitionDate: D("2015-01-01"), completionDate: D("2019-06-01"), transferDate: new Date("2025-01-01T00:00:00"), residenceYears: 2 })!;
    expect(before.basis).toContain("재산세과-1693");
    expect(after.basis).toContain("§95⑤");
  });
});

describe("검증 반영 — 표1 하한 · 적용 표 이름 · 근거 문구 소거", () => {
  it("§95⑤ 유추가 표1(토지 전체)보다 낮으면 표1 — 토지 2019-07 · 사용승인 2022-04 · 양도 2025-03 · 거주 2년", () => {
    const r = landContributedExistingLthdRate({
      acquisitionDate: D("2019-07-01"),
      completionDate: D("2022-04-01"),
      transferDate: D("2025-03-01"),
      residenceYears: 2,
    })!;
    // 유추: 2년 표1 0% + 2년 표2 0% + 거주 8% = 8% < 표1 5년 10%
    expect(Math.round(r.total * 100)).toBe(10);
    expect(r.residence).toBe(0);
    expect(r.basis).toContain("표1(토지 보유 5년) 10%가 커 표1 적용");
  });

  it("표2가 30% 이하로 이겨도 적용 표는 표2 — 토지 2015 → 2024-06 (28%)", () => {
    const d = calc(apt("land", "2015-01-01", "2024-06-01")).redevelopmentDetail!;
    expect(pct(d.preApproval.lthdRate)).toBe(28);
    expect(d.lthdResidenceAttribution?.existingTable).toBe("table2");
  });

  it("표1이 이기면 적용 표는 표1 — 토지 2005 → 2024-06 (30%)", () => {
    expect(calc(apt("land", "2005-01-01", "2024-06-01")).redevelopmentDetail!.lthdResidenceAttribution?.existingTable).toBe(
      "table1",
    );
  });

  it("장기보유공제 배제(미등기)면 공제율 선택 근거도 지운다", () => {
    const r = calc(apt("land", "2015-01-01", "2024-06-01", { isUnregistered: true } as Partial<TransferTaxInput>));
    expect(r.redevelopmentDetail!.preApproval.lthdRate).toBe(0);
    expect(r.redevelopmentDetail!.preApproval.lthdRateBasis).toBeUndefined();
    expect(r.steps.some((s) => (s.formula ?? "").includes("재산세과-1693"))).toBe(false);
  });
});

describe("대조·부정 짝", () => {
  it("주택 출자 원조합원은 종전 그대로(§154⑧1호 통산 · 전 기간 표2)", () => {
    expect(pct(calc(apt("housing", "2005-01-01", "2024-06-01")).redevelopmentDetail!.preApproval.lthdRate)).toBe(48);
    expect(pct(calc(apt("housing", "2015-01-01", "2025-06-01")).redevelopmentDetail!.preApproval.lthdRate)).toBe(48);
    expect(calc(apt("housing", "2005-01-01", "2024-06-01")).steps.some((s) => (s.formula ?? "").includes("재산세과-1693"))).toBe(false);
  });

  it("표2 대상이 아니면(거주 2년 미만) 표1 그대로 — 이 규칙이 걸리지 않는다", () => {
    const i = apt("land", "2005-01-01", "2024-06-01");
    i.redevelopment = { ...i.redevelopment!, newHouseResidenceMonths: 12 };
    const r = calc(i);
    expect(pct(r.redevelopmentDetail!.preApproval.lthdRate)).toBe(30);
    expect(r.redevelopmentDetail!.preApproval.lthdRateBasis).toBeUndefined();
  });

  it("사용승인일이 취득일 이전(입력 오류)이면 leaf는 undefined — 호출부가 종전 식", () => {
    expect(
      landContributedExistingLthdRate({ acquisitionDate: D("2020-01-01"), completionDate: D("2019-06-01"), transferDate: D("2024-06-01"), residenceYears: 2 }),
    ).toBeUndefined();
  });
});
