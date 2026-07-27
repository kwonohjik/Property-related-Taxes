/**
 * 상업용건물·오피스텔 기준시가 파티션 로더 — 로컬 FS + gzip.
 *
 * 구현체가 하나뿐이므로 interface + class 2단 구성을 만들지 않는다(Simplicity First).
 * **원격(Supabase Storage 등) 전환 시 이 파일 1개만 교체**한다 — 라우트는 이 3개 함수만 안다.
 *
 * 설계: docs/02-design/features/commercial-officetel-standard-price-lookup.engine.design.md §3-1·§3-3
 */

import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import * as zlib from "zlib";
import { promisify } from "util";
import type { StdPriceManifest, StdPriceUnit } from "./types";

const gunzip = promisify(zlib.gunzip);

/** 파티션 LRU 상한. 3시점 × 동시 사용자 소수를 상정한 값(설계 §3-1). */
const PARTITION_CACHE_MAX = 8;

const partitionCache = new Map<string, StdPriceUnit[]>();
let manifestCache: { mtimeMs: number; value: StdPriceManifest } | null = null;

/**
 * 데이터 루트. 기본은 리포지토리의 `data/stdprice`(빌드 산출물, gitignore).
 * `STDPRICE_DATA_DIR`는 **테스트·원격 마운트 전용 override**다 — 런타임 분기 목적이 아니다.
 */
function dataDir(): string {
  return process.env.STDPRICE_DATA_DIR ?? path.join(process.cwd(), "data", "stdprice");
}

/**
 * 시군구 × 고시일자 파티션 로드. 파일이 없으면 `null`.
 *
 * `null`은 "그 지역·그 해에 고시가 없었다"와 다르다 — 그 판정은 manifest의
 * `notice.sigungus`가 담당한다(라우트 §3-2 판정 순서).
 */
export async function loadPartition(
  sigungu: string,
  noticeDate: string,
): Promise<StdPriceUnit[] | null> {
  if (!/^\d{5}$/.test(sigungu) || !/^\d{4}-\d{2}-\d{2}$/.test(noticeDate)) return null;

  const cacheKey = `${sigungu}/${noticeDate}`;
  const cached = partitionCache.get(cacheKey);
  if (cached) {
    // LRU — 최근 사용을 뒤로 보낸다
    partitionCache.delete(cacheKey);
    partitionCache.set(cacheKey, cached);
    return cached;
  }

  const file = path.join(dataDir(), "commercial", sigungu, `${noticeDate}.json.gz`);
  let raw: Buffer;
  try {
    raw = await fsp.readFile(file);
  } catch {
    return null;
  }

  const units = JSON.parse((await gunzip(raw)).toString("utf8")) as StdPriceUnit[];
  partitionCache.set(cacheKey, units);
  if (partitionCache.size > PARTITION_CACHE_MAX) {
    const oldest = partitionCache.keys().next().value;
    if (oldest !== undefined) partitionCache.delete(oldest);
  }
  return units;
}

/**
 * manifest 로드. 프로세스 메모리 캐시 + mtime 무효화 —
 * 매 요청 디스크 읽기를 피하면서 개발 중 재빌드는 반영된다.
 */
export async function loadManifest(): Promise<StdPriceManifest | null> {
  const file = path.join(dataDir(), "manifest.json");
  let mtimeMs: number;
  try {
    mtimeMs = (await fsp.stat(file)).mtimeMs;
  } catch {
    return null;
  }
  if (manifestCache && manifestCache.mtimeMs === mtimeMs) return manifestCache.value;

  const value = JSON.parse(await fsp.readFile(file, "utf8")) as StdPriceManifest;
  manifestCache = { mtimeMs, value };
  return value;
}

/**
 * 기준일 이하 고시일자 중 최대. 없으면 null.
 *
 * **기존 헬퍼와의 관계 (dual-truth 회피)** — `lib/hooks/useStandardPriceLookup.ts:35`의
 * `getDefaultPriceYear`는 **달력 cutoff**(토지 5/31·주택 4/29)로 공시연도를 *추정*한다.
 * 그 데이터에는 고시일이 없기 때문이다. 상가 기준시가는 **고시일자가 데이터에 실재**하므로
 * 추정이 불필요하다 — 두 헬퍼는 대상이 달라 dual-truth가 아니다.
 *
 * ⚠️ `getDefaultPriceYear`·`recommendLandPriceYear` 재사용 금지 — 시행 6/1·4/30 전제의
 *    보정이 들어 있는데 기준시가는 **시행 1/1**이라 보정이 없어야 한다.
 *
 * 법령 근거: 소득세법 시행령 §164③ — "새로운 기준시가가 고시되기 전에 취득 또는 양도하는
 * 경우에는 직전의 기준시가에 의한다." 고시 시점 = 시행일 1/1
 * (「2025년 오피스텔 및 상업용 건물에 대한 기준시가 고시」 국세청고시 제2024-39호, [시행 2025.1.1.]).
 */
export function pickNoticeDate(
  availableDates: readonly string[],
  refDate: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(refDate)) return null;
  let best: string | null = null;
  for (const d of availableDates) {
    if (d <= refDate && (best === null || d > best)) best = d;
  }
  return best;
}

/** 테스트 전용 — 프로세스 캐시 초기화. */
export function __resetStdPriceCaches(): void {
  partitionCache.clear();
  manifestCache = null;
}

/** 데이터 디렉터리 존재 여부 (라우트 진단 메시지용). */
export function stdPriceDataDirExists(): boolean {
  return fs.existsSync(path.join(dataDir(), "manifest.json"));
}
