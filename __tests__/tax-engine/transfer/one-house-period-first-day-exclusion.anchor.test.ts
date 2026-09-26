/**
 * anchor — 「종전주택을 취득한 날부터 1년 이상이 지난 후」 초일불산입 (리뷰 OH-00 · OH-46)
 *
 * 계획서: docs/00-pm/one-house-exemption-fix.plan.md §1 유형 A
 *
 * 국세기본법 §4 → 민법 §157: 기간은 종전주택 취득일 **다음날**부터 기산하고, 1년은 그 응당일의
 * 전날 = 취득일의 응당일에 만료한다(§160②). 「지난 후」는 그 **다음날부터**다.
 *   - 조심2019서1704: 종전 2015.3.31. → 2016.3.31. 대체주택 취득 = 「1년이 지나지 않은」 날(기각)
 *   - 조심2020서1405 · 서면2017법령해석재산-785(「종전주택을 취득한 날인 초일은 산입하지 않는 것」)
 * §156의2③·§156의3②는 문언이 같다. 그 조항의 직접 선례는 **미확보**다(계획서 §7-1 — 문언 동일 + 일반원칙).
 *
 * 종전 코드는 `신규취득일 >= addYears(종전취득일, 1)`이라 응당일 취득을 충족으로 봤다(하루 과다).
 * 모든 케이스는 **응당일(부정) ↔ 다음날(긍정)** 짝이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { resolveDeemedOneHouseBy155 } from "@/lib/tax-engine/transfer-tax-exemption-requirements";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { judgeTempTwoHouseFromForm } from "@/lib/calc/transfer-temp-two-house-judge";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** 조심2019서1704 사실관계 — 비조정·5억(12억 이하 → 충족 시 전액 비과세) */
function tempTwoHouse(newAcquisitionDate: string, over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 2,
    transferPrice: 500_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: D("2015-03-31"),
    transferDate: D("2018-06-15"),
    isRegulatedArea: false,
    residencePeriodMonths: 0,
    temporaryTwoHouse: {
      previousAcquisitionDate: D("2015-03-31"),
      newAcquisitionDate: D(newAcquisitionDate),
    },
    ...over,
  });
}

describe("OH-00 §155① 요건 A — 엔진 E-3", () => {
  it("🔴 응당일(2016-03-31) 신규 취득은 1년 미경과 → 과세 (조심2019서1704)", () => {
    const r = calculateTransferTax(tempTwoHouse("2016-03-31"), rates);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("✅ 다음날(2016-04-01) 신규 취득은 1년 경과 → 일시적 2주택 비과세", () => {
    const r = calculateTransferTax(tempTwoHouse("2016-04-01"), rates);
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("일시적 2주택 비과세");
  });

  it("🔴 2/29 취득 → 2021-02-28(§160③ 만료일) 신규 취득은 미경과 → 과세", () => {
    const over = { acquisitionDate: D("2020-02-29"), transferDate: D("2023-06-01") };
    const r = calculateTransferTax(
      tempTwoHouse("2021-02-28", {
        ...over,
        temporaryTwoHouse: { previousAcquisitionDate: D("2020-02-29"), newAcquisitionDate: D("2021-02-28") },
      }),
      rates,
    );
    expect(r.isExempt).toBe(false);
  });

  it("✅ 2/29 취득 → 2021-03-01 신규 취득은 경과 → 비과세", () => {
    const r = calculateTransferTax(
      tempTwoHouse("2021-03-01", {
        acquisitionDate: D("2020-02-29"),
        transferDate: D("2023-06-01"),
        temporaryTwoHouse: { previousAcquisitionDate: D("2020-02-29"), newAcquisitionDate: D("2021-03-01") },
      }),
      rates,
    );
    expect(r.isExempt).toBe(true);
  });
});

describe("OH-00 같은 술어의 다른 소비처 — 결과가 엔진과 같아야 한다", () => {
  const rules = {
    temporary_two_house: {
      disposalDeadlineYears: 3,
      regulatedAreaDeadlineYears: 2,
      regulatedAreaRelaxDate: "2022-05-10",
      regulatedAreaRelaxDeadlineYears: 3,
    },
  } as unknown as OneHouseSpecialRulesData;

  it("중과 배제 선판정(resolveDeemedOneHouseBy155): 응당일 ✗ · 다음날 ✓", () => {
    expect(resolveDeemedOneHouseBy155(tempTwoHouse("2016-03-31"), rules)).toBeUndefined();
    expect(resolveDeemedOneHouseBy155(tempTwoHouse("2016-04-01"), rules)).toBe("temporary_two_house");
  });

  const form = (newHouseAcquisitionDate: string) =>
    judgeTempTwoHouseFromForm({
      previousAcquisitionDate: "2015-03-31",
      newHouseAcquisitionDate,
      transferDate: "2018-06-15",
      provisoReason: "",
      provisoDepartureDate: "",
      provisoExpropriationDate: "",
      provisoBusinessApprovalDate: "",
      residencePeriodMonths: "0",
    });

  it("UI 판정 카드: 응당일 ✗ · 다음날 ✓", () => {
    const miss = form("2016-03-31");
    const hit = form("2016-04-01");
    expect(miss.status === "ineligible" && !miss.oneYearMet).toBe(true);
    expect(hit.status === "eligible" && hit.oneYearMet).toBe(true);
  });

  it("「1년 경과일」 표시는 최초 충족일(2016-04-01)이다 — TemporaryTwoHouseSection 표시 계약", () => {
    const v = form("2016-03-31");
    if (v.status === "pending") throw new Error("pending");
    expect(v.oneYearThreshold.toISOString().slice(0, 10)).toBe("2016-04-01");
  });
});

describe("OH-46 §156의2③·§156의3② — 권리 취득 1년 요건", () => {
  /** 종전주택 2015-06-01 취득 · 입주권 취득 · 2018-06-01 양도(3년 이내) · 9억 */
  function withRight(rightAcquisitionDate: string): TransferTaxInput {
    return baseTransferInput({
      propertyType: "housing",
      isOneHousehold: true,
      householdHousingCount: 1,
      transferPrice: 900_000_000,
      acquisitionPrice: 400_000_000,
      acquisitionDate: D("2015-06-01"),
      transferDate: D("2018-06-01"),
      residencePeriodMonths: 36,
      presaleRights: [
        { id: "r1", type: "redevelopment_right", acquisitionDate: D(rightAcquisitionDate), region: "capital" },
      ],
    });
  }

  it("🔴 응당일(2016-06-01) 입주권 취득 → 1년 미경과 → §89② 배제 · 과세", () => {
    expect(resolveArticle89Clause2(withRight("2016-06-01"), undefined).status).toBe("excluded");
    const r = calculateTransferTax(withRight("2016-06-01"), rates);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("✅ 다음날(2016-06-02) 취득 → §156의2③ 충족 → 비과세", () => {
    expect(resolveArticle89Clause2(withRight("2016-06-02"), undefined)).toMatchObject({
      status: "exception_met",
      exception: "소득세법 시행령 §156의2 ③",
    });
    const r = calculateTransferTax(withRight("2016-06-02"), rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("분양권(§156의3②)도 같은 경계 — leaf 직접", () => {
    const presale = (d: string) =>
      resolveArticle89Clause2(
        {
          ...withRight(d),
          presaleRights: [{ id: "p1", type: "presale_right", acquisitionDate: D(d), region: "capital" }],
          acquisitionDate: D("2021-06-01"),
          transferDate: D("2023-06-01"),
        },
        D("2021-01-01"),
      );
    expect(presale("2022-06-01").status).toBe("excluded");
    expect(presale("2022-06-02")).toMatchObject({ status: "exception_met", exception: "소득세법 시행령 §156의3 ②" });
  });
});
