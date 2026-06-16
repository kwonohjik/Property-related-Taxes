/**
 * #2b 혼인 합가 배우자 분양권/입주권 차감 — Pre-Do anchor (§167의4⑤)
 *
 * §167의4⑤: 주택+조합원입주권+분양권 합이 혼인일 현재 3↑ → 혼인일 5년내 양도 시
 *   양도일 현재 배우자 보유 주택·입주권·분양권 수(§167의4②에 따른 산입분)를 차감. 단서: 5년내 신규취득.
 *
 * 엔진: countEffectiveHouses의 effectiveHouseCount는 주택+산입 분양권 합 → 게이트 재사용.
 *   Step 1.5에 배우자 산입 분양권 차감 추가(#2a 주택차감과 결합) + 단서에 분양권 취득 포함.
 *
 * 현재 코드 red 사유: #2a는 배우자 주택만 차감, 분양권 미차감.
 */

import { describe, it, expect } from "vitest";
import {
  determineMultiHouseSurcharge,
  type PresaleRight,
} from "@/lib/tax-engine/multi-house-surcharge";
import {
  defaultRules,
  mockRegulatedHistory,
  suspensionNone,
  makeHouse,
  makeInput,
} from "../_helpers/multi-house-mock";

const REGULATED = { regionCode: "11680" };

function makeRight(id: string, overrides?: Partial<PresaleRight>): PresaleRight {
  return {
    id,
    type: "presale_right",
    acquisitionDate: new Date("2022-01-01"),
    region: "capital", // REGION → 가액무관 산입
    ...overrides,
  };
}

function run(input: Parameters<typeof determineMultiHouseSurcharge>[0]) {
  return determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
}

const spouseRights = (r: ReturnType<typeof run>) => r.excludedPresaleRights ?? [];

describe("#2b §167의4⑤ 혼인 배우자 분양권/입주권 차감", () => {
  it("B-소멸-권: 본인1주택(양도)+배우자2분양권 → 권리2 차감 → count 1 → 중과 없음", () => {
    const r = run(
      makeInput([makeHouse("self", REGULATED)], {
        sellingHouseId: "self",
        marriageMerge: { marriageDate: new Date("2022-06-01") },
        presaleRights: [
          makeRight("r1", { isSpouseOwned: true }),
          makeRight("r2", { isSpouseOwned: true }),
        ],
      }),
    );
    expect(r.effectiveHouseCount).toBe(1);
    expect(r.surchargeApplicable).toBe(false);
    expect(spouseRights(r)).toHaveLength(2);
  });

  it("B-혼합: 본인1주택(양도)+배우자1주택+배우자1분양권 → 주택1·권리1 차감 → count 1", () => {
    const r = run(
      makeInput([makeHouse("self", REGULATED), makeHouse("spH", { isSpouseOwned: true })], {
        sellingHouseId: "self",
        marriageMerge: { marriageDate: new Date("2022-06-01") },
        presaleRights: [makeRight("spR", { isSpouseOwned: true })],
      }),
    );
    expect(r.effectiveHouseCount).toBe(1);
    expect(r.surchargeApplicable).toBe(false);
    expect(r.excludedHouses.filter((e) => e.reason === "spouse_marriage_subtraction")).toHaveLength(1);
    expect(spouseRights(r)).toHaveLength(1);
  });

  it("B-단서-권: 혼인 5년내 신규 분양권 취득 → ⑤ 미적용 → count 3 유지", () => {
    const r = run(
      makeInput([makeHouse("self", REGULATED)], {
        sellingHouseId: "self",
        marriageMerge: { marriageDate: new Date("2022-06-01") },
        presaleRights: [
          makeRight("r1", { isSpouseOwned: true }),
          makeRight("r2", { isSpouseOwned: true, acquisitionDate: new Date("2023-01-01") }), // 혼인 후 취득
        ],
      }),
    );
    expect(r.effectiveHouseCount).toBe(3);
    expect(r.surchargeType).toBe("multi_house_3plus");
    expect(spouseRights(r)).toHaveLength(0);
  });

  it("B-5y-권: 혼인 6년전 → 5년 경과 → ⑤ 미적용", () => {
    const r = run(
      makeInput([makeHouse("self", REGULATED)], {
        sellingHouseId: "self",
        marriageMerge: { marriageDate: new Date("2018-01-01") },
        presaleRights: [
          makeRight("r1", { isSpouseOwned: true }),
          makeRight("r2", { isSpouseOwned: true }),
        ],
      }),
    );
    expect(r.effectiveHouseCount).toBe(3);
    expect(r.surchargeType).toBe("multi_house_3plus");
    expect(spouseRights(r)).toHaveLength(0);
  });

  it("B-VALUE-무차감: 배우자 저가(VALUE 3억↓) 분양권은 미산입 → 차감 대상 아님", () => {
    const r = run(
      makeInput([makeHouse("self", REGULATED), makeHouse("h2"), makeHouse("h3")], {
        sellingHouseId: "self",
        marriageMerge: { marriageDate: new Date("2022-06-01") },
        presaleRights: [
          makeRight("rLow", {
            isSpouseOwned: true,
            region: "non_capital",
            regionCriteria: "VALUE",
            rightValue: 200_000_000, // 3억 이하 → 미산입
          }),
        ],
      }),
    );
    // count = 본인3주택 + 0(저가권 미산입) = 3, 배우자 주택 0 → 차감 0
    expect(r.effectiveHouseCount).toBe(3);
    expect(r.surchargeType).toBe("multi_house_3plus");
    expect(spouseRights(r)).toHaveLength(0);
  });
});
