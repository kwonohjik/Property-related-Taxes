/**
 * §155① 일시적 2주택 — **타이밍 요건(A·B)과 처분기한** (800줄 정책 분리)
 *
 * `transfer-tax-exemption-requirements.ts`에서 자기완결적인 네 함수를 추출했다.
 *
 * 🔑 **`evaluateTemporaryTwoHouseTiming`은 함께 오지 않았다** — 그것은 부모의
 *    `resolveExemptionProviso`를 부르므로 같이 옮기면 **순환 import**가 된다
 *    (부모 → 자식 함수 · 자식 → 부모 함수). 여기 있는 넷은 부모 지역 함수를 하나도 부르지 않는다.
 *
 * 의존 방향은 **부모 → 이 파일** 한 방향뿐이다.
 */
import { format } from "date-fns";
import {
  firstDayAfterPeriod,
  isAfterPeriod,
  isOnOrBeforeDay,
  isWithinPeriod,
  periodEndFrom,
} from "./civil-period";
import type { TransferTaxInput, TemporaryTwoHouseDelayReason } from "./types/transfer.types";
import type { OneHouseSpecialRulesData } from "./schemas/rate-table.schema";
import { isRegulatedByBjdCode } from "./data/regulated-areas";
import { getAdjacentSigunguCodes } from "@/lib/geo/administrative-district-adjacency";
import {
  resolveTemporaryTwoHouseDeadlineEra,
  type TemporaryTwoHouseDeadlineEra,
} from "./data/temporary-two-house-deadline-era";

/** §155⑯ 전단 — 공공기관 지방이전 시 처분기한 5년 */
const PUBLIC_INSTITUTION_RELOCATION_DEADLINE_YEARS = 5;


/**
 * §155① 일시적 2주택 타이밍 요건 판정 (순수 — rule·waiver는 caller 주입).
 *
 * - 요건 A(1년): 「종전의 주택을 취득한 날부터 1년 이상이 지난 후」 — 초일불산입(국기법 §4→민법 §157)이라
 *   종전취득일의 **응당일은 미충족**, 그 다음날부터 충족(조심2019서1704). 단 oneYearWaived(§154①1·2가·3호) 시 면제.
 *   `oneYearThreshold`는 **최초 충족일**(=만료일 다음날) — 판정 카드가 「1년 경과일」로 표시한다.
 * - 요건 B(3년): 「다른 주택을 취득한 날부터 3년 이내」 — 초일불산입, 만료일(`deadline`) 당일까지
 *   (조정지역 부칙은 caller가 반영해 주입). 규칙: `civil-period.ts` 유형 A·B.
 *
 * 엔진 E-3·UI 판정 카드 공용(single-source). UI는 waiver를 resolveExemptionProviso로 별도 산출해 주입.
 */
export function judgeTemporaryTwoHouseTiming(p: {
  previousAcquisitionDate: Date;
  newAcquisitionDate: Date;
  transferDate: Date;
  deadlineYears: number;
  oneYearWaived: boolean;
  /** §155⑯ 후단 — 공공기관 지방이전 시 1년 요건 면제 */
  publicInstitutionRelocation?: boolean;
  /** §155⑱ — 해당 시 처분기한 초과여도 요건 B 충족 */
  disposalDelayReason?: TemporaryTwoHouseDelayReason;
  /**
   * §155①2호 단서(기존 임차인)로 늘어난 기한 말일 — 있으면 `deadlineYears` 대신 이 날까지다
   * (연혁 leaf `TemporaryTwoHouseDeadlineEra.deadlineDate`).
   */
  deadlineDate?: Date;
  /**
   * §155①2호 가목(1년 내 세대전원 이사·전입신고) 판정 — `false`면 「다음 각 목의 요건을 **모두**
   * 충족한 경우」가 깨져 특례 불성립. `undefined`는 해당 없음 또는 미판정(고지로 알린다).
   */
  moveInMet?: boolean;
}): {
  oneYearThreshold: Date;
  oneYearMet: boolean;
  deadline: Date;
  threeYearMet: boolean;
  /** §155①2호 가목 — 입력 그대로(해당 없음·미판정이면 `undefined`) */
  moveInMet?: boolean;
  overall: boolean;
} {
  const oneYearThreshold = firstDayAfterPeriod(p.previousAcquisitionDate, 1);
  // §155⑯ 후단: "…종전의 주택을 취득한 날부터 1년 이상이 지난 후 다른 주택을 취득하는 요건을
  //   적용하지 아니한다." — 기한 5년(전단)과 **별개의 두 번째 효과**다.
  const oneYearMet =
    p.oneYearWaived ||
    p.publicInstitutionRelocation === true ||
    isAfterPeriod(p.previousAcquisitionDate, 1, p.newAcquisitionDate);
  const deadline = p.deadlineDate ?? periodEndFrom(p.newAcquisitionDate, p.deadlineYears);
  // §155① 본문 괄호 "(제18항에 따른 사유에 해당하는 경우를 포함한다)" — 기한 초과를 치유한다.
  //   ⑱ 각 호는 「다른 주택을 취득한 날부터 3년이 되는 날 현재」 해당 여부이므로 양도일과 무관하다.
  //   ⑱은 **요건 B(기한)만** 치유한다 — 요건 A(1년)는 그대로다(본문 괄호가 3년 절에만 붙어 있다).
  const threeYearMet =
    p.disposalDelayReason !== undefined ||
    (p.deadlineDate
      ? isOnOrBeforeDay(p.transferDate, p.deadlineDate)
      : isWithinPeriod(p.newAcquisitionDate, p.deadlineYears, p.transferDate));
  // ⑱은 양도 기한만 치유한다 — 가목(전입)은 「각 목의 요건을 모두 충족」의 별개 요건이다.
  const moveInOk = p.moveInMet !== false;
  return {
    oneYearThreshold,
    oneYearMet,
    deadline,
    threeYearMet,
    ...(p.moveInMet !== undefined ? { moveInMet: p.moveInMet } : {}),
    overall: oneYearMet && threeYearMet && moveInOk,
  };
}

/**
 * §155⑯ 「이전한 시·군 또는 **이와 연접한 시·군**」 충족 여부.
 *
 * 두 코드가 모두 있으면 자동 판정한다(동일 시·군 또는 인접 매트릭스 조회).
 * 코드가 없거나 매트릭스가 비어 있으면 **자기선언 boolean을 그대로 신뢰**한다 —
 * 자동 판정을 근거로 사용자 입력을 부정하지 않는다(판정 불가 ≠ 미충족).
 *
 * 인접 매트릭스: `lib/geo/administrative-district-adjacency.ts` (Vworld 경계 + turf, 2026-07-31).
 */
export function meetsPublicInstitutionRelocationRegion(
  p: NonNullable<TransferTaxInput["temporaryTwoHouse"]>,
  adjacentCodes: (code: string) => string[] = getAdjacentSigunguCodes,
): boolean {
  if (!p.publicInstitutionRelocation) return false;
  const from = p.relocatedSigunguCode;
  const to = p.newHouseSigunguCode;
  if (!from || !to) return true; // 코드 미입력 → 자기선언 유지
  if (from === to) return true; // 「이전한 시·군」
  const adjacent = adjacentCodes(from);
  if (adjacent.length === 0) return true; // 매트릭스 미보유 지역 → 판정 불가, 자기선언 유지
  return adjacent.includes(to); // 「이와 연접한 시·군」
}

/**
 * 「양도 당시 조정대상지역」 — `regionCode`가 있으면 **양도일 기준 정밀 판정**, 없으면 boolean.
 *
 * 형제 둘과 **같은 규약**이다:
 *   · 취득 당시 — `resolveWasRegulatedAtAcquisition`(위) — 취득일 기준
 *   · 다주택 중과 — `multi-house-surcharge.ts:226` — 양도일 기준
 *
 * 🔴 종전에는 **§155① 처분기한만** boolean을 직접 읽어, 주소를 넣어도 그 축만 토글을 따랐다.
 *    같은 폼의 세 판정이 서로 다른 근거를 쓰던 것을 여기서 맞춘다(F-3).
 *    anchor: `judgment-transfer-regulated-region-code.predo.anchor.test.ts`.
 */
function resolveIsRegulatedAtTransfer(
  p: Pick<TransferTaxInput, "isRegulatedArea" | "transferDate" | "regionCode">,
): boolean {
  if (p.regionCode) {
    return isRegulatedByBjdCode(p.regionCode, format(p.transferDate, "yyyy-MM-dd")).isRegulated;
  }
  return p.isRegulatedArea === true;
}

/**
 * §155① 처분기한(년) 산정 — 조정대상지역 연혁(OH-01) 반영.
 *
 * 비과세 판정(`checkExemption` E-3)과 중과 배제(§167의10①15호) **양쪽이 같은 값을 써야** 한다.
 * 중과 배제가 이 규칙을 자체 재구현했다가 「비과세 O / 중과배제 X」 모순을 만든 것이
 * 계획서 F-2다.
 */
export function resolveTemporaryTwoHouseDeadlineYears(
  p: Pick<
    TransferTaxInput,
    "isRegulatedArea" | "transferDate" | "temporaryTwoHouse" | "regionCode"
  >,
  twoHouseRule: NonNullable<OneHouseSpecialRulesData["temporary_two_house"]>,
): number {
  return resolveTemporaryTwoHouseDeadline(p, twoHouseRule).years;
}

/**
 * §155①2호 「종전의 주택이 조정대상지역에 있는 상태에서 조정대상지역에 있는 신규 주택을 취득」 —
 * **신규 주택 취득일** 기준 두 주택의 조정 여부 (OH-01 판정 대상·시점).
 *
 * 주택마다 법정동코드가 있으면 `isRegulatedByBjdCode(취득일)`로 정밀 판정하고(형제
 * `resolveWasRegulatedAtAcquisition`과 같은 규약 — 코드가 선언을 이긴다), 없으면 사용자 선언을 쓴다.
 *
 * 2호 괄호 「조정대상지역의 공고가 있은 날 이전에 … 매매계약을 체결하고 계약금을 지급한 사실이
 * 증명서류에 의해 확인되는 경우는 제외」 — 신규 주택 코드와 계약일이 있으면 **계약일 기준**으로도
 * 조정 여부를 보고, 그때 미지정이었으면 신규 주택을 조정대상지역 취득으로 보지 않는다.
 * ⚠️ 확인 필요: 데이터의 `designatedDate`는 효력일이다 — 공고일 **당일** 계약(「공고가 있은 날 이전」에
 *    포함)은 여기서 조정 취득으로 잡힌다. 경계 하루의 해석 근거를 찾지 못해 데이터 규약을 따른다.
 *
 * 어느 쪽이 `false`면 결론이 확정된다(한쪽만 조정 = 본문 3년). 둘 다 `true`여야 조정→조정이다.
 * 그 밖(미입력)은 `determined: false` — 호출부가 종전 대리 지표로 계산하고 판정 보류를 고지한다.
 */
export function resolveRegulatedAtNewAcquisition(
  p: Pick<TransferTaxInput, "isRegulatedArea" | "transferDate" | "temporaryTwoHouse" | "regionCode">,
): { previous?: boolean; next?: boolean; bothRegulated: boolean; determined: boolean } {
  const tt = p.temporaryTwoHouse;
  if (!tt) return { bothRegulated: resolveIsRegulatedAtTransfer(p), determined: false };
  const at = (code: string | undefined, declared: boolean | undefined, date: Date) =>
    code ? isRegulatedByBjdCode(code, format(date, "yyyy-MM-dd")).isRegulated : declared;
  const previous = at(p.regionCode, tt.previousHouseRegulatedAtNewAcquisition, tt.newAcquisitionDate);
  let next = at(tt.newHouseRegionCode, tt.newHouseRegulatedAtAcquisition, tt.newAcquisitionDate);
  if (next === true && tt.newHouseRegionCode && tt.newHouseContractDate) {
    next = isRegulatedByBjdCode(tt.newHouseRegionCode, format(tt.newHouseContractDate, "yyyy-MM-dd")).isRegulated;
  }
  if (previous === false || next === false) return { previous, next, bothRegulated: false, determined: true };
  if (previous === true && next === true) return { previous, next, bothRegulated: true, determined: true };
  // 미입력 — 저장 당시 결론을 보존하려고 종전 대리 지표(양도일 기준 양도주택)로 계산한다(고지 동반).
  return { previous, next, bothRegulated: resolveIsRegulatedAtTransfer(p), determined: false };
}

/**
 * §155① 처분기한 — 연혁 leaf(`data/temporary-two-house-deadline-era.ts`)의 결과를 그대로 돌려준다.
 * `moveInRequirementPending`은 2019-12-17 체제의 전입요건을 **판정하지 않았다**는 신호다
 * (판정 보류 고지 — `one-house/era-undetermined.ts`).
 */
export function resolveTemporaryTwoHouseDeadline(
  p: Pick<
    TransferTaxInput,
    "isRegulatedArea" | "transferDate" | "temporaryTwoHouse" | "regionCode"
  >,
  twoHouseRule: NonNullable<OneHouseSpecialRulesData["temporary_two_house"]>,
): TemporaryTwoHouseDeadlineEra {
  // §155⑯ 전단: "제1항 중 '3년'을 '5년'으로 본다."
  //   🔶 조정대상지역 단축 기한과의 우선순위는 명문이 없다(계획서 W-4).
  //   법문이 §155① 본문의 "3년"을 직접 치환하므로 5년이 덮는 것으로 구현한다.
  if (p.temporaryTwoHouse && meetsPublicInstitutionRelocationRegion(p.temporaryTwoHouse)) {
    return { years: PUBLIC_INSTITUTION_RELOCATION_DEADLINE_YEARS, moveInRequirementPending: false };
  }
  // OH-01 — 조정대상지역 처분기한 연혁은 코드 leaf가, 조정 판정 대상·시점(신규 취득 당시 두 주택)은
  //   `resolveRegulatedAtNewAcquisition`이 정한다(A2b — 종전 대리 지표는 미입력 폴백으로만 남았다).
  const tt = p.temporaryTwoHouse;
  return resolveTemporaryTwoHouseDeadlineEra({
    bothRegulated: resolveRegulatedAtNewAcquisition(p).bothRegulated,
    baseDeadlineYears: twoHouseRule.disposalDeadlineYears,
    newAcquisitionDate: tt?.newAcquisitionDate,
    newContractDate: tt?.newHouseContractDate,
    moveInDate: tt?.wholeHouseholdMoveInDate,
    existingTenantLeaseEndDate: tt?.existingTenantLeaseEndDate,
    transferDate: p.transferDate,
  });
}
