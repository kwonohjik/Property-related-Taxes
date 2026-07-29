/**
 * 스트리밍 zip 리더 — 내장 `zlib`만 사용 (빌드 스크립트 전용 I/O 프리미티브).
 *
 * 전용 모듈로 분리한 이유:
 *   1. 엔트리명이 **cp949**인 zip이 실재한다(2023 배포본 실측 — 표준 unzip은
 *      `Illegal byte sequence`로 실패). 이름 디코딩을 직접 통제해야 한다.
 *   2. 엔트리 1개가 340MB(xlsx 시트 XML)에 달해 **전량 버퍼링이 불가**하다.
 *      adm-zip·jszip은 엔트리를 통째로 메모리에 올린다.
 *
 * ZIP64 미지원 — 대상 아카이브는 전부 4GB 미만이다(최대 161MB, 엔트리 최대 341MB 실측).
 * 설계: docs/02-design/features/commercial-officetel-standard-price-lookup.engine.design.md §S1
 */

import * as fs from "fs";
import * as fsp from "fs/promises";
import * as zlib from "zlib";
import { Readable } from "stream";
import * as iconv from "iconv-lite";

export interface ZipEntry {
  /** cp949/UTF-8 판별 후 디코딩된 엔트리명 */
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  /** DOS 타임스탬프 → epoch ms (중복 배포본 채택 판정용 — 파일 mtime 대용) */
  timestamp: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CD_SIGNATURE = 0x02014b50;
const MAX_EOCD_SCAN = 65_557; // 22 + 최대 comment 65,535

/** 중앙 디렉터리를 읽어 엔트리 목록 반환. */
export async function readZipEntries(filePath: string): Promise<ZipEntry[]> {
  const handle = await fsp.open(filePath, "r");
  try {
    const { size } = await handle.stat();
    const tailLen = Math.min(MAX_EOCD_SCAN, size);
    const tail = Buffer.alloc(tailLen);
    await handle.read(tail, 0, tailLen, size - tailLen);

    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === EOCD_SIGNATURE) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error(`EOCD를 찾을 수 없음 (zip 아님?): ${filePath}`);

    const entryCount = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);

    const cd = Buffer.alloc(cdSize);
    await handle.read(cd, 0, cdSize, cdOffset);

    const entries: ZipEntry[] = [];
    let p = 0;
    for (let i = 0; i < entryCount && p + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(p) !== CD_SIGNATURE) break;
      const flags = cd.readUInt16LE(p + 8);
      const method = cd.readUInt16LE(p + 10);
      const dosTime = cd.readUInt16LE(p + 12);
      const dosDate = cd.readUInt16LE(p + 14);
      const compressedSize = cd.readUInt32LE(p + 20);
      const uncompressedSize = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const localOffset = cd.readUInt32LE(p + 42);
      const nameBytes = cd.subarray(p + 46, p + 46 + nameLen);

      entries.push({
        // UTF-8 플래그(bit 11)가 없으면 cp949로 읽는다 — 한국 공공데이터 배포본 규약
        name: flags & 0x800 ? nameBytes.toString("utf8") : iconv.decode(nameBytes, "cp949"),
        method,
        compressedSize,
        uncompressedSize,
        localOffset,
        timestamp: dosToEpochMs(dosDate, dosTime),
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  } finally {
    await handle.close();
  }
}

/** 엔트리 압축 해제 스트림. 로컬 헤더의 가변 길이를 읽어 데이터 오프셋을 확정한다. */
export async function openZipEntry(filePath: string, entry: ZipEntry): Promise<Readable> {
  const handle = await fsp.open(filePath, "r");
  let dataOffset: number;
  try {
    const local = Buffer.alloc(30);
    await handle.read(local, 0, 30, entry.localOffset);
    const nameLen = local.readUInt16LE(26);
    const extraLen = local.readUInt16LE(28);
    dataOffset = entry.localOffset + 30 + nameLen + extraLen;
  } finally {
    await handle.close();
  }

  const raw = fs.createReadStream(filePath, {
    start: dataOffset,
    end: dataOffset + entry.compressedSize - 1,
  });
  if (entry.method === 0) return raw;
  if (entry.method === 8) return raw.pipe(zlib.createInflateRaw());
  throw new Error(`지원하지 않는 압축 방식 ${entry.method}: ${entry.name}`);
}

/** 엔트리를 디스크로 추출 (xlsx처럼 랜덤 액세스가 필요한 중첩 아카이브용). */
export async function extractZipEntry(
  filePath: string,
  entry: ZipEntry,
  destPath: string,
): Promise<void> {
  const src = await openZipEntry(filePath, entry);
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(destPath);
    src.on("error", reject);
    out.on("error", reject);
    out.on("finish", () => resolve());
    src.pipe(out);
  });
}

/** 엔트리 전량을 Buffer로 (sharedStrings.xml 등 소형 엔트리 전용). */
export async function readZipEntryBuffer(filePath: string, entry: ZipEntry): Promise<Buffer> {
  const src = await openZipEntry(filePath, entry);
  const chunks: Buffer[] = [];
  for await (const c of src) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

function dosToEpochMs(dosDate: number, dosTime: number): number {
  const year = ((dosDate >> 9) & 0x7f) + 1980;
  const month = (dosDate >> 5) & 0x0f;
  const day = dosDate & 0x1f;
  const hour = (dosTime >> 11) & 0x1f;
  const minute = (dosTime >> 5) & 0x3f;
  const second = (dosTime & 0x1f) * 2;
  return Date.UTC(year, Math.max(0, month - 1), day || 1, hour, minute, second);
}
