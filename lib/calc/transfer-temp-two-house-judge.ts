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
import type { ResidenceReqInput } from "@/lib/tax-engine/transfer-tax-exemption-requirements";
import {
  meetsPublicInstitutionRelocationRegion,
  resolveRegulatedAtNewAcquisition,
  resolveTemporaryTwoHouseDeadline,
  resolveTemporaryTwoHouseDeadlineFor,
} from "@/lib/tax-engine/transfer-tax-temporary-two-house-timing";
import { temporaryTwoHouseEraInputRelevance } from "@/lib/tax-engine/data/temporary-two-house-deadline-era";
import {
  resolveRegulatedShortenedClauseRef,
  type RegulatedShortenedClauseRef,
} from "@/lib/tax-engine/data/temporary-two-house-regulated-clause";
import {
  toTemporaryTwoHouseEraFacts,
  type TemporaryTwoHouseEraFormFields,
} from "@/lib/calc/temporary-two-house-era-facts";
import { TEMP_TWO_HOUSE_PROVISO_REASONS } from "@/lib/tax-engine/legal-codes/transfer";
import type { TemporaryTwoHouseDelayReason, TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { rentalLeaseResidencePayload } from "@/lib/calc/exemption-proviso-payload";
import { judgeNewHouseOrigin, temporaryTwoHouseOrderReason } from "@/lib/tax-engine/one-house/new-house-origin";
import type { RightThreeYearException } from "@/lib/tax-engine/types/transfer.types";

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
      /** 신규 주택을 종전 주택보다 먼저(같은 날 포함) 취득했으면 그 사유 — 요건 A가 면제 사유와 무관하게 미충족이다(엔진 `acquiredInOrder` · 요건 표와 같은 문장) */
      orderNote?: string;
      deadline: Date;
      /** 처분기한 말일이 민법 §161로 늘어났거나 공휴일 표 밖이면 한 줄 설명(엔진 값 그대로) */
      deadlineNote?: string;
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
        /** 종전 주택이 양도 주택이 아니라 명부 행(합가 D8 상대 쪽 짝)인가 — 위젯 문구가 갈린다(S15-2) */
        previousIsRosterRow: boolean;
        nextAuto: boolean;
        determined: boolean;
        moveInRelevant: boolean;
        /** 단축 규정의 연혁별 위치(「§155」 뒤 표기) — 카드 제목이 이 값을 읽는다(X2-1: 2026.10.1. 이후는 ①1호, 2호는 3년 쪽이다) */
        clauseRef: RegulatedShortenedClauseRef;
      };
      /** §155①2호 가목 — `undefined`면 해당 없음(체제 밖) 또는 전입일 미입력(`moveInPending`) */
      moveInMet?: boolean;
      moveInPending: boolean;
      /** §155⑱ 사유로 기한 요건이 치유됐는지 — 카드가 "기한 초과이나 예외 적용"을 구분해 표시 */
      delayReasonApplied: boolean;
      /** §155⑱ 사유를 골랐는데 양도일 연혁상 적용하지 않은 이유(방법 요건 · 없던 호) — 카드가 그대로 보여 준다 */
      delayNote?: string;
      /**
       * 신규 주택의 취득 경위(분양권·조합원입주권 유래) 판정 — 엔진 `judgeNewHouseOrigin`과 같은 함수다(결정 #43).
       * 불성립(`blocked`)이면 `status`가 `ineligible`이다. `notes`는 사유·확인 필요를 그대로 싣는다(재계산 금지).
       */
      origin?: { blocked: boolean; notes: string[] };
    };

/**
 * 폼 primitive → 일시적 2주택 요건 판정. previousAcquisitionDate는 양도 자산 취득일(단일소스).
 */
export function judgeTempTwoHouseFromForm(p: {
  previousAcquisitionDate: string; // = 일시적 2주택의 종전주택 취득일 — 대개 양도 자산 취득일(합가 상대 쪽 짝이면 다르다 — D8)
  /**
   * §154① 단서(1년 요건 면제) 판정의 양도 주택 취득일 — 엔진 `waivesPriorHouseOneYearGap`이 `input.acquisitionDate`를
   * 보므로 같은 값을 쓴다. 없으면 `previousAcquisitionDate`(종전 동작).
   */
  sellingAcquisitionDate?: string;
  newHouseAcquisitionDate: string;
  transferDate: string;
  // waiver 판정용 — mode=temporary_two_house에서 유효한 사유(1·2가·3호)만 실효
  provisoReason: string;
  provisoDepartureDate: string;
  provisoExpropriationDate: string;
  provisoBusinessApprovalDate: string;
  /** 1호 임차일부터 세대전원 거주 개월 — ④와 같은 파서(`parseRentalLeaseResidenceMonths`) */
  provisoRentalLeaseResidenceMonths?: string;
  residencePeriodMonths: string;
  /**
   * §154⑧3호 동일세대 상속 통산 — ④가 싣는 값(`buildSameHouseholdInheritancePayload`)과 같은 사실.
   * 1년 요건 면제(§154①3호 「1년 이상 거주」)를 엔진과 같은 거주 개월로 따지게 한다(S11-6).
   */
  sameHouseholdInheritance?: Pick<
    ResidenceReqInput,
    "acquisitionCause" | "decedentSameHouseholdBeforeInheritance" | "decedentCohabitationResidenceMonths"
  >;
  /** §155⑯ 공공기관 지방이전 — 기한 5년 + 1년 요건 면제 */
  publicInstitutionRelocation?: boolean;
  /** §155⑯ 「이전한 시·군」 코드 — 신규주택 소재 코드와 함께 연접 여부를 자동 판정한다 */
  relocatedSigunguCode?: string;
  /** §155⑯ 신규주택 소재 시·군 코드 */
  newHouseSigunguCode?: string;
  /** §155⑱ 처분기한 예외 사유 ("" = 해당 없음) */
  disposalDelayReason?: string;
  /** §155⑱ 「해당 각 호의 매각 등의 방법으로 양도」 — 2022-02-15 전 양도분의 요건(④와 같은 값) */
  disposalDelayDisposedByThatMethod?: boolean;
  /** 양도(종전) 주택 법정동코드 — 엔진과 같이 코드가 있으면 자동 판정 */
  regionCode?: string;
  /** 양도 주택이 지정 지구 안인가(선언) — 엔진 `regionInDesignatedDistrict`와 같은 값 */
  regionInDesignatedDistrict?: boolean;
  /** 폼-전역 「양도 당시 조정대상지역」 — 두 주택 조정 여부 미입력 시 엔진과 같은 폴백 */
  isRegulatedArea?: boolean;
  /** 신규 주택 법정동코드 — 명부 행(`resolveTemporaryTwoHouse`)에서만 온다 */
  newHouseRegionCode?: string;
  /** 신규 주택이 지정 지구 안인가(명부 행 선언) */
  newHouseInDesignatedDistrict?: boolean;
  /** 종전 주택이 양도 주택이 아니라 명부 행이다(합가 D8 상대 쪽 짝) — 조정 여부를 이 행의 소재로 판정한다(S15-2) */
  previousHouse?: { regionCode?: string; inDesignatedDistrict?: boolean };
  /** §155①2호 새 입력(OH-01 A2b) — ④와 같은 leaf(`toTemporaryTwoHouseEraFacts`)로 편다 */
  eraFields?: TemporaryTwoHouseEraFormFields;
  /** 신규 주택 취득 경위(명부 행의 답 · 날짜는 문자열) — ④가 싣는 `temporaryTwoHouse.newHouseOrigin`과 같은 값(결정 #43) */
  newHouseOrigin?: { kind: string; rightAcquisitionDate?: string; rightApprovalDate?: string };
  /** §156의2④ 3년 경과 예외 선언 — 권리 유래 신규 주택의 타이밍 판정이 읽는다(④와 같은 payload를 Date로 바꾼 것) */
  rightThreeYearException?: RightThreeYearException;
  /** 혼인·동거봉양 합가 선언(합가 + 권리 유래 신규 주택 가드) — ④가 싣는 합가일과 같은 사실 */
  hasMerge?: boolean;
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

  const validOr = (v: string | undefined, d: Date) => {
    const x = v ? new Date(v) : d;
    return Number.isNaN(x.getTime()) ? d : x;
  };
  // waiver — 엔진 resolveExemptionProviso 단일소스 재사용 (whitelist 사유 + proviso 조건충족)
  let oneYearWaived = false;
  if (p.provisoReason && TEMP_TWO_HOUSE_PROVISO_REASONS.has(p.provisoReason)) {
    const relax = resolveExemptionProviso({
      acquisitionDate: validOr(p.sellingAcquisitionDate, prev),
      transferDate: transfer,
      residencePeriodMonths: parseInt(p.residencePeriodMonths || "0", 10) || 0,
      wasRegulatedAtAcquisition: false, // resolveExemptionProviso 미사용 필드 — 타입 충족용
      ...p.sameHouseholdInheritance,
      oneHouseExemptionProviso: {
        reason: p.provisoReason as "rental_5yr_residence" | "expropriation" | "unavoidable",
        departureDate: p.provisoDepartureDate ? new Date(p.provisoDepartureDate) : undefined,
        expropriationDate: p.provisoExpropriationDate ? new Date(p.provisoExpropriationDate) : undefined,
        businessApprovalDate: p.provisoBusinessApprovalDate
          ? new Date(p.provisoBusinessApprovalDate)
          : undefined,
        ...rentalLeaseResidencePayload(p.provisoReason, p.provisoRentalLeaseResidenceMonths),
      },
    });
    oneYearWaived = relax === "both";
  }

  /**
   * 처분기한 — 엔진 `resolveTemporaryTwoHouseDeadline`을 **그대로** 부른다. 🔴 종전에는 §155⑯만
   * 엔진 술어로 가르고 나머지는 3년 하드코딩이라, 조정대상지역 연혁(2년·1년)·전입요건·임차인 단서가
   * 카드에 반영되지 않아 계산 결과와 어긋났다(OH-01 A2b 후속).
   */
  const facts = toTemporaryTwoHouseEraFacts(
    p.eraFields ?? {},
    p.newHouseRegionCode || undefined,
    p.newHouseInDesignatedDistrict,
    p.previousHouse,
  );
  const optDate = (v: string | undefined) => {
    if (!v) return undefined;
    const x = new Date(v);
    return Number.isNaN(x.getTime()) ? undefined : x;
  };
  const engineLike = {
    transferDate: transfer,
    isRegulatedArea: p.isRegulatedArea === true,
    regionCode: p.regionCode || undefined,
    regionInDesignatedDistrict: p.regionCode ? p.regionInDesignatedDistrict : undefined,
    temporaryTwoHouse: {
      previousAcquisitionDate: prev,
      newAcquisitionDate: nw,
      publicInstitutionRelocation: p.publicInstitutionRelocation,
      relocatedSigunguCode: p.relocatedSigunguCode || undefined,
      newHouseSigunguCode: p.newHouseSigunguCode || undefined,
      newHouseRegionCode: facts.newHouseRegionCode,
      newHouseInDesignatedDistrict: facts.newHouseInDesignatedDistrict,
      newHouseRegulatedAtAcquisition: facts.newHouseRegulatedAtAcquisition,
      previousHouseRegulatedAtNewAcquisition: facts.previousHouseRegulatedAtNewAcquisition,
      previousHouseIsRosterRow: facts.previousHouseIsRosterRow,
      previousHouseRegionCode: facts.previousHouseRegionCode,
      previousHouseInDesignatedDistrict: facts.previousHouseInDesignatedDistrict,
      newHouseContractDate: optDate(facts.newHouseContractDate),
      wholeHouseholdMoveInDate: optDate(facts.wholeHouseholdMoveInDate),
      existingTenantLeaseEndDate: optDate(facts.existingTenantLeaseEndDate),
    },
  };
  const deadlineRule = { disposalDeadlineYears: TEMP_TWO_HOUSE_UI_DEADLINE_YEARS };
  const era = resolveTemporaryTwoHouseDeadline(engineLike, deadlineRule);
  const deadlineYears = era.years;
  const relocation = meetsPublicInstitutionRelocationRegion(engineLike.temporaryTwoHouse);
  // §155⑯(5년)이 연혁상 조정 기한을 **덮는 경우에만** 두 주택 조정 여부·전입이 결론을 바꾸지 않는다. 조정→조정 단축 기한(2년·1년)은
  //   「3년」이 아니라 5년으로 덮이지 않으므로 그 독법에서는 입력 칸이 열려야 한다(#29). 5년이 덮는 독법은 조정 여부와 무관하다.
  const relocationOverridesRegulated = resolveTemporaryTwoHouseDeadlineFor(engineLike, deadlineRule, true).relocationFiveYearApplied;
  const reg = resolveRegulatedAtNewAcquisition(engineLike);
  const relevance = temporaryTwoHouseEraInputRelevance({
    newAcquisitionDate: nw,
    newContractDate: engineLike.temporaryTwoHouse.newHouseContractDate,
    previousAcquisitionDate: prev,
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
    disposalDelayDisposedByThatMethod: p.disposalDelayDisposedByThatMethod,
    deadlineDate: era.deadlineDate,
    moveInMet: era.moveInMet,
  });

  // 신규 주택이 권리(분양권·조합원입주권)로 취득한 주택이면 갈래를 가른다 — 엔진 `evaluateTemporaryTwoHouseTiming`과 같은 함수(결정 #43).
  const o = p.newHouseOrigin;
  const originVerdict = o
    ? judgeNewHouseOrigin(
        {
          acquisitionDate: prev,
          transferDate: transfer,
          rightThreeYearException: p.rightThreeYearException,
          ...(p.hasMerge ? { marriageMerge: { marriageDate: prev } } : {}),
          temporaryTwoHouse: {
            previousAcquisitionDate: prev,
            newAcquisitionDate: nw,
            newHouseOrigin: {
              kind: o.kind as NonNullable<NonNullable<TransferTaxInput["temporaryTwoHouse"]>["newHouseOrigin"]>["kind"],
              rightAcquisitionDate: optDate(o.rightAcquisitionDate),
              rightApprovalDate: optDate(o.rightApprovalDate),
            },
          },
        },
        oneYearWaived,
      )
    : undefined;
  const originNotes = originVerdict ? [...originVerdict.reasons, ...originVerdict.unconfirmed, ...originVerdict.confirmNotes] : [];

  return {
    status: t.overall && !originVerdict?.blocked ? "eligible" : "ineligible",
    ...(originVerdict && originNotes.length > 0 ? { origin: { blocked: originVerdict.blocked, notes: originNotes } } : {}),
    oneYearThreshold: t.oneYearThreshold,
    oneYearMet: t.oneYearMet,
    ...(t.acquiredInOrder ? {} : { orderNote: temporaryTwoHouseOrderReason(prev, nw) }),
    // ⑯ 후단도 1년 면제 사유다 — 카드 문구가 "면제"를 표시해야 판정과 설명이 어긋나지 않는다.
    oneYearWaived: oneYearWaived || relocation,
    deadline: t.deadline,
    ...(t.deadlineNote ? { deadlineNote: t.deadlineNote } : {}),
    deadlineYears,
    deadlineExtendedByTenant: era.deadlineDate !== undefined,
    threeYearMet: t.threeYearMet,
    regulated: {
      relevant: relevance.regulatedAxis && !relocationOverridesRegulated,
      previous: reg.previous,
      next: reg.next,
      // D8 상대 쪽 짝이면 B의 주소가 있을 때만 자동 판정이다 — 양도 주택(A)의 주소로 대신하지 않는다(S15-2).
      previousAuto: p.previousHouse ? !!facts.previousHouseRegionCode : !!engineLike.regionCode,
      // 위젯 안내 문구가 「양도 주택」과 「명부 종전 주택」을 구분한다.
      previousIsRosterRow: !!p.previousHouse,
      nextAuto: !!facts.newHouseRegionCode,
      determined: reg.determined,
      // 가목·단서 체제 — 두 주택이 모두 조정(또는 미확인)일 때만 연다.
      moveInRelevant: relevance.moveIn && reg.previous !== false && reg.next !== false && !relocationOverridesRegulated,
      clauseRef: resolveRegulatedShortenedClauseRef(transfer),
    },
    ...(era.moveInMet !== undefined ? { moveInMet: era.moveInMet } : {}),
    moveInPending: era.moveInRequirementPending,
    // 선언이 아니라 연혁(방법 요건·호별 신설 시기)까지 통과해 **실제로 적용된** 경우만 — 엔진 요건 B와 같은 판정(S15-14).
    delayReasonApplied: t.delay.applied,
    ...(t.delay.note ? { delayNote: t.delay.note } : {}),
  };
}
