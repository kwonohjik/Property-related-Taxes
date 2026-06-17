/**
 * 조정대상지역 주소 기반 판정(P2) anchor — regionCode 없을 때의 fallback 경로.
 *
 * isRegulatedByAddress(시군구명 매칭) + lib/regulated-area.ts 위임 래퍼 검증.
 * 시군구명만으로는 동·지구 예외 판정 불가 → 하위규칙 있는 시군구는 medium.
 */

import { describe, it, expect } from "vitest";
import { isRegulatedByAddress } from "@/lib/tax-engine/data/regulated-areas";
import { checkRegulatedArea, checkRegulatedAreaByCode } from "@/lib/regulated-area";

describe("isRegulatedByAddress — 시군구명 매칭(주소 fallback)", () => {
  describe("서울", () => {
    it("강남구 — 개별 지정 줄곧(전역 해제기간에도 high 지정)", () => {
      const r = isRegulatedByAddress("서울특별시", "강남구", "2024-01-01");
      expect(r.isRegulated).toBe(true);
      expect(r.confidence).toBe("high");
    });
    it("마포구 — 시도 전역 폴백: 전역기간 지정 / 해제기간 미지정 / 재지정", () => {
      expect(isRegulatedByAddress("서울특별시", "마포구", "2021-01-01").isRegulated).toBe(true);
      expect(isRegulatedByAddress("서울특별시", "마포구", "2024-01-01").isRegulated).toBe(false);
      expect(isRegulatedByAddress("서울특별시", "마포구", "2026-01-01").isRegulated).toBe(true);
    });
  });

  describe("경기 — 일반구(2단어 시군구) 매칭", () => {
    it("성남시 수정구 — 2021 지정 / 2024 미지정 / 2026 재지정", () => {
      expect(isRegulatedByAddress("경기도", "성남시 수정구", "2021-01-01").isRegulated).toBe(true);
      expect(isRegulatedByAddress("경기도", "성남시 수정구", "2024-01-01").isRegulated).toBe(false);
      expect(isRegulatedByAddress("경기도", "성남시 수정구", "2026-01-01").isRegulated).toBe(true);
    });
    it("과천시 — 재지정", () => {
      expect(isRegulatedByAddress("경기도", "과천시", "2018-06-01").isRegulated).toBe(true);
      expect(isRegulatedByAddress("경기도", "과천시", "2024-01-01").isRegulated).toBe(false);
      expect(isRegulatedByAddress("경기도", "과천시", "2026-01-01").isRegulated).toBe(true);
    });
  });

  describe("하위규칙(동·지구 예외) 있는 시군구 → medium", () => {
    it("김포시(읍면 제외 보유) — 지정 활성이지만 동 판정 불가 medium", () => {
      const r = isRegulatedByAddress("경기도", "김포시", "2021-06-01");
      expect(r.isRegulated).toBe(true);
      expect(r.confidence).toBe("medium");
      expect(r.basis).toContain("확인");
    });
    it("화성시(동탄2 택지지구만 지정) — 시군구 매칭 시 medium", () => {
      const r = isRegulatedByAddress("경기도", "화성시", "2020-01-01");
      expect(r.isRegulated).toBe(true);
      expect(r.confidence).toBe("medium");
    });
    it("안성시(시점별 면 제외) — 지정기간 medium / 해제 후 미지정", () => {
      expect(isRegulatedByAddress("경기도", "안성시", "2021-06-01").confidence).toBe("medium");
      expect(isRegulatedByAddress("경기도", "안성시", "2023-06-01").isRegulated).toBe(false);
    });
  });

  describe("인천", () => {
    it("연수구 — 지정 / 해제 후 미지정", () => {
      expect(isRegulatedByAddress("인천광역시", "연수구", "2021-06-01").isRegulated).toBe(true);
      expect(isRegulatedByAddress("인천광역시", "연수구", "2022-12-01").isRegulated).toBe(false);
    });
    it("중구(을왕동 등 면 제외 보유) — medium", () => {
      expect(isRegulatedByAddress("인천광역시", "중구", "2021-06-01").confidence).toBe("medium");
    });
  });

  describe("미지정·미수록 구분", () => {
    it("수도권 내 미지정 시군구 → 미지정(high)", () => {
      const r = isRegulatedByAddress("경기도", "여주시", "2021-06-01");
      expect(r.isRegulated).toBe(false);
      expect(r.confidence).toBe("high");
    });
    it("미수록 시도(제주) → 데이터 미수록(low, 직접 확인)", () => {
      // 부산·대구 등 지방은 P-A로 수록됨. 한 번도 미지정인 시도(제주)로 미수록 경로 검증.
      const r = isRegulatedByAddress("제주특별자치도", "제주시", "2021-06-01");
      expect(r.isRegulated).toBe(false);
      expect(r.confidence).toBe("low");
      expect(r.basis).toContain("미수록");
    });
  });
});

describe("lib/regulated-area.ts 위임 래퍼", () => {
  it("checkRegulatedArea — 주소 문자열 파싱 후 위임(강남)", () => {
    const r = checkRegulatedArea("서울특별시 강남구 테헤란로 123", "2024-01-01");
    expect(r.isRegulated).toBe(true);
    expect(r.confidence).toBe("high");
  });
  it("checkRegulatedArea — 일반구 2단어 파싱(성남시 수정구)", () => {
    const r = checkRegulatedArea("경기도 성남시 수정구 산성대로 451", "2021-01-01");
    expect(r.isRegulated).toBe(true);
  });
  it("checkRegulatedArea — 빈 주소 → low", () => {
    expect(checkRegulatedArea("", "2024-01-01").confidence).toBe("low");
  });
  it("checkRegulatedAreaByCode — 법정동코드 정밀 경로(김포 통진읍 제외)", () => {
    // 통진읍(4157025) → 제외, high
    const excluded = checkRegulatedAreaByCode("4157025021", "2021-06-01");
    expect(excluded.isRegulated).toBe(false);
    expect(excluded.confidence).toBe("high");
    // 김포 동지역 → 지정, high
    const included = checkRegulatedAreaByCode("4157010100", "2021-06-01");
    expect(included.isRegulated).toBe(true);
    expect(included.confidence).toBe("high");
  });
  it("checkRegulatedAreaByCode — 빈 코드 → low", () => {
    expect(checkRegulatedAreaByCode("", "2024-01-01").confidence).toBe("low");
  });
});
