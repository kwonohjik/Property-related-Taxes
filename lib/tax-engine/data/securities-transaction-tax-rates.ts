/**
 * 증권거래세 연도별 탄력세율 매트릭스 (Phase 2 — 단일 진실)
 *
 * 역사 확정 데이터 — DB 아닌 정적 상수 (memory feedback_historical_tax_tables).
 * 전 구간 KoreanLaw applicable_law(행위시법 도구) 축자 검증 (2026-06-11):
 *
 *   2020.4.1~12.31 — **법 §8① 1만분의 45**(제16837호, 2019.12.31 공포, **2020.4.1 시행**)
 *               + 시행령 §5 탄력세율(2013.8.27·2017.2.7·**2019.5.28** 개정본 — 2020년 §5 개정 없음):
 *               1호 1천분의 1 = 유가증권시장(자본시장법령 §176의9①)·코넥스시장(§11②)
 *               2호 1천분의 2.5 = 코스닥시장(영 24697호 부칙 §8)·금융투자협회 K-OTC(§178①)
 *               ※ 사용자 제공 국세법령정보시스템 화면 2건으로 확정(2026-08-27).
 *                 시행령 §5 의 **2019.5.28 개정 시행일이 화면에 없어** 구간 시작을 그보다 이른
 *                 시점으로 열지 않는다 — 본법 시행일이 확정된 **2020.4.1** 부터만 연다.
 *   2021~2022 — 영 제31290호(2020.12.29 공포, 2021.1.1 시행, MST 225167) §5 단서
 *               + 부칙 §2 적용례 "제5조의 개정규정은 이 영 시행 이후 주권을 양도하는 분부터 적용"
 *               비상장 43/10000은 법 §8① 단서 (2021.1.1~2022.12.31 한시)
 *   2023      — 영 제33209호(2023.1.1 시행, MST 247529) §5 단서
 *   2024      — 〃 단서
 *   2025      — §5 본문 (2024 단서 만료 — 코스피 영(0)·3호 15. 영 33209→35359호 두 버전 동일 세율)
 *   2026.1.1~ — 영 제36001호(2025.12.31 공포, 2026.1.1 시행, MST 282431) §5
 *               ※ "영 35947호 2026.1.2 시행"은 부처명 타법개정 — §5 무관 (Phase 1 오귀속 정정)
 *
 *   코스닥·K-OTC 동률(§5 3호 가·나목): time_travel 비교(2021.2.17↔2023.1.1)에서
 *   §5 신설·삭제 0, 변경은 단서 추가(+176자)뿐 — 각 목 구조 전 구간 동일.
 *   코넥스 10/10000·농특세법 §5①5호 15/10000 — 전 구간 불변
 *   (농특세 불변은 2021~2026 부칙 연혁에 §5①5호 개정 흔적 0건으로 간접 확인).
 *
 * Date 경계 규칙: 구간 비교는 new Date("YYYY-MM-DD") UTC ISO 자정 파싱끼리만.
 * 로컬 타임존 생성자(new Date(2026, 0, 1)) 혼용 금지 — KST 9시간 오차로 경계일 오판.
 */

/** 연도별 세율 구간 — 분모 10000 고정 */
export interface StxRatePeriod {
  /** 구간 시작일 (양도일 >= from) — "YYYY-MM-DD" */
  from: string;
  /** 구간 종료일 (양도일 <= to). null = 현행 개방 구간 */
  to: string | null;
  /** 코스피 (시행령 §5 1호) */
  kospiNum: number;
  /** 코스닥·K-OTC (시행령 §5 3호 가·나목 동률) */
  kosdaqKotcNum: number;
  /** 코넥스 (시행령 §5 2호) */
  konexNum: number;
  /** 비상장 장외 (법 §8① — 한시 단서 반영) */
  unlistedNum: number;
  /** 시행령 §5 구간 인용 suffix (rateReference 조합용) */
  refSuffix: string;
  /** 비상장(법 §8①) 구간 인용 */
  unlistedRef: string;
}

/** 증권거래세 분모 (1만분의 N) */
export const STX_RATE_DEN = 10000 as const;

/** 농어촌특별세 분자 — 코스피만, 전 구간 불변 (농특세법 §5①5호 1만분의 15) */
export const STX_AGRI_NUM_KOSPI = 15 as const;

/**
 * 매트릭스 커버 시작일 — 미만 양도는 현행 세율 fallback + 미지원 경고.
 *
 * 2026-08-27 **2021-01-01 → 2020-04-01 로 확대**: 법 §8①(1만분의 45, 2020.4.1 시행)과
 * 그 시점 유효한 시행령 §5(2019.5.28 개정본)를 사용자 제공 화면으로 확정했다.
 *
 * ⚠️ 더 이르게 열지 않는 이유 — 시행령 §5 의 **2019.5.28 개정 시행일**이 확인되지 않았다.
 *    (본법은 2019.12.31 개정 전이 「1천분의 5」임을 time_travel 로 확보했으나, 상장 3시장
 *    탄력세율의 적용 시작일이 없으면 구간 경계를 그을 수 없다 — 추정 금지.)
 */
export const STX_CUTOFF_DATE = "2020-04-01" as const;

/**
 * 연도별 세율 구간 (from 오름차순 — resolve의 find 순회 전제).
 * anchor 기대값은 본 상수 재사용 금지 — 법령 축자 숫자 리터럴로만 작성 (dual-오염 방지).
 */
export const STX_RATE_PERIODS: readonly StxRatePeriod[] = [
  {
    from: "2020-04-01",
    to: "2020-12-31",
    kospiNum: 10,        // 영 §5 1호 가목 — 1천분의 1
    kosdaqKotcNum: 25,   // 영 §5 2호 가·나목 — 1천분의 2.5
    konexNum: 10,        // 영 §5 1호 나목 — 1천분의 1
    unlistedNum: 45,     // 법 §8① — 1만분의 45 (제16837호, 2020.4.1 시행)
    refSuffix: "(2020.4.1~ — 영 §5 2019.5.28 개정본)",
    unlistedRef: "증권거래세법 §8① (2020.4.1 시행 — 1만분의 45)",
  },
  {
    from: "2021-01-01",
    to: "2022-12-31",
    kospiNum: 8,
    kosdaqKotcNum: 23,
    konexNum: 10,
    unlistedNum: 43,
    refSuffix: "단서 (2021~2022 — 영 제31290호)",
    unlistedRef: "증권거래세법 §8① 단서 (2021~2022 한시 1만분의 43)",
  },
  {
    from: "2023-01-01",
    to: "2023-12-31",
    kospiNum: 5,
    kosdaqKotcNum: 20,
    konexNum: 10,
    unlistedNum: 35,
    refSuffix: "단서 (2023 — 영 제33209호)",
    unlistedRef: "증권거래세법 §8①",
  },
  {
    from: "2024-01-01",
    to: "2024-12-31",
    kospiNum: 3,
    kosdaqKotcNum: 18,
    konexNum: 10,
    unlistedNum: 35,
    refSuffix: "단서 (2024 — 영 제33209호)",
    unlistedRef: "증권거래세법 §8①",
  },
  {
    from: "2025-01-01",
    to: "2025-12-31",
    kospiNum: 0, // 코스피 영세율 — 농특세(15/10000)만 부과 (농특세법 §4 7호 단서)
    kosdaqKotcNum: 15,
    konexNum: 10,
    unlistedNum: 35,
    refSuffix: "본문 (2025 — 코스피 영세율, 단서 만료)",
    unlistedRef: "증권거래세법 §8①",
  },
  {
    from: "2026-01-01",
    to: null,
    kospiNum: 5,
    kosdaqKotcNum: 20,
    konexNum: 10,
    unlistedNum: 35,
    refSuffix: "(영 제36001호, 2026.1.1 시행)",
    unlistedRef: "증권거래세법 §8①",
  },
];

// 정렬·연속성 가드 — 구간 from 오름차순 위반 시 로드 시점에 즉시 발견
// (memory feedback_progressive_bracket_sort_enforcement 준용)
for (let i = 1; i < STX_RATE_PERIODS.length; i++) {
  if (STX_RATE_PERIODS[i].from <= STX_RATE_PERIODS[i - 1].from) {
    throw new Error(
      `STX_RATE_PERIODS 정렬 위반: [${i - 1}].from=${STX_RATE_PERIODS[i - 1].from} >= [${i}].from=${STX_RATE_PERIODS[i].from}`,
    );
  }
}
