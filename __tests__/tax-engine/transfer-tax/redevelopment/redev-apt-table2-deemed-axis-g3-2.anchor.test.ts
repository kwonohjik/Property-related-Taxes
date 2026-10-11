/**
 * G3-2 anchor — 재개발 완공APT의 **표2·§154① 축 「1주택」**은 §155 의제 1주택을 포함한다.
 *
 * ## 결함 (수정 전 실측 — 엔진 직접)
 * `isOneHouseSingle = isOneHousehold && householdHousingCount === 1`(원시 주택 수)이 장특 표2·승계조합원 표2·
 * §97의4① 단서·청산금 수령분 비과세를 모두 갈랐다. 그런데 같은 계산의 신축주택분 **비과세 판정**
 * (`checkExemption`)은 의제를 인정해 「1세대1주택 고가주택」으로 내렸다 — 한 계산 안에서 1세대1주택 여부가 둘.
 *
 *   | 시료 | 판정 | 공제율(수정 전) | 옳은 값 |
 *   |---|---|---|---|
 *   | 원조합원 1주택 | 1세대1주택 고가주택 | 0.6 / 0.6 | — |
 *   | §155② 상속주택 포함 2주택 | 1세대1주택 고가주택 | **0.3 / 0.3** | 0.6 / 0.6 |
 *   | §155① 일시적 2주택 | 일시적 2주택 고가주택 | **0.3 / 0.3** | 0.6 / 0.6 |
 *   | 승계조합원 §155① | 일시적 2주택 고가주택 | **0.12** | 0.4 (1주택 대조) |
 *   | 같은 날 동시신고 + §155① | 청산금분 **과세** | — | 청산금분 비과세 |
 *
 * ## 법령 (KoreanLaw MCP — 「소득세법 시행령」 MST 290841 원문)
 * - 제159조의4 괄호: 「1세대가 양도일 … 현재 국내에 1주택(제155조ㆍ제155조의2ㆍ제156조의2ㆍ제156조의3 및 그 밖의
 *   규정에 따라 1세대 1주택으로 보는 주택을 포함한다)을 보유하고 보유기간 중 거주기간이 2년 이상인 것」.
 * - 제155조제1항 「…이를 1세대1주택으로 보아 제154조제1항을 적용한다」 · 제2항 「…국내에 1개의 주택을 소유하고
 *   있는 것으로 보아 제154조제1항을 적용한다」 — 청산금 수령분 비과세의 근거인 §154①에도 이 의제가 미친다.
 * - 부동산거래관리과-631(2012.11.20): 「청산금을 교부받기 전에 다른 주택을 취득함으로써 「소득세법 시행령」
 *   제155조제1항에 따른 일시적인 2주택이 된 경우 교부받은 해당 청산금은 같은 영 제154조제1항의 규정을 적용받을
 *   수 있는 것」(반박 검토자 taxlaw.nts 원문 실독).
 * - §155② × 청산금의 정면 해석례는 확보하지 못했다 — 청산금 축은 631이 정면으로 다룬 §155①로만 단언한다.
 *
 * ## 일반 경로와의 정합
 * 같은 사실을 일반 주택(housing)으로 넣으면 의제 세대도 표2(0.6)다(`transfer-tax-lthd.ts` F10). 이 anchor의
 * 대조군이 그 값이고, 의제가 없는 실제 3주택은 표1(0.3)이다(대조의 대조).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput, makeHouseInfo } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import { case46RedevelopmentInfo, case47RedevelopmentInfo } from "./_helpers";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** 원조합원 완공APT 20억 · 종전주택 2008-01-01 · 인가 2016-06-01 · 청산금 1억 납부 · 거주 60개월 · 양도 2024-06-01 */
function redev(over: Partial<TransferTaxInput> = {}, rOver: Partial<RedevelopmentInfo> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 2_000_000_000,
    transferDate: D("2024-06-01"),
    acquisitionDate: D("2008-01-01"),
    acquisitionPrice: 400_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 60,
    redevelopment: {
      subject: "apt",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: D("2016-06-01"),
      rightsValue: 900_000_000,
      settlementDirection: "pay",
      settlementAmount: 100_000_000,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: "housing",
      ...rOver,
    } as RedevelopmentInfo,
    ...over,
  });
}

/** 상속주택(§155②) 포함 2주택 — 명부 입력 */
const inheritedTwo = {
  householdHousingCount: 2,
  sellingHouseId: "selling",
  houses: [
    makeHouseInfo("selling", { acquisitionDate: D("2008-01-01") }),
    makeHouseInfo("inh", { isInherited: true, inheritedDate: D("2020-01-01"), acquisitionDate: D("2020-01-01") }),
  ],
} as Partial<TransferTaxInput>;
/** 일시적 2주택(§155①) — 종전주택 2008 · 신규 2023-03 */
const temporaryTwo = {
  householdHousingCount: 2,
  temporaryTwoHouse: { previousAcquisitionDate: D("2008-01-01"), newAcquisitionDate: D("2023-03-01") },
} as Partial<TransferTaxInput>;
/** 의제 없는 실제 3주택 */
const realThree = {
  householdHousingCount: 3,
  sellingHouseId: "selling",
  houses: [
    makeHouseInfo("selling", { acquisitionDate: D("2008-01-01") }),
    makeHouseInfo("h2", { acquisitionDate: D("2010-01-01") }),
    makeHouseInfo("h3", { acquisitionDate: D("2012-01-01") }),
  ],
} as Partial<TransferTaxInput>;

const pct = (n: number | undefined) => Math.round((n ?? 0) * 100);
function rates3(r: ReturnType<typeof calculateTransferTax>) {
  const d = r.redevelopmentDetail!;
  return [pct(d.preApproval.lthdRate), pct(d.postApprovalExistingHouse.lthdRate), pct(d.settlement.lthdRate)];
}

describe("G3-2 — 원조합원 완공APT 표2는 §155 의제를 포함한다", () => {
  const one = calculateTransferTax(redev(), rates);

  it("기준 — 실제 1주택: 판정 1세대1주택 고가주택 · 공제율 60/60", () => {
    expect(one.exemptReason).toBe("1세대1주택 고가주택");
    expect(rates3(one).slice(0, 2)).toEqual([60, 60]);
  });

  it("§155② 상속주택 포함 2주택 — 1주택과 같은 공제율 · 같은 총세액", () => {
    const r = calculateTransferTax(redev(inheritedTwo), rates);
    expect(r.exemptReason).toBe("1세대1주택 고가주택");
    expect(rates3(r).slice(0, 2)).toEqual([60, 60]);
    expect(r.totalTax).toBe(one.totalTax);
  });

  it("§155① 일시적 2주택 — 1주택과 같은 공제율 · 같은 총세액", () => {
    const r = calculateTransferTax(redev(temporaryTwo), rates);
    expect(r.exemptReason).toBe("일시적 2주택 고가주택");
    expect(rates3(r).slice(0, 2)).toEqual([60, 60]);
    expect(r.totalTax).toBe(one.totalTax);
  });

  it("대조군 — 같은 사실의 일반 주택(housing)도 의제 세대가 표2(일반 경로 F10과 같은 값)", () => {
    const plain = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        transferPrice: 2_000_000_000,
        transferDate: D("2024-06-01"),
        acquisitionDate: D("2008-01-01"),
        acquisitionPrice: 500_000_000,
        residencePeriodMonths: 60,
        ...temporaryTwo,
      }),
      rates,
    );
    expect(plain.exemptReason).toBe("일시적 2주택 고가주택");
    expect(pct(plain.longTermHoldingRate)).toBe(60);
  });

  it("대조의 대조 — 의제 없는 실제 3주택은 표1(30%) 그대로", () => {
    const r = calculateTransferTax(redev(realThree), rates);
    expect(rates3(r).slice(0, 2)).toEqual([30, 30]);
  });

  it("실제 1주택 축(12억 안분 판정)은 불변 — §155② 의제 세대의 과세비율은 1주택과 같다", () => {
    const r = calculateTransferTax(redev(inheritedTwo), rates);
    expect(r.redevelopmentDetail!.highValueAllocation!.taxableRatio).toBeCloseTo(
      one.redevelopmentDetail!.highValueAllocation!.taxableRatio,
      10,
    );
  });
});

describe("G3-2 — 승계조합원 완공APT 표2도 §155 의제를 포함한다", () => {
  const succ = (o: Partial<TransferTaxInput>) =>
    redev(
      { acquisitionDate: D("2016-12-01"), acquisitionPrice: 900_000_000, ...o },
      { isSuccessorMember: true, isSuccessorRightToMoveIn: true, completionDate: D("2018-06-01"), newHouseResidenceMonths: 48 } as Partial<RedevelopmentInfo>,
    );
  it("승계 + §155① 일시적 2주택 — 승계 1주택 대조와 같은 공제율(수정 전 0.12 ↔ 0.4)", () => {
    const one = calculateTransferTax(succ({}), rates);
    const t = calculateTransferTax(
      succ({
        householdHousingCount: 2,
        temporaryTwoHouse: { previousAcquisitionDate: D("2018-06-01"), newAcquisitionDate: D("2023-03-01") },
      } as Partial<TransferTaxInput>),
      rates,
    );
    expect(t.exemptReason).toBe("일시적 2주택 고가주택");
    const rate = (r: typeof one) => pct(r.redevelopmentDetail!.postApprovalExistingHouse.lthdRate);
    expect(rate(t)).toBe(rate(one));
    expect(rate(one)).toBeGreaterThan(12);
  });
});

describe("G3-2 — 청산금 수령분 비과세는 §155① 의제 세대를 막지 않는다 (부동산거래관리과-631)", () => {
  function c47(over: Partial<TransferTaxInput> = {}, rOver: Partial<RedevelopmentInfo> = {}): TransferTaxInput {
    return baseTransferInput({
      propertyType: "redevelopment_apt",
      transferPrice: 2_000_000_000,
      transferDate: D("2022-03-01"),
      acquisitionDate: D("2001-01-01"),
      acquisitionPrice: 100_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 252,
      redevelopment: { ...case47RedevelopmentInfo(), ...rOver },
      ...over,
    });
  }
  const temp47 = {
    householdHousingCount: 2,
    // 이 anchor의 주제는 청산금분 비과세와 §155① 의제의 공존이다 — 신규 주택 취득 당시 비조정(선언)으로 본문 3년 독법을 고정한다
    //   (#30: 조정 여부 미입력은 두 주택 모두 조정으로 읽은 불성립 독법이라 이 양도 시기에는 1년 + 전입 요건이 붙는다).
    temporaryTwoHouse: {
      previousAcquisitionDate: D("2001-01-01"),
      newAcquisitionDate: D("2021-03-01"),
      newHouseRegulatedAtAcquisition: false,
    },
  } as Partial<TransferTaxInput>;

  it("같은 날 동시신고(사례 47) 1주택 — 청산금분 비과세(기준)", () => {
    expect(calculateTransferTax(c47(), rates).redevelopmentDetail?.settlementExemptionApplied).toBe(true);
  });

  it("같은 날 동시신고 + §155① 일시적 2주택 — 청산금분 비과세 적용(수정 전: 과세)", () => {
    const r = calculateTransferTax(c47(temp47), rates);
    expect(r.exemptReason).toBe("일시적 2주택 고가주택");
    expect(r.redevelopmentDetail?.settlementExemptionApplied).toBe(true);
  });

  it("대조 — 같은 날 동시신고 + 의제 없는 실제 3주택은 청산금분 과세(비과세 미적용)", () => {
    const three = {
      householdHousingCount: 3,
      sellingHouseId: "selling",
      houses: [
        makeHouseInfo("selling", { acquisitionDate: D("2001-01-01") }),
        makeHouseInfo("h2", { acquisitionDate: D("2010-01-01") }),
        makeHouseInfo("h3", { acquisitionDate: D("2012-01-01") }),
      ],
    } as Partial<TransferTaxInput>;
    expect(calculateTransferTax(c47(three), rates).redevelopmentDetail?.settlementExemptionApplied).not.toBe(true);
  });

  it("사용자 선언이 의제 판정보다 우선 — oneHouseAtSettlementSale=false면 의제 세대도 청산금분 과세", () => {
    const r = calculateTransferTax(c47(temp47, { oneHouseAtSettlementSale: false }), rates);
    expect(r.redevelopmentDetail?.settlementExemptionApplied).not.toBe(true);
  });

  function c46(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
    return baseTransferInput({
      propertyType: "redevelopment_apt",
      transferPrice: 500_000_000,
      transferDate: D("2023-02-17"),
      acquisitionDate: D("2016-05-06"),
      acquisitionPrice: 400_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      redevelopment: { ...case46RedevelopmentInfo(), rightsValue: 1_100_000_000, exemptionEligibleAtApproval: true },
      ...over,
    });
  }
  const temp46 = {
    householdHousingCount: 2,
    temporaryTwoHouse: { previousAcquisitionDate: D("2016-05-06"), newAcquisitionDate: D("2022-03-01") },
  } as Partial<TransferTaxInput>;

  it("단독신고(사례 46) 1주택 — 청산금분 비과세(기준)", () => {
    expect(calculateTransferTax(c46(), rates).redevelopmentDetail?.settlementExemptionApplied).toBe(true);
  });

  it("단독신고 + §155① 일시적 2주택 — 청산금분 비과세 적용(수정 전: 과세)", () => {
    const r = calculateTransferTax(c46(temp46), rates);
    expect(r.redevelopmentDetail?.settlementExemptionApplied).toBe(true);
  });

  it("단독신고는 신축주택 판정을 겹치지 않는다 — 비과세 판정 결과·주택수 제외 steps를 새로 싣지 않는다", () => {
    const r = calculateTransferTax(c46(temp46), rates);
    expect(r.exemptReason).not.toBe("일시적 2주택 고가주택");
    expect(r.exemptReason).not.toBe("일시적 2주택 비과세");
  });
});
