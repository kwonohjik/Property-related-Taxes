/**
 * #2a 혼인 합가 주택수 차감 — Pre-Do anchor
 *
 * 법령(MST 286211): §167의3⑨(3주택 5년 배우자 주택수 차감) / §155⑤(2주택 10년 1세대1주택 의제·§167의10①15호)
 * §167의10②=§167의3②~⑧·⑩ 준용(⑨ 미포함) → ⑨는 3주택 전용.
 *
 * 재설계: 오케스트레이터 Step1.5 ⑨차감(originalCount≥3) + marriageSubtractionApplied flag
 *   → exclusion.ts 배제2(§155⑤) 게이트 (effectiveHouseCount===2 && !flag && <=addYears(혼인일,10)).
 *
 * 현재 코드 red 사유: 배제2가 count 무관·5년 기준 발동 → 3주택 전면 과대배제 + 2주택 10년 미반영.
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

const REGULATED = { regionCode: "11680" }; // 서울 강남 — 지정 유지(조정대상)

function run(input: Parameters<typeof determineMultiHouseSurcharge>[0]) {
  return determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
}

function spouseSubtractions(excluded: { reason: string }[]) {
  return excluded.filter((e) => e.reason === "spouse_marriage_subtraction");
}

// ============================================================
// 3주택 §167의3⑨ — 배우자 주택수 차감
// ============================================================

describe("#2a-A: §167의3⑨ 3주택 혼인 5년내 배우자 주택수 차감", () => {
  it("A-소멸: 본인1(양도)+배우자2 → 배우자2 차감 → count 1 → 중과 없음", () => {
    const r = run(
      makeInput(
        [
          makeHouse("self", REGULATED),
          makeHouse("sp1", { isSpouseOwned: true }),
          makeHouse("sp2", { isSpouseOwned: true }),
        ],
        { sellingHouseId: "self", marriageMerge: { marriageDate: new Date("2022-06-01") } },
      ),
    );
    expect(r.effectiveHouseCount).toBe(1);
    expect(r.surchargeApplicable).toBe(false);
    expect(spouseSubtractions(r.excludedHouses)).toHaveLength(2);
  });

  it("A-2잔존: 본인2+배우자1(양도=본인) → 배우자1 차감 → count 2 → 2주택 중과(전면배제 ✗)", () => {
    const r = run(
      makeInput(
        [
          makeHouse("self", REGULATED),
          makeHouse("self2"),
          makeHouse("sp1", { isSpouseOwned: true }),
        ],
        { sellingHouseId: "self", marriageMerge: { marriageDate: new Date("2022-06-01") } },
      ),
    );
    expect(r.effectiveHouseCount).toBe(2);
    expect(r.surchargeApplicable).toBe(true);
    expect(r.surchargeType).toBe("multi_house_2");
    expect(r.exclusionReasons).toHaveLength(0);
    expect(spouseSubtractions(r.excludedHouses)).toHaveLength(1);
  });

  it("A-단서: 혼인 5년내 신규주택 취득 → ⑨ 미적용 → count 3 유지", () => {
    const r = run(
      makeInput(
        [
          makeHouse("self", REGULATED),
          makeHouse("sp1", { isSpouseOwned: true }),
          makeHouse("sp2", { isSpouseOwned: true, acquisitionDate: new Date("2023-01-01") }),
        ],
        { sellingHouseId: "self", marriageMerge: { marriageDate: new Date("2022-06-01") } },
      ),
    );
    expect(r.effectiveHouseCount).toBe(3);
    expect(r.surchargeType).toBe("multi_house_3plus");
    expect(spouseSubtractions(r.excludedHouses)).toHaveLength(0);
  });

  it("A-5y: 혼인 6년전 양도 → 5년 경과 → ⑨ 미적용 → 3주택 중과", () => {
    const r = run(
      makeInput(
        [
          makeHouse("self", REGULATED),
          makeHouse("sp1", { isSpouseOwned: true }),
          makeHouse("sp2", { isSpouseOwned: true }),
        ],
        { sellingHouseId: "self", marriageMerge: { marriageDate: new Date("2018-01-01") } },
      ),
    );
    expect(r.effectiveHouseCount).toBe(3);
    expect(r.surchargeType).toBe("multi_house_3plus");
    expect(spouseSubtractions(r.excludedHouses)).toHaveLength(0);
  });

  it("A-차감0: 본인3(양도)+배우자0 → 차감 없음(flag false) → 3주택 중과", () => {
    const r = run(
      makeInput([makeHouse("self", REGULATED), makeHouse("h2"), makeHouse("h3")], {
        sellingHouseId: "self",
        marriageMerge: { marriageDate: new Date("2022-06-01") },
      }),
    );
    expect(r.effectiveHouseCount).toBe(3);
    expect(r.surchargeType).toBe("multi_house_3plus");
    expect(spouseSubtractions(r.excludedHouses)).toHaveLength(0);
  });

  it("A-4to3: 본인3+배우자1 → 배우자1 차감 → count 3 → 3주택 중과(Step5 ⑩ 미해당)", () => {
    const r = run(
      makeInput(
        [
          makeHouse("self", REGULATED),
          makeHouse("self2"),
          makeHouse("self3"),
          makeHouse("sp1", { isSpouseOwned: true }),
        ],
        { sellingHouseId: "self", marriageMerge: { marriageDate: new Date("2022-06-01") } },
      ),
    );
    expect(r.effectiveHouseCount).toBe(3);
    expect(r.surchargeType).toBe("multi_house_3plus");
    expect(spouseSubtractions(r.excludedHouses)).toHaveLength(1);
  });
});

// ============================================================
// 2주택 §155⑤ — 1세대1주택 의제 전면배제 (10년)
// ============================================================

describe("#2a-B: §155⑤ 2주택 혼인합가 1세대1주택 의제 (10년)", () => {
  it("A-155-7y: 1+1=2, 혼인 7년전 → 10년 이내 전면배제", () => {
    const r = run(
      makeInput([makeHouse("h1", REGULATED), makeHouse("h2")], {
        sellingHouseId: "h1",
        marriageMerge: { marriageDate: new Date("2017-06-01") },
      }),
    );
    expect(r.surchargeApplicable).toBe(false);
    expect(r.exclusionReasons[0]?.type).toBe("marriage_merge");
  });

  it("A-155-10y경계: 혼인일 + 정확히 10년 → 이내(경계 포함) 전면배제", () => {
    const r = run(
      makeInput([makeHouse("h1", REGULATED), makeHouse("h2")], {
        sellingHouseId: "h1",
        marriageMerge: { marriageDate: new Date("2014-06-01") }, // +10년 = 2024-06-01 = transferDate
      }),
    );
    expect(r.surchargeApplicable).toBe(false);
    expect(r.exclusionReasons[0]?.type).toBe("marriage_merge");
  });
});
