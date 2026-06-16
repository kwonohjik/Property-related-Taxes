/**
 * Pre-Do Anchor — 양도세 다주택 중과 주택 입력 위젯 구축 설계 가정 실증
 *
 * 목적: UI 위젯(houses[] inheritedDate·rentalType·gracePeriod) 구축 전,
 *       엔진이 해당 필드를 어떻게 소비하는지 계약(contract)을 고정한다.
 *       이 anchor가 통과해야 P0 설계(inheritedDate 필수·gracePeriod wiring)가 정당화된다.
 *
 * 검증 대상:
 *   A1 — isInherited=true 이지만 inheritedDate 없으면 상속5년 배제 미발동 (UI가 날짜를 줘야 함)
 *   A2 — inheritedDate 5년 이내면 inherited_5years 배제 발동
 *   A3a — gracePeriod 조건 미충족 + 유예활성 → suspended=false (중과 적용)
 *   A3b — gracePeriod 조건 충족(토지허가+임차인) → suspended=true (중과 유예)
 *   A3c — gracePeriod 미제공 + 유예활성 + 윈도우 내 → blanket suspended=true (현행 동작)
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

// 강남구(11680) = 조정대상지역(지정 2017.8.3, 미해제), 양도일 2024-06-01
const SELLING = "11680";

describe("Pre-Do A1: inheritedDate 없으면 상속5년 배제 미발동 (P0 inheritedDate 필요성 입증)", () => {
  it("isInherited=true · inheritedDate 없음 → excludedHouses에 inherited_5years 없음, 2주택 유지", () => {
    const selling = makeHouse("h1", { regionCode: SELLING });
    const inheritedNoDate = makeHouse("h2", { isInherited: true }); // inheritedDate 미제공
    const input = makeInput([selling, inheritedNoDate], { sellingHouseId: "h1" });

    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionActive, true);

    expect(r.excludedHouses.find((e) => e.reason === "inherited_5years")).toBeUndefined();
    expect(r.effectiveHouseCount).toBe(2);
  });
});

describe("Pre-Do A2: inheritedDate 5년 이내 → inherited_5years 배제", () => {
  it("inheritedDate=2022-01-01 (양도 2024-06-01, 5년 미경과) → 상속주택 제외", () => {
    const selling = makeHouse("h1", { regionCode: SELLING });
    const inherited = makeHouse("h2", {
      isInherited: true,
      inheritedDate: new Date("2022-01-01"),
    });
    const input = makeInput([selling, inherited], { sellingHouseId: "h1" });

    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionActive, true);

    const ex = r.excludedHouses.find((e) => e.houseId === "h2");
    expect(ex?.reason).toBe("inherited_5years");
  });
});

describe("Pre-Do A-presale: 분양권·입주권 주택 수 산입 (2021.1.1 이후)", () => {
  it("1주택 + 분양권(2022 취득) → 유효 2주택 (presaleRights 산입)", () => {
    const selling = makeHouse("h1", { regionCode: SELLING });
    const input = makeInput([selling], {
      sellingHouseId: "h1",
      presaleRights: [
        { id: "p1", type: "presale_right", acquisitionDate: new Date("2022-03-01"), region: "capital" },
      ],
    });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionActive, true);
    expect(r.effectiveHouseCount).toBe(2);
  });

  it("1주택 + 분양권(2020 취득, 산정시작 전) → 유효 1주택 (미산입)", () => {
    const selling = makeHouse("h1", { regionCode: SELLING });
    const input = makeInput([selling], {
      sellingHouseId: "h1",
      presaleRights: [
        { id: "p1", type: "presale_right", acquisitionDate: new Date("2020-06-01"), region: "capital" },
      ],
    });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionActive, true);
    expect(r.effectiveHouseCount).toBe(1);
  });
});

describe("Pre-Do A3: gracePeriod 정밀 유예 판정 (P0 gracePeriod wiring 입증)", () => {
  // 조정지역 2주택 (둘 다 capital → REGION 기준 항상 산입)
  const twoHouses = () => [
    makeHouse("h1", { regionCode: SELLING }),
    makeHouse("h2"),
  ];

  it("A3a: gracePeriod 조건 미충족(계약일 2026-06-01 만료 후·토지허가X) → suspended=false, 중과 적용", () => {
    const input = makeInput(twoHouses(), {
      sellingHouseId: "h1",
      transferDate: new Date("2024-06-01"),
      gracePeriod: {
        contractDate: new Date("2026-06-01"), // 2026-05-09 이후 → 조건B 불가
        isLandPermitArea: false,
        hasTenantInResidence: false,
      },
    });

    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionActive, true);

    expect(r.surchargeApplicable).toBe(true);
    expect(r.isSurchargeSuspended).toBe(false);
  });

  it("A3b: gracePeriod 조건 충족(토지거래허가구역+임차인 거주) → suspended=true", () => {
    const input = makeInput(twoHouses(), {
      sellingHouseId: "h1",
      transferDate: new Date("2024-06-01"),
      gracePeriod: {
        contractDate: new Date("2024-01-01"),
        isLandPermitArea: true,
        hasTenantInResidence: true,
      },
    });

    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionActive, true);

    expect(r.isSurchargeSuspended).toBe(true);
  });

  it("A3d: gracePeriod 계약일이 2022.5.10 이전 → 조건C(토지허가+임차인) 충족이어도 미배제(false)", () => {
    // 한시 유예 시행 전(2020) 계약은 유예 대상 아님 — 하한 검증 (적대적 리뷰 적발 회귀)
    const input = makeInput(twoHouses(), {
      sellingHouseId: "h1",
      transferDate: new Date("2024-06-01"),
      gracePeriod: {
        contractDate: new Date("2020-01-01"), // 2022-05-10 이전
        isLandPermitArea: true,
        hasTenantInResidence: true,
      },
    });

    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionActive, true);

    expect(r.isSurchargeSuspended).toBe(false);
    expect(r.surchargeApplicable).toBe(true);
  });

  it("A3c: gracePeriod 미제공 + 유예 윈도우 내 → blanket suspended=true (현행)", () => {
    const input = makeInput(twoHouses(), {
      sellingHouseId: "h1",
      transferDate: new Date("2024-06-01"),
    });

    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionActive, true);

    expect(r.isSurchargeSuspended).toBe(true);
  });
});
