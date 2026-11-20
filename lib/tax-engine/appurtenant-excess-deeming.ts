/**
 * 배율 초과분을 «비사업용 토지로 보지 않는» 사유 판정 — 주택 부수토지(영 §168의12)·건물 부속토지(지방세법 시행령 §101)가 입구마다 따로 하지 않게
 * 모은 공통 지점 (NBL2611-C4 · 로드맵 R16 · Q-3b · Q-11 · 리뷰 §7.2 「수용 의제 leaf」+「유예」).
 *
 * | 사유 | 근거 | 주택 초과분 | 건물 부속토지 초과분 |
 * |---|---|---|---|
 * | 공익수용 무조건 의제 | 영 §168의14③3호 | 적용 | 적용 |
 * | 유예기간 | 영 §168의14① | 적용(D1·Q-3a (나)와 같은 규칙) | 적용 안 함 — 영 §168의12 주택 배율 축이 아니다 |
 *
 * 취득일 소급(나목 괄호): 상속받은 토지 = 피상속인 취득일, 법 §97의2①을 적용받는 경우 = 증여자 취득일 — 둘 다 §104② 보유기간 기산일과 같은 규칙이라
 * `resolveRateBasis`(단일 소스)가 정한다. 이월과세는 시나리오 A(적용)·B(배제)를 엔진이 각각 이 입력으로 다시 돌리므로(`buildInputB`가
 * `acquisitionCause: "purchase"`로 바꾼다) **주택 입구는 그 분기를 그대로 따른다.** 일반건물·상가 카드는 시나리오 분기 전에 초과분을 가르므로 수증일 기준 + 고지.
 *
 * 순수 함수 — DB를 부르지 않는다.
 */
import { meetsPeriodCriteria } from "./non-business-land/period-criteria";
import { judgePublicExpropriationDeemed, type PublicExpropriationDeemResult } from "./non-business-land/public-expropriation-deeming";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "./non-business-land/types";
import { resolveRateBasis } from "./transfer-rate-holding-basis";
import { NBL } from "./legal-codes/transfer-nbl";
import {
  NBL_EXPROPRIATION_CARRYOVER_BASIS_NOTICE,
  NBL_EXPROPRIATION_NOTICE_DATE_MISSING_NOTICE,
} from "./nbl-confirm-notices";
import type { TransferTaxInput } from "./types/transfer.types";
import type { DeemedBusinessExcess } from "./types/transfer-split-gain.types";

/** 수용 의제 판정 결과 — 수용이 아니면 `undefined` */
export type ExpropriationDeemOutcome =
  | { status: "deemed"; deem: PublicExpropriationDeemResult }
  | { status: "not_deemed"; deem: PublicExpropriationDeemResult }
  | { status: "notice_missing" };

/**
 * 수용 양도의 영 §168의14③3호 의제 — 호출부가 소급까지 반영한 취득일을 넘긴다. 수용이 아니면 `undefined`.
 * 고시일이 없으면 `notice_missing`(의제 불성립 + 확인 필요) — 차단하지 않는다.
 */
export function judgeExpropriationDeemOutcome(f: {
  transferCause: "general" | "public_expropriation" | undefined;
  noticeDate: Date | undefined;
  transferDate: Date;
  acquisitionDate: Date;
}): ExpropriationDeemOutcome | undefined {
  if (f.transferCause !== "public_expropriation") return undefined;
  if (!f.noticeDate) return { status: "notice_missing" };
  const deem = judgePublicExpropriationDeemed({ transferDate: f.transferDate, noticeDate: f.noticeDate, acquisitionDate: f.acquisitionDate });
  return { status: deem.deemed ? "deemed" : "not_deemed", deem };
}

export type HousingFacts = Pick<
  TransferTaxInput,
  | "transferCause" | "appurtenantExcessFacts" | "transferDate" | "acquisitionDate" | "acquisitionCause" | "decedentAcquisitionDate" | "donorAcquisitionDate"
  | "nonHeirBequest" | "landAcquisitionDate" | "landAcquisitionCause" | "landDecedentAcquisitionDate" | "landDonorAcquisitionDate"
>;

/**
 * 주택 배율 초과분(= 토지)의 취득일 — 토지 취득원인이 따로 있으면 그 원인·날짜, 없으면 자산 값. 소급은 `resolveRateBasis`(§104② 1·2호)가 정한다.
 * 별개취득이 아니면(토지 취득일 없음) 자산 취득일이 토지 취득일이다.
 */
export function housingExcessAcquisitionDate(input: HousingFacts): Date {
  const useLandCause = input.landAcquisitionCause !== undefined;
  return resolveRateBasis({
    acquisitionCause: useLandCause ? input.landAcquisitionCause : input.acquisitionCause,
    acquisitionDate: input.landAcquisitionDate ?? input.acquisitionDate,
    decedentAcquisitionDate: useLandCause ? input.landDecedentAcquisitionDate : input.decedentAcquisitionDate,
    donorAcquisitionDate: useLandCause ? input.landDonorAcquisitionDate : input.donorAcquisitionDate,
    nonHeirBequest: input.nonHeirBequest,
  }).date;
}

/** 주택 배율 초과분의 수용 의제 판정 (영 §168의14③3호) */
export function housingExcessExpropriationOutcome(input: HousingFacts): ExpropriationDeemOutcome | undefined {
  return judgeExpropriationDeemOutcome({
    transferCause: input.transferCause,
    noticeDate: input.appurtenantExcessFacts?.expropriationNoticeDate,
    transferDate: input.transferDate,
    acquisitionDate: housingExcessAcquisitionDate(input),
  });
}

/**
 * 주택 배율 초과분의 유예기간(영 §168의14①) 판정 — D1(`applyGraceToNonBusinessRemainder(…, "housing")`)과 같은 규칙: 사업용 사용기간이 없는 토지에
 * 유예 구간을 사업용으로 보아 §168의6 기간기준을 판정한다(충족하면 그 면적은 비사업용이 아니다). 유예 입력이 없으면 `undefined`.
 * 소유기간 기산은 NBL 엔진과 같이 토지 자신의 취득일(상속은 상속개시일 · 이월과세 시나리오 A는 입력의 증여자 취득일)이다 — 소급 취득일(피상속인)이 아니다.
 */
export function housingExcessGraceOutcome(
  input: Pick<TransferTaxInput, "appurtenantExcessFacts" | "transferDate" | "acquisitionDate" | "landAcquisitionDate">,
): { meets: boolean; graceDays: number; detail: string } | undefined {
  const intervals = input.appurtenantExcessFacts?.graceIntervals;
  if (!intervals || intervals.length === 0) return undefined;
  const r = meetsPeriodCriteria(
    [],
    input.landAcquisitionDate ?? input.acquisitionDate,
    input.transferDate,
    "housing",
    DEFAULT_NON_BUSINESS_LAND_RULES,
    intervals.map((g) => ({ reasonCode: "other_justifiable" as const, startDate: g.startDate, endDate: g.endDate })),
  );
  return { meets: r.meets, graceDays: r.gracePeriodDays, detail: r.detail };
}

/**
 * 주택 배율 초과분을 비사업용 토지로 보지 않는 사유 — 없으면 `undefined`(비사업용). 수용 의제가 유예보다 먼저다(기간·지역·면적과 무관한 무조건 의제).
 */
export function housingExcessDeemedBusiness(input: HousingFacts): DeemedBusinessExcess | undefined {
  const exp = housingExcessExpropriationOutcome(input);
  if (exp?.status === "deemed") {
    return { reason: "public_expropriation", detail: `배율 초과분 — ${exp.deem.detail}`, legalBasis: exp.deem.legalBasis ?? NBL.UNCONDITIONAL_PUBLIC };
  }
  const grace = housingExcessGraceOutcome(input);
  if (grace?.meets) {
    return {
      reason: "grace_period",
      detail: `배율 초과분 — 유예기간 ${grace.graceDays}일을 사업용으로 보아 기간기준 충족 (${grace.detail})`,
      legalBasis: NBL.UNAVOIDABLE_PERIOD,
    };
  }
  return undefined;
}

/**
 * 주택 배율 초과분이 있는 입구가 결과 `warnings`에 싣는 고지 — 수용인데 고시일이 없으면 확인 필요, 의제 성립이면 근거,
 * 유예를 입력했으나 기간기준 미충족이면 그 사실. 초과분이 없는 입구는 호출하지 않는다(말할 거리가 없다).
 */
export function housingExcessDeemNotices(input: HousingFacts, excessExists: boolean): string[] {
  if (!excessExists) return [];
  const out: string[] = [];
  const exp = housingExcessExpropriationOutcome(input);
  if (exp?.status === "notice_missing") out.push(NBL_EXPROPRIATION_NOTICE_DATE_MISSING_NOTICE);
  const deemed = housingExcessDeemedBusiness(input);
  if (deemed) {
    out.push(`${deemed.detail} → 비사업용 토지로 보지 않아 +10%p 가산·장기보유특별공제 배제를 적용하지 않았습니다 (${deemed.legalBasis}). 배율 초과분은 비과세 범위가 아니라 과세 대상입니다.`);
  } else {
    const grace = housingExcessGraceOutcome(input);
    if (grace && !grace.meets) out.push(`배율 초과분에 입력한 유예기간 ${grace.graceDays}일을 사업용으로 보아도 기간기준을 충족하지 못해 비사업용으로 판정했습니다 (${NBL.UNAVOIDABLE_PERIOD}).`);
  }
  return out;
}

/**
 * 건물(비주택) 부속토지 초과분의 수용 의제 — 상업용건물 STEP 0.62(`runCommercialAppurtenantLandStep`)와 상가 비사업용 파트(`resolveCommercialNblPart`)가
 * 같은 판정을 쓴다(한쪽만 의제하면 +10%p 표지와 파트 분리가 갈린다). 취득일 소급은 주택과 같은 `resolveRateBasis` — 이월과세는 시나리오 A·B가 각자 이 입력으로 다시 도므로 따라간다.
 * 수용이 아니거나 불성립·고시일 없음이면 `undefined`(비사업용 유지). `outcome`은 고지용이다.
 */
export function commercialExcessExpropriationDeem(input: HousingFacts): { deem: PublicExpropriationDeemResult | undefined; outcome: ExpropriationDeemOutcome | undefined } {
  const outcome = housingExcessExpropriationOutcome(input);
  return { deem: outcome?.status === "deemed" ? outcome.deem : undefined, outcome };
}

/** 건물 부속토지 초과분 의제 고지 — 수용인데 고시일이 없으면 확인 필요, 의제가 성립해 초과분을 사업용으로 보았으면 그 근거. */
export function buildingExcessDeemNotices(outcome: ExpropriationDeemOutcome | undefined, suppressedArea: number | undefined): string[] {
  if (outcome?.status === "notice_missing") return [NBL_EXPROPRIATION_NOTICE_DATE_MISSING_NOTICE];
  if (outcome?.status === "deemed" && suppressedArea !== undefined && suppressedArea > 0) {
    return [`부속토지 기준면적 초과분 ${suppressedArea}㎡ — ${outcome.deem.detail} → 비사업용 토지로 보지 않아 +10%p 가산을 적용하지 않았습니다 (${outcome.deem.legalBasis}).`];
  }
  return [];
}

/** 일반건물(GB) 토지 카드 입구의 취득 경위 사실 — 3경로(환산·증축·실거래가)가 같은 필드를 같은 의미로 읽는다. */
export interface GbExcessDeemFacts {
  transferCause?: "general" | "public_expropriation";
  expropriationNoticeDate?: Date;
  transferDate: Date;
  /** 건물 취득일(자산 단위 값) — 토지 취득일이 없으면 토지도 이 날 취득이다 */
  acquisitionDate: Date;
  landAcquisitionDate?: Date;
  landAcquisitionCause?: "purchase" | "inheritance" | "gift" | "carryover_gift";
  /** 토지 상속 시 피상속인 취득일 */
  decedentAcquisitionDate?: Date;
  nonHeirBequest?: boolean;
  /** 토지 증여 시 증여자 취득일 (이월과세 자산) */
  donorAcquisitionDate?: Date;
  /** 토지 이월과세(법 §97의2) 입력이 있는가 — 적용 여부는 비교과세(시나리오 A/B)가 정하므로 카드 조립 시점에는 알 수 없다 */
  hasLandCarryover?: boolean;
}

/**
 * 일반건물 토지 카드의 수용 의제. 이월과세 토지는 적용 여부가 시나리오 분기 뒤에 정해져 **수증일을 취득일로 판정**하고(모름 = 혜택 불성립),
 * 증여자 취득일 기준이면 의제가 성립하는 경우에만 `carryoverBasisNotice`로 확인 필요를 남긴다.
 */
export function gbExcessExpropriationDeem(f: GbExcessDeemFacts): {
  deem: PublicExpropriationDeemResult | undefined;
  outcome: ExpropriationDeemOutcome | undefined;
  carryoverBasisNotice: boolean;
} {
  const base = {
    transferCause: f.transferCause,
    noticeDate: f.expropriationNoticeDate,
    transferDate: f.transferDate,
  };
  const acquisitionDateOf = (donor: Date | undefined): Date =>
    resolveRateBasis({
      acquisitionCause: f.landAcquisitionCause ?? "purchase",
      acquisitionDate: f.landAcquisitionDate ?? f.acquisitionDate,
      decedentAcquisitionDate: f.decedentAcquisitionDate,
      donorAcquisitionDate: donor,
      nonHeirBequest: f.nonHeirBequest,
    }).date;
  const outcome = judgeExpropriationDeemOutcome({ ...base, acquisitionDate: acquisitionDateOf(f.hasLandCarryover ? undefined : f.donorAcquisitionDate) });
  const donorBasis =
    f.hasLandCarryover && f.donorAcquisitionDate && outcome?.status === "not_deemed"
      ? judgeExpropriationDeemOutcome({ ...base, acquisitionDate: acquisitionDateOf(f.donorAcquisitionDate) })
      : undefined;
  return {
    deem: outcome?.status === "deemed" ? outcome.deem : undefined,
    outcome,
    carryoverBasisNotice: donorBasis?.status === "deemed",
  };
}

/** 일반건물 결과 echo용 고지 — 수용 의제 판정(`gbExcessExpropriationDeem`)과 수용 의제로 뺀 면적에서 만든다. 아무 말도 할 것이 없으면 `undefined`. */
export function gbExcessDeemNotices(
  r: ReturnType<typeof gbExcessExpropriationDeem>,
  suppressedArea: number | undefined,
): string[] | undefined {
  const notices = [
    ...buildingExcessDeemNotices(r.outcome, suppressedArea),
    ...(r.carryoverBasisNotice ? [NBL_EXPROPRIATION_CARRYOVER_BASIS_NOTICE] : []),
  ];
  return notices.length > 0 ? notices : undefined;
}
