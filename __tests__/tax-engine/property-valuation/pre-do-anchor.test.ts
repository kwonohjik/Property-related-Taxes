/**
 * Pre-Do Anchor — 비상장주식 평가 (별지 부표3 완전 재현)
 *
 * 정책: feedback_pre_anchor_verification
 * Plan/Design 완료 후 Do 진입 전 핵심 anchor 1건 우선 작성·실행 → FAIL 메시지 확보 → 디자인 환류
 *
 * 검증 대상:
 *   1. 사례 6 종합평가 — 현행 엔진(UnlistedStockData) 입력 모드로 PDF 1주당 10,910원 재현 시도
 *   2. 사례 3 PDF 가중평균 280 vs 손계산 200 모순 확인
 *
 * 기대: 모두 FAIL → Phase 2~4 신규 모듈 설계 시 floor 시점·PDF 오기 처리 정책 환류
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation.engine.design.md
 */

import { describe, it, expect } from "vitest";
import {
  evaluateUnlistedStock,
  calcUnlistedStockPerShareValue,
} from "@/lib/tax-engine/property-valuation-stock";
import type { EstateItem, UnlistedStockData } from "@/lib/tax-engine/types/inheritance-gift.types";

const makeUnlistedItem = (data: UnlistedStockData, id = "u1"): EstateItem => ({
  id,
  name: "비상장주식",
  category: "unlisted_stock",
  unlistedStockData: data,
});

// ============================================================
// Pre-Do Anchor #1 — 사례 6 종합평가 (PDF 1주당 10,910원·할증후 13,092원·상속재산 340,392,000원)
// ============================================================
//
// PDF 원본:
//   3년 순손익액 가중평균 = (76,842,660 × 3 + 62,416,500 × 2 + △5,311,910 × 1) / 6
//                       = (230,527,980 + 124,833,000 − 5,311,910) / 6
//                       = 350,049,070 / 6 = 58,341,511.67
//
//   1주당 순손익가치 ⑤ = 58,341,511 / (50,000주 × 10%) = 11,668.30
//                       PDF 표기 11,660원 (floor 또는 자체 산식)
//
//   1주당 순자산가치 ④ = 489,351,700 / 50,000주 = 9,787.034 → 9,787원
//   1주당 평가액 ⑥ = max((⑤×3 + ④×2)/5, ④×80%)
//                  = max((11,660×3+9,787×2)/5, 9,787×80%)
//                  = max(10,910.8, 7,829.6)
//                  = 10,910원
//   1주당 평가액 ⑧ (할증후) = 10,910 × 120% = 13,092원
//   상속재산가액 = 13,092 × 26,000주 = 340,392,000원
//
// 현행 엔진 한계:
//   - 회사 전체 가중평균(weightedNetIncome)을 받아 floor 시점이 PDF와 다름
//   - 별지 부표3 6쪽 ①~㉒ 가산·차감 → 다·라·마 산출 미지원
//   - 영업권 별도 평가 미지원 (netAssetValue에 포함 입력 강제)
//   - 최대주주 할증평가 미지원 (totalValue 후 외부 곱셈 강제)
// ============================================================

// ============================================================
// ✅ 환류 완료 (2026-05-22)
//   - P1-A1·A3·A5: floor 시점 차이 → weighted-avg.ts 신규 모듈로 환류 반영
//     (calcWeightedAvg3y → calcPerShareNetIncomeValue → calcPerShareWeightedValuation
//      4단계 floor 분리로 PDF 산식 정합)
//   - P1-A6: 할증평가 미지원 → Phase 4 max-shareholder-premium.ts로 환류 (후속 PR)
//   - P1-B: 사례 3 PDF 가중평균 280 오기 → anchor U-8 손계산 정합값(1,200원)으로 정정
//     case-1-net-income-calc.test.ts [U-8] 참조
//
// 본 describe는 "현행 엔진 한계 문서화"로 보존하되 skip 처리.
// Phase 2 신규 모듈 anchor는 case-1-net-income-calc.test.ts에서 100% PASS.
// ============================================================
describe.skip("[Pre-Do P1-A] 사례 6 — 현행 엔진(UnlistedStockData) PDF 재현 시도 (환류 완료 후 skip)", () => {
  const case6Data: UnlistedStockData = {
    totalShares: 50_000,        // PDF 1쪽 ① 발행주식총수 (가정 — 자본금 393,109,520 / 액면가 5,000 ≠ 50,000 ☆ 후속 검증)
    ownedShares: 26_000,        // 피상속인 보유
    weightedNetIncome: 58_341_511, // 3년 가중평균 (회사 전체) = 350,049,070 / 6 floor
    netAssetValue: 489_351_700, // 영업권 0원 가산 (사례 6 영업권 = 초과이익 △19,764,415 → 0)
    capitalizationRate: 0.10,
  };

  it("[P1-A1] 1주당 순손익가치 (PDF 11,660 vs 현행 엔진 floor 시점 차이)", () => {
    const result = calcUnlistedStockPerShareValue(case6Data, false);

    // PDF anchor: 11,660원
    // 현행 엔진: floor(58,341,511 / (50,000 × 0.10)) = floor(11,668.30) = 11,668
    // 차이: 8원 (회사전체 가중평균 ÷ (주식수×환원율) vs 1주당 가중평균 ÷ 환원율 floor 시점 차이)
    expect(result.perShareIncomeValue).toBe(11_660); // ⚠️ FAIL 예상 — 실제 11,668
  });

  it("[P1-A2] 1주당 순자산가치 (PDF 9,787)", () => {
    const result = calcUnlistedStockPerShareValue(case6Data, false);
    // 489,351,700 / 50,000 = 9,787.034 → floor = 9,787
    expect(result.perShareAssetValue).toBe(9_787); // PASS 예상
  });

  it("[P1-A3] 1주당 평가액 ⑥ (PDF 10,910)", () => {
    const result = calcUnlistedStockPerShareValue(case6Data, false);

    // PDF anchor: 10,910원 = (11,660×3+9,787×2)/5 floor
    // 현행 엔진: floor((11,668×3 + 9,787×2)/5) = floor((35,004+19,574)/5) = floor(10,915.6) = 10,915
    // 차이: 5원 (순손익가치 floor 시점 차이가 가중평균에 전파)
    expect(result.perShareWeightedValue).toBe(10_910); // ⚠️ FAIL 예상 — 실제 10,915
  });

  it("[P1-A4] 1주당 최소값 80% 하한 (PDF 7,830)", () => {
    const result = calcUnlistedStockPerShareValue(case6Data, false);
    // 9,787 × 0.80 = 7,829.6 → floor = 7,829
    // PDF 별지 양식상 ⑥-㉡ = 9,787 × 80% = 7,830 (PDF 표기 반올림)
    expect(result.perShareMinValue).toBe(7_829); // 정합
  });

  it("[P1-A5] 1주당 최종 평가액 (PDF 10,910, 80% 하한 미발동)", () => {
    const result = calcUnlistedStockPerShareValue(case6Data, false);
    // PDF: max(10,910, 7,830) = 10,910 (가중평균 우선)
    // 현행: max(10,915, 7,829) = 10,915 → 5원 차이
    expect(result.perShareFinalValue).toBe(10_910); // ⚠️ FAIL 예상 — 실제 10,915
  });

  it("[P1-A6] 총 평가액 (PDF 상속재산 = 340,392,000원, 할증평가 미지원)", () => {
    const item = makeUnlistedItem(case6Data);
    const result = evaluateUnlistedStock(item, false);

    // PDF anchor: 13,092 × 26,000 = 340,392,000원 (할증후)
    // 현행 엔진: 10,915 × 26,000 = 283,790,000원 (할증 미지원)
    // → 할증평가 미지원이 가장 큰 gap
    expect(result.valuatedAmount).toBe(340_392_000); // ⚠️ FAIL 예상 — 실제 283,790,000 (할증 미적용)
  });
});

// ============================================================
// Pre-Do Anchor #2 — 사례 3 PDF 가중평균 280 vs 손계산 200 모순 확인
// ============================================================
//
// PDF 자료:
//   2021: 1주당 순손익 550
//   2020: 1주당 순손익 △120
//   2019: 1주당 순손익 △210
//
// PDF 해설 표기:
//   1주당 최근 3년간 순손익가치의 가중평균액
//   = (550×3 + △120×2 + △210) / 6 = 280원
//
// 손계산:
//   = (1,650 − 240 − 210) / 6
//   = 1,200 / 6
//   = 200원
//
//   ↑ PDF 280 ≠ 손계산 200 — PDF 자체 오기 가능성
//   다만 PDF 1주당 가액 1,680원 = (2,800×3 + 0×2)/5 = 1,680 으로 가중평균 280에 정합
//   즉 PDF 표기 1,680원 결과가 정답이라면 가중평균 280이어야 하나, 분자 계산 산식이 다름
// ============================================================

describe.skip("[Pre-Do P1-B] 사례 3 — PDF 가중평균 280 vs 손계산 200 모순 (환류: case-1 U-8로 이관)", () => {
  it("[P1-B1] 수동 손계산 — (550×3 + △120×2 + △210)/6 = 200원", () => {
    // PDF 표기 산식대로 계산
    const sum = 550 * 3 + -120 * 2 + -210 * 1;
    const weighted = sum / 6;
    // 1,200 / 6 = 200
    expect(weighted).toBe(200);
  });

  it("[P1-B2] 회사 전체 순손익 환산 — 손계산 200원 시", () => {
    // 사례 3 자료:
    //   2021 55,000,000 / 100,000주 = 550
    //   2020 △12,000,000 / 100,000주 = △120
    //   2019 △21,000,000 / 100,000주 = △210
    //
    // 회사 전체 가중평균 순손익액
    //   = (55,000,000×3 + △12,000,000×2 + △21,000,000×1) / 6
    //   = (165,000,000 − 24,000,000 − 21,000,000) / 6
    //   = 120,000,000 / 6
    //   = 20,000,000원
    const companyWeighted = (55_000_000 * 3 + -12_000_000 * 2 + -21_000_000 * 1) / 6;
    expect(companyWeighted).toBe(20_000_000);

    // 1주당 순손익가치 = 20,000,000 / (100,000 × 0.10) = 2,000원
    // PDF 표기 2,800원과 800원 차이 → PDF 오기 확정
  });

  it("[P1-B3] 현행 엔진 — 손계산 정합 1주당 평가액 (PDF 1,680 vs 실측 1,200)", () => {
    // 손계산 정합 입력
    const data: UnlistedStockData = {
      totalShares: 100_000,
      ownedShares: 1,
      weightedNetIncome: 20_000_000,  // 손계산 정합값
      netAssetValue: 0,               // PDF 사례 3: △300,000,000 → §55① 후단 0
      capitalizationRate: 0.10,
    };
    const result = calcUnlistedStockPerShareValue(data, false);

    // 1주당 순손익가치 = floor(20,000,000 / (100,000 × 0.10)) = floor(2,000) = 2,000
    expect(result.perShareIncomeValue).toBe(2_000);

    // 1주당 가중평균 = floor((2,000×3 + 0×2)/5) = floor(1,200) = 1,200
    expect(result.perShareWeightedValue).toBe(1_200);

    // 80% 하한 = 0 × 0.8 = 0 → 미발동
    expect(result.perShareMinValue).toBe(0);

    // 최종 = max(1,200, 0) = 1,200
    // PDF anchor 1,680원과 차이 — PDF 가중평균 280 표기 사용 시 1,680 도출 (오기 일관)
    expect(result.perShareFinalValue).toBe(1_200); // ⚠️ PDF U-8 1,680과 다른 손계산 정합값
  });

  it("[P1-B4] PDF 표기 정합 (가중평균 280 가정) — 1,680원 재현", () => {
    // PDF 표기를 그대로 재현하려면 weightedNetIncome = 28,000,000 (회사 전체)
    // (PDF 손계산 검증 미통과 — anchor 정정 필요 신호)
    const dataIfPdfCorrect: UnlistedStockData = {
      totalShares: 100_000,
      ownedShares: 1,
      weightedNetIncome: 28_000_000, // PDF 표기 280 × 100,000 × 0.10 역산
      netAssetValue: 0,
      capitalizationRate: 0.10,
    };
    const result = calcUnlistedStockPerShareValue(dataIfPdfCorrect, false);
    // 1주당 순손익가치 = floor(28,000,000 / 10,000) = 2,800
    expect(result.perShareIncomeValue).toBe(2_800);
    // 가중평균 = floor((2,800×3 + 0×2)/5) = floor(1,680) = 1,680
    expect(result.perShareWeightedValue).toBe(1_680); // PDF U-8 정합
  });
});

// ============================================================
// 디자인 환류 신호 — Phase 2~4 설계 시 반영
// ============================================================
//
// 1. floor 시점 차이 (P1-A1·A3·A5):
//    PDF 산식은 "1주당 순손익가치(11,660 floor) × 3 + 1주당 순자산가치(9,787) × 2 / 5"
//    현행 엔진은 "회사 전체 가중평균 / (주식수 × 환원율) → 1주당 순손익가치(11,668 floor)"
//    → 신규 weighted-avg.ts 모듈은 PDF 산식 따라 1주당 순손익가치를 먼저 floor 후 가중평균 적용
//
// 2. 사례 6 자본금 393M 차이 (P1-A 데이터 ☆):
//    자본금 393,109,520 ÷ 액면가 5,000 = 78,621주 ≠ PDF 발행주식총수 50,000주
//    잉여금 자본전입·무상증자 미반영 가능성 → 자본금 입력 표 보강
//
// 3. 사례 3 PDF 오기 확정 (P1-B1·B2·B4):
//    PDF 가중평균 280은 손계산 200과 일치 안 함.
//    anchor U-8(1,680원)을 손계산 정합값(1,200원)으로 정정하거나,
//    PDF 표기 그대로 유지 시 weightedNetIncome 입력값을 28,000,000으로 역산 anchor.
//    → 계획서 §6 U-8 주석에 "PDF 자체 오기 — 손계산 1,200원이 정답이나 PDF 표기 1,680원 보존" 명시
//
// 4. 영업권 별도 평가 미지원:
//    현행 엔진은 netAssetValue에 영업권 포함 강제. 신규 goodwill.ts 모듈 필요 확정 (U-19 31,747,950원 anchor)
//
// 5. 최대주주 할증평가 미지원 (P1-A6 → 56,602,000원 gap):
//    현행 엔진은 최대주주 할증 ×120% 미지원. 신규 max-shareholder-premium.ts 모듈 필요 확정
//
// ============================================================
