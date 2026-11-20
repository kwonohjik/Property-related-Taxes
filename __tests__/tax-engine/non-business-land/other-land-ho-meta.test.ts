/**
 * NBL2611-V7-S — 호 메타데이터 단일 표(`other-land-ho-meta.ts`)의 정합 가드.
 * 표가 곧 ⑫ enum · UI 선택지 · 결과 근거 · ⑧/⑫ 필수 입력의 소스이므로, 표 내부가 서로 어긋나면 여기서 드러난다.
 */
import { describe, it, expect } from "vitest";
import { OTHER_LAND_HO_IDS, OTHER_LAND_HO_META, hoRequiredInputIssue, otherLandHoLegalBasis } from "@/lib/tax-engine/non-business-land/other-land-ho-meta";
import { NBL_RELATED_BUSINESS_TYPE_VALUES } from "@/lib/tax-engine/non-business-land/nbl-enum-values";
import { resolveAreaLimit, resolveAreaLegalBasis } from "@/lib/tax-engine/non-business-land/other-land-area-limit";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { NBL } from "@/lib/tax-engine/legal-codes";
import { parseDecimal } from "@/lib/calc/number-parse";

const base = { propertyTaxType: "comprehensive" as const, hasBuilding: false, isRelatedToResidenceOrBusiness: false };

describe("호 메타 표 정합", () => {
  it("M-1 ⑫ enum = 표 키 (조문 순서)", () => {
    expect([...NBL_RELATED_BUSINESS_TYPE_VALUES]).toEqual(OTHER_LAND_HO_IDS);
    expect(OTHER_LAND_HO_IDS).toHaveLength(16);
  });

  it("M-2 testId·옵션 라벨은 호마다 유일하다", () => {
    const ids = OTHER_LAND_HO_IDS.map((h) => OTHER_LAND_HO_META[h].option.testId);
    const labels = OTHER_LAND_HO_IDS.map((h) => OTHER_LAND_HO_META[h].option.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("M-3 면적기준 없는 호(area.limited=false)는 엔진 면적 산출이 undefined — 표와 switch가 어긋나지 않는다", () => {
    for (const h of OTHER_LAND_HO_IDS) {
      if (OTHER_LAND_HO_META[h].area.limited) continue;
      expect(resolveAreaLimit({ ...base, relatedBusinessType: h, standardAreaLimit: 999 }, "management"), h).toBeUndefined();
    }
  });

  it("M-4 면적 산식이 있는 호는 인자를 주면 면적이 산출된다(표 limited=true ↔ switch 정합)", () => {
    const sample: Record<string, object> = {
      sports: { sportsFacilityType: "soccer" },
      parking_attached: { standardAreaLimit: 100 },
      parking_garage: { minGarageArea: 100 },
      youth_training: { youthCapacity: 10 },
      reserve_forces: { standardAreaLimit: 100 },
      resort: { standardAreaLimit: 100 },
      hatchang: { maxAnnualArea: 100 },
      vacant_lot_1household: {},
    };
    for (const h of OTHER_LAND_HO_IDS) {
      if (!OTHER_LAND_HO_META[h].area.limited) continue;
      expect(resolveAreaLimit({ ...base, relatedBusinessType: h, ...sample[h] } as never, "management"), h).toBeDefined();
    }
  });

  it("M-5 결과 근거: 호마다 표의 legalBasis · 미설정은 총칙", () => {
    for (const h of OTHER_LAND_HO_IDS) expect(resolveAreaLegalBasis(h)).toBe(OTHER_LAND_HO_META[h].legalBasis);
    expect(otherLandHoLegalBasis(undefined)).toBe(NBL.OTHER_LAND_BUSINESS);
  });

  it("M-6 요건을 판정하지 않는 호(self_declared·partial)는 자기 선언 고지가 있고 «확인 필요»를 담는다 · 14호는 고지 없음(엔진이 별도 고지)", () => {
    for (const h of OTHER_LAND_HO_IDS) {
      const m = OTHER_LAND_HO_META[h];
      if (m.verification === "self_declared" || m.verification === "partial") {
        const n = (m as { selfDeclaredNotice?: string }).selfDeclaredNotice;
        expect(n, h).toBeTruthy();
        expect(n, h).toContain("확인 필요");
      }
    }
    expect(OTHER_LAND_HO_META.etc_14호.verification).toBe("not_recognized");
  });

  it("M-7 필수 입력 칸은 폼 기본값에 실재한다 (⑧·⑫ 칸 이름 오타 방지)", () => {
    const asset = makeDefaultAsset(1) as unknown as Record<string, unknown>;
    for (const h of OTHER_LAND_HO_IDS) {
      const req = (OTHER_LAND_HO_META[h] as { requiredInput?: { field: string } }).requiredInput;
      if (req) expect(asset, `${h}:${req.field}`).toHaveProperty(req.field);
    }
  });

  it("M-8 hoRequiredInputIssue — 숫자 0 이하·날짜 형식 오류는 비었다고 본다", () => {
    const read = (m: Record<string, string>) => (f: string) => m[f];
    expect(hoRequiredInputIssue("hatchang", read({}), parseDecimal)?.field).toBe("nblOtherMaxAnnualArea");
    expect(hoRequiredInputIssue("hatchang", read({ nblOtherMaxAnnualArea: "0" }), parseDecimal)).toBeDefined();
    expect(hoRequiredInputIssue("hatchang", read({ nblOtherMaxAnnualArea: "1,200" }), parseDecimal)).toBeUndefined();
    expect(hoRequiredInputIssue("private_investment_land", read({ nblOtherPrivateInvestCompletionDate: "20230101" }), parseDecimal)).toBeDefined();
    expect(hoRequiredInputIssue("private_investment_land", read({ nblOtherPrivateInvestCompletionDate: "2023-01-01" }), parseDecimal)).toBeUndefined();
    expect(hoRequiredInputIssue("none", read({}), parseDecimal)).toBeUndefined();
    expect(hoRequiredInputIssue("", read({}), parseDecimal)).toBeUndefined();
  });
});
