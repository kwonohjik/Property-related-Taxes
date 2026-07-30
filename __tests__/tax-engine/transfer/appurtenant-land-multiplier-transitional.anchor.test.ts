/**
 * 주택부수토지 배율 경과조치 anchor (G-5)
 *
 * ## 법령
 *
 * 2020.2.11. 대통령령 제30395호 개정으로 **도시지역 내 일률 5배** → **수도권 주거·상업·공업
 * 3배 / 수도권 녹지 5배 / 수도권 밖 5배**로 세분됐다. 부칙이 시행일과 경과조치를 함께 둔다:
 *
 * - 부칙 §1 3호 — 「제154조제7항제1호, 제160조제1항, **제167조의5제1호** 및 **제168조의12제1호**의
 *   개정규정: **2022년 1월 1일**」
 * - 부칙 §2 ② — 「이 영 중 양도소득세에 관한 개정규정은 이 영 시행 이후 **양도하는 분**부터 적용」
 * - 부칙 §39 — 「**2022년 1월 1일 전에 양도한 자산**에 대해서는 제154조제7항제1호, 제167조의5제1호
 *   및 제168조의12제1호의 개정규정에도 불구하고 **종전의 규정**에 따른다」
 *
 * ⇒ 기준은 **양도일**이고, 3축(비과세 §154⑦ / 세율 §167의5 / 비사토 §168의12) 전부 동일하다.
 *
 * ## 종전 규정 원문 (2020.2.11. 대통령령 제30395호로 개정되기 전의 것)
 *
 *   1. 「국토의 계획 및 이용에 관한 법률」 제6조제1호에 따른 도시지역 내의 토지: **5배**
 *   2. 그 밖의 토지: **10배**
 *
 * 출처 — 법제처 Open API가 조문 내 삽입 표를 반환하지 않아 재결례 인용문으로 확보:
 * - **조심 2021광2410**(2021.7.16.) 별지: 종전 **§154⑦**·**§168의12** 원문
 * - **조심 2024서2826**(2025.5.13.) 관련법령: 현행 §168의12 각목 + 개정 연혁 + 부칙 §1·§2·§39
 *
 * ⚠️ 종전 **§167의5**(세율 축) 1호 원문은 직접 확보하지 못했다. 부칙 §39가 세 조문 1호를 한
 *    묶음으로 지목하고, 확보된 나머지 두 조문의 종전 1호가 모두 "도시지역 5배"이므로 동일하게
 *    본다. 원문 확보 시 재확인 대상.
 *
 * ## 실질 영향 범위
 *
 * 개정 전후로 값이 달라지는 조합은 **수도권 도시지역 주거·상업·공업(5배 → 3배)** 하나뿐이다.
 * 수도권 녹지·수도권 밖 도시지역은 개정 후에도 5배, 도시지역 외는 2호 미개정으로 10배 —
 * 나머지 조합은 회귀가 발생하지 않는다.
 *
 * ## 기준 사실관계 (조심 2024서2826 실제 과세 사례)
 *
 * 서울 용산 주거지역(수도권 도시지역), 주택 정착면적 141.39㎡, 부수토지 647㎡.
 * - 2023.7.26. 양도(실제): 3배 → 허용 424.17㎡, 초과 **222.83㎡** 비사업용 → +10%p 중과
 * - 2022.1.1. 전 양도라면: 5배 → 허용 706.95㎡ ≥ 647㎡ → 초과 **0㎡**(전량 사업용)
 */
import { describe, it, expect } from "vitest";
import { getHousingMultiplier } from "@/lib/tax-engine/non-business-land/urban-area";
import { appurtenantLandMultiplier } from "@/lib/tax-engine/appurtenant-land-rate";

/** 조심 2024서2826 — 주택 정착면적(㎡) */
const FOOTPRINT = 141.39;
/** 조심 2024서2826 — 부수토지 전체 면적(㎡) */
const LAND_AREA = 647;
/** 개정 후(3배) 허용면적 — 재결례 처분 수치 */
const ALLOWED_AFTER = 424.17;
/** 개정 후 초과면적 = 비사업용 — 재결례 처분 수치 222.83㎡ */
const EXCESS_AFTER = 222.83;

const AFTER = new Date("2023-07-26"); // 재결례 실제 양도일
const BOUNDARY = new Date("2022-01-01"); // 시행일 당일 = 신규정
const BEFORE = new Date("2021-12-31"); // 시행일 직전 = 종전규정

describe("G-5 주택부수토지 배율 경과조치 (부칙 §39 — 2022.1.1.)", () => {
  describe("비사토 축 — getHousingMultiplier (영 §168의12)", () => {
    it("A-9-1 수도권 도시지역 주거 · 2023 양도 → 3배 (개정 후)", () => {
      const { multiplier } = getHousingMultiplier("general_residential", true, AFTER);
      expect(multiplier).toBe(3);
      expect(FOOTPRINT * multiplier).toBeCloseTo(ALLOWED_AFTER, 2);
      expect(LAND_AREA - FOOTPRINT * multiplier).toBeCloseTo(EXCESS_AFTER, 2);
    });

    it("A-9-2 수도권 도시지역 주거 · 2021-12-31 양도 → 5배 (종전) · 초과 0㎡", () => {
      const { multiplier } = getHousingMultiplier("general_residential", true, BEFORE);
      expect(multiplier).toBe(5);
      // 706.95 ≥ 647 → 전량 사업용
      expect(Math.max(0, LAND_AREA - FOOTPRINT * multiplier)).toBe(0);
    });

    it("A-9-3 시행일 당일(2022-01-01) 양도 → 신규정 3배 (경계 — '전에 양도한 자산'만 종전)", () => {
      expect(getHousingMultiplier("general_residential", true, BOUNDARY).multiplier).toBe(3);
    });

    it("A-9-4 상업·공업지역도 동일 (수도권·개정 전 5배)", () => {
      expect(getHousingMultiplier("commercial", true, BEFORE).multiplier).toBe(5);
      expect(getHousingMultiplier("industrial", true, BEFORE).multiplier).toBe(5);
      expect(getHousingMultiplier("commercial", true, AFTER).multiplier).toBe(3);
    });

    it("A-9-5 값이 바뀌지 않는 조합 — 수도권 녹지·수도권 밖 도시(5배)·도시지역 외(10배)", () => {
      for (const d of [BEFORE, AFTER]) {
        expect(getHousingMultiplier("green", true, d).multiplier).toBe(5); // 수도권 녹지
        expect(getHousingMultiplier("general_residential", false, d).multiplier).toBe(5); // 수도권 밖 도시
        expect(getHousingMultiplier("agriculture_forest", true, d).multiplier).toBe(10); // 도시지역 외
        expect(getHousingMultiplier("management", false, d).multiplier).toBe(10);
      }
    });

    it("A-9-6 양도일 미제공 시 현행(개정 후) 배율 — 기존 호출부 회귀 0", () => {
      expect(getHousingMultiplier("general_residential", true).multiplier).toBe(3);
      expect(getHousingMultiplier("agriculture_forest", true).multiplier).toBe(10);
    });
  });

  describe("세율 축 — appurtenantLandMultiplier (영 §167의5)", () => {
    it("A-9-7 수도권 주·상·공 · 2021-12-31 양도 → 5배 (종전)", () => {
      expect(appurtenantLandMultiplier("metropolitan_residential", BEFORE)).toBe(5);
    });

    it("A-9-8 수도권 주·상·공 · 2023 양도 → 3배 (개정 후)", () => {
      expect(appurtenantLandMultiplier("metropolitan_residential", AFTER)).toBe(3);
    });

    it("A-9-9 나머지 zone은 양도일 무관 (5배·10배)", () => {
      for (const d of [BEFORE, AFTER]) {
        expect(appurtenantLandMultiplier("non_metropolitan_or_green", d)).toBe(5);
        expect(appurtenantLandMultiplier("non_urban", d)).toBe(10);
      }
    });

    it("A-9-10 zone 미지정 fallback(3배)도 종전 기간에는 5배", () => {
      // 미지정 시 보수적으로 가장 작은 한도를 적용하는 현행 정책 유지 —
      // 다만 '가장 작은 한도'가 기간에 따라 3배/5배로 갈린다.
      expect(appurtenantLandMultiplier(undefined, BEFORE)).toBe(5);
      expect(appurtenantLandMultiplier(undefined, AFTER)).toBe(3);
      expect(appurtenantLandMultiplier(undefined)).toBe(3); // 양도일 미제공 = 현행
    });
  });
});
