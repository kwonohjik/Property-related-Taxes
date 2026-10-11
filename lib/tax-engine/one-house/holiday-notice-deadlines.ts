/**
 * 「~이내」 기한 말일의 공휴일 표 한계 고지(`civil-161-holiday-table-uncovered`) — **어느 기한이 양도일 곁에 있는가** (#32 하위 1 가)
 *
 * 민법 §161(국세기본법 §4)에 따라 「~이내」 기한 말일이 토요일·공휴일이면 익일까지다. 관공서 공휴일 표(`data/public-holidays-kr.ts`)
 * 밖의 해는 토·일요일만, 예정 해(월력요항 미발표)는 임시공휴일·규정 개정 없이 계산한다. 그 한계가 **판정을 바꾸는 것**은 어느 한
 * 기한의 말일이 양도일 직전 최장 연휴 일수 안에 있을 때뿐이다 — 종전에는 기한 축을 선언하기만 하면 양도일이 표 밖의 해일 때
 * 결론이 이미 정해진 판정에도 「판정 보류」 카드를 띄웠다.
 *
 * 대상 기한은 엔진이 양도일과 견주는 선언된 기한 축 전부다: §155①(두 독법 포함) · ④⑤ 합가 · ⑧ 해소 후 3년 · ⑦3호 귀농 5년 ·
 * §154① 단서(수용·출국) · §89② 권리 3년(충족·배제 갈래 모두) · §156의2④·§156의3③ 완성 후 N년 · §156의2⑤ 대체주택 · §155㉓ 임대주택 말소 후 5년. 기한은 각 정본 술어와 **같은 연수 함수**로 센다.
 * 정본이 모르는 사실(날짜 미입력 등)은 기한이 없다 — 그 축은 말일이 없으므로 고지 대상이 아니다.
 */
import { deadlineEnd, deadlineEndFrom, deadlineEndHolidayUncertaintyNear, type DeadlineEnd } from "../civil-period";
import { resolveMergeExemptionYears } from "../data/merge-exemption-era";
import { resolve1562DeadlineYears } from "../data/article-156-2-completion-era";
import { resolveExpropriationRemnantYears } from "../data/expropriation-remnant-era";
import { overseasTwoYearDeadlineApplies } from "../data/one-house-154-1-proviso-era";
import { EXEMPTION_PROVISO_CONST } from "../legal-codes";
import { firstTerminationCancellation, terminationDeadline } from "../transfer-tax/rental-housing-exception/eligibility";
import {
  RURAL_RETURN_TO_FARM_TRANSFER_YEARS,
  ruralReturnToFarmDeadlineApplies,
  UNAVOIDABLE_OUTSIDE_CAPITAL_YEARS,
  unavoidableResolvedDeadlineApplies,
} from "../transfer-tax-exemption-requirements";
import {
  resolveRegulatedAtNewAcquisition,
  resolveTemporaryTwoHouseDeadlineFor,
  temporaryTwoHouseDeadlineEnd,
} from "../transfer-tax-temporary-two-house-timing";
import type { Article89Clause2Result } from "../transfer-tax-89-2-exclusion";
import type { OneHouseSpecialRulesData } from "../schemas/rate-table.schema";
import type { OneHouseJudgeInput } from "./types";

/** 선언된 기한 축의 말일(민법 §161 반영) 전부. */
export function declaredDeadlineEnds(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
  article89Clause2: Pick<Article89Clause2Result, "deadline" | "noticeDeadlines">,
): DeadlineEnd[] {
  const out: DeadlineEnd[] = [];
  const t = input.transferDate;

  // §155① — 신규 취득 당시 조정 여부를 모르면 두 독법의 기한이 모두 후보다(양쪽 말일 곁의 양도는 어느 쪽이든 갈릴 수 있다).
  const tt = input.temporaryTwoHouse;
  const twoHouseRule = oneHouseRules.temporary_two_house;
  if (tt && twoHouseRule) {
    const readings = resolveRegulatedAtNewAcquisition(input).determined
      ? [resolveRegulatedAtNewAcquisition(input).bothRegulated]
      : [true, false];
    for (const bothRegulated of readings) {
      out.push(temporaryTwoHouseDeadlineEnd(tt.newAcquisitionDate, resolveTemporaryTwoHouseDeadlineFor(input, twoHouseRule, bothRegulated)));
    }
  }

  // §155④⑤ 합가 — 합가일부터 N년(N은 양도일 연혁).
  if (input.marriageMerge?.marriageDate) {
    out.push(deadlineEndFrom(input.marriageMerge.marriageDate, resolveMergeExemptionYears("marriage", t)));
  }
  if (input.parentalCareMerge?.mergeDate) {
    out.push(deadlineEndFrom(input.parentalCareMerge.mergeDate, resolveMergeExemptionYears("parental_care", t)));
  }

  // §155⑧ — 해소일부터 3년(2012.2.2. 전 해소분은 기한 없음).
  const uoc = input.unavoidableOutsideCapitalHouse;
  if (uoc?.resolvedDate && unavoidableResolvedDeadlineApplies(uoc.resolvedDate)) {
    out.push(deadlineEndFrom(uoc.resolvedDate, UNAVOIDABLE_OUTSIDE_CAPITAL_YEARS));
  }

  // §155⑦3호 귀농주택 — 취득일부터 5년.
  const rural = input.ruralHouse;
  if (rural?.kind === "return_to_farm" && rural.acquisitionDate && ruralReturnToFarmDeadlineApplies(rural.acquisitionDate)) {
    out.push(deadlineEndFrom(rural.acquisitionDate, RURAL_RETURN_TO_FARM_TRANSFER_YEARS));
  }

  // §154① 단서 — 수용일부터 N년 · 출국일부터 2년.
  const proviso = input.oneHouseExemptionProviso;
  if (proviso?.reason === "expropriation" && proviso.expropriationDate) {
    out.push(deadlineEndFrom(proviso.expropriationDate, resolveExpropriationRemnantYears(t)));
  }
  if (
    (proviso?.reason === "overseas_migration" || proviso?.reason === "overseas_residence") &&
    proviso.departureDate &&
    overseasTwoYearDeadlineApplies({ departureDate: proviso.departureDate, transferDate: t })
  ) {
    out.push(deadlineEndFrom(proviso.departureDate, EXEMPTION_PROVISO_CONST.OVERSEAS_TRANSFER_YEARS));
  }

  // §89② 주택 + 권리 세대 — 권리 취득일부터 3년(정본이 계산한 말일).
  //   충족 갈래(3년 안 양도 · ④ 완성 후 N년)의 말일은 `noticeDeadlines`가 싣는다.
  if (article89Clause2.deadline) out.push(deadlineEnd(article89Clause2.deadline));
  for (const d of article89Clause2.noticeDeadlines ?? []) out.push(deadlineEnd(d));

  // §156의2⑤ 대체주택 — 신축주택 완성 후 N년.
  const rh = input.replacementHouse;
  if (rh?.completionDate) out.push(deadlineEndFrom(rh.completionDate, resolve1562DeadlineYears(t)));

  // §155㉓ 임대주택 등록 말소 후 5년 — 최초 말소일 기준.
  const units = input.rentalHousingException?.rentalUnits;
  const first = units ? firstTerminationCancellation(units, t) : null;
  if (first) out.push(terminationDeadline(first.date));

  return out;
}

/** 그 말일 중 하나라도 양도일 곁에서 공휴일 표 한계가 걸리면 그 종류(표 밖이 우선). */
export function holidayTableNoticeKind(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
  article89Clause2: Pick<Article89Clause2Result, "deadline" | "noticeDeadlines">,
): "uncovered" | "provisional" | undefined {
  const kinds = declaredDeadlineEnds(input, oneHouseRules, article89Clause2).map((d) =>
    deadlineEndHolidayUncertaintyNear(d.end, input.transferDate),
  );
  return kinds.includes("uncovered") ? "uncovered" : kinds.includes("provisional") ? "provisional" : undefined;
}
