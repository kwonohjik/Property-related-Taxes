#!/usr/bin/env tsx
/**
 * 행안부 KOEDB·공공데이터포털 LSMD 자동 다운로드 (CI 전용).
 *
 * 사용법:
 *   npm run build:admin-data
 *   또는 GitHub Actions matrix-update.yml에서 자동 실행 (분기 1회)
 *
 * 환경변수 override:
 *   KOEDB_URL — 기본: https://www.code.go.kr/etc/codeIntegrationFileDown.do?type=law
 *   LSMD_URL  — 기본: https://www.data.go.kr/data/15054995/fileData.do
 *
 * 산출: data/raw/koedb.txt + data/raw/lsmd.{shp,shx,dbf,prj}
 *
 * 라이선스: 공공누리 1유형 (출처 표시).
 *
 * 계획서: docs/00-pm/inheritance-farming-build-scripts-prefab.plan.md v2 §4
 */

import * as fs from "fs/promises";
import * as path from "path";
import AdmZip from "adm-zip";

const DATA_DIR = "data/raw";

const KOEDB_URL =
  process.env.KOEDB_URL ??
  "https://www.code.go.kr/etc/codeIntegrationFileDown.do?type=law";

const LSMD_URL =
  process.env.LSMD_URL ??
  "https://www.data.go.kr/data/15054995/fileData.do";

const MIN_KOEDB_SIZE = 500_000; // 500KB — 통상 1~2MB
const MIN_LSMD_SIZE = 5_000_000; // 5MB — 통상 50~100MB

async function downloadFile(url: string, dest: string, minSize: number): Promise<Buffer> {
  console.log(`📥 다운로드: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`다운로드 실패: ${url} → HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < minSize) {
    throw new Error(
      `다운로드 결함: ${url} → ${buf.length}B (최소 ${minSize}B 미달, 결함 의심)`,
    );
  }
  await fs.writeFile(dest, buf);
  console.log(`💾 저장: ${dest} (${buf.length.toLocaleString()}B)`);
  return buf;
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
  console.log(`📦 압축 해제: ${zipPath} → ${destDir}`);

  // 필수 4종 검증
  for (const ext of [".shp", ".shx", ".dbf", ".prj"]) {
    const files = await fs.readdir(destDir);
    const candidates = files.filter((f) => f.endsWith(ext));
    if (candidates.length === 0) {
      throw new Error(`압축 해제 후 ${ext} 파일 없음 — LSMD 결함 의심`);
    }
    // lsmd.{ext}로 rename (이미 lsmd가 아니면)
    const firstName = candidates.find((f) => !f.startsWith("lsmd")) ?? candidates[0];
    const renamed = `lsmd${ext}`;
    if (firstName !== renamed) {
      await fs.rename(
        path.join(destDir, firstName),
        path.join(destDir, renamed),
      );
      console.log(`🔄 rename: ${firstName} → ${renamed}`);
    }
  }
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  // 1. KOEDB TXT 다운로드
  try {
    await downloadFile(KOEDB_URL, path.join(DATA_DIR, "koedb.txt"), MIN_KOEDB_SIZE);
  } catch (err) {
    console.error(`❌ KOEDB 다운로드 실패: ${err}`);
    console.error("   기존 data/raw/koedb.txt 보존 — 빌드 step에서 미존재 시 skip 처리.");
  }

  // 2. LSMD zip 다운로드 + 압축 해제
  try {
    const zipPath = path.join(DATA_DIR, "lsmd.zip");
    await downloadFile(LSMD_URL, zipPath, MIN_LSMD_SIZE);
    await extractZip(zipPath, DATA_DIR);
    // zip 파일 삭제 (압축 해제 완료)
    await fs.unlink(zipPath);
  } catch (err) {
    console.error(`❌ LSMD 다운로드/해제 실패: ${err}`);
    console.error("   기존 data/raw/lsmd.{shp,shx,dbf,prj} 보존 — 미존재 시 build step에서 skip.");
  }

  console.log("");
  console.log("ℹ️  라이선스: 공공누리 1유형 (출처: 행정안전부 KOEDB + 국토지리정보원 LSMD)");
}

main().catch((err) => {
  console.error("❌ 전체 실패:", err);
  process.exit(1);
});
