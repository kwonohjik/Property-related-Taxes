/**
 * F-07 Pre-Do anchor — 상가·오피스텔 기준시가 라우트가 시군구 코드 개편을 정규화하지 않는다.
 *
 * 결함 위치: `app/api/address/commercial-standard-price/route.ts`
 *   const sigungu = bjdCode.slice(0, 5);            // 원시 5자리
 *   … n.sigungus.includes(sigungu)                  // availableDates 필터
 *   … noticeByDate.get(d)?.sigungus.includes(sigungu)  // 특수지 분기 dateStatus
 *   … !notice.sigungus.includes(sigungu)            // 본 루프
 *   … loadPartition(sigungu, date)                  // 파티션 디렉터리 경로
 *   네 지점 모두 정규화 없이 원시 문자열로 대조한다.
 *
 * 국세청 원본 CSV 는 **고시 당시** 법정동코드로 적혀 있고, 주소검색 PNU 는 **현행** 코드다.
 * 광주광역시 5개 자치구·전남 시군은 「전남광주통합특별시」 설치로 코드가 통째로 바뀌었다
 * (예 남구 29155 → 12270). 통합 시행일이 최신 고시분보다 뒤이므로 원본이 현행 코드를 담는 것은
 * 물리적으로 불가능하다 ⇒ 현행 PNU 로는 **어느 고시분도 조인되지 않는다.**
 *
 * 저장소에 `expandSigunguAliases` / `hasAnySigunguAlias` 가 이미 있고
 * `regulated-areas`·`population-decline-areas` 가 같은 드리프트를 흡수하는데 이 라우트만 원시 비교였다.
 *
 * 사용자에게 도달하는 결과: 전 시점 `no_notice` + `availableDates: []` ⇒ 모달이
 * 「미고시 물건입니다 — 수기 입력하세요」라는 **사실과 다른 단정**을 띄운다.
 * 「소득세법 시행령」 제164조 제6항의 환산은 **고시 전 취득**에만 열리므로,
 * 실재 고시를 미고시로 안내하면 환산 요건 판단의 전제 사실 자체가 틀어진다.
 *
 * ⚠️ §1 은 **F-07 수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 *
 * 🟡 **잔여(범위 밖)** — 별칭 테이블 자체가 아직 불완전하다: 전남·광주 24건 + 전주 2건뿐이고
 *    `GANGWON_ALIASES`(강원 42→51)·전북 나머지는 없다(`sigungu-code-alias.ts` 가 「생기면 여기에 추가」로
 *    남겨 둔 상태). 이 수정은 **정규화 배선**을 넣는 것이고, 표 확충은 별건이다.
 *    또 `/data/stdprice/` 빌드 산출물이 워크트리에 없어(.gitignore) 실배포 manifest 키는 미확인이다.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as zlib from "zlib";
import { GET } from "@/app/api/address/commercial-standard-price/route";
import { __resetStdPriceCaches } from "@/lib/stdprice/load-partition";
import type { StdPriceUnit } from "@/lib/stdprice/types";

const ORIG_DIR = process.env.STDPRICE_DATA_DIR;
let tmpDir = "";

/** 광주 남구 — 구 29155 / 현행 12270 (`JEONNAM_GWANGJU_ALIASES` 실측 항목) */
const LEGACY = "29155";
const CURRENT = "12270";
/** 데이터(=고시 당시)는 구 코드 법정동, 조회 PNU 는 현행 코드 법정동 */
const BJD_LEGACY = `${LEGACY}10100`;
const BJD_CURRENT = `${CURRENT}10100`;
const PNU_CURRENT = `${BJD_CURRENT}1` + "0080" + "0000";
const PNU_LEGACY = `${BJD_LEGACY}1` + "0080" + "0000";
const DATE = "2024-01-01";

function unit(over: Partial<StdPriceUnit>): StdPriceUnit {
  return {
    b: BJD_LEGACY,
    s: "0",
    bn: 80,
    jn: 0,
    nm: "남구빌딩",
    dg: "1(단일)",
    fc: 4,
    fl: "1",
    ho: "101",
    p: 3_000_000,
    ea: 250.5,
    sa: 357.74,
    k: 1,
    ...over,
  };
}

function notice(date: string, sigungus: string[]) {
  return {
    date,
    rows: 0,
    storedRows: 0,
    sigunguCount: sigungus.length,
    sigungus,
    coverage: "full" as const,
    adopted: [],
    repairs: { hoRestored: 0 },
    skippedRows: 0,
    unjoinableParcelRows: 0,
    duplicateKeyRows: 0,
    conflictingKeyCount: 0,
  };
}

const req = (q: string) =>
  new NextRequest(`http://localhost:3000/api/address/commercial-standard-price?${q}`);

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stdprice-alias-"));
  process.env.STDPRICE_DATA_DIR = tmpDir;
  fs.writeFileSync(
    path.join(tmpDir, "manifest.json"),
    JSON.stringify({
      generatedAt: "2026-07-28T00:00:00.000Z",
      totalRows: 0,
      // 고시 당시 코드 = 구 코드. 현행 코드는 원본에 존재할 수 없다.
      notices: [notice(DATE, [LEGACY])],
    }),
  );
  const dir = path.join(tmpDir, "commercial", LEGACY);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${DATE}.json.gz`),
    zlib.gzipSync(Buffer.from(JSON.stringify([unit({})]), "utf8")),
  );
});

afterAll(() => {
  if (ORIG_DIR === undefined) delete process.env.STDPRICE_DATA_DIR;
  else process.env.STDPRICE_DATA_DIR = ORIG_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => __resetStdPriceCaches());

describe("F-07 시군구 코드 개편 — §1 현행 PNU 로도 구 코드 고시분이 조회된다 (수정 전 실패)", () => {
  it("현행 PNU(12270)로 조회하면 구 코드(29155) 고시분이 매칭된다", async () => {
    const res = await GET(req(`pnu=${PNU_CURRENT}&dates=${DATE}`));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.dateStatus[DATE]).not.toBe("no_notice");
    expect(json.units.length).toBeGreaterThan(0);
  });

  it("availableDates 가 비지 않는다 — 비면 §164③ 직전 고시분 재계산까지 죽는다", async () => {
    const res = await GET(req(`pnu=${PNU_CURRENT}&dates=${DATE}`));
    const json = await res.json();
    expect(json.availableDates).toEqual([DATE]);
  });

  it("manifest 만 통과시키면 안 된다 — 파티션도 매칭된 코드로 읽어야 한다", async () => {
    const res = await GET(req(`pnu=${PNU_CURRENT}&dates=${DATE}`));
    const json = await res.json();
    // `partition_missing` 이면 manifest 만 고치고 loadPartition 을 안 고친 것이다.
    expect(json.dateStatus[DATE]).not.toBe("partition_missing");
  });
});

describe("F-07 시군구 코드 개편 — §2 역방향 가드 (수정 후에도 불변)", () => {
  it("구 코드 PNU(29155)로 조회해도 종전대로 조회된다", async () => {
    const res = await GET(req(`pnu=${PNU_LEGACY}&dates=${DATE}`));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.dateStatus[DATE]).not.toBe("no_notice");
  });

  it("무관한 시군구는 여전히 no_notice — 별칭 확장이 과잉 매칭하지 않는다", async () => {
    const other = "11110" + "10100" + "1" + "0080" + "0000";
    const res = await GET(req(`pnu=${other}&dates=${DATE}`));
    const json = await res.json();
    expect(json.dateStatus[DATE]).toBe("no_notice");
    expect(json.availableDates).toEqual([]);
  });
});
