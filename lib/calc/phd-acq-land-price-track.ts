/**
 * 취득 위치지수용 개별공시지가 — 트랙 판정 (단일 출처).
 *
 * 계획서: docs/02-design/features/mixed-use-commercial-stdprice-modal-landprice-prefill.plan.md
 *
 * 취득 공시지가는 **의미가 다른 두 트랙**이 있고 섞으면 오입력이다:
 *  - **토지값 트랙** (`phdLandPricePerSqmAtAcq` / `mixedAcqLandPricePerSqm`)
 *    = 취득당시 연도 공시지가. 부수토지 기준시가(= 공시지가 × 면적) 산정용. 엔진 입력.
 *  - **위치지수 트랙** (`phdLandPricePerSqmAtAcq2001`)
 *    = 취득연도 ≤2000일 때 **2001.1.1 현재** 공시지가. 건물 기준시가 위치지수 산정용(소령 §164⑤·고시 §6①).
 *    취득연도 ≥2001이면 위치지수도 취득당시 연도 값을 쓰므로 토지값 트랙과 같은 값.
 *
 * 이 경계(≤2000)는 배치 모달 시드·applyBatch 라우팅·상가 모달 prefill 게이트 3곳에서 쓰이므로
 * 조건을 복제하지 않고 여기서 단일 관리한다.
 */

/** 취득 위치지수 공시지가가 2001.1.1 기준 트랙인가 (§164⑤). 연도 미상은 false. */
export function isAcq2001LocationIndexTrack(acqYear: number | undefined): boolean {
  return acqYear != null && Number.isFinite(acqYear) && acqYear <= 2000;
}

/**
 * 취득 위치지수 산정용 ㎡당 개별공시지가를 트랙에 맞게 선택.
 * ≤2000 → 2001.1.1 값 / ≥2001·연도미상 → 취득당시 연도 값. 없으면 "".
 */
export function pickAcqLocationIndexLandPrice(
  acqYear: number | undefined,
  atAcq: string | undefined,
  atAcq2001: string | undefined,
): string {
  return (isAcq2001LocationIndexTrack(acqYear) ? atAcq2001 : atAcq) ?? "";
}
