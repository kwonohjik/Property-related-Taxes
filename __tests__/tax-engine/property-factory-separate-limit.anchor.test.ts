/**
 * anchor — 재산세 분리과세 **공장용지 면적 한도** (「지방세법 시행령」 §102①1호)
 *
 * 계획: docs/02-design/features/property-separate-taxation-factory-limit.plan.md
 *
 * ## 결함 (정정 전)
 *
 * §102①1호는 분리과세 공장용지를 "…행정안전부령으로 정하는 **공장입지기준면적 범위의 토지**"로
 * 한정하고, 단서로 "허가 등을 받지 않은 공장용 건축물이나 사용승인을 받지 않고 사용 중인
 * 공장용 건축물의 부속토지는 **제외**한다"고 정한다(법제처 MST 287223 실측).
 *
 * 그런데 종전 엔진은 `isFactoryLand` 플래그만 보고 **면적 한도 없이 전량 0.2%**를 줬다.
 * 한도를 넘는 부분은 종합합산 누진세율(0.2~0.5%) 대상인데 분리과세 0.2%를 받고 있었다 —
 * **납세자에게 유리한 방향**의 오류다.
 *
 * ## 초과분은 세액에 반영하지 않는다 (별도합산 경로와 같은 취급)
 *
 * 종합합산은 **인별 전국 합산**이라 단일 필지 계산기가 세율을 정할 수 없다. 별도합산
 * (`totalExcessOfficialValue`)과 동일하게 **경고로 이관 안내**만 하고, 분리과세 세액은
 * 인정분 시가표준액에만 매긴다.
 *
 * ## 픽스처 산수
 *
 * 연면적 1,200㎡ ÷ 면적률 12% = 산출면적 **10,000㎡** (별표6 1호)
 * 비제한지역 → 3호가2) 20% = 2,000㎡까지 추가 인정 → **한도 최대 12,000㎡**
 */
import { describe, it, expect } from "vitest";
import { calculateSeparateTax } from "@/lib/tax-engine/separate-taxation";
import type { SeparateTaxationInput } from "@/lib/tax-engine/separate-taxation";
import { PROPERTY } from "@/lib/tax-engine/legal-codes";

function factory(overrides: Partial<SeparateTaxationInput> = {}): SeparateTaxationInput {
  return {
    assessedValue: 100_000_000,
    isFactoryLand: true,
    factoryLocation: "industrial_zone",
    factoryTotalLandArea: 8000,
    factoryFloorArea: 1200,
    factoryAreaRatePercent: 12,
    ...overrides,
  };
}

describe("§102①1호 — 공장입지기준면적 범위만 분리과세다", () => {
  it("LIM-1: 기준면적 이내면 전량 분리과세 0.2% (초과분 0)", () => {
    const r = calculateSeparateTax(factory({ factoryTotalLandArea: 8000 }));
    expect(r.isApplicable).toBe(true);
    expect(r.appliedRate).toBe(0.002);
    expect(r.factoryAreaCheck?.standardArea).toBe(10000); // 초과분 없으니 3호가 가산 0
    expect(r.factoryAreaCheck?.excessArea).toBe(0);
    expect(r.factoryAreaCheck?.recognizedRatio).toBe(1);
  });

  it("LIM-2: 3호가2) 20% 한도 안의 초과는 흡수된다 (11,000㎡ → 여전히 이내)", () => {
    const r = calculateSeparateTax(factory({ factoryTotalLandArea: 11000 }));
    expect(r.factoryAreaCheck?.standardArea).toBe(11000); // 10,000 + 가산 1,000
    expect(r.factoryAreaCheck?.excessArea).toBe(0);
  });

  it("LIM-3: 🔴 20% 한도를 넘으면 초과분이 생긴다 — 정정 전에는 전량 분리과세였다", () => {
    // 15,000㎡ vs 한도 12,000㎡(10,000 + 가산 2,000) → 초과 3,000㎡
    const r = calculateSeparateTax(factory({ factoryTotalLandArea: 15000 }));
    expect(r.factoryAreaCheck?.standardArea).toBe(12000);
    expect(r.factoryAreaCheck?.recognizedArea).toBe(12000);
    expect(r.factoryAreaCheck?.excessArea).toBe(3000);
    expect(r.factoryAreaCheck?.recognizedRatio).toBeCloseTo(0.8, 10);
  });

  it("LIM-4: 🔴 세액이 바뀐다 — 과세표준이 인정분(80%)에만 매겨진다", () => {
    const within = calculateSeparateTax(factory({ factoryTotalLandArea: 8000 }));
    const over = calculateSeparateTax(factory({ factoryTotalLandArea: 15000 }));

    // 이내: 1억 × 70% = 7,000만 × 0.2% = 140,000원
    expect(within.taxBase).toBe(70_000_000);
    expect(within.calculatedTax).toBe(140_000);

    // 초과: 인정분 8,000만 × 70% = 5,600만 × 0.2% = 112,000원
    expect(over.factoryAreaCheck?.recognizedAssessedValue).toBe(80_000_000);
    expect(over.taxBase).toBe(56_000_000);
    expect(over.calculatedTax).toBe(112_000);
  });

  it("LIM-5: 초과분 시가표준액은 종합합산 이관으로 안내된다 (세액 미반영)", () => {
    const r = calculateSeparateTax(factory({ factoryTotalLandArea: 15000 }));
    expect(r.factoryAreaCheck?.excessAssessedValue).toBe(20_000_000);
    // 인정분 + 초과분 = 전체 (안분 잔액 보존)
    expect(
      (r.factoryAreaCheck?.recognizedAssessedValue ?? 0) +
        (r.factoryAreaCheck?.excessAssessedValue ?? 0),
    ).toBe(100_000_000);
    expect(r.warnings.some((w) => w.includes("종합합산과세대상으로 이관"))).toBe(true);
  });

  it("LIM-6: 전량 초과면 분리과세 비해당이다", () => {
    // 면적률 12%·연면적 120㎡ → 산출 1,000㎡ · 가산 200 → 한도 1,200㎡ 인데 부속토지 50,000㎡
    const r = calculateSeparateTax(
      factory({ factoryFloorArea: 120, factoryTotalLandArea: 50000 }),
    );
    expect(r.isApplicable).toBe(true); // 한도 이내분이 존재하므로 비해당은 아니다
    expect(r.factoryAreaCheck?.recognizedArea).toBe(1200);
    expect(r.factoryAreaCheck?.excessArea).toBe(48800);
  });

  it("LIM-7: 제한지역은 10%·3,000㎡ 한도가 걸린다 (별표6 3호가1))", () => {
    // 산출 10,000 · 제한지역 10% = 1,000㎡ (3,000㎡ 상한 미달) → 한도 11,000㎡
    const r = calculateSeparateTax(
      factory({ factoryTotalLandArea: 15000, factoryIsRestrictedZone: true }),
    );
    expect(r.factoryAreaCheck?.standardArea).toBe(11000);
    expect(r.factoryAreaCheck?.excessArea).toBe(4000);
  });

  it("LIM-8: 별표6 3호나·다·라 추가 인정면적이 한도를 늘린다", () => {
    const r = calculateSeparateTax(
      factory({ factoryTotalLandArea: 15000, factoryAdditionalRecognizedArea: 1500 }),
    );
    expect(r.factoryAreaCheck?.standardArea).toBe(13500); // 10,000 + 가산 2,000 + 별도 1,500
    expect(r.factoryAreaCheck?.excessArea).toBe(1500);
  });

  /**
   * E4-06 (2026-09-02 코드리뷰) — **바목만** 「공장입지기준면적의 100분의 10 이내」 상한이 있다.
   * 종전에는 바목 몫이 나·다·라와 한 입력에 섞여 상한을 강제할 수 없었고, 그 결함이
   * 공용 leaf(`computeFactoryStandardArea`)에 있어 재산세 분리과세에도 그대로 있었다.
   * 상한이 없으면 기준면적이 부풀어 **초과분(종합합산으로 넘어갈 면적)이 과소** 산출된다.
   */
  it("LIM-8b: 별표6 3호바 종업원용 체육시설은 기준면적의 10%로 잘린다 (E4-06)", () => {
    const r = calculateSeparateTax(
      factory({
        factoryTotalLandArea: 15000,
        factoryEmployeeSportsFacility: { employeeCount: 500, playgroundArea: 5000 },
      }),
    );
    // 분모 = 산출 10,000 + 가목 2,000 = 12,000 → 10% = 1,200 (입력 5,000이 아니다)
    expect(r.factoryAreaCheck?.standardArea).toBe(13200);
    expect(r.factoryAreaCheck?.excessArea).toBe(1800);
  });

  it("LIM-8c: 한도 이내(1,000㎡)면 전액 인정된다 (과차단 방지)", () => {
    const r = calculateSeparateTax(
      factory({
        factoryTotalLandArea: 15000,
        factoryEmployeeSportsFacility: { employeeCount: 500, playgroundArea: 1000 },
      }),
    );
    expect(r.factoryAreaCheck?.standardArea).toBe(13000);
  });
});

describe("§102①1호 단서 — 허가·사용승인 미이행은 분리과세에서 제외한다", () => {
  it("LIM-9: 단서 해당 시 기준면적과 무관하게 비해당", () => {
    const r = calculateSeparateTax(
      factory({ factoryTotalLandArea: 1000, factoryIsUnpermitted: true }),
    );
    expect(r.isApplicable).toBe(false);
    expect(r.warnings.some((w) => w.includes("§102①1호 단서"))).toBe(true);
  });
});

/**
 * ⑫ Zod — TypeScript가 잡지 못하는 유일한 실질 관문.
 *
 * `z.object`는 스키마에 없는 키를 **조용히 strip**한다. 필드를 엔진 타입에만 추가하고 스키마
 * 등록을 잊으면 컴파일도 되고 단위 테스트도 통과하는데 **엔진에는 값이 도달하지 않는다**.
 * 그 결과가 여기서는 "한도 판정이 사라져 전량 분리과세" — 눈에 띄지 않는 유리한 오류다.
 */
describe("⑫ Zod — 공장 면적 필드가 strip되지 않는다", () => {
  it("LIM-13: 7개 신규 필드가 모두 파싱 결과에 남는다", async () => {
    const { propertyTaxInputSchema } = await import("@/lib/validators/property-input");
    const parsed = propertyTaxInputSchema.parse({
      objectType: "land",
      publishedPrice: 100_000_000,
      landTaxType: "separated",
      separateTaxationItem: {
        isFactoryLand: true,
        factoryLocation: "industrial_zone",
        factoryTotalLandArea: 15000,
        factoryFloorArea: 1200,
        factoryAreaRatePercent: 12,
        factoryIsRestrictedZone: true,
        factoryAdditionalRecognizedArea: 500,
        // E4-06 — 바목 전용 채널. ⑫에 등록하지 않으면 z.object가 조용히 strip해
        // 10% 상한 판정 자체가 엔진에 도달하지 않는다.
        factoryEmployeeSportsFacility: { employeeCount: 500, playgroundArea: 700 },
        factoryIsUnpermitted: false,
      },
    });
    const st = parsed.separateTaxationItem!;
    expect(st.factoryTotalLandArea).toBe(15000);
    expect(st.factoryFloorArea).toBe(1200);
    expect(st.factoryAreaRatePercent).toBe(12);
    expect(st.factoryIsRestrictedZone).toBe(true);
    expect(st.factoryAdditionalRecognizedArea).toBe(500);
    expect(st.factoryEmployeeSportsFacility).toEqual({ employeeCount: 500, playgroundArea: 700 });
    expect(st.factoryIsUnpermitted).toBe(false);
  });
});

describe("미입력은 통과시키지 않는다 — 모르는 채 유리하게 주지 않는다", () => {
  it("LIM-10: 부속토지 면적 미입력 → 던진다", () => {
    expect(() => calculateSeparateTax(factory({ factoryTotalLandArea: undefined }))).toThrow(
      /부속토지 면적/,
    );
  });

  it("LIM-11: 연면적·면적률 미입력 → 던진다 (연면적은 바닥면적과 다른 값)", () => {
    expect(() => calculateSeparateTax(factory({ factoryFloorArea: undefined }))).toThrow(
      /연면적/,
    );
    expect(() =>
      calculateSeparateTax(factory({ factoryAreaRatePercent: undefined })),
    ).toThrow(/기준공장면적률/);
  });

  it("LIM-12: 공장이 아닌 분리과세(염전)는 면적 입력을 요구하지 않는다", () => {
    const r = calculateSeparateTax({ assessedValue: 100_000_000, isSaltField: true });
    expect(r.isApplicable).toBe(true);
    expect(r.reasoning.legalBasis).toBe(PROPERTY.SEPARATE.STANDARD_SALT_FIELD);
    expect(r.factoryAreaCheck).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
/**
 * 목장용지 면적 한도 — 「지방세법 시행령」 §102①3호 [표]
 *
 * 기준면적 = (축사 + 부대시설 + 초지 + 사료밭 중 **보유 시설분 합산**) × 마릿수 ÷ 가축두수 단위
 *
 * ⚠️ 마릿수는 **직전 연도 연중 최고**다(§102①3호 본문) — 양도세 별표1의3 2호의
 *   「과세기간 평균」과 다른 기준이므로 두 세목이 같은 값을 쓰면 안 된다.
 *
 * ⚠️ 종전 헤더는 「max(초지, 사료밭)」이라고 적었으나 **바로 아래 자기 자신의 테스트가 합산을
 *   단언**하고 있었다(PAS-1 75,125 = 7,512.5×10 · PAS-3 dairy 7,518 = 11+7+5,000+2,500).
 *   max 안은 검토 후 폐기됐다 — 그 서술만 믿고 되돌리면 한도가 줄어 회귀가 난다
 *   (V4-a, 2026-09-02 코드리뷰. 같은 드리프트가 `data/livestock-standards.ts` 헤더에도 있었다).
 *   경위: `docs/02-design/features/livestock-standard-area-limit.plan.md`
 */
describe("§102①3호 — 목장용지 가축별 기준면적", () => {
  const pasture = (over: Partial<SeparateTaxationInput> = {}): SeparateTaxationInput => ({
    assessedValue: 100_000_000,
    isLivestockFarm: true,
    pastureTotalLandArea: 40000,
    pastureLivestockType: "hanwoo_breeding",
    pastureLivestockCount: 10,
    // 보유 시설을 명시한다 — 표의 4개 열은 항목별 인정 한도라 기본값을 두면 세액이 틀어진다.
    pastureHasFacility: true,
    pastureHasGrassland: true,
    pastureHasFodder: true,
    ...over,
  });

  it("PAS-1: 기준면적 이내면 전량 분리과세 0.07%", () => {
    // 한우 사육 10두 × 7,512.5(넷 다 보유) = 75,125㎡ 한도 · 40,000㎡ → 이내
    const r = calculateSeparateTax(pasture());
    expect(r.isApplicable).toBe(true);
    expect(r.appliedRate).toBe(0.0007);
    expect(r.pastureAreaCheck?.standardArea).toBe(75125);
    expect(r.pastureAreaCheck?.excessArea).toBe(0);
  });

  it("PAS-2: 🔴 초과분이 생기고 과세표준이 인정분에만 매겨진다", () => {
    const r = calculateSeparateTax(pasture({ pastureTotalLandArea: 150250 }));
    expect(r.pastureAreaCheck?.recognizedArea).toBe(75125);
    expect(r.pastureAreaCheck?.excessArea).toBe(75125);
    expect(r.pastureAreaCheck?.recognizedRatio).toBe(0.5);
    // 1억 × 50% = 5,000만 × 70% = 3,500만 × 0.07% = 24,500원
    expect(r.taxBase).toBe(35_000_000);
    expect(r.calculatedTax).toBe(24_500);
  });

  it("PAS-3: 축종별 한도가 표대로 다르다 (초지 「-」인 3종은 축사+부대시설뿐)", () => {
    const pig = calculateSeparateTax(
      pasture({ pastureLivestockType: "pig", pastureLivestockCount: 5, pastureTotalLandArea: 100 }),
    );
    expect(pig.pastureAreaCheck?.standardArea).toBe(63); // 50 + 13
    const dairy = calculateSeparateTax(
      pasture({ pastureLivestockType: "dairy", pastureLivestockCount: 1, pastureTotalLandArea: 100 }),
    );
    expect(dairy.pastureAreaCheck?.standardArea).toBe(7518); // 11 + 7 + 5000 + 2500 (넷 다 보유)
  });

  it("PAS-3b: 🔴 보유하지 않은 시설의 몫은 얹지 않는다", () => {
    // 사료 재배만 하는 농가 — 초지가 없으므로 초지 몫(5,000/두)을 받지 못한다
    const fodderOnly = calculateSeparateTax(
      pasture({ pastureHasGrassland: false, pastureTotalLandArea: 100 }),
    );
    expect(fodderOnly.pastureAreaCheck?.standardArea).toBe(25125); // (7.5+5+2500) × 10
    // 축사만 있는 농가
    const barnOnly = calculateSeparateTax(
      pasture({
        pastureHasFacility: false,
        pastureHasGrassland: false,
        pastureHasFodder: false,
        pastureTotalLandArea: 100,
      }),
    );
    expect(barnOnly.pastureAreaCheck?.standardArea).toBe(75); // 7.5 × 10
  });

  it("PAS-3c: 경고가 무엇을 반영했는지 드러낸다 (사용자 검증 가능)", () => {
    const r = calculateSeparateTax(
      pasture({ pastureHasGrassland: false, pastureTotalLandArea: 1_000_000 }),
    );
    const w = r.warnings.find((x) => x.includes("종합합산과세대상으로 이관"))!;
    expect(w).toContain("축사·부대시설·사료포");
    expect(w).not.toContain("초지");
  });

  it("PAS-4: §102⑨1호 — 도시지역은 1989.12.31 이전 소유가 아니면 비해당", () => {
    const r = calculateSeparateTax(pasture({ pastureIsUrbanArea: true, pastureOwnedBefore1990: false }));
    expect(r.isApplicable).toBe(false);
    expect(r.warnings.some((w) => w.includes("§102⑨1호"))).toBe(true);
  });

  it("PAS-5: 도시지역이어도 1989.12.31 이전 소유면 통과한다", () => {
    const r = calculateSeparateTax(pasture({ pastureIsUrbanArea: true, pastureOwnedBefore1990: true }));
    expect(r.isApplicable).toBe(true);
  });

  it("PAS-6: 도시지역 밖은 소유시기 제한을 받지 않는다", () => {
    const r = calculateSeparateTax(pasture({ pastureIsUrbanArea: false, pastureOwnedBefore1990: false }));
    expect(r.isApplicable).toBe(true);
  });

  it("PAS-7: 미입력·미등재 축종은 던진다 (모른 채 유리하게 주지 않는다)", () => {
    expect(() => calculateSeparateTax(pasture({ pastureTotalLandArea: undefined }))).toThrow(/전체 면적/);
    expect(() => calculateSeparateTax(pasture({ pastureLivestockType: undefined }))).toThrow(/축종/);
    expect(() => calculateSeparateTax(pasture({ pastureLivestockCount: undefined }))).toThrow(/마릿수/);
    expect(() => calculateSeparateTax(pasture({ pastureLivestockType: "alpaca" }))).toThrow(/등재되지 않은 축종/);
  });

  it("PAS-8: ⑫ Zod — 목장 5필드가 strip되지 않는다", async () => {
    const { propertyTaxInputSchema } = await import("@/lib/validators/property-input");
    const parsed = propertyTaxInputSchema.parse({
      objectType: "land",
      publishedPrice: 100_000_000,
      landTaxType: "separated",
      separateTaxationItem: {
        isLivestockFarm: true,
        pastureTotalLandArea: 40000,
        pastureLivestockType: "hanwoo_breeding",
        pastureLivestockCount: 10,
        pastureIsUrbanArea: true,
        pastureOwnedBefore1990: true,
      },
    });
    const st = parsed.separateTaxationItem!;
    expect(st.pastureTotalLandArea).toBe(40000);
    expect(st.pastureLivestockType).toBe("hanwoo_breeding");
    expect(st.pastureLivestockCount).toBe(10);
    expect(st.pastureIsUrbanArea).toBe(true);
    expect(st.pastureOwnedBefore1990).toBe(true);
  });
});
