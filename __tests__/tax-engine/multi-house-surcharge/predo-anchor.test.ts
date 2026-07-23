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
 *   A3a — 양도일 > 2026-05-09 + 다목 조건 미충족(계약일 위반) → suspended=false (중과 적용)
 *   A3b — 양도일 > 2026-05-09 + 다목 조건 충족(계약·계약금증빙) → suspended=true (중과 유예)
 *   A3c — gracePeriod 미제공 + 유예활성 + 윈도우 내 → blanket suspended=true (현행 동작)
 *   A3d — 양도일 ≤ 2026-05-09(가목 우선 게이트) → gracePeriod 조건 무관 suspended=true
 *
 * ⚠️ 2026-07-24 법령정합 재작성: §167의3①12의2 가·나·다목 확정 시행령 반영.
 *   구 A3d(계약일 하한 미충족→false)는 가목 우선 게이트로 대체됨(anchor 갱신 사유 —
 *   docs/02-design/features/transfer-surcharge-transition-na-da.plan.md §7 G3′).
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

  it("A3a: 양도일 2026-08-02(가목 이후) + 다목 계약+4개월 초과 → suspended=false, 중과 적용", () => {
    const input = makeInput(twoHouses(), {
      sellingHouseId: "h1",
      transferDate: new Date("2026-08-02"),
      gracePeriod: {
        contractDate: new Date("2026-04-01"), // +4개월(강남 4개월 지역) = 2026-08-01 < 양도일
        isLandPermitTarget: false,
        depositReceiptConfirmed: true,
      },
    });

    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionActive, true);

    expect(r.surchargeApplicable).toBe(true);
    expect(r.isSurchargeSuspended).toBe(false);
  });

  it("A3b: 양도일 2026-08-01(가목 이후) + 다목 조건 충족(계약·계약금증빙) → suspended=true", () => {
    const input = makeInput(twoHouses(), {
      sellingHouseId: "h1",
      transferDate: new Date("2026-08-01"),
      gracePeriod: {
        contractDate: new Date("2026-04-01"),
        isLandPermitTarget: false,
        depositReceiptConfirmed: true,
      },
    });

    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionActive, true);

    expect(r.isSurchargeSuspended).toBe(true);
  });

  it("A3d: 양도일 ≤ 2026-05-09 → 가목 우선 게이트로 suspended=true (계약·허가 조건 무관, G3′ 정정)", () => {
    // 구 테스트: 계약일 하한(2022-05-10) 미충족 조건C → false. 확정 시행령 나·다목 원문에는
    // 임차인 조항·계약일 하한 근거가 없고, 가목은 양도일 단일조건이므로 우선 배제된다.
    const input = makeInput(twoHouses(), {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-09"),
      gracePeriod: {
        contractDate: new Date("2020-01-01"),
        isLandPermitArea: true,
        hasTenantInResidence: true,
      },
    });

    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionActive, true);

    expect(r.isSurchargeSuspended).toBe(true);
    expect(r.surchargeApplicable).toBe(false);
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
