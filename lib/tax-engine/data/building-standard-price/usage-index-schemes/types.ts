/**
 * D3 용도지수 — 스킴 공통 타입
 *
 * 번호 체계가 동일한 연도 묶음 = 하나의 `UsageScheme`. 레지스트리(usage-index.ts)에서 연도로 디스패치.
 * 시대별 번호 체계 상이 — 같은 용도라도 연도에 따라 번호·항목 수가 다름. 상세: usage-index.ts 상단 주석.
 */

/** 번호 체계가 동일한 연도 묶음 = 하나의 용도지수 스킴 */
export interface UsageScheme {
  /** 적용 연도 집합 */
  years: ReadonlySet<number>;
  /** 일반 용도 최대 번호(이 + 1 = 기계식주차, D9에서 처리) */
  maxGeneralNo: number;
  /**
   * 고시 용도지수표 **구분 I(주거용 건물)** 의 마지막 번호 — `1 <= no <= residentialMaxNo` 가 주거다.
   * 체계마다 다르다: 2001~2002 = 2 · 2003~2013 = 3 · 2014~2026 = 2.
   * 조정률 구분 II 는 「주거용건물은 아파트에 한해 최고층수기준만 적용」이라 이 경계가 필요하다.
   */
  residentialMaxNo: number;
  /**
   * **아파트**에 해당하는 용도번호 — 조정률 구분 II 단서 「주거용건물은 **아파트에 한해**
   * 최고층수기준만 적용」을 가른다(주거용인데 아파트가 아니면 구분 II 전체 미적용).
   * ⚠️ 2001~2002 체계는 #1 이 「단독주택·**아파트**」 통합이라 번호로 가를 수 없다 ⇒ `undefined`.
   *    그 시대만 사용자 플래그(`isApartmentUse`)가 정본이다.
   */
  apartmentUsageNo?: number;
  /** 용도 번호 → 표시명 (이 스킴 공통, baseYear 기준 라벨) */
  labels: Readonly<Record<number, string>>;
  /** BASE 연도 용도지수 */
  baseIndex: Readonly<Record<number, number>>;
  /** 연도별 override (BASE 대비 변경 번호만). BASE 연도는 없음 */
  overrides: Readonly<Record<number, Readonly<Record<number, number>>>>;
}
