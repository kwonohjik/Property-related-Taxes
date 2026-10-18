/**
 * anchor: 레거시 신축·미분양 단순 감면(`new_housing`·`unsold_housing` + 소재지)의 **이관**과 입구 차단.
 *
 * 레거시 타입은 엔진에서 「산출세액 × 50%·100%」 단순 감면으로 계산됐다. 다건 신고에서는 그 금액을 단건 세액
 * (기본공제 전)으로 구해 더했다 — 실측: 자산 1건 다건 77,030,000 ≠ 단건 76,530,000 · 차손을 받으면 50%가
 * 산출세액 전액(74,110,000)으로 · 자산별 배분 합 154,060,000 ≠ 감면액 153,060,000 · 다건 농특세 0(단건 30,612,000).
 * 현행 UI는 이 타입을 만들지 않으므로 입구를 닫는다(계획서 `transfer-90-1-reducible-income-after-loss-offset.plan.md` §6).
 *
 * 레거시 장기임대 이관(R-4, `legacy-long-term-rental-migration.anchor.test.ts`)과 같은 구조다 — 폼 union·④·⑫에서
 * 타입을 빼면 이미 그 타입이 들어 있는 세션은 감면이 **조용히 사라진다**. 두 진입점이 **모두** 이관해야 한다.
 * 조문은 이력(IndexedDB) 이관과 같은 규칙이다(`reclassifiedLegacyHousingType`).
 */
import { describe, it, expect } from "vitest";
import { migrateLegacyForm } from "@/lib/stores/calc-wizard-migration";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { reclassifiedLegacyHousingType } from "@/lib/storage/migrations/reduction-reclassification";

function migrate(reductionType: string, acquisitionDate: string) {
  const form = migrateLegacyForm(
    { transferDate: "2024-06-01", acquisitionDate, reductionType, reductionRegion: "non_metropolitan", propertyType: "housing" },
    createDefaultTransferFormData(),
  );
  return { form, r: (form.assets?.[0]?.reductions ?? [])[0] as unknown as Record<string, unknown> | undefined };
}

describe("폼-전역 구버전 세션 (진입점 ①)", () => {
  it("LH-1: new_housing → new_99 · unsold_housing → 취득일 2001.5.23~2003.6.30이면 new_99_3, 그 밖은 unsold_98_3", () => {
    expect(migrate("new_housing", "1999-03-01").r?.type).toBe("new_99");
    expect(migrate("unsold_housing", "2002-01-01").r?.type).toBe("new_99_3");
    expect(migrate("unsold_housing", "2009-06-01").r?.type).toBe("unsold_98_3");
  });

  it("LH-2: 계약일은 비어 있고 ⑧이 묻는다 — 조용히 감면을 주지 않는다", () => {
    const cases: [string, string, string][] = [
      ["new_housing", "1999-03-01", "§99 적용: 매매계약일을 입력하세요"],
      ["unsold_housing", "2002-01-01", "§99의3 1호 적용: 매매계약일을"],
      ["unsold_housing", "2009-06-01", "§98의3 적용: 최초 매매계약일을 입력하세요"],
    ];
    for (const [type, acq, message] of cases) {
      const { form } = migrate(type, acq);
      expect(collectStepIssues(2, form).map((i) => i.message).some((m) => m.startsWith(message)), `${type} ${acq}`).toBe(true);
    }
  });

  it("LH-3: 이력 이관과 같은 규칙을 쓴다", () => {
    expect(reclassifiedLegacyHousingType("new_housing", "2009-06-01")).toBe("new_99");
    expect(reclassifiedLegacyHousingType("unsold_housing", "2003-06-30")).toBe("new_99_3");
    expect(reclassifiedLegacyHousingType("unsold_housing", "2003-07-01")).toBe("unsold_98_3");
    expect(reclassifiedLegacyHousingType("unsold_housing", undefined)).toBe("unsold_98_3");
  });
});

describe("이미 레거시 타입이 들어 있는 자산 폼 (진입점 ② — 단건·다건 복원·이력 불러오기 공통)", () => {
  it("LH-4: `migrateAsset`이 이관한다 — 레거시 소재지 키는 남지 않는다", () => {
    const asset = migrateAsset({
      assetKind: "housing",
      acquisitionDate: "2002-01-01",
      reductions: [{ type: "unsold_housing", reductionRegion: "metropolitan" }],
    });
    const r = (asset.reductions ?? [])[0] as unknown as Record<string, unknown>;
    expect(r.type).toBe("new_99_3");
    expect(r.reductionRegion).toBeUndefined();
  });

  it("LH-5: 이미 조문 ID인 값은 건드리지 않는다 (대조군)", () => {
    const asset = migrateAsset({ assetKind: "housing", reductions: [{ type: "new_99", contractDate99: "1998-08-01" }] });
    const r = (asset.reductions ?? [])[0] as unknown as Record<string, unknown>;
    expect(r.type).toBe("new_99");
    expect(r.contractDate99).toBe("1998-08-01");
  });
});

describe("⑫ Zod가 레거시 입력을 더는 받지 않는다", () => {
  it("LH-6: new_housing·unsold_housing 입력은 거부된다 (단순 감면 경로의 API 입구 소멸)", () => {
    expect(reductionSchema.safeParse({ type: "new_housing", region: "metropolitan" }).success).toBe(false);
    expect(reductionSchema.safeParse({ type: "unsold_housing", region: "non_metropolitan" }).success).toBe(false);
  });
});
