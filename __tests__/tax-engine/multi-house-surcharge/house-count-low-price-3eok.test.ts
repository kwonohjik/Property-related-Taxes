/**
 * 회귀: 지방(VALUE) 저가주택 주택 수 배제 — 기준시가 3억 (소득세법 시행령 §167의3①1호)
 *
 * 버그: production seed·schema가 non_capital 1억만 정의(3억 local 미배선 = dead code) →
 *   ① 지방 저가주택 배제를 1억 기준으로 오적용(법령 3억) — 납세자 불리
 *   ② regionCode 있는 주택은 else-if(!regionCode) 게이트로 배제 자체 누락
 * 정정: VALUE 분기를 단일 3억 기준(local ?? non_capital)으로 통합, regionCode 유무 무관 적용 +
 *   seed non_capital 1억→3억.
 */

import { describe, it, expect } from "vitest";
import {
  classifyRegionCriteriaByCode,
  countEffectiveHouses,
} from "@/lib/tax-engine/multi-house-surcharge-count";
import type { HouseCountExclusionRules } from "@/lib/tax-engine/multi-house-surcharge";
import { transferTaxSeeds } from "@/lib/tax-engine/data/transfer-rate-seed";
import { makeHouse } from "../_helpers/multi-house-mock";

// production seed와 동일: non_capital=3억, local 미제공(dead) — 실 런타임 재현
const prodRules: HouseCountExclusionRules = {
  type: "house_count_exclusion",
  inheritedHouseYears: 5,
  rentalHousingExempt: true,
  lowPriceThreshold: { capital: null, non_capital: 300_000_000 },
  presaleRightStartDate: "2021-01-01",
  officetelStartDate: "2022-01-01",
};
const TRANSFER = new Date("2024-06-01");
const GANGNAM = "1168010100"; // REGION
const GIJANG = "2671010100"; // 부산 기장군 — VALUE(광역시 소속 군)

describe("§167의3①1호 지방 저가주택 3억 배제", () => {
  it("기장군 10자리 regionCode → VALUE", () => {
    expect(classifyRegionCriteriaByCode(GIJANG)).toBe("VALUE");
  });

  it("[정정] regionCode(기장) 지방주택 2.5억 → 배제 (종전 dead code로 미배제)", () => {
    const selling = makeHouse("selling", { regionCode: GANGNAM, officialPrice: 1_500_000_000 });
    const gun = makeHouse("gun", { regionCode: GIJANG, officialPrice: 250_000_000 });
    const { count, excluded } = countEffectiveHouses([selling, gun], TRANSFER, [], prodRules);
    expect(excluded.some((e) => e.houseId === "gun")).toBe(true);
    expect(excluded.find((e) => e.houseId === "gun")?.reason).toBe("low_price_local_300");
    expect(count).toBe(1);
  });

  it("regionCode(기장) 지방주택 3.5억(>3억) → 산입", () => {
    const selling = makeHouse("selling", { regionCode: GANGNAM, officialPrice: 1_500_000_000 });
    const gun = makeHouse("gun", { regionCode: GIJANG, officialPrice: 350_000_000 });
    const { count } = countEffectiveHouses([selling, gun], TRANSFER, [], prodRules);
    expect(count).toBe(2);
  });

  it("[정정] region-only 지방주택 2.5억 → 3억 기준 배제 (종전 1억 기준 미배제)", () => {
    const selling = makeHouse("selling", { region: "capital", officialPrice: 1_500_000_000 });
    const local = makeHouse("local", { region: "non_capital", officialPrice: 250_000_000 });
    const { count, excluded } = countEffectiveHouses([selling, local], TRANSFER, [], prodRules);
    expect(excluded.some((e) => e.houseId === "local")).toBe(true);
    expect(excluded.find((e) => e.houseId === "local")?.reason).toBe("low_price_non_capital");
    expect(count).toBe(1);
  });

  it("REGION(강남) 2.5억 → 가액 불문 산입", () => {
    const selling = makeHouse("selling", { regionCode: GANGNAM, officialPrice: 1_500_000_000 });
    const seoul = makeHouse("seoul", { regionCode: GANGNAM, officialPrice: 250_000_000 });
    const { count } = countEffectiveHouses([selling, seoul], TRANSFER, [], prodRules);
    expect(count).toBe(2);
  });

  it("seed house_count_exclusion.lowPriceThreshold.non_capital = 3억 (법령 정합 가드)", () => {
    const seed = transferTaxSeeds.find(
      (s) => s.category === "special" && s.sub_category === "house_count_exclusion",
    );
    const rules = seed?.special_rules as { lowPriceThreshold: { non_capital: number } } | undefined;
    expect(rules?.lowPriceThreshold.non_capital).toBe(300_000_000);
  });
});
