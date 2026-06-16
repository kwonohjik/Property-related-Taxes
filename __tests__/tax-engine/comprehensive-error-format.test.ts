import { describe, it, expect } from "vitest";
import { formatComprehensiveErrors } from "../../lib/calc/comprehensive-error-format";

/**
 * 종합부동산세 Zod 검증 실패 → 사용자 친화 메시지 변환.
 * 핵심 회귀: flatten().fieldErrors는 properties[] 인덱스를 소실하므로
 * issues(path)로 "주택 N" 위치를 복원해야 한다.
 */
describe("formatComprehensiveErrors", () => {
  const BASE = "입력값이 올바르지 않습니다.";

  it("properties 배열 인덱스를 '주택 N'으로 표시 (0-base → 1-base)", () => {
    const msg = formatComprehensiveErrors(
      [{ path: ["properties", 1, "priorAssessedValue"], message: "직전연도 공시가격은 원 단위 정수여야 합니다." }],
      BASE,
    );
    expect(msg.split("\n")[0]).toBe(BASE);
    expect(msg).toContain(
      "• 주택 2 · 직전연도 공시가격(세부담상한): 직전연도 공시가격은 원 단위 정수여야 합니다.",
    );
  });

  it("top-level 필드는 위치 없이 라벨만 + 영문 Zod 메시지 한국어 변환", () => {
    const msg = formatComprehensiveErrors(
      [{ path: ["isOneHouseOwner"], message: "Invalid input: expected boolean, received undefined" }],
      BASE,
    );
    expect(msg).toContain("• 1세대 1주택자 여부: 필수 입력 항목입니다");
    expect(msg).not.toContain("isOneHouseOwner");
  });

  it("영문 'Too small' 메시지를 한국어로 변환 (주택 1 · 전용면적)", () => {
    const msg = formatComprehensiveErrors(
      [{ path: ["properties", 0, "area"], message: "Too small: expected number to be >0" }],
      BASE,
    );
    expect(msg).toContain("주택 1 · 전용면적:");
    expect(msg).not.toContain("Too small");
  });

  it("중첩 객체(임대주택 합산배제) 경로를 ' · '로 연결", () => {
    const msg = formatComprehensiveErrors(
      [{ path: ["properties", 0, "rentalInfo", "currentRent"], message: "임대료는 0원 이상이어야 합니다." }],
      BASE,
    );
    expect(msg).toContain(
      "• 주택 1 · 임대주택 합산배제 정보 · 현재 임대료: 임대료는 0원 이상이어야 합니다.",
    );
  });

  it("별도합산 토지 인덱스 표시", () => {
    const msg = formatComprehensiveErrors(
      [{ path: ["landSeparate", 2, "publicPrice"], message: "Too small: expected number to be >=0" }],
      BASE,
    );
    expect(msg).toContain("별도합산 토지 3 · 공시지가(면적×단가):");
  });

  it("custom refine(상호배타) 메시지를 그대로 보존", () => {
    const msg = formatComprehensiveErrors(
      [
        {
          path: ["previousYearAuto"],
          message:
            "전년도 총세액 직접 입력과 직전연도 공시가격 자동 계산은 동시에 사용할 수 없습니다. 하나만 선택하세요.",
        },
      ],
      BASE,
    );
    expect(msg).toContain("동시에 사용할 수 없습니다");
  });

  it("동일 line 중복 issue는 dedup", () => {
    const dup = { path: ["properties", 0, "area"], message: "Too small: expected number to be >0" };
    const msg = formatComprehensiveErrors([dup, dup], BASE);
    const hits = msg.split("\n").filter((l) => l.includes("전용면적")).length;
    expect(hits).toBe(1);
  });

  it("여러 주택의 오류를 각각 별도 줄로 나열", () => {
    const msg = formatComprehensiveErrors(
      [
        { path: ["properties", 0, "assessedValue"], message: "공시가격은 원 단위 정수여야 합니다." },
        { path: ["properties", 1, "area"], message: "Too small: expected number to be >0" },
      ],
      BASE,
    );
    const lines = msg.split("\n");
    expect(lines).toHaveLength(3); // base + 2
    expect(lines[1]).toContain("주택 1 · 공시가격");
    expect(lines[2]).toContain("주택 2 · 전용면적");
  });
});
