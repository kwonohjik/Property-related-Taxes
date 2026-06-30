/**
 * 조정대상지역 해제일 경계 anchor — releasedDate 규약 고정 (검증 완료, 2026-06-30)
 *
 * 규약: releasedDate = "효력발생일 − 1일 = 마지막 규제일"로 저장. 판정은 폐구간 포함(`<=`).
 *   서울/과천 해제 효력 2023-01-05 0시 → 저장값 releasedDate "2023-01-04".
 *   재지정 2025-10-16 → 그날부터 다시 규제(designatedDate 포함).
 *
 * 이 anchor가 깨지면 누군가 포함 비교(`<=`)를 배제(`<`)로 바꾼 것 — off-by-one 회귀.
 * 근거: 국토부 고시(2023.1.5 효력) WebSearch 교차검증.
 */
import { describe, it, expect } from "vitest";
import {
  isRegulatedByBjdCode,
  toRegulatedAreaHistory,
} from "@/lib/tax-engine/data/regulated-areas";
import { isRegulatedAreaAtDate } from "@/lib/tax-engine/multi-house-surcharge";

const history = toRegulatedAreaHistory();
const GWACHEON = "41290"; // 경기도 과천시 — 2017-08-03 지정, 2023-01-04 해제(효력 1/5), 2025-10-16 재지정

describe("[조정대상지역 해제일 경계] releasedDate = 효력발생일 −1, 폐구간 포함", () => {
  describe("isRegulatedByBjdCode (법정동코드 경로)", () => {
    it("해제 효력일 전일(2023-01-04) = 규제(마지막 규제일)", () => {
      expect(isRegulatedByBjdCode(GWACHEON, "2023-01-04").isRegulated).toBe(true);
    });
    it("해제 효력일 당일(2023-01-05) = 비규제", () => {
      expect(isRegulatedByBjdCode(GWACHEON, "2023-01-05").isRegulated).toBe(false);
    });
    it("재지정 전일(2025-10-15) = 비규제", () => {
      expect(isRegulatedByBjdCode(GWACHEON, "2025-10-15").isRegulated).toBe(false);
    });
    it("재지정 당일(2025-10-16) = 규제(designatedDate 포함)", () => {
      expect(isRegulatedByBjdCode(GWACHEON, "2025-10-16").isRegulated).toBe(true);
    });
  });

  describe("isRegulatedAreaAtDate (중과 엔진 history 경로) — 동일 경계 보장", () => {
    it("2023-01-04 = 규제", () => {
      expect(isRegulatedAreaAtDate(GWACHEON, new Date("2023-01-04"), history)).toBe(true);
    });
    it("2023-01-05 = 비규제", () => {
      expect(isRegulatedAreaAtDate(GWACHEON, new Date("2023-01-05"), history)).toBe(false);
    });
    it("2025-10-16 재지정 당일 = 규제", () => {
      expect(isRegulatedAreaAtDate(GWACHEON, new Date("2025-10-16"), history)).toBe(true);
    });
  });
});
