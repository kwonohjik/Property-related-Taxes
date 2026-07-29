/**
 * Pre-Do anchor — 다주택 중과 한시배제 "보유 2년 이상" 요건 게이트.
 *
 * 근거: 소득세법 시행령 §167의3①12의2 · §167의10①12의2 (KoreanLaw 실측 2026-07-19)
 *   "법 제95조제4항에 따른 보유기간이 2년 이상인 주택으로서 가. 2026년 5월 9일까지 양도하는 주택"
 * 계획서: docs/02-design/features/transfer-surcharge-grace-period-ui-hide.plan.md §2-A·§4-A-3·§7
 *
 * 배제기간 내 양도라도 보유 2년 미만이면 배제(suspension) 미적용이어야 한다.
 * 수정 전(RED): 엔진이 보유기간을 무시(양도일만) → 보유 1년11개월도 배제됨.
 * 수정 후(GREEN): 보유<2년 → surchargeApplicable=true.
 */
import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import {
  defaultRules,
  mockRegulatedHistory,
  suspensionActive,
  makeHouse,
  makeInput,
} from "../_helpers/multi-house-mock";

describe("한시배제 보유2년 게이트 (§167의3·167의10 12의2)", () => {
  const within = new Date("2025-06-01"); // 배제기간 내 (2022-05-10 ~ 2026-05-09)

  it("보유 3년(≥2년) + 배제기간 내 양도 → 중과 배제 (surchargeApplicable=false)", () => {
    const h1 = makeHouse("h1", { acquisitionDate: new Date("2022-01-01") }); // 보유 3년+
    const input = makeInput([h1, makeHouse("h2"), makeHouse("h3")], {
      sellingHouseId: "h1",
      transferDate: within,
    });
    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    expect(result.effectiveHouseCount).toBe(3);
    expect(result.isSurchargeSuspended).toBe(true);
    expect(result.surchargeApplicable).toBe(false);
  });

  it("보유 1년11개월(<2년) + 배제기간 내 양도 → 배제 미적용, 중과 적용 (surchargeApplicable=true)", () => {
    const h1 = makeHouse("h1", { acquisitionDate: new Date("2023-07-01") }); // 2025-06-01 기준 1년 11개월
    const input = makeInput([h1, makeHouse("h2"), makeHouse("h3")], {
      sellingHouseId: "h1",
      transferDate: within,
    });
    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    expect(result.effectiveHouseCount).toBe(3);
    expect(result.isSurchargeSuspended).toBe(false); // 보유<2년 → 배제 안 됨
    expect(result.surchargeApplicable).toBe(true);
  });

  it("보유 정확히 2년 + 배제기간 내 양도 → 배제 (경계 포함)", () => {
    const h1 = makeHouse("h1", { acquisitionDate: new Date("2023-06-01") }); // 정확히 2년
    const input = makeInput([h1, makeHouse("h2"), makeHouse("h3")], {
      sellingHouseId: "h1",
      transferDate: within,
    });
    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    expect(result.surchargeApplicable).toBe(false);
  });
});
