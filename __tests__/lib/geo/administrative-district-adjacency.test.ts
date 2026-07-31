/**
 * 행정구역 인접 매트릭스 (Phase 1-C 완료 — 2026-07-31 데이터 주입).
 *
 * 계획서: docs/00-pm/inheritance-farming-residence-data-infra.plan.md §4-C.3
 * 생성 스크립트: `scripts/build-sigungu-adjacency.ts` (Vworld LT_C_ADSIGG_INFO + turf)
 *
 * ⚠️ 계획서 §4-C.3의 ADJ-4·ADJ-9 코드는 **틀렸다**("KOEDB 검증 후 확정"으로 유보돼 있었다):
 *    26290은 금정구가 아니라 **남구**다(금정구 = 26410). 실측으로 정정해 고정한다.
 */
import { describe, it, expect } from "vitest";
import {
  getAdjacentSigunguCodes,
  getSigunguCount,
  isMatrixEmpty,
  MATRIX_VERSION,
} from "@/lib/geo/administrative-district-adjacency";

/** 인접은 **대칭**이어야 한다 — 한쪽만 있으면 판정이 방향에 따라 갈린다. */
function expectMutual(a: string, b: string) {
  expect(getAdjacentSigunguCodes(a)).toContain(b);
  expect(getAdjacentSigunguCodes(b)).toContain(a);
}

describe("[ADJ] 행정구역 인접 매트릭스", () => {
  it("ADJ-10: 시·군·구 256건 (계획서 예상 240~260 범위)", () => {
    expect(getSigunguCount()).toBe(256);
    expect(isMatrixEmpty()).toBe(false);
  });

  it("MATRIX_VERSION이 placeholder에서 갱신됐다", () => {
    expect(MATRIX_VERSION).toBe("2026-07-31");
  });

  it("ADJ-1·2: 서울 강남 ↔ 서초·송파", () => {
    expectMutual("1168000000", "1165000000");
    expectMutual("1168000000", "1171000000");
  });

  it("ADJ-3: 수원 영통 ↔ 용인 기흥 — 시 경계", () => {
    expectMutual("4111700000", "4146300000");
  });

  it("ADJ-4(정정): 부산 동래(26260) ↔ 금정(**26410**)", () => {
    expectMutual("2626000000", "2641000000");
  });

  it("ADJ-5: 제주시 ↔ 서귀포시", () => {
    expectMutual("5011000000", "5013000000");
  });

  it("ADJ-7: 서울 강서 ↔ 김포 — 시·도 경계를 넘는다", () => {
    expectMutual("1150000000", "4157000000");
  });

  it("🔴 도서는 인접 0 — 교량 연결은 육지 경계 접함이 아니다", () => {
    // ADJ-8·ADJ-9가 물었던 「해상 경계 정책」의 현행 구현을 명시적으로 고정한다.
    for (const island of [
      "2871000000", // 인천 강화군 (강화대교로 김포 연결)
      "4831000000", // 경남 거제시 (거가대교로 부산 연결)
      "4794000000", // 경북 울릉군
      "2872000000", // 인천 옹진군
    ]) {
      expect(getAdjacentSigunguCodes(island)).toEqual([]);
    }
  });

  it("미등록 코드는 빈 배열 — 조회 실패가 예외로 번지지 않는다", () => {
    expect(getAdjacentSigunguCodes("9999999999")).toEqual([]);
    expect(getAdjacentSigunguCodes("")).toEqual([]);
  });

  it("🔴 전남·광주는 **통합 코드(12)** 체계다 — 구 46·29 코드는 없다", () => {
    // 프로덕션 주소검색(Vworld)이 반환하는 PNU와 같은 체계여야 매칭된다.
    expect(getAdjacentSigunguCodes("1271000000")).toContain("1230000000"); // 담양군 ↔ 북구
    expect(getAdjacentSigunguCodes("4671000000")).toEqual([]); // 구 전남 담양군 코드 — 없음
    expect(getAdjacentSigunguCodes("2917000000")).toEqual([]); // 구 광주 북구 코드 — 없음
  });

  it("인접 관계는 대칭이다 (매트릭스 무결성 — 대표 표본)", () => {
    // 공개 API로는 키 전체 목록을 얻을 수 없어 시·도가 다른 표본 4개로 확인한다.
    for (const a of ["1168000000", "4111700000", "5011000000", "1230000000"]) {
      for (const b of getAdjacentSigunguCodes(a)) {
        expect(getAdjacentSigunguCodes(b)).toContain(a);
      }
    }
  });
});
