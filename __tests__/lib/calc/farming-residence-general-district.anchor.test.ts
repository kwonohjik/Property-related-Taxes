/**
 * anchor: 영농상속공제 거주지 판정의 「구」도 자치구뿐 — 일반구는 상위 시가 단위
 *
 * 발견 V3-b·V3-d (docs/reviews/nbl-code-review-2026-09.md)
 *
 * 「상속세 및 증여세법 시행령」 §16②1호나 — 「농지등이 소재하는 시(…행정시를 포함한다.
 * 이하 이 조에서 같다)ㆍ군ㆍ구(**자치구를 말한다**. 이하 이 조에서 같다), 그와 **연접한**
 * 시ㆍ군ㆍ구 또는 해당 농지등으로부터 직선거리 30킬로미터 이내…에 거주할 것」
 * (KoreanLaw `get_law_text(mst=262419, jo="제16조")` 직접 확인 2026-09-02)
 *
 * 양도세 §153③1호 「구(자치구인 구를 말한다)」와 문언이 같아 **같은 leaf를 공유**한다 —
 * `non-business-land/residence.ts`가 이 파일을 「알고리즘 미러」로 명시하므로 한쪽만 고치면
 * 두 세목이 갈린다.
 *
 * 코드 체계는 10자리(PNU 앞 5자리 + "00000")다.
 */
import { describe, it, expect } from "vitest";
import { checkFarmingResidenceCompliance } from "@/lib/calc/farming-residence-check";
import { getAdjacentSigunguCodes } from "@/lib/geo/administrative-district-adjacency";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FarmingInheritanceInput } from "@/lib/tax-engine/types/inheritance-farming.types";

/** 창원시 진해구 소재 농지 (좌표 없음 — 코드 축만 본다) */
function farmland(code: string): EstateItem {
  return {
    id: "a1",
    category: "real_estate_land",
    name: "농지",
    farmingCategory: "farmland",
    estateSigunguCode: code,
    marketValue: 100_000_000,
  };
}

function farming(over: Partial<FarmingInheritanceInput> = {}): FarmingInheritanceInput {
  return {
    type: "personal",
    decedentEightYearFarming: true,
    decedentResidenceMet: false,
    heirIsAdult: true,
    heirTwoYearFarming: true,
    heirResidenceMet: false,
    ...over,
  };
}

const OPTS = { adjacentSigunguCodes: getAdjacentSigunguCodes };

describe("[V3-b] 일반구는 「구」가 아니다 — 상속 영농상속공제 거주지", () => {
  it("🔴 창원시 진해구 농지 × 창원시 의창구 거주 → same_district", () => {
    const r = checkFarmingResidenceCompliance(
      [farmland("4812900000")],
      farming({ decedentResidenceSigunguCode: "4812100000" }),
      OPTS,
    );
    expect(r.decedentMatchKind).toBe("same_district");
    expect(r.decedentAutoMet).toBe(true);
  });

  it("🔴 성남시 수정구 농지 × 성남시 분당구 거주 → same_district", () => {
    const r = checkFarmingResidenceCompliance(
      [farmland("4113100000")],
      farming({ decedentResidenceSigunguCode: "4113500000" }),
      OPTS,
    );
    expect(r.decedentMatchKind).toBe("same_district");
  });

  it("🔴 연접도 시 단위 union — 진해구 농지 × 의창구에만 연접한 함안군 거주", () => {
    const r = checkFarmingResidenceCompliance(
      [farmland("4812900000")],
      farming({ decedentResidenceSigunguCode: "4873000000" }),
      OPTS,
    );
    expect(r.decedentMatchKind).toBe("adjacent_district");
  });

  it("자치구는 접지 않는다 — 강남구 농지 × 서초구 거주는 same_district 아님", () => {
    const r = checkFarmingResidenceCompliance(
      [farmland("1168000000")],
      farming({ decedentResidenceSigunguCode: "1165000000" }),
      OPTS,
    );
    expect(r.decedentMatchKind).not.toBe("same_district");
  });

  it("다른 시면 여전히 fail — 진해구 농지 × 부산 해운대구 거주", () => {
    const r = checkFarmingResidenceCompliance(
      [farmland("4812900000")],
      farming({ decedentResidenceSigunguCode: "2635000000" }),
      OPTS,
    );
    expect(r.decedentMatchKind).toBe("fail");
    expect(r.decedentAutoMet).toBe(false);
  });

  it("상속인 축도 같은 규칙", () => {
    const r = checkFarmingResidenceCompliance(
      [farmland("4812900000")],
      farming({ heirResidenceSigunguCode: "4812100000" }),
      OPTS,
    );
    expect(r.heirMatchKind).toBe("same_district");
  });
});
