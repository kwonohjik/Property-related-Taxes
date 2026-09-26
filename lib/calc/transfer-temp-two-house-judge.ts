/**
 * 일시적 2주택 §155① 요건 UI 자동판정 — 입력단계 판정 카드용.
 *
 * 엔진 로직 단일소스 재사용:
 *  - 타이밍(1년·3년): `judgeTemporaryTwoHouseTiming` (transfer-tax-exemption.ts)
 *  - 처분기한: `resolveTemporaryTwoHouseDeadline` — §155⑯ 5년 · 조정대상지역 연혁(OH-01) ·
 *    2019-12-17 체제 전입요건·임차인 단서까지 엔진과 **같은 함수**다(A2b — 종전 3년 하드코딩 폐지).
 *  - 조정 판정 대상·시점: `resolveRegulatedAtNewAcquisition` (신규 취득일 기준 두 주택)
 *  - waiver(§154①1·2가·3호): `resolveExemptionProviso` + `TEMP_TWO_HOUSE_PROVISO_REASONS`
 * 산식 재정의 없음. 최종 비과세 판정은 계산 결과가 확정(이 카드는 입력단계 안내).
 */
import {
  judgeTemporaryTwoHouseTiming,
  resolveExemptionProviso,
} from "@/lib/tax-engine/transfer-tax-exemption";
import {
  meetsPublicInstitutionRelocationRegion,
  resolveRegulatedAtNewAcquisition,
  resolveTemporaryTwoHouseDeadline,
} from "@/lib/tax-engine/transfer-tax-temporary-two-house-timing";
import { temporaryTwoHouseEraInputRelevance } from "@/lib/tax-engine/data/temporary-two-house-deadline-era";
import {
  toTemporaryTwoHouseEraFacts,
  type TemporaryTwoHouseEraFormFields,
} from "@/lib/calc/temporary-two-house-era-facts";
import { TEMP_TWO_HOUSE_PROVISO_REASONS } from "@/lib/tax-engine/legal-codes/transfer";
import type { TemporaryTwoHouseDelayReason } from "@/lib/tax-engine/types/transfer.types";

/**
 * §155① **본문** 처분기한 3년 — 엔진 규칙 행 `temporary_two_house.disposalDeadlineYears`와 같은 값
 * (전 시행본 본문 3년 — `data/temporary-two-house-deadline-era.ts` 머리 주석). 카드는 세율표를 읽지
 * 않으므로 이 상수를 규칙 행 대신 넘긴다. 조정대상지역 연혁·§155⑯은 엔진 함수가 정한다.
 */
export const TEMP_TWO_HOUSE_UI_DEADLINE_YEARS = 3;

export type TempTwoHouseVerdict =
  | { status: "pending" } // 입력 부족 — 자산취득일·신규취득일·양도일 중 미입력
  | {
      status: "eligible" | "ineligible";
      oneYearThreshold: Date;
      oneYearMet: boolean;
      oneYearWaived: boolean;
      deadline: Date;
      /** 처분기한 연수 — 카드 문구(「N년 내」)가 기한 날짜와 같은 값을 말하게 한다(OH-57). */
      deadlineYears: number;
      /** §155①2호 단서(기존 임차인)로 기한이 날짜로 늘어났는가 — 카드가 「N년 내」 대신 날짜를 말한다 */
      deadlineExtendedByTenant: boolean;
      threeYearMet: boolean;
      /**
       * §155①2호 — 신규 취득일 기준 조정 여부와 새 입력의 노출 판단(⑤ 게이트).
       *   `relevant`: 두 주택 조정 여부가 기한을 바꾸는 양도 시기 · `previous`/`next`: 판정값(미입력 undefined)
       *   · `previousAuto`/`nextAuto`: 주소(법정동코드)로 자동 판정했는가 · `moveInRelevant`: 가목·단서 체제
       */
      regulated: {
        relevant: boolean;
        previous?: boolean;
        next?: boolean;
        previousAuto: boolean;
        nextAuto: boolean;
        determined: boolean;
        moveInRelevant: boolean;
      };
      /** §155①2호 가목 — `undefined`면 해당 없음(체제 밖) 또는 전입일 미입력(`moveInPending`) */
      moveInMet?: boolean;
      moveInPending: boolean;
      /** §155⑱ 사유로 기한 요건이 치유됐는지 — 카드가 "기한 초과이나 예외 적용"을 구분해 표시 */
      delayReasonApplied: boolean;
    };

/**
 * 폼 primitive → 일시적 2주택 요건 판정. previousAcquisitionDate는 양도 자산 취득일(단일소스).
 */
export function judgeTempTwoHouseFromForm(p: {
  previousAcquisitionDate: string; // = 양도 자산 취득일 (assets[0].acquisitionDate)
  newHouseAcquisitionDate: string;
  transferDate: string;
  // waiver 판정용 — mode=temporary_two_house에서 유효한 사유(1·2가·3호)만 실효
  provisoReason: string;
  provisoDepartureDate: string;
  provisoExpropriationDate: string;
  provisoBusinessApprovalDate: string;
  residencePeriodMonths: string;
  /** §155⑯ 공공기관 지방이전 — 기한 5년 + 1년 요건 면제 */
  publicInstitutionRelocation?: boolean;
  /** §155⑯ 「이전한 시·군」 코드 — 신규주택 소재 코드와 함께 연접 여부를 자동 판정한다 */
  relocatedSigunguCode?: string;
  /** §155⑯ 신규주택 소재 시·군 코드 */
  newHouseSigunguCode?: string;
  /** §155⑱ 처분기한 예외 사유 ("" = 해당 없음) */
  disposalDelayReason?: string;
  /** 양도(종전) 주택 법정동코드 — 엔진과 같이 코드가 있으면 자동 판정 */
  regionCode?: string;
  /** 폼-전역 「양도 당시 조정대상지역」 — 두 주택 조정 여부 미입력 시 엔진과 같은 폴백 */
  isRegulatedArea?: boolean;
  /** 신규 주택 법정동코드 — 명부 행(`resolveTemporaryTwoHouse`)에서만 온다 */
  newHouseRegionCode?: string;
  /** §155①2호 새 입력(OH-01 A2b) — ④와 같은 leaf(`toTemporaryTwoHouseEraFacts`)로 편다 */
  eraFields?: TemporaryTwoHouseEraFormFields;
}): TempTwoHouseVerdict {
  if (!p.previousAcquisitionDate || !p.newHouseAcquisitionDate || !p.transferDate) {
    return { status: "pending" };
  }
  const prev = new Date(p.previousAcquisitionDate);
  const nw = new Date(p.newHouseAcquisitionDate);
  const transfer = new Date(p.transferDate);
  // 부분 입력("2023-13-" 등) → Invalid Date → toISOString RangeError 방지: 유효하지 않으면 입력 부족 취급
  if ([prev, nw, transfer].some((d) => Number.isNaN(d.getTime()))) {
    return { status: "pending" };
  }

  // waiver — 엔진 resolveExemptionProviso 단일소스 재사용 (whitelist 사유 + proviso 조건충족)
  let oneYearWaived = false;
  if (p.provisoReason && TEMP_TWO_HOUSE_PROVISO_REASONS.has(p.provisoReason)) {
    const relax = resolveExemptionProviso({
      acquisitionDate: prev,
      transferDate: transfer,
      residencePeriodMonths: parseInt(p.residencePeriodMonths || "0", 10) || 0,
      wasRegulatedAtAcquisition: false, // resolveExemptionProviso 미사용 필드 — 타입 충족용
      oneHouseExemptionProviso: {
        reason: p.provisoReason as "rental_5yr_residence" | "expropriation" | "unavoidable",
        departureDate: p.provisoDepartureDate ? new Date(p.provisoDepartureDate) : undefined,
        expropriationDate: p.provisoExpropriationDate ? new Date(p.provisoExpropriationDate) : undefined,
        businessApprovalDate: p.provisoBusinessApprovalDate
          ? new Date(p.provisoBusinessApprovalDate)
          : undefined,
      },
    });
    oneYearWaived = relax === "both";
  }

  /**
   * 처분기한 — 엔진 `resolveTemporaryTwoHouseDeadline`을 **그대로** 부른다. 🔴 종전에는 §155⑯만
   * 엔진 술어로 가르고 나머지는 3년 하드코딩이라, 조정대상지역 연혁(2년·1년)·전입요건·임차인 단서가
   * 카드에 반영되지 않아 계산 결과와 어긋났다(OH-01 A2b 후속).
   */
  const facts = toTemporaryTwoHouseEraFacts(p.eraFields ?? {}, p.newHouseRegionCode || undefined);
  const optDate = (v: string | undefined) => {
    if (!v) return undefined;
    const x = new Date(v);
    return Number.isNaN(x.getTime()) ? undefined : x;
  };
  const engineLike = {
    transferDate: transfer,
    isRegulatedArea: p.isRegulatedArea === true,
    regionCode: p.regionCode || undefined,
    temporaryTwoHouse: {
      previousAcquisitionDate: prev,
      newAcquisitionDate: nw,
      publicInstitutionRelocation: p.publicInstitutionRelocation,
      relocatedSigunguCode: p.relocatedSigunguCode || undefined,
      newHouseSigunguCode: p.newHouseSigunguCode || undefined,
      newHouseRegionCode: facts.newHouseRegionCode,
      newHouseRegulatedAtAcquisition: facts.newHouseRegulatedAtAcquisition,
      previousHouseRegulatedAtNewAcquisition: facts.previousHouseRegulatedAtNewAcquisition,
      newHouseContractDate: optDate(facts.newHouseContractDate),
      wholeHouseholdMoveInDate: optDate(facts.wholeHouseholdMoveInDate),
      existingTenantLeaseEndDate: optDate(facts.existingTenantLeaseEndDate),
    },
  };
  const era = resolveTemporaryTwoHouseDeadline(engineLike, {
    disposalDeadlineYears: TEMP_TWO_HOUSE_UI_DEADLINE_YEARS,
  });
  const deadlineYears = era.years;
  // §155⑯(5년)은 조정 기한 연혁을 덮는다 — 그때 두 주택 조정 여부·전입은 결론을 바꾸지 않는다.
  const relocation = meetsPublicInstitutionRelocationRegion(engineLike.temporaryTwoHouse);
  const reg = resolveRegulatedAtNewAcquisition(engineLike);
  const relevance = temporaryTwoHouseEraInputRelevance({
    newAcquisitionDate: nw,
    newContractDate: engineLike.temporaryTwoHouse.newHouseContractDate,
    transferDate: transfer,
  });

  const t = judgeTemporaryTwoHouseTiming({
    previousAcquisitionDate: prev,
    newAcquisitionDate: nw,
    transferDate: transfer,
    deadlineYears,
    oneYearWaived,
    // ⑯ 후단 1년 면제도 지역 요건에 묶인다 — 엔진 `evaluateTemporaryTwoHouseTiming`과 같은 술어(OH-35).
    publicInstitutionRelocation: relocation,
    disposalDelayReason: (p.disposalDelayReason || undefined) as
      | TemporaryTwoHouseDelayReason
      | undefined,
    deadlineDate: era.deadlineDate,
    moveInMet: era.moveInMet,
  });

  return {
    status: t.overall ? "eligible" : "ineligible",
    oneYearThreshold: t.oneYearThreshold,
    oneYearMet: t.oneYearMet,
    // ⑯ 후단도 1년 면제 사유다 — 카드 문구가 "면제"를 표시해야 판정과 설명이 어긋나지 않는다.
    oneYearWaived: oneYearWaived || relocation,
    deadline: t.deadline,
    deadlineYears,
    deadlineExtendedByTenant: era.deadlineDate !== undefined,
    threeYearMet: t.threeYearMet,
    regulated: {
      relevant: relevance.regulatedAxis && !relocation,
      previous: reg.previous,
      next: reg.next,
      previousAuto: !!engineLike.regionCode,
      nextAuto: !!facts.newHouseRegionCode,
      determined: reg.determined,
      // 가목·단서 체제 — 두 주택이 모두 조정(또는 미확인)일 때만 연다.
      moveInRelevant: relevance.moveIn && reg.previous !== false && reg.next !== false && !relocation,
    },
    ...(era.moveInMet !== undefined ? { moveInMet: era.moveInMet } : {}),
    moveInPending: era.moveInRequirementPending,
    delayReasonApplied: !!p.disposalDelayReason,
  };
}
