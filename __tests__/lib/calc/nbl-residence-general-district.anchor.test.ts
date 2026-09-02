/**
 * anchor: 재촌 판정의 「구」는 자치구뿐 — 일반구(행정구)는 상위 시가 단위다
 *
 * 발견 E2-02·V3-c·V3-b·V3-d (docs/reviews/nbl-code-review-2026-09.md)
 *
 * 「소득세법 시행령」 §153③1호 — 「농지가 소재하는 시(…)ㆍ군ㆍ구(**자치구인 구를 말한다**.
 * 이하 이 항에서 같다)안의 지역」, 같은 항 2호 「제1호의 지역과 **연접한** 시ㆍ군ㆍ구안의 지역」.
 * §168의8②이 「제153조제3항에 따른 농지소재지에 사실상 거주(재촌)」로 이 정의를 그대로 끌어쓴다.
 * 「상속세 및 증여세법 시행령」 §16②1호나도 「구(**자치구를 말한다**)」로 동일하다.
 *
 * 종전에는 5자리 코드를 그대로 비교해 **같은 시 안 다른 일반구** 거주가 탈락했다.
 * 창원시는 좌표를 넣어도 의창구↔진해구가 42.56km라 30km 분기로도 구제되지 않는다.
 * 연접 매트릭스도 구 단위여서 진해구의 인접에 같은 창원시 의창구가 없다.
 */
import { describe, it, expect } from "vitest";
import { computeResidencePeriods, computeResidenceMatchSummary } from "@/lib/tax-engine/non-business-land/residence";
import type { OwnerResidenceHistory } from "@/lib/tax-engine/non-business-land/types";
import { lookupSigungu } from "@/lib/korean-law/sigungu-codes";
import { resolveSigunguUnitCode, resolveAdjacentUnitCodes } from "@/lib/geo/sigungu-unit";

const d = (iso: string) => new Date(iso);

function hist(code: string): OwnerResidenceHistory {
  return {
    sidoName: "경상남도",
    sigunguName: "창원시",
    sigunguCode: code,
    startDate: d("2014-01-01"),
    endDate: d("2024-01-01"),
    hasResidentRegistration: true,
  };
}

/** 프로덕션과 같은 방식으로 연접 코드를 해석 — form-mapper.ts와 동일 */
const adjacentOf = (code: string) =>
  resolveAdjacentUnitCodes(code, (c) => lookupSigungu(c)?.adjacentCodes ?? []);

describe("[E2-02·V3-c] 일반구는 「구」가 아니다 — 상위 시가 재촌 단위", () => {
  it("🔴 창원시 진해구 농지 × 창원시 의창구 거주 → 재촌(§153③1호)", () => {
    // 48129 진해구 / 48121 의창구 — 둘 다 창원시(48120) 소속 일반구.
    const periods = computeResidencePeriods([hist("48121")], { sigunguCode: "48129" }, {
      adjacentSigunguCodes: adjacentOf("48129"),
    });
    expect(periods).toHaveLength(1);
  });

  it("🔴 같은 시 안이면 매칭 근거 echo도 「same」이어야 한다 (연접·30km가 아니다)", () => {
    const s = computeResidenceMatchSummary([hist("48121")], { sigunguCode: "48129" }, {
      adjacentSigunguCodes: adjacentOf("48129"),
    });
    expect(s?.matchType).toBe("same");
  });

  it("🔴 고양시 일산서구 농지 × 고양시 덕양구 거주 → 재촌", () => {
    const periods = computeResidencePeriods([hist("41281")], { sigunguCode: "41287" }, {
      adjacentSigunguCodes: adjacentOf("41287"),
    });
    expect(periods).toHaveLength(1);
  });

  it("🔴 연접은 시 단위로 union — 진해구 농지 × 창원시 의창구에만 연접한 시·군 거주", () => {
    // 4873(함안군)은 의창구(48121)의 인접이지만 진해구(48129)의 인접은 아니다.
    // 「창원시와 연접한 시·군·구」이므로 §153③2호로 재촌이어야 한다.
    const adj = adjacentOf("48129");
    expect(adj).toContain("48730");
    const periods = computeResidencePeriods([hist("48730")], { sigunguCode: "48129" }, {
      adjacentSigunguCodes: adj,
    });
    expect(periods).toHaveLength(1);
  });

  it("자치구는 접지 않는다 — 서울 강남구 농지 × 서초구 거주는 1호 아님 (과대적용 방지)", () => {
    const s = computeResidenceMatchSummary([hist("11650")], { sigunguCode: "11680" }, {
      adjacentSigunguCodes: [],
    });
    expect(s).toBeUndefined();
  });

  it("다른 시면 여전히 미충족 — 창원시 진해구 농지 × 부산 해운대구 거주", () => {
    const periods = computeResidencePeriods([hist("26350")], { sigunguCode: "48129" }, {
      adjacentSigunguCodes: adjacentOf("48129"),
    });
    expect(periods).toHaveLength(0);
  });
});

describe("[leaf] resolveSigunguUnitCode — 자치단체 단위 정규화", () => {
  it("일반구는 상위 시 코드로 접는다", () => {
    expect(resolveSigunguUnitCode("48129")).toBe("48120"); // 창원시 진해구 → 창원시
    expect(resolveSigunguUnitCode("41287")).toBe("41280"); // 고양시 일산서구 → 고양시
    expect(resolveSigunguUnitCode("41111")).toBe("41110"); // 수원시 장안구 → 수원시
  });

  it("자치구·시·군은 그대로", () => {
    expect(resolveSigunguUnitCode("11680")).toBe("11680"); // 서울 강남구(자치구)
    expect(resolveSigunguUnitCode("41150")).toBe("41150"); // 의정부시
    expect(resolveSigunguUnitCode("48730")).toBe("48730"); // 함안군
  });

  it("10자리계도 같은 단위로 접힌다 (상속세 PNU 체계)", () => {
    expect(resolveSigunguUnitCode("4812900000")).toBe("48120");
    expect(resolveSigunguUnitCode("1168000000")).toBe("11680");
  });

  it("이미 접힌 시 코드는 멱등", () => {
    expect(resolveSigunguUnitCode("48120")).toBe("48120");
  });

  it("빈 값·짧은 코드는 그대로 통과 (자동 추정 금지)", () => {
    expect(resolveSigunguUnitCode(undefined)).toBeUndefined();
    expect(resolveSigunguUnitCode("")).toBeUndefined();
    expect(resolveSigunguUnitCode("481")).toBe("481");
  });

  it("자기 자신은 연접 목록에 들어가지 않는다", () => {
    expect(adjacentOf("48129")).not.toContain("48120");
  });
});
