/**
 * 감사 확정 결함 회귀 테스트 — stock-valuation-unlisted.ts
 *
 * ref 1) stock-valuation-unlisted.ts:192 — acq_face_value_only 분기가
 *        getValuationWeights(양도일) 시기별 연혁을 무시하고 현행 3:2 + 무조건 80% 하한을
 *        하드코딩 → 2007.2.28. 이전 양도에서 80% 하한을 잘못 적용(취득가 과소·세액 과대).
 *        수정: acqFace STEP1/STEP2도 MAIN과 동일하게 getValuationWeights + hasFloor80 게이팅.
 *
 * ref 2) stock-valuation-unlisted.ts:374 — MAIN weighted_avg 경로의 부동산과다보유 가중치 반전
 *        appliedRules가 취득후상장 조문 §165⑤을 잘못 인용. 반전 근거는 §165④1(법 §94①4 다목).
 *        수정: §165⑤ push → §165④1 push. (세액 불변, 라벨만 정정)
 *
 * 기대값은 법령(소득세법 시행령 §165④1 단서 2007.2.28. 시행)·연혁 모델에서 독립 도출.
 */
import { describe, it, expect } from "vitest";
import { calcUnlistedValuation } from "@/lib/tax-engine/stock-transfer/stock-valuation-unlisted";

// ────────────────────────────────────────────────────────────────
// ref 1 — 시기별 연혁 게이팅 (80% 하한은 2007.2.28. 이후 양도에만)
// ────────────────────────────────────────────────────────────────
// 공통 입력: acqFaceValueOnly=true, 액면가 12,500, 양도연도 NI 30,000 / NA 200,000, 양도가 60억
//   가중평균(3:2) = (30000×3 + 200000×2)/5 = 98,000
//   순자산 80% 하한 = 200,000 × 0.8 = 160,000
const acqFaceBase = {
  shareCount: 1000,
  acqFaceValueOnly: true,
  acqFaceValuePerShare: 12_500,
  transferYearNetIncomePerShare: 30_000,
  transferYearNetAssetPerShare: 200_000,
} as const;
const TRANSFER_PRICE = 6_000_000_000;

describe("[ref1] acq_face_value_only — 양도일 시기별 연혁 게이팅", () => {
  it("(a) 2005-06-01 양도(하한 시행 前) — 80% 하한 미발동, 양도기준시가=가중평균 98,000", () => {
    const r = calcUnlistedValuation(
      { ...acqFaceBase, transferDate: new Date("2005-06-01") } as never,
      TRANSFER_PRICE,
    );
    expect(r.method).toBe("acq_face_value_only");
    expect(r.netAssetFloorApplied).toBe(false);
    expect(r.transferStdPriceAfterFloor).toBe(98_000);
    // 환산취득가 = 양도가 × 액면가 / 양도기준시가 = 6e9 × 12,500 / 98,000
    // = 7.5e13 / 98,000 = 765,306,122.44… → BigInt 절사 765,306,122
    expect(r.totalAcquisitionPrice).toBe(765_306_122);
  });

  it("(b) 1998-06-01 양도(1999 前) — 순자산 단독 연혁, 양도기준시가=순자산 200,000", () => {
    const r = calcUnlistedValuation(
      { ...acqFaceBase, transferDate: new Date("1998-06-01") } as never,
      TRANSFER_PRICE,
    );
    expect(r.netAssetFloorApplied).toBe(false);
    // pre-1999: 순손익 가중치 0, 순자산 5/5 → (30000×0 + 200000×5)/5 = 200,000
    expect(r.transferStdPriceAfterFloor).toBe(200_000);
    // 환산취득가 = 7.5e13 / 200,000 = 375,000,000
    expect(r.totalAcquisitionPrice).toBe(375_000_000);
  });

  it("(c) 2026-05-01 양도(현행) — 80% 하한 발동 유지(무회귀), 양도기준시가=160,000", () => {
    const r = calcUnlistedValuation(
      { ...acqFaceBase, transferDate: new Date("2026-05-01") } as never,
      TRANSFER_PRICE,
    );
    expect(r.netAssetFloorApplied).toBe(true);
    expect(r.transferStdPriceAfterFloor).toBe(160_000);
    // 환산취득가 = 7.5e13 / 160,000 = 468,750,000
    expect(r.totalAcquisitionPrice).toBe(468_750_000);
  });
});

// ────────────────────────────────────────────────────────────────
// ref 2 — 부동산과다보유 가중치 반전 근거 조문 라벨 정정 (§165⑤ → §165④1)
// ────────────────────────────────────────────────────────────────
describe("[ref2] MAIN weighted_avg — heavyRE 가중치 반전 근거는 §165④1(§165⑤ 아님)", () => {
  it("appliedRules에 §165⑤ 미포함, §165④1 반전 라벨 포함(세액 불변)", () => {
    const r = calcUnlistedValuation(
      {
        shareCount: 1000,
        transferDate: new Date("2026-05-01"),
        acquisitionDate: new Date("2020-01-01"),
        isHeavyRealEstateForValuation: true,
        transferYearNetIncomePerShare: 30_000,
        transferYearNetAssetPerShare: 200_000,
        acquisitionYearNetIncomePerShare: 20_000,
        acquisitionYearNetAssetPerShare: 100_000,
      } as never,
      TRANSFER_PRICE,
    );
    expect(r.method).toBe("weighted_avg");
    // 취득후상장 조문 §165⑤은 이 경로와 무관 — 절대 등장 금지
    expect(r.appliedRules.some((x) => x.includes("§165⑤"))).toBe(false);
    // 반전 근거 라벨은 §165④1
    expect(r.appliedRules).toContain("소득세법 시행령 §165④1가중치반전");
    expect(r.appliedRules).toContain("부동산과다보유가중치반전");
    // 계산 무영향 확인: 2:3 반전 취득기준시가 = (20000×2 + 100000×3)/5 = 68,000
    //   (반전 없었다면 3:2 = 52,000이므로 68,000이면 반전 활성 & 정상 계산)
    expect(r.perShareValue).toBe(68_000);
  });
});
