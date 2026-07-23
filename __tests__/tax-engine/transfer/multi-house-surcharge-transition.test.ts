/**
 * 다주택 중과 한시배제 경과조치 — §167의3①12의2 가·나·다목(§167의10①12의2 미러) 케이스 매트릭스 anchor
 *
 * 계획서: docs/02-design/features/transfer-surcharge-transition-na-da.plan.md §5 M1~M15.
 * 소재지: h1=강남구(11680, 4개월 지역) / h2=성남 분당구(41135, 6개월 지역 — 2025-10-16 신규지정).
 *
 * 판정 함수: determineSurchargeExclusion() (multi-house-surcharge-exclusion.ts) via
 * determineMultiHouseSurcharge()(공개 진입점). suspensionRules는 항상 유예 활성 mock 사용 —
 * 보유기간 게이트(§95④ 2년)는 makeHouse 기본 취득일(2020-01-01)로 항상 충족.
 */

import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge, transitionExemptionMonths } from "@/lib/tax-engine/multi-house-surcharge";
import type { MultiHouseSurchargeInput } from "@/lib/tax-engine/multi-house-surcharge";
import { REGULATED_REGIONS } from "@/lib/tax-engine/data/regulated-areas";
import {
  defaultRules,
  mockRegulatedHistory,
  suspensionActive,
  makeHouse,
  makeInput,
} from "../_helpers/multi-house-mock";

// 3주택+ 경로 헬퍼 (기본 3주택+)
function make3PlusInput(
  transferDate: Date,
  gracePeriod?: MultiHouseSurchargeInput["gracePeriod"],
  sellingRegionCode = "11680", // 강남구(4개월)
): MultiHouseSurchargeInput {
  const h1 = makeHouse("h1", { regionCode: sellingRegionCode });
  const h2 = makeHouse("h2");
  const h3 = makeHouse("h3");
  return makeInput([h1, h2, h3], {
    sellingHouseId: "h1",
    transferDate,
    gracePeriod,
  });
}

// 2주택 미러 헬퍼
function make2PlusInput(
  transferDate: Date,
  gracePeriod?: MultiHouseSurchargeInput["gracePeriod"],
  sellingRegionCode = "11680",
): MultiHouseSurchargeInput {
  const h1 = makeHouse("h1", { regionCode: sellingRegionCode });
  const h2 = makeHouse("h2");
  return makeInput([h1, h2], {
    sellingHouseId: "h1",
    transferDate,
    gracePeriod,
  });
}

function run(input: MultiHouseSurchargeInput) {
  return determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionActive, true);
}

describe("M1: 가목 — 양도 2026-05-09 → 배제 (기존 회귀)", () => {
  it("gracePeriod 없이도 양도일 ≤ 5-09이면 배제", () => {
    const r = run(make3PlusInput(new Date("2026-05-09")));
    expect(r.isSurchargeSuspended).toBe(true);
    expect(r.surchargeApplicable).toBe(false);
  });
});

describe("M2: 나목 — 계약 ≤5-09(4-20), 신청·허가·증빙 O, 4M 지역, 양도 8-20(계약+4M 이내) → 배제", () => {
  it("배제", () => {
    const r = run(
      make3PlusInput(new Date("2026-08-20"), {
        contractDate: new Date("2026-04-20"),
        isLandPermitTarget: true,
        permitApplicationDate: new Date("2026-05-01"),
        permitGranted: true,
        depositReceiptConfirmed: true,
      }),
    );
    expect(r.isSurchargeSuspended).toBe(true);
    expect(r.surchargeApplicable).toBe(false);
  });
});

describe("M3: 나목 — 계약 6-01(5-10 이후), 4M 지역, 양도 9-09(절대기한 경계) → 배제", () => {
  it("절대기한 경계일 배제", () => {
    const r = run(
      make3PlusInput(new Date("2026-09-09"), {
        contractDate: new Date("2026-06-01"),
        isLandPermitTarget: true,
        permitApplicationDate: new Date("2026-05-01"),
        permitGranted: true,
        depositReceiptConfirmed: true,
      }),
    );
    expect(r.isSurchargeSuspended).toBe(true);
    expect(r.surchargeSuspensionBasis).toBe("na");
  });
});

describe("M4: 나목 — 위와 동일, 양도 9-10(절대기한 초과) → 과세", () => {
  it("절대기한 초과로 과세", () => {
    const r = run(
      make3PlusInput(new Date("2026-09-10"), {
        contractDate: new Date("2026-06-01"),
        isLandPermitTarget: true,
        permitApplicationDate: new Date("2026-05-01"),
        permitGranted: true,
        depositReceiptConfirmed: true,
      }),
    );
    expect(r.isSurchargeSuspended).toBe(false);
    expect(r.surchargeApplicable).toBe(true);
  });
});

describe("M5: 나목 — 계약 6-01, 6M 지역(성남분당), 양도 11-09(6개월 절대기한) → 배제", () => {
  it("6개월 지역 절대기한 배제", () => {
    const r = run(
      make3PlusInput(
        new Date("2026-11-09"),
        {
          contractDate: new Date("2026-06-01"),
          isLandPermitTarget: true,
          permitApplicationDate: new Date("2026-05-01"),
          permitGranted: true,
          depositReceiptConfirmed: true,
        },
        "41135",
      ),
    );
    expect(r.isSurchargeSuspended).toBe(true);
  });
});

describe("M6: 나목 — 신청일 5-10(위반), 양도 8-01 → 과세", () => {
  it("신청일 위반으로 과세", () => {
    const r = run(
      make3PlusInput(new Date("2026-08-01"), {
        contractDate: new Date("2026-06-01"),
        isLandPermitTarget: true,
        permitApplicationDate: new Date("2026-05-10"),
        permitGranted: true,
        depositReceiptConfirmed: true,
      }),
    );
    expect(r.isSurchargeSuspended).toBe(false);
  });
});

describe("M7: 나목 — 허가 미수령, 양도 8-01 → 과세", () => {
  it("허가 미수령으로 과세", () => {
    const r = run(
      make3PlusInput(new Date("2026-08-01"), {
        contractDate: new Date("2026-06-01"),
        isLandPermitTarget: true,
        permitApplicationDate: new Date("2026-05-01"),
        permitGranted: false,
        depositReceiptConfirmed: true,
      }),
    );
    expect(r.isSurchargeSuspended).toBe(false);
  });
});

describe("M8: 다목 — 계약 4-01(≤5-09), 4M 지역, 양도 8-01(계약+4M) → 배제", () => {
  it("배제", () => {
    const r = run(
      make3PlusInput(new Date("2026-08-01"), {
        contractDate: new Date("2026-04-01"),
        isLandPermitTarget: false,
        depositReceiptConfirmed: true,
      }),
    );
    expect(r.isSurchargeSuspended).toBe(true);
    expect(r.surchargeSuspensionBasis).toBe("da");
  });
});

describe("M9: 다목 — 계약 4-01, 4M 지역, 양도 8-02(계약+4M 초과) → 과세", () => {
  it("과세", () => {
    const r = run(
      make3PlusInput(new Date("2026-08-02"), {
        contractDate: new Date("2026-04-01"),
        isLandPermitTarget: false,
        depositReceiptConfirmed: true,
      }),
    );
    expect(r.isSurchargeSuspended).toBe(false);
  });
});

describe("M10: 다목 — 계약 5-10(위반), 양도 7-01 → 과세", () => {
  it("계약일 위반으로 과세", () => {
    const r = run(
      make3PlusInput(new Date("2026-07-01"), {
        contractDate: new Date("2026-05-10"),
        isLandPermitTarget: false,
        depositReceiptConfirmed: true,
      }),
    );
    expect(r.isSurchargeSuspended).toBe(false);
  });
});

describe("M11: 다목 — 6M 지역(성남분당), 계약 4-01, 양도 10-01(계약+6M) → 배제", () => {
  it("6개월 지역 배제", () => {
    const r = run(
      make3PlusInput(
        new Date("2026-10-01"),
        {
          contractDate: new Date("2026-04-01"),
          isLandPermitTarget: false,
          depositReceiptConfirmed: true,
        },
        "41135",
      ),
    );
    expect(r.isSurchargeSuspended).toBe(true);
  });
});

describe("M12: G3 조건C 잔존 세션(허가구역+임차인, isLandPermitTarget 미제공) → 과세로 전환", () => {
  it("조건C 제거로 과세", () => {
    const r = run(
      make3PlusInput(new Date("2026-08-01"), {
        contractDate: new Date("2026-01-01"),
        isLandPermitArea: true,
        hasTenantInResidence: true,
      }),
    );
    expect(r.isSurchargeSuspended).toBe(false);
    expect(r.surchargeApplicable).toBe(true);
  });
});

describe("M13: 보유 2년 미만 → 경과조치 부적용 (기존 게이트 회귀)", () => {
  it("2년 미만 보유는 gracePeriod 충족과 무관하게 배제 판정 자체 미도달", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      acquisitionDate: new Date("2025-06-01"), // 보유 <2년
    });
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3");
    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-08-01"),
      gracePeriod: {
        contractDate: new Date("2026-04-01"),
        isLandPermitTarget: false,
        depositReceiptConfirmed: true,
      },
    });
    const r = run(input);
    expect(r.isSurchargeSuspended).toBe(false);
    expect(r.surchargeApplicable).toBe(true);
  });
});

describe("M14: gracePeriod 미입력 + 양도 2026-05-10 → 중과 적용 (기존 회귀)", () => {
  it("blanket suspended_until 경과로 중과 적용", () => {
    const r = run(make3PlusInput(new Date("2026-05-10")));
    expect(r.isSurchargeSuspended).toBe(false);
    expect(r.surchargeApplicable).toBe(true);
  });
});

describe("M15: 가목우선 게이트 — gracePeriod 입력(계약·허가 조건 미충족) + 양도 2026-05-09 → 배제", () => {
  it("나·다 조건 미충족이어도 가목으로 배제(G3′ 정정)", () => {
    const r = run(
      make3PlusInput(new Date("2026-05-09"), {
        contractDate: new Date("2026-04-01"),
        isLandPermitTarget: true,
        permitApplicationDate: undefined,
        permitGranted: false,
        depositReceiptConfirmed: false,
      }),
    );
    expect(r.isSurchargeSuspended).toBe(true);
    expect(r.surchargeSuspensionBasis).toBe("a");
    expect(r.surchargeApplicable).toBe(false);
  });
});

describe("2주택(multi_house_2) 미러 — 다목 배제 (M8과 동일 조건, 2주택 경로)", () => {
  it("2주택 경로에서도 동일하게 배제", () => {
    const r = run(
      make2PlusInput(new Date("2026-08-01"), {
        contractDate: new Date("2026-04-01"),
        isLandPermitTarget: false,
        depositReceiptConfirmed: true,
      }),
    );
    expect(r.surchargeType).toBe("multi_house_2");
    expect(r.isSurchargeSuspended).toBe(true);
    expect(r.surchargeApplicable).toBe(false);
  });
});

// ============================================================
// transitionExemptionMonths — regionCode → 4/6개월 판정 (단위 테스트)
// ============================================================

describe("transitionExemptionMonths — 나목4) 표 지역 판정", () => {
  it("강남4구(11680·11650·11710·11170) → 4개월", () => {
    expect(transitionExemptionMonths("11680")).toBe(4);
    expect(transitionExemptionMonths("11650")).toBe(4);
    expect(transitionExemptionMonths("11710")).toBe(4);
    expect(transitionExemptionMonths("11170")).toBe(4);
  });

  it("서울 나머지 구(예: 종로구 11110, 개별 엔트리 없음) → 11 전역 2025-10-16 재지정으로 6개월", () => {
    expect(transitionExemptionMonths("11110")).toBe(6);
  });

  it("경기 신규지정(성남분당 41135·과천 41290) → 6개월", () => {
    expect(transitionExemptionMonths("41135")).toBe(6);
    expect(transitionExemptionMonths("41290")).toBe(6);
  });

  it("2026-07-01 신규지정(용인기흥 41463·구리 41310, 이미지45 표 명단 외) → 보수적 4개월", () => {
    expect(transitionExemptionMonths("41463")).toBe(4);
    expect(transitionExemptionMonths("41310")).toBe(4);
  });

  it("regionCode 미제공 → 보수적 4개월", () => {
    expect(transitionExemptionMonths(undefined)).toBe(4);
  });

  it("REGULATED_REGIONS 실측 — 이미지45 6개월 명단 13개 엔트리(서울전역+경기12) 2025-10-16 지정 확인", () => {
    const sixMonthCodes = ["41290", "41210", "41450", "41131", "41135", "41133", "41117", "41115", "41111", "41173", "41465", "41430"];
    for (const code of sixMonthCodes) {
      const region = REGULATED_REGIONS.find((r) => r.code === code);
      expect(region, `${code} 엔트리 존재`).toBeDefined();
      expect(
        region!.designations.some((d) => d.designatedDate === "2025-10-16"),
        `${code} 2025-10-16 지정 이력`,
      ).toBe(true);
    }
    const seoul = REGULATED_REGIONS.find((r) => r.code === "11");
    expect(seoul!.designations.some((d) => d.designatedDate === "2025-10-16")).toBe(true);
  });
});
