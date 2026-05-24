#!/usr/bin/env tsx
/**
 * LSMD_ADM_SECT_RGN SHP → lib/geo/administrative-district-adjacency.json 자동 생성.
 *
 * 사용법:
 *   npm run build:adjacency
 *   또는
 *   npx tsx scripts/build-adjacency-matrix.ts
 *
 * 입력: data/raw/lsmd.shp (+ .dbf · .shx · .prj)
 * 산출:
 *   - lib/geo/administrative-district-adjacency.json (인접 매트릭스)
 *   - lib/geo/administrative-district-adjacency.ts (MATRIX_VERSION sed 갱신)
 *
 * 계획서: docs/00-pm/inheritance-farming-build-scripts-prefab.plan.md v2 §3
 */

import * as fs from "fs/promises";
import * as path from "path";
import { open as openShapefile } from "shapefile";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import {
  normalizeFeatures,
  buildAdjacencyMatrix,
  updateMatrixVersionInline,
} from "./build-adjacency-helpers";

const INPUT_SHP = "data/raw/lsmd.shp";
const INPUT_DBF = "data/raw/lsmd.dbf";
const OUTPUT_JSON = "lib/geo/administrative-district-adjacency.json";
const OUTPUT_TS = "lib/geo/administrative-district-adjacency.ts";

async function loadShapefile(): Promise<Feature<Polygon | MultiPolygon>[]> {
  // M7 정정: shapefile@0.6.6 ESM dual export 사용 — { open } named import
  const source = await openShapefile(INPUT_SHP, INPUT_DBF, { encoding: "euc-kr" });
  const features: Feature<Polygon | MultiPolygon>[] = [];
  let res;
  while (!(res = await source.read()).done) {
    features.push(res.value as Feature<Polygon | MultiPolygon>);
  }
  return features;
}

async function main() {
  // 1. SHP 존재 확인
  try {
    await fs.access(INPUT_SHP);
    await fs.access(INPUT_DBF);
  } catch {
    console.error(`❌ LSMD SHP 파일 없음: ${INPUT_SHP} (+ .dbf)`);
    console.error("");
    console.error("다운로드 가이드:");
    console.error("  1. https://www.data.go.kr 접속 (회원가입 필요)");
    console.error("  2. 'LSMD_ADM_SECT_RGN' 검색 → zip 다운로드");
    console.error(`  3. 압축 해제 후 data/raw/lsmd.{shp,shx,dbf,prj} 4종 저장`);
    console.error("  4. npm run build:adjacency 재실행");
    process.exit(1);
  }

  console.log(`📂 SHP 로드: ${INPUT_SHP}`);
  const features = await loadShapefile();
  console.log(`📊 SHP feature 수: ${features.length.toLocaleString()}건`);

  const normalized = normalizeFeatures(features);
  console.log(`🏛  정규화 entry: ${normalized.length}건`);

  if (normalized.length < 200) {
    console.warn(
      `⚠️  entry ${normalized.length}건 — 통상 240~260건 예상. SHP 결함 가능성.`,
    );
  }

  // 2. 인접 매트릭스 계산
  console.log(`🔄 인접 매트릭스 계산 중 (turf.booleanTouches, 바운딩박스 사전필터)...`);
  const t0 = Date.now();
  const adjacency = buildAdjacencyMatrix(normalized);
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  const pairCount = Object.values(adjacency).reduce((s, arr) => s + arr.length, 0) / 2;
  console.log(`✅ 매트릭스 완료 (${elapsedSec}s) — 인접 쌍 ${pairCount.toLocaleString()}건`);

  // 3. JSON 산출
  await fs.mkdir(path.dirname(OUTPUT_JSON), { recursive: true });
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(adjacency, null, 2), "utf-8");
  console.log(`💾 JSON 산출: ${OUTPUT_JSON}`);

  // 4. MATRIX_VERSION sed 갱신
  const isoDate = new Date().toISOString().slice(0, 10);
  try {
    const tsContent = await fs.readFile(OUTPUT_TS, "utf-8");
    const updated = updateMatrixVersionInline(tsContent, isoDate);
    await fs.writeFile(OUTPUT_TS, updated, "utf-8");
    console.log(`✅ MATRIX_VERSION 갱신: ${isoDate}`);
  } catch (err) {
    console.warn(`⚠️  MATRIX_VERSION 갱신 실패: ${err}`);
  }
}

main().catch((err) => {
  console.error("❌ 빌드 실패:", err);
  process.exit(1);
});
