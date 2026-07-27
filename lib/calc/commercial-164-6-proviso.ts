/**
 * 소득세법 시행령 §164⑥ 단서 게이트 — 나목 가액 부재 시 §164⑤ 준용.
 *
 * > §164⑥ … 이 경우 해당 자산에 대하여 국세청장이 최초로 고시한 기준시가 고시당시 또는
 * > 취득당시의 **법 제99조제1항제1호나목의 가액이 없는 경우**에는 **제5항을 준용**하여 계산한 가액에 따른다.
 *
 * UI(안내·확인 토글)와 validate(차단)가 **같은 판정을 써야 하므로** 여기 한 곳에만 둔다.
 *
 * 계획서: docs/01-plan/features/commercial-164-6-proviso-164-5-application.plan.md
 */
import { ACQ_BASE_RATE_MAX_ACQ_YEAR } from "@/lib/tax-engine/data/building-standard-price";

/**
 * §164⑥ 단서 발동 여부 — 취득당시 건물 기준시가(나목)가 없는 구간인가.
 *
 * 경계는 국세청 「취득당시 건물기준시가 산정기준율표」의 취득연도 축 상한(2000)이다.
 * 그 표가 1985~2000만 수록하고 `resolveAcqBaseRate()`가 그 위를 잘라내는 것이,
 * 곧 국세청이 정한 "나목 가액이 없어 §164⑤로 산정하는 구간"이다.
 *
 * 최초고시 당시(상가·오피스텔 2005-01-01)는 2001년 이후라 나목 가액이 존재하므로
 * 단서의 두 요건("최초고시 당시 또는 취득당시") 중 **취득당시만** 문제된다.
 *
 * @param cbEra          호별고시 취득 시점 구분 — `pre_disclosure`(§164⑥ 경로)일 때만 대상
 * @param acquisitionDate 취득일(YYYY-MM-DD). 상속은 상속개시일.
 */
export function isSec164_5ProvisoApplicable(
  cbEra: string | undefined,
  acquisitionDate: string | undefined,
): boolean {
  if (cbEra !== "pre_disclosure") return false;
  return isBeforeBuildingStdPriceNotice(acquisitionDate);
}

/** 취득일이 건물 기준시가(나목) 고시 이전 구간(취득연도 ≤ 2000)인가. */
export function isBeforeBuildingStdPriceNotice(acquisitionDate: string | undefined): boolean {
  if (!acquisitionDate || acquisitionDate.length < 4) return false;
  const year = Number.parseInt(acquisitionDate.slice(0, 4), 10);
  return Number.isFinite(year) && year <= ACQ_BASE_RATE_MAX_ACQ_YEAR;
}
