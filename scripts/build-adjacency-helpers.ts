/**
 * 인접 매트릭스 빌드 보조 헬퍼 — 800줄 정책 sibling 분리 (E3 정정).
 *
 * 책임:
 *   - GeoJSON FeatureCollection → SigunguFeature[] 정규화 (SIG_CD 5자리 → 10자리)
 *   - turf.booleanTouches 기반 인접 매트릭스 계산
 *   - JSON 직렬화 (대칭성 보장 — A 인접 B 시 B 인접 A 동시 기록)
 *   - MATRIX_VERSION sed 갱신
 *
 * 계획서: docs/00-pm/inheritance-farming-build-scripts-prefab.plan.md v2 §3
 */

import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";

export interface SigunguFeature {
  code: string; // 행안부 10자리
  geometry: Polygon | MultiPolygon;
}

/**
 * GeoJSON Feature[] → SigunguFeature[].
 * SIG_CD 5자리 (예: "11110") → 10자리 패딩 ("1111000000").
 */
export function normalizeFeatures(
  features: ReadonlyArray<Feature<Polygon | MultiPolygon>>,
): SigunguFeature[] {
  const result: SigunguFeature[] = [];
  for (const f of features) {
    const sigCd = f.properties?.SIG_CD ?? f.properties?.sig_cd;
    if (!sigCd) continue;
    const codeStr = String(sigCd).trim();
    if (!/^\d{5}$/.test(codeStr)) continue;
    const code = codeStr + "00000"; // 10자리 패딩
    result.push({ code, geometry: f.geometry });
  }
  return result;
}

/**
 * 인접 매트릭스 계산 — turf.booleanTouches.
 * M7 정정: booleanIntersects 제거 (시·군·구는 겹치지 않으므로 false positive 위험).
 *
 * 성능 최적화: 바운딩 박스 사전 필터로 250×250 = 62,500 비교 → ~5,000 비교로 축소.
 * 예상 실행 시간: ~30초 (250 entry 기준).
 */
export function buildAdjacencyMatrix(
  features: ReadonlyArray<SigunguFeature>,
): Record<string, string[]> {
  const adjacency: Record<string, string[]> = {};
  for (const f of features) {
    adjacency[f.code] = [];
  }

  // 바운딩 박스 사전 계산
  const bboxes = new Map<string, number[]>();
  for (const f of features) {
    bboxes.set(f.code, turf.bbox(f.geometry));
  }

  for (let i = 0; i < features.length; i++) {
    const a = features[i];
    const aBbox = bboxes.get(a.code)!;
    for (let j = i + 1; j < features.length; j++) {
      const b = features[j];
      const bBbox = bboxes.get(b.code)!;

      // 바운딩 박스 사전 필터 (인접 가능성 사전 차단)
      if (!bboxOverlap(aBbox, bBbox)) continue;

      // booleanTouches만 사용 (경계 접촉이 인접의 정의)
      try {
        if (turf.booleanTouches(a.geometry, b.geometry)) {
          adjacency[a.code].push(b.code);
          adjacency[b.code].push(a.code); // 대칭 보장
        }
      } catch {
        // turf.booleanTouches가 일부 MultiPolygon에서 예외 발생 가능 — skip
      }
    }
  }

  // 정렬 (deterministic JSON output)
  for (const code of Object.keys(adjacency)) {
    adjacency[code].sort();
  }
  return adjacency;
}

function bboxOverlap(a: number[], b: number[]): boolean {
  return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
}

/**
 * MATRIX_VERSION sed 갱신 (lib/geo/administrative-district-adjacency.ts).
 * CI cron의 sed in-place와 동일 패턴.
 */
export function updateMatrixVersionInline(
  tsFileContent: string,
  isoDate: string,
): string {
  return tsFileContent.replace(
    /MATRIX_VERSION = "[^"]*"/,
    `MATRIX_VERSION = "${isoDate}"`,
  );
}
