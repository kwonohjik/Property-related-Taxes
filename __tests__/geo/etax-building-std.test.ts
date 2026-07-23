import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  buildEtaxParams,
  parseEtaxBuildingStd,
} from "@/lib/geo/etax-building-std";

// 실측 anchor: 강남구 역삼동 737 / 2025 → 계 225,037,140,965 (건축물 223,958,545,915 + 시설 1,078,595,050)
// PNU = 시군구11680 + 법정동10100 + 대지1 + 본번0737 + 부번0000
const YEOKSAM_737_PNU = "1168010100107370000";

const ANCHOR_HTML = `
<html><body>
<table><tr><td>년선택</td><td>관할구청</td></tr></table>
<table>
<tr><th>번호</th><th>년도</th><th>번지</th><th>동</th><th>호수</th><th>물건명</th><th>시가표준액</th><th>연면적</th></tr>
<tr><td>1</td><td>2025</td><td>0737-0000</td><td>0000</td><td>00000</td><td>강남구 역삼동 737</td><td>계</td><td>225,037,140,965 원</td><td>212,615.29(m&sup2;)</td></tr>
<tr><td>건축물</td><td>223,958,545,915 원</td></tr>
<tr><td>시설</td><td>1,078,595,050 원</td></tr>
</table>
</body></html>`;

// 시설 없는 건물 — 계 = 건축물, 시설 하위행 부재
const NO_FACILITY_HTML = `
<html><body>
<table><tr><td>form</td></tr></table>
<table>
<tr><th>번호</th><th>년도</th><th>번지</th><th>동</th><th>호수</th><th>물건명</th><th>시가표준액</th><th>연면적</th></tr>
<tr><td>1</td><td>2025</td><td>0100-0000</td><td>0000</td><td>00000</td><td>강남구 역삼동 100</td><td>계</td><td>500,000,000 원</td><td>1,234.56(m&sup2;)</td></tr>
<tr><td>건축물</td><td>500,000,000 원</td></tr>
</table>
</body></html>`;

// 다중 결과 (집합건물 비주거 호별)
const MULTI_HTML = `
<html><body>
<table><tr><td>form</td></tr></table>
<table>
<tr><th>번호</th><th>년도</th><th>번지</th><th>동</th><th>호수</th><th>물건명</th><th>시가표준액</th><th>연면적</th></tr>
<tr><td>1</td><td>2025</td><td>0100-0000</td><td>0001</td><td>00101</td><td>오피스텔 101호</td><td>계</td><td>100,000,000 원</td><td>50.12(m&sup2;)</td></tr>
<tr><td>건축물</td><td>100,000,000 원</td></tr>
<tr><td>2</td><td>2025</td><td>0100-0000</td><td>0001</td><td>00102</td><td>오피스텔 102호</td><td>계</td><td>120,000,000 원</td><td>60.34(m&sup2;)</td></tr>
<tr><td>건축물</td><td>120,000,000 원</td></tr>
</table>
</body></html>`;

// 무자료
const EMPTY_HTML = `<html><body><table><tr><td>form</td></tr></table><table><tr><th>번호</th></tr></table></body></html>`;

describe("buildEtaxParams — PNU → etax 파라미터", () => {
  it("역삼동 737(대지) anchor 도출", () => {
    const p = buildEtaxParams(YEOKSAM_737_PNU);
    expect(p).not.toBeNull();
    expect(p!.siguCd).toBe("680"); // 11680[2:5]
    expect(p!.hdongCd).toBe("10100");
    expect(p!.tsjGubun).toBe("1"); // 대지(pnu[10]="1") → 일반번지 "1"
    expect(p!.bonbun).toBe("737"); // 0737 strip
    expect(p!.bubun).toBe(""); // 0000 → 빈값
  });

  it("산번지(pnu[10]='2') → tsjGubun='2' (parts.platGbCd 오사용 방지)", () => {
    // 11680 10100 [2] 0737 0000 — 산번지
    const sanPnu = "1168010100207370000";
    const p = buildEtaxParams(sanPnu);
    expect(p!.tsjGubun).toBe("2");
  });

  it("부번 있는 지번 strip", () => {
    // 본번 0012 부번 0034
    const p = buildEtaxParams("1168010100100120034");
    expect(p!.bonbun).toBe("12");
    expect(p!.bubun).toBe("34");
  });

  it("비서울 PNU → null (서울 게이트)", () => {
    // 부산 사상구 예시 접두 "26" + 나머지
    expect(buildEtaxParams("2653010100100010000")).toBeNull();
  });

  it("19자리 아니면 null", () => {
    expect(buildEtaxParams("116801010010737000")).toBeNull(); // 18자리
    expect(buildEtaxParams("")).toBeNull();
  });
});

describe("parseEtaxBuildingStd — 응답 파싱", () => {
  it("anchor: 계/건축물/시설/연면적 (9셀 계라벨)", () => {
    const r = parseEtaxBuildingStd(ANCHOR_HTML);
    expect(r).toHaveLength(1);
    expect(r[0].total).toBe(225037140965);
    expect(r[0].building).toBe(223958545915);
    expect(r[0].facility).toBe(1078595050);
    expect(r[0].area).toBeCloseTo(212615.29, 2);
    expect(r[0].name).toBe("강남구 역삼동 737");
    expect(r[0].year).toBe("2025");
  });

  it("시설 없는 건물: facility=null, total=building", () => {
    const r = parseEtaxBuildingStd(NO_FACILITY_HTML);
    expect(r).toHaveLength(1);
    expect(r[0].total).toBe(500000000);
    expect(r[0].building).toBe(500000000);
    expect(r[0].facility).toBeNull();
  });

  it("다중 결과: 각 메인행 파싱 (호별)", () => {
    const r = parseEtaxBuildingStd(MULTI_HTML);
    expect(r).toHaveLength(2);
    expect(r[0].total).toBe(100000000);
    expect(r[0].ho).toBe("00101");
    expect(r[1].total).toBe(120000000);
    expect(r[1].ho).toBe("00102");
  });

  it("무자료 → 빈 배열", () => {
    expect(parseEtaxBuildingStd(EMPTY_HTML)).toEqual([]);
  });

  it("table 1개(결과 테이블 없음) → 빈 배열", () => {
    expect(parseEtaxBuildingStd("<table><tr><td>1</td></tr></table>")).toEqual([]);
  });

  // 실제 ETAX 응답(강남 역삼 737, 2025) 원본 HTML — 중첩테이블·전체 페이지 구조 회귀 가드
  it("실제 응답 fixture에서 anchor 추출 (중첩테이블 내성)", () => {
    const html = readFileSync(
      join(__dirname, "../fixtures/etax-building-std-yeoksam737.html"),
      "utf8",
    );
    const r = parseEtaxBuildingStd(html);
    expect(r).toHaveLength(1);
    expect(r[0].total).toBe(225037140965);
    expect(r[0].building).toBe(223958545915);
    expect(r[0].facility).toBe(1078595050);
    expect(r[0].area).toBeCloseTo(212615.29, 2);
    expect(r[0].name).toContain("역삼동 737");
  });
});
