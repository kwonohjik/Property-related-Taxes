/**
 * §154① 요건 게이트 — 혼인 2주택 전면배제(배제2) Pre-Do anchor
 *
 * §167의10①15호: §155⑤ 1세대1주택 의제 중과배제는 "§154①이 적용되는 주택으로서 같은 항의 요건을
 *   모두 충족하는 주택"에 한정 → 양도 주택이 §154①(보유 2년·조정취득 시 거주 2년) 미충족이면 배제 부적용.
 *
 * 엔진: `sellingHouseMeetsOneHouseRequirements`(파이프라인 precompute) 게이트.
 *   미제공 시 충족 간주(?? true) — 직접 호출 하위호환.
 *
 * 현재 코드 red 사유: 배제2가 §154① 충족 여부 무관 발동.
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

const REGULATED = { regionCode: "11680" };

function run(input: Parameters<typeof determineMultiHouseSurcharge>[0]) {
  return determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
}

function base() {
  return makeInput([makeHouse("h1", REGULATED), makeHouse("h2")], {
    sellingHouseId: "h1",
    marriageMerge: { marriageDate: new Date("2021-06-01") }, // 혼인 3년전 (10년 이내)
  });
}

describe("#154 §154① 요건 게이트 — 혼인 2주택 전면배제(배제2)", () => {
  it("C-154-met: §154① 충족 → 1세대1주택 의제 전면배제", () => {
    const r = run({ ...base(), sellingHouseMeetsOneHouseRequirements: true });
    expect(r.surchargeApplicable).toBe(false);
    expect(r.exclusionReasons[0]?.type).toBe("marriage_merge");
  });

  it("C-154-notmet: §154① 미충족(보유<2년 등) → 배제 부적용 → 2주택 중과", () => {
    const r = run({ ...base(), sellingHouseMeetsOneHouseRequirements: false });
    expect(r.surchargeApplicable).toBe(true);
    expect(r.surchargeType).toBe("multi_house_2");
    expect(r.exclusionReasons).toHaveLength(0);
  });

  it("C-154-undefined: 미제공 → 충족 간주(직접호출 하위호환) → 전면배제", () => {
    const r = run(base());
    expect(r.surchargeApplicable).toBe(false);
    expect(r.exclusionReasons[0]?.type).toBe("marriage_merge");
  });
});
