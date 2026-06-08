import { describe, it, expect } from "vitest";
import {
  parseResidentNumber,
  isCompleteResidentNumber,
} from "@/lib/calc/resident-number";

describe("parseResidentNumber — 앞 7자리 생년월일·성별 도출", () => {
  it("RRN-01 1900년대 남성 (코드 1)", () => {
    // 630701-1XXXXXX → 1963-07-01, 남
    expect(parseResidentNumber("630701-1578991")).toEqual({
      birthDate: "1963-07-01",
      gender: "male",
    });
  });

  it("RRN-02 1900년대 여성 (코드 2) — 이미지 예시", () => {
    // 630701-2578991 → 1963-07-01, 여
    expect(parseResidentNumber("630701-2578991")).toEqual({
      birthDate: "1963-07-01",
      gender: "female",
    });
  });

  it("RRN-03 2000년대 남성 (코드 3)", () => {
    expect(parseResidentNumber("050301-3123456")).toEqual({
      birthDate: "2005-03-01",
      gender: "male",
    });
  });

  it("RRN-04 2000년대 여성 (코드 4)", () => {
    expect(parseResidentNumber("101231-4123456")).toEqual({
      birthDate: "2010-12-31",
      gender: "female",
    });
  });

  it("RRN-05 1900년대 외국인 남성 (코드 5)", () => {
    expect(parseResidentNumber("880815-5123456")).toEqual({
      birthDate: "1988-08-15",
      gender: "male",
    });
  });

  it("RRN-06 2000년대 외국인 여성 (코드 8)", () => {
    expect(parseResidentNumber("030620-8123456")).toEqual({
      birthDate: "2003-06-20",
      gender: "female",
    });
  });

  it("RRN-07 1800년대 (코드 9·0)", () => {
    expect(parseResidentNumber("991231-9123456")?.birthDate).toBe("1899-12-31");
    expect(parseResidentNumber("000101-0123456")?.birthDate).toBe("1800-01-01");
    expect(parseResidentNumber("000101-0123456")?.gender).toBe("female");
  });

  it("RRN-08 하이픈·공백 없어도 파싱 (앞 7자리만 있으면 충분)", () => {
    expect(parseResidentNumber("6307012")).toEqual({
      birthDate: "1963-07-01",
      gender: "female",
    });
  });

  it("RRN-09 뒷 6자리 체크섬은 검증하지 않음 (앞 7자리만 사용)", () => {
    // 뒷자리가 모두 0이어도 (체크섬 불일치) 파싱 성공
    expect(parseResidentNumber("630701-2000000")).toEqual({
      birthDate: "1963-07-01",
      gender: "female",
    });
  });

  it("RRN-10 윤년 2월 29일 유효", () => {
    // 2000년대 코드 3, 00년 = 2000(윤년) → 02-29 유효
    expect(parseResidentNumber("000229-3123456")?.birthDate).toBe("2000-02-29");
  });

  it("RRN-11 평년 2월 29일은 무효 → null", () => {
    // 코드 1 → 1999년(평년) 02-29 없음
    expect(parseResidentNumber("990229-1123456")).toBeNull();
  });

  it("RRN-12 잘못된 월(13)·일(00) → null", () => {
    expect(parseResidentNumber("631301-1234567")).toBeNull();
    expect(parseResidentNumber("630700-1234567")).toBeNull();
  });

  it("RRN-13 7자리 미만 → null", () => {
    expect(parseResidentNumber("630701")).toBeNull();
    expect(parseResidentNumber("")).toBeNull();
  });

  it("RRN-14 알 수 없는 성별코드는 정의상 발생 불가 (0~9 모두 매핑) — 빈 입력만 null", () => {
    // 0~9 전부 세기 매핑되므로 코드 자체로 null 되는 경우는 없음.
    expect(parseResidentNumber("630701-6000000")?.gender).toBe("female");
  });
});

describe("isCompleteResidentNumber — 13자리 완전성", () => {
  it("RRN-15 13자리 숫자 true", () => {
    expect(isCompleteResidentNumber("630701-2578991")).toBe(true);
    expect(isCompleteResidentNumber("6307012578991")).toBe(true);
  });

  it("RRN-16 13자리 미만 false", () => {
    expect(isCompleteResidentNumber("6307012")).toBe(false);
    expect(isCompleteResidentNumber("")).toBe(false);
  });
});
