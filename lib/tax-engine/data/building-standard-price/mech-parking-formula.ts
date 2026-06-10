/**
 * D9. 기계식주차전용빌딩 특수산식 (연도 → {단가, 내용연수})
 *
 * 출처: 국세청 「건물 기준시가 계산방법」 고시 — 부록 「연도별 용도지수표」 각 연도 구분 IV(기계식주차전용빌딩) 비고 행.
 * PDF 실측(2026-06-10).
 *
 * ★ 일반 산식과 완전히 다른 특수산식: `기준시가 = 단가 × 경과연수별잔가율(내용연수 그룹) × 주차대수`.
 *   구조·용도·위치지수·연면적·조정율 모두 미적용. 잔가율 그룹은 내용연수로 결정(`durableYearsToResidualGroup`).
 *
 * ⚠️ **연도 가변**(실측 확정): 2025·2026년 = 6,000,000원·내용연수 30년 / 2001·2002년 = 5,000,000원·내용연수 20년.
 *   ☐ 중간 연도(2003~2024)의 단가·내용연수 변경 시점은 D3 용도지수 전사 시 각 연도표 IV 행에서 확정 예정.
 *   미확정 연도는 undefined 반환 → 호출부에서 검증 오류 처리(silent fallback 금지).
 */

export interface MechParkingFormula {
  /** 기준 단가(원) */
  unitPrice: number;
  /** 내용연수(년) — 잔가율 그룹 결정용 */
  durableYears: 20 | 30;
}

/**
 * 연도 → 기계식주차 특수산식 파라미터.
 * ⚠️ 확정 연도만 등재. 중간 연도(2003~2024)는 용도지수 전사(D3) 후 보강.
 */
export const MECH_PARKING_FORMULA: Readonly<Record<number, MechParkingFormula>> = Object.freeze({
  2001: { unitPrice: 5_000_000, durableYears: 20 },
  2002: { unitPrice: 5_000_000, durableYears: 20 },
  // ☐ 2003~2011: D3 용도지수 각 연도표 IV 행에서 단가·내용연수 확정 예정
  2012: { unitPrice: 5_000_000, durableYears: 20 },
  2013: { unitPrice: 5_500_000, durableYears: 20 },
  2014: { unitPrice: 5_750_000, durableYears: 20 },
  2015: { unitPrice: 6_000_000, durableYears: 20 }, // ★ 단가 6백만이나 내용연수 20년(2016부터 30년)
  2016: { unitPrice: 6_000_000, durableYears: 30 },
  2017: { unitPrice: 6_000_000, durableYears: 30 },
  2018: { unitPrice: 6_000_000, durableYears: 30 },
  2019: { unitPrice: 6_000_000, durableYears: 30 },
  2020: { unitPrice: 6_000_000, durableYears: 30 },
  2021: { unitPrice: 6_000_000, durableYears: 30 },
  2022: { unitPrice: 6_000_000, durableYears: 30 },
  2023: { unitPrice: 6_000_000, durableYears: 30 },
  2024: { unitPrice: 6_000_000, durableYears: 30 },
  2025: { unitPrice: 6_000_000, durableYears: 30 },
  2026: { unitPrice: 6_000_000, durableYears: 30 },
});

/** 연도 → 기계식주차 산식 파라미터. 2000 이전 = 2001년값. 미확정/범위 밖이면 undefined */
export function resolveMechParkingFormula(year: number): MechParkingFormula | undefined {
  if (year < 2001) return MECH_PARKING_FORMULA[2001];
  return MECH_PARKING_FORMULA[year];
}
