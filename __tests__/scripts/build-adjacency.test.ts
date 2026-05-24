/**
 * BA-1 ~ BA-4 — build-adjacency-matrix.ts round-trip anchor.
 *
 * 계획서: docs/00-pm/inheritance-farming-build-scripts-prefab.plan.md v2 §7-2
 *
 * 전략: 실제 SHP 대신 GeoJSON Feature[] fixture로 buildAdjacencyMatrix 헬퍼 직접 검증.
 * SHP 파싱은 shapefile npm 패키지 신뢰 (별도 검증 안 함).
 */

import { describe, it, expect } from "vitest";
import type { Feature, Polygon } from "geojson";
import {
  normalizeFeatures,
  buildAdjacencyMatrix,
  updateMatrixVersionInline,
} from "../../scripts/build-adjacency-helpers";

// 3개 시·군·구 fixture — 단순 사각형 폴리곤
// A (서울 강남구 11680): [0,0]-[10,10]
// B (서울 서초구 11650): [10,0]-[20,10] — A와 경계 접촉 (booleanTouches=true)
// C (부산 동래구 26260): [100,100]-[110,110] — A·B와 완전 분리

function makeFeature(sigCd: string, coords: number[][][]): Feature<Polygon> {
  return {
    type: "Feature",
    properties: { SIG_CD: sigCd },
    geometry: { type: "Polygon", coordinates: coords },
  };
}

const fixtureA = makeFeature("11680", [
  [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
]);
const fixtureB = makeFeature("11650", [
  [[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]],
]);
const fixtureC = makeFeature("26260", [
  [[100, 100], [110, 100], [110, 110], [100, 110], [100, 100]],
]);

describe("BA-1: normalizeFeatures — SIG_CD 5자리 → 10자리 패딩", () => {
  it("BA-1: SIG_CD '11680' → '1168000000'", () => {
    const normalized = normalizeFeatures([fixtureA, fixtureB, fixtureC]);
    expect(normalized.length).toBe(3);
    expect(normalized[0].code).toBe("1168000000");
    expect(normalized[1].code).toBe("1165000000");
    expect(normalized[2].code).toBe("2626000000");
  });

  it("BA-1b: SIG_CD 5자리 아닌 entry 제외", () => {
    const bad = makeFeature("invalid", [
      [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
    ]);
    const normalized = normalizeFeatures([fixtureA, bad]);
    expect(normalized.length).toBe(1);
  });
});

describe("BA-2: buildAdjacencyMatrix — 대칭성 + booleanTouches", () => {
  it("BA-2: A↔B 경계 접촉 → 양방향 인접", () => {
    const features = normalizeFeatures([fixtureA, fixtureB, fixtureC]);
    const adj = buildAdjacencyMatrix(features);
    expect(adj["1168000000"]).toContain("1165000000");
    expect(adj["1165000000"]).toContain("1168000000"); // 대칭
  });

  it("BA-2b: 자기-인접 false", () => {
    const features = normalizeFeatures([fixtureA, fixtureB, fixtureC]);
    const adj = buildAdjacencyMatrix(features);
    expect(adj["1168000000"]).not.toContain("1168000000");
  });
});

describe("BA-3: 비인접 — A·C 완전 분리 → 양방향 미인접", () => {
  it("BA-3: 부산 동래구는 서울 강남구·서초구와 모두 비인접", () => {
    const features = normalizeFeatures([fixtureA, fixtureB, fixtureC]);
    const adj = buildAdjacencyMatrix(features);
    expect(adj["2626000000"]).not.toContain("1168000000");
    expect(adj["2626000000"]).not.toContain("1165000000");
    expect(adj["1168000000"]).not.toContain("2626000000");
    expect(adj["1165000000"]).not.toContain("2626000000");
  });

  it("BA-3b: 고립 entry — 인접 0건", () => {
    const features = normalizeFeatures([fixtureC]);
    const adj = buildAdjacencyMatrix(features);
    expect(adj["2626000000"]).toEqual([]);
  });
});

describe("BA-4: MATRIX_VERSION sed 갱신", () => {
  it("BA-4: 기존 MATRIX_VERSION = '0000-00-00' → '2026-05-24' 정상 교체", () => {
    const input = `export const MATRIX_VERSION = "0000-00-00";`;
    const updated = updateMatrixVersionInline(input, "2026-05-24");
    expect(updated).toContain(`MATRIX_VERSION = "2026-05-24"`);
    expect(updated).not.toContain(`"0000-00-00"`);
  });

  it("BA-4b: MATRIX_VERSION 미존재 시 원본 유지", () => {
    const input = `export const SOME_OTHER = "x";`;
    const updated = updateMatrixVersionInline(input, "2026-05-24");
    expect(updated).toBe(input);
  });
});
