/**
 * @vitest-environment jsdom
 *
 * 비상장주식 평가서 제4쪽 「5. 평가차액」 — 2025.07.10 공식 양식 정합 + 항상 표시 anchor (C1 Pre-Do)
 *
 * Plan: docs/00-pm/inheritance-besshi-page4-official-layout.plan.md
 *
 * 목적:
 *   - AN-P4-1 (가시성, RED): evaluationDeltaRows=[] → 현행 PDF는 Page4 통째 미렌더. 항상 표시 후 GREEN.
 *   - AN-P4-2/3 (공식 레이아웃·헤더, RED): 좌우 2블록·작성방법·"(제4쪽)" 부재(현행 stacked). 정정 후 GREEN.
 *   - AN-P4-4 (데이터 정합·회귀): 사례6 8+3행 → ①=107,324,150 / ②=15,775,800 / 가=91,548,350.
 *        ★ raw.assetValuationDelta=0(행 모드 미동기화)이어도 가=91,548,350 — 가는 resolveEvaluationDelta(①−②) 사용 증명.
 *   - AN-P4-5 (총액 fallback 분기): rows=[] + assetValuationDelta=91,548,350 → Page4 렌더 + 총액 안내.
 *
 * 실행: npx vitest run __tests__/lib/pdf/besshi-page4-official-layout.test.tsx
 */

import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { UnlistedStockBesshiPdfDocument } from "@/lib/pdf/UnlistedStockBesshiPdfDocument";
import { Page4ValuationDeltaTable } from "@/components/calc/inheritance/unlisted-stock-v2/besshi/Page4ValuationDeltaTable";
import type {
  UnlistedStockValuationInput,
  UnlistedNetAssetCalculation,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import type { EvaluationDeltaRow } from "@/lib/tax-engine/property-valuation/evaluation-delta";

afterEach(cleanup);

function collectText(node: ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    if (typeof el.type === "function") {
      try {
        return collectText((el.type as (p: unknown) => ReactNode)(el.props));
      } catch {
        return collectText(el.props.children);
      }
    }
    return collectText(el.props.children);
  }
  return "";
}

// ─── 사례 6 평가차액 행 (자산 8 + 부채 3 → ①=107,324,150 / ②=15,775,800 / 가=91,548,350) ───
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

function makeRaw(over: Partial<UnlistedNetAssetCalculation>): UnlistedNetAssetCalculation {
  return {
    bsTotalAssets: 1_800_000_000, assetValuationDelta: 0,
    corpTaxReservedAmount: 0, paidInCapitalIncrease: 0, otherEarnedRights: 0,
    prepaidExpenses: 0, preGiftRetainedEarnings: 0,
    bsTotalLiabilities: 0, corporateTaxPayable: 0,
    farmingSurtax: 0, localIncomeTax: 0, dividendPayable: 0,
    retirementProvision: 0, otherProvision: 0,
    reserveExcluded: 0, allowanceExcluded: 0, deferredTaxAdjustment: 0,
    ...over,
  };
}

function makeInput(raw: UnlistedNetAssetCalculation): UnlistedStockValuationInput {
  return {
    corpName: "P4법인", representative: "대표", businessRegistrationNumber: "111-11-11111",
    capital: 500_000_000, businessStartDate: new Date("2010-01-01"),
    evaluationDate: new Date("2023-06-30"), faceValuePerShare: 5_000,
    totalShares: 100_000, ownedShares: 100_000, isRealEstateHeavy: false,
    fiscalYears: [
      { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("2022-12-31"), taxableIncome: 0 },
      { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: 0 },
      { fiscalYearLabel: "2020", fiscalYearEndDate: new Date("2020-12-31"), taxableIncome: 0 },
    ],
    capitalChanges: [], netAssetValueRaw: raw,
    isContinuousLossLastThreeYears: false, capitalizationRate: 0.10,
    isMaxShareholder: false, companySize: "large",
  };
}

// ★ 행 모드: assetValuationDelta=0(핸들러 미동기화 재현) — 가는 ①−²에서 도출돼야 함
const rowsInput = makeInput(makeRaw({ evaluationDeltaRows: [...CASE_6_ASSET_ROWS, ...CASE_6_LIABILITY_ROWS], assetValuationDelta: 0 }));
// 빈 입력 (가시성)
const emptyInput = makeInput(makeRaw({ assetValuationDelta: 0 }));
// 총액 fallback (rows 없음 + 총액)
const totalInput = makeInput(makeRaw({ assetValuationDelta: 91_548_350 }));

// ============================================================
// AN-P4-1 — 가시성: 빈 입력에도 제4쪽 렌더 (현행 RED — null)
// ============================================================
describe("[AN-P4-1] 제4쪽 항상 표시 (evaluationDeltaRows=[])", () => {
  const text = collectText(UnlistedStockBesshiPdfDocument({ input: emptyInput }));
  // ※ "5. 평가차액"은 Page2 ② ref("제4쪽 5. 평가차액 「가」")에도 포함 → Page4 고유 페이지 노트 "(제4쪽)"로 anchor
  it("제4쪽 페이지 노트 '(제4쪽)' 존재", () => expect(text).toContain("(제4쪽)"));
  it("'자산금액'·'부채금액' 블록 존재", () => {
    expect(text).toContain("자산금액");
    expect(text).toContain("부채금액");
  });
  it("'작 성 방 법' 푸터 존재", () => expect(text).toContain("작 성 방 법"));
});

// ============================================================
// AN-P4-2/3 — 공식 레이아웃·헤더 (행 있는 케이스로 stacked 잔재 검출)
// ============================================================
describe("[AN-P4-2·3] 공식 2블록 레이아웃·헤더 정합", () => {
  const text = collectText(UnlistedStockBesshiPdfDocument({ input: rowsInput }));
  it("컬럼 = 상증법에 따른 평가액 / 재무상태표상 금액", () => {
    expect(text).toContain("상증법에 따른 평가액");
    expect(text).toContain("재무상태표상 금액");
  });
  it("① 합계 / ② 합계 라벨", () => {
    expect(text).toContain("① 합계");
    expect(text).toContain("② 합계");
  });
  it("crossRef = 제2쪽 4. 순자산가액 「가」의 ② 기재", () => {
    expect(text).toContain("제2쪽 4. 순자산가액 「가」의 ② 기재");
  });
  it("헤더 (단위 : 원) · (제4쪽)", () => {
    expect(text).toContain("(단위 : 원)");
    expect(text).toContain("(제4쪽)");
  });
  it("구판 stacked 제목·라벨 제거", () => {
    expect(text).not.toContain("5. 평가차액 (별지 제4쪽 — 자산·부채 계정과목별)");
    expect(text).not.toContain("① 자산 합계");
    expect(text).not.toContain("제2쪽 4.가.② 기재");
  });
});

// ============================================================
// AN-P4-4 — 데이터 정합 + ★ 가는 resolveEvaluationDelta(①−②) 사용 (raw.assetValuationDelta=0 무관)
// ============================================================
describe("[AN-P4-4] 사례6 행 모드 정합", () => {
  const text = collectText(UnlistedStockBesshiPdfDocument({ input: rowsInput }));
  it("① 합계 = 107,324,150", () => expect(text).toContain("107,324,150"));
  it("② 합계 = 15,775,800", () => expect(text).toContain("15,775,800"));
  it("가. 평가차액 = 91,548,350 (raw.assetValuationDelta=0이어도 ①−²)", () => {
    expect(text).toContain("91,548,350");
  });
  it("행 모드 → 총액 안내 문구 미표시", () => {
    expect(text).not.toContain("계정과목별 명세");
  });
});

// ============================================================
// AN-P4-5 — 총액 fallback 분기 (rows=[] + assetValuationDelta)
// ============================================================
describe("[AN-P4-5] 총액 fallback 정합", () => {
  const text = collectText(UnlistedStockBesshiPdfDocument({ input: totalInput }));
  it("Page4 렌더 (자산금액 블록)", () => expect(text).toContain("자산금액"));
  it("가. 평가차액 = 91,548,350 (총액 분기)", () => expect(text).toContain("91,548,350"));
  it("총액 입력 안내 문구 표시", () => expect(text).toContain("계정과목별 명세"));
});

// ============================================================
// AN-P4-6 — 화면 항상 표시 + testid 보존 (RTL)
// ============================================================
describe("[AN-P4-6] 화면 Page4ValuationDeltaTable 항상 표시", () => {
  it("빈 raw에도 '자산금액' 렌더 (현행 null → RED)", () => {
    render(<Page4ValuationDeltaTable raw={makeRaw({ assetValuationDelta: 0 })} />);
    expect(screen.getByText("자산금액")).toBeInTheDocument();
  });
  it("행 모드 testid p4-① / p4-② 보존", () => {
    render(<Page4ValuationDeltaTable raw={makeRaw({ evaluationDeltaRows: [...CASE_6_ASSET_ROWS, ...CASE_6_LIABILITY_ROWS] })} />);
    expect(screen.getByTestId("p4-①")).toBeInTheDocument();
    expect(screen.getByTestId("p4-②")).toBeInTheDocument();
  });
});
