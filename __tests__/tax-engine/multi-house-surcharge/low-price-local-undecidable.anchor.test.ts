/**
 * anchor(엔진 backstop) — 가액기준 주택의 양도 당시 기준시가 0은 「3억 이하」가 아니라 **미입력**이다
 * (계획서 `calc-selling-house-std-price-value-region.plan.md` Q-1 a · PR-2 · SP-5). 9호(`isLowPriceSmallHouseUndecidable`)와 같은 규약.
 *
 * 종전 `resolveLowPriceLocalHouse`는 `price <= 3억`이라 0도 불산입·배제했다 — 계산기 실가 경로에 칸이 없어 늘 0이었다(실측 −190,575,000).
 *
 * - U-1 양도 주택 0 → 산입 · 3주택 이상 중과 · 판정 불가 경고 / U-2 2.5억 → 1호 자기 배제(#2317 회귀)
 * - U-3 다른 행 0 → 산입 · 「다른 보유 주택 1채」 경고 / U-4 다른 행 2억 → 불산입
 * - U-5 지역기준 양도 주택 0 → 1호 경고 없음(9호 경고만 — 2주택)
 * - U-6 설명문 ② — 「입력되지 않아 판정하지 못했습니다」 · 판정 「가액기준 — 기준시가 미입력」
 */
import { describe, it, expect } from "vitest";
import { buildSurchargeNarrative } from "@/lib/tax-engine/multi-house-surcharge-narrative";
import { runMultiHouseSurchargeStep } from "@/lib/tax-engine/transfer-tax-judgment-steps";
import { resolveHceGeneralHouseAcquisitionDate } from "@/lib/tax-engine/transfer-tax-precalc";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";

const TD = new Date("2021-06-01"); // 전주 완산구 조정대상지역(2020-12-18~2022-09-26) · 한시 유예 전
const GANGNAM = "1168010100";
const JEONJU = "4511110100"; // 가액기준
const rates = parseRatesFromMap(loadFallbackTransferRates(TD));
const house = (id: string, regionCode: string, officialPrice: number) => ({
  id, acquisitionDate: new Date("2010-01-01"), officialPrice, region: "capital", regionCode,
  isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false,
});
function input(houses: object[]): TransferTaxInput {
  return baseTransferInput({
    transferDate: TD, acquisitionDate: new Date("2015-01-01"), isOneHousehold: true, isRegulatedArea: true,
    householdHousingCount: houses.length, residencePeriodMonths: 0,
    houses: houses as TransferTaxInput["houses"], sellingHouseId: "selling",
  } as Partial<TransferTaxInput>);
}
function judge(houses: object[]) {
  const i = input(houses);
  const hce = resolveHceGeneralHouseAcquisitionDate(i);
  const headline = runMultiHouseSurchargeStep(i, rates, [], { excluded: false } as never, hce)!;
  return { headline, narrative: buildSurchargeNarrative(i, rates, headline, hce)! };
}
const SELLING_WARNING = /양도 주택의 양도 당시 기준시가가 입력되지 않아 지방 저가주택/;
const ROW_WARNING = /다른 보유 주택 1채의 양도 당시 기준시가가 입력되지 않아/;
const excludedIds = (h: ReturnType<typeof judge>["headline"]) => h.excludedHouses.map((e) => e.houseId);
const reasons = (h: ReturnType<typeof judge>["headline"]) => h.exclusionReasons.map((e) => e.type);

describe("SP-5 1호 — 0은 미입력", () => {
  it("[U-1] 양도 주택 0 → 산입 · 3주택 이상 중과 · 판정 불가 경고", () => {
    const { headline } = judge([house("selling", JEONJU, 0), house("h1", GANGNAM, 500_000_000), house("h2", GANGNAM, 500_000_000)]);
    expect([headline.effectiveHouseCount, headline.surchargeType]).toEqual([3, "multi_house_3plus"]);
    expect(excludedIds(headline)).not.toContain("selling");
    expect(reasons(headline)).not.toContain("low_price_local_house");
    expect(headline.warnings.join("\n")).toMatch(SELLING_WARNING);
  });
  it("[U-2] 양도 주택 2.5억 → 1호 자기 배제(회귀) · 경고 없음", () => {
    const { headline } = judge([house("selling", JEONJU, 250_000_000), house("h1", GANGNAM, 500_000_000), house("h2", GANGNAM, 500_000_000)]);
    expect([headline.surchargeType, reasons(headline)]).toEqual(["none", ["low_price_local_house"]]);
    expect(headline.warnings.join("\n")).not.toMatch(SELLING_WARNING);
  });
  it("[U-3] 다른 행 0 → 산입 · 「다른 보유 주택 1채」 경고", () => {
    const { headline } = judge([house("selling", GANGNAM, 500_000_000), house("h1", JEONJU, 0), house("h2", GANGNAM, 500_000_000)]);
    expect([headline.effectiveHouseCount, excludedIds(headline).includes("h1")]).toEqual([3, false]);
    expect(headline.warnings.join("\n")).toMatch(ROW_WARNING);
    expect(headline.warnings.join("\n")).not.toMatch(SELLING_WARNING);
  });
  it("[U-4] 다른 행 2억 → 불산입(회귀)", () => {
    const { headline } = judge([house("selling", GANGNAM, 500_000_000), house("h1", JEONJU, 200_000_000), house("h2", GANGNAM, 500_000_000)]);
    expect([headline.effectiveHouseCount, excludedIds(headline).includes("h1")]).toEqual([2, true]);
    expect(headline.warnings.join("\n")).not.toMatch(ROW_WARNING);
  });
  it("[U-5] 지역기준 양도 주택 0 → 1호 경고 없음(9호 경고만)", () => {
    const { headline } = judge([house("selling", GANGNAM, 0), house("h1", GANGNAM, 500_000_000)]);
    const w = headline.warnings.join("\n");
    expect(w).not.toMatch(SELLING_WARNING);
    expect(w).toMatch(/1억원 이하 중과배제/);
  });
  it("[U-6] 설명문 ② — 미입력을 말하고 checks에 경고가 간다", () => {
    const { narrative } = judge([house("selling", JEONJU, 0), house("h1", GANGNAM, 500_000_000), house("h2", GANGNAM, 500_000_000)]);
    const criteria = narrative.steps.find((s) => s.id === "criteria")!;
    expect(criteria.verdict).toBe("가액기준 — 기준시가 미입력");
    expect(criteria.sentences.join("\n")).toMatch(/입력되지 않아 한도 이하인지 판정하지 못했습니다/);
    expect(narrative.checks.join("\n")).toMatch(SELLING_WARNING);
  });
});
