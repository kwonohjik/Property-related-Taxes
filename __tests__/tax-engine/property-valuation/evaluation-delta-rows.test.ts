/**
 * PR-N 후속 anchor — 평가차액 행 단위 입력 (별지 부표3 3쪽)
 *
 * 검증 대상 (계획서 §4-3 + 디자인 §1 N-1/N-2/N-3):
 *   N-1: 사례 6 자산 8행 + 부채 3행 → 자산 107,324,150 / 부채 15,775,800 / 평가차액 91,548,350
 *   N-2: 음수 차액 △ 부호 처리 (단기대여금·외화채권 등)
 *   N-3: 총액 직접 입력 fallback (3중 패턴 — 행 단위 미입력 시 총액 사용)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-followup.plan.md §4-3
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation-followup.design.md §1 N-1·N-2·N-3
 */

import { describe, it, expect } from "vitest";
import {
  resolveEvaluationDelta,
  withResolvedEvaluationDelta,
  type EvaluationDeltaRow,
} from "@/lib/tax-engine/property-valuation/evaluation-delta";

// ============================================================
// 사례 6 — 3쪽 평가차액 표 (이미지 3 우측)
// ============================================================

const CASE_6_ASSET_ROWS: EvaluationDeltaRow[] = [
  { rowId: "a1", category: "asset", accountName: "미수이자", evaluationAmount: 5_744_770, bookAmount: 5_300_000 },
  { rowId: "a2", category: "asset", accountName: "매출채권", evaluationAmount: 299_050_000, bookAmount: 298_534_500 },
  { rowId: "a3", category: "asset", accountName: "단기대여금", evaluationAmount: 493_000_000, bookAmount: 495_000_000 },
  { rowId: "a4", category: "asset", accountName: "상품및제품", evaluationAmount: 49_527_500, bookAmount: 55_027_500 },
  { rowId: "a5", category: "asset", accountName: "투자유가증권", evaluationAmount: 275_554_500, bookAmount: 250_887_000 },
  { rowId: "a6", category: "asset", accountName: "외화채권", evaluationAmount: 145_300_200, bookAmount: 150_670_350 },
  { rowId: "a7", category: "asset", accountName: "토지", evaluationAmount: 400_550_000, bookAmount: 330_500_000 },
  { rowId: "a8", category: "asset", accountName: "기계장치", evaluationAmount: 334_410_000, bookAmount: 309_893_470 },
];

const CASE_6_LIABILITY_ROWS: EvaluationDeltaRow[] = [
  { rowId: "l1", category: "liability", accountName: "외화채무", evaluationAmount: 185_335_800, bookAmount: 200_560_000 },
  { rowId: "l2", category: "liability", accountName: "손해배상금", evaluationAmount: 26_000_000, bookAmount: 0 },
  { rowId: "l3", category: "liability", accountName: "보증채무", evaluationAmount: 5_000_000, bookAmount: 0 },
];

describe("[N-1] 사례 6 평가차액 행 단위 → 91,548,350", () => {
  it("N-1: 자산 8행 + 부채 3행 → 사례 6 (이미지 3) 정합", () => {
    const result = resolveEvaluationDelta({
      assetDeltaRows: CASE_6_ASSET_ROWS,
      liabilityDeltaRows: CASE_6_LIABILITY_ROWS,
    });

    // ① 자산 합계 = 444,770 + 515,500 + (−2,000,000) + (−5,500,000) + 24,667,500
    //              + (−5,370,150) + 70,050,000 + 24,516,530 = 107,324,150
    expect(result.assetDelta).toBe(107_324_150);

    // ② 부채 합계 = (−15,224,200) + 26,000,000 + 5,000,000 = 15,775,800
    expect(result.liabilityDelta).toBe(15_775_800);

    // 가. 평가차액 = ① − ② = 91,548,350   → 2쪽 4.가.② 기재
    expect(result.evaluationDelta).toBe(91_548_350);
    expect(result.source).toBe("rows");

    // 행별 차액 derive
    expect(result.assetRows).toHaveLength(8);
    expect(result.assetRows[0].delta).toBe(444_770);
    expect(result.assetRows[2].delta).toBe(-2_000_000); // 단기대여금 음수
    expect(result.liabilityRows[0].delta).toBe(-15_224_200);
  });
});

describe("[N-2] 음수 차액 처리 (단기대여금·외화채권)", () => {
  it("N-2a: 단기대여금 493M < 495M → 음수 차액 −2,000,000", () => {
    const result = resolveEvaluationDelta({
      assetDeltaRows: [
        {
          rowId: "x",
          category: "asset",
          accountName: "단기대여금",
          evaluationAmount: 493_000_000,
          bookAmount: 495_000_000,
        },
      ],
      liabilityDeltaRows: [],
    });

    expect(result.assetRows[0].delta).toBe(-2_000_000);
    expect(result.assetDelta).toBe(-2_000_000);
    expect(result.evaluationDelta).toBe(-2_000_000); // 자산만 음수 → 평가차액 음수
  });

  it("N-2b: 외화채무 부채 음수 차액 (185M < 200M) → 평가차액 양수 증가", () => {
    // 부채 평가차액이 음수면 차감 → 자산이 동일해도 평가차액 증가
    const result = resolveEvaluationDelta({
      assetDeltaRows: [],
      liabilityDeltaRows: [
        {
          rowId: "x",
          category: "liability",
          accountName: "외화채무",
          evaluationAmount: 185_335_800,
          bookAmount: 200_560_000,
        },
      ],
    });

    expect(result.liabilityRows[0].delta).toBe(-15_224_200);
    expect(result.liabilityDelta).toBe(-15_224_200);
    // 평가차액 = 0 − (−15,224,200) = +15,224,200
    expect(result.evaluationDelta).toBe(15_224_200);
  });
});

describe("[N-3] 총액 직접 입력 fallback (3중 패턴)", () => {
  it("N-3a: 행 미입력 + 총액 직접 입력 → 총액 사용 (회귀 보호)", () => {
    const result = resolveEvaluationDelta({
      assetEvaluationDeltaTotal: 107_324_150,
      liabilityEvaluationDeltaTotal: 15_775_800,
    });

    expect(result.assetDelta).toBe(107_324_150);
    expect(result.liabilityDelta).toBe(15_775_800);
    expect(result.evaluationDelta).toBe(91_548_350);
    expect(result.source).toBe("total");
    expect(result.assetRows).toHaveLength(0);
    expect(result.liabilityRows).toHaveLength(0);
  });

  it("N-3b: 행 입력 우선 — 총액과 동시 입력 시 행 단위 사용", () => {
    // 행 단위 입력이 있으면 총액은 무시
    const result = resolveEvaluationDelta({
      assetDeltaRows: CASE_6_ASSET_ROWS,
      liabilityDeltaRows: CASE_6_LIABILITY_ROWS,
      assetEvaluationDeltaTotal: 9_999_999_999, // 행 단위 우선이므로 무시
      liabilityEvaluationDeltaTotal: 9_999_999_999,
    });

    expect(result.source).toBe("rows");
    expect(result.evaluationDelta).toBe(91_548_350);
  });

  it("N-3c: 행 미입력 + 총액도 미입력 → 0 (안전 default)", () => {
    const result = resolveEvaluationDelta({});
    expect(result.assetDelta).toBe(0);
    expect(result.liabilityDelta).toBe(0);
    expect(result.evaluationDelta).toBe(0);
    expect(result.source).toBe("total");
  });

  it("N-3d: 행 단위 vs 총액 동일 결과 검증 (3중 패턴 정합성)", () => {
    const rowResult = resolveEvaluationDelta({
      assetDeltaRows: CASE_6_ASSET_ROWS,
      liabilityDeltaRows: CASE_6_LIABILITY_ROWS,
    });
    const totalResult = resolveEvaluationDelta({
      assetEvaluationDeltaTotal: rowResult.assetDelta,
      liabilityEvaluationDeltaTotal: rowResult.liabilityDelta,
    });

    // 두 방식 결과 동일성 보장
    expect(rowResult.evaluationDelta).toBe(totalResult.evaluationDelta);
  });
});

// ============================================================
// [N-4] withResolvedEvaluationDelta — 순자산표 ②(assetValuationDelta) 보정 헬퍼
//   화면 입력폼·별지 화면/PDF 제2쪽이 raw.assetValuationDelta를 직접 읽어
//   행 모드에서 ②=0 stale가 되던 dual-truth 버그 해소 (단일 진실).
// ============================================================
describe("[N-4] withResolvedEvaluationDelta 순자산표 ② 보정", () => {
  // 스크린샷 시나리오: 토지 +40M, 건물 +10M, 차입금 −20M → 70,000,000
  const SCREENSHOT_ROWS: EvaluationDeltaRow[] = [
    { rowId: "a1", category: "asset", accountName: "토지", evaluationAmount: 140_000_000, bookAmount: 100_000_000 },
    { rowId: "a2", category: "asset", accountName: "건물", evaluationAmount: 120_000_000, bookAmount: 110_000_000 },
    { rowId: "l1", category: "liability", accountName: "차입금", evaluationAmount: 70_000_000, bookAmount: 90_000_000 },
  ];

  it("N-4a: 행 모드 — assetValuationDelta=0이어도 보정값 70,000,000 치환", () => {
    const raw = { assetValuationDelta: 0, bsTotalAssets: 1_000_000_000, evaluationDeltaRows: SCREENSHOT_ROWS };
    const eff = withResolvedEvaluationDelta(raw);
    expect(eff.assetValuationDelta).toBe(70_000_000); // 50,000,000 − (−20,000,000)
    expect(eff.bsTotalAssets).toBe(1_000_000_000); // 그 외 필드 보존
    expect(raw.assetValuationDelta).toBe(0); // 원본 불변 (immutable)
  });

  it("N-4b: 총액 모드 — 행 미입력 시 원본 그대로 (참조 동일)", () => {
    const raw = { assetValuationDelta: 91_548_350, evaluationDeltaRows: undefined };
    const eff = withResolvedEvaluationDelta(raw);
    expect(eff.assetValuationDelta).toBe(91_548_350);
    expect(eff).toBe(raw); // source==="total" → 동일 참조 (useMemo 안정)
  });

  it("N-4c: 빈 배열 행 → 총액 모드 fallback", () => {
    const raw = { assetValuationDelta: 5_000_000, evaluationDeltaRows: [] };
    const eff = withResolvedEvaluationDelta(raw);
    expect(eff.assetValuationDelta).toBe(5_000_000);
    expect(eff).toBe(raw);
  });

  it("N-4d: 음수 평가차액도 정확 치환 (자산 < 부채 차액)", () => {
    const rows: EvaluationDeltaRow[] = [
      { rowId: "a1", category: "asset", accountName: "상품", evaluationAmount: 10_000_000, bookAmount: 30_000_000 },
    ];
    const eff = withResolvedEvaluationDelta({ assetValuationDelta: 0, evaluationDeltaRows: rows });
    expect(eff.assetValuationDelta).toBe(-20_000_000);
  });
});
