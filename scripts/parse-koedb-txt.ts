#!/usr/bin/env tsx
/**
 * KOEDB 법정동코드 TXT 파싱 → lib/geo/sigungu-code-list.ts 자동 생성.
 *
 * 사용법:
 *   npm run build:sigungu
 *   또는
 *   npx tsx scripts/parse-koedb-txt.ts [--input PATH] [--output PATH] [--dry-run]
 *
 * 입력: data/raw/koedb.txt (행안부 KOEDB 법정동코드 전체자료)
 * 출력: lib/geo/sigungu-code-list.ts (자동 생성, 수동 편집 금지)
 *
 * 관련 계획서: docs/00-pm/inheritance-farming-build-scripts-prefab.plan.md v2 §2
 */

import * as fs from "fs/promises";
import * as path from "path";
import {
  decodeKoedb,
  parseKoedbRows,
  isSigunguCode,
  toSigunguEntry,
  validateSeedConsistency,
  generateTsModule,
} from "./parse-koedb-helpers";
import { SIGUNGU_LIST } from "@/lib/geo/sigungu-code-list";

interface CliOptions {
  input: string;
  output: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    input: "data/raw/koedb.txt",
    output: "lib/geo/sigungu-code-list.ts",
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input" && argv[i + 1]) opts.input = argv[++i];
    else if (arg === "--output" && argv[i + 1]) opts.output = argv[++i];
    else if (arg === "--dry-run") opts.dryRun = true;
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  // 1. 입력 파일 존재 확인
  let buf: Buffer;
  try {
    buf = await fs.readFile(opts.input);
  } catch {
    console.error(`❌ KOEDB 입력 파일 없음: ${opts.input}`);
    console.error("");
    console.error("다운로드 가이드:");
    console.error("  1. https://www.code.go.kr 접속");
    console.error("  2. '법정동코드 전체자료' 검색 → TXT 다운로드");
    console.error(`  3. ${opts.input} 위치에 저장`);
    console.error("  4. npm run build:sigungu 재실행");
    process.exit(1);
  }

  console.log(`📂 입력: ${opts.input} (${buf.length.toLocaleString()} bytes)`);

  // 2. 인코딩 자동 감지 + 디코드
  const text = decodeKoedb(buf);
  console.log(`📝 디코드 완료 (${text.length.toLocaleString()} chars)`);

  // 3. 행 파싱
  const rows = parseKoedbRows(text);
  console.log(`📊 파싱 행: ${rows.length.toLocaleString()}건`);

  // 4. 시·군·구 필터링
  const sigunguRows = rows.filter((r) => isSigunguCode(r.code) && r.active);
  console.log(`🏛  시·군·구 entry: ${sigunguRows.length}건`);

  // 250+ 미만 시 경고 (행정구역 개편 또는 파싱 오류 가능성)
  if (sigunguRows.length < 200) {
    console.warn(
      `⚠️  entry ${sigunguRows.length}건 — 통상 240~260건 예상. 파싱 결함 또는 데이터 결함 검토 필요.`,
    );
  }

  // 5. SigunguEntry 변환 + kind 자동 분류
  const entries = sigunguRows.map(toSigunguEntry);

  // 6. 시드 13건 정합 검증
  const validation = validateSeedConsistency(SIGUNGU_LIST, entries);
  if (!validation.ok) {
    console.error("❌ 시드 정합성 검증 실패:");
    for (const m of validation.mismatches) console.error(`   - ${m}`);
    console.error("");
    console.error("→ 시드 갱신 PR 우선 진행 후 본 스크립트 재실행 권장.");
    process.exit(1);
  }
  console.log(`✅ 시드 ${SIGUNGU_LIST.length}건 정합성 검증 통과`);

  // 7. TypeScript 모듈 코드 생성
  const buildDate = new Date().toISOString().slice(0, 10);
  const tsCode = generateTsModule(entries, buildDate);

  if (opts.dryRun) {
    console.log("");
    console.log("─── DRY RUN — 첫 30줄 미리보기 ───");
    console.log(tsCode.split("\n").slice(0, 30).join("\n"));
    console.log("...");
    console.log(`(총 ${tsCode.split("\n").length}줄, 출력 안 함)`);
    return;
  }

  // 8. 백업 + 덮어쓰기
  try {
    const existing = await fs.readFile(opts.output, "utf-8");
    await fs.writeFile(`${opts.output}.bak`, existing, "utf-8");
    console.log(`💾 백업: ${opts.output}.bak`);
  } catch {
    /* 신규 생성 — 백업 없음 */
  }

  await fs.mkdir(path.dirname(opts.output), { recursive: true });
  await fs.writeFile(opts.output, tsCode, "utf-8");
  console.log(`✅ 산출: ${opts.output} (${entries.length}건, ${buildDate})`);
}

main().catch((err) => {
  console.error("❌ 빌드 실패:", err);
  process.exit(1);
});
