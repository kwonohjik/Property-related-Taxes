/**
 * 종부령 §3①8호 나목 1)~4)·7호 단서 판정 입력 — `RentalExclusionInput`이 확장한다(800줄 정책으로 분리).
 * 판정: `lib/tax-engine/comprehensive-exclusion-8ho-na.ts`. 없는 값은 「모름」=혜택 불성립 + 확인 필요.
 */
export interface RentalExclusion8NaFacts {
  /** 납세자 구분 — comprehensive-tax가 상위 taxpayerType에서 주입한다. 8호 나목 1)=개인·2)=법인 */
  ownerType?: "individual" | "corporate";
  /** 나목 1) 취득일 */
  acquisitionDate?: Date;
  /** 나목 1) 괄호 — 취득하기 위한 매매계약 체결·계약금 지급일(증빙 확인 전제) */
  depositPaidDate?: Date;
  /** 나목 1) 괄호 — §3⑦2호(상속)·7호(재개발·재건축 등 멸실 후 취득)로 임대기간이 합산되는 취득 */
  acquiredViaMergedPeriod?: boolean;
  /** 나목 1) 취득 당시 1세대가 국내에 1주택 이상 보유 — null/undefined=모름 */
  householdOwnedHouseAtAcquisition?: boolean | null;
  /** 나목 1)·2) 과세기준일 현재 조정대상지역 — null/undefined=모름 */
  regulatedAtAssessment?: boolean | null;
  /** 나목 1)·2) 과세기준일 현재 유효한 조정대상지역 지정의 공고일 */
  regulatedNoticeDate?: Date;
  /** 나목 2)·3) 지자체 임대사업자 등록 신청일(임대할 주택 추가 변경신고 포함) */
  rentalApplicationDate?: Date;
  /** 나목 2) 세무서 사업자등록 신청일(주택임대업 업종 추가 정정신고 포함) */
  businessRegistrationApplicationDate?: Date;
  /** 나목 3) 아파트(도시형 생활주택 제외 — 서면-2023-부동산-2061) — null/undefined=모름 */
  isApartment?: boolean | null;
  /** 나목 4)·7호 단서 — 종전 단기민간임대에서 변경신고한 주택 — null/undefined=모름 */
  convertedFromShortTerm?: boolean | null;
  /** 나목 4)·7호 단서 — 그 변경신고일 */
  shortTermConversionDate?: Date;
}
