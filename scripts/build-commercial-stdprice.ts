#!/usr/bin/env tsx
/**
 * 상업용건물·오피스텔 기준시가 원본(2005~2026) → 시군구×고시일자 파티션 변환.
 *
 * 사용법:
 *   npm run build:stdprice
 *   npx tsx scripts/build-commercial-stdprice.ts [--input DIR] [--out DIR] [--only YYYY-MM-DD] [--dry-run]
 *
 * 입력: data/raw/stdprice/**            원본 CSV·zip·xlsx (gitignore)
 * 출력: data/stdprice/commercial/{시군구5}/{고시일자}.json.gz  + manifest.json (gitignore)
 *
 * 계획서: docs/01-plan/features/commercial-officetel-standard-price-lookup.plan.md §6 Phase 1
 * 설계:   docs/02-design/features/commercial-officetel-standard-price-lookup.engine.design.md §2
 */

import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import * as zlib from "zlib";
import * as iconv from "iconv-lite";
import { Readable } from "stream";
import {
  buildColumnIndex,
  detectGeneration,
  missingColumns,
  normalizeNoticeDate,
  parcelKey,
  parseRow,
  pickAdoptedDeployment,
  sigunguOf,
  sniffKind,
  splitCsvLine,
  unitKey,
  type ColumnIndex,
  type Generation,
  type StdPriceUnit,
} from "./build-commercial-stdprice-helpers";
import { extractZipEntry, openZipEntry, readZipEntries } from "./build-commercial-stdprice-zip";
import { readXlsxRows } from "./build-commercial-stdprice-xlsx";

interface CliOptions {
  input: string;
  out: string;
  only: string | null;
  dryRun: boolean;
}

/** 원본 1개(단일 CSV 파일 또는 zip 내부 엔트리 1개). */
interface SourcePart {
  /** 최상위 원본 파일명 (NFC) — 배포본 그룹 판정 단위 */
  sourceFile: string;
  label: string;
  rows: () => AsyncGenerator<string[]>;
  /** zip 엔트리 타임스탬프 (중복 배포본 채택 판정용) */
  timestamp: number;
}

interface ProbedPart extends SourcePart {
  noticeDate: string;
  columnIndex: ColumnIndex;
  generation: Generation;
}

interface NoticeStats {
  rows: number;
  skipped: number;
  hoRestored: number;
  unjoinable: number;
  duplicateKeys: number;
  conflictingKeys: number;
  /** 해당 고시일자에 실제 고시된 시군구 5자리 목록 (정렬됨) */
  sigungus: string[];
}

const CACHE_DIR = ".cache";

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const parts = await enumerateParts(opts.input);
  if (parts.length === 0) {
    console.error(`❌ 원본이 없습니다: ${opts.input}`);
    console.error("   국세청 「상업용건물 및 오피스텔 기준시가」 배포본을 해당 디렉터리에 두십시오.");
    process.exitCode = 1;
    return;
  }
  console.log(`📦 원본 파트 ${parts.length}개 발견`);

  const probed: ProbedPart[] = [];
  /**
   * 스킵된 파트 — 종전에는 `probePart` 가 null 만 돌려주고 아무 데도 기록되지 않아,
   * 결손이 manifest 어디에도 남지 않고 종료코드도 0 이었다(F-22).
   * ⚠️ 스킵은 **고시일자를 확정하기 전에** 일어나므로 특정 일자에 귀속시킬 수 없다
   *    (헤더가 깨져 컬럼·고시일자를 못 읽는 것이 스킵 사유다).
   *    전 일자를 `coverage:"partial"` 로 바꾸면 조회 계층의 `coverage === "full"` 필터가
   *    조회를 통째로 죽이므로, **빌드 단위 기록 + 비정상 종료코드**로 드러낸다.
   */
  const skippedParts: { label: string; reason: string }[] = [];
  for (const part of parts) {
    const p = await probePart(part, skippedParts);
    if (p) probed.push(p);
  }

  const { byDate, supersededLog } = resolveDeployments(probed);
  const dates = [...byDate.keys()].sort();
  console.log(`🗓  고시일자 ${dates.length}종: ${dates.join(", ")}`);

  const manifestNotices: Record<string, unknown>[] = [];
  let grandTotal = 0;

  for (const date of dates) {
    if (opts.only && opts.only !== date) continue;
    const stats = await buildNoticeDate(date, byDate.get(date)!, opts);
    grandTotal += stats.rows;
    manifestNotices.push({
      date,
      rows: stats.rows,
      storedRows: stats.rows - stats.duplicateKeys,
      sigunguCount: stats.sigungus.length,
      // ⚠️ 고시 대상 지역이 해마다 다르다 — 2022년까지는 특별·광역시+세종+경기(41)뿐이고
      //    2023년부터 전국으로 확대됐다(실측). 이 목록이 없으면 조회 계층이 "그 해 그 지역은
      //    애초에 고시가 없었다"(no_notice)와 "변환 결손"(partition_missing)을 구분할 수 없다.
      sigungus: stats.sigungus,
      coverage: "full",
      adopted: [...new Set(byDate.get(date)!.map((p) => p.sourceFile))],
      ...(supersededLog.get(date)?.length ? { superseded: supersededLog.get(date) } : {}),
      repairs: { hoRestored: stats.hoRestored },
      skippedRows: stats.skipped,
      unjoinableParcelRows: stats.unjoinable,
      duplicateKeyRows: stats.duplicateKeys,
      conflictingKeyCount: stats.conflictingKeys,
    });
  }

  if (!opts.dryRun && !opts.only) {
    const manifest = {
      generatedAt: new Date().toISOString(),
      totalRows: grandTotal,
      // 결손을 manifest 에 남긴다 — 「그 지역은 애초에 고시가 없었다」와 구별할 근거가 된다.
      ...(skippedParts.length ? { skippedParts } : {}),
      notices: manifestNotices,
    };
    const manifestPath = path.join(opts.out, "manifest.json");
    await fsp.mkdir(opts.out, { recursive: true });
    await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✅ manifest: ${manifestPath}`);
  }

  console.log(`\n📊 총 ${grandTotal.toLocaleString()}행`);
  if (skippedParts.length > 0) {
    // CI 가 성공으로 읽지 않게 한다 — 결손 빌드가 조용히 배포되는 것을 막는 유일한 관문이다.
    console.error(`\n❌ 변환 결손 ${skippedParts.length}개 파트 — manifest.skippedParts 참조`);
    for (const sp of skippedParts) console.error(`   · ${sp.label}: ${sp.reason}`);
    process.exitCode = 1;
  }
}

// ────────────────────────────── 열거 (S1) ──────────────────────────────

async function enumerateParts(inputDir: string): Promise<SourcePart[]> {
  let names: string[];
  try {
    names = await fsp.readdir(inputDir);
  } catch {
    return [];
  }
  // macOS는 파일명을 NFD로 저장하기도 한다 — 배포본마다 정규화가 섞여 있어(실측)
  // NFC로 통일하지 않으면 파일명 매칭·기준일 추출이 조용히 빗나간다.
  const files = names
    .map((n) => n.normalize("NFC"))
    .filter((n) => !n.startsWith(".") && !/분류코드표/.test(n) && !/\.pdf$/i.test(n))
    .sort();

  const parts: SourcePart[] = [];
  for (const name of files) {
    const filePath = path.join(inputDir, name);
    const stat = await fsp.stat(filePath).catch(() => null);
    if (!stat?.isFile()) continue;

    // ⚠️ 확장자를 신뢰하지 않는다 — `…(2020년1월1일기준).zip`은 실체가 CSV였고,
    //    이를 "손상 zip"으로 오판해 멀쩡한 721,852행을 결손 처리한 실제 사고가 있다.
    const head = Buffer.alloc(4);
    const fh = await fsp.open(filePath, "r");
    await fh.read(head, 0, 4, 0);
    await fh.close();

    if (sniffKind(head) === "text") {
      parts.push({
        sourceFile: name,
        label: name,
        timestamp: 0,
        rows: () => csvRows(() => Promise.resolve(fs.createReadStream(filePath))),
      });
      continue;
    }

    let entries;
    try {
      entries = await readZipEntries(filePath);
    } catch (err) {
      console.warn(`⚠️  zip 해제 실패 — 건너뜀: ${name} (${(err as Error).message})`);
      continue;
    }
    for (const entry of entries) {
      const entryName = entry.name.normalize("NFC");
      if (/법정동/.test(entryName)) continue;
      if (/\.csv$/i.test(entryName)) {
        parts.push({
          sourceFile: name,
          label: `${name} → ${entryName}`,
          timestamp: entry.timestamp,
          rows: () => csvRows(() => openZipEntry(filePath, entry)),
        });
      } else if (/\.xlsx$/i.test(entryName)) {
        const cachePath = path.join(inputDir, CACHE_DIR, `${name}.xlsx`);
        parts.push({
          sourceFile: name,
          label: `${name} → ${entryName}`,
          timestamp: entry.timestamp,
          rows: () =>
            xlsxRows(async () => {
              await fsp.mkdir(path.dirname(cachePath), { recursive: true });
              if (!fs.existsSync(cachePath)) {
                console.log(`   …xlsx 추출 중: ${entryName}`);
                await extractZipEntry(filePath, entry, cachePath);
              }
              return cachePath;
            }),
        });
      }
    }
  }
  return parts;
}

// ────────────────────────────── 파싱 (S2) ──────────────────────────────

async function* csvRows(open: () => Promise<Readable>): AsyncGenerator<string[]> {
  const encoding = await detectStreamEncoding(open);
  const stream = (await open()).pipe(iconv.decodeStream(encoding));
  let buf = "";
  for await (const chunk of stream) {
    buf += chunk as string;
    let nl = buf.indexOf("\n");
    while (nl !== -1) {
      const line = buf.slice(0, nl).replace(/\r$/, "");
      if (line.length > 0) yield splitCsvLine(line);
      buf = buf.slice(nl + 1);
      nl = buf.indexOf("\n");
    }
  }
  const last = buf.replace(/\r$/, "");
  if (last.length > 0) yield splitCsvLine(last);
}

/** UTF-8 / EUC-KR 자동 감지 — cp949로 UTF-8을 읽으면 조용히 깨진다. */
/**
 * 버퍼 끝의 **불완전한 UTF-8 시퀀스**를 잘라낸다 — 스트림을 8KB 에서 끊었을 뿐인데
 * 마지막 문자가 반토막 나서 `fatal` 디코더가 실패하는 것을 막는다.
 * 선두 바이트를 뒤에서부터 최대 3바이트 훑어, 그 문자가 버퍼 안에서 끝나지 않으면 거기서 자른다.
 */
function trimIncompleteUtf8(buf: Buffer): Buffer {
  for (let back = 1; back <= 3 && back <= buf.length; back++) {
    const b = buf[buf.length - back];
    if (b < 0x80) break; // ASCII — 경계가 깨끗하다
    if (b >= 0xc0) {
      // 선두 바이트 — 이 문자의 길이를 재서 버퍼 안에서 끝나는지 본다
      const len = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : 2;
      return back < len ? buf.subarray(0, buf.length - back) : buf;
    }
    // 계속 바이트(0x80~0xBF) — 더 앞으로
  }
  return buf;
}

async function detectStreamEncoding(open: () => Promise<Readable>): Promise<string> {
  const stream = await open();
  let head: Buffer = Buffer.alloc(0);
  for await (const chunk of stream) {
    head = Buffer.concat([head, chunk as Buffer]);
    if (head.length >= 8192) break;
  }
  stream.destroy();
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) return "utf-8";
  try {
    // ⚠️ 종전에는 선두 4,096바이트만 잘라 판별했다 — 4096번째가 다중바이트
    //    문자 중간이면 BOM 없는 정상 UTF-8 이 cp949 로 오판되고, 헤더가 깨져 필수 컬럼 14개가
    //    전부 누락으로 보고되어 그 파트가 통째로 스킵된다(F-21).
    //    설계문서는 「선두 8KB 로 판별」인데 구현만 4KB 였다.
    //    ⇒ 절단하지 않되, 스트림 경계에서 잘린 **마지막 불완전 시퀀스만** 떼고 판별한다.
    new TextDecoder("utf-8", { fatal: true }).decode(trimIncompleteUtf8(head));
    return "utf-8";
  } catch {
    return "cp949";
  }
}

async function* xlsxRows(resolvePath: () => Promise<string>): AsyncGenerator<string[]> {
  const p = await resolvePath();
  yield* readXlsxRows(p);
}

/** 헤더 + 첫 데이터 행을 읽어 컬럼 인덱스·세대·고시일자를 확정. */
async function probePart(
  part: SourcePart,
  skipped: { label: string; reason: string }[],
): Promise<ProbedPart | null> {
  const it = part.rows();
  const header = await it.next();
  if (header.done) {
    console.warn(`⚠️  빈 원본 — 건너뜀: ${part.label}`);
    return null;
  }
  const first = await it.next();
  if (first.done) {
    console.warn(`⚠️  데이터 행 없음 — 건너뜀: ${part.label}`);
    skipped.push({ label: part.label, reason: "데이터 행 없음" });
    return null;
  }
  await it.return?.(undefined);

  const columnIndex = buildColumnIndex(header.value);
  const missing = missingColumns(columnIndex);
  if (missing.length > 0) {
    console.warn(`⚠️  필수 컬럼 누락(${missing.join(",")}) — 건너뜀: ${part.label}`);
    skipped.push({ label: part.label, reason: "필수 컬럼 누락" });
    return null;
  }
  const noticeDate = normalizeNoticeDate(first.value[columnIndex["고시일자"]] ?? "");
  if (!noticeDate) {
    console.warn(`⚠️  고시일자 해석 불가 — 건너뜀: ${part.label}`);
    skipped.push({ label: part.label, reason: "고시일자 해석 불가" });
    return null;
  }
  const generation = detectGeneration(header.value.join(","), first.value, columnIndex);
  console.log(`   ${noticeDate} [${generation}] ${part.label}`);
  return { ...part, noticeDate, columnIndex, generation };
}

// ───────────────────────── 중복 배포본 해소 (S4) ─────────────────────────

/**
 * 고시일자별 채택 파트 확정.
 *
 * 분할 파트(2019 `2-1`/`2-2`)와 중복 배포본(2022 `1월1일`/`2월28일`)의 구분은
 * **파일명 기준일**로 한다 — 분할 파트는 기준일이 같고, 중복 배포본은 다르다.
 */
function resolveDeployments(parts: readonly ProbedPart[]): {
  byDate: Map<string, ProbedPart[]>;
  supersededLog: Map<string, string[]>;
} {
  const grouped = new Map<string, Map<string, ProbedPart[]>>();
  for (const p of parts) {
    const deployKey = extractDeploymentKey(p.sourceFile);
    if (!grouped.has(p.noticeDate)) grouped.set(p.noticeDate, new Map());
    const inner = grouped.get(p.noticeDate)!;
    if (!inner.has(deployKey)) inner.set(deployKey, []);
    inner.get(deployKey)!.push(p);
  }

  const byDate = new Map<string, ProbedPart[]>();
  const supersededLog = new Map<string, string[]>();

  for (const [date, deployments] of grouped) {
    if (deployments.size === 1) {
      byDate.set(date, [...deployments.values()][0]);
      continue;
    }
    const candidates = [...deployments.entries()].map(([key, ps]) => ({
      fileName: key,
      entryTimestamp: Math.max(...ps.map((p) => p.timestamp)),
    }));
    const { adopted, superseded } = pickAdoptedDeployment(candidates);
    byDate.set(date, deployments.get(adopted.fileName)!);
    supersededLog.set(
      date,
      superseded.flatMap((s) => [...new Set(deployments.get(s.fileName)!.map((p) => p.sourceFile))]),
    );
    console.log(
      `   ↪ ${date} 중복 배포본 ${deployments.size}종 → 채택 "${adopted.fileName}", 폐기 ${superseded
        .map((s) => `"${s.fileName}"`)
        .join(", ")}`,
    );
  }
  return { byDate, supersededLog };
}

/** 배포본 그룹 키 = 파일명 기준일 표기. 표기가 없으면 파일명 자체(단독 배포 가정). */
function extractDeploymentKey(fileName: string): string {
  const m = /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(fileName);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const ymd = /(\d{4})(\d{2})(\d{2})/.exec(fileName);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  return fileName;
}

// ─────────────────────── 파티션 분할·기록 (S5·S6) ───────────────────────

async function buildNoticeDate(
  date: string,
  parts: readonly ProbedPart[],
  opts: CliOptions,
): Promise<NoticeStats> {
  const buckets = new Map<string, StdPriceUnit[]>();
  const stats: NoticeStats = {
    rows: 0,
    skipped: 0,
    hoRestored: 0,
    unjoinable: 0,
    duplicateKeys: 0,
    conflictingKeys: 0,
    sigungus: [],
  };

  for (const part of parts) {
    let isFirst = true;
    for await (const fields of part.rows()) {
      if (isFirst) {
        isFirst = false; // 헤더 행
        continue;
      }
      const parsed = parseRow(fields, part.columnIndex);
      if (!parsed) {
        stats.skipped++;
        continue;
      }
      if (parsed.noticeDate !== date) {
        stats.skipped++;
        continue;
      }
      if (parsed.hoRestored) stats.hoRestored++;
      if (parsed.unit.s !== "0" && parsed.unit.s !== "1") stats.unjoinable++;
      stats.rows++;

      const sigungu = sigunguOf(parsed.unit.b);
      const bucket = buckets.get(sigungu);
      if (bucket) bucket.push(parsed.unit);
      else buckets.set(sigungu, [parsed.unit]);
    }
  }

  stats.sigungus = [...buckets.keys()].sort();

  for (const [sigungu, units] of buckets) {
    const result = dedupe(units);
    stats.duplicateKeys += result.exactDuplicates;
    stats.conflictingKeys += result.conflictingKeys;
    if (opts.dryRun) continue;
    const dir = path.join(opts.out, "commercial", sigungu);
    await fsp.mkdir(dir, { recursive: true });
    const gz = zlib.gzipSync(Buffer.from(JSON.stringify(result.units), "utf8"), { level: 9 });
    await fsp.writeFile(path.join(dir, `${date}.json.gz`), gz);
  }

  console.log(
    `   ✔ ${date}: ${stats.rows.toLocaleString()}행 · 시군구 ${stats.sigungus.length} · 호복원 ${stats.hoRestored} · 조인불가 ${stats.unjoinable} · 완전중복 ${stats.duplicateKeys} · 키충돌 ${stats.conflictingKeys} · skip ${stats.skipped}`,
  );
  return stats;
}

/**
 * 완전 동일 행(키 + 가격·면적까지 동일)만 제거한다.
 *
 * ⚠️ **키만으로 중복 제거하면 실물건이 소실된다.** 2017년 실측 — 키 중복 1,378건 중
 *    **454건은 면적이 다르다**(건원베스트원 1층 102호: 14.35㎡ / 40.59㎡, 가격은 동일).
 *    면적은 `호별총액 = floor(단가 × (전용+공유))`의 직접 곱수라 잘못 버리면 세액이 틀린다.
 *    → 페이로드가 다른 행은 **둘 다 보존**하고 건수를 manifest에 남긴다(Phase 2가
 *      "키 모호" 시 자동 충전을 막는 근거로 쓴다).
 *
 * 정렬은 결정적 산출물(재빌드 diff 0)을 위한 것.
 */
function dedupe(units: readonly StdPriceUnit[]): {
  units: StdPriceUnit[];
  exactDuplicates: number;
  conflictingKeys: number;
} {
  const seenRow = new Set<string>();
  const payloadByKey = new Map<string, string>();
  const conflictKeys = new Set<string>();
  const out: StdPriceUnit[] = [];
  let exactDuplicates = 0;

  for (const u of units) {
    const key = `${parcelKey(u)}|${unitKey(u)}`;
    const payload = `${u.p}|${u.ea}|${u.sa}|${u.k}`;
    if (seenRow.has(`${key}|${payload}`)) {
      exactDuplicates++;
      continue;
    }
    seenRow.add(`${key}|${payload}`);
    const prev = payloadByKey.get(key);
    if (prev === undefined) payloadByKey.set(key, payload);
    else if (prev !== payload) conflictKeys.add(key);
    out.push(u);
  }
  out.sort((a, b) => {
    if (a.b !== b.b) return a.b.localeCompare(b.b);
    if (a.s !== b.s) return a.s.localeCompare(b.s);
    if (a.bn !== b.bn) return a.bn - b.bn;
    if (a.jn !== b.jn) return a.jn - b.jn;
    const ka = unitKey(a);
    const kb = unitKey(b);
    if (ka !== kb) return ka.localeCompare(kb);
    // 키가 같은 보존 행끼리도 순서를 고정한다
    return `${a.p}|${a.ea}|${a.sa}`.localeCompare(`${b.p}|${b.ea}|${b.sa}`);
  });
  return { units: out, exactDuplicates, conflictingKeys: conflictKeys.size };
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    input: "data/raw/stdprice",
    out: "data/stdprice",
    only: null,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input" && argv[i + 1]) opts.input = argv[++i];
    else if (arg === "--out" && argv[i + 1]) opts.out = argv[++i];
    else if (arg === "--only" && argv[i + 1]) opts.only = argv[++i];
    else if (arg === "--dry-run") opts.dryRun = true;
  }
  return opts;
}

main().catch((err) => {
  console.error("❌ 변환 실패:", err);
  process.exit(1);
});
