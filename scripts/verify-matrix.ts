#!/usr/bin/env tsx
/**
 * 행정구역 인접 매트릭스 자기검증.
 *
 * 사용법:
 *   npm run verify:matrix
 *
 * exit code:
 *   0 — 정상 (또는 Phase 1·2 미완 — 빈 매트릭스 placeholder)
 *   1 — 결함 발견 (차이 상세 stdout 출력)
 *
 * 계획서: docs/00-pm/inheritance-farming-build-scripts-prefab.plan.md v2 §5
 */

import { SIGUNGU_LIST } from "@/lib/geo/sigungu-code-list";
import { MATRIX_VERSION, getSigunguCount } from "@/lib/geo/administrative-district-adjacency";
import adjacencyData from "@/lib/geo/administrative-district-adjacency.json";
import { verifyMatrix } from "./verify-matrix-helpers";

async function main() {
  const adjacency = adjacencyData as Record<string, string[]>;

  console.log(`📂 SIGUNGU_LIST: ${SIGUNGU_LIST.length}건`);
  console.log(`📂 adjacency entry: ${getSigunguCount()}건`);
  console.log(`📂 MATRIX_VERSION: ${MATRIX_VERSION}`);

  if (getSigunguCount() === 0) {
    console.log("");
    console.log("ℹ️  매트릭스가 비어있음 (Phase 1·2 미완 placeholder).");
    console.log("   data/raw/lsmd.shp 도착 후 `npm run build:adjacency` 실행 권장.");
    console.log("   본 verify는 entry > 0 시 V-1 ~ V-8 전수 검증.");
    process.exit(0);
  }

  const result = verifyMatrix(adjacency, SIGUNGU_LIST, MATRIX_VERSION);

  console.log("");
  console.log(`📊 entry ${result.summary.entryCount}건 · 인접쌍 ${result.summary.pairCount}건 · 고립 ${result.summary.isolatedCount}건`);

  if (result.ok) {
    console.log(`✅ V-1 ~ V-8 모두 통과`);
    process.exit(0);
  }

  console.error(`❌ 결함 ${result.errors.length}건:`);
  for (const e of result.errors) console.error(`   - ${e}`);
  process.exit(1);
}

main().catch((err) => {
  console.error("❌ verify 실패:", err);
  process.exit(1);
});
