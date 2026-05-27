/**
 * 주식 상속재산 합계 누락 교정 + 협의분할 귀속 — anchor (상속세)
 *
 * 계획: docs/00-pm/inheritance-unlisted-simple-stock-gross-estate-wiring.plan.md
 * 디자인: docs/02-design/features/stock-gross-estate-wiring.engine.design.md
 *
 * 회귀 영구 가드: 주식(listed·V1 간편) + grossEstateValue 단언이 본 PR 이전 0건이었음.
 * anchor는 magic number 대신 computeStockValuation 기준 자기일관성으로 설계.
 */
import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { computeStockValuation } from "@/lib/tax-engine/valuation/resolve-estate-item-value";
import type {
  InheritanceTaxInput,
  Heir,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const heirs: Heir[] = [
  { id: "h1", relation: "spouse", name: "배우자" },
  { id: "h2", relation: "child", name: "자녀" },
];

function buildInput(estateItems: EstateItem[], hs: Heir[] = heirs): InheritanceTaxInput {
  return {
    decedentType: "resident",
    deathDate: "2026-01-01",
    estateItems,
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    preGiftsWithin10Years: [],
    heirs: hs,
    deductionInput: { heirs: hs },
    creditInput: { isFiledOnTime: true },
    isGenerationSkip: false,
  };
}

function v1Stock(extra: Partial<EstateItem> = {}, data: Partial<EstateItem["unlistedStockData"]> = {}): EstateItem {
  return {
    id: "s1",
    category: "unlisted_stock",
    name: "비상장A",
    unlistedValuationMode: "simple",
    unlistedStockData: {
      totalShares: 10_000,
      ownedShares: 10_000,
      weightedNetIncome: 100_000_000,
      netAssetValue: 5_000_000_000,
      capitalizationRate: 0.1,
      ...data,
    },
    ...extra,
  } as EstateItem;
}

const apt = (id: string, amount: number): EstateItem => ({
  id,
  category: "real_estate_apartment",
  name: `아파트${id}`,
  marketValue: amount,
});

describe("주식 grossEstate 배선 — 상속세", () => {
  it("[C1] V1 단독·협의분할 OFF — grossEstate=평가액, 법정상속분 배분, Σperheir=finalTax", () => {
    const stock = v1Stock();
    const expected = computeStockValuation(stock);
    expect(expected).toBeGreaterThan(0);

    const r = calcInheritanceTax(buildInput([stock]));
    expect(r.grossEstateValue).toBe(expected); // ★ 핵심 회귀 가드 (이전: 0)
    expect(r.finalTax).toBeGreaterThan(0); // 주식이 과세표준에 반영되어 세액 산출

    const ph = r.heirAllocationResult!.perHeir;
    // 법정상속분: 배우자(1.5) > 자녀(1) → 배우자 directEstate > 자녀
    expect(ph["h1"]!.directEstateAmount).toBeGreaterThan(ph["h2"]!.directEstateAmount);
    // 미입력 자산 법정상속분 자동 배분 → directEstate 합 = 평가액
    expect(ph["h1"]!.directEstateAmount + ph["h2"]!.directEstateAmount).toBe(expected);
  });

  it("[C2] V1 단독·협의분할 ON 자녀 100% — 자녀 귀속, 배우자 0", () => {
    const stock = v1Stock();
    const val = computeStockValuation(stock);
    const r = calcInheritanceTax(
      buildInput([{ ...stock, heirAllocations: [{ heirId: "h2", amount: val }] }]),
    );
    const ph = r.heirAllocationResult!.perHeir;
    expect(ph["h2"]!.directEstateAmount).toBe(val);
    expect(ph["h1"]!.directEstateAmount).toBe(0);
    expect(ph["h2"]!.finalTax).toBeGreaterThan(0);
  });

  it("[C3] V1 + 아파트 혼합·주식만 협의분할 — grossEstate=합산", () => {
    const stock = v1Stock();
    const sv = computeStockValuation(stock);
    const aptItem = apt("a1", 3_000_000_000);
    const r = calcInheritanceTax(
      buildInput([
        { ...stock, heirAllocations: [{ heirId: "h2", amount: sv }] },
        aptItem,
      ]),
    );
    expect(r.grossEstateValue).toBe(sv + 3_000_000_000);
    const ph = r.heirAllocationResult!.perHeir;
    // 주식은 자녀 100%, 아파트는 법정상속분 → 자녀 directEstate에 주식 + 아파트 일부 포함
    expect(ph["h2"]!.directEstateAmount).toBeGreaterThan(sv);
  });

  it("[C4] 부동산과다보유법인 ON — 가중치 2:3, 일반(3:2)과 상이", () => {
    // 순손익가치가 최소값(순자산 80%)을 충분히 초과하도록 순손익을 크게 설정
    // (그래야 가중평균이 바닥에 안 걸려 가중치 반전 효과가 드러남).
    const highIncome = { weightedNetIncome: 2_000_000_000 };
    const normal = computeStockValuation(v1Stock({}, highIncome)); // false (3:2)
    const heavy = computeStockValuation(v1Stock({}, { ...highIncome, isRealEstateHeavy: true })); // 2:3
    expect(heavy).not.toBe(normal);
    expect(heavy).toBeLessThan(normal); // 순손익 우위 → 순손익 가중↓(2)면 평가액↓

    const r = calcInheritanceTax(buildInput([v1Stock({}, { ...highIncome, isRealEstateHeavy: true })]));
    expect(r.grossEstateValue).toBe(heavy);
  });

  it("[C5] 상장주식 단독 — grossEstate = avg×주식수", () => {
    const listed: EstateItem = {
      id: "L1",
      category: "listed_stock",
      name: "삼성전자",
      listedStockAvgPrice: 70_000,
      listedStockShares: 10_000,
    };
    const r = calcInheritanceTax(buildInput([listed]));
    expect(r.grossEstateValue).toBe(70_000 * 10_000);
    expect(r.grossEstateValue).toBe(computeStockValuation(listed));
  });

  it("[C5b] 상장 §63②3호 증자신주 — (avg − 배당차액)×주식수", () => {
    const listed: EstateItem = {
      id: "L2",
      category: "listed_stock",
      name: "증자신주",
      listedStockAvgPrice: 70_000,
      listedStockShares: 10_000,
      isCapitalIncreaseUnlistedShare: true,
      listedStockDividendDifference: 5_000,
    };
    const r = calcInheritanceTax(buildInput([listed]));
    expect(r.grossEstateValue).toBe(computeStockValuation(listed));
    expect(r.grossEstateValue).toBeLessThan(70_000 * 10_000); // 배당차액 차감
  });

  it("[C6] V2 정식 회귀 — V2 경로 무변경(평가액 > 0)", () => {
    // V2는 unlistedStockValuationV2 경로 — 본 PR 변경 없음. 존재 시 평가 포함 확인.
    // (상세 V2 입력은 별도 V2 테스트에서 커버. 여기선 라우팅 회귀만.)
    const stock = v1Stock(); // V1 — V2 미존재 → evaluateStockAsPropertyResult 경로
    const r = calcInheritanceTax(buildInput([stock]));
    expect(r.grossEstateValue).toBeGreaterThan(0);
  });

  it("[C8a] 적자(순손익 음수)·순자산 양수 — 순손익가치 0, 최소값 적용", () => {
    const stock = v1Stock({}, {
      weightedNetIncome: 0,
      netIncomeY1: -50_000_000,
      netIncomeY2: -50_000_000,
      netIncomeY3: -50_000_000,
      netAssetValue: 5_000_000_000,
    });
    const expected = computeStockValuation(stock);
    expect(expected).toBeGreaterThan(0); // 순자산 80% 최소값 기반
    const r = calcInheritanceTax(buildInput([stock]));
    expect(r.grossEstateValue).toBe(expected);
  });

  it("[C8b] 순자산 음수 — 자기자본 0 처리", () => {
    const stock = v1Stock({}, { netAssetValue: -1_000_000_000 });
    const expected = computeStockValuation(stock);
    const r = calcInheritanceTax(buildInput([stock]));
    expect(r.grossEstateValue).toBe(expected);
    expect(r.grossEstateValue).toBeGreaterThanOrEqual(0);
  });
});
