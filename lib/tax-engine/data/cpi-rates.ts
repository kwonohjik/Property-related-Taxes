/**
 * 연도별 소비자물가지수(CPI) 정적 테이블
 *
 * 출처: 통계청 KOSIS, 기준년도 2020 = 100 (연평균)
 * 의제취득일 전 상속 자산의 물가상승률 환산(소령 §176조의2 ④)에 사용.
 *
 * TODO P1-03: 아래 값은 대략적인 placeholder 입니다.
 * 통계청 KOSIS (https://kosis.kr) 소비자물가지수 확정치로 교체 필요.
 * 경로: 소비자물가조사 > 소비자물가지수(2020=100) > 전국 > 총지수 > 연간
 */

export const CPI_MIN_YEAR = 1965;
export const CPI_MAX_YEAR = 2026;

export interface CpiEntry {
  year: number;
  /** 연평균 CPI (2020 = 100 기준) */
  annual: number;
}

export const CPI_TABLE: ReadonlyArray<CpiEntry> = Object.freeze([
  { year: 1965, annual:  2.4 },
  { year: 1966, annual:  2.6 },
  { year: 1967, annual:  2.8 },
  { year: 1968, annual:  3.0 },
  { year: 1969, annual:  3.3 },
  { year: 1970, annual:  3.6 },
  { year: 1971, annual:  3.9 },
  { year: 1972, annual:  4.2 },
  { year: 1973, annual:  4.6 },
  { year: 1974, annual:  6.2 },
  { year: 1975, annual:  7.8 },
  { year: 1976, annual:  8.9 },
  { year: 1977, annual: 10.2 },
  { year: 1978, annual: 12.1 },
  { year: 1979, annual: 14.5 },
  { year: 1980, annual: 17.4 },
  { year: 1981, annual: 20.7 },
  { year: 1982, annual: 22.2 },
  { year: 1983, annual: 22.8 },
  { year: 1984, annual: 23.8 },
  { year: 1985, annual: 24.6 },
  { year: 1986, annual: 25.2 },
  { year: 1987, annual: 26.6 },
  { year: 1988, annual: 28.6 },
  { year: 1989, annual: 30.1 },
  { year: 1990, annual: 33.2 },
  { year: 1991, annual: 36.6 },
  { year: 1992, annual: 38.9 },
  { year: 1993, annual: 41.3 },
  { year: 1994, annual: 44.6 },
  { year: 1995, annual: 47.7 },
  { year: 1996, annual: 49.7 },
  { year: 1997, annual: 52.1 },
  { year: 1998, annual: 55.8 },
  { year: 1999, annual: 57.2 },
  { year: 2000, annual: 61.2 },
  { year: 2001, annual: 63.1 },
  { year: 2002, annual: 66.7 },
  { year: 2003, annual: 69.1 },
  { year: 2004, annual: 71.6 },
  { year: 2005, annual: 73.2 },
  { year: 2006, annual: 74.6 },
  { year: 2007, annual: 77.0 },
  { year: 2008, annual: 80.7 },
  { year: 2009, annual: 82.0 },
  { year: 2010, annual: 84.4 },
  { year: 2011, annual: 87.6 },
  { year: 2012, annual: 90.0 },
  { year: 2013, annual: 91.0 },
  { year: 2014, annual: 92.4 },
  { year: 2015, annual: 92.8 },
  { year: 2016, annual: 93.7 },
  { year: 2017, annual: 95.0 },
  { year: 2018, annual: 96.9 },
  { year: 2019, annual: 98.2 },
  { year: 2020, annual: 100.0 },
  { year: 2021, annual: 102.5 },
  { year: 2022, annual: 107.7 },
  { year: 2023, annual: 112.0 },
  { year: 2024, annual: 114.5 },
  { year: 2025, annual: 116.0 },
  { year: 2026, annual: 117.5 }, // 잠정 — 확정 시 교체
]);

/**
 * 해당 연도의 CPI 연평균값을 반환한다.
 * 범위(CPI_MIN_YEAR ~ CPI_MAX_YEAR) 밖이거나 데이터 없으면 null.
 */
export function getCpiAnnual(year: number): number | null {
  const entry = CPI_TABLE.find((x) => x.year === year);
  return entry ? entry.annual : null;
}

/**
 * fromDate 연도에서 toDate 연도까지의 물가상승률 비율을 반환한다.
 * CPI 범위 외이거나 fromDate의 CPI가 0이면 1.0(변화 없음)을 반환한다.
 *
 * 산식: toDate 연평균 CPI ÷ fromDate 연평균 CPI
 */
export function getCpiRatio(fromDate: Date, toDate: Date): number {
  const fromYear = fromDate.getFullYear();
  const toYear = toDate.getFullYear();
  const fromCpi = getCpiAnnual(fromYear);
  const toCpi = getCpiAnnual(toYear);
  if (fromCpi === null || toCpi === null || fromCpi === 0) return 1;
  return toCpi / fromCpi;
}
