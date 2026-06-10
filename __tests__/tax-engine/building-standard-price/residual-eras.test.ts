/**
 * 연도별 잔가율표 시대별 스킴 anchor (`연도별 잔가율.pdf` 26p 전수 실측, 2026-06-11)
 *
 * 3개 멤버십 시대(구조→내용연수) + 내용연수 버킷·연도별 잔존율(0.20↔0.10) 전환을 고정.
 *   - 멤버십: 2001~2002(3그룹 40/30/20) / 2003~2012(era-B) / 2013~2026(era-C, +10년)
 *   - 잔존율: 50·40년 2016~ 0.10 / 30년 2006~ 0.10 / 20년 2004~ 0.10 (그 전 0.20)
 * 모든 기대값은 PDF 표 셀 직접 판독 또는 선형식 손계산.
 */
import { describe, it, expect } from "vitest";
import {
  calcResidualRate,
  residualMinByDurable,
} from "../../../lib/tax-engine/data/building-standard-price/residual-rate";
import {
  resolveResidualGroupForYear,
} from "../../../lib/tax-engine/data/building-standard-price/structure-group-map";

describe("멤버십 시대 — 구조→잔가율 그룹(내용연수) 변천", () => {
  it("철근콘크리트조(rc): 3그룹 I(40) → era-B II(40) → era-C I(50)", () => {
    expect(resolveResidualGroupForYear("rc", 2002)).toBe("I"); // 3그룹 40년
    expect(resolveResidualGroupForYear("rc", 2003)).toBe("II"); // era-B 40년
    expect(resolveResidualGroupForYear("rc", 2012)).toBe("II");
    expect(resolveResidualGroupForYear("rc", 2013)).toBe("I"); // era-C 50년
    expect(resolveResidualGroupForYear("rc", 2026)).toBe("I");
  });
  it("통나무조(solid_wood): 3그룹 I(40) → era-B I(50) → era-C I(50)", () => {
    expect(resolveResidualGroupForYear("solid_wood", 2002)).toBe("I");
    expect(resolveResidualGroupForYear("solid_wood", 2003)).toBe("I"); // 50년 버킷 2003 신설
    expect(resolveResidualGroupForYear("solid_wood", 2013)).toBe("I");
  });
  it("연와조(brick): 3그룹 II(30) → era-B III(30) → era-C II(40)", () => {
    expect(resolveResidualGroupForYear("brick", 2002)).toBe("II");
    expect(resolveResidualGroupForYear("brick", 2012)).toBe("III"); // era-B 30년
    expect(resolveResidualGroupForYear("brick", 2013)).toBe("II"); // era-C 40년
  });
  it("시멘트블록조(cement_block): 3그룹 III(20) → era-B IV(20) → era-C III(30)", () => {
    expect(resolveResidualGroupForYear("cement_block", 2002)).toBe("III");
    expect(resolveResidualGroupForYear("cement_block", 2012)).toBe("IV"); // era-B 20년
    expect(resolveResidualGroupForYear("cement_block", 2013)).toBe("III"); // era-C 30년
  });
  it("철파이프조(steel_pipe): 전 시대 20년(3그룹 III / era-B·C IV)", () => {
    expect(resolveResidualGroupForYear("steel_pipe", 2002)).toBe("III"); // 3그룹 20년
    expect(resolveResidualGroupForYear("steel_pipe", 2012)).toBe("IV"); // era-B 20년
    expect(resolveResidualGroupForYear("steel_pipe", 2026)).toBe("IV"); // era-C 20년
  });
  it("황토조(ocher): 3그룹 II(30) → era-B III(30) → era-C III(30) 유지", () => {
    expect(resolveResidualGroupForYear("ocher", 2002)).toBe("II");
    expect(resolveResidualGroupForYear("ocher", 2012)).toBe("III");
    expect(resolveResidualGroupForYear("ocher", 2026)).toBe("III");
  });
});

describe("잔존율(최저잔가율) 버킷·연도 전환", () => {
  it("50·40년: 2015년까지 0.20 → 2016년부터 0.10", () => {
    expect(residualMinByDurable(50, 2015)).toBe(0.2);
    expect(residualMinByDurable(50, 2016)).toBe(0.1);
    expect(residualMinByDurable(40, 2015)).toBe(0.2);
    expect(residualMinByDurable(40, 2016)).toBe(0.1);
  });
  it("30년: 2005년까지 0.20 → 2006년부터 0.10", () => {
    expect(residualMinByDurable(30, 2005)).toBe(0.2);
    expect(residualMinByDurable(30, 2006)).toBe(0.1);
  });
  it("20년: 2003년까지 0.20 → 2004년부터 0.10", () => {
    expect(residualMinByDurable(20, 2003)).toBe(0.2);
    expect(residualMinByDurable(20, 2004)).toBe(0.1);
  });
});

describe("PDF 표 셀 직접 판독 — 잔가율 값 고정", () => {
  // calcResidualRate(group, 경과, 평가연도). group은 해당 연도 버킷(I=50/II=40/III=30/IV=20, ≤2002는 I=40/II=30/III=20)
  it("2026 I(50)·잔존0.10: 신축2021(경과5)=0.910 / 1976이하=0.100", () => {
    expect(calcResidualRate("I", 5, 2026)).toBe(0.91); // 표 2026 I 2021
    expect(calcResidualRate("I", 50, 2026)).toBe(0.1); // 표 1976이하
  });
  it("2014 I(50)·잔존0.20: 신축2013(경과1)=0.984 / 신축2000(경과14)=0.776 / 1964이하=0.200", () => {
    expect(calcResidualRate("I", 1, 2014)).toBe(0.984); // 표 2014 I 2013
    expect(calcResidualRate("I", 14, 2014)).toBe(0.776); // 표 2014 I 2000
    expect(calcResidualRate("I", 50, 2014)).toBe(0.2); // 표 1964이하
  });
  it("2008 I(50)·잔존0.20: 신축2000(경과8)=0.872 / 1958이하=0.200", () => {
    expect(calcResidualRate("I", 8, 2008)).toBe(0.872); // 표 2008 I 2000
    expect(calcResidualRate("I", 50, 2008)).toBe(0.2);
  });
  it("2003 III(30)·잔존0.20: 신축1980(경과23)=0.3867 / 1973이하=0.2000", () => {
    expect(calcResidualRate("III", 23, 2003)).toBe(0.3867); // 표 2003 III 1980
    expect(calcResidualRate("III", 30, 2003)).toBe(0.2); // 표 1973이하
  });
  it("2006 III(30)·잔존0.10: 신축1980(경과26)=0.220 / 1976이하=0.100", () => {
    expect(calcResidualRate("III", 26, 2006)).toBe(0.22); // 표 2006 III 1980
    expect(calcResidualRate("III", 30, 2006)).toBe(0.1); // 표 1976이하
  });
  it("2003 IV(20)·잔존0.20: 1983이하=0.20 / 2004 IV(20)·잔존0.10: 1984이하=0.10", () => {
    expect(calcResidualRate("IV", 20, 2003)).toBe(0.2); // 표 2003 IV 1983이하
    expect(calcResidualRate("IV", 20, 2004)).toBe(0.1); // 표 2004 IV 1984이하
    expect(calcResidualRate("IV", 19, 2004)).toBe(0.145); // 표 2004 IV 1985
  });
  it("2001 3그룹(2001 잔가율표 실측 보존): I(40)경과3=0.94 / II(30)경과1=0.9733 / III(20)경과1=0.96", () => {
    expect(calcResidualRate("I", 3, 2001)).toBe(0.94);
    expect(calcResidualRate("II", 1, 2001)).toBe(0.9733);
    expect(calcResidualRate("III", 1, 2001)).toBe(0.96);
  });
});

describe("rc 동일 건물의 평가연도별 잔가율(멤버십+잔존율 복합)", () => {
  // 철근콘크리트조, 신축 1990. 멤버십·내용연수·잔존율이 모두 연도별로 달라짐.
  const rcRate = (year: number, elapsed: number) =>
    calcResidualRate(resolveResidualGroupForYear("rc", year), elapsed, year);
  it("2001 3그룹 I(40·0.20)·경과11 = 0.78", () => {
    expect(rcRate(2001, 11)).toBe(0.78); // 1-11×0.02
  });
  it("2012 era-B II(40·0.20)·경과22 = 0.56", () => {
    expect(rcRate(2012, 22)).toBe(0.56); // 1-22×0.02
  });
  it("2013 era-C I(50·0.20)·경과23 = 0.632", () => {
    expect(rcRate(2013, 23)).toBe(0.632); // 1-23×0.016
  });
  it("2016 era-C I(50·0.10)·경과26 = 0.532", () => {
    expect(rcRate(2016, 26)).toBe(0.532); // 1-26×0.018
  });
});
