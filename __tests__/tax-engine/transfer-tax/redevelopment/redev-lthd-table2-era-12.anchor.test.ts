/**
 * 재개발 경로 장기보유특별공제 표2 **연혁** — 「소득세법」 §95② 표2는 양도일에 따라 모양이 다르다(`data/lthd-table2-era.ts`).
 *
 * | 양도일 | 표2 | 표2 대상 거주요건 |
 * |---|---|---|
 * | ~2008-12-31 | 미지원(현행 식으로 계산 + 고지) | 현행 식(거주 2년) |
 * | 2009-01-01~2019-12-31 | 보유 3년 이상 연 8%(10년 80%) 단일축 | 없음 |
 * | 2020-01-01~2020-12-31 | 같음 | 거주 2년 |
 * | 2021-01-01~ | 보유 연 4%(40%) + 거주 연 4%(40%) | 거주 2년 |
 *
 * 종전에는 일반 경로만 이 연혁을 따랐고 재개발 경로는 모든 양도일에 현행 식(보유 4% + 거주 4% · 거주 2년)을 썼다 —
 * 2009~2019 양도분의 거주 2년 미만 1세대1주택은 표1(10년 20%)로, 2009~2020 양도분의 거주 2년 이상은 보유 4%(10년 40%)+거주분으로 계산돼
 * 연혁 표(10년 80%)와 어긋났다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { computeLthdRateSplit, redevUsesTable2, usesTable2 } from "@/lib/tax-engine/redevelopment-lthd";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const pct = (r: number | undefined) => Math.round((r ?? 0) * 100);

describe("computeLthdRateSplit — 양도일별 표2 모양", () => {
  it("2009~2019 양도: 보유 연 8%(10년 80%) 단일축 · 거주 0 · 거주 2년 요건 없음", () => {
    const s = computeLthdRateSplit(10, true, 0, 0, D("2018-06-01"));
    expect(s).toMatchObject({ holding: 0.8, residence: 0, total: 0.8, holdingOnly: true });
    expect(computeLthdRateSplit(3, true, 0, 0, D("2018-06-01")).total).toBe(0.24);
    expect(computeLthdRateSplit(12, true, 0, 0, D("2018-06-01")).total).toBe(0.8);
    expect(computeLthdRateSplit(2, true, 0, 0, D("2018-06-01")).total).toBe(0);
  });

  it("2009~2019 양도: 1세대1주택이 아니면 표1", () => {
    const s = computeLthdRateSplit(10, false, 5, 5, D("2018-06-01"));
    expect(s.total).toBe(0.2);
    expect(s.holdingOnly).toBeUndefined();
  });

  it("2020 양도: 단일축 8%이되 거주 2년 요건이 붙는다", () => {
    expect(computeLthdRateSplit(10, true, 1, 1, D("2020-06-01")).total).toBe(0.2); // 거주 1년 → 표1
    const s = computeLthdRateSplit(10, true, 2, 2, D("2020-06-01"));
    expect(s).toMatchObject({ holding: 0.8, residence: 0, total: 0.8, holdingOnly: true });
  });

  it("2021~ 양도: 보유 4% + 거주 4% (종전과 같다)", () => {
    const s = computeLthdRateSplit(10, true, 3, 3, D("2021-03-01"));
    expect(s.holding).toBe(0.4);
    expect(s.residence).toBeCloseTo(0.12, 10);
    expect(s.holdingOnly).toBeUndefined();
    expect(computeLthdRateSplit(10, true, 1, 1, D("2021-03-01")).total).toBe(0.2); // 거주 2년 미만 → 표1
  });

  it("2009-01-01 전 양도(미지원 시기): 현행 식 그대로 — 거주 2년 요건 유지", () => {
    expect(computeLthdRateSplit(10, true, 0, 0, D("2008-12-31")).total).toBe(0.2);
    const s = computeLthdRateSplit(10, true, 3, 3, D("2008-12-31"));
    expect(s.holding).toBe(0.4);
    expect(s.holdingOnly).toBeUndefined();
  });

  it("경계일: 2008-12-31/2009-01-01 · 2019-12-31/2020-01-01 · 2020-12-31/2021-01-01", () => {
    expect(computeLthdRateSplit(10, true, 0, 0, D("2009-01-01")).total).toBe(0.8);
    expect(computeLthdRateSplit(10, true, 0, 0, D("2019-12-31")).total).toBe(0.8);
    expect(computeLthdRateSplit(10, true, 0, 0, D("2020-01-01")).total).toBe(0.2);
    expect(computeLthdRateSplit(10, true, 2, 2, D("2020-12-31")).total).toBe(0.8);
    expect(computeLthdRateSplit(10, true, 2, 2, D("2021-01-01")).total).toBeCloseTo(0.48, 10);
  });

  it("양도일을 안 주면 종전 식(현행)", () => {
    expect(computeLthdRateSplit(10, true, 0, 0).total).toBe(0.2);
    expect(computeLthdRateSplit(10, true, 3, 3).total).toBeCloseTo(0.52, 10);
  });
});

describe("usesTable2 — 연혁별 표2 대상 판정", () => {
  it("2009~2019 양도는 1세대1주택이면 거주 0이어도 표2 대상", () => {
    expect(usesTable2(true, 0, D("2018-06-01"))).toBe(true);
    expect(usesTable2(false, 5, D("2018-06-01"))).toBe(false);
  });
  it("2020~·미지원·양도일 없음은 거주 2년 요건", () => {
    expect(usesTable2(true, 1, D("2020-06-01"))).toBe(false);
    expect(usesTable2(true, 2, D("2020-06-01"))).toBe(true);
    expect(usesTable2(true, 0, D("2008-06-01"))).toBe(false);
    expect(usesTable2(true, 0)).toBe(false);
  });
});

function apt(acq: string, transfer: string, over: Partial<RedevelopmentInfo> = {}, top: Partial<TransferTaxInput> = {}): TransferTaxInput {
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
      approvalDate: D("2012-03-01"),
      rightsValue: 250_000_000,
      settlementDirection: "pay",
      settlementAmount: 136_000_000,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: "housing",
      completionDate: D("2015-06-01"),
      ...over,
    } as RedevelopmentInfo,
    ...top,
  } as Partial<TransferTaxInput>);
}
const calc = (i: TransferTaxInput) => calculateTransferTax(i, rates);

describe("완공 APT 양도(주택 출자 원조합원) — 양도일별 공제율", () => {
  it("★ 2018-06 양도 · 거주 0개월: 기존건물분 10년 80% · 청산금분 6년 48% (종전: 거주 2년 미만이라 표1 20%·12%)", () => {
    const r = calc(apt("2008-01-01", "2018-06-01"));
    const d = r.redevelopmentDetail!;
    expect(pct(d.preApproval.lthdRate)).toBe(80);
    expect(pct(d.postApprovalExistingHouse.lthdRate)).toBe(80);
    expect(pct(d.settlement.lthdRate)).toBe(48);
    // 보유분 = 총 공제, 거주분 0 — 신고서 보유/거주 분해가 합과 맞는다
    expect(d.preApproval.lthdResidencePart).toBe(0);
    expect(d.preApproval.lthdHoldingPart).toBe(d.preApproval.lthd);
  });

  it("★ 2018-06 양도 · 거주 36개월: 종전은 보유 4%+거주 4%(10년 40%+12%=52%)였다 → 연혁 단일축 80%", () => {
    const r = calc(apt("2008-01-01", "2018-06-01", { newHouseResidenceMonths: 36 }, { residencePeriodMonths: 36 }));
    expect(pct(r.redevelopmentDetail!.preApproval.lthdRate)).toBe(80);
  });

  it("2023-06 양도 · 거주 36개월: 현행 식 52% 불변", () => {
    const r = calc(apt("2008-01-01", "2023-06-01", { newHouseResidenceMonths: 36 }, { residencePeriodMonths: 36 }));
    expect(pct(r.redevelopmentDetail!.preApproval.lthdRate)).toBe(52);
  });

  it("2020-06 양도: 거주 1년이면 표1 · 거주 2년이면 단일축 80%", () => {
    const low = calc(apt("2008-01-01", "2020-06-01", { newHouseResidenceMonths: 12 }, { residencePeriodMonths: 12 }));
    expect(pct(low.redevelopmentDetail!.preApproval.lthdRate)).toBe(24); // 표1 12년 24%
    const ok = calc(apt("2008-01-01", "2020-06-01", { newHouseResidenceMonths: 30 }, { residencePeriodMonths: 30 }));
    expect(pct(ok.redevelopmentDetail!.preApproval.lthdRate)).toBe(80);
  });

  it("결과 카드 적용 표 라벨: 단일축 표2는 표1로 보이지 않는다", () => {
    const r = calc(apt("2008-01-01", "2018-06-01"));
    expect(r.redevelopmentDetail!.lthdResidenceAttribution?.existingTable).toBe("table2");
    expect(r.redevelopmentDetail!.lthdResidenceAttribution?.payTable).toBe("table2");
    // 「보유 + 거주」 라벨이 아니라 「보유만」 — 거주분이 없는 시기다
    expect(r.redevelopmentDetail!.lthdResidenceAttribution?.table2HoldingOnly).toBe(true);
  });

  it("2023 양도 표2 라벨은 「보유 + 거주」 그대로(표지 없음)", () => {
    const r = calc(apt("2008-01-01", "2023-06-01", { newHouseResidenceMonths: 36 }, { residencePeriodMonths: 36 }));
    expect(r.redevelopmentDetail!.lthdResidenceAttribution?.existingTable).toBe("table2");
    expect(r.redevelopmentDetail!.lthdResidenceAttribution?.table2HoldingOnly).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 입주권(right) — 실가·환산 두 경로가 같은 연혁을 본다
// ──────────────────────────────────────────────────────────────────────────────
import { LTHD_TABLE2_UNSUPPORTED_NOTICE } from "@/lib/tax-engine/data/lthd-table2-era";

describe("입주권 양도 — 인가전 분 표2 연혁 (실가 = 환산)", () => {
  const PHD = { housingStdPriceAtAcq: 120_000_000, housingStdPriceAtApproval: 200_000_000 };
  const DECLARED = {
    exemptionEligibleAtApproval: true,
    settlementSaleDate: D("2019-03-01"),
    oneHouseAtSettlementSale: false,
  };
  const ONE_HOUSE = { isOneHousehold: true, householdHousingCount: 0, householdRightCount: 1, householdNoPresaleRightsConfirmed: true };
  function right(transfer: string, over: Partial<TransferTaxInput>, redev: Partial<RedevelopmentInfo> = {}): TransferTaxInput {
    return baseTransferInput({
      propertyType: "right_to_move_in",
      transferPrice: 320_000_000,
      transferDate: D(transfer),
      acquisitionDate: D("2008-04-09"),
      acquisitionPrice: 0,
      expenses: 0,
      residencePeriodMonths: 0,
      redevelopment: {
        subject: "right",
        approvalLawBasis: "urban_renovation_art_74",
        approvalDate: D("2013-10-23"),
        rightsValue: 300_000_000,
        settlementDirection: "receive",
        settlementAmount: 50_000_000,
        preApprovalExpenses: 0,
        postApprovalExpenses: 0,
        originalAssetType: "housing",
        ...redev,
      } as RedevelopmentInfo,
      ...over,
    } as Partial<TransferTaxInput>);
  }
  const actual = { useEstimatedAcquisition: false, acquisitionPrice: 180_000_000, ...ONE_HOUSE };
  /** 고가 입주권(12억 이하 기준 초과) — 공제가 0이 아니어야 표2 안내 고지가 나간다 */
  const HIGH = { ...actual, transferPrice: 1_500_000_000 };
  const HIGH_RIGHT = { rightsValue: 1_000_000_000 };
  const estimated = { useEstimatedAcquisition: true, ...ONE_HOUSE };

  it("★ 2019-03 양도 · 거주 0개월 · 인가전 5년: 표2 연 8% = 40% (종전: 거주 2년 미만이라 표1 10%) — 실가", () => {
    const r = calc(right("2019-03-02", actual, DECLARED));
    expect(pct(r.redevelopmentDetail!.preApproval.lthdRate)).toBe(40);
  });

  it("★ 같은 양도일에 환산 경로도 40% — 취득가액 산정 방식이 표를 가르지 않는다", () => {
    const r = calc(right("2019-03-02", estimated, { ...DECLARED, ...PHD }));
    expect(pct(r.redevelopmentDetail!.preApproval.lthdRate)).toBe(40);
  });

  it("★ 토지만 출자한 입주권 환산 경로(같은 §95② 표2)도 2019-03 양도 40% — 세대원 건물 소유 선언 「예」", () => {
    const r = calc(
      right(
        "2019-03-02",
        { ...estimated },
        {
          ...DECLARED,
          originalAssetType: "land",
          landHouseholdOwnedBuilding: true,
          landStdPriceAtAcq: 100_000_000,
          landStdPriceAtApproval: 200_000_000,
          settlementDirection: "pay",
          settlementAmount: 50_000_000,
        },
      ),
    );
    expect(pct(r.redevelopmentDetail!.preApproval.lthdRate)).toBe(40);
  });

  it("2019 양도 입주권(거주 60개월): 「거주 2년·인가 후 거주」 표2 적용 안내를 내지 않는다 — 거주요건 없는 시기", () => {
    const r = calc(right("2019-03-02", { ...HIGH, residencePeriodMonths: 60 }, { ...DECLARED, ...HIGH_RIGHT }));
    expect(r.longTermHoldingDeduction).toBeGreaterThan(0); // 공제가 0이면 안내 자체가 안 나가 이 단언이 비어 버린다
    expect((r.warnings ?? []).some((w) => w.includes("거주 2년(소득세법 시행령 §159의4)"))).toBe(false);
  });

  it("2023 양도 입주권(거주 60개월): 같은 안내는 그대로 낸다(회귀 가드)", () => {
    const r = calc(right("2023-03-02", { ...HIGH, residencePeriodMonths: 60 }, { ...DECLARED, ...HIGH_RIGHT, settlementSaleDate: D("2023-03-01") }));
    expect(r.longTermHoldingDeduction).toBeGreaterThan(0);
    expect((r.warnings ?? []).some((w) => w.includes("거주 2년(소득세법 시행령 §159의4)"))).toBe(true);
  });

  it("2019 양도 · 인가일 요건 미선언: 거주 0이어도 「표2를 적용하지 않았습니다」 확인 필요 고지(거주 요건이 없는 시기라 거주로 막지 않는다)", () => {
    const r = calc(right("2019-03-02", actual, { settlementSaleDate: D("2019-03-01"), oneHouseAtSettlementSale: false }));
    expect((r.warnings ?? []).some((w) => w.includes("표2를 적용하지 않았습니다"))).toBe(true);
  });

  it("2020-06 양도: 거주 2년 요건 부활 — 거주 0이면 표1 10%, 거주 60개월이면 8% 단일축 40%", () => {
    const none = calc(right("2020-06-02", actual, { ...DECLARED, settlementSaleDate: D("2020-06-01") }));
    expect(pct(none.redevelopmentDetail!.preApproval.lthdRate)).toBe(10);
    const ok = calc(right("2020-06-02", { ...actual, residencePeriodMonths: 60 }, { ...DECLARED, settlementSaleDate: D("2020-06-01") }));
    expect(pct(ok.redevelopmentDetail!.preApproval.lthdRate)).toBe(40);
  });

  it("2023 양도 · 거주 60개월: 현행 식 40%(보유 20 + 거주 20) 불변", () => {
    const r = calc(right("2023-03-02", { ...actual, residencePeriodMonths: 60 }, { ...DECLARED, settlementSaleDate: D("2023-03-01") }));
    expect(pct(r.redevelopmentDetail!.preApproval.lthdRate)).toBe(40);
    expect(r.redevelopmentDetail!.lthdResidenceAttribution?.table2HoldingOnly).toBeUndefined();
  });

  it("2019 양도 입주권: 거주 기반 안내(거주 0 · 표2 거주분)는 내지 않는다 — 거주 요건이 없는 시기", () => {
    const r = calc(right("2019-03-02", HIGH, { ...DECLARED, ...HIGH_RIGHT }));
    expect(r.longTermHoldingDeduction).toBeGreaterThan(0);
    expect((r.warnings ?? []).some((w) => w.includes("거주분이 반영되지 않았습니다"))).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 토지 출자 · 승계조합원 · 청산금 수령 · 미지원 고지
// ──────────────────────────────────────────────────────────────────────────────
describe("완공 APT — 토지 출자 원조합원(재산세과-1693 비교)도 연혁 표2", () => {
  it("★ 2018-06 양도 · 사용승인 2009-06 · 거주 0: 표2(사용승인 후 9년 연 8% = 72%) > 표1(토지 13년 26%) → 72% (종전: 거주 2년 미만이라 표1 26%)", () => {
    const r = calc(
      apt(
        "2005-01-01",
        "2018-06-01",
        { originalAssetType: "land", approvalDate: D("2008-03-01"), completionDate: D("2009-06-01") },
      ),
    );
    const d = r.redevelopmentDetail!;
    expect(pct(d.preApproval.lthdRate)).toBe(72);
    expect(d.preApproval.lthdRateBasis ?? "").toContain("재산세과-1693");
    expect(d.preApproval.lthdRateBasis ?? "").toContain("표2(사용승인 후 9년 + 거주) 72%");
  });
});

describe("승계조합원 · 청산금 수령 — 같은 연혁", () => {
  it("승계조합원 완공 주택 2019 양도: 준공 후 7년 × 8% = 56% (거주 0)", () => {
    const r = calc(
      apt("2012-06-01", "2019-06-01", { isSuccessorMember: true, originalAssetType: undefined, completionDate: D("2012-06-01") }),
    );
    expect(r.redevelopmentDetail!.successorMemberApplied).toBe(true);
    expect(pct(r.redevelopmentDetail!.postApprovalExistingHouse.lthdRate)).toBe(56);
  });
});

describe("2009-01-01 전 양도 — 연혁 미지원 고지", () => {
  it("★ 2008 양도 · 표2(거주 36개월): 현행 식으로 계산하고 미지원 고지를 싣는다", () => {
    const r = calc(apt("2000-01-01", "2008-06-01", { approvalDate: D("2004-03-01"), completionDate: D("2006-06-01"), newHouseResidenceMonths: 36 }, { residencePeriodMonths: 36 }));
    expect(r.warnings ?? []).toContain(LTHD_TABLE2_UNSUPPORTED_NOTICE);
  });
  it("2018 양도는 고지 없음 · 2008 양도라도 표1(거주 0)이면 고지 없음(고지는 표2를 쓴 계산에만)", () => {
    const a = calc(apt("2008-01-01", "2018-06-01"));
    expect(a.warnings ?? []).not.toContain(LTHD_TABLE2_UNSUPPORTED_NOTICE);
    const b = calc(apt("2000-01-01", "2008-06-01", { approvalDate: D("2004-03-01"), completionDate: D("2006-06-01") }));
    expect(b.warnings ?? []).not.toContain(LTHD_TABLE2_UNSUPPORTED_NOTICE);
  });
});

describe("redevUsesTable2 — 조특법 §97의4① 단서 판정도 같은 연혁 술어", () => {
  const aptRedev = { subject: "apt" as const, originalAssetType: "housing" as const };
  const rightRedev = { subject: "right" as const };
  it("2009~2019 양도: 1세대1주택이면 거주 0이어도 표2 대상(가산 배제)", () => {
    expect(redevUsesTable2({ redevelopment: aptRedev, isOneHouseSingle: true, residencePeriodMonths: 0, transferDate: D("2018-06-01") })).toBe(true);
    expect(redevUsesTable2({ redevelopment: rightRedev, isOneHouseSingle: true, residencePeriodMonths: 0, transferDate: D("2018-06-01") })).toBe(true);
    expect(redevUsesTable2({ redevelopment: aptRedev, isOneHouseSingle: false, residencePeriodMonths: 60, transferDate: D("2018-06-01") })).toBe(false);
  });
  it("승계조합원(완공 APT) · 청산금 수령 단독신고 분기도 같은 연혁 — 거주 0이어도 2018 양도는 표2 대상", () => {
    const successor = { ...aptRedev, isSuccessorMember: true };
    expect(redevUsesTable2({ redevelopment: successor, isOneHouseSingle: true, transferDate: D("2018-06-01") })).toBe(true);
    expect(redevUsesTable2({ redevelopment: successor, isOneHouseSingle: true, transferDate: D("2022-06-01") })).toBe(false);
    const solo = { ...aptRedev, settlementDirection: "receive" as const, receiveOnlyMode: true, newHouseResidenceMonths: 0 };
    expect(redevUsesTable2({ redevelopment: solo, isOneHouseSingle: true, transferDate: D("2018-06-01") })).toBe(true);
    expect(redevUsesTable2({ redevelopment: solo, isOneHouseSingle: true, transferDate: D("2022-06-01") })).toBe(false);
  });
  it("2020~ 양도·양도일 없음: 거주 2년 요건", () => {
    expect(redevUsesTable2({ redevelopment: aptRedev, isOneHouseSingle: true, residencePeriodMonths: 0, transferDate: D("2020-06-01") })).toBe(false);
    expect(redevUsesTable2({ redevelopment: aptRedev, isOneHouseSingle: true, residencePeriodMonths: 24, transferDate: D("2022-06-01") })).toBe(true);
    expect(redevUsesTable2({ redevelopment: aptRedev, isOneHouseSingle: true, residencePeriodMonths: 0 })).toBe(false);
  });
});

describe("청산금 수령분 — 별도 양도라 표2 연혁도 그 양도일(소유권이전 고시일 다음날)로 가른다", () => {
  it("★ 청산금분 양도일 2018-03-01(보유 6년) · 신축 양도 2023-06-01: 청산금분 6 × 8% = 48% / 신축분은 양도일 2023 식(거주 36개월 → 보유 40 + 거주 12)", () => {
    const r = calc(
      apt(
        "2012-01-01",
        "2023-06-01",
        {
          settlementDirection: "receive",
          settlementAmount: 136_000_000,
          settlementSaleDate: D("2018-03-01"),
          oneHouseAtSettlementSale: true,
          exemptionEligibleAtApproval: true,
          newHouseResidenceMonths: 36,
        },
        { residencePeriodMonths: 36 },
      ),
    );
    const d = r.redevelopmentDetail!;
    expect(pct(d.settlement.lthdRate)).toBe(48);
    expect(pct(d.preApproval.lthdRate)).toBe(52); // 11년: min(44,40) + 거주 3년 12 — 현행 식
  });
});
