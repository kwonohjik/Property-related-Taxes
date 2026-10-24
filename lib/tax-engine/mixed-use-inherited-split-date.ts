/**
 * 겸용주택 상속·증여 × 토지·건물 취득일 중 **한쪽만** 의제취득일(1985.1.1.) 전 — 계산하지 않는다(사용자 결정 2026-10-24 · PR-7b-7b 리뷰 F-1 후속).
 *
 * 파트마다 비교 구간(의제취득일 전 ①②③ / 단서 구간 ①② / 평가액)이 갈려 자산 합계 비교(PR-6 Q-15·Q-21)가 성립하지 않고,
 * 상증법 평가액 칸도 토지·건물로 나뉘지 않는다. 종전 일반 양도는 건물 취득일 하나로 자산 전체 구간을 정해 조용히 틀렸다
 * (토지 1983·건물 1990 → 토지의 ③ 누락 334,023,659 · 토지 1990·건물 1983 → 1990 토지에도 ③ 314,427,483).
 * 화면에서는 이 조합이 생기지 않는다 — 겸용 상속·증여에는 토지 취득일 칸이 없고, 매매에서 넣은 토지 날짜는 원인 전환·복원 때 비운다
 * (`CompanionAcquisitionCauseSection` · `calc-wizard-asset-migrate`). 그래서 차단은 API 직접 호출 방어선이다:
 * ⑫(`refineMixedUseInheritedSplitDate` — 주 자산·함께 양도 컴패니언) · 엔진(`calcMixedUseCore` — 단건. 컴패니언 겸용 엔진 입력에는 취득원인이 없어 닿지 않는다).
 * 부담부증여는 prepare MB-16이 같은 조합을 막는다(증여자 문구).
 */
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";

type DateLike = Date | string | undefined | null;

const DEEMED_ACQUISITION_TIME = new Date("1985-01-01").getTime();
const toTime = (d: DateLike): number | undefined => {
  if (d === undefined || d === null || d === "") return undefined;
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isNaN(t) ? undefined : t;
};

export const MIXED_INHERITED_SPLIT_DATE_MESSAGE =
  "상속·증여로 취득한 겸용주택의 토지·건물 취득일 중 한쪽만 1985.1.1. 전이면 의제취득일 전후가 섞여 계산하지 않습니다 — 토지·건물을 함께 상속·증여받았으면 같은 취득일을 입력하세요.";

export function isMixedInheritedSplitDateStraddle(cause: string | undefined, landDate: DateLike, buildingDate: DateLike): boolean {
  if (cause !== "inheritance" && cause !== "gift") return false;
  const land = toTime(landDate);
  const building = toTime(buildingDate);
  if (land === undefined || building === undefined) return false;
  return land < DEEMED_ACQUISITION_TIME !== building < DEEMED_ACQUISITION_TIME;
}

/** 엔진 진입 가드 — ⑫가 먼저 막으므로 API 직접·내부 호출 방어용이다. */
export function assertMixedInheritedSplitDateSupported(asset: {
  acquisitionCause?: string;
  landAcquisitionDate?: DateLike;
  buildingAcquisitionDate?: DateLike;
}): void {
  if (isMixedInheritedSplitDateStraddle(asset.acquisitionCause, asset.landAcquisitionDate, asset.buildingAcquisitionDate)) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, MIXED_INHERITED_SPLIT_DATE_MESSAGE);
  }
}
