/**
 * anchor: 취득가액 감사 잔여 #3(GB swap 사이드바 표시) + #1(B)(재개발 land+right gift 안전판)
 *
 * 계획: docs/02-design/features/transfer-audit-residual-3items.plan.md
 *
 * #3: §97②2호 swap 발동 시 엔진(buildProperties)은 취득가0·필요경비=배분나목을 쓰나,
 *     사이드바 배분(buildApportionment)이 swap 미반영(pre-swap 환산취득가·개산공제)이던 표시 불일치.
 *     → buildApportionment에 swap 반영. 세액 무변경, 배분 표시만 정합.
 * #1(B): land+right+gift+환산은 §163⑨상 신고가액이 취득가액이나 실가 경로 미구현 →
 *     환산(§166③)으로 진행하면 신고가액 무시 silent 오세액. friendly block으로 차단(안전판).
 */
import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import type { GeneralBuildingInput } from "@/lib/tax-engine/general-building-valuation";
import { validateRedevelopmentAsset } from "@/lib/calc/transfer-tax-validate-redev";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { makeMockRates } from "../../tax-engine/_helpers/mock-rates";

const rates = makeMockRates();

// ─────────────────────────────────────────────────────────
// #3 — GB swap 사이드바 배분 표시 정합 (general-building-97-2-swap.anchor BASE 재사용)
// ─────────────────────────────────────────────────────────
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

describe("#3 GB §97②2호 swap 사이드바 배분 표시 정합", () => {
  it("swap 발동: 배분 취득가액=0·Σ필요경비=directSide(8.1억)", () => {
    const r = calculateGeneralBuildingTransfer(
      { ...BASE, capitalExpenditure: 800_000_000, transferExpense: 10_000_000 },
      2023, 0, [], rates,
    );
    expect(r.aggregated.swapApplied).toBe(true);
    const cards = r.apportionment.apportioned;
    // 전 환산 카드 취득가액 미차감(0)
    for (const c of cards) expect(c.allocatedAcquisitionPrice).toBe(0);
    // Σ 필요경비 = 배분나목 총액 = directSide 810,000,000 (잔액 흡수)
    const sumExp = cards.reduce((s, c) => s + c.allocatedExpenses, 0);
    expect(sumExp).toBe(810_000_000);
  });

  it("swap 미발동(회귀): 배분 취득가액=환산취득가(≠0)·필요경비=개산공제", () => {
    const r = calculateGeneralBuildingTransfer(BASE, 2023, 0, [], rates);
    expect(r.aggregated.swapApplied ?? false).toBe(false);
    const sumAcq = r.apportionment.apportioned.reduce((s, c) => s + c.allocatedAcquisitionPrice, 0);
    expect(sumAcq).toBeGreaterThan(0); // 환산취득가 표시 유지
  });
});

// ─────────────────────────────────────────────────────────
// #1(B) — 재개발 land+right+gift+환산 friendly block
// ─────────────────────────────────────────────────────────
const BLOCK_B = "토지 출자 + 입주권 양도 + 증여취득 조합은 현재 지원하지";
function redev(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "right",
    redevOriginalAssetType: "land",
    acquisitionCause: "gift",
    acquisitionDate: "2015-06-01",
    useEstimatedAcquisition: true,
    redevIsSuccessorMember: "no",
    ...over,
  } as AssetForm;
}
const V = (a: AssetForm) => validateRedevelopmentAsset(a, "자산 1") ?? "";

describe("#1(B) 재개발 land+right+gift+환산 안전판", () => {
  it("C1 land+right+gift(2015)+환산 → block(안내)", () => {
    expect(V(redev())).toContain(BLOCK_B);
  });
  it("C2 land+right+purchase+환산 → B블록 미발동(비-gift·§166③ 진행)", () => {
    expect(V(redev({ acquisitionCause: "purchase" }))).not.toContain(BLOCK_B);
  });
  it("C3 land+right+gift+실가(환산 OFF) → B블록 미발동(:95 후속PR로 위임)", () => {
    expect(V(redev({ useEstimatedAcquisition: false }))).not.toContain(BLOCK_B);
  });
  it("C4 land+right+gift(1983, pre-1985)+환산 → B블록 미발동(§176의2④ 의제취득)", () => {
    expect(V(redev({ acquisitionDate: "1983-06-01" }))).not.toContain(BLOCK_B);
  });
});
