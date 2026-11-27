/**
 * 국외전출세 2027.1.1. 출국일 게이트 — 경계 anchor
 * (소득세법 부칙 법률 제21221호 제1조 2호·제8조: 2027.1.1. 이후 출국분부터)
 */
import { describe, it, expect } from "vitest";
import {
  EXIT_TAX_2027_START,
  isExitTaxFrom2027,
} from "@/lib/tax-engine/data/exit-tax-2027-era";

describe("isExitTaxFrom2027 — 출국일 경계", () => {
  it("상수는 2027-01-01", () => {
    expect(EXIT_TAX_2027_START).toBe("2027-01-01");
  });

  it("2026-12-31 = false (종전 규정)", () => {
    expect(isExitTaxFrom2027("2026-12-31")).toBe(false);
    expect(isExitTaxFrom2027(new Date(Date.UTC(2026, 11, 31)))).toBe(false);
  });

  it("2027-01-01 = true (개정 규정 첫날)", () => {
    expect(isExitTaxFrom2027("2027-01-01")).toBe(true);
    expect(isExitTaxFrom2027(new Date(Date.UTC(2027, 0, 1)))).toBe(true);
  });

  it("2027-01-02 · 2030-06-15 = true", () => {
    expect(isExitTaxFrom2027("2027-01-02")).toBe(true);
    expect(isExitTaxFrom2027("2030-06-15")).toBe(true);
  });

  it("교재 사례 출국일 2026-09-01 = false (실제 양도일 2027-03-01과 무관)", () => {
    expect(isExitTaxFrom2027("2026-09-01")).toBe(false);
  });

  it("Date와 문자열 입력이 같은 결과 (JSON 직렬화 경유 후에도 동일)", () => {
    const d = new Date(Date.UTC(2027, 0, 1));
    expect(isExitTaxFrom2027(JSON.parse(JSON.stringify({ d })).d)).toBe(isExitTaxFrom2027(d));
    const e = new Date(Date.UTC(2026, 11, 31));
    expect(isExitTaxFrom2027(JSON.parse(JSON.stringify({ e })).e)).toBe(isExitTaxFrom2027(e));
  });

  it("시각이 붙은 값은 UTC 순간 기준 — 경계 전후 1초", () => {
    expect(isExitTaxFrom2027("2026-12-31T23:59:59Z")).toBe(false);
    expect(isExitTaxFrom2027("2027-01-01T00:00:00Z")).toBe(true);
    // 한국 시각 2027-01-01 08:59 = UTC 2026-12-31 23:59 → 종전
    expect(isExitTaxFrom2027("2027-01-01T08:59:00+09:00")).toBe(false);
    expect(isExitTaxFrom2027("2027-01-01T09:00:00+09:00")).toBe(true);
  });

  it("빈 값·undefined·null·파싱 불가·Invalid Date = false", () => {
    expect(isExitTaxFrom2027("")).toBe(false);
    expect(isExitTaxFrom2027(undefined)).toBe(false);
    expect(isExitTaxFrom2027(null)).toBe(false);
    expect(isExitTaxFrom2027("not-a-date")).toBe(false);
    expect(isExitTaxFrom2027("2027-02-30")).toBe(false);
    expect(isExitTaxFrom2027("2027/01/01")).toBe(false);
    expect(isExitTaxFrom2027(new Date("invalid"))).toBe(false);
  });
});
