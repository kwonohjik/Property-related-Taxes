/**
 * A-04·A-05·A-14·A-15·A-16 — 상가·오피스텔 기준시가 변환 파이프라인 anchor.
 *
 * 표본 행은 전부 **원본 실측값**이다(추정 없음).
 * 설계: docs/02-design/features/commercial-officetel-standard-price-lookup.engine.design.md §5
 */

import { describe, it, expect } from "vitest";
import {
  buildColumnIndex,
  detectGeneration,
  extractBaseDateFromFileName,
  missingColumns,
  normalizeColumnName,
  normalizeNoticeDate,
  normalizeText,
  parseRow,
  pickAdoptedDeployment,
  restoreHoAddress,
  sigunguOf,
  sniffKind,
  splitCsvLine,
  toSpecialLotCode,
  unitKey,
} from "../../scripts/build-commercial-stdprice-helpers";

/** 실측 원본 헤더·첫 데이터 행 (4세대). */
const SAMPLES = {
  "quoted-code": {
    header:
      '"상가건물번호","건물구분","고시일자","법정동코드","특수지코드","번지","호","상가건물블록주소","상가건물동주소","건물층구분코드","상가건물층주소","상가건물호주소","고시가격","전유면적","공용면적"',
    row: '"719","1","2005-01-01","1165010700","0","1","8","반포경남쇼핑센타","1(단일)","4","1","1","2268000","42.22","3.14"',
  },
  "plain-code": {
    header:
      "상가건물번호,상가종류코드,고시일자,법정동코드,특수지코드,번지,호,상가건물블록주소,상가건물동주소,건물층구분코드,상가건물층주소,상가건물호주소,고시가격,전용면적,공유면적",
    row: "50,1,2019-01-01,1111010700,0,80,0,적선현대빌딩,1(단일),1,1,1,2260000,7.18,2.4",
  },
  "plain-label": {
    header:
      "상가건물번호,상가종류코드,고시일자,법정동코드,특수지코드,번지,호,상가건물블록주소,상가건물동주소,건물층구분코드,상가건물층주소,상가건물호주소,고시가격,전용면적,공유면적",
    row: "50,상가,2020-01-01,1111010700,일반지번,80,0,적선현대빌딩,1(단일),지상층,1,1,6151000,639.47,357.74",
  },
  "padded-label": {
    header:
      "상가건물번호,상가종류코드,고시일자,법정동코드,특수지코드,번지,호,상가건물블록주소,상가건물동주소,건물층구분코드,상가건물층주소,상가건물호주소,고시가격(원),전용면적(m2),공유면적(m2)",
    row: "50,상가,2022-01-01,1111010700,일반지번,0080,0000,적선현대빌딩,1(단일),지상층,1,1,5986000,639.470,357.740",
  },
} as const;

function parseSample(gen: keyof typeof SAMPLES) {
  const { header, row } = SAMPLES[gen];
  const idx = buildColumnIndex(splitCsvLine(header));
  const fields = splitCsvLine(row);
  return { idx, fields, generation: detectGeneration(header, fields, idx) };
}

describe("세대 판별 — 값 sniffing (헤더명 판별 금지)", () => {
  it("4세대 전부 정확히 판별된다", () => {
    for (const gen of Object.keys(SAMPLES) as (keyof typeof SAMPLES)[]) {
      expect(parseSample(gen).generation).toBe(gen);
    }
  });

  it("2019는 헤더가 `상가종류코드`(코드계 이름)여도 값이 코드이므로 plain-code다", () => {
    expect(SAMPLES["plain-code"].header).toContain("상가종류코드");
    expect(parseSample("plain-code").generation).toBe("plain-code");
  });

  it("2020은 같은 헤더명이지만 값이 라벨이므로 plain-label이다 — 헤더명만 보면 오판한다", () => {
    expect(SAMPLES["plain-label"].header).toBe(SAMPLES["plain-code"].header);
    expect(parseSample("plain-label").generation).toBe("plain-label");
  });
});

describe("컬럼명 정규화", () => {
  it("단위 접미사 3종을 제거한다 — (원)·(m2)·(㎡)", () => {
    expect(normalizeColumnName("고시가격(원)")).toBe("고시가격");
    expect(normalizeColumnName("공유면적(m2)")).toBe("공유면적");
    expect(normalizeColumnName("전유면적(㎡)")).toBe("전용면적");
  });

  it("연도별 별칭을 통일한다", () => {
    expect(normalizeColumnName("전유면적")).toBe("전용면적");
    expect(normalizeColumnName("공용면적")).toBe("공유면적");
    expect(normalizeColumnName("상가종류코드")).toBe("건물구분");
  });

  it("4세대 전부 필수 컬럼 누락이 없다", () => {
    for (const gen of Object.keys(SAMPLES) as (keyof typeof SAMPLES)[]) {
      expect(missingColumns(parseSample(gen).idx)).toEqual([]);
    }
  });

  it("2016의 헤더 말미 빈 컬럼 3개는 인덱스를 오염시키지 않는다", () => {
    const header = `${SAMPLES["plain-code"].header},,,`;
    const idx = buildColumnIndex(splitCsvLine(header));
    expect(missingColumns(idx)).toEqual([]);
    expect(idx["공유면적"]).toBe(14);
  });
});

describe("CSV 분해 — 따옴표 안 콤마", () => {
  it("호수 `\"1,2층1호\"`를 한 필드로 유지한다 (2021년 17,013행 실측)", () => {
    const line =
      '77,상가,2021-01-01,1111016400,일반지번,289,42,동대문종합상가비동,비동,지상층,1,"1,2층1호",25182000,50.78,0';
    const f = splitCsvLine(line);
    expect(f).toHaveLength(15);
    expect(f[11]).toBe("1,2층1호");
    expect(f[12]).toBe("25182000");
  });

  it("특수지 라벨 `\"가,확정예정지번\"`도 밀리지 않는다", () => {
    const f = splitCsvLine('50,상가,2020-01-01,1111010700,"가,확정예정지번",80,0,X,1(단일),지상층,1,1,1,2,3');
    expect(f).toHaveLength(15);
    expect(toSpecialLotCode(f[4])).toBe("2");
  });
});

describe("A-16: zero-pad 정규화 → PNU 조인", () => {
  it("번지 `0080`·호 `0000` → 80·0 (PNU 1111010700 1 0080 0000과 조인)", () => {
    const { idx, fields } = parseSample("padded-label");
    const r = parseRow(fields, idx)!;
    expect(r.unit.bn).toBe(80);
    expect(r.unit.jn).toBe(0);
    expect(r.unit.b).toBe("1111010700");
    expect(r.unit.s).toBe("0"); // PNU[10]="1"(일반) ↔ CSV 특수지 "0"
    expect(sigunguOf(r.unit.b)).toBe("11110");
  });

  it("라벨 세대와 zero-pad 세대가 동일 물건을 동일 키로 산출한다 (세대 간 정규화 일관성)", () => {
    const keys = (["plain-label", "padded-label"] as const).map((g) => {
      const { idx, fields } = parseSample(g);
      const u = parseRow(fields, idx)!.unit;
      return `${u.b}|${u.s}|${u.bn}|${u.jn}|${unitKey(u)}`;
    });
    expect(new Set(keys).size).toBe(1);
  });

  it("2019 표본은 같은 1층 1호지만 지하 물건이다 — 층구분이 빠지면 지상과 뒤섞인다", () => {
    const g = parseSample("plain-label");
    const c = parseSample("plain-code");
    const gUnit = parseRow(g.fields, g.idx)!.unit;
    const cUnit = parseRow(c.fields, c.idx)!.unit;
    expect(cUnit.fc).toBe(1); // 지하
    expect(gUnit.fc).toBe(4); // 지상
    expect(cUnit.fl).toBe(gUnit.fl);
    expect(cUnit.ho).toBe(gUnit.ho);
    expect(unitKey(cUnit)).not.toBe(unitKey(gUnit));
  });
});

describe("A-14: 호 값 Excel 날짜 오염 복원", () => {
  it("`03월 02일` → `3-2`", () => {
    expect(restoreHoAddress("03월 02일")).toEqual({ value: "3-2", restored: true });
    expect(restoreHoAddress("06월 01일")).toEqual({ value: "6-1", restored: true });
  });

  it("정상 호수는 그대로 둔다", () => {
    expect(restoreHoAddress("101")).toEqual({ value: "101", restored: false });
    expect(restoreHoAddress("1,2층1호")).toEqual({ value: "1,2층1호", restored: false });
  });
});

describe("A-04·A-05: 물건 키 — 층구분·건물명 필수 포함", () => {
  const base = {
    b: "1111010700",
    s: "0",
    bn: 80,
    jn: 0,
    dg: "1(단일)",
    fl: "1",
    ho: "1",
    p: 0,
    ea: 0,
    sa: 0,
    k: 1 as const,
  };

  it("A-04: 적선현대빌딩 1층 1호는 지상·지하가 다른 키다 (단가 2.4배 차이)", () => {
    const ground = unitKey({ ...base, nm: "적선현대빌딩", fc: 4 });
    const basement = unitKey({ ...base, nm: "적선현대빌딩", fc: 1 });
    expect(ground).not.toBe(basement);
  });

  it("A-05: 스마트빌A동/B동은 동 값이 둘 다 `1(단일)`이라 건물명만이 판별자다", () => {
    const a = unitKey({ ...base, nm: "스마트빌A동", fc: 4, fl: "2", ho: "201" });
    const b = unitKey({ ...base, nm: "스마트빌B동", fc: 4, fl: "2", ho: "201" });
    expect(a).not.toBe(b);
  });
});

describe("A-15: 중복 배포본 — 후행본 채택 (mtime 금지)", () => {
  it("파일명 기준일이 늦은 배포본을 채택한다", () => {
    const { adopted, superseded } = pickAdoptedDeployment([
      { fileName: "2022-01-01", entryTimestamp: 1_700_000_000_000 },
      { fileName: "2022-02-28", entryTimestamp: 1 },
    ]);
    expect(adopted.fileName).toBe("2022-02-28");
    expect(superseded.map((s) => s.fileName)).toEqual(["2022-01-01"]);
  });

  it("기준일 표기가 없으면 엔트리 타임스탬프로 판정한다", () => {
    const { adopted } = pickAdoptedDeployment([
      { fileName: "older", entryTimestamp: 100 },
      { fileName: "newer", entryTimestamp: 200 },
    ]);
    expect(adopted.fileName).toBe("newer");
  });

  it("파일명 기준일 추출 — `2022년2월28일 기준` → 2022-02-28", () => {
    expect(extractBaseDateFromFileName("오피스텔 상업용건물 기준시가(2022년2월28일 기준).zip")).toBe(
      "2022-02-28",
    );
    expect(extractBaseDateFromFileName("국세청_상업용건물 오피스텔 기준시가_20260101.zip")).toBe(
      "2026-01-01",
    );
    expect(extractBaseDateFromFileName("국세청_상업용건물 및 오피스텔 기준시가(2005년).csv")).toBeNull();
  });
});

describe("고시일자·텍스트 정규화", () => {
  it("CSV `2020-01-01`·xlsx `20240101` 양쪽을 ISO로 통일한다", () => {
    expect(normalizeNoticeDate("2020-01-01")).toBe("2020-01-01");
    expect(normalizeNoticeDate("20240101")).toBe("2024-01-01");
    expect(normalizeNoticeDate("2024/01/01")).toBeNull();
  });

  it("2018년분 SOFT HYPHEN(U+00AD)을 하이픈으로 치환한다 — 보이지 않는 키 불일치 방지", () => {
    expect(normalizeText("신부파스칼텔(431­5)")).toBe("신부파스칼텔(431-5)");
  });

  it("구분자만 남는 동 값은 빈 값으로 처리한다 (2017 공백 ↔ 2018 `­` 통일)", () => {
    expect(normalizeText("­")).toBe("");
    expect(normalizeText("  ")).toBe("");
  });
});

describe("S1: 매직바이트 실체 판별 (확장자 불신)", () => {
  it("`PK\\x03\\x04`만 zip으로 본다", () => {
    expect(sniffKind(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe("zip");
  });

  it("`.zip` 확장자여도 선두가 텍스트면 CSV로 취급한다 (2020년 2-2 실사례)", () => {
    // 실측 선두 4바이트 — EUC-KR "상가"
    expect(sniffKind(Buffer.from([0xbb, 0xf3, 0xb0, 0xa1]))).toBe("text");
  });
});
