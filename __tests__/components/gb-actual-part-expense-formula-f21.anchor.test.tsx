/**
 * F-21 — 일반건물 **실가 파트**의 필요경비 산식은 §163⑥을 근거로 들 수 없다.
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §10 F-21 · §30.
 *
 * 「소득세법」 제97조 제2항은 제1호(취득가액을 **실지거래가액**에 의하는 경우)와 제2호(그 밖의
 * 경우)를 나누고, §163⑥ 개산공제는 **제2호에만** 붙는다. §163⑨ 상속·증여 평가액은 「취득당시의
 * 실지거래가액으로 **본다**」이므로 1호다 ⇒ 개산공제가 없다. 엔진은 이를 지켜
 * `estimatedDeduction = 0` · `usedEstimatedAcquisition = false`로 낸다
 * (`general-building-part-acq.ts` — anchor A-4 C-4·C-5가 고정).
 *
 * 그런데 표시 층은 그 파트에도 「취득시 기준시가 × 3%」라 적었다. **실측**:
 *
 * | 입력 | 엔진 | 종전 화면 산식 |
 * |---|---|---|
 * | 토지 실거래가 + 건물 환산 | 토지 개산공제 **0** | 「취득시 토지기준시가 238,000,000 × 3% = **0**」 ❌ |
 * | 건물 실거래가 + 토지 환산 | 건물 개산공제 **0** | 「취득시 건물기준시가 2,814,470 × 3% = **0**」 ❌ |
 *
 * 산식이 자기 값을 못 만드는 것은 물론, **없는 근거를 댄 것**이다. F-19(부담부증여 실비)·
 * F-20(증축 실가)과 같은 축인데 토지·건물1만 남아 있었다.
 *
 * 🔴 신호는 **카드의 `usedEstimatedAcquisition`** 이다. `estimatedDeduction.landBase`(F-18·F-20의
 *    base echo)로 겸용하지 않는다 — base가 없는 것이 「실가 파트」인지 「echo 이전에 저장된 옛
 *    이력」인지 구별되지 않는다(`feedback_one_field_serving_two_legal_axes`).
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingAssetCards } from "@/lib/tax-engine/general-building-valuation";
import { buildGbExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementGbFormulas";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";

const BASE = {
  totalTransferPrice: 2_000_000_000,
  transferDate: new Date("2026-02-16"),
  acquisitionDate: new Date("1999-05-24"),
  landArea: 85,
  buildingArea: 180.96,
  buildingFootprintArea: 180.96,
  transferLandPricePerSqm: 10_830_000,
  transferBuildingStdPrice: 20_629_440,
  acquisitionLandPricePerSqm: 2_800_000,
  acquisitionBuildingStdPrice: 2_814_470,
  buildingAcquisitionCause: "purchase" as const,
  zoneType: "commercial",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (over: Record<string, unknown> = {}) => buildGeneralBuildingAssetCards({ ...BASE, ...over } as any);
const prop = (propertyId: string, necessaryExpense: number): PerPropertyBreakdown =>
  ({ propertyId, necessaryExpense, capitalExpenditureForDisplay: 0 }) as PerPropertyBreakdown;

const cardDed = (out: ReturnType<typeof run>, id: string) =>
  out.assetCards.find((c) => c.propertyId === id)?.estimatedDeduction ?? 0;

const LAND_ACTUAL = { landAcqMode: "actual", buildingAcqMode: "estimated", landAcquisitionPrice: 300_000_000 };
const BUILDING_ACTUAL = { landAcqMode: "estimated", buildingAcqMode: "actual", buildingAcquisitionPrice: 100_000_000 };

describe("F-21 실가 파트 — §163⑥을 근거로 들지 않는다", () => {
  it("F21-1 토지 실거래가 파트 — 「× 3% = 0」이라 적지 않는다 (종전 238,000,000 × 3% = 0)", () => {
    const out = run(LAND_ACTUAL);
    const f = buildGbExpenseFormula(prop("land", cardDed(out, "land")), out);
    expect(f).not.toContain("× 3%");
    expect(f).not.toContain("238,000,000");
    expect(f).toContain("§163⑥ 개산공제를 적용하지 않습니다");
  });

  it("F21-2 건물 실거래가 파트도 같다", () => {
    const out = run(BUILDING_ACTUAL);
    const f = buildGbExpenseFormula(prop("building", cardDed(out, "building")), out);
    expect(f).not.toContain("× 3%");
    expect(f).toContain("§163⑥ 개산공제를 적용하지 않습니다");
  });

  it("F21-3 같은 계산의 **다른 파트**는 환산이므로 종전대로 개산공제 산식이다", () => {
    const out = run(LAND_ACTUAL);
    const f = buildGbExpenseFormula(prop("building", cardDed(out, "building")), out);
    expect(f).toContain("취득시 건물기준시가 2,814,470 × 3% = 84,434");
  });

  it("F21-4 (긍정 짝) 둘 다 환산이면 두 파트 모두 종전과 같다", () => {
    const out = run();
    expect(buildGbExpenseFormula(prop("land", cardDed(out, "land")), out)).toContain(
      "취득시 토지기준시가 238,000,000 × 3% = 7,140,000",
    );
    expect(buildGbExpenseFormula(prop("building", cardDed(out, "building")), out)).toContain("× 3%");
  });

  it("F21-5 실가 파트에 양도비가 있으면 그 금액을 §97① 나목으로 적는다", () => {
    const out = run(LAND_ACTUAL);
    const f = buildGbExpenseFormula(prop("land", 5_000_000), out);
    expect(f).toContain("자산별 양도비 = 5,000,000 (§97① 나목)");
    // 왜 개산공제가 없는지까지 밝힌다 — 금액만 적으면 「빠뜨린 것」과 구별되지 않는다.
    expect(f).toContain("§163⑥ 개산공제를 적용하지 않습니다");
    expect(f).not.toContain("× 3%");
  });

  it("F21-6 카드 필드가 없는 옛 결과는 종전대로 개산공제 산식 — 표시 회귀 없음", () => {
    // `usedEstimatedAcquisition`이 없던 시절의 이력. undefined는 「실가 파트」가 아니다.
    const out = run();
    const legacy = {
      ...out,
      assetCards: out.assetCards.map((c) => {
        const { usedEstimatedAcquisition: _drop, ...rest } = c as Record<string, unknown> & {
          usedEstimatedAcquisition?: boolean;
        };
        return rest;
      }),
    } as unknown as ReturnType<typeof run>;
    const f = buildGbExpenseFormula(prop("land", cardDed(out, "land")), legacy);
    expect(f).toContain("취득시 토지기준시가 238,000,000 × 3%");
  });
});
