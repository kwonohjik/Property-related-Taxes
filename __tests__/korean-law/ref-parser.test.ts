/**
 * ref-parser 단위 테스트
 *
 * Plan SC: FR-04 refLaws/refPrecedents 구조화 배열 반환
 */

import { describe, it, expect } from "vitest";
import { parseLawRefs, parsePrecedentRefs } from "@/lib/korean-law/parsers/ref-parser";

describe("parseLawRefs", () => {
  it("단일 조문 파싱", () => {
    const refs = parseLawRefs("소득세법 제94조");
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0].lawName).toBe("소득세법");
    expect(refs[0].articleNo).toBe(94);
    expect(refs[0].isPrior).toBe(false);
  });

  it("'구' 접두사 인식", () => {
    const refs = parseLawRefs("구 소득세법 제94조");
    expect(refs[0].isPrior).toBe(true);
    expect(refs[0].lawName).toBe("소득세법");
  });

  it("제N조의M 가지번호 파싱", () => {
    const refs = parseLawRefs("소득세법 제18조의2");
    expect(refs[0].articleNo).toBe(18);
    expect(refs[0].articleSubNo).toBe(2);
  });

  it("항·호 파싱", () => {
    const refs = parseLawRefs("소득세법 제94조 제1항 제1호");
    expect(refs[0].articleNo).toBe(94);
    expect(refs[0].hangNo).toBe(1);
    expect(refs[0].hoNo).toBe(1);
  });

  it("여러 법령 연달아 있을 때 각각 파싱", () => {
    const refs = parseLawRefs("소득세법 제94조, 민법 제103조");
    const laws = new Set(refs.map((r) => r.lawName));
    expect(laws.has("소득세법")).toBe(true);
    expect(laws.has("민법")).toBe(true);
  });

  it("같은 법령 내 여러 조문 — 법령명 상속", () => {
    const refs = parseLawRefs("소득세법 제94조, 제95조, 제98조");
    expect(refs.length).toBeGreaterThanOrEqual(3);
    expect(refs.every((r) => r.lawName === "소득세법")).toBe(true);
  });

  it("빈 입력은 빈 배열 반환", () => {
    expect(parseLawRefs("")).toEqual([]);
    expect(parseLawRefs(null)).toEqual([]);
    expect(parseLawRefs(undefined)).toEqual([]);
  });

  it("실제 법제처 응답 샘플 — 복합 참조조문", () => {
    const raw =
      "구 소득세법 제94조 제1항 제1호, 제95조 제1항, 제98조, 제161조 제1항 제5호";
    const refs = parseLawRefs(raw);
    expect(refs.length).toBeGreaterThanOrEqual(4);
    // 모두 "소득세법"이어야
    const uniqueLaws = new Set(refs.map((r) => r.lawName));
    expect(uniqueLaws).toEqual(new Set(["소득세법"]));
    // 모두 isPrior=true
    expect(refs.every((r) => r.isPrior)).toBe(true);
  });
});

describe("parsePrecedentRefs", () => {
  it("표준 판례 참조 형식", () => {
    const refs = parsePrecedentRefs("대법원 2020. 3. 26. 선고 2018두56077 판결");
    expect(refs.length).toBe(1);
    expect(refs[0].court).toBe("대법원");
    expect(refs[0].date).toBe("2020-03-26");
    expect(refs[0].caseNo).toBe("2018두56077");
    expect(refs[0].judgmentType).toBe("판결");
  });

  it("densify 후 형식 (선고·판결 생략)", () => {
    const refs = parsePrecedentRefs("대법원 2020.3.26. 2018두56077");
    expect(refs.length).toBe(1);
    expect(refs[0].date).toBe("2020-03-26");
    expect(refs[0].caseNo).toBe("2018두56077");
  });

  it("여러 판례 쉼표 구분", () => {
    const refs = parsePrecedentRefs(
      "대법원 2020. 3. 26. 선고 2018두56077 판결, 대법원 2018. 5. 15. 선고 2017두46066 판결"
    );
    expect(refs.length).toBe(2);
    expect(refs[0].caseNo).toBe("2018두56077");
    expect(refs[1].caseNo).toBe("2017두46066");
  });

  it("헌법재판소 결정", () => {
    const refs = parsePrecedentRefs("헌법재판소 2020. 7. 16. 2018헌바120 결정");
    expect(refs.length).toBe(1);
    expect(refs[0].court).toBe("헌법재판소");
    expect(refs[0].judgmentType).toBe("결정");
  });

  it("중복 제거 (같은 법원+사건번호)", () => {
    const refs = parsePrecedentRefs(
      "대법원 2020.3.26. 2018두56077, 대법원 2020. 3. 26. 선고 2018두56077 판결"
    );
    expect(refs.length).toBe(1);
  });

  it("빈 입력", () => {
    expect(parsePrecedentRefs("")).toEqual([]);
    expect(parsePrecedentRefs(null)).toEqual([]);
  });
});
