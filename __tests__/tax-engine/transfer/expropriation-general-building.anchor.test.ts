/**
 * anchor — 일반건물(토지+건물 일괄) §164⑨ 1호 공익수용 특례 (계획 D16-GB).
 *
 * 종전: `general-building-valuation.ts`의 GB 환산 경로는 `route.ts:736` early-return이라
 * `applyExpropriationValuation`을 호출하지 않아 §164⑨을 우회 → 수용+환산 시 토지 환산취득가
 * 과소 → 세액 과다. (사례 31 베이스 실측: 토지 환산취득가 233,908,636 → 316,653,817, +82,745,181원)
 *
 * 법령 조사 결론(2026-07-16): **토지분만 §164⑨ 적용**.
 *   - 환산 분모(§176의2②)만 min[]로 낮춘다 — 토지 환산취득가↑·차익↓.
 *   - **안분(§166⑥)은 원 개별공시지가 유지** — 안분 비율에 낮춘 값을 넣으면 토지 상대가치가
 *     인위적으로 하락해 양도가가 건물로 과다 배분됨(입법의도 밖 왜곡).
 *   - **건물분(나목)은 미적용** — 시행규칙 §80⑧이 "보상액 산정 기초 기준시가 = 토지 개별공시지가"로
 *     한정 정의. 국세청 해석 2건(서면-2016-부동산-4026·사전-2018-법령해석재산-0057)도 토지 사안.
 *
 * 베이스: 사례 31(서울 동작구 사당동) — general-building-case-31.test.ts와 동일 입력.
 *   수용 시나리오 추가: 토지 보상 8,000,000/㎡ · 보상기초 9,000,000/㎡ → min = 8,000,000/㎡.
 *   환산 분모 = 8,000,000 × 85 = 680,000,000 (현행 920,550,000).
 */
import { describe, it, expect } from "vitest";
import {
  buildGeneralBuildingAssetCards,
  calcLandGain,
  calcBuildingGain,
} from "@/lib/tax-engine/general-building-valuation";
import type { GeneralBuildingInput } from "@/lib/tax-engine/general-building-valuation";

// ── 사례 31 잠금 입력값 (동일) ──
const BASE: GeneralBuildingInput = {
  totalTransferPrice: 925_000_000,
  transferDate: new Date("2023-02-19"),
  acquisitionDate: new Date("1999-05-24"),
  landArea: 85,
  buildingArea: 180.96,
  buildingFootprintArea: 90.48,
  transferLandPricePerSqm: 10_830_000,
  transferBuildingStdPrice: 20_629_440,
  acquisitionLandPricePerSqm: 2_800_000,
  acquisitionBuildingStdPrice: 28_144_700,
  zoneType: "commercial",
  isMetropolitan: true,
  buildingAcquisitionCause: "purchase",
  buildingAcquisitionDate: new Date("1999-05-24"),
};

/** 수용 시나리오 3필드 (토지 전용) */
function expropriated(overrides: Partial<GeneralBuildingInput> = {}): GeneralBuildingInput {
  return {
    ...BASE,
    transferCause: "public_expropriation",
    compensationPerSqm: 8_000_000,
    compensationBasisStdPrice: 9_000_000,
    ...overrides,
  };
}

describe("일반건물 §164⑨ 1호 공익수용 특례 (D16-GB)", () => {
  it("GB-01 수용+환산 → 토지 환산 분모만 min[] 낮춤, 토지 환산취득가 316,653,817", () => {
    const out = buildGeneralBuildingAssetCards(expropriated());
    // 환산 분모 = min[10,830,000·8,000,000·9,000,000] × 85 = 680,000,000
    // 토지 환산취득가 = INT(904,725,192 × 238,000,000 / 680,000,000) = 316,653,817 (현행 233,908,636)
    expect(out.acquisition.land).toBe(316_653_817);
    // detail 노출
    expect(out.expropriationValuationDetail?.chosenPerSqm).toBe(8_000_000);
    expect(out.expropriationValuationDetail?.denominator).toBe(680_000_000);
    expect(out.expropriationValuationDetail?.perSqmCandidates).toEqual({
      standard: 10_830_000,
      compensation: 8_000_000,
      basis: 9_000_000,
    });
  });

  it("GB-01b 안분(§166⑥)·건물 환산은 불변 — 토지분만 적용", () => {
    const out = buildGeneralBuildingAssetCards(expropriated());
    // 안분 원 개별공시지가 유지 (분모 941,179,440 → land 904,725,192)
    expect(out.allocation.land).toBe(904_725_192);
    expect(out.allocation.building).toBe(20_274_808);
    // 건물 환산 분모(transferBuildingStdPrice) 무변경 → 건물 환산취득가 불변
    expect(out.acquisition.building).toBe(27_660_876);
    // 개산공제(취득시 기준시가 기준)도 불변
    expect(out.estimatedDeduction.land).toBe(7_140_000);
  });

  it("GB-01c 토지 양도차익 = 580,931,375 (현행 663,676,556 대비 −82,745,181)", () => {
    const out = buildGeneralBuildingAssetCards(expropriated());
    // 904,725,192 − 316,653,817 − 7,140,000 = 580,931,375
    expect(calcLandGain(out)).toBe(580_931_375);
    // 건물 차손 불변
    expect(calcBuildingGain(out)).toBe(-8_230_409);
  });

  it("GB-02 게이트 OFF — 수용 아님(general) → 현행 233,908,636", () => {
    const out = buildGeneralBuildingAssetCards(expropriated({ transferCause: "general" }));
    expect(out.acquisition.land).toBe(233_908_636);
    expect(out.expropriationValuationDetail).toBeUndefined();
  });

  it("GB-03 게이트 OFF — 양도 2009.02.03 → 현행 233,908,636", () => {
    const out = buildGeneralBuildingAssetCards(
      expropriated({ transferDate: new Date("2009-02-03") }),
    );
    expect(out.acquisition.land).toBe(233_908_636);
    expect(out.expropriationValuationDetail).toBeUndefined();
  });

  it("GB-04 게이트 OFF — 보상 후보 미입력 → 현행 233,908,636", () => {
    const out = buildGeneralBuildingAssetCards(
      expropriated({ compensationPerSqm: undefined }),
    );
    expect(out.acquisition.land).toBe(233_908_636);
    expect(out.expropriationValuationDetail).toBeUndefined();
  });
});
