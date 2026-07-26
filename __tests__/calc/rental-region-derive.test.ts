/**
 * deriveRentalRegionFromCode — 임대주택 소재지역(수도권/비수도권) 자동판별 anchor.
 * 계획서: docs/02-design/features/transfer-rental-region-auto-derive.plan.md §7-1
 *
 * 수도권정비계획법 §2: 서울(11)·인천(28)·경기(41) 전역(군 포함) = 수도권.
 * §167의3 classifyRegionCriteriaByCode와 의도적으로 다름 — 아래 대조 anchor로 고정.
 */
import { describe, it, expect } from "vitest";
import {
  deriveRentalRegionFromCode,
  deriveHouseRegionFromCode,
} from "@/lib/calc/house-region";

describe("deriveRentalRegionFromCode — 수도권/비수도권", () => {
  it("서울(11) → seoul-metro", () => {
    expect(deriveRentalRegionFromCode("1168010100")).toBe("seoul-metro");
  });

  it("인천 강화군(28710) → seoul-metro (§167 VALUE 대조)", () => {
    expect(deriveRentalRegionFromCode("2871000000")).toBe("seoul-metro");
    // §167의3에서는 강화군이 VALUE(비수도권 취급)임 — 임대와 반대
    expect(deriveHouseRegionFromCode("2871000000")).toBe("non_capital");
  });

  it("경기 양평군(41830) → seoul-metro (§167 VALUE 대조)", () => {
    expect(deriveRentalRegionFromCode("4183025000")).toBe("seoul-metro");
    expect(deriveHouseRegionFromCode("4183025000")).toBe("non_capital");
  });

  it("부산(26) → non-metro (§167 REGION 대조)", () => {
    expect(deriveRentalRegionFromCode("2611000000")).toBe("non-metro");
    // §167의3에서는 부산이 REGION(수도권·광역시 취급)임 — 임대와 반대
    expect(deriveHouseRegionFromCode("2611000000")).toBe("capital");
  });

  it("세종(36) → non-metro (§167 REGION 대조)", () => {
    expect(deriveRentalRegionFromCode("3611000000")).toBe("non-metro");
    expect(deriveHouseRegionFromCode("3611000000")).toBe("capital");
  });

  it("undefined → seoul-metro (기본값)", () => {
    expect(deriveRentalRegionFromCode(undefined)).toBe("seoul-metro");
  });

  it("빈 문자열 → seoul-metro (guard)", () => {
    expect(deriveRentalRegionFromCode("")).toBe("seoul-metro");
  });
});
