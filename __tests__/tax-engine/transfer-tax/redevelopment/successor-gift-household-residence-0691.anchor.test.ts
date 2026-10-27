/**
 * anchor — 증여받은 입주권(승계조합원 + 증여)의 **종전주택 거주 통산** (사전-2020-법령해석재산-0691 · 2021.8.26. · 법령해석과-2938).
 *
 * 회신 요지(taxlaw.nts.go.kr 원문 확인): 「배우자로부터 조합원입주권을 증여받아 취득한 주택의 영 §159의3에 따른 거주기간은
 * 기존주택과 신축주택에서 1세대로서 거주한 기간을 통산」. 사실관계는 갑이 관리처분 인가 후 배우자 을에게 입주권 지분을 증여하고,
 * 을이 신축주택을 거주 없이 양도한 사안(양도 2020.9.2.)이다.
 *
 * 종전에는 승계조합원의 거주를 신축주택 거주만 읽었다(`resolveAptResidenceMonths` — 서면-2019-부동산-4508, 매매 승계 사안).
 * 증여자와 계속 같은 세대였다고 선언하면(`successorGiftSameHousehold`) 종전주택 거주(`priorHouseResidenceMonths`)를 **같은 leaf가**
 *   ① 표2 대상 판정(영 §159의3) ② 비과세 거주요건(영 §154①)에 함께 더한다. 표2 공제율의 거주분은 본인의 신축 거주만이다(결정 #38-9).
 *
 * 시료 S1(0691 사실): 증여 승계 · 준공 2016.8.30. · 양도 2020.9.2.(2020년은 표2 거주 2년 요건이 있는 해) · 신축 거주 0 · 종전 거주 240개월.
 * 시료 S2(비과세 거주요건): 준공 2020.1.1.(강남구 — 취득 당시 조정대상지역) · 양도 2023.6.1. · 양도가 10억.
 * 시료 S3(공제율): S2와 같되 양도가 18억(12억 초과 — 부분 비과세).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { redevUsesTable2 } from "@/lib/tax-engine/redevelopment-lthd";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

type Carry = { flag?: boolean; prior?: number; newM?: number };

function successor(over: Partial<TransferTaxInput>, rOver: Partial<RedevelopmentInfo>, c: Carry): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    acquisitionCause: "gift",
    redevelopment: {
      subject: "apt",
      approvalLawBasis: "urban_renovation_art_74",
      rightsValue: 500_000_000,
      settlementDirection: "pay",
      settlementAmount: 0,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: "housing",
      isSuccessorMember: true,
      successorGiftSameHousehold: c.flag,
      priorHouseResidenceMonths: c.prior,
      newHouseResidenceMonths: c.newM,
      ...rOver,
    } as RedevelopmentInfo,
    ...over,
  });
}

/** S1 — 0691 사실관계(표2) */
const s1 = (c: Carry) =>
  successor(
    { transferPrice: 2_000_000_000, transferDate: D("2020-09-02"), acquisitionDate: D("2016-07-29"), acquisitionPrice: 500_000_000 },
    { approvalDate: D("2010-08-24"), completionDate: D("2016-08-30") },
    c,
  );
/** S2·S3 — 강남구 신축(준공 당시 조정대상지역) */
const s2 = (price: number, c: Carry) =>
  successor(
    { transferPrice: price, transferDate: D("2023-06-01"), acquisitionDate: D("2019-06-01"), acquisitionPrice: 600_000_000, regionCode: "1168010100" },
    { approvalDate: D("2017-09-01"), completionDate: D("2020-01-01"), rightsValue: 600_000_000 },
    c,
  );

const run = (i: TransferTaxInput) => calculateTransferTax(i, rates);
const rateOf = (r: ReturnType<typeof run>) => r.redevelopmentDetail?.postApprovalExistingHouse.lthdRate;
const notice = (r: ReturnType<typeof run>) => (r.warnings ?? []).filter((w) => w.includes("사전-2020-법령해석재산-0691"));

describe("S1 — 0691 사실관계: 표2 대상 판정에 종전주택 거주 통산 (거주 없이 양도)", () => {
  it("🔑 같은 세대 선언 + 종전 240개월 → 표2(보유 연 8% × 4년 = 32%) · 장특 264,000,000 · 총세액 218,493,000", () => {
    const r = run(s1({ flag: true, prior: 240, newM: 0 }));
    expect(rateOf(r)).toBe(0.32);
    expect(r.longTermHoldingDeduction).toBe(264_000_000);
    expect(r.totalTax).toBe(218_493_000);
  });
  it("대조 — 「아니오」 선언이면 종전 거주를 세지 않아 표1(4년 × 2% = 8%) · 장특 66,000,000 · 총세액 309,969,000", () => {
    const r = run(s1({ flag: false, prior: 240, newM: 0 }));
    expect(rateOf(r)).toBe(0.08);
    expect(r.longTermHoldingDeduction).toBe(66_000_000);
    expect(r.totalTax).toBe(309_969_000);
  });
  it("대조 — 미선언(모름)은 통산하지 않고 계산한다 — 입력된 종전 거주가 있어도 같은 값(모름 = 혜택 불성립)", () => {
    const r = run(s1({ prior: 240, newM: 0 }));
    expect(r.totalTax).toBe(309_969_000);
  });
});

describe("S2 — 비과세 거주요건(영 §154①)에도 같은 값이 쓰인다", () => {
  it("🔑 조정대상지역 신축 · 신축 거주 0 · 종전 240개월 · 양도가 10억: 선언 「예」면 전액 비과세(총세액 0)", () => {
    const r = run(s2(1_000_000_000, { flag: true, prior: 240, newM: 0 }));
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });
  it("대조 — 「아니오」: 거주 2년 미달로 과세(총세액 135,806,000 · 표1 6%)", () => {
    const r = run(s2(1_000_000_000, { flag: false, prior: 240, newM: 0 }));
    expect(r.isExempt).toBe(false);
    expect(rateOf(r)).toBe(0.06);
    expect(r.totalTax).toBe(135_806_000);
  });
  it("대조 — 미선언도 과세 · 통산을 확인하지 않았다는 확인 필요 고지가 붙는다", () => {
    const r = run(s2(1_000_000_000, { newM: 0 }));
    expect(r.totalTax).toBe(135_806_000);
    expect(notice(r)).toHaveLength(1);
    expect(notice(r)[0]).toContain("확인 필요");
    expect(notice(r)[0]).toContain("통산하지 않고 계산했습니다");
  });
  it("통산을 적용하면 「비과세 쪽은 정면 해석이 없다」는 확인 필요 고지가 붙는다 · 「아니오」에는 고지가 없다", () => {
    const carried = notice(run(s2(1_000_000_000, { flag: true, prior: 240, newM: 0 })));
    expect(carried).toHaveLength(1);
    expect(carried[0]).toContain("240개월");
    expect(carried[0]).toContain("정면으로 다룬 해석례는 확인하지 못했습니다");
    expect(carried[0]).toContain("확인 필요");
    expect(notice(run(s2(1_000_000_000, { flag: false, prior: 240, newM: 0 })))).toHaveLength(0);
  });
  it("본인 신축 거주만으로 2년을 넘으면 통산이 결론을 가르지 않아 고지하지 않는다(선언 「예」여도)", () => {
    expect(notice(run(s2(1_000_000_000, { flag: true, prior: 240, newM: 24 })))).toHaveLength(0);
    expect(notice(run(s2(1_000_000_000, { newM: 24 })))).toHaveLength(0);
  });
});

describe("S3 — 표2 공제율의 거주분은 양도자 본인의 신축 거주만 (결정 #38-9)", () => {
  it("🔑 통산으로 표2에 들어와도 거주분은 0 — 보유 3년 × 4% = 12% (종전 240개월이 거주분 40%로 새지 않는다)", () => {
    const r = run(s2(1_800_000_000, { flag: true, prior: 240, newM: 0 }));
    expect(rateOf(r)).toBe(0.12);
    expect(r.longTermHoldingDeduction).toBe(48_000_000);
    expect(r.isPartialExempt).toBe(true);
    expect(r.totalTax).toBe(125_246_000);
  });
  it("대조 — 통산 없음(아니오 · 신축 거주 0): 12억 초과분 과세에 표1 6% · 총세액 484,588,500", () => {
    const r = run(s2(1_800_000_000, { flag: false, prior: 240, newM: 0 }));
    expect(rateOf(r)).toBe(0.06);
    expect(r.totalTax).toBe(484_588_500);
  });
  it("신축 거주 24개월이면 통산 선언 유무와 무관하게 같은 세액 — 거주분은 본인 24개월(8%)만: 보유 12% + 거주 8% = 20%", () => {
    const withCarry = run(s2(1_800_000_000, { flag: true, prior: 240, newM: 24 }));
    const without = run(s2(1_800_000_000, { flag: false, newM: 24 }));
    expect(rateOf(withCarry)).toBe(0.2);
    expect(withCarry.longTermHoldingDeduction).toBe(80_000_000);
    expect(withCarry.totalTax).toBe(111_166_000);
    expect(without.totalTax).toBe(withCarry.totalTax);
  });
});

describe("범위 밖 — 증여 승계가 아니면 선언·종전 거주가 영향을 주지 않는다", () => {
  it("승계조합원이 아닌 입력에 선언을 실어도 무시(원조합원은 종전 거주를 원래대로 통산 — 선언과 무관)", () => {
    const a = run(
      successor(
        { transferPrice: 2_000_000_000, transferDate: D("2020-09-02"), acquisitionDate: D("2008-01-01"), acquisitionPrice: 500_000_000 },
        { approvalDate: D("2010-08-24"), completionDate: D("2016-08-30"), isSuccessorMember: false },
        { flag: true, prior: 240, newM: 0 },
      ),
    );
    const b = run(
      successor(
        { transferPrice: 2_000_000_000, transferDate: D("2020-09-02"), acquisitionDate: D("2008-01-01"), acquisitionPrice: 500_000_000 },
        { approvalDate: D("2010-08-24"), completionDate: D("2016-08-30"), isSuccessorMember: false },
        { prior: 240, newM: 0 },
      ),
    );
    expect(a.totalTax).toBe(b.totalTax);
    expect(notice(a)).toHaveLength(0);
  });
  it("매매 승계(취득원인 purchase)에는 미답 고지를 내지 않는다", () => {
    const r = run({ ...s2(1_000_000_000, { newM: 0 }), acquisitionCause: "purchase" });
    expect(notice(r)).toHaveLength(0);
  });
});

describe("조특법 §97의4① 단서 판정(`redevUsesTable2`)도 같은 leaf를 읽는다 — 표2 대상 판정과 한 값", () => {
  const base = { isOneHouseSingle: true, transferDate: D("2023-06-01"), residencePeriodMonths: 0 };
  const redev = (flag?: boolean) => ({
    subject: "apt" as const,
    isSuccessorMember: true,
    successorGiftSameHousehold: flag,
    priorHouseResidenceMonths: 240,
    newHouseResidenceMonths: 0,
  });
  it("통산 선언 「예」면 표2, 「아니오」·미선언이면 표1", () => {
    expect(redevUsesTable2({ ...base, redevelopment: redev(true) })).toBe(true);
    expect(redevUsesTable2({ ...base, redevelopment: redev(false) })).toBe(false);
    expect(redevUsesTable2({ ...base, redevelopment: redev(undefined) })).toBe(false);
  });
});
