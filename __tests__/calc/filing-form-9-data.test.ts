/**
 * filing-form-9-data anchor — 별지 제9호서식 데이터 어댑터 (FF9-1~18)
 *
 * 종합사례 fixture(comprehensive-case-pdf)로 calcInheritanceTax 실행 → 이미지1·2 값 재현.
 * Plan §8 · Design §9. 단일 진실(buildSummaryTable + result) 검증.
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { buildFilingForm9Data } from "@/lib/calc/filing-form-9-data";
import {
  EXAMPLE_HEIRS,
  EXAMPLE_INPUT,
} from "../tax-engine/inheritance/fixtures/comprehensive-case-pdf.fixture";

const DEATH_DATE = "2023-03-05"; // 이미지1 상속개시일

describe("별지 제9호서식 데이터 어댑터 (FF9-1~18)", () => {
  const result = calcInheritanceTax(EXAMPLE_INPUT);
  const data = buildFilingForm9Data(result, EXAMPLE_HEIRS, DEATH_DATE);
  const v = data.values;

  it("FF9-1: ⑰ 상속세과세가액 = 8,775,000,000", () => {
    expect(v["⑰"]).toBe(8_775_000_000);
  });
  it("FF9-2: ⑱ 상속공제액 = 4,600,000,000", () => {
    expect(v["⑱"]).toBe(4_600_000_000);
  });
  it("FF9-3: ⑳ 과세표준 = 4,175,000,000", () => {
    expect(v["⑳"]).toBe(4_175_000_000);
  });
  it("FF9-4: ㉑ 세율 = 0.5 (50%)", () => {
    expect(v["㉑"]).toBe(0.5);
  });
  it("FF9-5: ㉒ 산출세액 = 1,627,500,000", () => {
    expect(v["㉒"]).toBe(1_627_500_000);
  });
  it("FF9-6: ㉓ 세대생략가산액 = 30,232,198", () => {
    expect(v["㉓"]).toBe(30_232_198);
  });
  it("FF9-7: ㉔ 산출세액(㉒+㉓) = 1,657,732,198", () => {
    expect(v["㉔"]).toBe(1_657_732_198);
  });
  it("FF9-8: ㉙ §28 증여세액공제 = 592,000,000 (⑩c + ⑫c)", () => {
    expect(v["㉙"]).toBe(592_000_000);
  });
  it("FF9-9: ㉝ §69 신고세액공제 = 31,971,966", () => {
    expect(v["㉝"]).toBe(31_971_966);
  });
  it("FF9-10: ㉗ 계 = 623,971,966 (㉘ + ㉝) — 사용자 확정값", () => {
    expect(v["㉗"]).toBe(623_971_966);
  });
  it("FF9-11: ㊳ 납부할세액 = 1,033,760,232", () => {
    expect(v["㊳"]).toBe(1_033_760_232);
  });

  // ── 자기일관성 ──
  it("FF9-12: 자기일관성 ㉔ − ㉗ === ㊳ (V-3·V-2 정합)", () => {
    expect(v["㉔"] - v["㉗"]).toBe(v["㊳"]);
  });
  it("FF9-18: 자기일관성 ⑰ − ⑱ − ⑲ === ⑳ (과세표준 산식)", () => {
    expect(v["⑰"] - v["⑱"] - v["⑲"]).toBe(v["⑳"]);
  });
  it("FF9-자기일관: ㉗ === ㉙ + ㉝ (㉛㉜㉞=0)", () => {
    expect(v["㉗"]).toBe(v["㉙"] + v["㉝"]);
  });
  it("FF9-자기일관: ㉔ === ㉒ + ㉓", () => {
    expect(v["㉔"]).toBe(v["㉒"] + v["㉓"]);
  });

  // ── V-2 해소: ㉟ 면제세액 = 0 (corporate 면제는 ㉙에 포함, 이중계상 0) ──
  it("FF9-16: ㉟ 면제세액 = 0 (corporate §3의2②는 ㉙ §28에 포함 — 이중계상 없음)", () => {
    expect(v["㉟"]).toBe(0);
  });
  it("FF9-17: ㉟ 미중복 → ㉔ − ㉗ + ㉟ === ㊳ (㉟=0이므로 ㉔−㉗과 동일)", () => {
    expect(v["㉔"] - v["㉗"] + v["㉟"]).toBe(v["㊳"]);
  });

  // ── 도출 (식별정보·날짜) ──
  it("FF9-13: 신고기한 도출(말일+6개월, §67①) = 2023-09-30", () => {
    expect(data.filingDueDate).toBe("2023-09-30");
  });
  it("FF9-14: 분납기한 도출(+2개월, §70②) = 2023-11-30", () => {
    expect(data.installmentDueDate).toBe("2023-11-30");
  });
  it("FF9-15: 대표상속인(sortHeirs[0]) 관계 라벨 도출 — 비어있지 않음", () => {
    expect(data.declarant).not.toBeNull();
    expect(data.declarant?.relationLabel.length).toBeGreaterThan(0);
  });
  it("FF9-15b: ⑫ 상속개시일 = 2023-03-05", () => {
    expect(data.deathDate).toBe("2023-03-05");
  });

  // ── 행 빌드 구조 ──
  it("leftRows 18개(⑰~㉞) · rightRows 영리법인면제·납부방법 헤더 포함", () => {
    expect(data.leftRows.length).toBe(18);
    expect(data.leftRows.every((r) => r.column === "left")).toBe(true);
    expect(data.rightRows.some((r) => r.display === "header")).toBe(true);
    expect(data.rightRows.every((r) => r.column === "right")).toBe(true);
  });
  it("㉑ 행은 display='rate' formula='50%'", () => {
    const r21 = data.leftRows.find((r) => r.number === "㉑");
    expect(r21?.display).toBe("rate");
    expect(r21?.formula).toBe("50%");
  });
});
