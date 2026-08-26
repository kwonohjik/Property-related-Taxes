/**
 * F-37 · F-38 anchor — 국세청 고시 원문 실측으로 era-B(2003~2015) 구조·잔가율 사실을 고정한다.
 *
 * 리뷰 시점에는 고시 본문을 확보하지 못해 두 건 다 「어느 쪽이 옳은지 판정 보류」였다.
 * 2026-08-27 사용자가 과거 연도 고시 7건을 제공해 **원문으로 판정**했다.
 *
 * ── 실측 근거(원문 조문 위치까지 명시)
 *   · 국세청고시 제2013-2호(2012-12-31 고시, 2013년 적용)
 *       제7조 구조지수 4행(100): 철근콘크리트조·석조·PC조·목조·**라멘조·ALC조**
 *                    5행( 90): 연와조·시멘트벽돌조·황토조·철골조·**스틸하우스조**·보강콘크리트조·
 *                              시멘트블록조·**보강블록조·와이어패널조**
 *                    6행( 80): 철골조 중 조립식패널·**조립식패널조**
 *                    8행( 50): 석회 및 흙벽돌조·돌담 및 토담조·철파이프조·**컨테이너 건물**
 *       제10조③ 그룹별 건물구조
 *            I(50년) 통나무조·철골(철골철근)콘크리트조
 *           II(40년) 철근콘크리트조·석조·프리캐스트 콘크리트조·목구조·라멘조
 *          III(30년) 연와조·보강콘크리트조·시멘트벽돌조·철골조·스틸하우스조·황토조·목조·
 *                    **ALC조·보강블록조·와이어패널조**
 *           IV(20년) 시멘트블록조·경량철골조·철파이프조·석회 및 흙벽돌조·돌담 및 토담조·
 *                    **조립식패널조·컨테이너건물**·기계식 주차전용빌딩
 *       제10조① 최종잔존가치율: I·II = 20% / III·IV = 10%
 *   · 2014년 고시 제7조 4행(100)에 **스틸하우스조가 굵게 추가**되고 5행(90)에서 빠졌다.
 *   · 국세청고시 제2011-23호 제10조③에는 위 신공법 5종이 **전무**하다(2013년 신설).
 *   · 2010년 고시(제2009-112호) 5.구조지수 5행(80)에 **「철골조 중 조립식 패널」이 실재**하고,
 *     같은 고시 용어의 정의 (15)는 「조립식 패널 건물(**철골조를 제외함**)·컨테이너 건물 등은
 *     경량철골조로 분류한다」고 정해 EPS 패널이 철골조 계열임을 반대해석으로 뒷받침한다.
 *
 * ── F-38 판정: **데이터가 옳고 주석이 틀렸다**
 *   주석(structure-index.ts:14)은 2013년 모호 셀을 「석조·스틸하우스조 … 4행(100)에 포함」으로
 *   해소했다고 적었으나, 원문은 스틸하우스조를 **5행(90)** 에 둔다. 「인접연도 정합」 논거는
 *   석조에만 성립한다(스틸하우스조는 2013=90 → 2014=100 이동이 고시로 확인된다).
 *
 * ── F-37 판정: **추정값은 전부 옳았고, 주석의 사실 서술이 틀렸다**
 *   `residual-rate.ts:26-27`의 「해당연도 구조지수표에도 부재해 선택 불가 … 실무 영향 없음」은
 *   거짓이다(위 2010·2013 구조지수표). 다만 「잔가율표 헤더 미수록」은 **철골조 중 조립식패널에
 *   한해서만** 참이고, 나머지 5종은 2013년부터 제10조③에 명시 수록됐다.
 *   era-C −10 추정이 낸 값은 고시와 **전건 일치**하므로 **세액은 변하지 않는다**.
 *
 * 법령: 「소득세법」 제99조 제1항 제1호 나목 · 「상속세 및 증여세법」 제61조 제1항 제2호 위임 하의
 *   국세청 「건물 기준시가 계산방법」 고시(연도별).
 */
import { describe, it, expect } from "vitest";
import {
  resolveStructureIndex,
  resolveResidualGroupEraB,
  durableForGroup,
  residualMinByDurable,
} from "@/lib/tax-engine/data/building-standard-price";

/** era-B 내용연수 — 그룹 레터를 연도 기준 내용연수로 환원 */
const durableEraB = (key: string, year: number) =>
  durableForGroup(resolveResidualGroupEraB(key), year);

describe("F-38 2013년 구조지수 — 고시 제2013-2호 제7조 (원문 실측)", () => {
  it("스틸하우스조는 2013년에 5행(90)이다 — 주석의 「4행(100)」이 틀렸다", () => {
    expect(resolveStructureIndex(2013, "steel_house")).toBe(90);
  });

  it("2013 → 2014 에 100 으로 이동한다 — 고시 원문이 굵게 표시한 개정", () => {
    expect(resolveStructureIndex(2013, "steel_house")).toBe(90);
    expect(resolveStructureIndex(2014, "steel_house")).toBe(100);
  });

  it("석조는 2013·2014 모두 100 — 「인접연도 정합」 논거는 석조에만 성립한다", () => {
    expect(resolveStructureIndex(2013, "stone")).toBe(100);
    expect(resolveStructureIndex(2014, "stone")).toBe(100);
  });

  it("2013년 신공법 구조지수 — 제7조 각 행", () => {
    expect(resolveStructureIndex(2013, "alc")).toBe(100); // 4행
    expect(resolveStructureIndex(2013, "reinforced_block")).toBe(90); // 5행
    expect(resolveStructureIndex(2013, "wire_panel")).toBe(90); // 5행
    expect(resolveStructureIndex(2013, "prefab_panel")).toBe(80); // 6행
    expect(resolveStructureIndex(2013, "container")).toBe(50); // 8행
  });

  it("「철골조 중 조립식패널」은 2010년에도 선택 가능하다 — 「선택 불가」 주석의 반증", () => {
    expect(resolveStructureIndex(2010, "steel_frame_eps")).toBe(80);
  });
});

describe("F-37 era-B 내용연수 — 고시 제10조③ 대조 (추정값이 옳았다)", () => {
  it.each([
    ["alc", 30],
    ["reinforced_block", 30],
    ["wire_panel", 30],
    ["prefab_panel", 20],
    ["container", 20],
  ])("%s = %i년 — 2013·2014 고시 제10조③ 명시", (key, years) => {
    expect(durableEraB(key, 2013)).toBe(years);
    expect(durableEraB(key, 2014)).toBe(years);
  });

  it("고시 열거 구조도 함께 고정한다 — 그룹 경계가 흔들리면 신공법 추정도 흔들린다", () => {
    expect(durableEraB("solid_wood", 2013)).toBe(50); // I
    expect(durableEraB("rc", 2013)).toBe(40); // II
    expect(durableEraB("steel_frame", 2013)).toBe(30); // III
    expect(durableEraB("steel_house", 2013)).toBe(30); // III (구조지수 90 과 무관)
    expect(durableEraB("cement_block", 2013)).toBe(20); // IV
  });

  it("철골조 중 조립식패널은 철골조와 같은 30년 — 2010 고시 정의 (15) 반대해석", () => {
    expect(durableEraB("steel_frame_eps", 2013)).toBe(durableEraB("steel_frame", 2013));
  });

  it("2013년 최종잔존가치율 I·II = 20% / III·IV = 10% — 제10조①", () => {
    expect(residualMinByDurable(50, 2013)).toBe(0.2);
    expect(residualMinByDurable(40, 2013)).toBe(0.2);
    expect(residualMinByDurable(30, 2013)).toBe(0.1);
    expect(residualMinByDurable(20, 2013)).toBe(0.1);
  });
});
