/**
 * §89② 배제의 **합가(동거봉양·혼인) 축** — 「소득세법 시행령」 §156의2⑧·⑨ (분양권은 §156의3⑥) + 혼인 후 분양권 취득(7572).
 *
 * `transfer-tax-89-2-exclusion.ts`가 915줄로 파일 크기 정책(트리거 800)을 넘어 분리했다(2026-10-11, 결정 #7·#9로 늘어난 몫).
 * 부모는 이 파일의 함수를 부르고, 이 파일은 부모를 **타입으로만** 참조한다(런타임 순환 없음).
 */
import type { Article89Clause2Input, Article89Clause2Result } from "./transfer-tax-89-2-exclusion";
import type { MergedHouseholdFirstHouse } from "./types/transfer.types";
import type { PresaleRight } from "./types/multi-house-surcharge.types";
import { isWithinDeadline } from "./civil-period";
import { TRANSFER } from "./legal-codes";
import { resolveMergeExemptionYears } from "./data/merge-exemption-era";
import { classifyMergeHouse } from "./one-house/merge-composition";
import {
  PARENTAL_CARE_AGE_CARE_BENEFIT_NOT_IN_RIGHTS_REASON,
  PARENTAL_CARE_AGE_CONFIRM_NOTICE,
  parentalCareAgeVerdict,
} from "./one-house/parental-care-age";
import { resolveAcquiredRightTiming } from "./transfer-tax-89-2-acquired-right-timing";

/**
 * 혼인으로 2주택이 된 뒤 **분양권을 취득**하고 혼인 전 보유하던 주택을 양도하는 경우 — 서면-2021-부동산-7572(부동산납세과-1014, 2022.4.21.)
 * (결정 #7 하위 1 나). 회신 요지(국세청 상세 페이지 원문): 「1주택(A)을 소유하고 있는 자와 1주택(B)을 소유하고 있는 자가 혼인함으로써
 * 1세대 2주택이 된 상태에서 종전주택(A, B주택 중 나중에 취득한 주택)을 취득한 날부터 1년 이상 지난 후 분양권을 취득하는 경우로서
 * 분양권을 취득한 날부터 3년 이내에 그리고 혼인한 날부터 5년 이내에 혼인 전 보유하던 주택을 양도할 때에는 … 영 제155조제5항 및
 * 같은 영 제156조의3제2항에 따라 이를 1세대1주택으로 보아 제154조제1항을 적용」.
 *
 * 합가 전 보유 구성 선언(`mergedHouseholdFirstHouse`)과 무관하게 **명부 날짜**로 판정한다:
 *   ① 혼인만 있다(동거봉양 합가 없음) · ② 권리는 분양권 1개이고 혼인 **후** 취득(합가 당시 권리는 ⑨ 구성 선언 축) · 상속 분양권 아님
 *   ③ 「먼저 양도」 · 혼인일 이후 양도 · 혼인한 날부터 N년 이내(N = 양도일 연혁 `resolveMergeExemptionYears` — 회신 당시 5년, 현행 10년)
 *   ④ 명부: 양도 주택 외 정확히 1채, 둘 다 혼인일(당일 포함) 이전 취득, 그 1채가 배우자 쪽(`mergeOrigin` counterpart_side)
 *   ⑤ 분양권 취득이 「나중에 취득한 주택」 취득 후 1년 이상 · 분양권 취득일부터 3년 이내 양도 — §156의3② 타이밍 leaf를 그대로 재사용
 * 하나라도 못 채우면(명부가 없어 나중 취득 주택을 못 가리는 경우 포함) 이 경로는 서지 않는다 — 불리하게 단정하지 않고 구성 선언 축이 판정한다.
 */
export function resolveMarriageThenPresaleRight(
  input: Article89Clause2Input,
  rights: readonly PresaleRight[],
): Article89Clause2Result | undefined {
  const marriageDate = input.marriageMerge?.marriageDate;
  if (!marriageDate || input.parentalCareMerge?.mergeDate) return undefined;
  if (rights.length !== 1 || rights[0].type !== "presale_right" || rights[0].isInherited === true) return undefined;
  const right = rights[0];
  if (right.acquisitionDate.getTime() <= marriageDate.getTime()) return undefined;
  if (input.isFirstTransferredInMerge !== true || input.transferDate < marriageDate) return undefined;
  if (!isWithinDeadline(marriageDate, resolveMergeExemptionYears("marriage", input.transferDate), input.transferDate)) return undefined;

  const houses = input.houses ?? [];
  const sellingId = input.sellingHouseId ?? houses[0]?.id;
  const others = houses.filter((h) => h.id !== sellingId);
  if (others.length !== 1) return undefined;
  const other = others[0];
  if (input.acquisitionDate > marriageDate || classifyMergeHouse(other.acquisitionDate, marriageDate, other.mergeOrigin) !== "counterpart_side") {
    return undefined;
  }
  const later = input.acquisitionDate >= other.acquisitionDate ? input.acquisitionDate : other.acquisitionDate;
  const timing = resolveAcquiredRightTiming({ ...input, acquisitionDate: later }, right, TRANSFER.MARRIAGE_MERGE_EXEMPT);
  return timing.status === "exception_met" ? timing : undefined;
}

/**
 * 합가(동거봉양·혼인) 축의 판정 — 「소득세법 시행령」 §156의2⑧·⑨.
 *
 * ## 네 갈래
 *
 * · `no_merge`     — 합가 사실 자체가 없다. 화면에 합가일 칸이 있으므로 **미입력은 미해당**이다.
 * · `undeclared`   — 합가는 있고 **날짜·선언 게이트를 통과**했는데 **합가 전 보유 구성**을 선언하지 않았다 ⇒ **불성립 + 확인 필요**
 *                    (결정 #7 — 모름 = 혜택 불성립, 2026-10-04 원칙 1. 종전: 판정 불가·비과세 유지). 고지는 이 배제가 결론을 가를 때만.
 * · `unmet`        — 게이트(먼저 양도 · 합가 이후 양도 · N년 기한)에서 떨어졌거나, 선언했는데 어느 호에도 해당하지 않는다
 *                    ⇒ 이 축은 결론이 났다. 게이트는 구성 판정보다 **먼저**다(S05-6 · S05-1).
 * · `met`          — 어느 호에 해당한다 ⇒ **직접 1세대1주택 의제**(타이밍 요건 없음).
 *
 * ## ⚠️ §155④⑤와 술어를 공유하지 않는다
 *
 * 재사용하는 것은 **합가일과 선양도 두 사실**까지다. §155④⑤는 주택 + 주택 조합이라 아래
 * 3·4·5호의 「합가 전 보유 구성」 요건이 아예 없다.
 */
export type MergedHouseholdVerdict =
  | { status: "no_merge" }
  | { status: "undeclared"; articles: string[] }
  | { status: "unmet"; confirmNotes?: string[]; exclusionReasons?: string[] }
  | { status: "met"; exception: string };

export function resolveMergedHouseholdVerdict(input: Article89Clause2Input): MergedHouseholdVerdict {
  const parentalCareDate = input.parentalCareMerge?.mergeDate;
  const marriageDate = input.marriageMerge?.marriageDate;
  if (!parentalCareDate && !marriageDate) return { status: "no_merge" };

  /**
   * 🔑 **게이트 순서** — 날짜·선언 게이트(먼저 양도 → 합가 이후 양도 → N년 기한)를 **합가 전 구성 판정보다 먼저** 본다
   * (S05-6 순서 정정 · S05-1). 날짜가 안 맞으면 「모름」을 말할 자리가 없다 — 구성을 몰라서가 아니라 그 합가 축 자체가
   * 불성립이다(형제 §155④⑤ `matchMergeGateAndComposition`이 같은 순서다). 종전에는 구성 미선언이면 기한이 지났거나
   * 「먼저 양도」가 아니어도 판정 보류(비과세 종전 동작)로 새서, 불성립이 확정된 세대까지 비과세로 나왔다.
   * 미선언을 어떻게 처리할지(보류 vs 불성립)는 이 순서와 **별개 결정**이다 — 게이트를 통과한 뒤의 미선언은 종전대로 판정 보류다.
   */
  // ⑧·⑨ 본문 공통 — 「합친 날부터 N년 이내에 **먼저 양도하는 주택**」.
  if (input.isFirstTransferredInMerge !== true) return { status: "unmet" };

  const axes: { date: Date | undefined; clause: "⑧" | "⑨" }[] = [
    { date: parentalCareDate, clause: "⑧" },
    { date: marriageDate, clause: "⑨" },
  ];
  const ageConfirm: string[] = [];
  const ageReasons: string[] = [];
  const alive = axes.filter((axis): axis is { date: Date; clause: "⑧" | "⑨" } => {
    if (!axis.date) return false;
    // 「합친 날(혼인한 날)부터」 — 합가(혼인) **전** 양도는 「합침으로써 … 소유하게 되는 경우」가 아직 성립하지 않았다(S05-1).
    // 같은 날 양도는 포함한다(`merge-deeming.ts` `matchMergeGateAndComposition`과 같은 경계).
    if (input.transferDate < axis.date) return false;
    // N = 양도일 연혁.
    const years = resolveMergeExemptionYears(axis.clause === "⑧" ? "parental_care" : "marriage", input.transferDate);
    if (!isWithinDeadline(axis.date, years, input.transferDate)) return false;
    // ⑧2호 「60세 이상의 직계존속」 — 요양급여 갈래는 없다(결정 #9). 연령 칸을 비우면 모름 = 불성립 + 확인 필요.
    if (axis.clause === "⑧") {
      const age = parentalCareAgeVerdict(input.parentalCareMerge?.parentAge, "156_2_8");
      if (age === "unknown") ageConfirm.push(PARENTAL_CARE_AGE_CONFIRM_NOTICE);
      if (age === "unmet" && input.parentalCareMerge?.parentAge === "care_benefit") {
        ageReasons.push(PARENTAL_CARE_AGE_CARE_BENEFIT_NOT_IN_RIGHTS_REASON);
      }
      if (age !== "met") return false;
    }
    return true;
  });
  if (alive.length === 0) {
    return {
      status: "unmet",
      ...(ageConfirm.length ? { confirmNotes: [...new Set(ageConfirm)] } : {}),
      ...(ageReasons.length ? { exclusionReasons: [...new Set(ageReasons)] } : {}),
    };
  }

  const declared = input.mergedHouseholdFirstHouse;
  if (declared === undefined) {
    return {
      status: "undeclared",
      articles: alive.map(({ clause }) => `소득세법 시행령 §156의2 ${clause}`),
    };
  }

  for (const { date, clause } of alive) {
    const item = matchMergedHouseholdClause(declared, {
      mergeDate: date,
      houseAcquisitionDate: input.acquisitionDate,
      isParentalCare: clause === "⑧",
    });
    if (item) return { status: "met", exception: `소득세법 시행령 §156의2 ${clause}${item}` };
  }
  return { status: "unmet" };
}

/**
 * 최초양도주택이 ⑧3·4·5호(⑨2·3·4호) 중 어디에 해당하는가 — 해당 호·목 표기를 돌려준다.
 *
 * ## 🔑 ⑨는 **호 번호가 하나씩 당겨진다**
 *
 * ⑨에는 「60세 이상 직계존속」인 제2호가 없어 제1호 하나뿐이다 ⇒ **2호 = ⑧3호 · 3호 = ⑧4호 ·
 * 4호 = ⑧5호**. 인용 문자열을 상수로 묶으면 조용히 틀린다.
 *
 * ## 🔑 3·4호와 5호는 취득 시점의 방향이 **반대**다
 *
 * 3·4호는 「합친 날 이전에 … **소유하던** 주택」이고, 5호는 합가 전 권리에 의하여 「합친 날
 * **이후에 취득하는** 주택」이다. 한 조건으로 묶을 수 없다.
 */
function matchMergedHouseholdClause(
  declared: MergedHouseholdFirstHouse,
  p: { mergeDate: Date; houseAcquisitionDate: Date; isParentalCare: boolean },
): string | undefined {
  /** ⑧ 기준 호 번호 → ⑨는 하나 당겨진다. */
  const no = (parentalCareNo: number) => (p.isParentalCare ? parentalCareNo : parentalCareNo - 1);
  const ownedBeforeMerge = p.houseAcquisitionDate <= p.mergeDate;
  const acquiredAfterMerge = p.houseAcquisitionDate > p.mergeDate;

  switch (declared.kind) {
    case "house_only":
      return ownedBeforeMerge ? `${no(3)}호` : undefined;
    case "initial_right":
      // 가목은 요건이 **둘**이다 — 「인가일 이후 취득」 그리고 「취득 후 1년 이상 거주」.
      return ownedBeforeMerge && declared.acquiredAfterApproval && declared.residedOneYear
        ? `${no(4)}호가목`
        : undefined;
    case "succeeded_right":
      return ownedBeforeMerge && declared.ownedBeforeRight ? `${no(4)}호나목` : undefined;
    case "presale_right":
      return ownedBeforeMerge && declared.ownedBeforeRight ? `${no(4)}호다목` : undefined;
    case "right_only":
      return acquiredAfterMerge ? `${no(5)}호` : undefined;
    case "none":
      return undefined;
  }
}
