/**
 * 조정대상지역 주소 문자열 판정 — 시·도 약칭·명칭 변경·우편번호·붙여쓰기 정규화(A)와 알아볼 수 없는 주소의 불리 판정(B).
 * 계획서 `docs/00-pm/regulated-area-abbrev-address.plan.md` §1(실측)·§3.
 *
 * 종전: `parseAddressRegion`이 첫 어절을 데이터 시·도명과 정확히 비교 → 수록 15개 시·도 모두 약칭(「서울」「경기」「충북」…)이면
 * `false · low · 「X는 데이터 미수록」` — 강남 1주택 거주 0이 비과세로, 2주택 중과가 빠졌다(⑧ 0건).
 */
import { describe, it, expect } from "vitest";
import { REGULATED_REGIONS, canonicalSidoName, leadingSidoFullName } from "@/lib/tax-engine/data/regulated-areas";
import { checkRegulatedArea, parseAddressRegion } from "@/lib/regulated-area";
import { deriveSigunguFromAddress } from "@/lib/utils/derive-sigungu";

const ABBR: Record<string, string[]> = {
  서울특별시: ["서울", "서울시"], 부산광역시: ["부산", "부산시"], 대구광역시: ["대구", "대구시"], 인천광역시: ["인천", "인천시"],
  광주광역시: ["광주"], 대전광역시: ["대전", "대전시"], 울산광역시: ["울산", "울산시"], 세종특별자치시: ["세종", "세종시"],
  경기도: ["경기"], 충청북도: ["충북"], 충청남도: ["충남"], 경상북도: ["경북"], 경상남도: ["경남"], 전라북도: ["전북", "전북특별자치도"],
  전라남도: ["전남"],
};

describe("A — 수록 15개 시·도: 약칭·명칭 변경 = 정식 명칭과 같은 판정", () => {
  const sidos = [...new Set(REGULATED_REGIONS.map((r) => r.name.split(/\s+/)[0]))];
  it("수록 시·도 목록이 약칭 표와 같다(데이터에 시·도가 늘면 약칭을 추가하라)", () => {
    expect(new Set(sidos)).toEqual(new Set(Object.keys(ABBR)));
  });
  for (const sido of Object.keys(ABBR)) {
    it(`${sido} — ${ABBR[sido].join("·")}`, () => {
      const reg = REGULATED_REGIONS.find((r) => r.name.startsWith(sido + " ") && r.designations.length) ?? REGULATED_REGIONS.find((r) => r.name === sido)!;
      const date = reg.designations[0].designatedDate;
      const rest = reg.name.slice(sido.length).trim();
      const full = checkRegulatedArea(`${sido} ${rest} 테스트로 1`.replace(/\s+/g, " "), date);
      expect(full.isRegulated).toBe(true);
      for (const v of ABBR[sido]) {
        expect(checkRegulatedArea(`${v} ${rest} 테스트로 1`.replace(/\s+/g, " "), date)).toEqual(full);
      }
    });
  }
});

describe("A — 형식 변형", () => {
  const FULL = checkRegulatedArea("서울특별시 강남구 테헤란로 1", "2020-06-01");
  it("우편번호 접두 · 붙여쓰기", () => {
    expect(FULL).toMatchObject({ isRegulated: true, confidence: "high" });
    for (const a of ["(06236) 서울특별시 강남구 테헤란로 1", "[06236] 서울특별시 강남구 테헤란로 1", "06236 서울특별시 강남구 테헤란로 1", "서울특별시강남구 테헤란로 1"]) {
      expect(checkRegulatedArea(a, "2020-06-01"), a).toEqual(FULL);
    }
  });
  it("「광주시」는 경기도 광주시와 겹쳐 광주광역시로 보지 않는다 · 「광주」만 광주광역시", () => {
    expect(canonicalSidoName("광주")).toBe("광주광역시");
    expect(canonicalSidoName("광주시")).toBeNull();
  });
  it("붙여쓰기는 정식 명칭만 뗀다(약칭 접두는 오탐이 커서 보지 않는다)", () => {
    expect(leadingSidoFullName("서울특별시강남구")).toBe("서울특별시");
    expect(leadingSidoFullName("서울강남구")).toBeNull();
    expect(leadingSidoFullName("서울특별시")).toBeNull();
  });
  it("시군구 파생(토지 필지)은 그대로", () => {
    expect(parseAddressRegion("서울 강남구 역삼동 1")).toEqual({ sido: "서울특별시", sigungu: "강남구" });
    expect(deriveSigunguFromAddress("서울 강남구 역삼동 1")).toBe("강남구");
    expect(deriveSigunguFromAddress("경기 성남시 분당구 1")).toBe(deriveSigunguFromAddress("경기도 성남시 분당구 1"));
  });
});

describe("B — 시·도를 알아볼 수 없는 주소", () => {
  it("그날 지정된 곳이 있으면 조정대상지역으로 보고 계산 + 직접 확인(low)", () => {
    const r = checkRegulatedArea("강남구 테헤란로 1", "2020-06-01");
    expect(r).toMatchObject({ isRegulated: true, confidence: "low" });
    expect(r.basis).toContain("시·도를 알아볼 수 없어 조정대상지역으로 보고 계산합니다");
    expect(checkRegulatedArea("테스트 주소 1", "2026-02-16").isRegulated).toBe(true);
  });
  it("그날 지정된 곳이 하나도 없으면(2016.11.3. 첫 지정 전) 아님이 확실하다(high)", () => {
    expect(checkRegulatedArea("테스트 주소 1", "2015-01-01")).toMatchObject({ isRegulated: false, confidence: "high" });
  });
  it("아는 시·도인데 데이터에 없는 곳(제주·강원)은 종전대로 아님 + 직접 확인(low · 미수록 시도 안전장치)", () => {
    for (const a of ["제주특별자치도 제주시 1", "제주 제주시 1", "강원도 춘천시 1", "강원특별자치도 춘천시 1"]) {
      expect(checkRegulatedArea(a, "2020-06-01"), a).toMatchObject({ isRegulated: false, confidence: "low" });
    }
  });
});
