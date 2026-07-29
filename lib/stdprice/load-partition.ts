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

// `pickNoticeDate`는 클라이언트(모달)와 공용이라 `fs` 의존이 없는 별도 모듈에 둔다.
export { pickNoticeDate, guessNoticeDate } from "./pick-notice-date";

/** 테스트 전용 — 프로세스 캐시 초기화. */
export function __resetStdPriceCaches(): void {
  partitionCache.clear();
  manifestCache = null;
}

/** 데이터 디렉터리 존재 여부 (라우트 진단 메시지용). */
export function stdPriceDataDirExists(): boolean {
  return fs.existsSync(path.join(dataDir(), "manifest.json"));
}
