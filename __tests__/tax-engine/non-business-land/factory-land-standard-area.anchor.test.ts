/**
 * anchor — 공장용 건축물 부속토지 기준면적 초과분 비사업용 (Phase A)
 *
 * 계획: docs/02-design/features/factory-site-standard-area-nbl.plan.md (rev.3)
 *
 * ## 법령 구조 (KoreanLaw 실측 — 2026-08-05)
 *
 * 「소득세법」 §104의3①4호나목이 비사업용에서 제외하는 것은 「지방세법」 §106①2호(별도합산)·
 * 3호(분리과세) 대상 토지인데, 공장 부속토지는 **소재 지역에 따라 두 경로로 배타 분기**하고
 * 각 경로에 면적 한도가 있다. 한도 초과분은 §106①1호 종합합산으로 떨어져 **비사업용**이 된다.
 *
 * | 소재 | 근거 | 한도 |
 * |---|---|---|
 * | 읍·면(군 포함)·산업단지·공업지역 | 「지방세법 시행령」 §102①1호 → 시행규칙 §50 [별표6] | 연면적 × 100 ÷ 업종별 기준공장면적률 |
 * | 그 밖의 시지역 등 | 「지방세법 시행령」 §101①1호 | **바닥면적** × §101② 용도지역별 적용배율 |
 *
 * MST: 소득세법 280405 · 지방세법 시행령 287223 · 지방세법 시행규칙 287031 (모두 시행 2026-07-01).
 * 기준공장면적률: 「공장입지 기준고시」(산업통상부, 행정규칙 2100000274928) 별표1 · §4(지식산업센터 40%).
 *
 * ## 실무 검증 기준점 — 조심 2025서2489 (2026.04.08)
 *
 * 부산광역시 해운대구 공장 1건에서 필지의 용도지역에 따라 두 경로가 **동시에** 적용된 실례다.
 * 아래 EXT-* 테스트가 그 수치를 그대로 재현한다 — 엔진 산식이 실무와 일치하는지의 외부 기준점.
 */
import { describe, it, expect } from "vitest";
import {
  computeFactoryStandardArea,
  judgeFactoryLandExcess,
  KNOWLEDGE_INDUSTRY_CENTER_RATE_PERCENT,
} from "@/lib/tax-engine/non-business-land/factory-land-standard-area";
import { judgeOtherLand } from "@/lib/tax-engine/non-business-land/other-land";
import { checkUnconditionalExemption } from "@/lib/tax-engine/non-business-land/unconditional-exemption";
import { NBL } from "@/lib/tax-engine/legal-codes/transfer-nbl";
import type { NonBusinessLandInput, FactoryLandUsage } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);
const R = DEFAULT_NON_BUSINESS_LAND_RULES;

/**
 * `landArea` = **양도 대상** 토지 면적. 공장 입력의 `totalAppurtenantLandArea`(1구의 공장 전체)는
 * 지정하지 않으면 같은 값으로 채운다 = "양도 대상이 곧 공장 전체" 케이스.
 * 부분 양도는 `totalAppurtenantLandArea`를 명시해 구분한다(PART-* 테스트).
 */
type FactoryArg = Omit<FactoryLandUsage, "totalAppurtenantLandArea"> & {
  totalAppurtenantLandArea?: number;
};

function base(landArea: number, factory?: FactoryArg): NonBusinessLandInput {
  return {
    landType: "other_land",
    landArea,
    zoneType: "general_residential",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    otherLand: {
      propertyTaxType: "comprehensive",
      hasBuilding: true,
      isRelatedToResidenceOrBusiness: false,
      factory: factory && {
        ...factory,
        totalAppurtenantLandArea: factory.totalAppurtenantLandArea ?? landArea,
      },
    },
    businessUsePeriods: [],
    gracePeriods: [],
  };
}

// ────────────────────────────────────────────────────────────
describe("별표6 산식 — 공장입지기준면적 = 연면적 × 100 ÷ 기준공장면적률", () => {
  // 조심 2025서2489: 화학섬유(합성섬유) 제조업 KSIC 20501 → 별표1 면적률 12%.
  // 재결문 <표13>의 공장입지기준면적 748,881.98㎡와 소수 둘째 자리까지 일치해야 한다.
  it("EXT-1: 연면적 89,865.838㎡ ÷ 12% → 748,881.98㎡ (조심 2025서2489 실측)", () => {
    const r = computeFactoryStandardArea(
      [{ floorArea: 89865.838, ratePercent: 12, industryLabel: "합성섬유 제조업" }],
      199115, // 재결례의 공장 전체 토지면적
    );
    expect(r.baseArea).toBeCloseTo(748881.98, 2);
  });

  it("EXT-2: 같은 사건의 전체 토지 199,115㎡는 기준면적 이내 → 전량 사업용", () => {
    const r = judgeFactoryLandExcess(
      {
        locationCategory: "eup_myeon_or_complex",
        segments: [{ floorArea: 89865.838, ratePercent: 12 }], totalAppurtenantLandArea: 199115 },
      "test",
    );
    expect(r.route).toBe("separate_taxation");
    expect(r.isWithinLimit).toBe(true);
    expect(r.nonBusinessArea).toBe(0);
  });

  // §101①1호 경로 — 같은 사건의 별도합산 필지. 바닥면적 81,473.36 × 4배(일반주거) = 325,893.44
  it("EXT-3: 바닥면적 81,473.36㎡ × 일반주거 4배 → 325,893.44㎡ (조심 2025서2489 <표9>)", () => {
    const r = judgeFactoryLandExcess(
      {
        locationCategory: "urban_other",
        totalFootprintArea: 81473.36,
        zoneType: "general_residential", totalAppurtenantLandArea: 199115 },
      "test",
    );
    expect(r.route).toBe("aggregate_taxation");
    expect(r.standardArea).toBeCloseTo(325893.44, 2);
    expect(r.isWithinLimit).toBe(true);
  });

  // ⚠️ 연면적(별표6)과 바닥면적(§101①1호)은 다른 값이다 — 같은 공장에서 실제로 갈렸다.
  it("EXT-4: 같은 공장의 연면적 89,865.838 ≠ 바닥면적 81,473.36 — 한 칸으로 받으면 안 된다", () => {
    const sep = judgeFactoryLandExcess(
      { locationCategory: "eup_myeon_or_complex", segments: [{ floorArea: 89865.838, ratePercent: 12 }], totalAppurtenantLandArea: 199115 },
      "test",
    );
    const agg = judgeFactoryLandExcess(
      { locationCategory: "urban_other", totalFootprintArea: 81473.36, zoneType: "general_residential", totalAppurtenantLandArea: 199115 },
      "test",
    );
    expect(sep.standardArea).not.toBeCloseTo(agg.standardArea, 0);
  });
});

describe("별표6 2호다 — 다업종·업종구분 불가", () => {
  it("C-8: 2개 업종이면 업종별로 산출해 합산한다", () => {
    const r = computeFactoryStandardArea(
      [
        { floorArea: 1200, ratePercent: 12 }, // 10,000
        { floorArea: 900, ratePercent: 15 }, //  6,000
      ],
      100,
    );
    expect(r.segments.map((s) => s.standardArea)).toEqual([10000, 6000]);
    expect(r.baseArea).toBe(16000);
  });

  it("C-9: 업종구분 불가 → 매출 최대 업종률 1건만 넣은 것과 같다", () => {
    const r = computeFactoryStandardArea([{ floorArea: 2100, ratePercent: 12 }], 100);
    expect(r.baseArea).toBe(17500);
  });

  it("C-10: 지식산업센터는 고시 §4로 40% 고정 (별표1 아님)", () => {
    expect(KNOWLEDGE_INDUSTRY_CENTER_RATE_PERCENT).toBe(40);
    const r = computeFactoryStandardArea(
      [{ floorArea: 4000, ratePercent: KNOWLEDGE_INDUSTRY_CENTER_RATE_PERCENT }],
      100,
    );
    expect(r.baseArea).toBe(10000);
  });
});

describe("별표6 3호가 — 추가 인정기준 (초과분이 있을 때만 인정된다)", () => {
  // 산출면적 10,000㎡. 제한지역 외이므로 20% = 2,000㎡까지 기준면적에 포함.
  it("가2) 제한지역 외 20%: 토지 11,500㎡ → 초과 1,500㎡ 전부 인정 → 기준 11,500㎡", () => {
    const r = computeFactoryStandardArea([{ floorArea: 1200, ratePercent: 12 }], 11500);
    expect(r.baseArea).toBe(10000);
    expect(r.additionalAllowanceCap).toBe(2000);
    expect(r.additionalAllowanceApplied).toBe(1500);
    expect(r.standardArea).toBe(11500);
  });

  it("가2) 한도를 넘는 초과분은 인정되지 않는다: 토지 13,000㎡ → 기준 12,000㎡", () => {
    const r = computeFactoryStandardArea([{ floorArea: 1200, ratePercent: 12 }], 13000);
    expect(r.additionalAllowanceApplied).toBe(2000);
    expect(r.standardArea).toBe(12000);
  });

  it("가1) 제한지역은 10%: 같은 조건에서 기준 11,000㎡", () => {
    const r = computeFactoryStandardArea([{ floorArea: 1200, ratePercent: 12 }], 13000, {
      isRestrictedZone: true,
    });
    expect(r.additionalAllowanceCap).toBe(1000);
    expect(r.standardArea).toBe(11000);
  });

  it("가1) 단서 — 인정면적은 3,000㎡를 넘지 못한다 (산출 50,000㎡ · 10% = 5,000 → 3,000)", () => {
    const r = computeFactoryStandardArea([{ floorArea: 6000, ratePercent: 12 }], 99999, {
      isRestrictedZone: true,
    });
    expect(r.baseArea).toBe(50000);
    expect(r.additionalAllowanceCap).toBe(3000);
    expect(r.standardArea).toBe(53000);
  });

  it("초과분이 없으면 추가 인정도 0이다 (「초과하는 토지 중」)", () => {
    const r = computeFactoryStandardArea([{ floorArea: 1200, ratePercent: 12 }], 8000);
    expect(r.additionalAllowanceApplied).toBe(0);
    expect(r.standardArea).toBe(10000);
  });

  it("3호나~바는 직접입력 면적으로 가산된다", () => {
    const r = computeFactoryStandardArea([{ floorArea: 1200, ratePercent: 12 }], 8000, {
      additionalRecognizedArea: 700,
    });
    expect(r.standardArea).toBe(10700);
  });
});

describe("단서 — 허가·사용승인 미이행 (§102①1호 단서·§101① 단서)", () => {
  it("C-3: 기준면적과 무관하게 부속토지 전량 비사업용", () => {
    const r = judgeFactoryLandExcess(
      {
        locationCategory: "eup_myeon_or_complex",
        segments: [{ floorArea: 100000, ratePercent: 12 }], // 한도는 충분하지만
        isUnregistered: true, totalAppurtenantLandArea: 5000 },
      "test",
    );
    expect(r.standardArea).toBe(0);
    expect(r.nonBusinessArea).toBe(5000);
    expect(r.nonBusinessRatio).toBe(1);
  });
});

// 🔴 입력 누락 가드 — 구현 중 실제로 뚫려 있던 지점이다.
// 면적이 비면 기준면적이 0이 되어 부속토지 **전량이 비사업용**으로 떨어지고(불리),
// 사유마저 단서(허가 미이행)로 잘못 표시된다. 침묵 오작동이므로 던져서 막는다.
describe("입력 누락은 차단한다 (자동 fallback 금지 · 근거 없는 불리 적용 금지)", () => {
  it("GUARD-1: 별표6 경로에서 segments가 비면 던진다 (전량 비사업용으로 떨어뜨리지 않는다)", () => {
    expect(() =>
      judgeFactoryLandExcess(
      { locationCategory: "eup_myeon_or_complex", totalAppurtenantLandArea: 5000 },
      "기타토지(공장)",
    ),
    ).toThrow(/연면적과 업종별 기준공장면적률/);
  });

  it("GUARD-2: 면적률이 0이면 던진다", () => {
    expect(() =>
      judgeFactoryLandExcess(
      { locationCategory: "eup_myeon_or_complex", segments: [{ floorArea: 1200, ratePercent: 0 }], totalAppurtenantLandArea: 5000 },
      "기타토지(공장)",
    ),
    ).toThrow(/기준공장면적률/);
  });

  it("GUARD-3: §101①1호 경로에서 바닥면적이 없으면 던진다", () => {
    expect(() =>
      judgeFactoryLandExcess(
      { locationCategory: "urban_other", zoneType: "general_residential", totalAppurtenantLandArea: 5000 },
      "기타토지(공장)",
    ),
    ).toThrow(/바닥면적/);
  });

  it("GUARD-4: 단서 판별은 `standardArea === 0` 추론이 아니라 명시 플래그다", () => {
    const r = judgeFactoryLandExcess(
      {
        locationCategory: "eup_myeon_or_complex",
        segments: [{ floorArea: 1200, ratePercent: 12 }],
        isUnregistered: true, totalAppurtenantLandArea: 5000 },
      "test",
    );
    expect(r.isUnregisteredException).toBe(true);

    const normal = judgeFactoryLandExcess(
      { locationCategory: "eup_myeon_or_complex", segments: [{ floorArea: 1200, ratePercent: 12 }], totalAppurtenantLandArea: 20000 },
      "test",
    );
    expect(normal.isUnregisteredException).toBe(false);
  });
});

describe("지역 미입력·미등재 용도지역은 차단한다 (추정 금지)", () => {
  it("urban_other 경로에서 zoneType 미입력이면 던진다", () => {
    expect(() =>
      judgeFactoryLandExcess(
      { locationCategory: "urban_other", totalFootprintArea: 100, totalAppurtenantLandArea: 1000 },
      "기타토지(공장)",
    ),
    ).toThrow(/용도지역/);
  });

  it("§101② 표에 없는 세분 전 residential은 던진다", () => {
    expect(() =>
      judgeFactoryLandExcess(
      { locationCategory: "urban_other", totalFootprintArea: 100, zoneType: "residential", totalAppurtenantLandArea: 1000 },
      "기타토지(공장)",
    ),
    ).toThrow(/적용배율표/);
  });
});

// ────────────────────────────────────────────────────────────
describe("judgeOtherLand 통합 — Step 0.5", () => {
  it("C-1: 한도 이내 → 전량 사업용 (사용자가 종합합산으로 골랐어도 공장 판정이 확정한다)", () => {
    const r = judgeOtherLand(
      base(8000, {
        locationCategory: "eup_myeon_or_complex",
        segments: [{ floorArea: 1200, ratePercent: 12 }], // 기준 10,000㎡
      }),
      R,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.steps.find((s) => s.id === "other_factory_area")?.status).toBe("PASS");
    expect(r.areaProportioning).toBeUndefined();
  });

  it("C-2: 한도 초과 → 초과분만 비사업용 안분", () => {
    // 기준 10,000 + 가2 인정 2,000 = 12,000. 토지 20,000 → 초과 8,000 (40%)
    const r = judgeOtherLand(
      base(20000, {
        locationCategory: "eup_myeon_or_complex",
        segments: [{ floorArea: 1200, ratePercent: 12 }],
      }),
      R,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.nonBusinessArea).toBe(8000);
    expect(r.areaProportioning?.nonBusinessRatio).toBe(0.4);
    expect(r.appliedLaws).toContain("지방세법 시행령 §102 ① 1호 + 지방세법 시행규칙 §50 [별표 6]");
  });

  it("C-3: 단서 해당 → 전량 비사업용 (안분 없음)", () => {
    const r = judgeOtherLand(
      base(20000, {
        locationCategory: "eup_myeon_or_complex",
        segments: [{ floorArea: 100000, ratePercent: 12 }],
        isUnregistered: true,
      }),
      R,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning).toBeUndefined();
    expect(r.reason).toContain("허가·사용승인 미이행");
  });

  it("C-4: §101①1호 경로 한도 이내 → 전량 사업용", () => {
    const r = judgeOtherLand(
      base(3000, {
        locationCategory: "urban_other",
        totalFootprintArea: 1000,
        zoneType: "general_residential", // 4배 → 4,000㎡
      }),
      R,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.appliedLaws).toContain("지방세법 시행령 §101 ① 1호 (같은 조 ② 적용배율)");
  });

  it("C-5: §101①1호 경로 초과 → 초과분 비사업용 (3호가 가산 없음 — 별표6 전용)", () => {
    // 바닥 1,000 × 4배 = 4,000. 토지 5,000 → 초과 1,000 (20%)
    const r = judgeOtherLand(
      base(5000, {
        locationCategory: "urban_other",
        totalFootprintArea: 1000,
        zoneType: "general_residential",
      }),
      R,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.nonBusinessArea).toBe(1000);
    expect(r.areaProportioning?.nonBusinessRatio).toBe(0.2);
  });

  // 🔴 순서 회귀 가드 — Phase A 구현 중 실제로 한 번 틀렸던 지점이다.
  // 「소득세법」 §104의3①4호는 "다음 각 목을 **제외한** 토지"를 비사업용으로 규정하므로
  // 가·나·다목 중 어느 하나면 사업용이다. 나목(공장 한도)에 미달해도 다목(§168의11②
  // 수입금액비율 / ① 호별 기준면적)에 해당하면 **여전히 사업용**이다.
  // 공장 판정을 앞에서 확정하면 그 경로를 차단해 법 근거 없는 불리 적용이 된다.
  it("ORDER-1: 공장 한도 초과 + 수입금액비율 충족 → 전량 사업용 (공장 판정이 앞지르지 않는다)", () => {
    const input = base(20000, {
      locationCategory: "eup_myeon_or_complex",
      segments: [{ floorArea: 1200, ratePercent: 12 }], // 기준 12,000㎡ < 토지 20,000㎡ (초과)
    });
    input.revenueTest = {
      businessType: "parking_operation",
      currentRevenue: 50_000_000, // 5% ≥ 3% → 충족
      currentLandValue: 1_000_000_000,
    };
    const r = judgeOtherLand(input, R);
    expect(r.isBusiness).toBe(true);
    expect(r.areaProportioning).toBeUndefined();
    // 공장 한도 초과 스텝은 기록되지 않는다 — 수입금액비율에서 이미 확정됐다
    expect(r.steps.find((s) => s.id === "other_factory_area")).toBeUndefined();
  });

  it("ORDER-2: 공장 한도 초과 + 수입금액비율 미달 → 그때 비로소 초과분 안분", () => {
    const input = base(20000, {
      locationCategory: "eup_myeon_or_complex",
      segments: [{ floorArea: 1200, ratePercent: 12 }],
    });
    input.revenueTest = {
      businessType: "parking_operation",
      currentRevenue: 1_000_000, // 0.1% < 3% → 미달
      currentLandValue: 1_000_000_000,
    };
    const r = judgeOtherLand(input, R);
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.nonBusinessRatio).toBe(0.4);
    // 스텝 순서: 수입금액비율이 먼저 기록되고 공장 판정이 뒤에 온다
    const ids = r.steps.map((s) => s.id);
    expect(ids.indexOf("other_revenue_test")).toBeLessThan(ids.indexOf("other_factory_area"));
  });

  it("ORDER-3: 공장 한도 초과 + §168의11① 호별 기준면적 이내 → 전량 사업용", () => {
    const input = base(20000, {
      locationCategory: "eup_myeon_or_complex",
      segments: [{ floorArea: 1200, ratePercent: 12 }], // 공장 기준 12,000㎡ (초과)
    });
    input.otherLand!.relatedBusinessType = "parking_attached";
    input.otherLand!.standardAreaLimit = 25000; // 다목 기준면적은 여유 → 사업용
    const r = judgeOtherLand(input, R);
    expect(r.isBusiness).toBe(true);
    expect(r.steps.find((s) => s.id === "other_factory_area")).toBeUndefined();
  });

  // 🔴 판정 단위 회귀 가드 — 한도 비교는 「1구의 공장 전체」로 하고(조심 2023지0373),
  // 거기서 나온 **비율**을 양도분에 적용한다. 양도분과 한도를 직접 비교하면 틀린다.
  it("PART-1: 공장 전체 20,000㎡ 중 5,000㎡만 양도 → 전체 초과비율 40%가 양도분에 그대로 적용", () => {
    const r = judgeOtherLand(
      base(5000, {
        locationCategory: "eup_myeon_or_complex",
        segments: [{ floorArea: 1200, ratePercent: 12 }], // 기준 10,000 + 가2 2,000 = 12,000
        totalAppurtenantLandArea: 20000, // 공장 전체 → 초과 8,000 (40%)
      }),
      R,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.totalArea).toBe(5000);
    expect(r.areaProportioning?.nonBusinessRatio).toBe(0.4);
    expect(r.areaProportioning?.nonBusinessArea).toBe(2000); // 5,000 × 40%
  });

  it("PART-2: 양도분만 보면 한도 이내여도, 공장 전체가 초과면 초과비율이 적용된다", () => {
    // 양도분 5,000㎡는 기준면적 12,000㎡보다 작다 — 양도분과 직접 비교했다면 「전량 사업용」이 됐을 것.
    const r = judgeOtherLand(
      base(5000, {
        locationCategory: "eup_myeon_or_complex",
        segments: [{ floorArea: 1200, ratePercent: 12 }],
        totalAppurtenantLandArea: 20000,
      }),
      R,
    );
    expect(r.isBusiness).toBe(false); // ← 정정 전 구현이라면 true였다
  });

  it("PART-3: 총면적 미입력은 던진다 (양도분으로 조용히 대체하지 않는다)", () => {
    const input = base(5000);
    input.otherLand!.factory = {
      locationCategory: "eup_myeon_or_complex",
      segments: [{ floorArea: 1200, ratePercent: 12 }],
    } as never; // 런타임 누락 재현 — 타입은 필수지만 API 경계를 넘어오면 뚫릴 수 있다
    expect(() => judgeOtherLand(input, R)).toThrow(/공장 전체/);
  });

  it("회귀 — factory 미설정이면 기존 동작 그대로 (Step 0.5 스텝 자체가 없다)", () => {
    const r = judgeOtherLand(base(20000), R);
    expect(r.steps.find((s) => s.id === "other_factory_area")).toBeUndefined();
  });

  it("회귀 — factory 미설정 + 분리과세 선택 시 종전대로 전량 사업용", () => {
    const input = base(20000);
    input.otherLand!.propertyTaxType = "special_sum";
    const r = judgeOtherLand(input, R);
    expect(r.isBusiness).toBe(true);
    expect(r.areaProportioning).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
/**
 * 별표6 3호 **마목**(오염피해 인접토지)의 귀속 — 계획서 0-6 종결.
 *
 * ## 마목은 나머지 목과 문언 구조가 다르다 (2026-08-06 KoreanLaw 실측)
 *
 * | 목 | 별표6 문언 | 효과 |
 * |---|---|---|
 * | 나·다·라·바 | "…는 공장입지기준면적에 **포함되는 것으로 한다**" | 기준면적(한도)을 늘린다 |
 * | **마** | "…합한 면적을 해당 공장의 **부속토지로 보아** …산정한다" | 부속토지(판정 대상)를 넓힌다 |
 *
 * ⇒ 마목 면적을 `additionalRecognizedArea`에 넣으면 한도가 부당하게 커져 초과분이 과소해진다
 *   (납세자에게 **유리한 방향**의 오류). 정정 전 UI hint·엔진 주석이 마목을 「나~바」로 묶어
 *   그 경로를 안내하고 있었다.
 *
 * ## 소득세법 §168의14③5호와의 이중적용은 구조적으로 불가능하다
 *
 * 「소득세법 시행규칙」 §83의5④1호(→ 시행령 §168의14③5호)는 **같은 토지**를 가리킨다:
 * "공장의 가동에 따른 소음·분진·악취 등으로 인하여 생활환경의 오염피해가 발생되는 지역 안의
 * 토지로서 그 토지소유자의 요구에 따라 취득한 공장용 부속토지의 **인접토지**".
 *
 * 그 인접토지 **자체를 양도**하면 `engine.ts` Step 2가 무조건 사업용으로 early-return 하므로
 * 공장 기준면적 판정(Step 0.5)에 **도달하지 않는다**. 아래 MOK-3가 그 사실을 고정한다.
 */
describe("별표6 3호마 — 오염피해 인접토지는 「추가 인정면적」이 아니다", () => {
  const SEGMENTS = [{ floorArea: 1200, ratePercent: 12 }]; // 1호 산출면적 10,000㎡
  const FACTORY_BODY = 11000; // 공장 본체 부속토지
  const ADJACENT = 2000; // 마목 인접토지 면적

  /**
   * ⚠️ 수치 설계 주의 — **3호가목이 먼저 초과분을 흡수한다**.
   * 산출면적 10,000㎡ · 비제한지역이면 가목 한도가 20%(2,000㎡)라 부속토지가 12,000㎡ 이하면
   * 자동으로 「이내」가 된다. 두 귀속 경로를 갈라 보려면 그 한도를 **넘는** 값을 써야 한다.
   */
  it("MOK-1: 마목분을 부속토지에 넣으면 대상이 늘어 초과분이 생긴다 (조문대로)", () => {
    // 본체 11,000 + 인접 2,000 = 13,000㎡ > 한도 12,000㎡(산출 10,000 + 가목 2,000)
    const r = judgeFactoryLandExcess(
      {
        locationCategory: "eup_myeon_or_complex",
        segments: SEGMENTS,
        totalAppurtenantLandArea: FACTORY_BODY + ADJACENT,
      },
      "마목 — 부속토지 편입",
    );
    expect(r.standardArea).toBe(12000);
    expect(r.isWithinLimit).toBe(false);
    expect(r.nonBusinessArea).toBe(1000);
  });

  it("MOK-2: 같은 면적을 「추가 인정면적」에 넣으면 한도가 늘어 초과분이 사라진다 — 유리한 오류", () => {
    // 🔴 정정 전 UI hint가 안내하던 경로. 대상은 11,000㎡ 그대로인데 한도만 13,000㎡로 커진다.
    const wrong = judgeFactoryLandExcess(
      {
        locationCategory: "eup_myeon_or_complex",
        segments: SEGMENTS,
        totalAppurtenantLandArea: FACTORY_BODY,
        additionalRecognizedArea: ADJACENT,
      },
      "마목 — 오귀속",
    );
    expect(wrong.standardArea).toBe(13000);
    expect(wrong.isWithinLimit).toBe(true);
    expect(wrong.nonBusinessArea).toBe(0);

    // 두 경로의 결과가 실제로 갈린다 — 귀속 위치가 세액을 바꾼다는 증명
    const correct = judgeFactoryLandExcess(
      {
        locationCategory: "eup_myeon_or_complex",
        segments: SEGMENTS,
        totalAppurtenantLandArea: FACTORY_BODY + ADJACENT,
      },
      "마목 — 부속토지 편입",
    );
    expect(correct.nonBusinessArea).toBe(1000);
    expect(wrong.nonBusinessArea).toBe(0);
  });

  it("MOK-3: 인접토지 자체를 양도하면 §168의14③5호가 먼저 걸려 공장 판정에 도달하지 않는다", () => {
    // 이중적용이 구조적으로 불가능한 근거(계획서 0-6). Step 2 early-return이 그 관문이다.
    const input = base(2000, { locationCategory: "eup_myeon_or_complex", segments: SEGMENTS });
    input.unconditionalExemption = { isFactoryAdjacent: true };
    const exempt = checkUnconditionalExemption(input, "other_land");
    expect(exempt.isExempt).toBe(true);
    expect(exempt.reason).toBe("factory_adjacent");
    // U3-05(2026-09-02) — legalBasis가 `NBL.UNCONDITIONAL_FACTORY_ADJACENT` 상수로 이관되면서
    // 표기가 「§83의5④」 → 「소득세법 시행규칙 §83조의5 ④ 1호」로 바뀌었다(법령명·법/령/규칙 명시).
    // 조문 자체는 동일하다. 문자열 리터럴 대신 상수를 단언해 표기 변경에 다시 깨지지 않게 한다.
    expect(exempt.legalBasis).toBe(NBL.UNCONDITIONAL_FACTORY_ADJACENT);
  });

  it("MOK-4: 나·다·라·바는 종전대로 기준면적에 가산된다 (마목만 빠진 것이지 규정 자체가 아니다)", () => {
    const r = computeFactoryStandardArea(SEGMENTS, 9000, { additionalRecognizedArea: 500 });
    expect(r.baseArea).toBe(10000);
    expect(r.additionalRecognizedArea).toBe(500);
    expect(r.standardArea).toBe(10500);
  });
});
