/**
 * anchor: 파트 묶음 키는 **승자**가 아니라 **「해당 호 집합」**이다 (Q3 — E-2 해소)
 *
 * 계획서: docs/02-design/features/transfer-rate-clause-candidates.plan.md v2.1 §4 · §7.3 · §7.4
 *
 * ── 무엇이 잘못돼 있었나 ────────────────────────────────────────────────
 * `calcTax`의 `rateClause`는 §104① 후단·§104⑦ 후단이 고른 **승자**다. 파트를 그 승자로 묶으면
 * 묶음이 **과세표준 크기에 따라** 달라진다 — 구조가 같은 두 자산이 합쳐지기도 나뉘기도 한다.
 * 순서 의존이 아니라 **승자 의존**이고, 방향이 **양쪽**이다:
 *
 *   ⓐ 해당 호는 **같은데** 승자가 갈려 **나뉜다**  → 과소
 *   ⓑ 해당 호는 **다른데** 승자가 같아 **합쳐진다** → 과대
 *
 * ── 도출 근거 ───────────────────────────────────────────────────────────
 * §104⑤2호 **단서**의 효과절은 「합산한 것에 대하여 … **각 해당 호별** 세율을 적용하여 산출한
 * 세액 중에서 **큰 산출세액**」이다. 「각 해당 호별」이 정의되려면 합산 대상 전원이 **같은 호
 * 집합**이어야 한다 ⇒ 묶음 키는 **집합**이다(계획서 §7.4).
 *
 * 이 규칙은 Q2가 이미 **세액으로 확정**했다 — 비사업용 토지 {①8호,①2호}와 사업용 토지 {①2호}는
 * ①2호를 공유하지만 **묶지 않는다**(`aggregate-clause-bucket-short-term.anchor.test.ts` Q-1·Q-2).
 * Q3는 같은 규칙을 **파트**로 확장할 뿐 새 해석이 아니다.
 *
 * ⚠️ ⓑ는 **세액이 준다**. 11년 보유 건물분에 **토지 파트의 §104⑦ 후단 단기 비교**가 얹혀
 *   있던 것이 제거되는 것이다 — 「법 근거 없이 불리 적용 금지」와 같은 방향의 정정이다.
 */
import { describe, it, expect } from "vitest";
import { resolveSplitAwareTax } from "@/lib/tax-engine/transfer-tax-split-rate";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const parsedRates = parseRatesFromMap(mockRates);
const D = (s: string) => new Date(s);

/**
 * split 주택 자산 — **토지를 나중에 취득**해야 파트 기산일이 갈린다
 * (`resolveAppurtenantLandRateBasisDate`가 `max(토지, 건물)`을 쓴다).
 * 조정대상지역 3주택이라 두 파트 모두 §104⑦3호에 **해당**한다.
 */
function splitHouse(
  buildingAcq: string,
  landGain: number,
  buildingGain: number,
): TransferTaxInput {
  return {
    ...baseTransferInput(),
    propertyType: "housing",
    transferDate: D("2026-06-01"),
    acquisitionDate: D(buildingAcq),
    landAcquisitionDate: D("2025-01-01"), // 토지 17개월 → §104①2호
    transferPrice: 1_000_000_000 + landGain + buildingGain,
    acquisitionPrice: 1_000_000_000,
    landTransferPrice: 600_000_000 + landGain,
    buildingTransferPrice: 400_000_000 + buildingGain,
    // §100③(30% 의제) 판정 근거 — 구분 기재값과 **동일 비율**로 둬 의제가 발동하지 않게 한다.
    //    Phase 1-D부터 구분 기재 시 양도시 기준시가가 필수다(계획서 §12.7 R-7). 세액 불변.
    landStandardPriceAtTransfer: 600_000_000 + landGain,
    buildingStandardPriceAtTransfer: 400_000_000 + buildingGain,
    landAcquisitionPrice: 600_000_000,
    buildingAcquisitionPrice: 400_000_000,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    isSeparateAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 3,
    isRegulatedArea: true,
    expenses: 0,
  };
}

/** 자산 단독 세액 — 기본공제 소진 가정(과세표준 = 파트 양도차익 합) */
function soloTax(input: TransferTaxInput, taxBase: number) {
  const splitDetail = calcSplitGain(input);
  expect(splitDetail).not.toBeNull();
  return resolveSplitAwareTax({
    taxBase,
    transferIncome: taxBase,
    basicDeduction: 0,
    splitDetail: splitDetail ?? undefined,
    parsedRates,
    taxRateInput: input,
  });
}

function aggItem(id: string, input: TransferTaxInput): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    ...(input as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
  };
}
function runAgg(properties: TransferTaxItemInput[]) {
  const input: AggregateTransferInput = {
    taxYear: 2026,
    annualBasicDeductionUsed: 2_500_000, // 기본공제 소진
    properties,
  };
  return calculateTransferTaxAggregate(input, mockRates);
}

describe("Q3 ⓐ — 해당 호가 **같으면** 승자가 갈려도 합산한다", () => {
  /**
   * 건물 2024-08-01(**22개월**) + 토지 2025-01-01(17개월) — **둘 다 §104①2호** · 둘 다 §104⑦3호.
   *   토지 파트 300,000,000 → 중과 승 (누진 94,060,000 + 30% 90,000,000 = 184,060,000 > 60% 180,000,000)
   *   건물 파트 150,000,000 → 단기 승 (60% 90,000,000 > 누진 37,060,000 + 30% 45,000,000 = 82,060,000)
   *
   * 종전에는 승자 키 `"104-7-3"` ↔ `"104-1-2|0.6"`로 갈려 **따로** 계산했다(274,060,000).
   * 교재 사례2(D-11)가 경고하는 바로 그 오류의 **파트판**이다 —
   * 「별도로 비교하는 것이 아니라 **합산한 금액**에 중과세율을 적용해 단기세율과 비교한다」.
   */
  const ASSET = splitHouse("2024-08-01", 300_000_000, 150_000_000);
  const TAX_BASE = 450_000_000;

  it("E-2a: 합산 450,000,000 → 누진 154,060,000 + 30% 135,000,000", () => {
    // > 단기 60% 270,000,000
    expect(soloTax(ASSET, TAX_BASE).calculatedTax).toBe(289_060_000);
  });

  it("E-2a-1: 두 파트의 **후보 집합이 동일**하다 — 승자만 갈렸다", () => {
    const parts = soloTax(ASSET, TAX_BASE).splitPartDetail!.parts;
    const land = parts.find((p) => p.kind === "land")!;
    const building = parts.find((p) => p.kind === "building")!;
    expect(land.candidateClauses).toEqual(["104-1-2", "104-7-3"]);
    expect(building.candidateClauses).toEqual(["104-1-2", "104-7-3"]);
    // 승자는 다르다 — 이것으로 묶으면 나뉜다(E-2의 본질)
    expect(land.rateClause).toBe("104-7-3");
    expect(building.rateClause).toBe("104-1-2");
  });

  it("E-2a-2: §104⑤ 비교 — 2호가 1호(합산누진 154,060,000)를 이긴다", () => {
    const d = soloTax(ASSET, TAX_BASE).splitPartDetail!;
    expect(d.perAssetTotal).toBe(289_060_000);
    expect(d.aggregateProgressive).toBe(154_060_000);
    expect(d.chosen).toBe("per_asset");
  });
});

describe("Q3 ⓑ — 해당 호가 **다르면** 승자가 같아도 합산하지 않는다", () => {
  /**
   * 건물 2015-01-01(**11년**) → 2년 이상이라 단기 호에 해당하지 않는다 ⇒ 후보 `{⑦3호}`.
   * 토지 2025-01-01(17개월) → 후보 `{①2호, ⑦3호}`. **⑦3호를 공유하지만 집합이 다르다.**
   *
   * 종전에는 **승자가 둘 다 ⑦3호**라 합쳐졌고, 대표가 토지(17개월)여서 합산 과세표준
   * 350,000,000에 **§104⑦ 후단(단기 비교)까지** 발동했다 → 219,060,000.
   * ⇒ 11년 보유 건물분에 토지 파트의 단기 비교가 얹혀 있었다.
   */
  const ASSET = splitHouse("2015-01-01", 300_000_000, 50_000_000);
  const TAX_BASE = 350_000_000;

  it("E-2b: 토지 184,060,000 + 건물 21,240,000 (종전 219,060,000)", () => {
    // 건물 50,000,000: 누진 6,240,000 + 30% 15,000,000 = 21,240,000
    expect(soloTax(ASSET, TAX_BASE).calculatedTax).toBe(205_300_000);
  });

  it("E-2b-1: 후보 집합이 **부분적으로만 겹친다** — 묶지 않는다(§7.4)", () => {
    const parts = soloTax(ASSET, TAX_BASE).splitPartDetail!.parts;
    const land = parts.find((p) => p.kind === "land")!;
    const building = parts.find((p) => p.kind === "building")!;
    expect(land.candidateClauses).toEqual(["104-1-2", "104-7-3"]);
    expect(building.candidateClauses).toEqual(["104-7-3"]); // 2년 이상 → 단기 호 없음
    // 승자는 **둘 다** ⑦3호 — 이것으로 묶으면 11년 보유 건물에 단기 비교가 얹힌다
    expect(land.rateClause).toBe("104-7-3");
    expect(building.rateClause).toBe("104-7-3");
  });
});

describe("Q3 ② — 다건 누진 호 분기도 같은 규약", () => {
  /**
   * ⓑ 자산 2건(토지 300,000,000 / 100,000,000 · 건물 각 50,000,000)을 같은 과세기간에 양도.
   * 자산 취득일이 2년 이상이라 `multi_house_surcharge` 그룹 → **누진 호 분기**(P12 파트 묶음).
   *
   * 종전: 승자 키로 {X토지, X건물, Y건물}이 한 묶음(400,000,000·대표 X토지) + {Y토지}
   * Q3후: 후보 키로 {X토지, Y토지}(400,000,000) + {X건물, Y건물}(100,000,000)
   */
  const X = aggItem("X", splitHouse("2015-01-01", 300_000_000, 50_000_000));
  const Y = aggItem("Y", splitHouse("2015-01-01", 100_000_000, 50_000_000));

  it("E-2c: `[X, Y]` = 254,060,000 + 49,560,000 (종전 314,060,000)", () => {
    // 토지 묶음 400,000,000 → 누진 134,060,000 + 30% 120,000,000 = 254,060,000 (> 60% 240,000,000)
    // 건물 묶음 100,000,000 → 누진  19,560,000 + 30%  30,000,000 =  49,560,000
    expect(runAgg([X, Y]).calculatedTax).toBe(303_620_000);
  });

  it("E-2c-1: **순서 반전** — 같은 값", () => {
    expect(runAgg([Y, X]).calculatedTax).toBe(303_620_000);
  });

  it("E-2d 회귀: 호도 승자도 다르면 종전과 동일 — `[Y]` 단독 불변", () => {
    // Y토지 100,000,000 → 단기 승 60,000,000 (> 누진 19,560,000 + 30% 30,000,000 = 49,560,000)
    // Y건물  50,000,000 → ⑦3호 21,240,000 · 후보 집합도 승자도 다르다 ⇒ 종전에도 분리돼 있었다
    expect(runAgg([Y]).calculatedTax).toBe(81_240_000);
  });
});
