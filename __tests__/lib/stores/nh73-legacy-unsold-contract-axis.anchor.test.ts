/**
 * NH-73(Q-17) — 레거시 «미분양주택 감면(§99의3)» 이관을 **계약일 축**으로 한다.
 *
 * 조특법 §99의3①·§98의3①은 둘 다 «계약 체결일»이 기간 기준이다. 종전 이관은 취득일만 봐서 2001.5.23.~2003.6.30. 밖의 모든 취득분
 * (특히 2003.7.1.~2009.2.11.)을 §98의3으로 보냈다. 그런데 §98의3은 계약일이 2009.2.12.~2010.2.11.이어야 하고 계약일은 취득일을
 * 넘지 못하므로 취득일이 2009.2.12. 전이면 §98의3은 불가능하다 — 계약일 2003년으로 입력하면 «기간 밖»이라 감면이 사라졌다.
 *
 * 시료(세율표 = 로컬 fallback 시드 2024.8.1. 양도 · 양도가 8억 · 취득가 5억 · 2주택 · 취득일 2005.6.1. · 계약일 2003.5.1.):
 *   이관 결과가 §98의3(수정 전) → 총부담 64,801,000 (감면 없음)
 *   이관 결과가 §99의3(수정 후) → 총부담 36,788,500 (농특세 6,225,000 포함)
 */
import { describe, it, expect } from "vitest";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { migrateLegacyForm } from "@/lib/stores/calc-wizard-migration";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  reclassifiedLegacyHousingType,
  migrateReductionReclassification,
  analyzeReductionReclassificationImpact,
} from "@/lib/storage/migrations/reduction-reclassification";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { baseTransferInput } from "../../tax-engine/_helpers/mock-rates";

const U = "unsold_housing" as const;

describe("NH-73 순수 규칙 — 계약일 축 우선", () => {
  it("A1 계약일이 §99의3 기간(2001.5.23.~2003.6.30.)이면 취득일과 무관하게 new_99_3", () => {
    expect(reclassifiedLegacyHousingType(U, "2005-06-01", "2003-05-01")).toBe("new_99_3");
    expect(reclassifiedLegacyHousingType(U, "2012-06-01", "2001-05-23")).toBe("new_99_3");
    expect(reclassifiedLegacyHousingType(U, "2012-06-01", "2003-06-30")).toBe("new_99_3");
  });

  it("A2 계약일이 §98의3 기간(2009.2.12.~2010.2.11.)이면 unsold_98_3", () => {
    expect(reclassifiedLegacyHousingType(U, "2011-03-01", "2009-02-12")).toBe("unsold_98_3");
    expect(reclassifiedLegacyHousingType(U, "2011-03-01", "2010-02-11")).toBe("unsold_98_3");
  });

  it("A3 기간 경계 바로 밖(2003.7.1. · 2009.2.11. · 2010.2.12.)의 계약일은 어느 조문도 확정하지 않는다 — 취득일로 가능한 조문만 고른다", () => {
    // 계약일이 시한 밖이어도 취득일 규칙이 그대로 적용된다(계약일을 그대로 믿고 다른 조문으로 보내지 않는다)
    expect(reclassifiedLegacyHousingType(U, "2005-06-01", "2003-07-01")).toBe("new_99_3");
    expect(reclassifiedLegacyHousingType(U, "2005-06-01", "2009-02-11")).toBe("new_99_3");
    // Q-28 — 취득일(2011.6.1.)도 §98의3 기간(~2010.2.11.) 뒤이므로 §98의3으로 열지 않고 조문 미정으로 둔다
    expect(reclassifiedLegacyHousingType(U, "2011-06-01", "2010-02-12")).toBe("unresolved");
    expect(reclassifiedLegacyHousingType(U, "2010-02-01", "2010-02-12")).toBe("unsold_98_3");
  });

  it("A4 계약일이 없으면 취득일로 가능한 조문만 — 2009.2.12. 전 취득은 §98의3 불가능이라 new_99_3", () => {
    expect(reclassifiedLegacyHousingType(U, "2003-07-01")).toBe("new_99_3");
    expect(reclassifiedLegacyHousingType(U, "2009-02-11")).toBe("new_99_3");
    expect(reclassifiedLegacyHousingType(U, "2009-02-12")).toBe("unsold_98_3");
    expect(reclassifiedLegacyHousingType(U, "2002-01-01")).toBe("new_99_3");
    expect(reclassifiedLegacyHousingType(U, undefined)).toBe("unsold_98_3");
  });

  it("A5 짝 — new_housing은 계약일과 무관하게 new_99", () => {
    expect(reclassifiedLegacyHousingType("new_housing", "2005-06-01", "2009-06-01")).toBe("new_99");
  });
});

describe("NH-73 복원 경로 — 자산 폼·폼-전역 세션이 같은 규칙을 쓴다", () => {
  it("B1 `migrateAsset`: 취득 2005.6.1. · 계약 2003.5.1. → new_99_3 (수정 전 unsold_98_3)", () => {
    const asset = migrateAsset({ assetKind: "housing", acquisitionDate: "2005-06-01", assetContractDate: "2003-05-01", reductions: [{ type: U }] });
    expect(((asset.reductions ?? [])[0] as unknown as { type: string }).type).toBe("new_99_3");
    // 계약일 축이 취득일 규칙을 이기는 경우 — 취득 2012.6.1.이어도 계약 2003.5.1.이면 §99의3 (취득일만 보면 unsold_98_3)
    const late = migrateAsset({ assetKind: "housing", acquisitionDate: "2012-06-01", assetContractDate: "2003-05-01", reductions: [{ type: U }] });
    expect(((late.reductions ?? [])[0] as unknown as { type: string }).type).toBe("new_99_3");
  });

  it("B2 `migrateAsset`: 취득 2009.6.1. · 계약 2009.5.1. → unsold_98_3 (대조)", () => {
    const asset = migrateAsset({ assetKind: "housing", acquisitionDate: "2009-06-01", assetContractDate: "2009-05-01", reductions: [{ type: U }] });
    expect(((asset.reductions ?? [])[0] as unknown as { type: string }).type).toBe("unsold_98_3");
  });

  it("B3 `migrateAsset`: 계약일이 없는 옛 기록 · 취득 2005.6.1. → new_99_3 + 계약일 칸은 비어 있다(⑧이 묻는다 — 없는 사실을 만들지 않는다)", () => {
    const asset = migrateAsset({ assetKind: "housing", acquisitionDate: "2005-06-01", reductions: [{ type: U }] });
    const r = (asset.reductions ?? [])[0] as unknown as Record<string, unknown>;
    expect(r.type).toBe("new_99_3");
    expect(r.contractDate993).toBe("");
  });

  it("B4 폼-전역 구버전 세션: 계약일 칸이 없으므로 취득일 규칙 — 2005.6.1. → new_99_3", () => {
    const form = migrateLegacyForm(
      { transferDate: "2024-06-01", acquisitionDate: "2005-06-01", reductionType: U, reductionRegion: "non_metropolitan", propertyType: "housing" },
      createDefaultTransferFormData(),
    );
    expect(((form.assets?.[0]?.reductions ?? [])[0] as unknown as { type: string }).type).toBe("new_99_3");
  });
});

describe("NH-73 이력(IndexedDB) 이관 — 같은 규칙", () => {
  type Rec = { inputData: { assets: { acquisitionDate: string; assetContractDate?: string; reductions: { type: string }[] }[] } };
  const rec = (acq: string, contract: string | undefined, type = U): Rec => ({
    inputData: { assets: [{ acquisitionDate: acq, ...(contract ? { assetContractDate: contract } : {}), reductions: [{ type }] }] },
  });
  const fakeTx = (records: Rec[]) =>
    ({ table: () => ({ toCollection: () => ({ modify: async (fn: (r: Rec) => void) => records.forEach(fn) }) }) }) as never;

  it("C1 Dexie upgrade: 계약 2003.5.1. → new_99_3 · 계약 2009.5.1. → unsold_98_3 · 계약 없음 + 취득 2005 → new_99_3", async () => {
    const records = [rec("2005-06-01", "2003-05-01"), rec("2009-06-01", "2009-05-01"), rec("2005-06-01", undefined), rec("2012-06-01", "2003-05-01")];
    const n = await migrateReductionReclassification(fakeTx(records));
    expect(n).toBe(4);
    expect(records.map((r) => r.inputData.assets[0].reductions[0].type)).toEqual(["new_99_3", "unsold_98_3", "new_99_3", "new_99_3"]);
  });

  it("C2 영향 산정(`analyze…Impact`)도 같은 규칙으로 센다", async () => {
    const records = [rec("2005-06-01", "2003-05-01"), rec("2009-06-01", "2009-05-01"), rec("2005-06-01", undefined), rec("2012-06-01", "2003-05-01")];
    const impact = await analyzeReductionReclassificationImpact({ calculations: { toArray: async () => records as never } });
    expect(impact.byType.unsold_housing_to_new_99_3).toBe(3);
    expect(impact.byType.unsold_housing_to_unsold_98_3).toBe(1);
  });
});

describe("NH-73 세액 — 이관 결과가 갈린 시료 (세율표: 로컬 fallback 시드 2024.8.1.)", () => {
  const td = "2024-08-01";
  const run = (reductions: unknown[]) =>
    calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000, acquisitionPrice: 500_000_000, acquisitionDate: new Date("2005-06-01"),
        transferDate: new Date(td), householdHousingCount: 2, reductions: reductions as never,
      }),
      loadFallbackTransferRates(new Date(td)),
    );

  it("D1 §98의3 이관(수정 전)은 계약일 2003.5.1.이 기간 밖이라 감면이 없다 = 감면 미선택 64,801,000 / §99의3 이관(수정 후) 36,788,500", () => {
    const none = run([]);
    const wrong = run([{
      type: "unsold_98_3", residencyType983: "resident", houseType983: "purchased", contractDate983: new Date("2003-05-01"),
      isUnsoldConfirmed983: true, isFirstContract983: true, isNotOccupiedAtContract983: true, isNotRecontract983: true,
      isOutsideSeoulNotDesignated983: true, isOverconcentration983: false,
      standardPriceAtAcquisition983: 100_000_000, standardPriceAt5Years983: 160_000_000, standardPriceAtTransfer983: 250_000_000,
    }]);
    const right = run([{
      type: "new_99_3", contractDate993: new Date("2003-05-01"), standardPriceAtAcquisition993: 100_000_000,
      standardPriceAt5Years: 160_000_000, standardPriceAtTransfer993: 250_000_000, region993: "outside_speculation",
      acquisitionType993: "from_builder", firstContract993: "yes", exclusiveAreaSqm993: 84,
    }]);
    expect(none.totalTax).toBe(64_801_000);
    expect(wrong.totalTax).toBe(none.totalTax);
    expect(right.totalTax).toBe(36_788_500);
  });
});
