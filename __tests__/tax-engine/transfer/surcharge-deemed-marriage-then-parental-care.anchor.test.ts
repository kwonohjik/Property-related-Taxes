/**
 * D4 이중 합가(혼인 후 동거봉양 합가 3주택 — 서면인터넷방문상담4팀-598)의 다주택 중과 배제 — 영 §167의3①13호.
 *
 * 13호: 「제155조 또는 「조세특례제한법」에 따라 1세대가 국내에 1개의 주택을 소유하고 있는 것으로 보거나 1세대 1주택으로
 * 보아 제154조제1항이 적용되는 주택으로서 같은 항의 요건을 모두 충족하는 주택」. 비과세(E-3.5)가 D4로 1세대1주택으로 보아
 * 12억 초과분만 과세하면 그 주택은 13호로 중과되지 않는다(사용자 결정 2026-10-09). 종전에는 중과 선판정
 * (`resolveDeemedOneHouseBy155`)에 D4가 없어 고가 부분 과세분에 중과세율이 붙었다.
 *
 * | # | 사례 | 기대 |
 * |---|---|---|
 * | S-1 | 혼인 2019 → 동거봉양 2020 · 강남 고가주택 양도(2026-06-15) | 부분 과세 · 중과 배제(13호) · 의제 근거 `marriage_then_parental_care` |
 * | S-2 | 역순(동거봉양 먼저) — 짝 | 의제 없음 · 중과 · 「중첩이 성립하지 않았다」 경고 |
 * | S-3 | 부모 쪽 주택이 지방 3억 이하(중과 주택 수 불산입 — §167의3①1호)라 중과 주택 수 2 | 15호(§167의10①15호)로 배제 |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { resolveSurchargeDeemedOneHouse } from "@/lib/tax-engine/transfer-tax-judgment-steps";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import { makeMockRatesWithHouseEngine, baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const GANGNAM = "1168010100";
const h = (id: string, acq: string, extra: Partial<HouseInfo> = {}): HouseInfo => ({
  id,
  acquisitionDate: D(acq),
  officialPrice: 900_000_000,
  region: "capital",
  regionCode: GANGNAM,
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...extra,
});

const rates = makeMockRatesWithHouseEngine();

const MERGE_WARNING = "3주택 이상 세대의 혼인·동거봉양 합가 특례";

const input = (parentalCareMergeDate = "2020-01-15", parents: Partial<HouseInfo> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 3,
    transferPrice: 2_000_000_000,
    acquisitionPrice: 800_000_000,
    acquisitionDate: D("2015-04-01"),
    transferDate: D("2026-06-15"),
    regionCode: GANGNAM,
    isRegulatedArea: true,
    residencePeriodMonths: 60,
    houses: [
      h("selling", "2015-04-01"),
      h("spouse", "2014-02-01", { mergeOrigin: "counterpart_side" }),
      h("parents", "2005-01-01", { mergeOrigin: "second_merge_side", ...parents }),
    ],
    sellingHouseId: "selling",
    marriageMerge: { marriageDate: D("2019-03-01") },
    parentalCareMerge: { mergeDate: D(parentalCareMergeDate) },
    isFirstTransferredInMerge: true,
  });

describe("D4 이중 합가 — §167의3①13호 중과 배제", () => {
  it("S-1 1세대1주택으로 보아 12억 초과분만 과세 → 중과 배제", () => {
    expect(resolveSurchargeDeemedOneHouse(input(), parseRatesFromMap(rates))).toBe("marriage_then_parental_care");
    const r = calculateTransferTax(input(), rates);
    // 12억 이하분 비과세 · 초과분 과세(고가주택)
    expect(r.isExempt).toBe(false);
    expect(r.exemptReason).toContain("혼인 합가 후 동거봉양 합가");
    expect(r.exemptReason).toContain("고가주택");
    const reasons = r.multiHouseSurchargeDetail?.exclusionReasons ?? [];
    expect(reasons.map((e) => e.detail).join(" ")).toContain("서면인터넷방문상담4팀-598");
    expect(reasons.map((e) => e.detail).join(" ")).toContain("§167의3①13호");
    expect(reasons[0]?.type).toBe("marriage_merge");
    // 기본세율(누진) — 짝(S-2)의 중과세율보다 낮다
    expect(r.appliedRate).toBeLessThan(calculateTransferTax(input("2018-06-01"), rates).appliedRate);
    expect(r.multiHouseSurchargeDetail?.warnings?.join(" ") ?? "").not.toContain(MERGE_WARNING);
  });

  it("S-2 짝 — 역순(동거봉양이 먼저)이면 의제 없음 · 중과", () => {
    expect(resolveSurchargeDeemedOneHouse(input("2018-06-01"), parseRatesFromMap(rates))).toBeUndefined();
    const r = calculateTransferTax(input("2018-06-01"), rates);
    expect(r.multiHouseSurchargeDetail?.exclusionReasons ?? []).toHaveLength(0);
    expect(r.appliedRate).toBe(0.75); // 기본 최고 45% + 3주택 중과 30%p
    expect(r.multiHouseSurchargeDetail?.warnings?.join(" ") ?? "").toContain(MERGE_WARNING);
  });

  it("S-3 중과 주택 수 2(부모 쪽 지방 3억 이하 불산입) → §167의10①15호로 배제", () => {
    const low = { region: "non_capital" as const, regionCode: "4311110100", officialPrice: 200_000_000, isApartment: false };
    const r = calculateTransferTax(input(undefined, low), rates);
    expect(r.multiHouseSurchargeDetail?.effectiveHouseCount).toBe(2);
    const detail = (r.multiHouseSurchargeDetail?.exclusionReasons ?? []).map((e) => e.detail).join(" ");
    expect(detail).toContain("서면인터넷방문상담4팀-598");
    expect(detail).toContain("§167의10①15호");
    expect(r.multiHouseSurchargeDetail?.exclusionReasons[0]?.type).toBe("marriage_merge");
  });
});
