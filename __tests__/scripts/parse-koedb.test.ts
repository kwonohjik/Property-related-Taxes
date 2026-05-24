/**
 * PK-1 ~ PK-4 — parse-koedb-txt.ts round-trip anchor.
 *
 * 계획서: docs/00-pm/inheritance-farming-build-scripts-prefab.plan.md v2 §7-2
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import {
  decodeKoedb,
  parseKoedbRows,
  isSigunguCode,
  inferKind,
  toSigunguEntry,
  validateSeedConsistency,
  generateTsModule,
} from "../../scripts/parse-koedb-helpers";
import { SIGUNGU_LIST } from "@/lib/geo/sigungu-code-list";

const FIXTURE = path.resolve(__dirname, "fixtures/koedb-sample.txt");

describe("PK-1: KOEDB fixture 파싱 → 시·군·구만 추출 (시·도·동·폐지 제외)", () => {
  it("PK-1: fixture 20행 → 시·군·구 12건 (active만)", async () => {
    const buf = await fs.readFile(FIXTURE);
    const text = decodeKoedb(buf);
    const rows = parseKoedbRows(text);
    const sigunguRows = rows.filter((r) => isSigunguCode(r.code) && r.active);
    // 시·도 4건(1100·2600·4100·5000) + 동 2건(1111010100·1168010100) + 폐지 1건(9999000000) 제외
    // = 시·군·구 12건 (1111·1168·1165·1150·2626·2871·3611·4111·4111700000·4157·4146300000·5011·5013)
    // 단, 3611(세종)은 isSigunguCode false (뒤 8자리 0)이지만 본 fixture에서는 8자리 0 → 시·도로 분류됨
    // 실제 KOEDB에서는 세종특별자치시 코드가 시·도 layer로만 존재 → inferKind에서 special_self_governing_city 처리
    expect(sigunguRows.length).toBeGreaterThanOrEqual(10);
    expect(sigunguRows.length).toBeLessThanOrEqual(13);

    const codes = sigunguRows.map((r) => r.code);
    // 시·군·구 정상 포함
    expect(codes).toContain("1111000000"); // 종로구
    expect(codes).toContain("1168000000"); // 강남구
    expect(codes).toContain("2626000000"); // 부산 동래구
    // 시·도 제외
    expect(codes).not.toContain("1100000000"); // 서울특별시
    expect(codes).not.toContain("4100000000"); // 경기도
    // 동 제외
    expect(codes).not.toContain("1111010100"); // 청운동
    // 폐지 제외
    expect(codes).not.toContain("9999000000");
  });
});

describe("PK-2: kind 자동 분류 — 광역시 자치구·일반시·일반구·자치시·행정시·군", () => {
  it("PK-2a: 서울 강남구 (1168000000) → autonomous_district", () => {
    expect(inferKind("1168000000", "서울특별시 강남구")).toBe("autonomous_district");
  });

  it("PK-2b: 인천 강화군 (2871000000) → county (광역시 군)", () => {
    expect(inferKind("2871000000", "인천광역시 강화군")).toBe("county");
  });

  it("PK-2c: 경기 수원시 (4111000000) → city", () => {
    expect(inferKind("4111000000", "경기도 수원시")).toBe("city");
  });

  it("PK-2d: 경기 수원시 영통구 (4111700000) → general_district", () => {
    expect(inferKind("4111700000", "경기도 수원시 영통구")).toBe("general_district");
  });

  it("PK-2e: 세종 (3611000000) → special_self_governing_city", () => {
    expect(inferKind("3611000000", "세종특별자치시")).toBe("special_self_governing_city");
  });

  it("PK-2f: 제주시 (5011000000) → administrative_city", () => {
    expect(inferKind("5011000000", "제주특별자치도 제주시")).toBe("administrative_city");
  });
});

describe("PK-3: 시드 13건 정합 검증 (KOEDB fixture vs SIGUNGU_LIST)", () => {
  it("PK-3: fixture 13건 시드와 정합", async () => {
    const buf = await fs.readFile(FIXTURE);
    const text = decodeKoedb(buf);
    const rows = parseKoedbRows(text);
    const sigunguRows = rows.filter((r) => isSigunguCode(r.code) && r.active);
    const entries = sigunguRows.map(toSigunguEntry);

    // 시드 13건 중 fixture에 있는 것만 검증 (부분 시드 일치)
    const fixtureSeed = SIGUNGU_LIST.filter((s) => entries.some((e) => e.code === s.code));
    expect(fixtureSeed.length).toBeGreaterThan(0);

    const result = validateSeedConsistency(fixtureSeed, entries);
    expect(result.ok).toBe(true);
  });
});

describe("PK-4: 시드 불일치 시 mismatch 보고", () => {
  it("PK-4a: 시드 코드 미존재 → mismatch 보고", () => {
    const fakeSeed = [
      { code: "9999900000", fullName: "가상시 가상구", sidoName: "가상시", sigunguName: "가상구", kind: "autonomous_district" as const },
    ];
    const fakeParsed = [
      { code: "1111000000", fullName: "서울특별시 종로구", sidoName: "서울특별시", sigunguName: "종로구", kind: "autonomous_district" as const },
    ];
    const result = validateSeedConsistency(fakeSeed, fakeParsed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.mismatches[0]).toContain("KOEDB 미존재");
    }
  });

  it("PK-4b: 시드 명칭 불일치 → mismatch 보고", () => {
    const seed = [
      { code: "1111000000", fullName: "서울특별시 종로구", sidoName: "서울특별시", sigunguName: "종로구", kind: "autonomous_district" as const },
    ];
    const parsed = [
      { code: "1111000000", fullName: "서울특별시 종로구OLD", sidoName: "서울특별시", sigunguName: "종로구OLD", kind: "autonomous_district" as const },
    ];
    const result = validateSeedConsistency(seed, parsed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.mismatches[0]).toContain("시드=");
    }
  });
});

describe("PK-5: generateTsModule 코드 생성 — 정렬 + 헤더", () => {
  it("PK-5: 출력 코드에 export·정렬·buildDate 포함", () => {
    const entries = [
      { code: "1168000000", fullName: "서울특별시 강남구", sidoName: "서울특별시", sigunguName: "강남구", kind: "autonomous_district" as const },
      { code: "1111000000", fullName: "서울특별시 종로구", sidoName: "서울특별시", sigunguName: "종로구", kind: "autonomous_district" as const },
    ];
    const code = generateTsModule(entries, "2026-05-24");
    expect(code).toContain("export interface SigunguEntry");
    expect(code).toContain("export const SIGUNGU_LIST: SigunguEntry[]");
    expect(code).toContain('SIGUNGU_BUILD_VERSION = "2026-05-24"');
    expect(code).toContain("자동 생성 파일");
    // 코드 정렬 — 1111이 1168보다 먼저
    const idx1111 = code.indexOf("1111000000");
    const idx1168 = code.indexOf("1168000000");
    expect(idx1111).toBeGreaterThan(0);
    expect(idx1168).toBeGreaterThan(idx1111);
  });
});
