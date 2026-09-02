/**
 * anchor: 농지·목장 「도시지역」 판정은 법 §104의3①1호나목·3호가목의 **지역 열거** 안에서만 한다
 *
 * 발견 E2-01 (docs/reviews/nbl-code-review-2026-09.md)
 *
 * 「소득세법」 §104의3①1호나목 verbatim (KoreanLaw `get_law_text(mst=280405)` 직접 확인 2026-09-02):
 *   「특별시ㆍ광역시(**광역시에 있는 군은 제외한다. 이하 이 항에서 같다**)ㆍ특별자치시(특별자치시에
 *    있는 **읍ㆍ면지역은 제외한다**. 이하 이 항에서 같다)ㆍ특별자치도(…행정시의 **읍ㆍ면지역은
 *    제외한다**. 이하 이 항에서 같다) 및 시지역(「지방자치법」 제3조제4항에 따른 **도농 복합형태인
 *    시의 읍ㆍ면지역은 제외한다**. 이하 이 항에서 같다) 중 …도시지역…에 있는 농지」
 *
 * 괄호마다 「이하 **이 항**에서 같다」이므로 같은 항 3호가목(목장용지)에도 그대로 미친다.
 * **도(道)의 군**은 열거 자체에 없으므로 애초 대상이 아니다.
 *
 * 종전에는 이 축이 통째로 없어 부산 기장군·도농복합시 읍면의 농지·목장이 용도지역만으로
 * 비사업용이 됐다(§104①8호 +10%p 중과).
 *
 * ⚠️ `isUrbanForFarmland` leaf는 건드리지 않는다 — `unconditional-exemption.ts`가
 *    §168의14③1의2호(「도시지역(녹지지역 및 개발제한구역은 제외한다)」 — **지역 열거 없음**)로
 *    같은 leaf를 부르기 때문이다. 판정은 호출부에서만 한다.
 */
import { describe, it, expect } from "vitest";
import { judgeFarmland } from "@/lib/tax-engine/non-business-land/farmland";
import { judgePasture } from "@/lib/tax-engine/non-business-land/pasture";
import { isUrbanCriteriaRegion } from "@/lib/tax-engine/non-business-land/urban-region-scope";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);
const RULES = DEFAULT_NON_BUSINESS_LAND_RULES;

/** 전 기간 재촌·자경 + 도시지역(일반주거) 농지 — 지역 열거만이 결과를 가른다 */
function farm(sigunguCode: string, partial: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "farmland",
    landArea: 1000,
    zoneType: "general_residential",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    farmingSelf: true,
    landLocation: { sigunguCode },
    ownerProfile: {
      residenceHistories: [
        {
          sidoName: "-",
          sigunguName: "-",
          sigunguCode,
          startDate: d("2014-01-01"),
          endDate: d("2024-01-01"),
          hasResidentRegistration: true,
        },
      ],
    },
    businessUsePeriods: [{ startDate: d("2014-01-02"), endDate: d("2024-01-01"), usageType: "자경" }],
    gracePeriods: [],
    ...partial,
  };
}

function pasture(sigunguCode: string, partial: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    ...farm(sigunguCode),
    landType: "pasture",
    pasture: { isLivestockOperator: true, standardArea: 5000 },
    ...partial,
  };
}

describe("[E2-01] 지역 열거 leaf", () => {
  it("광역시의 군 → 대상 밖 (명문 제외)", () => {
    expect(isUrbanCriteriaRegion("26710", "dong")).toBe(false); // 부산 기장군
  });

  it("도의 군 → 대상 밖 (열거에 「도」가 없다)", () => {
    expect(isUrbanCriteriaRegion("41830", undefined)).toBe(false); // 경기 양평군
  });

  it("특별시 자치구 → 대상 (읍·면이 없어 구분 입력 불요)", () => {
    expect(isUrbanCriteriaRegion("11680", undefined)).toBe(true); // 서울 강남구
  });

  it("일반구도 시지역이라 대상", () => {
    expect(isUrbanCriteriaRegion("48129", undefined)).toBe(true); // 창원시 진해구
  });

  it("🔴 도농복합시 — 읍·면이면 대상 밖, 동이면 대상", () => {
    expect(isUrbanCriteriaRegion("43130", "eup_myeon")).toBe(false); // 충주시 읍·면
    expect(isUrbanCriteriaRegion("43130", "dong")).toBe(true);
  });

  it("🔴 특별자치시·제주 행정시도 읍·면이면 대상 밖", () => {
    expect(isUrbanCriteriaRegion("36110", "eup_myeon")).toBe(false); // 세종
    expect(isUrbanCriteriaRegion("50130", "eup_myeon")).toBe(false); // 서귀포시
    expect(isUrbanCriteriaRegion("50130", "dong")).toBe(true);
  });

  it("시인데 읍·면 구분이 없으면 판정 불가 — 추정하지 않는다", () => {
    expect(isUrbanCriteriaRegion("43130", undefined)).toBeUndefined();
  });

  it("코드가 없으면 판정 불가", () => {
    expect(isUrbanCriteriaRegion(undefined, "dong")).toBeUndefined();
    expect(isUrbanCriteriaRegion("", "dong")).toBeUndefined();
  });
});

describe("[E2-01] 농지 — 지역 열거 밖이면 도시지역 판정을 건너뛴다", () => {
  it("🔴 부산 기장군(광역시의 군) 일반주거 농지 + 재촌·자경 → 사업용", () => {
    const r = judgeFarmland(farm("26710", { landDivision: "dong" }), RULES);
    expect(r.isBusiness).toBe(true);
  });

  it("🔴 충주시 읍·면 일반주거 농지 + 재촌·자경 → 사업용", () => {
    const r = judgeFarmland(farm("43130", { landDivision: "eup_myeon" }), RULES);
    expect(r.isBusiness).toBe(true);
  });

  it("같은 조건에서 동 지역이면 종전대로 도시지역 판정을 탄다 (과소적용 방지)", () => {
    const r = judgeFarmland(farm("43130", { landDivision: "dong" }), RULES);
    expect(r.isBusiness).toBe(false);
  });

  it("서울 자치구는 종전대로 도시지역 판정 (과소적용 방지)", () => {
    const r = judgeFarmland(farm("11680"), RULES);
    expect(r.isBusiness).toBe(false);
  });
});

describe("[E2-01] 목장용지 — 3호가목도 같은 지역 열거", () => {
  it("🔴 부산 기장군 일반주거 목장용지 + 축산 영위·기준면적 이내 → 사업용", () => {
    const r = judgePasture(pasture("26710", { landDivision: "dong" }), RULES);
    expect(r.isBusiness).toBe(true);
  });

  it("서울 자치구 목장용지는 종전대로 도시지역 판정 (과소적용 방지)", () => {
    const r = judgePasture(pasture("11680"), RULES);
    expect(r.isBusiness).toBe(false);
  });
});
