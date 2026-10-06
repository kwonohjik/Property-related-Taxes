/**
 * A2 ⑦ — 일반건물 감정가액·매매사례가액 파트의 결과 표시 (설계서 §9.2 D1·D3, E-1 `acquisitionMode` echo 소비)
 *
 * 고정 계약:
 *   R-1 감정·매매사례 파트에 「실지거래가액 파트라 §163⑥ 개산공제를 적용하지 않습니다」가 붙지 않는다(거짓 문구) — 개산공제 산식이 나온다
 *   R-2 (긍정 짝) 실가 파트는 종전대로 그 문구가 붙는다
 *   R-3 취득가액 산식이 환산 곱(「양도가액 × 취득시 ÷ 양도시」)을 인쇄하지 않는다 — 적힌 식이 적힌 값을 못 만드는 거짓 등식
 *   R-4 (긍정 짝) 환산 파트는 종전 환산 산식 그대로
 *   R-5 옛 이력(`acquisitionMode` 없음)은 현행 동작 유지
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingAssetCards } from "@/lib/tax-engine/general-building-valuation";
import { buildGbAcquisitionFormula, buildGbExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementGbFormulas";
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
const card = (out: ReturnType<typeof run>, id: string) => out.assetCards.find((c) => c.propertyId === id)!;
const prop = (out: ReturnType<typeof run>, id: string): PerPropertyBreakdown =>
  ({
    propertyId: id,
    necessaryExpense: card(out, id).expenses,
    acquisitionPrice: card(out, id).acquisitionPrice,
    transferPrice: card(out, id).transferPrice,
    capitalExpenditureForDisplay: 0,
  }) as PerPropertyBreakdown;

const LAND_APPRAISAL = { landAcqMode: "appraisal", buildingAcqMode: "actual", landAcquisitionPrice: 300_000_000, buildingAcquisitionPrice: 100_000_000 };
const LAND_SALES = { landAcqMode: "salesCase", buildingAcqMode: "actual", landSalesCaseValue: 310_000_000, buildingAcquisitionPrice: 100_000_000 };

describe("A2 ⑦ — 감정·매매사례 파트 결과 표시", () => {
  it("R-1 감정 파트 — 「개산공제를 적용하지 않습니다」가 붙지 않고 개산공제 산식이 나온다", () => {
    const out = run(LAND_APPRAISAL);
    expect(card(out, "land").acquisitionMode).toBe("appraisal");
    const f = buildGbExpenseFormula(prop(out, "land"), out)!;
    expect(f).not.toContain("개산공제를 적용하지 않습니다");
    expect(f).toContain("취득시 토지기준시가 238,000,000 × 3% = 7,140,000");
  });

  it("R-1b 매매사례 파트도 같다", () => {
    const out = run(LAND_SALES);
    expect(card(out, "land").acquisitionMode).toBe("salesCase");
    const f = buildGbExpenseFormula(prop(out, "land"), out)!;
    expect(f).not.toContain("개산공제를 적용하지 않습니다");
    expect(f).toContain("× 3% = 7,140,000");
  });

  it("R-2 (긍정 짝) 같은 계산의 실가 건물 파트는 종전 문구를 쓴다", () => {
    const out = run(LAND_APPRAISAL);
    expect(card(out, "building").acquisitionMode).toBe("actual");
    expect(buildGbExpenseFormula(prop(out, "building"), out)).toContain("실지거래가액 파트라 §163⑥ 개산공제를 적용하지 않습니다");
  });

  it("R-3 감정 파트 취득가액 — 환산 곱을 인쇄하지 않고 감정가액으로 표기한다", () => {
    const out = run(LAND_APPRAISAL);
    const f = buildGbAcquisitionFormula(prop(out, "land"), out, undefined)!;
    expect(f).toBe("자산별 취득가액 = 300,000,000 (감정가액 — 소득세법 §97①1호 나목 · 같은 법 시행령 §176의2③2호)");
    expect(f).not.toContain(" / ");
  });

  it("R-3b 매매사례 파트 취득가액", () => {
    const out = run(LAND_SALES);
    const f = buildGbAcquisitionFormula(prop(out, "land"), out, undefined)!;
    expect(f).toContain("자산별 취득가액 = 310,000,000 (매매사례가액");
    expect(f).toContain("§176의2③1호");
  });

  it("R-4 (긍정 짝) 환산 파트는 종전 환산 산식 — 가드가 환산에 새지 않는다", () => {
    const out = run({ landAcqMode: "estimated", buildingAcqMode: "actual", buildingAcquisitionPrice: 100_000_000 });
    const f = buildGbAcquisitionFormula(prop(out, "land"), out, undefined)!;
    expect(f).toContain("238,000,000 / 920,550,000 = 505,748,404");
    expect(f).not.toContain("감정가액");
  });

  it("R-5 옛 이력(echo 없음) — boolean 판정 그대로: 환산이 아니면 실지거래가액 파트 문구", () => {
    const out = run(LAND_APPRAISAL);
    // echo 이전에 저장된 결과를 흉내낸다
    const legacy = { ...out, assetCards: out.assetCards.map((c) => ({ ...c, acquisitionMode: undefined })) };
    const f = buildGbExpenseFormula(prop(out, "land"), legacy)!;
    expect(f).toContain("개산공제를 적용하지 않습니다"); // 종전 동작 유지(회귀 0 — 새 가드는 echo가 있을 때만)
    const g = buildGbAcquisitionFormula(prop(out, "land"), legacy, undefined)!;
    expect(g).not.toContain("감정가액 — 소득세법");
  });
});
