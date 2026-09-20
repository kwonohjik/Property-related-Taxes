/**
 * F-3 — 소득세법 시행령 §167의10①9호(기준시가 1억 이하 소형주택) 적용 대상·인용 드리프트.
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §10 F-3 · §25.
 *
 * 법문(로컬 캐시 MST 286211 직독):
 * - §167의10① 「…1세대가 소유하는 주택으로서 다음 각 호의 어느 하나에 **해당하지 않는** 주택을 말한다」
 *   ⇒ 각 호는 **양도하는 주택 자신**을 가리킨다.
 * - 9호 「**주택의 양도 당시** 법 제99조에 따른 기준시가가 1억원 이하인 주택.
 *   다만, 「도시 및 주거환경정비법」에 따른 정비구역 … 에 소재하는 주택 … 은 제외한다」
 * - 10호 「1세대가 **제1호부터 제7호까지**의 규정에 해당하는 주택을 제외하고 1개의 주택만을
 *   소유하고 있는 경우 그 해당 주택」 ⇒ **9호는 10호의 인용 범위 밖**이라, 다른 주택이 1억 이하여도
 *   양도 주택이 배제되지는 않는다.
 *
 * 종전 코드는 **다른 주택**의 `officialPrice`(취득 시 값)를 봤다 — 양방향 오류였다(fallback 세율 ·
 * 조정지역 2주택 · 2026-08-01 양도 · 양도가 8억):
 *
 * | 입력 | 종전 | 법령 |
 * |---|---|---|
 * | 양도주택 5억 · 다른 주택 9천만 | 141,966,000 (배제) | **299,816,000** (중과) |
 * | 양도주택 9천만 · 다른 주택 5억 | 299,816,000 (중과) | **141,966,000** (배제) |
 * | 취득 5억 · 양도 당시 9천만 | 299,816,000 | **141,966,000** |
 *
 * 인용도 틀렸다: `TWO_HOUSE_SMALL_HOUSE`가 「§167의10 ⑩」(그 조에 ⑩항은 없다),
 * `THREE_HOUSE_EXCLUSION_SOLE`이 「§167의3 ① 2호 나목 10호」(실제 §167의3①10호).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { MULTI_HOUSE } from "@/lib/tax-engine/legal-codes/transfer";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";
import { defaultRules, makeHouse, makeInput, mockRegulatedHistory, suspensionNone } from "../_helpers/multi-house-mock";

type H = NonNullable<TransferTaxInput["houses"]>[number];

const house = (id: string, over: Partial<H> = {}): H =>
  ({
    id,
    acquisitionDate: new Date("2015-01-01"),
    officialPrice: 500_000_000,
    region: "capital",
    regionCode: "11680",
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  }) as H;

/** 조정지역 2주택 · 양도가 8억 · 2026-08-01 양도(유예 종료 후). */
const two = (selling: Partial<H>, other: Partial<H> = {}): TransferTaxInput =>
  baseTransferInput({
    transferPrice: 800_000_000,
    acquisitionDate: new Date("2015-01-01"),
    transferDate: new Date("2026-08-01"),
    isRegulatedArea: true,
    residencePeriodMonths: 48,
    householdHousingCount: 2,
    houses: [house("selling", selling), house("h2", other)] as TransferTaxInput["houses"],
    sellingHouseId: "selling",
  });

const calc = (i: TransferTaxInput) => calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
const excl = (i: TransferTaxInput) =>
  (calc(i).multiHouseSurchargeEvaluation?.exclusionReasons ?? []).map((e) => e.type);

const EXCLUDED = 141_966_000; // 2주택 중과 배제(일반세율)
const SURCHARGED = 299_816_000; // 2주택 중과

describe("F-3 §167의10①9호 — 배제 대상은 양도하는 주택 자신", () => {
  it("F3-1 양도 주택이 1억 이하 → 배제 (종전 299,816,000)", () => {
    const i = two({ officialPrice: 90_000_000 });
    expect(calc(i).totalTax).toBe(EXCLUDED);
    expect(excl(i)).toContain("low_price_two_house");
  });

  it("F3-2 「양도 당시」 기준시가로 본다 — 취득 시 5억이어도 양도 당시 9천만이면 배제", () => {
    expect(calc(two({ transferOfficialPrice: 90_000_000 })).totalTax).toBe(EXCLUDED);
  });

  it("F3-3 다른 주택이 1억 이하인 것은 배제 근거가 아니다 — 9호는 10호(1~7호) 밖 (종전 141,966,000)", () => {
    const i = two({}, { officialPrice: 90_000_000 });
    expect(calc(i).totalTax).toBe(SURCHARGED);
    expect(excl(i)).not.toContain("low_price_two_house");
  });

  it("F3-4 단서 — 정비구역 소재 주택은 1억 이하여도 배제하지 않는다", () => {
    expect(calc(two({ officialPrice: 90_000_000, isRedevelopmentZone: true })).totalTax).toBe(SURCHARGED);
  });

  it("F3-5 경계 — 정확히 1억은 배제, 1억 + 1원은 중과", () => {
    expect(calc(two({ officialPrice: 100_000_000 })).totalTax).toBe(EXCLUDED);
    expect(calc(two({ officialPrice: 100_000_001 })).totalTax).toBe(SURCHARGED);
  });

  it("F3-5b 기준시가 0은 「1억 이하」가 아니라 미입력 — 배제하지 않고 경고한다", () => {
    const r = calc(two({ officialPrice: 0 }));
    expect(r.totalTax).toBe(SURCHARGED);
    expect(r.multiHouseSurchargeEvaluation?.warnings.some((w) => w.includes("판정하지 못했습니다"))).toBe(true);
    // 값이 있으면 경고는 사라진다(긍정 짝)
    expect(
      (calc(two({ officialPrice: 90_000_000 })).multiHouseSurchargeEvaluation?.warnings ?? []).some((w) =>
        w.includes("판정하지 못했습니다"),
      ),
    ).toBe(false);
  });

  it("F3-6 (대조) 3주택에는 대응 호가 없다 — §167의3①에 9호는 삭제됐다", () => {
    const three = baseTransferInput({
      transferPrice: 800_000_000,
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2026-08-01"),
      isRegulatedArea: true,
      residencePeriodMonths: 48,
      householdHousingCount: 3,
      houses: [
        house("selling", { officialPrice: 90_000_000 }),
        house("h2"),
        house("h3", { acquisitionDate: new Date("2013-01-01") }),
      ] as TransferTaxInput["houses"],
      sellingHouseId: "selling",
    });
    expect(calc(three).multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(true);
  });
});

describe("F-3 인용 정정", () => {
  it("F3-7 §167의10①9호 · §167의3①10호", () => {
    expect(MULTI_HOUSE.TWO_HOUSE_SMALL_HOUSE).toBe("소득세법 시행령 §167의10①9호");
    expect(MULTI_HOUSE.THREE_HOUSE_EXCLUSION_SOLE).toBe("소득세법 시행령 §167의3①10호");
    const detail = (calc(two({ officialPrice: 90_000_000 })).multiHouseSurchargeEvaluation?.exclusionReasons ?? [])
      .map((e) => e.detail)
      .join(" ");
    expect(detail).toContain("§167의10①9호");
  });

  it("F3-8 3주택 「유일한 일반주택」 사유는 §167의3①10호 문언(1호~8호·8호의2)을 그대로 쓴다", () => {
    const r = determineMultiHouseSurcharge(
      makeInput(
        [
          makeHouse("selling", { regionCode: "11680" }),
          makeHouse("h2", { regionCode: "11680", isEmployeeHousing: true, freeProvisionYears: 12 }),
          makeHouse("h3", { regionCode: "11680", isCulturalHeritage: true }),
        ],
        { transferDate: new Date("2026-08-01"), sellingHouseId: "selling" },
      ),
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );
    const detail = r.exclusionReasons.map((e) => e.detail).join(" ");
    expect(r.exclusionReasons.map((e) => e.type)).toContain("only_one_remaining");
    expect(detail).toContain("§167의3①10호");
    expect(detail).toContain("8호의2");
    expect(detail).not.toContain("①~⑨");
  });
});
