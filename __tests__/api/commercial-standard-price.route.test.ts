/**
 * A-01·A-06~A-13 — /api/address/commercial-standard-price 라우트 anchor.
 *
 * 설계 §3-2 판정 순서 전 분기 + 불변식 1~5.
 * 픽스처는 실제 산출물과 같은 형식(gzip JSON 배열 + manifest)으로 임시 디렉터리에 만든다.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as zlib from "zlib";
import { GET } from "@/app/api/address/commercial-standard-price/route";
import {
  __resetStdPriceCaches,
  pickNoticeDate,
} from "@/lib/stdprice/load-partition";
import type { StdPriceUnit } from "@/lib/stdprice/types";

const ORIG_DIR = process.env.STDPRICE_DATA_DIR;
let tmpDir = "";

/** 적선동 80(종로구) — Phase 0에서 Vworld PNU 조인이 확인된 실측 필지 */
const PNU_JEOKSEON = "1111010700" + "1" + "0080" + "0000";
/** 특수지 2~9 대응(PNU 필지구분 3) — 조인 불가 케이스 */
const PNU_UNJOINABLE = "1111010700" + "3" + "0080" + "0000";
/** 강원 춘천(42110) — 2022년까지 미고시, 2023년부터 고시 */
const PNU_CHUNCHEON = "4211011200" + "1" + "0001" + "0000";

function unit(over: Partial<StdPriceUnit>): StdPriceUnit {
  return {
    b: "1111010700",
    s: "0",
    bn: 80,
    jn: 0,
    nm: "적선현대빌딩",
    dg: "1(단일)",
    fc: 4,
    fl: "1",
    ho: "1",
    p: 5_898_000,
    ea: 639.47,
    sa: 357.74,
    k: 1,
    ...over,
  };
}

function writePartition(sigungu: string, date: string, units: StdPriceUnit[]): void {
  const dir = path.join(tmpDir, "commercial", sigungu);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${date}.json.gz`),
    zlib.gzipSync(Buffer.from(JSON.stringify(units), "utf8")),
  );
}

function notice(date: string, sigungus: string[], coverage: "full" | "partial" = "full") {
  return {
    date,
    rows: 0,
    storedRows: 0,
    sigunguCount: sigungus.length,
    sigungus,
    coverage,
    adopted: [],
    repairs: { hoRestored: 0 },
    skippedRows: 0,
    unjoinableParcelRows: 0,
    duplicateKeyRows: 0,
    conflictingKeyCount: 0,
  };
}

function req(query: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/address/commercial-standard-price?${query}`);
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stdprice-"));
  process.env.STDPRICE_DATA_DIR = tmpDir;

  fs.writeFileSync(
    path.join(tmpDir, "manifest.json"),
    JSON.stringify({
      generatedAt: "2026-07-28T00:00:00.000Z",
      totalRows: 0,
      notices: [
        notice("2013-01-01", ["11110"]),
        notice("2020-01-01", ["11110"], "partial"),
        notice("2021-01-01", ["11110"]),
        notice("2022-01-01", ["11110"]), // 파티션 파일 없음 → partition_missing
        notice("2023-01-01", ["11110", "11260", "42110"]),
        notice("2024-01-01", ["11110", "11260"]),
      ],
    }),
  );

  // 2013 — 지상/지하 동일 층·호 (A-04 층구분 분리)
  writePartition("11110", "2013-01-01", [
    unit({ p: 4_000_000 }),
    unit({ fc: 1, ea: 7.18, sa: 2.4, p: 2_485_000 }),
  ]);
  // 2021 — 지상만 존재 (A-06 부분 매칭)
  writePartition("11110", "2021-01-01", [unit({ p: 5_898_000 })]);
  writePartition("11110", "2020-01-01", [unit({ p: 5_000_000 })]);
  // 2023 — 같은 키가 면적만 다르게 2건 (원본 키 충돌 재현)
  writePartition("11110", "2023-01-01", [
    unit({ p: 6_000_000, ea: 14.35, sa: 6.11 }),
    unit({ p: 6_000_000, ea: 40.59, sa: 17.26 }),
  ]);
  writePartition("42110", "2023-01-01", [
    unit({ b: "4211011200", bn: 1, nm: "메가시티오피스텔", k: 2, fl: "5", ho: "501", p: 714_000 }),
  ]);
  // 2024 — 건물명이 지번 표기로 드리프트(실측: 적선현대빌딩 → "(80)")
  writePartition("11110", "2024-01-01", [
    unit({ nm: "(80)", p: 6_003_000 }),
    unit({ nm: "(80)", fc: 1, ea: 7.18, sa: 2.4, p: 2_600_000 }),
  ]);
  // 위치 키가 겹치는 필지 — 스마트빌A동/B동은 동 값이 둘 다 "1(단일)"이라 위치로 구분 불가
  const smart = (nm: string, p: number, ea: number) =>
    unit({ b: "1126010200", s: "0", bn: 129, jn: 19, nm, fl: "2", ho: "201", p, ea, sa: 0, k: 2 });
  writePartition("11260", "2023-01-01", [
    smart("스마트빌A동", 3_065_000, 61.15),
    smart("스마트빌B동", 3_063_000, 62.08),
  ]);
  writePartition("11260", "2024-01-01", [
    smart("스마트빌A동", 3_200_000, 61.15),
    smart("스마트빌B동", 3_190_000, 62.08),
  ]);
});

afterAll(() => {
  if (ORIG_DIR === undefined) delete process.env.STDPRICE_DATA_DIR;
  else process.env.STDPRICE_DATA_DIR = ORIG_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => __resetStdPriceCaches());

describe("A-13: 형식 오류 — 전 경로 HTTP 200 (불변식 5)", () => {
  it("PNU가 19자리가 아니면 200 + success:false + invalid_pnu", async () => {
    const res = await GET(req("pnu=111&dates=2021-01-01"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.parcelReason).toBe("invalid_pnu");
    expect(body.units).toEqual([]);
  });

  it("dates가 비면 200 + success:false", async () => {
    const res = await GET(req(`pnu=${PNU_JEOKSEON}&dates=`));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(false);
  });

  it("dates는 최대 3개까지만 처리한다", async () => {
    const res = await GET(
      req(`pnu=${PNU_JEOKSEON}&dates=2013-01-01,2020-01-01,2021-01-01,2023-01-01`),
    );
    expect(Object.keys((await res.json()).dateStatus)).toHaveLength(3);
  });
});

describe("A-01: 정상 조회 — 3시점 병합", () => {
  it("동일 물건이 시점별 가격을 갖는다", async () => {
    const res = await GET(req(`pnu=${PNU_JEOKSEON}&dates=2013-01-01,2021-01-01`));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.dateStatus).toEqual({ "2013-01-01": "ok", "2021-01-01": "ok" });

    const ground = body.units.find((u: { floorClass: string }) => u.floorClass === "지상");
    expect(ground.prices["2013-01-01"]).toEqual({ price: 4_000_000, ea: 639.47, sa: 357.74 });
    expect(ground.prices["2021-01-01"]).toEqual({ price: 5_898_000, ea: 639.47, sa: 357.74 });
  });

  it("A-04: 같은 1층 1호라도 지하/지상이 별개 행으로 나오고 지하가 먼저 정렬된다", async () => {
    const res = await GET(req(`pnu=${PNU_JEOKSEON}&dates=2013-01-01`));
    const body = await res.json();
    expect(body.units).toHaveLength(2);
    expect(body.units.map((u: { floorClass: string }) => u.floorClass)).toEqual(["지하", "지상"]);
    expect(body.units[0].prices["2013-01-01"].price).toBe(2_485_000);
  });
});

describe("A-06: 부분 시점 매칭 — 자동 대체 금지", () => {
  it("2021에 없는 지하 물건은 해당 시점이 null이다 (인접 호로 채우지 않는다)", async () => {
    const res = await GET(req(`pnu=${PNU_JEOKSEON}&dates=2013-01-01,2021-01-01`));
    const body = await res.json();
    const basement = body.units.find((u: { floorClass: string }) => u.floorClass === "지하");
    expect(basement.prices["2013-01-01"]).not.toBeNull();
    expect(basement.prices["2021-01-01"]).toBeNull();
  });
});

describe("A-07: 필지에 물건 없음 → unit_not_found", () => {
  it("고시는 있으나 그 필지가 없으면 unit_not_found + units:[]", async () => {
    const other = "1111010700" + "1" + "9999" + "0000";
    const res = await GET(req(`pnu=${other}&dates=2021-01-01`));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.dateStatus["2021-01-01"]).toBe("unit_not_found");
    expect(body.units).toEqual([]);
  });
});

describe("A-08·A-09: partial_data ≠ partition_missing ≠ no_notice (불변식 4)", () => {
  it("coverage partial이면 partial_data — 조회는 계속한다", async () => {
    const res = await GET(req(`pnu=${PNU_JEOKSEON}&dates=2020-01-01`));
    const body = await res.json();
    expect(body.dateStatus["2020-01-01"]).toBe("partial_data");
    expect(body.units).toHaveLength(1);
  });

  it("manifest에 있는데 파티션 파일이 없으면 partition_missing", async () => {
    const res = await GET(req(`pnu=${PNU_JEOKSEON}&dates=2022-01-01`));
    expect((await res.json()).dateStatus["2022-01-01"]).toBe("partition_missing");
  });

  it("manifest에 없는 고시일자는 no_notice", async () => {
    const res = await GET(req(`pnu=${PNU_JEOKSEON}&dates=2005-01-01`));
    expect((await res.json()).dateStatus["2005-01-01"]).toBe("no_notice");
  });

  it("★ 그 해 그 지역이 고시 대상이 아니면 no_notice — partition_missing이 아니다", async () => {
    const res = await GET(req(`pnu=${PNU_CHUNCHEON}&dates=2021-01-01,2023-01-01`));
    const body = await res.json();
    // 2021년에 강원은 고시 대상이 아니었다(정상) / 2023년부터 전국 확대
    expect(body.dateStatus["2021-01-01"]).toBe("no_notice");
    expect(body.dateStatus["2023-01-01"]).toBe("ok");
  });

  it("availableDates는 그 필지의 시군구가 고시된 날짜만 담는다", async () => {
    const seoul = await (await GET(req(`pnu=${PNU_JEOKSEON}&dates=2021-01-01`))).json();
    const gangwon = await (await GET(req(`pnu=${PNU_CHUNCHEON}&dates=2021-01-01`))).json();
    expect(seoul.availableDates).toEqual([
      "2013-01-01",
      "2021-01-01",
      "2022-01-01",
      "2023-01-01",
      "2024-01-01",
    ]); // 2020은 coverage partial → 제외
    expect(gangwon.availableDates).toEqual(["2023-01-01"]);
  });
});

describe("A-11: 특수지 2~9·A → unjoinable_parcel (불변식 3)", () => {
  it("PNU 필지구분이 1·2가 아니면 조회하지 않고 사유를 반환한다", async () => {
    const res = await GET(req(`pnu=${PNU_UNJOINABLE}&dates=2021-01-01`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.parcelReason).toBe("unjoinable_parcel");
    expect(body.units).toEqual([]);
  });
});

describe("키 충돌 — 임의 선택 금지", () => {
  it("한 시점에 같은 키가 2건이면 둘 다 ambiguous로 노출된다", async () => {
    const res = await GET(req(`pnu=${PNU_JEOKSEON}&dates=2023-01-01`));
    const body = await res.json();
    expect(body.units).toHaveLength(2);
    expect(body.units.every((u: { ambiguous?: boolean }) => u.ambiguous === true)).toBe(true);
    expect(body.units.map((u: { prices: Record<string, { ea: number }> }) =>
      u.prices["2023-01-01"].ea,
    ).sort()).toEqual([14.35, 40.59]);
    // 키가 서로 달라야 목록에서 구분된다
    expect(body.units[0].key).not.toBe(body.units[1].key);
  });

  it("모호한 키는 다른 시점 값을 자동으로 끌어오지 않는다", async () => {
    const res = await GET(req(`pnu=${PNU_JEOKSEON}&dates=2021-01-01,2023-01-01`));
    const body = await res.json();
    const amb = body.units.filter((u: { ambiguous?: boolean }) => u.ambiguous);

    // 2023에서 키가 모호하면 **같은 키의 2021 물건도** 어느 쪽과 짝지을지 알 수 없다
    // → 2021 1건 + 2023 2건 = 3건이 전부 개별 항목으로 나오고, 시점 간 병합은 일어나지 않는다.
    expect(amb).toHaveLength(3);
    for (const u of amb) {
      const filled = Object.entries(u.prices as Record<string, unknown>)
        .filter(([, v]) => v !== null)
        .map(([d]) => d);
      expect(filled).toHaveLength(1); // 각 항목은 자기 시점 값만 갖는다
    }
    expect(
      amb.filter((u: { prices: Record<string, unknown> }) => u.prices["2021-01-01"] !== null),
    ).toHaveLength(1);
  });
});

describe("데이터 미준비", () => {
  it("manifest가 없으면 200 + data_unavailable (수기 입력 경로를 막지 않는다)", async () => {
    process.env.STDPRICE_DATA_DIR = path.join(tmpDir, "nonexistent");
    __resetStdPriceCaches();
    const res = await GET(req(`pnu=${PNU_JEOKSEON}&dates=2021-01-01`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.parcelReason).toBe("data_unavailable");
    process.env.STDPRICE_DATA_DIR = tmpDir;
  });
});

describe("건물명 드리프트 — 위치 유일성 검증 후 연결 (A-05 부정 케이스 포함)", () => {
  it("건물명이 시점마다 달라도 위치가 양쪽 유일하면 한 물건으로 연결하고 근거를 밝힌다", async () => {
    const res = await GET(req(`pnu=${PNU_JEOKSEON}&dates=2021-01-01,2024-01-01`));
    const body = await res.json();
    const ground = body.units.find((u: { floorClass: string }) => u.floorClass === "지상");

    expect(ground.prices["2021-01-01"].price).toBe(5_898_000);
    expect(ground.prices["2024-01-01"].price).toBe(6_003_000);
    // 이름이 다르므로 반드시 근거를 노출한다 — 조용한 병합 금지
    expect(ground.linkedBy).toBe("position");
    expect(ground.buildingNameByDate).toEqual({
      "2021-01-01": "적선현대빌딩",
      "2024-01-01": "(80)",
    });
    // 표시용 대표 이름은 지번 표기가 아니라 실제 이름 쪽을 쓴다
    expect(ground.buildingName).toBe("적선현대빌딩");
  });

  it("건물명이 같으면 linkedBy를 붙이지 않는다 (불필요한 경고 방지)", async () => {
    const res = await GET(req(`pnu=${PNU_JEOKSEON}&dates=2013-01-01,2021-01-01`));
    const body = await res.json();
    for (const u of body.units) expect(u.linkedBy).toBeUndefined();
  });

  it("★ A-05: 위치가 겹치는 스마트빌A동/B동은 위치로 연결하지 않는다 — 건물명 키를 유지한다", async () => {
    const pnu = "1126010200" + "1" + "0129" + "0019";
    const res = await GET(req(`pnu=${pnu}&dates=2023-01-01,2024-01-01`));
    const body = await res.json();

    expect(body.units).toHaveLength(2);
    const a = body.units.find((u: { buildingName: string }) => u.buildingName === "스마트빌A동");
    const b = body.units.find((u: { buildingName: string }) => u.buildingName === "스마트빌B동");
    // A동은 A동끼리, B동은 B동끼리 — 섞이면 단가·면적이 뒤바뀐다
    expect(a.prices["2023-01-01"].price).toBe(3_065_000);
    expect(a.prices["2024-01-01"].price).toBe(3_200_000);
    expect(b.prices["2023-01-01"].price).toBe(3_063_000);
    expect(b.prices["2024-01-01"].price).toBe(3_190_000);
    expect(a.linkedBy).toBeUndefined();
    expect(b.linkedBy).toBeUndefined();
  });
});

describe("pickNoticeDate — §164③ 직전 고시분", () => {
  const dates = ["2013-01-01", "2021-01-01", "2023-01-01"];

  it("기준일 이하 고시일자 중 최대를 고른다", () => {
    expect(pickNoticeDate(dates, "2022-06-30")).toBe("2021-01-01");
  });

  it("고시일과 기준일이 같으면 그 고시분이다 (시행일 1/1)", () => {
    expect(pickNoticeDate(dates, "2021-01-01")).toBe("2021-01-01");
  });

  it("최초 고시 이전이면 null — 임의로 최초분을 쓰지 않는다", () => {
    expect(pickNoticeDate(dates, "2010-05-01")).toBeNull();
  });
});
