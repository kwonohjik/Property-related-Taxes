/**
 * filing-form-9-data anchor — 별지 제9호서식 데이터 어댑터 (FF9-1~18)
 *
 * 종합사례 fixture(comprehensive-case-pdf)로 calcInheritanceTax 실행 → 이미지1·2 값 재현.
 * Plan §8 · Design §9. 단일 진실(buildSummaryTable + result) 검증.
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import {
  buildFilingForm9Data,
  buildDecedentAddressText,
} from "@/lib/calc/filing-form-9-data";
import { calcInheritanceFilingDeadline } from "@/lib/tax-engine/deductions/family-business-autoderive";
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
  it("FF9-15c: ⑦⑧ 피상속인 인적사항 Step1 입력 pass-through", () => {
    const d2 = buildFilingForm9Data(result, EXAMPLE_HEIRS, DEATH_DATE, "홍 피상", "350505-1234567");
    expect(d2.decedentName).toBe("홍 피상");
    expect(d2.decedentResidentNumber).toBe("350505-1234567");
  });
  it("FF9-15d: 피상속인 미입력 시 빈 문자열", () => {
    expect(data.decedentName).toBe("");
    expect(data.decedentResidentNumber).toBe("");
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

/**
 * L-10 anchor — §67① 신고기한 edge 케이스 (2026-06-04)
 *
 * 산식: endOfMonth(사망일) + 6개월 (세무행정 실무 표준 / 국세기본법 §4 → 민법 준용).
 * 기존 anchor(FB-07~09, family-business-autoderive.test.ts)의 일반 케이스를 보완하는
 * edge 케이스 — 특히 2/29 윤년과 월말 사망 케이스.
 *
 * 법령 근거: 상증법 §67① "상속개시일이 속하는 달의 말일부터 6개월 이내"
 *   국세기본법 §4 → 민법 §157(초일 불산입 원칙, 단서: 오전 0시 시작 시 산입)
 *   민법 §160②③(역에 의한 계산) 준용.
 *   실무 표준: endOfMonth + addMonths = "말일부터 6개월 후 같은 날짜"(date-fns 월말 자동 보정).
 */
describe("L-10 — §67① 신고기한 edge 케이스 (deriveDueDates / calcInheritanceFilingDeadline)", () => {
  // 일반 케이스 — 기존 FB-07~09와 일치 확인 (회귀 방어)
  it("DUE-01: 3/15 사망 → 3월 말일+6M = 9/30 (일반 케이스)", () => {
    expect(calcInheritanceFilingDeadline("2024-03-15")).toBe("2024-09-30");
  });
  it("DUE-02: 8/31 사망 → 8월 말일+6M = 2025-02-28 (2월 말일 보정, §160③)", () => {
    expect(calcInheritanceFilingDeadline("2024-08-31")).toBe("2025-02-28");
  });
  it("DUE-03: 12/31 사망 → 12월 말일+6M = 6/30 (6월 말일 보정, §160③)", () => {
    expect(calcInheritanceFilingDeadline("2024-12-31")).toBe("2025-06-30");
  });

  // 윤년 2/29 사망 edge 케이스 (L-10 핵심)
  it("DUE-04: 2024-02-29(윤년 말일) 사망 → 말일+6M = 2024-08-29 (실무 표준)", () => {
    // 2024년 2월 말일 = 2/29 (윤년). addMonths(2/29, 6) = 8/29.
    // 실무: "2월 29일부터 6개월 = 8월 29일" (세무행정 표준).
    // 민법 §160② 엄격 해석("기산일의 전일") 적용 시 8/28이나,
    // 국세기본법 §4 실무 운용은 현행 산식을 표준으로 함 — 현행 유지.
    expect(calcInheritanceFilingDeadline("2024-02-29")).toBe("2024-08-29");
  });
  it("DUE-05: 2024-02-15 사망 → 2월 말일(2/29)+6M = 8/29", () => {
    expect(calcInheritanceFilingDeadline("2024-02-15")).toBe("2024-08-29");
  });
  it("DUE-06: 2025-02-28(비윤년 말일) 사망 → 말일+6M = 2025-08-28", () => {
    // 비윤년 2월 말일 = 2/28. addMonths(2/28, 6) = 8/28.
    expect(calcInheritanceFilingDeadline("2025-02-28")).toBe("2025-08-28");
  });

  // buildFilingForm9Data를 통한 통합 확인
  it("DUE-07: buildFilingForm9Data — 2023-03-05 사망 → filingDueDate = 2023-09-30", () => {
    const result = calcInheritanceTax(EXAMPLE_INPUT);
    const data = buildFilingForm9Data(result, EXAMPLE_HEIRS, "2023-03-05");
    expect(data.filingDueDate).toBe("2023-09-30");
    expect(data.installmentDueDate).toBe("2023-11-30");
  });
});

// ============================================================
// 피상속인 주소 표시 (별지9호 ⑩칸) — 도로명+상세, 지번 fallback
// E2E가 Vworld 외부 API 의존으로 못 한 핵심 표시 로직을 단위 테스트로 검증
// ============================================================

describe("buildDecedentAddressText — 별지9호 ⑩ 주소 표시", () => {
  const base = { building: "", lng: "", lat: "" };

  it("ADDR-01: undefined → 빈 문자열", () => {
    expect(buildDecedentAddressText(undefined)).toBe("");
  });

  it("ADDR-02: 도로명 + 상세 → '도로명 상세'", () => {
    expect(
      buildDecedentAddressText({
        ...base,
        road: "서울특별시 강남구 테헤란로 123",
        jibun: "서울특별시 강남구 역삼동 100-1",
        detail: "101동 202호",
      }),
    ).toBe("서울특별시 강남구 테헤란로 123 101동 202호");
  });

  it("ADDR-03: 도로명만(상세 없음) → 도로명 단독", () => {
    expect(
      buildDecedentAddressText({
        ...base,
        road: "서울특별시 강남구 테헤란로 123",
        jibun: "",
        detail: "",
      }),
    ).toBe("서울특별시 강남구 테헤란로 123");
  });

  it("ADDR-04: 도로명 없음 → 지번 fallback + 상세", () => {
    expect(
      buildDecedentAddressText({
        ...base,
        road: "",
        jibun: "서울특별시 강남구 역삼동 100-1",
        detail: "202호",
      }),
    ).toBe("서울특별시 강남구 역삼동 100-1 202호");
  });

  it("ADDR-05: 도로명·지번 모두 없음 → 상세 단독", () => {
    expect(
      buildDecedentAddressText({ ...base, road: "", jibun: "", detail: "202호" }),
    ).toBe("202호");
  });

  it("ADDR-06: 전부 빈 값/공백 → 빈 문자열", () => {
    expect(
      buildDecedentAddressText({ ...base, road: "  ", jibun: "", detail: "" }),
    ).toBe("");
  });
});
