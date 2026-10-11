/**
 * 조정대상지역 데이터·매처 anchor — 1세대1주택 코드 리뷰 PR2 (G7-2 · G7-3 · G7-4 · G7-7).
 *
 * 근거(원문 확인일 2026-10-11)
 *  - G7-2: 국토교통부 2022.6.30. 주거정책심의위원회 보도자료(korea.kr 정책브리핑 newsId=148903052) —
 *          대부동동·대부남동·대부북동·선감동·풍도동은 「관보 게재가 완료되는 다음달 5일 0시부터」 해제(공고 제2022-883호, 2022.7.5.).
 *          2020.6.19. 지정은 안산시 전역(제외 단서 없음).
 *  - G7-3: 행안부 법정동코드 전체자료 — 1213025000 여수시 돌산읍 [존재] / 4613025000 [폐지]. 순천 승주읍·광양 봉강면도 같다.
 *  - G7-4: 행안부 법정동코드 전체자료 — 8쌍 모두 구(면)코드 [폐지] / 현행(읍)코드 [존재], 하위 리 목록 동일.
 *  - G7-7: 「소득세법 시행령」 제154조제2항 표 4호 · 국토교통부공고 제2020-828호 현황 주(세종 예정지역 한함).
 */
import { describe, it, expect } from "vitest";
import {
  isRegulatedByBjdCode,
  governingDesignationStart,
  designatedDistrictsForCode,
} from "@/lib/tax-engine/data/regulated-areas";
import { checkRegulatedArea } from "@/lib/regulated-area";

describe("G7-2 — 대부도 5개 동 제외는 2022-07-05부터", () => {
  const DAEBU = ["4127311000", "4127311100", "4127311200", "4127311300", "4127311400"];
  it.each(DAEBU)("%s: 2020-06-19·2022-07-04 지정 / 2022-07-05 제외", (code) => {
    expect(isRegulatedByBjdCode(code, "2020-06-19").isRegulated).toBe(true);
    expect(isRegulatedByBjdCode(code, "2022-07-04").isRegulated).toBe(true);
    const after = isRegulatedByBjdCode(code, "2022-07-05");
    expect(after.isRegulated).toBe(false);
    expect(after.basis).toContain("제외");
    expect(governingDesignationStart(code, "2021-03-01")).toBe("2020-06-19");
  });
  it("긍정 짝: 같은 구의 비제외 동(고잔동 4127310100)은 2022-07-05에도 지정", () => {
    expect(isRegulatedByBjdCode("4127310100", "2022-07-05").isRegulated).toBe(true);
  });
});

describe("G7-3 — 현행 통합 코드(12)의 읍면 제외가 구 코드(46)와 같다", () => {
  const D = "2021-06-01";
  it.each([
    ["여수 돌산읍", "1213025000", "4613025000"],
    ["순천 승주읍", "1215025000", "4615025000"],
    ["광양 봉강면", "1219031000", "4623031000"],
  ])("%s: 12 코드 = 46 코드 = 제외(미지정)", (_n, cur, legacy) => {
    expect(isRegulatedByBjdCode(legacy, D).isRegulated).toBe(false);
    const c = isRegulatedByBjdCode(cur, D);
    expect(c.isRegulated).toBe(false);
    expect(c.basis).toContain("제외");
  });
  it("긍정 짝: 지정이 유지되는 여수 소라면은 12·46 모두 지정", () => {
    expect(isRegulatedByBjdCode("4613031000", D).isRegulated).toBe(true);
    expect(isRegulatedByBjdCode("1213031000", D).isRegulated).toBe(true);
  });
  it("긍정 짝: 제외 읍면 코드라도 지정 전(2020-12-17)·해제 후(2022-07-05)는 미지정(날짜 축 불변)", () => {
    expect(isRegulatedByBjdCode("1213031000", "2020-12-17").isRegulated).toBe(false);
    expect(isRegulatedByBjdCode("1213031000", "2022-07-05").isRegulated).toBe(false);
  });
  it("designatedDistrictsForCode: 별칭 코드로도 구 코드와 같은 목록(여기선 둘 다 빈 목록)", () => {
    expect(designatedDistrictsForCode("1213025000")).toEqual(designatedDistrictsForCode("4613025000"));
  });
});

describe("G7-4 — 읍 승격으로 법정동코드가 바뀐 같은 땅은 결론이 같다", () => {
  const EXCLUDED: [string, string, string][] = [
    ["처인 모현", "4146125300", "4146131000"],
    ["처인 양지", "4146126200", "4146136000"],
    ["달성 옥포", "2771026200", "2771034000"],
    ["달성 유가", "2771025900", "2771037000"],
    ["달성 현풍", "2771026500", "2771036000"],
    ["달성 구지", "2771026800", "2771038000"],
    ["경산 압량", "4729025600", "4729036000"],
  ];
  // 처인구는 2020-06-19~, 달성·경산은 2020-12-18~2022-07-04 — 각 지역의 지정 기간 안 날짜
  const DATE: Record<string, string> = { 처인: "2021-06-01", 달성: "2021-06-01", 경산: "2021-06-01" };
  it.each(EXCLUDED)("%s: 현행 %s도 구 %s처럼 제외", (n, cur, old) => {
    const d = DATE[n.slice(0, 2)];
    expect(isRegulatedByBjdCode(old, d).isRegulated).toBe(false); // 대조
    const r = isRegulatedByBjdCode(cur, d);
    expect(r.isRegulated).toBe(false);
    expect(r.basis).toContain("제외");
  });
  it("대조군: 논공읍(현행=구 코드 2771025300)과 같은 달성군의 지정 읍(화원읍 2771025000)은 지정", () => {
    expect(isRegulatedByBjdCode("2771025300", "2021-06-01").isRegulated).toBe(false);
    expect(isRegulatedByBjdCode("2771025000", "2021-06-01").isRegulated).toBe(true);
  });
  it("기장 일광: 현행 일광읍 코드도 일광면 지정 기간(2018-08-28~12-30)에는 지정, 그 밖에는 미지정", () => {
    expect(isRegulatedByBjdCode("2671031000", "2018-10-01").isRegulated).toBe(true);
    expect(isRegulatedByBjdCode("2671025900", "2018-10-01").isRegulated).toBe(true);
    // 구·현행 코드가 같은 결론 — 2018-08-27(기장군 전역 지정 중)은 둘 다 지정, 2018-12-31(전부 해제)은 둘 다 미지정
    for (const code of ["2671031000", "2671025900"]) {
      expect(isRegulatedByBjdCode(code, "2018-08-27").isRegulated).toBe(true);
      expect(isRegulatedByBjdCode(code, "2018-12-31").isRegulated).toBe(false);
    }
  });
});

describe("G7-7 — 단층 시(세종) 주소 문자열 폴백은 「미지정(high)」으로 단정하지 않는다", () => {
  it("보람동(예정지역 동) 2021-06-01 → 지정 + 확인 필요(medium)", () => {
    const r = checkRegulatedArea("세종특별자치시 보람동 641", "2021-06-01");
    expect(r.isRegulated).toBe(true);
    expect(r.confidence).toBe("medium");
  });
  it("조치원읍(비예정지역 읍) 2021-06-01 → 지정으로 만들지 않는다(미지정, high 아님)", () => {
    const r = checkRegulatedArea("세종특별자치시 조치원읍 원리 1", "2021-06-01");
    expect(r.isRegulated).toBe(false);
    expect(r.confidence).not.toBe("high");
  });
  it("도로명 주소(동·읍면 어절 없음) → 모름=지정 + 확인 필요(medium)", () => {
    const r = checkRegulatedArea("세종특별자치시 한누리대로 2130", "2021-06-01");
    expect(r.isRegulated).toBe(true);
    expect(r.confidence).toBe("medium");
  });
  it("해제 후(2023-01-01)는 미지정(날짜 축 불변)", () => {
    expect(checkRegulatedArea("세종특별자치시 보람동 641", "2023-01-01").isRegulated).toBe(false);
  });
  it("지정 전(2017-08-02)은 미지정", () => {
    expect(checkRegulatedArea("세종특별자치시 보람동 641", "2017-08-02").isRegulated).toBe(false);
  });
  it("대조: 시군구 어절이 있는 광주 동구는 지정 high(기존 경로 불변)", () => {
    const r = checkRegulatedArea("광주광역시 동구 1", "2021-06-01");
    expect(r.isRegulated).toBe(true);
    expect(r.confidence).toBe("high");
  });
  it("대조: 코드 경로(보람동 3611010300)는 지정 high — 주소 경로와 결론(지정)이 같다", () => {
    const r = isRegulatedByBjdCode("3611010300", "2021-06-01");
    expect(r.isRegulated).toBe(true);
    expect(r.confidence).toBe("high");
  });
});
