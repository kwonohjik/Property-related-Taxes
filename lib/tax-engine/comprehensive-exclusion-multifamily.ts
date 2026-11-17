/**
 * 종부령 §3①1호·2호 — 2020.2.11. 전 세무서 사업자등록만 한 다가구주택 판정 경로(T-14).
 *
 * - 종전 §3②~④(다가구주택 임대사업자 의제 — 사업자등록을 한 날 임대사업자로 봄)는 2020.2.11. 삭제됐고,
 *   부칙<대통령령 제30404호> 제6조가 「종전의 제3조제3항 및 제4항에 따라 임대사업자로 보는 자가 임대하는 다가구주택」만 종전 규정으로 남겼다.
 *   종전으로 남는 것은 ③④(의제)뿐 — §3①의 가격·면적·기간·5% 요건은 현행 규정으로 본다(같은 영 부칙 제2조~제4조).
 * - 그래서 세무서 사업자등록일을 §5 등록일로 보아 기존 판정(`validate`)을 그대로 재사용한다(2018.3.31. 단서·연혁별 가격 상한·5%·§3⑧).
 *   지자체 등록·말소 날짜는 보지 않는다(조심2022서6703 — 지자체 등록 뒤 말소해도 부칙 §6 유지).
 * - 가격·면적은 건물 값이 아니라 1구=1호(§3⑥)로 본 구별 값 — 건물 전체 값 판정은 이 경로에서 구별 판정으로 대체한다(이중 판정 금지).
 *   구별 판정은 같은 `validate`를 구마다 한 번 더 돌려 건물 단위(가격·면적 0) 판정과의 차이 사유만 가져온다 — 상한·연혁·사유 문구 single source.
 * - 배제 금액은 주택 전체(all-or-nothing) — 일부 구만 요건을 갖추면 불성립 + 확인 필요(Q-4 a).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-multifamily-deemed.plan.md §3.1
 */
import { COMPREHENSIVE_EXCL } from "./legal-codes";
import type { ExclusionValidationResult, RentalExclusionInput } from "./types/comprehensive.types";

type RegType = RentalExclusionInput["registrationType"];

/** 1호(민간건설)·2호(민간매입) — 결정 ①(사용자가 기존 유형으로 고른다) */
const DEEMED_TYPES: ReadonlySet<RegType> = new Set(["private_construction", "private_purchase_short"]);

/** 대통령령 제30404호 시행일 — 이 날 이후 세무서 등록은 종전 규정이 닿지 않는다 */
const CUTOFF_2020_02_11 = Date.UTC(2020, 1, 11);

const fail = (...failReasons: string[]): ExclusionValidationResult => ({
  isExcluded: false,
  reason: failReasons[0],
  failReasons,
});

/**
 * @param input `deemedMultiFamily`가 있는 입력(호출자가 보장)
 * @param validate 기존 임대주택 판정(`validateRentalExclusion`) — 순환 import를 피해 주입받는다
 */
export function validateDeemedMultiFamily(
  input: RentalExclusionInput,
  validate: (input: RentalExclusionInput) => ExclusionValidationResult,
): ExclusionValidationResult {
  const deemed = input.deemedMultiFamily;
  if (!deemed) return validate(input);

  // 1. 유형 — ⑫가 먼저 막지만 직접 엔진 호출을 방어
  if (!DEEMED_TYPES.has(input.registrationType)) return fail(COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_TYPE);

  // 2. 세무서 사업자등록일 — 빈칸은 일반형, 2020.2.11. 이후는 종전 규정 밖
  const biz = input.businessRegistrationDate;
  if (!biz || Number.isNaN(biz.getTime())) return fail(COMPREHENSIVE_EXCL.BUSINESS_REGISTRATION_DATE_MISSING);
  if (biz.getTime() >= CUTOFF_2020_02_11) return fail(COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_REGISTERED_AFTER_CUTOFF);

  // 구가 없거나 값이 비면 구별 판정이 공허하게 통과하므로 막는다(「모름」은 혜택 불성립)
  const units = deemed.units;
  if (
    !Array.isArray(units) ||
    units.length === 0 ||
    units.some((u) => !(u.assessedValue > 0) || !Number.isFinite(u.area))
  ) {
    return fail(COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_UNITS_INVALID);
  }

  const failReasons: string[] = [];
  // 3. 2020.2.11. 이후 임대 전환 호실 — 예·아니오 중 「예」가 아니면 불성립
  if (deemed.noConversionAfterCutoff !== true) {
    failReasons.push(COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_UNIT_CONVERTED_AFTER_CUTOFF);
  }

  // 4. 정규화 — 세무서 등록일을 §5 등록일로, 지자체 신청·말소 날짜는 무시, 건물 단위 가격·면적은 0(구별로 대체)
  const normalized: RentalExclusionInput = {
    ...input,
    deemedMultiFamily: undefined,
    rentalRegistrationDate: biz,
    rentalApplicationDate: undefined,
    registrationRevokedDate: undefined,
    assessedValue: 0,
    area: 0,
    priceBasisValue: undefined,
  };
  const base = validate(normalized);
  const baseReasons = new Set(base.failReasons ?? []);
  failReasons.push(...baseReasons);

  // 5. 구별 가격·면적 — 건물 단위 판정에 없던 사유만 가져온다
  const failedUnits: string[] = [];
  for (const u of units) {
    const r = validate({ ...normalized, assessedValue: u.assessedValue, area: u.area, priceBasisValue: u.assessedValue });
    const extra = (r.failReasons ?? []).filter((x) => !baseReasons.has(x));
    if (extra.length === 0) continue;
    failedUnits.push(u.label);
    for (const x of extra) if (!failReasons.includes(x)) failReasons.push(x);
  }
  if (failedUnits.length > 0) {
    failReasons.push(
      COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_PARTIAL_UNSUPPORTED,
      `${COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_FAILED_UNITS_PREFIX}: ${failedUnits.join(", ")}`,
    );
  }
  if (failReasons.length > 0) return fail(...failReasons);

  // 7. 성립 — 근거와 구별 공시가격 확인 필요를 경고로 남긴다(Q-9 a)
  return {
    isExcluded: true,
    reason: base.reason,
    warnings: [...(base.warnings ?? []), COMPREHENSIVE_EXCL.DEEMED_MULTIFAMILY_BASIS],
  };
}
