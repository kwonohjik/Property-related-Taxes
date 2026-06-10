/**
 * 건물 기준시가 — Phase A 데이터 전사 검증 anchor
 *
 * 엔진(calcBuildingStandardPrice) 구현 전, 정적 데이터(D1·D2·D4·D5·D7·D8·D9)의
 * PDF 실측값 1:1 매핑을 단독 검증한다. PDF 출처는 각 데이터 파일 상단 주석 참조.
 *
 * ⚠️ D3(용도지수)·D6(산정기준율) 미전사 → 해당 anchor는 엔진 Phase 이후.
 */
import { describe, it, expect } from "vitest";
import {
  resolveNewBuildingBasePrice,
  resolveStructureIndex,
  listStructureOptions,
  resolveLocationIndex,
  hasLocationIndexYear,
  calcResidualRate,
  durableYearsToResidualGroup,
  resolveResidualGroup,
  resolveAcqBaseGroup,
  resolveMaxFloorsRate,
  resolveGrossAreaRate,
  resolveWallessRate,
  resolveMechParkingFormula,
  resolveAcqBaseRate,
  resolveUsageIndex,
  listUsageOptions,
  hasUsageIndexYear,
} from "../../../lib/tax-engine/data/building-standard-price";

describe("D1 신축가격기준액", () => {
  it("실측 확정값(재검토 정정 6개 연도 포함)", () => {
    expect(resolveNewBuildingBasePrice(2025)).toBe(850_000);
    expect(resolveNewBuildingBasePrice(2026)).toBe(860_000);
    expect(resolveNewBuildingBasePrice(2005)).toBe(460_000); // 초안 470,000 오기 정정
    expect(resolveNewBuildingBasePrice(2007)).toBe(490_000);
    expect(resolveNewBuildingBasePrice(2015)).toBe(650_000);
    expect(resolveNewBuildingBasePrice(2017)).toBe(670_000);
    expect(resolveNewBuildingBasePrice(2001)).toBe(400_000);
  });
  it("2000년 이전 = 2001년값(400,000)", () => {
    expect(resolveNewBuildingBasePrice(1995)).toBe(400_000);
    expect(resolveNewBuildingBasePrice(1980)).toBe(400_000);
  });
  it("보유 범위 밖(2027~) = undefined", () => {
    expect(resolveNewBuildingBasePrice(2027)).toBeUndefined();
  });
});

describe("D5 잔가율 (선형 공식 = PDF 전수 일치, C1 해소)", () => {
  it("경과 0 = 1.000 (모든 그룹)", () => {
    expect(calcResidualRate("I", 0)).toBe(1.0);
    expect(calcResidualRate("IV", 0)).toBe(1.0);
  });
  it("I그룹(50년) 경과 5 = 0.910 (BSP-01 anchor 구성요소)", () => {
    expect(calcResidualRate("I", 5)).toBe(0.91);
  });
  it("II그룹(40년) 경과 5 = 0.8875 / 경과 1 = 0.9775", () => {
    expect(calcResidualRate("II", 5)).toBe(0.8875);
    expect(calcResidualRate("II", 1)).toBe(0.9775);
  });
  it("III그룹(30년) 경과 5 = 0.850 (BSP-MECH anchor 구성요소)", () => {
    expect(calcResidualRate("III", 5)).toBe(0.85);
  });
  it("IV그룹(20년) 경과 5 = 0.775 / 경과 19 = 0.145", () => {
    expect(calcResidualRate("IV", 5)).toBe(0.775);
    expect(calcResidualRate("IV", 19)).toBe(0.145);
  });
  it("내용연수 초과 = 최저 0.100", () => {
    expect(calcResidualRate("I", 50)).toBe(0.1);
    expect(calcResidualRate("I", 60)).toBe(0.1);
    expect(calcResidualRate("IV", 20)).toBe(0.1);
  });
  it("내용연수 → 잔가율 그룹 매핑", () => {
    expect(durableYearsToResidualGroup(50)).toBe("I");
    expect(durableYearsToResidualGroup(30)).toBe("III");
    expect(durableYearsToResidualGroup(20)).toBe("IV");
  });
});

describe("D4 위치지수", () => {
  it("2025 #28 (7,000,000~8,000,000) = 132 (BSP-01 anchor 구성요소)", () => {
    expect(resolveLocationIndex(2025, 7_500_000)).toBe(132);
  });
  it("2025 구간 경계 '이상~미만'", () => {
    expect(resolveLocationIndex(2025, 0)).toBe(78); // 20,000 미만
    expect(resolveLocationIndex(2025, 19_999)).toBe(78);
    expect(resolveLocationIndex(2025, 20_000)).toBe(83); // 20,000~30,000
    expect(resolveLocationIndex(2025, 80_000_000)).toBe(182); // 8천만 이상
  });
  it("2024는 #11~12가 2025와 다름 (94/96 vs 93/94)", () => {
    expect(resolveLocationIndex(2024, 320_000)).toBe(94); // 300,000~350,000
    expect(resolveLocationIndex(2025, 320_000)).toBe(93);
  });
  it("2001~2002 = 5구간", () => {
    expect(resolveLocationIndex(2001, 100_000)).toBe(90); // 200,000 미만
    expect(resolveLocationIndex(2001, 5_000_000)).toBe(110); // 5,000,000 이상
  });
  it("2014 = 25구간", () => {
    expect(resolveLocationIndex(2014, 0)).toBe(75);
    expect(resolveLocationIndex(2014, 50_000_000)).toBe(145);
  });
  it("2026 위치지수표 부재 (R11) → undefined", () => {
    expect(hasLocationIndexYear(2026)).toBe(false);
    expect(resolveLocationIndex(2026, 1_000_000)).toBeUndefined();
    expect(hasLocationIndexYear(2025)).toBe(true);
  });
  it("2000 이전 = 2001년표", () => {
    expect(resolveLocationIndex(1999, 100_000)).toBe(90);
  });
});

describe("D2 구조지수", () => {
  it("2026 철근콘크리트조=100 / 목구조=115 (BSP-01 anchor 구성요소)", () => {
    expect(resolveStructureIndex(2025, "rc")).toBe(100); // 철근콘크리트조 2025
    expect(resolveStructureIndex(2026, "wood_frame")).toBe(115);
    expect(resolveStructureIndex(2025, "wood_frame")).toBe(120); // 목구조 연도 변동
    expect(resolveStructureIndex(2024, "wood_frame")).toBe(125);
  });
  it("통나무조 = 135 (2016~2026)", () => {
    expect(resolveStructureIndex(2020, "solid_wood")).toBe(135);
  });
  it("연도별 미세차: 시멘트벽돌조 2017=90 / 2020=92 / 2024=95", () => {
    expect(resolveStructureIndex(2017, "cement_brick")).toBe(90);
    expect(resolveStructureIndex(2020, "cement_brick")).toBe(92);
    expect(resolveStructureIndex(2024, "cement_brick")).toBe(95);
  });
  it("2001~2002 연도군 = 통나무 130 / 경량철골 50", () => {
    expect(resolveStructureIndex(2001, "solid_wood")).toBe(130);
    expect(resolveStructureIndex(2002, "light_steel_frame")).toBe(50);
  });
  it("해당 연도 미존재 구조 = undefined (2001엔 ALC조 없음)", () => {
    expect(resolveStructureIndex(2001, "alc")).toBeUndefined();
  });
  it("listStructureOptions: 연도별 옵션 수(2026=11행 분해 / 2001~02=8행 분해)", () => {
    const y2026 = listStructureOptions(2026);
    expect(y2026.length).toBeGreaterThan(0);
    expect(y2026.every((o) => o.label && o.index > 0)).toBe(true);
    // 2026 최상위 지수 = 통나무조 135
    expect(y2026[0]).toMatchObject({ key: "solid_wood", index: 135 });
  });
});

describe("D8 구조그룹맵 (잔가율 ↔ 산정기준율 별개 체계)", () => {
  it("황토조 = 잔가율 III · 산정기준율 II (핵심 재편)", () => {
    expect(resolveResidualGroup("ocher")).toBe("III");
    expect(resolveAcqBaseGroup("ocher")).toBe("II");
  });
  it("목구조 = 잔가율 I · 산정기준율 I / 목조 = 잔가율 II · 산정기준율 II", () => {
    expect(resolveResidualGroup("wood_frame")).toBe("I");
    expect(resolveAcqBaseGroup("wood_frame")).toBe("I");
    expect(resolveResidualGroup("wood")).toBe("II");
    expect(resolveAcqBaseGroup("wood")).toBe("II");
  });
  it("경량철골조 = 잔가율 III · 산정기준율 III", () => {
    expect(resolveResidualGroup("light_steel_frame")).toBe("III");
    expect(resolveAcqBaseGroup("light_steel_frame")).toBe("III");
  });
  it("신공법 구조(ALC·와이어패널·조립식패널·컨테이너)는 산정기준율 그룹 undefined", () => {
    expect(resolveResidualGroup("alc")).toBe("II");
    expect(resolveAcqBaseGroup("alc")).toBeUndefined();
    expect(resolveAcqBaseGroup("container")).toBeUndefined();
    expect(resolveAcqBaseGroup("prefab_panel")).toBeUndefined();
  });
  it("기계식주차전용빌딩 = 잔가율 III · 산정기준율 III", () => {
    expect(resolveResidualGroup("mechanical_parking")).toBe("III");
    expect(resolveAcqBaseGroup("mechanical_parking")).toBe("III");
  });
});

describe("D7 조정율 구간 판정", () => {
  it("최고층수 → 지수 (5층이하 90 / 11~15층 110 / 21층↑ 130)", () => {
    expect(resolveMaxFloorsRate(3)).toBe(90);
    expect(resolveMaxFloorsRate(12)).toBe(110);
    expect(resolveMaxFloorsRate(25)).toBe(130);
  });
  it("연면적 → 지수 (1천㎡미만 90 / 5만㎡이상 130)", () => {
    expect(resolveGrossAreaRate(500)).toBe(90);
    expect(resolveGrossAreaRate(60_000)).toBe(130);
  });
  it("무벽면적비율: 28번은 1/4 '초과'(strict), 29·30 '이상'", () => {
    expect(resolveWallessRate(0.25)).toBe(100); // 1/4 이하 미적용
    expect(resolveWallessRate(0.3)).toBe(80); // 1/4 초과~2/4 미만
    expect(resolveWallessRate(0.5)).toBe(70); // 2/4 이상
    expect(resolveWallessRate(0.75)).toBe(60); // 3/4 이상
  });
});

describe("D9 기계식주차 산식 (연도 가변)", () => {
  it("2025·2026 = 6,000,000 · 내용연수 30년 (BSP-MECH anchor)", () => {
    expect(resolveMechParkingFormula(2025)).toEqual({ unitPrice: 6_000_000, durableYears: 30 });
    expect(resolveMechParkingFormula(2026)).toEqual({ unitPrice: 6_000_000, durableYears: 30 });
  });
  it("2001·2002 = 5,000,000 · 내용연수 20년", () => {
    expect(resolveMechParkingFormula(2001)).toEqual({ unitPrice: 5_000_000, durableYears: 20 });
  });
  it("중간 연도(2003~2010)는 미확정 → undefined (D3 연동 대기)", () => {
    expect(resolveMechParkingFormula(2010)).toBeUndefined();
  });
  it("기계식주차 단가·내용연수 연도 변천: 2011·2012=5백만 / 2013=5.5백만 / 2014=5.75백만 / 2015=6백만(20년) / 2016~=6백만(30년)", () => {
    expect(resolveMechParkingFormula(2011)).toEqual({ unitPrice: 5_000_000, durableYears: 20 });
    expect(resolveMechParkingFormula(2012)).toEqual({ unitPrice: 5_000_000, durableYears: 20 });
    expect(resolveMechParkingFormula(2013)).toEqual({ unitPrice: 5_500_000, durableYears: 20 });
    expect(resolveMechParkingFormula(2014)).toEqual({ unitPrice: 5_750_000, durableYears: 20 });
    expect(resolveMechParkingFormula(2015)).toEqual({ unitPrice: 6_000_000, durableYears: 20 });
    expect(resolveMechParkingFormula(2016)).toEqual({ unitPrice: 6_000_000, durableYears: 30 });
  });

  it("BSP-MECH 손계산: 6,000,000 × 0.850(III·경과5) × 50 = 255,000,000", () => {
    const f = resolveMechParkingFormula(2025)!;
    const rate = calcResidualRate(durableYearsToResidualGroup(f.durableYears), 2025 - 2020);
    expect(Math.floor(f.unitPrice * rate * 50)).toBe(255_000_000);
  });
});

describe("D6 산정기준율 (산정 기준율.pdf 텍스트 추출 — 무오류 전사)", () => {
  it("I그룹(40년) 대각선·경계", () => {
    expect(resolveAcqBaseRate("I", 2000, 2000)).toBe(1.016);
    expect(resolveAcqBaseRate("I", 1999, 1999)).toBe(1.002);
    expect(resolveAcqBaseRate("I", 1992, 2000)).toBe(1.019);
    expect(resolveAcqBaseRate("I", 1992, 1992)).toBe(0.942);
    expect(resolveAcqBaseRate("I", 1985, 1985)).toBe(0.716); // 취득1985 = 1985이전 버킷
  });
  it("II그룹(30년)·III그룹(20년) 대각선", () => {
    expect(resolveAcqBaseRate("II", 2000, 2000)).toBe(1.02);
    expect(resolveAcqBaseRate("II", 1999, 1999)).toBe(1.01);
    expect(resolveAcqBaseRate("III", 2000, 2000)).toBe(1.027);
    expect(resolveAcqBaseRate("III", 1999, 1999)).toBe(1.025);
  });
  it("그룹 최저 신축연도 '이전' 버킷 (1945/1955/1965)", () => {
    expect(resolveAcqBaseRate("I", 1945, 1985)).toBe(1.215); // I 1945이전·1985이전
    expect(resolveAcqBaseRate("I", 1940, 1980)).toBe(1.215); // clamp: ≤1945→1945, ≤1985→1985
    expect(resolveAcqBaseRate("II", 1955, 1985)).toBe(1.386);
    expect(resolveAcqBaseRate("III", 1965, 1985)).toBe(1.67);
  });
  it("취득연도 2001 이후(2000.12.31 이전 취득 전용) → undefined", () => {
    expect(resolveAcqBaseRate("I", 1995, 2001)).toBeUndefined();
  });
  it("취득<신축(삼각 밖) 미수록 셀 → undefined", () => {
    expect(resolveAcqBaseRate("I", 2000, 1999)).toBeUndefined();
  });
});

describe("D3 용도지수 (이미지 직접 판독, 2026 BASE + 연도 override)", () => {
  it("2026 BASE: 아파트=110 / 학교=102 / 고아원=85", () => {
    expect(resolveUsageIndex(2026, 1)).toBe(110);
    expect(resolveUsageIndex(2026, 33)).toBe(102);
    expect(resolveUsageIndex(2026, 35)).toBe(85);
  });
  it("2025 override 2개(#33=100·#35=83), 나머지 BASE", () => {
    expect(resolveUsageIndex(2025, 33)).toBe(100);
    expect(resolveUsageIndex(2025, 35)).toBe(83);
    expect(resolveUsageIndex(2025, 1)).toBe(110); // BASE
    expect(resolveUsageIndex(2025, 6)).toBe(112); // BASE(2025=2026)
  });
  it("2024: 여관=117·일반상점=100·유흥=135·제1·2종근생=100·창고=80", () => {
    expect(resolveUsageIndex(2024, 6)).toBe(117);
    expect(resolveUsageIndex(2024, 11)).toBe(100);
    expect(resolveUsageIndex(2024, 15)).toBe(135);
    expect(resolveUsageIndex(2024, 41)).toBe(100);
    expect(resolveUsageIndex(2024, 52)).toBe(80);
  });
  it("연도별 미세차: 여관 2021=115 / 2022·2023=117 / 2026=112", () => {
    expect(resolveUsageIndex(2021, 6)).toBe(115);
    expect(resolveUsageIndex(2022, 6)).toBe(117);
    expect(resolveUsageIndex(2023, 6)).toBe(117);
    expect(resolveUsageIndex(2026, 6)).toBe(112);
  });
  it("2020 단독차이: 일반병원 #27=105 (2021=110)", () => {
    expect(resolveUsageIndex(2020, 27)).toBe(105);
    expect(resolveUsageIndex(2021, 27)).toBe(110);
  });
  it("2019: #15=130(BASE 회귀, 2020~2023=135) / 2018: #32=105·#34=105", () => {
    expect(resolveUsageIndex(2019, 15)).toBe(130);
    expect(resolveUsageIndex(2020, 15)).toBe(135);
    expect(resolveUsageIndex(2018, 32)).toBe(105);
    expect(resolveUsageIndex(2018, 34)).toBe(105);
    expect(resolveUsageIndex(2019, 34)).toBe(107);
  });
  it("미전사 연도: 2010 이하 = undefined, 2011~2026 = 전사완료", () => {
    expect(hasUsageIndexYear(2010)).toBe(false);
    expect(resolveUsageIndex(2010, 1)).toBeUndefined();
    expect(hasUsageIndexYear(2011)).toBe(true);
    expect(hasUsageIndexYear(2012)).toBe(true);
    expect(hasUsageIndexYear(2013)).toBe(true);
    expect(hasUsageIndexYear(2014)).toBe(true);
    expect(hasUsageIndexYear(2015)).toBe(true);
    expect(hasUsageIndexYear(2017)).toBe(true);
    expect(hasUsageIndexYear(2018)).toBe(true);
    expect(hasUsageIndexYear(2026)).toBe(true);
  });
  it("listUsageOptions(2026) = 60항목(#1~60, #61 기계식 제외)", () => {
    const opts = listUsageOptions(2026);
    expect(opts.length).toBe(60);
    expect(opts[0]).toMatchObject({ no: 1, label: "아파트", index: 110 });
  });
});

describe("D3 용도지수 59항목 체계 (2003~2017, 2017 BASE + 연도 override)", () => {
  // 59체계: 장례식장=#27(종합병원 #26 직후)·일반병원=#28·오피스텔=#29. 60체계와 번호 상이.
  it("2017 BASE: 아파트=110 / 종합병원=125 / 장례식장(#27)=115 / 일반병원(#28)=105 / 오피스텔(#29)=140", () => {
    expect(resolveUsageIndex(2017, 1)).toBe(110);
    expect(resolveUsageIndex(2017, 26)).toBe(125);
    expect(resolveUsageIndex(2017, 27)).toBe(115);
    expect(resolveUsageIndex(2017, 28)).toBe(105);
    expect(resolveUsageIndex(2017, 29)).toBe(140);
  });
  it("2017 사무소(#30)=115 / 원자력(#47)=300 / 화초온실(#58)=50", () => {
    expect(resolveUsageIndex(2017, 30)).toBe(115);
    expect(resolveUsageIndex(2017, 47)).toBe(300);
    expect(resolveUsageIndex(2017, 58)).toBe(50);
  });
  it("2016 vs 2017 차이: 사무소(#30) 2016=110 / 2017=115, 그 외 동일", () => {
    expect(resolveUsageIndex(2016, 30)).toBe(110);
    expect(resolveUsageIndex(2017, 30)).toBe(115);
    expect(resolveUsageIndex(2016, 27)).toBe(115); // 장례식장 동일
    expect(resolveUsageIndex(2016, 1)).toBe(110); // BASE 동일
  });
  it("59체계 listUsageOptions(2017) = 58항목(#1~58, #59 기계식 제외)", () => {
    const opts = listUsageOptions(2017);
    expect(opts.length).toBe(58);
    expect(opts[0]).toMatchObject({ no: 1, label: "아파트", index: 110 });
    // 60체계엔 없는 위치: 59체계 #27=장례식장
    expect(opts.find((o) => o.no === 27)?.label).toContain("장례식장");
  });
  it("59체계 연도 기계식주차: 2016·2017 = 6,000,000 · 30년", () => {
    expect(resolveMechParkingFormula(2016)).toEqual({ unitPrice: 6_000_000, durableYears: 30 });
    expect(resolveMechParkingFormula(2017)).toEqual({ unitPrice: 6_000_000, durableYears: 30 });
  });
  it("2015 override: 여인숙(#8)=90 / 도매시장(#12)=80 / 무도장(#14)=135 / 오피스텔(#29)=130 / 화초온실(#58)=45", () => {
    expect(resolveUsageIndex(2015, 8)).toBe(90);
    expect(resolveUsageIndex(2015, 12)).toBe(80);
    expect(resolveUsageIndex(2015, 14)).toBe(135);
    expect(resolveUsageIndex(2015, 29)).toBe(130);
    expect(resolveUsageIndex(2015, 58)).toBe(45);
    expect(resolveUsageIndex(2015, 1)).toBe(110); // BASE 동일
  });
  it("2015 기계식주차 = 6,000,000 · 20년 (★ 내용연수 2016부터 30년)", () => {
    expect(resolveMechParkingFormula(2015)).toEqual({ unitPrice: 6_000_000, durableYears: 20 });
  });
});

describe("D3 용도지수 61항목-2014 체계 (2014 단독)", () => {
  // 고시원=#7·기타판매=#12·도매시장=#13·하역장=#51·캐노피=#53 별도 행
  it("2014: 아파트=110 / 고시원(#7)=100 / 기타판매(#12)=95 / 도매시장(#13)=80 / 무도장(#15)=135", () => {
    expect(resolveUsageIndex(2014, 1)).toBe(110);
    expect(resolveUsageIndex(2014, 7)).toBe(100);
    expect(resolveUsageIndex(2014, 12)).toBe(95);
    expect(resolveUsageIndex(2014, 13)).toBe(80);
    expect(resolveUsageIndex(2014, 15)).toBe(135);
  });
  it("2014: 종합병원(#27)=120 / 장례식장(#28)=110 / 원자력(#47)=300 / 캐노피(#53)=85 / 화초온실(#60)=45", () => {
    expect(resolveUsageIndex(2014, 27)).toBe(120);
    expect(resolveUsageIndex(2014, 28)).toBe(110);
    expect(resolveUsageIndex(2014, 47)).toBe(300);
    expect(resolveUsageIndex(2014, 53)).toBe(85);
    expect(resolveUsageIndex(2014, 60)).toBe(45);
  });
  it("2014 listUsageOptions = 60항목(#1~60, #61 기계식 제외), #7=고시원", () => {
    const opts = listUsageOptions(2014);
    expect(opts.length).toBe(60);
    expect(opts.find((o) => o.no === 7)?.label).toBe("고시원");
  });
});

describe("D3 용도지수 53항목 체계 (2013 단독)", () => {
  // 단독주택 #2·다중주택 #3 분리, 유흥+무도장 통합 #14, 원자력 별도행 없음(#41에 발전소 통합)
  it("2013: 아파트=110 / 단독주택(#2)=100 / 다중주택(#3)=100 / 유흥+무도장(#14)=130", () => {
    expect(resolveUsageIndex(2013, 1)).toBe(110);
    expect(resolveUsageIndex(2013, 2)).toBe(100);
    expect(resolveUsageIndex(2013, 3)).toBe(100);
    expect(resolveUsageIndex(2013, 14)).toBe(130);
  });
  it("2013: 종합병원(#24)=120 / 장례식장(#26)=110 / 냉동공장+발전소(#41)=90 / 화초온실(#52)=40", () => {
    expect(resolveUsageIndex(2013, 24)).toBe(120);
    expect(resolveUsageIndex(2013, 26)).toBe(110);
    expect(resolveUsageIndex(2013, 41)).toBe(90);
    expect(resolveUsageIndex(2013, 52)).toBe(40);
  });
  it("2013 listUsageOptions = 52항목(#1~52, #53 기계식 제외), #53 번호 없음", () => {
    const opts = listUsageOptions(2013);
    expect(opts.length).toBe(52);
    expect(resolveUsageIndex(2013, 53)).toBeUndefined(); // #53은 기계식(D9)
  });
});

describe("D3 용도지수 51항목 체계 (2012 단독)", () => {
  // 예식장 #17 단독·동물원+공연장+집회장 통합 #18·관람장+전시장 #19. 50 일반 + #51 기계식
  it("2012: 아파트=110 / 예식장(#17)=120 / 동물원+공연장(#18)=110 / 유흥+무도장(#14)=120", () => {
    expect(resolveUsageIndex(2012, 1)).toBe(110);
    expect(resolveUsageIndex(2012, 17)).toBe(120);
    expect(resolveUsageIndex(2012, 18)).toBe(110);
    expect(resolveUsageIndex(2012, 14)).toBe(120);
  });
  it("2012: 종합병원(#23)=120 / 장례식장(#25)=110 / 냉동공장+발전소(#39)=90 / 화초온실(#50)=40", () => {
    expect(resolveUsageIndex(2012, 23)).toBe(120);
    expect(resolveUsageIndex(2012, 25)).toBe(110);
    expect(resolveUsageIndex(2012, 39)).toBe(90);
    expect(resolveUsageIndex(2012, 50)).toBe(40);
  });
  it("2012 listUsageOptions = 50항목(#1~50, #51 기계식 제외)", () => {
    const opts = listUsageOptions(2012);
    expect(opts.length).toBe(50);
    expect(resolveUsageIndex(2012, 51)).toBeUndefined(); // #51은 기계식(D9)
  });
  it("2012 기계식주차 = 5,000,000 · 20년", () => {
    expect(resolveMechParkingFormula(2012)).toEqual({ unitPrice: 5_000_000, durableYears: 20 });
  });
});

describe("D3 용도지수 46항목 체계 (2011 단독)", () => {
  // 단란+유흥+유원+카지노+무도장 통합#13·주점영업#14. #43 원본 건너뜀. 동·식물관련 행 원본 부재(#46까지)
  it("2011: 아파트=110 / 통합위락(#13)=120 / 주점영업(#14)=100 / 무도학원(#15)=80", () => {
    expect(resolveUsageIndex(2011, 1)).toBe(110);
    expect(resolveUsageIndex(2011, 13)).toBe(120);
    expect(resolveUsageIndex(2011, 14)).toBe(100);
    expect(resolveUsageIndex(2011, 15)).toBe(80);
  });
  it("2011: 종합병원(#22)=120 / 장례식장(#24)=110 / 냉동공장+아파트형공장+발전소(#37)=90 / 주차장(#46)=60", () => {
    expect(resolveUsageIndex(2011, 22)).toBe(120);
    expect(resolveUsageIndex(2011, 24)).toBe(110);
    expect(resolveUsageIndex(2011, 37)).toBe(90);
    expect(resolveUsageIndex(2011, 46)).toBe(60);
  });
  it("2011 #43 원본 건너뜀 → undefined / listUsageOptions = 45항목(#1~46 중 #43 제외)", () => {
    expect(resolveUsageIndex(2011, 43)).toBeUndefined();
    const opts = listUsageOptions(2011);
    expect(opts.length).toBe(45);
  });
  it("2011 기계식주차 = 5,000,000 · 20년 (원본 IV행 부재, 2012 동일)", () => {
    expect(resolveMechParkingFormula(2011)).toEqual({ unitPrice: 5_000_000, durableYears: 20 });
  });
});

describe("BSP-01 데이터 구성요소 손계산 (엔진 미구현 — 데이터 곱 검증)", () => {
  it("850,000 × 100/100 × 110/100 × 132/100 × 0.910 → 1,123,000 / ×200㎡ = 224,600,000", () => {
    const basePrice = resolveNewBuildingBasePrice(2025)!; // 850,000
    const structIdx = resolveStructureIndex(2025, "rc")!; // 100
    const usageIdx = resolveUsageIndex(2025, 1)!; // 아파트 110 (D3 전사 완료)
    const locIdx = resolveLocationIndex(2025, 7_500_000)!; // 132
    const residual = calcResidualRate("I", 2025 - 2020); // 0.910
    const raw = (basePrice * structIdx * usageIdx * locIdx) / 1_000_000 * residual;
    const pricePerM2 = Math.floor(raw / 1000) * 1000;
    expect(pricePerM2).toBe(1_123_000);
    expect(pricePerM2 * 200).toBe(224_600_000);
  });
});
