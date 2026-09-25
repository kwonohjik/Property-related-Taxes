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
import { addYears, format } from "date-fns";
import type { TransferTaxInput, TemporaryTwoHouseDelayReason } from "./types/transfer.types";
import type { OneHouseSpecialRulesData } from "./schemas/rate-table.schema";
import { isRegulatedByBjdCode } from "./data/regulated-areas";
import { getAdjacentSigunguCodes } from "@/lib/geo/administrative-district-adjacency";

/** §155⑯ 전단 — 공공기관 지방이전 시 처분기한 5년 */
const PUBLIC_INSTITUTION_RELOCATION_DEADLINE_YEARS = 5;


/**
 * §155① 일시적 2주택 타이밍 요건 판정 (순수 — rule·waiver는 caller 주입).
 *
 * - 요건 A(1년): 신규취득일 ≥ 종전취득일 + 1년. 단 oneYearWaived(§154①1·2가·3호) 시 면제.
 * - 요건 B(3년): 양도일 ≤ 신규취득일 + deadlineYears(조정지역 부칙은 caller가 반영해 주입).
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
}): {
  oneYearThreshold: Date;
  oneYearMet: boolean;
  deadline: Date;
  threeYearMet: boolean;
  overall: boolean;
} {
  const oneYearThreshold = addYears(p.previousAcquisitionDate, 1);
  // §155⑯ 후단: "…종전의 주택을 취득한 날부터 1년 이상이 지난 후 다른 주택을 취득하는 요건을
  //   적용하지 아니한다." — 기한 5년(전단)과 **별개의 두 번째 효과**다.
  const oneYearMet =
    p.oneYearWaived || p.publicInstitutionRelocation === true || p.newAcquisitionDate >= oneYearThreshold;
  const deadline = addYears(p.newAcquisitionDate, p.deadlineYears);
  // §155① 본문 괄호 "(제18항에 따른 사유에 해당하는 경우를 포함한다)" — 기한 초과를 치유한다.
  //   ⑱ 각 호는 「다른 주택을 취득한 날부터 3년이 되는 날 현재」 해당 여부이므로 양도일과 무관하다.
  //   ⑱은 **요건 B(기한)만** 치유한다 — 요건 A(1년)는 그대로다(본문 괄호가 3년 절에만 붙어 있다).
  const threeYearMet = p.disposalDelayReason !== undefined || p.transferDate <= deadline;
  return { oneYearThreshold, oneYearMet, deadline, threeYearMet, overall: oneYearMet && threeYearMet };
}

/**
 * §155① 처분기한(년) 산정 — 조정대상지역 부칙 완화 반영.
 *
 * 비과세 판정(`checkExemption` E-3)과 중과 배제(§167의10①15호) **양쪽이 같은 값을 써야** 한다.
 * 중과 배제가 이 규칙을 자체 재구현했다가 「비과세 O / 중과배제 X」 모순을 만든 것이
 * 계획서 F-2다. 인라인이던 것을 추출만 했으며 **동작은 불변**이다.
 */
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

export function resolveTemporaryTwoHouseDeadlineYears(
  p: Pick<
    TransferTaxInput,
    "isRegulatedArea" | "transferDate" | "temporaryTwoHouse" | "regionCode"
  >,
  twoHouseRule: NonNullable<OneHouseSpecialRulesData["temporary_two_house"]>,
): number {
  // §155⑯ 전단: "제1항 중 '3년'을 '5년'으로 본다."
  //   🔶 조정대상지역 단축 기한(DB 2년)과의 우선순위는 명문이 없다(계획서 W-4).
  //   법문이 §155① 본문의 "3년"을 직접 치환하므로 5년이 덮는 것으로 구현한다.
  if (p.temporaryTwoHouse && meetsPublicInstitutionRelocationRegion(p.temporaryTwoHouse)) {
    return PUBLIC_INSTITUTION_RELOCATION_DEADLINE_YEARS;
  }
  if (!resolveIsRegulatedAtTransfer(p)) return twoHouseRule.disposalDeadlineYears;
  // 부칙: 양도일이 완화 시행일(2022-05-10) 이후이면 완화 기한 적용
  const relaxDate = twoHouseRule.regulatedAreaRelaxDate
    ? new Date(twoHouseRule.regulatedAreaRelaxDate)
    : null;
  if (relaxDate && p.transferDate >= relaxDate) {
    return twoHouseRule.regulatedAreaRelaxDeadlineYears ?? twoHouseRule.regulatedAreaDeadlineYears;
  }
  return twoHouseRule.regulatedAreaDeadlineYears;
}
