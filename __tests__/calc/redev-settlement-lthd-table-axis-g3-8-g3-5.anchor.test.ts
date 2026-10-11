/**
 * G3-8 · G3-5 anchor — 재개발 완공APT **청산금 수령** 동시신고의 장기보유특별공제 표1·표2 축.
 *
 * ## 결함 (수정 전 실측 — 사례 47 사실관계: 2001 취득 · 인가 2014-02-01 · 청산금 2억 수령 · 권리가액 8억)
 *
 * - **G3-8** `exemptionEligibleAtApproval=false`(종전주택 보유 요건 미충족 선언)가 신축주택분(인가전·인가후 기존건물분)까지
 *   표1로 내렸다 — 동시신고 20억에서 공제율 [0.3, 0.3, 0.3], 총세액 264,924,000. 부동산거래관리과-380(2012.07.20)이
 *   과세로 보는 것은 「그 청산금」뿐이고, 신축주택분 표2는 「소득세법 시행령」 제159의4(양도일 현재 1주택 + 보유기간 중 거주 2년)·
 *   제154조제8항제1호(멸실 주택 + 재건축 주택 거주 통산)로 판정한다.
 *   ⇒ 신축주택분은 선언과 무관하게 [0.8, 0.8], 청산금분만 0.3, 총세액 92,598,000(미선언 대조군과 같다).
 * - **G3-5** 청산금분 양도일 현재 1세대1주택이 **아님**(`oneHouseAtSettlementSale=false`)이거나 판정 불가(날이 다른데 선언 없음)인데도
 *   청산금분 장특이 신축주택 양도일 세대 입력으로 표2(0.52)를 받았다(비과세만 막았다). 청산금 수령분은 별도 양도이고 표2 대상 판정의
 *   「양도일」은 청산금분 양도일(소유권이전 고시일 다음날 — 사전-2022-법규재산-1282)이다. 판정 불가는 「모름 = 혜택 불성립」이다.
 *   ⇒ 청산금분은 표1(보유 19년 → 30%): 공제 52,500,000 · 과세표준 335,600,000 · 총세액 119,130,000.
 *
 * ## 법령 (KoreanLaw MCP — 소득세법 §95② 단서 · 시행령 §159의4 · §154⑧1호 — 원문은 PR 보고 참조)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { case47RedevelopmentInfo } from "../tax-engine/transfer-tax/redevelopment/_helpers";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, redevAptForm } from "./_helpers/redev-one-house-route";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

/** 동시신고 엔진 입력 — 사례 47. 청산금분 양도일(settlementSaleDate)·신축 양도일(transferDate)은 호출부가 정한다. */
function sim(
  price: number,
  redev: Partial<RedevelopmentInfo> = {},
  o: Partial<TransferTaxInput> = {},
): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: price,
    transferDate: D("2022-03-01"),
    acquisitionDate: D("2001-01-01"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 254,
    redevelopment: { ...case47RedevelopmentInfo(), ...redev },
    ...o,
  });
}
/** 단독신고 — ④와 같이 양도가액 = 청산금, 양도일 = 청산금분 양도일. */
function solo(redev: Partial<RedevelopmentInfo> = {}): TransferTaxInput {
  const r = { ...case47RedevelopmentInfo(), receiveOnlyMode: true, ...redev };
  return sim(r.settlementAmount, r, { transferDate: r.settlementSaleDate! });
}
const run = (i: TransferTaxInput) => {
  const r = calculateTransferTax(i, rates);
  return { r, d: r.redevelopmentDetail! };
};
const rateOf = (d: ReturnType<typeof run>["d"]) => [
  d.preApproval.lthdRate,
  d.postApprovalExistingHouse.lthdRate,
  d.settlement.lthdRate,
];

describe("G3-8 — 미충족 선언(false)은 「그 청산금」 분기만 표1로 내린다", () => {
  it("🔑 동시신고 20억 · false — 신축주택분은 표2 0.8, 청산금분만 표1 0.3 · 총세액 92,598,000 (수정 전 [0.3,0.3,0.3] · 264,924,000)", () => {
    const { r, d } = run(sim(2_000_000_000, { exemptionEligibleAtApproval: false }));
    expect(rateOf(d)).toEqual([0.8, 0.8, 0.3]);
    expect(d.settlement.gain).toBe(175_000_000);
    expect(d.settlement.lthd).toBe(52_500_000);
    expect(r.taxBase).toBe(274_000_000);
    expect(r.totalTax).toBe(92_598_000);
  });

  it("신축주택분 공제율·세액은 선언을 하지 않은 경우(undefined)와 같다 — 선언은 청산금분에만 미친다", () => {
    const f = run(sim(2_000_000_000, { exemptionEligibleAtApproval: false }));
    const u = run(sim(2_000_000_000, { exemptionEligibleAtApproval: undefined }));
    expect(f.d.preApproval.lthd).toBe(u.d.preApproval.lthd);
    expect(f.d.postApprovalExistingHouse.lthd).toBe(u.d.postApprovalExistingHouse.lthd);
    expect(rateOf(f.d)).toEqual(rateOf(u.d));
    expect(f.r.totalTax).toBe(u.r.totalTax);
  });

  it("신축주택 12억 안분은 선언을 읽지 않는다(엔진 동작 그대로) — 안분 비율 0.4 · 부분 비과세", () => {
    const { r, d } = run(sim(2_000_000_000, { exemptionEligibleAtApproval: false }));
    expect(d.highValueAllocation?.taxableRatio).toBeCloseTo(0.4, 10);
    expect(r.isPartialExempt).toBe(true);
  });

  it("긍정 짝 · true — 신축주택분은 같은 [0.8, 0.8], 청산금분은 비과세(gain 0)", () => {
    const { d } = run(sim(2_000_000_000, { exemptionEligibleAtApproval: true }));
    expect([d.preApproval.lthdRate, d.postApprovalExistingHouse.lthdRate]).toEqual([0.8, 0.8]);
    expect(d.settlementExemptionApplied).toBe(true);
  });

  it("단독신고 · false — 청산금분만 과세·표1 (현행 유지 29,216,000)", () => {
    const { r, d } = run(solo({ exemptionEligibleAtApproval: false }));
    expect(d.settlement.lthdRate).toBe(0.3);
    expect(r.totalTax).toBe(29_216_000);
  });

  it("동시신고 10억 · false — 신축주택분 비과세 · 청산금분만 과세 29,216,000 (현행 유지)", () => {
    const { r, d } = run(sim(1_000_000_000, { exemptionEligibleAtApproval: false }));
    expect(d.aptOneHouseExemptionApplied).toBe(true);
    expect(r.totalTax).toBe(29_216_000);
  });
});

describe("G3-5 — 청산금분 양도일 현재 1주택 「아님」·판정 불가 → 청산금분 표1", () => {
  /** 신축 양도 2024-06-01 · 청산금분 양도일 2020-03-01 · 종전 거주 60 + 신축 거주 36 — 두 날이 다르다. */
  const split = (decl: boolean | undefined, over: Partial<RedevelopmentInfo> = {}) =>
    sim(
      2_000_000_000,
      {
        settlementSaleDate: D("2020-03-01"),
        priorHouseResidenceMonths: 60,
        newHouseResidenceMonths: 36,
        ...(decl === undefined ? {} : { oneHouseAtSettlementSale: decl }),
        ...over,
      },
      { transferDate: D("2024-06-01"), residencePeriodMonths: 60 },
    );

  for (const [lbl, decl] of [
    ["선언 no(청산금분 양도일 1주택 아님)", false],
    ["미선택(판정 불가)", undefined],
  ] as const) {
    it(`🔑 ${lbl} → 기존건물분 0.72 유지 · 청산금분 0.3 · 공제 52,500,000 · 과세표준 335,600,000 · 총세액 119,130,000`, () => {
      const { r, d } = run(split(decl));
      expect([d.preApproval.lthdRate, d.postApprovalExistingHouse.lthdRate]).toEqual([0.72, 0.72]);
      expect(d.settlement.gain).toBe(175_000_000);
      expect(d.settlement.lthdRate).toBe(0.3);
      expect(d.settlement.lthd).toBe(52_500_000);
      expect(r.taxBase).toBe(335_600_000);
      expect(r.totalTax).toBe(119_130_000);
    });
  }

  it("긍정 짝 · 선언 yes → 청산금분 비과세(gain 0 · 공제율은 표2 0.52) · 총세액 67,141,800", () => {
    const { r, d } = run(split(true));
    expect(d.settlement.gain).toBe(0);
    expect(d.settlement.lthdRate).toBe(0.52);
    expect(r.totalTax).toBe(67_141_800);
  });

  it("긍정 짝 · 같은 날 + 선언 없음 → 세대 입력으로 판정(종전 동작) — 청산금분 표2 0.52", () => {
    const { d } = run(
      sim(2_000_000_000, { priorHouseResidenceMonths: 60, newHouseResidenceMonths: 36 }, { residencePeriodMonths: 60 }),
    );
    expect(d.settlement.lthdRate).toBe(0.52);
  });

  it("같은 날이어도 선언 no면 표1 — 선언이 세대 입력보다 우선(비과세 판정과 같은 술어)", () => {
    const { d } = run(
      sim(
        2_000_000_000,
        { priorHouseResidenceMonths: 60, newHouseResidenceMonths: 36, oneHouseAtSettlementSale: false },
        { residencePeriodMonths: 60 },
      ),
    );
    expect(d.settlement.lthdRate).toBe(0.3);
  });

  it("신축 양도일 2주택 · 청산금분 양도일 1주택 선언 yes → 청산금분 비과세 · 신축주택분은 2주택이라 표1 [0.3,0.3] (현행 유지)", () => {
    const { d } = run({ ...split(true), householdHousingCount: 2 });
    expect(d.preApproval.lthdRate).toBe(0.3);
    expect(d.settlement.gain).toBe(0);
  });
});

/** ④ 폼 → ⑧ → ④ 변환 → ⑫ Zod → ⑭ route → 엔진 — 사례 47 사실관계 동시신고. */
function receiveForm(opts: {
  eligible?: "" | "yes" | "no";
  atSale?: "" | "yes" | "no";
  price?: string;
  saleDate?: string;
  transferDate?: string;
}) {
  const transferDate = opts.transferDate ?? "2024-06-01";
  return redevAptForm({
    price: opts.price ?? "2000000000",
    assetOver: {
      acquisitionDate: "2001-01-01",
      fixedAcquisitionPrice: "100000000",
      redevApprovalDate: "2014-02-01",
      redevSettlementDirection: "receive",
      redevSettlementSaleDate: opts.saleDate ?? "2020-03-01",
      redevRightsValue: "800000000",
      redevSettlementAmount: "200000000",
      redevActualAcquisitionPrice: "100000000",
      redevPriorHouseResidenceMonths: "60",
      redevNewHouseResidenceMonths: "36",
      redevExemptionEligibleAtApproval: opts.eligible ?? "yes",
      redevOneHouseAtSettlementSale: opts.atSale ?? "",
      redevReceiveOnlyMode: "no",
      redevCompletionDate: "2020-02-01",
      residenceInputMode: "direct",
      residencePeriods: [],
    },
    formOver: { transferDate, residencePeriodMonths: "60" },
  });
}

describe("G3-8 · G3-5 route(⑧④⑫⑭) — 계산기 폼에서도 같은 값이다", () => {
  it("G3-8 · 미충족 선언(no) 동시신고 — 신축주택분 표2 유지(선언 yes와 같은 0.72) · 청산금분만 표1 0.3", async () => {
    const yes = await runCalc(
      receiveForm({ eligible: "yes", saleDate: "2022-03-01", transferDate: "2022-03-01" }),
    );
    const yd = yes.result.redevelopmentDetail;
    expect([yd.preApproval.lthdRate, yd.postApprovalExistingHouse.lthdRate]).toEqual([0.72, 0.72]);
    const r = await runCalc(
      receiveForm({ eligible: "no", saleDate: "2022-03-01", transferDate: "2022-03-01" }),
    );
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.body.redevelopment).toMatchObject({ exemptionEligibleAtApproval: false });
    const d = r.result.redevelopmentDetail;
    expect([d.preApproval.lthdRate, d.postApprovalExistingHouse.lthdRate, d.settlement.lthdRate]).toEqual([0.72, 0.72, 0.3]);
    expect(d.settlement.gain).toBe(175_000_000);
  });

  it("G3-5 · 선언 no — 청산금분 표1 0.3 · 총세액 119,130,000", async () => {
    const r = await runCalc(receiveForm({ atSale: "no" }));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.body.redevelopment).toMatchObject({ oneHouseAtSettlementSale: false });
    const d = r.result.redevelopmentDetail;
    expect(d.settlement.lthdRate).toBe(0.3);
    expect(r.result.totalTax).toBe(119_130_000);
  });

  it("G3-5 · 미선택(판정 불가) — 같은 값 + 경고", async () => {
    const r = await runCalc(receiveForm({ atSale: "" }));
    expect(r.issues).toEqual([]);
    expect(r.result.redevelopmentDetail.settlement.lthdRate).toBe(0.3);
    expect(r.result.totalTax).toBe(119_130_000);
    expect(r.result.warnings.length).toBeGreaterThan(0);
  });

  it("G3-5 긍정 짝 · 선언 yes — 청산금분 비과세 · 67,141,800", async () => {
    const r = await runCalc(receiveForm({ atSale: "yes" }));
    expect(r.issues).toEqual([]);
    expect(r.result.redevelopmentDetail.settlement.gain).toBe(0);
    expect(r.result.totalTax).toBe(67_141_800);
  });
});
