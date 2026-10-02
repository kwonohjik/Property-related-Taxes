/**
 * anchor: 비사업용 토지 「사업용 사용기간」·「거주 이력」 빈 행 검증은 **그 값을 쓰는 지목**에만 건다 (N1).
 *
 * 결함(막다른 오류): 검증(`transfer-tax-validate-nbl.ts` `rowArrays`)이 두 배열에 `applies: true`(지목 무관)였는데
 *   · 사업용 사용기간 입력칸 = 농지만(`FarmlandDetailSection`) · 엔진 소비 = 농지만(`farmland.ts`)
 *   · 거주 이력 입력칸 = 농지·임야(`NblSectionContainer`) · 엔진 소비 = 농지·임야(`engine.ts` `residenceMatch`·`forest.ts`·`farmland.ts`)
 *   농지에서 「+ 기간 추가」로 빈 행을 만든 뒤 지목을 바꾸면(스토어에 지목 변경 시 행 리셋 없음) 행이 남아
 *   오류는 뜨는데 고칠 칸이 없었다(앵커 0 — 입력칸 이동 Phase 4 · 계획서 §7-4 N1).
 *
 * ⇒ 입력칸을 열지 않고(엔진이 쓰지 않는 값 — 열면 거짓 입력칸) 검증을 **소비처**로 좁힌다.
 *   빈 행은 매퍼가 이미 버리므로(`startDate` 없으면 제외) 세액에는 변화가 없다 — 도달 가능성만 고친다.
 *   선례: `nbl-disqualified-periods-gate.anchor.test.ts`(L2 — 검증 게이트를 렌더 게이트에 맞춤).
 */
import { describe, it, expect } from "vitest";
import { validateNblDetailedJudgment } from "@/lib/calc/transfer-tax-validate-nbl";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { mapAssetToNblInput } from "@/lib/tax-engine/non-business-land/form-mapper";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import { toOptionalDate } from "@/lib/api/date-coerce";

const TRANSFER = "2025-05-01";
type LandType = NonNullable<AssetForm["nblLandType"]>;

function landAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionDate: "2010-06-01",
    nblUseDetailedJudgment: true,
    nblLandType: "farmland",
    nblZoneType: "agriculture_forest",
    acquisitionArea: "500",
    nblFarmingSelf: true,
    ...over,
  } as AssetForm;
}

/** 「+ 기간 추가」(`BusinessUsePeriodsInput`)가 만드는 행과 같다 */
const emptyBusinessRow = { startDate: "", endDate: "", usageType: "자경" };
const emptyResidenceRow = { sigunguCode: "", sigunguName: "", startDate: "", endDate: "", hasResidentRegistration: false };
/**
 * 지목별 **앞선 필수 입력**을 채운 바탕 — 안 채우면 그 오류가 행 오류보다 먼저 반환돼(첫 오류 1건 구조)
 * 「행 오류가 없다」는 부정 단언이 수정 전에도 통과하는 **공허한 검사**가 된다(실측: 기타토지는 재산세 과세 분류,
 * 별장은 주택 정착면적이 먼저 나온다).
 */
const LAND_BASE: Partial<Record<LandType, Partial<AssetForm>>> = {
  other_land: { nblOtherPropertyTaxType: "separate" },
  villa_land: { nblHousingFootprint: "100" },
};
const rowMessage = (over: Partial<AssetForm>) => {
  const base = over.nblLandType ? LAND_BASE[over.nblLandType] ?? {} : {};
  return validateNblDetailedJudgment(landAsset({ ...base, ...over }), "토지", TRANSFER);
};
const ROW = /번째 행/;

describe("N1 — 사업용 사용기간 빈 행은 농지에서만 막는다 (입력칸·엔진 소비가 농지뿐)", () => {
  it("🔑 농지 + 빈 행 → 막는다 (긍정 짝 — 게이트를 지운 게 아니다)", () => {
    expect(rowMessage({ nblBusinessUsePeriods: [emptyBusinessRow] })).toMatch(/사업용 사용기간\(자경 등\) 1번째 행/);
  });

  it.each(["forest", "other_land", "pasture", "villa_land", "housing_site"] as LandType[])(
    "🔑 %s + 빈 행 → 막지 않는다 (칸이 화면에 없다)",
    (landType) => {
      expect(rowMessage({ nblLandType: landType, nblBusinessUsePeriods: [emptyBusinessRow] }) ?? "").not.toMatch(
        /사업용 사용기간\(자경 등\)/,
      );
    },
  );
});

describe("N1 — 부정 단언이 공허하지 않다 (앞선 필수 입력이 행 검사를 가리지 않는다)", () => {
  it.each(["other_land", "villa_land"] as LandType[])("%s: 바탕 입력으로 행 검사 앞의 오류가 없다 — 행이 비면 행 오류에 닿는다", (landType) => {
    // 이 바탕에서 행 오류는 「수정 전」에는 나오고(= 행 검사에 도달), 수정 후에는 이 지목에서 사라진다.
    // 도달 자체를 증명하려고 농지 규칙과 대조한다: 같은 바탕에 **채워진 정상 행**을 주면 null이어야 한다.
    const filled = [{ startDate: "2012-01-01", endDate: "2024-12-31", usageType: "자경" }];
    expect(rowMessage({ nblLandType: landType, nblBusinessUsePeriods: filled })).toBeNull();
  });
});

describe("N1 — 거주 이력 빈 행은 농지·임야에서만 막는다 (재촌 판정 축)", () => {
  it("🔑 농지 + 빈 행 → 막는다", () => {
    expect(rowMessage({ nblResidenceHistories: [emptyResidenceRow] })).toMatch(/거주 이력 1번째 행/);
  });

  it("🔑 임야 + 빈 행 → 막는다 (임야도 재촌 판정 — 입력칸이 있다)", () => {
    expect(rowMessage({ nblLandType: "forest", nblResidenceHistories: [emptyResidenceRow] }) ?? "").toMatch(/거주 이력 1번째 행/);
  });

  it.each(["pasture", "other_land", "villa_land", "housing_site"] as LandType[])(
    "🔑 %s + 빈 행 → 막지 않는다 (재촌 요건 없음 · 칸이 화면에 없다)",
    (landType) => {
      expect(rowMessage({ nblLandType: landType, nblResidenceHistories: [emptyResidenceRow] }) ?? "").not.toMatch(/거주 이력/);
    },
  );
});

describe("N1 — 좁혀도 세액이 변하지 않는다 (엔진 증거)", () => {
  const ctx = {
    acquisitionDate: new Date("2010-06-01T00:00:00Z"),
    transferDate: new Date("2025-05-01T00:00:00Z"),
    parseDate: (s: string) => toOptionalDate(s || undefined),
    parseNumber: (s: string) => {
      const n = parseFloat(String(s).replace(/,/g, ""));
      return Number.isFinite(n) ? n : undefined;
    },
  };
  const judge = (over: Record<string, unknown>) => {
    const input = mapAssetToNblInput({ ...landAsset(), ...over } as unknown as Record<string, unknown>, ctx);
    expect(input).not.toBeNull();
    return judgeNonBusinessLand(input!, DEFAULT_NON_BUSINESS_LAND_RULES);
  };

  it("빈 행은 매퍼가 버린다 — 농지에서도 엔진 입력에 들어가지 않는다", () => {
    const withRows = mapAssetToNblInput(
      { ...landAsset(), nblBusinessUsePeriods: [emptyBusinessRow], nblResidenceHistories: [emptyResidenceRow] } as unknown as Record<string, unknown>,
      ctx,
    );
    expect(withRows?.businessUsePeriods).toEqual([]);
    expect(withRows?.ownerProfile?.residenceHistories ?? []).toEqual([]);
  });

  it("임야: 채워진 사업용 사용기간이 있어도 판정이 같다 (엔진이 임야에서 이 값을 쓰지 않는다)", () => {
    const filled = [{ startDate: "2012-01-01", endDate: "2024-12-31", usageType: "자경" }];
    const a = judge({ nblLandType: "forest" });
    const b = judge({ nblLandType: "forest", nblBusinessUsePeriods: filled });
    expect(b).toEqual(a);
  });

  it("목장: 채워진 거주 이력이 있어도 판정이 같다 (목장 엔진은 거주 이력을 참조하지 않는다 — 법 §104의3①3호)", () => {
    const filled = [{ sigunguCode: "11680", sigunguName: "강남구", startDate: "2012-01-01", endDate: "2024-12-31", hasResidentRegistration: true }];
    const base = { nblLandType: "pasture", nblPastureBusiness: false };
    const a = judge(base);
    const b = judge({ ...base, nblResidenceHistories: filled });
    expect(b).toEqual(a);
  });
});
