/**
 * @vitest-environment jsdom
 *
 * 비상장주식 평가서 PDF 제2쪽 「4. 순자산가액」 — 2025.07.10 공식 양식 정합 anchor (C1 Pre-Do)
 *
 * Plan: docs/00-pm/inheritance-besshi-page2-official-layout.plan.md
 *
 * 목적:
 *   - AN-1 (⑮ 가산 자기일관, Pre-Do): otherProvision>0 + 순자산 양수 입력 →
 *     PDF가 표시하는 ⑲ 소계·다(영업권 포함 전)가 엔진(`calcNetAssetTotal`)과 일치하는지.
 *     현행 PDF는 ⑮을 차감(net-asset-calc·화면은 가산)하므로 RED — 버그 증명. C3 정정 후 GREEN.
 *   - AN-5 (마 값 불변): 레이아웃 정합이 순자산가액(마) 표시 수치를 바꾸지 않음을 보장.
 *
 * 실행:
 *   npx vitest run __tests__/lib/pdf/besshi-page2-official-layout.test.tsx
 */

import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { UnlistedStockBesshiPdfDocument } from "@/lib/pdf/UnlistedStockBesshiPdfDocument";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import { calcNetAssetTotal } from "@/lib/tax-engine/property-valuation/net-asset-calc";
import { withResolvedEvaluationDelta } from "@/lib/tax-engine/property-valuation/evaluation-delta";
import type {
  EvaluationDeltaRow,
} from "@/lib/tax-engine/property-valuation/evaluation-delta";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

const fmt = (n: number) => n.toLocaleString();

/**
 * react-pdf 엘리먼트 트리에서 모든 문자열 자식을 재귀 수집.
 * 본 파일 컴포넌트(Page2NetAsset·NetAssetRow 등)는 function 타입 — 순수 함수이므로 직접 실행해 결과를 recurse.
 */
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

// ─────────────────────────────────────────────────────────────────
// AN-1 입력 — ⑮ otherProvision = 50,000,000, 순자산 양수(§55① clamp 미발동)
//   ① 자산 1,200,000,000 / ⑨ 부채 300,000,000 / ⑮ 50,000,000, 나머지 0
//   엔진 ⑲(totalLiabilities) = 300,000,000 + 50,000,000 = 350,000,000 (⑮ 가산)
//   엔진 다(netAssetBeforeGoodwill) = 1,200,000,000 − 350,000,000 = 850,000,000
//   현행 PDF(−⑮): ⑲=250,000,000 / 다=950,000,000 → 엔진 불일치 (RED)
//   순손익 0 → 영업권 0 → 마 = 다 = 850,000,000
// ─────────────────────────────────────────────────────────────────
const an1Input: UnlistedStockValuationInput = {
  corpName: "AN1법인",
  representative: "대표",
  businessRegistrationNumber: "111-11-11111",
  capital: 500_000_000,
  businessStartDate: new Date("2010-01-01"),
  evaluationDate: new Date("2023-06-30"),
  faceValuePerShare: 5_000,
  totalShares: 100_000,
  ownedShares: 100_000,
  isRealEstateHeavy: false,
  fiscalYears: [
    { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("2022-12-31"), taxableIncome: 0 },
    { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: 0 },
    { fiscalYearLabel: "2020", fiscalYearEndDate: new Date("2020-12-31"), taxableIncome: 0 },
  ],
  capitalChanges: [],
  netAssetValueRaw: {
    bsTotalAssets: 1_200_000_000, assetValuationDelta: 0,
    corpTaxReservedAmount: 0, paidInCapitalIncrease: 0, otherEarnedRights: 0,
    prepaidExpenses: 0, preGiftRetainedEarnings: 0,
    bsTotalLiabilities: 300_000_000, corporateTaxPayable: 0,
    farmingSurtax: 0, localIncomeTax: 0, dividendPayable: 0,
    retirementProvision: 0, otherProvision: 50_000_000,
    reserveExcluded: 0, allowanceExcluded: 0, deferredTaxAdjustment: 0,
  },
  isContinuousLossLastThreeYears: false,
  capitalizationRate: 0.10,
  isMaxShareholder: false,
  companySize: "large",
};

// AN-5 입력 — image17 재현(otherProvision 0, 마 = 1,800,000,000)
const an5Input: UnlistedStockValuationInput = {
  ...an1Input,
  corpName: "AN5법인",
  netAssetValueRaw: {
    ...an1Input.netAssetValueRaw,
    bsTotalAssets: 1_800_000_000,
    bsTotalLiabilities: 0,
    otherProvision: 0,
  },
};

describe("[AN-1] PDF 제2쪽 ⑮ 가산 자기일관 (엔진 calcNetAssetTotal 정합)", () => {
  const engineNet = calcNetAssetTotal(an1Input.netAssetValueRaw);
  const text = collectText(UnlistedStockBesshiPdfDocument({ input: an1Input }));

  it("엔진 검산: ⑲ totalLiabilities = 350,000,000 (⑮ 가산)", () => {
    expect(engineNet.totalLiabilities).toBe(350_000_000);
  });
  it("엔진 검산: 다 netAssetBeforeGoodwill = 850,000,000", () => {
    expect(engineNet.netAssetBeforeGoodwill).toBe(850_000_000);
  });

  // ↓ Pre-Do RED: 현행 PDF가 ⑮을 차감하면 ⑲=250,000,000·다=950,000,000(버그)을 표시
  //   (850,000,000은 마·영업권 자기자본에도 등장 → 버그값 부재로 RED 견고화)
  it("PDF ⑲ 소계 = 엔진 totalLiabilities (350,000,000)", () => {
    expect(text).toContain(fmt(engineNet.totalLiabilities));
  });
  it("PDF에 버그값 ⑲=250,000,000 (−⑮) 없음", () => {
    expect(text).not.toContain("250,000,000");
  });
  it("PDF에 버그값 다=950,000,000 (−⑮) 없음", () => {
    expect(text).not.toContain("950,000,000");
  });
  it("PDF ⑲ 산식 라벨 = +⑮ (공식 2025.07.10)", () => {
    expect(text).toContain("⑨+⑩+⑪+⑫+⑬+⑭+⑮−⑯−⑰−⑱");
  });
});

describe("[AN-2~4] PDF 제2쪽 공식 2025.07.10 라벨·산식·참조열 정합", () => {
  const text = collectText(UnlistedStockBesshiPdfDocument({ input: an1Input }));

  // AN-2 산식
  it("⑧ 산식 = (①+②+③+④+⑤−⑥−⑦)", () => {
    expect(text).toContain("①+②+③+④+⑤−⑥−⑦");
  });
  // AN-3 라벨 (공식 문구)
  it("⑤ = 기타(평가기준일 현재 지급받을 권리가 확정된 가액 등)", () => {
    expect(text).toContain("기타(평가기준일 현재 지급받을 권리가 확정된 가액 등)");
  });
  it("⑮ = 기타(충당금 중 평가기준일 현재 비용으로 확정된 것 등)", () => {
    expect(text).toContain("기타(충당금 중 평가기준일 현재 비용으로 확정된 것 등)");
  });
  it("다 = 영업권포함전 순자산가액(⑧-⑲)", () => {
    expect(text).toContain("영업권포함전 순자산가액(⑧-⑲)");
  });
  it("② 라벨 '평가차액' + 라 라벨 '영업권' (참조는 회색열로 분리)", () => {
    expect(text).toContain("평가차액");
    expect(text).toContain("영업권");
    // 구판의 라벨-내 화살표 참조 제거
    expect(text).not.toContain("평가차액 → 제4쪽 5.가.② 기재");
    expect(text).not.toContain("영업권 ← 제5쪽 6.자.영업권 평가액");
  });
  // AN-4 회색 참조열
  it("② 참조열 = 제4쪽 5. 평가차액 「가」", () => {
    expect(text).toContain("제4쪽 5. 평가차액 「가」");
  });
  it("라 참조열 = 제5쪽 6. 영업권 「자」", () => {
    expect(text).toContain("제5쪽 6. 영업권 「자」");
  });
  // 헤더
  it("헤더 = 4. 순자산가액 + (단위 : 원) + (제2쪽), 구판 '별지 제2쪽' 제거", () => {
    expect(text).toContain("4. 순자산가액");
    expect(text).toContain("(단위 : 원)");
    expect(text).toContain("(제2쪽)");
    expect(text).not.toContain("4. 순자산가액 (별지 제2쪽)");
  });
});

describe("[AN-5] PDF 제2쪽 마(순자산가액) 표시 불변", () => {
  it("엔진 마 = 1,800,000,000 (otherProvision 0)", () => {
    const r = evaluateUnlistedStockV2(an5Input);
    expect(r.netAssetTotal).toBe(1_800_000_000);
  });
  it("PDF 텍스트에 마 값 1,800,000,000 포함 (레이아웃 정합 후에도)", () => {
    const text = collectText(UnlistedStockBesshiPdfDocument({ input: an5Input }));
    expect(text).toContain("1,800,000,000");
  });
});

// ─────────────────────────────────────────────────────────────────
// AN-6 입력 — 행 단위 평가차액 모드 (스크린샷 버그 회귀)
//   assetValuationDelta=0 + evaluationDeltaRows: 토지+40M·건물+10M·차입금−20M → ② 70,000,000
//   ① bsTotalAssets 1,000,000,000 → ⑧ 자산총액 = 1,000,000,000 + 70,000,000 = 1,070,000,000
//   ⑨ 부채 0 → 다(영업권 전 순자산) = 1,070,000,000
//   현행 버그: PDF가 raw.assetValuationDelta(0) 직접 읽어 ②=0, ⑧=1,000,000,000(=①) stale → RED
// ─────────────────────────────────────────────────────────────────
const AN6_ROWS: EvaluationDeltaRow[] = [
  { rowId: "a1", category: "asset", accountName: "토지", evaluationAmount: 140_000_000, bookAmount: 100_000_000 },
  { rowId: "a2", category: "asset", accountName: "건물", evaluationAmount: 120_000_000, bookAmount: 110_000_000 },
  { rowId: "l1", category: "liability", accountName: "차입금", evaluationAmount: 70_000_000, bookAmount: 90_000_000 },
];
const an6Input: UnlistedStockValuationInput = {
  ...an1Input,
  corpName: "AN6법인",
  netAssetValueRaw: {
    ...an1Input.netAssetValueRaw,
    bsTotalAssets: 1_000_000_000,
    assetValuationDelta: 0,
    bsTotalLiabilities: 0,
    otherProvision: 0,
    evaluationDeltaRows: AN6_ROWS,
  },
};

describe("[AN-6] PDF 제2쪽 행 단위 평가차액 ② 보정 (스크린샷 회귀)", () => {
  const eff = withResolvedEvaluationDelta(an6Input.netAssetValueRaw);
  const engineNet = calcNetAssetTotal(eff);
  const text = collectText(UnlistedStockBesshiPdfDocument({ input: an6Input }));

  it("헬퍼 검산: ② assetValuationDelta = 70,000,000 (행 합 50M − 부채 −20M)", () => {
    expect(eff.assetValuationDelta).toBe(70_000_000);
  });
  it("엔진 검산: ⑧ 자산총액 = 1,070,000,000 (① 1,000,000,000 + ② 70,000,000)", () => {
    expect(engineNet.totalAssets).toBe(1_070_000_000);
  });
  it("엔진 검산: 다 영업권 전 순자산 = 1,070,000,000 (부채 0)", () => {
    expect(engineNet.netAssetBeforeGoodwill).toBe(1_070_000_000);
  });
  // ↓ Pre-Do RED: 보정 전 PDF는 ②=0, ⑧=1,000,000,000(=①)만 표시 → 1,070,000,000 부재로 RED
  it("PDF ⑧ 자산총액 소계 = 1,070,000,000 (보정 ② 반영)", () => {
    expect(text).toContain("1,070,000,000");
  });
});
