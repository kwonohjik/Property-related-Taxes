/**
 * Pre-Do Anchor — 다주택 중과 미구현 #1 나목(준공후미분양) 상수 정정 실증
 *
 * 설계: docs/02-design/features/multi-house-surcharge-gaps.engine.design.md §4 #1
 * 법령: 소득세법 시행령 §167의3①12나목 (MST 286211) — 2024.1.10~**2026.12.31** 취득·취득가 **7억**↓·전용 85㎡↓·수도권 밖
 * 현행 버그: helpers.ts:341 (acqDate <= 2025-12-31) · :344 (acquisitionPrice <= 600_000_000)
 *
 * 이 anchor는 **수정 전 FAIL**(갭 실증), **수정 후 PASS** 해야 한다.
 * 엔진 레벨 검증(기존 HouseInfo 필드 acquisitionPrice·exclusiveArea·isUnsoldNewHouse 직접 주입) —
 * UI/API 입력경로(14지점)는 별도 E2E.
 */

import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import {
  defaultRules,
  mockRegulatedHistory,
  suspensionNone,
  makeHouse,
  makeInput,
} from "../_helpers/multi-house-mock";

const SELLING = "11680"; // 강남구 조정대상지역(미해제)

describe("Pre-Do #1-나: 준공후미분양 7억·2026.12.31 (§167의3①12나목)", () => {
  it("비수도권 미분양·2026-06 취득·전용 80㎡·취득가 7억 → small_new_house 배제 (현행 FAIL: 6억·2025 컷)", () => {
    const selling = makeHouse("h1", { regionCode: SELLING });
    const unsoldNew = makeHouse("h2", {
      region: "non_capital",
      isApartment: false,
      acquisitionDate: new Date("2026-06-01"),
      acquisitionPrice: 700_000_000, // 나목 한도 7억 경계
      exclusiveArea: 80, // ≤ 85㎡
      isUnsoldNewHouse: true,
      // officialPrice 기본 300M (> non_capital 100M) → 저가배제 통과, small_new_house 도달
    });
    const input = makeInput([selling, unsoldNew], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-07-01"),
    });

    const r = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(r.excludedHouses.find((e) => e.reason === "small_new_house")?.houseId).toBe("h2");
    expect(r.effectiveHouseCount).toBe(1);
  });

  it("취득가 700,000,001 (7억 초과) → 미배제·산입 (경계 가드)", () => {
    const selling = makeHouse("h1", { regionCode: SELLING });
    const over = makeHouse("h2", {
      region: "non_capital",
      isApartment: false,
      acquisitionDate: new Date("2026-06-01"),
      acquisitionPrice: 700_000_001, // 7억 초과
      exclusiveArea: 80,
      isUnsoldNewHouse: true,
    });
    const input = makeInput([selling, over], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-07-01"),
    });

    const r = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(r.excludedHouses.find((e) => e.reason === "small_new_house")).toBeUndefined();
    expect(r.effectiveHouseCount).toBe(2);
  });
});
