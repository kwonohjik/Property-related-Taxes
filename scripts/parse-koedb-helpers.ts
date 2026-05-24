/**
 * KOEDB 파싱 보조 헬퍼 — 800줄 정책 분리 sibling (E3 정정).
 *
 * 본 파일 책임:
 *   - 인코딩 자동 감지 (UTF-8 BOM + EUC-KR fallback)
 *   - 행 파싱 (TAB 또는 공백 다중 구분)
 *   - 시·군·구 필터링 (10자리 코드 분석)
 *   - kind 자동 분류 (inferKind — 코드 prefix 기반)
 *   - 시드 13건 정합 검증
 *
 * 관련 계획서: docs/00-pm/inheritance-farming-build-scripts-prefab.plan.md v2 §2-1A·§2-4A
 */

import * as iconv from "iconv-lite";
import type { SigunguEntry, SIGUNGU_LIST } from "@/lib/geo/sigungu-code-list";

export type SigunguKind = SigunguEntry["kind"];

/**
 * KOEDB 파싱 결과 (10자리 코드 + 명칭 + "존재"/"폐지").
 */
export interface KoedbRow {
  code: string;
  name: string; // full name (예: "서울특별시 종로구")
  active: boolean; // "존재" === true
}

/**
 * UTF-8 / EUC-KR 자동 감지 (§2-1A 정정).
 * 1. UTF-8 BOM 검사 (EF BB BF)
 * 2. TextDecoder fatal mode 검증
 * 3. 실패 시 EUC-KR fallback
 */
export function detectEncoding(buf: Buffer): "utf-8" | "euc-kr" {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return "utf-8";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf.subarray(0, 8192));
    return "utf-8";
  } catch {
    return "euc-kr";
  }
}

/**
 * Buffer → text (인코딩 자동 감지 + 디코드).
 */
export function decodeKoedb(buf: Buffer): string {
  const encoding = detectEncoding(buf);
  if (encoding === "utf-8") {
    // BOM 제거
    const start = buf[0] === 0xef ? 3 : 0;
    return new TextDecoder("utf-8").decode(buf.subarray(start));
  }
  return iconv.decode(buf, "euc-kr");
}

/**
 * 행 파싱 — TAB 또는 공백 다중 구분.
 * 헤더 행("법정동코드", "법정동명") 자동 skip.
 */
export function parseKoedbRows(text: string): KoedbRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const rows: KoedbRow[] = [];

  for (const line of lines) {
    // TAB 우선, 없으면 공백 2+
    const parts = line.includes("\t")
      ? line.split("\t").map((p) => p.trim())
      : line.split(/\s{2,}/).map((p) => p.trim());

    if (parts.length < 2) continue;

    const code = parts[0];
    // 10자리 숫자 코드만 (헤더·잡음 제외)
    if (!/^\d{10}$/.test(code)) continue;

    const name = parts[1];
    const activeRaw = parts[2] ?? "존재"; // 폐지여부 컬럼 누락 시 active 가정
    const active = !activeRaw.includes("폐지");

    rows.push({ code, name, active });
  }

  return rows;
}

/**
 * 시·군·구 필터링 — 10자리 코드 분석.
 *   - 시·도 (1100000000 등 1·2자리 외 모두 0): 제외
 *   - 시·군·구 (앞 5자리 != "00000" AND 뒷 5자리 == "00000"): 선택
 *   - 동·리 (뒷 5자리 != "00000"): 제외
 * 단, 일반시 산하 일반구는 코드[5:7] != "00" — 별도 처리.
 */
export function isSigunguCode(code: string): boolean {
  if (!/^\d{10}$/.test(code)) return false;
  // 시·도 (앞 2자리만 유효, 뒤 8자리 0)
  if (code.slice(2) === "00000000") return false;
  // 시·군·구 또는 일반구: 뒤 4자리 "0000"
  if (code.slice(6) !== "0000") return false;
  return true;
}

/**
 * kind 자동 분류 — §2-4A 정정.
 * 행안부 코드 prefix + 명칭 패턴 기반.
 */
export function inferKind(code: string, fullName: string): SigunguKind {
  const sidoCode2 = code.slice(0, 2);
  const sigunguName = extractSigunguName(fullName);

  // SCL-4: 특별자치시 (세종 36 — 단일 entry "세종특별자치시")
  // 코드 3611000000은 시·군·구 layer가 없는 직접 자치시
  if (sidoCode2 === "36") return "special_self_governing_city";

  // SCL-5: 행정시 (제주 50)
  if (sidoCode2 === "50") return "administrative_city";

  // SCL-1: 광역시 자치구 (서울 11·부산 26·대구 27·인천 28·광주 29·대전 30·울산 31)
  const METROPOLITAN_PREFIXES = ["11", "26", "27", "28", "29", "30", "31"];
  if (METROPOLITAN_PREFIXES.includes(sidoCode2)) {
    if (sigunguName.endsWith("군")) return "county"; // 강화·옹진·달성·기장·울주
    return "autonomous_district";
  }

  // 도(41~48·강원 51·전북 52) — 일반시·일반구·군 구분
  // 행안부 10자리: 시·도(2) + 시·군·구(3) + 동·리(5).
  // 일반시 본체: code[4] === "0" (예: 4111000000 수원시, 4146000000 용인시)
  // 일반구: code[4] !== "0" (예: 4111700000 수원시 영통구, 4146300000 용인시 기흥구)
  const code4 = code[4];
  if (code4 !== "0") return "general_district";

  // SCL-2: 일반시·군
  if (sigunguName.endsWith("군")) return "county";
  if (sigunguName.endsWith("시")) return "city";
  return "city"; // 안전 fallback
}

/**
 * fullName에서 시·군·구 부분만 추출.
 *   "서울특별시 종로구" → "종로구"
 *   "경기도 수원시 영통구" → "수원시 영통구"
 *   "세종특별자치시" → "세종특별자치시" (sido와 동일)
 */
export function extractSigunguName(fullName: string): string {
  const parts = fullName.split(/\s+/);
  if (parts.length === 1) return fullName; // 세종·시·도 단일
  return parts.slice(1).join(" "); // 시·도 제외
}

/**
 * fullName에서 시·도 추출.
 *   "서울특별시 종로구" → "서울특별시"
 */
export function extractSidoName(fullName: string): string {
  const parts = fullName.split(/\s+/);
  return parts[0];
}

/**
 * KoedbRow → SigunguEntry 변환.
 */
export function toSigunguEntry(row: KoedbRow): SigunguEntry {
  return {
    code: row.code,
    fullName: row.name,
    sidoName: extractSidoName(row.name),
    sigunguName: extractSigunguName(row.name),
    kind: inferKind(row.code, row.name),
  };
}

/**
 * 시드 entry vs KOEDB 파싱 결과 정합 검증.
 * 시드 코드가 KOEDB에 모두 존재 + 명칭·kind 일치해야 함.
 * 불일치 1건이라도 시 abort.
 */
export function validateSeedConsistency(
  seedList: ReadonlyArray<SigunguEntry>,
  parsed: ReadonlyArray<SigunguEntry>,
): { ok: true } | { ok: false; mismatches: string[] } {
  const parsedMap = new Map(parsed.map((e) => [e.code, e]));
  const mismatches: string[] = [];

  for (const seed of seedList) {
    const p = parsedMap.get(seed.code);
    if (!p) {
      mismatches.push(`시드 ${seed.code} (${seed.fullName}) — KOEDB 미존재`);
      continue;
    }
    if (p.fullName !== seed.fullName) {
      mismatches.push(
        `시드 ${seed.code}: 시드="${seed.fullName}" vs KOEDB="${p.fullName}"`,
      );
    }
    if (p.kind !== seed.kind) {
      mismatches.push(
        `시드 ${seed.code} (${seed.fullName}): kind 시드=${seed.kind} vs 자동분류=${p.kind}`,
      );
    }
  }

  return mismatches.length === 0 ? { ok: true } : { ok: false, mismatches };
}

/**
 * TypeScript 모듈 코드 생성 (lib/geo/sigungu-code-list.ts 덮어쓰기용).
 */
export function generateTsModule(
  entries: ReadonlyArray<SigunguEntry>,
  buildDate: string,
): string {
  const sorted = [...entries].sort((a, b) => a.code.localeCompare(b.code));
  const lines = sorted.map((e) =>
    `  { code: ${JSON.stringify(e.code)}, fullName: ${JSON.stringify(e.fullName)}, sidoName: ${JSON.stringify(e.sidoName)}, sigunguName: ${JSON.stringify(e.sigunguName)}, kind: ${JSON.stringify(e.kind)} },`,
  );

  return `/**
 * 행정안전부 표준 시·군·구 코드 목록 (10자리 + 명칭 매핑).
 *
 * **자동 생성 파일** — scripts/parse-koedb-txt.ts 실행 산출물.
 * 수동 편집 금지. KOEDB 갱신 시 \`npm run build:sigungu\` 재실행.
 *
 * 빌드 일자: ${buildDate}
 * 데이터 출처: 행정안전부 KOEDB 법정동코드 (공공누리 1유형)
 * Entry 수: ${sorted.length}건
 */

export interface SigunguEntry {
  /** 행안부 표준 10자리 (앞 5자리 = 시·군·구, 뒤 5자리 = 0 패딩) */
  code: string;
  /** 정식 명칭 (예: "서울특별시 강남구") */
  fullName: string;
  /** 시·도 명 (예: "서울특별시") */
  sidoName: string;
  /** 시·군·구 명 (예: "강남구") */
  sigunguName: string;
  /** 자치권·시·군·자치시·행정시 구분 */
  kind:
    | "autonomous_district"           // 광역시 자치구 (서울 25 + 5대 광역시)
    | "general_district"              // 일반시 산하 일반구 (수원·성남·고양·용인 등)
    | "city"                          // 일반 시
    | "county"                        // 군
    | "administrative_city"           // 행정시 (제주 — 특별법)
    | "special_self_governing_city";  // 특별자치시 (세종)
}

export const SIGUNGU_LIST: SigunguEntry[] = [
${lines.join("\n")}
];

/** 빌드 일자 (KOEDB 파싱 시점 ISO date). */
export const SIGUNGU_BUILD_VERSION = ${JSON.stringify(buildDate)};

/**
 * 행안부 10자리 코드로 entry 검색.
 * 미등록 코드 시 undefined.
 */
export function findSigungu(code: string): SigunguEntry | undefined {
  return SIGUNGU_LIST.find((s) => s.code === code);
}

/** 시드 entry 개수 (검증·디버깅용). */
export function getSigunguListSize(): number {
  return SIGUNGU_LIST.length;
}
`;
}

// circular import 회피 — type only re-export
export type { SigunguEntry } from "@/lib/geo/sigungu-code-list";
export { SIGUNGU_LIST };
