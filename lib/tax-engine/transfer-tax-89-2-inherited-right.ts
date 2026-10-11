/**
 * §89② 배제의 **상속받은 권리·주택 축** — 「소득세법 시행령」 §156의2⑥·⑦ · §156의3④·⑤ 의 「상속개시 당시 보유한 주택」 날짜 판정(결정 #8)과,
 * 최종 결과가 배제(`excluded`)일 때 사유·확인 필요를 결과에 싣는 래퍼(`withClause2TraceNotes`).
 *
 * `transfer-tax-89-2-exclusion.ts` 분리(2026-10-11, 파일 크기 정책). 부모를 **타입으로만** 참조한다(런타임 순환 없음).
 */
import type { Article89Clause2Input, Article89Clause2Result } from "./transfer-tax-89-2-exclusion";
import type { PresaleRight } from "./types/multi-house-surcharge.types";
import { TRANSFER } from "./legal-codes";
import {
  isDecedentGiftExclusionApplicable,
  qualifiesAsInheritanceGeneralHouse,
} from "./data/inheritance-general-house-era";

/**
 * 「상속개시 당시 보유한 주택」(§156의2⑥·⑦ · §156의3④·⑤ 후단) 요건이 날짜로 깨졌거나(`after`) 날짜를 몰라(`unknown`)
 * 상속 예외를 적용하지 않은 사실 — 최종 결과가 `excluded`일 때만 사유·확인 필요로 옮긴다(`withClause2TraceNotes`).
 * 다른 예외(③ 타이밍 등)로 `exception_met`이 되면 이 사실은 결론에 영향이 없어 버린다.
 */
export type Article89Clause2Trace = {
  /** 합가(혼인) 전 보유 구성 미선언 — 불성립 + 확인 필요(결정 #7). 최종 결과가 `excluded`일 때만 `undeclaredMergeArticles`로 옮긴다. */
  mergeUndeclared?: string[];
  /** ⑧ 직계존속 연령 요건 미선택(모름) 확인 필요 / 요양급여 갈래가 이 경로에 없다는 사유(결정 #9). */
  mergeConfirmNotes?: string[];
  mergeExclusionReasons?: string[];
  rights?: { kind: "after" | "unknown"; right: PresaleRight; newBuildAllowed: boolean; inheritedDate?: Date };
  houses?: { kind: "after" | "unknown"; rightTypes: PresaleRight["type"][] };
};

export function withClause2TraceNotes(r: Article89Clause2Result, trace: Article89Clause2Trace): Article89Clause2Result {
  if (r.status !== "excluded") return r;
  const reasons: string[] = [];
  const confirm: string[] = [];
  let basis: string | undefined;
  if (trace.rights) {
    const { kind, right, newBuildAllowed, inheritedDate } = trace.rights;
    const clause = right.type === "redevelopment_right" ? `${TRANSFER.RIGHT_ONE_HOUSE_SPECIAL} ⑥·⑦` : `${TRANSFER.PRESALE_ONE_HOUSE_SPECIAL} ④·⑤`;
    const name = right.type === "redevelopment_right" ? "조합원입주권" : "분양권";
    basis = clause;
    const general = newBuildAllowed
      ? "「상속개시 당시 보유한 주택」(또는 그때 보유한 권리로 사업시행 완료 후 취득한 신축주택)"
      : "「상속개시 당시 보유한 주택」";
    if (kind === "after") {
      reasons.push(
        `양도하는 주택을 상속받은 ${name}의 상속개시일(${inheritedDate ? isoDay(inheritedDate) : "미상"})보다 뒤에 취득했습니다 — ${clause}의 일반주택은 ${general}만 해당하므로 상속받은 ${name}의 특례를 적용하지 않고 일반 권리로 판정했습니다.`,
      );
    } else {
      confirm.push(
        `상속받은 ${name}의 상속개시일이 없어 양도하는 주택이 ${general}인지 판정하지 못했고 ${clause}를 적용하지 않았습니다(확인 필요) — 상속개시일을 입력하면 판정합니다.`,
      );
    }
  }
  if (trace.houses) {
    // 세대가 가진 권리 종류의 조문만 말한다(입주권 → §156의2⑦1호, 분양권 → §156의3⑤1호) — 확인해도 소용없는 조문을 가리키지 않는다.
    const redev = trace.houses.rightTypes.includes("redevelopment_right");
    const presale = trace.houses.rightTypes.includes("presale_right");
    const clause = [redev && `${TRANSFER.RIGHT_ONE_HOUSE_SPECIAL} ⑦1호`, presale && `${TRANSFER.PRESALE_ONE_HOUSE_SPECIAL} ⑤1호`]
      .filter(Boolean)
      .join("·");
    basis ??= redev ? `${TRANSFER.RIGHT_ONE_HOUSE_SPECIAL} ⑦` : `${TRANSFER.PRESALE_ONE_HOUSE_SPECIAL} ⑤`;
    if (trace.houses.kind === "after") {
      reasons.push(
        `양도하는 주택을 상속개시 뒤에 취득했습니다 — ${clause} 후단의 일반주택은 「상속개시 당시 보유한 주택」만 해당하고(상속개시 당시 보유한 권리로 완공된 신축주택은 포함하는 문구가 없습니다) 상속받은 주택을 이용한 특례를 적용하지 않았습니다.`,
      );
    } else {
      confirm.push(
        `상속주택의 상속개시일이 없어 양도하는 주택이 「상속개시 당시 보유한 주택」인지 판정하지 못했고 ${clause}를 적용하지 않았습니다(확인 필요) — 상속개시일을 입력하면 판정합니다.`,
      );
    }
  }
  const undeclaredMerge = trace.mergeUndeclared;
  confirm.push(...(trace.mergeConfirmNotes ?? []));
  reasons.push(...(trace.mergeExclusionReasons ?? []));
  basis ??= trace.mergeExclusionReasons?.length ? TRANSFER.RIGHT_ONE_HOUSE_SPECIAL : undefined;
  if (reasons.length === 0 && confirm.length === 0 && !undeclaredMerge) return r;
  return {
    ...r,
    ...(undeclaredMerge ? { undeclaredMergeArticles: undeclaredMerge } : {}),
    ...(reasons.length > 0
      ? { exclusionReasons: [...(r.exclusionReasons ?? []), ...reasons], exclusionBasis: basis ?? r.exclusionBasis }
      : {}),
    ...(confirm.length > 0 ? { confirmNotes: [...(r.confirmNotes ?? []), ...confirm] } : {}),
  };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * 세대가 **양도 대상이 아닌 상속받은 주택**을 보유하는가 — §156의2⑦1호·§156의3⑤1호의 전제.
 * 양도 주택 식별은 `transfer-tax-house-exclusion-step.ts`의 §155②③ 제외와 **같은 규약**이다
 * (`sellingHouseId` 미지정 시 첫 항목).
 */
export function hasInheritedHouseOtherThanSelling(input: Article89Clause2Input): boolean {
  const houses = input.houses ?? [];
  const sellingId = input.sellingHouseId ?? houses[0]?.id;
  return houses.some((h) => h.isInherited === true && h.id !== sellingId);
}

/**
 * §156의2⑦ 후단 · §156의3⑤ — 「제3항 및 제4항의 규정을 적용받는 일반주택은 상속개시 당시 보유한 주택으로 한정한다」가
 * **성립하는가** (OH-12b · 결정 #8).
 *
 * 선언 토글(`generalHouseHeldAtInheritance`)은 폐지했다 — 보유 여부는 날짜로 정해지는 사실이다. §155② 경로와 **같은 leaf**
 * (`qualifiesAsInheritanceGeneralHouse`)로 모든 상속주택을 판정한다:
 *   · `yes`     — 2013-02-15 전 취득 일반주택(제24356호 부칙 제20조 — 한정 없음)이거나 상속개시 전 취득이 날짜로 확인된다.
 *   · `no`      — 상속개시 뒤 취득. ⑦ 후단에는 「상속개시 당시 보유한 권리로 완공된 신축주택」을 포함하는 문구가 없으므로
 *                 신축주택 갈래(`generalHouseRightAtInheritance`)를 넘기지 **않는다**(⑥·④ 본문 괄호와 다르다).
 *   · `unknown` — 상속개시일을 모른다 → 불성립 + 확인 필요.
 */
export function inheritedHousesHeldVerdict(input: Article89Clause2Input): "yes" | "no" | "unknown" {
  const houses = input.houses ?? [];
  const sellingId = input.sellingHouseId ?? houses[0]?.id;
  const verdicts = houses
    .filter((h) => h.isInherited === true && h.id !== sellingId)
    .map((h) =>
      qualifiesAsInheritanceGeneralHouse({
        generalHouseAcquisitionDate: input.acquisitionDate,
        inheritedDate: h.inheritedDate,
        transferDate: input.transferDate,
      }),
    );
  if (verdicts.includes("no")) return "no";
  if (verdicts.includes("unknown")) return "unknown";
  return "yes";
}

/**
 * 상속받은 권리가 §156의2⑥(입주권)·§156의3④(분양권)의 「상속받은 권리」로 **인정되는가**.
 *
 * ## 두 갈래로 답한다
 *
 * · `qualified`    — 요건을 모두 충족. ⑥(단독) 또는 ⑦(상속 외 권리 1개 동반)로 간다.
 * · `disqualified` — 요건 중 하나가 깨졌다(명시 선언 또는 **날짜**). 그 권리는 「상속받은 것」이 아니라
 *                    **일반 권리**로 취급되어 ③④ 타이밍 판정을 탄다. 일반주택 요건이 날짜로 깨졌거나 날짜를 몰라서
 *                    떨어졌으면 `trace`에 사실을 남겨 최종 결과가 배제일 때 사유·확인 필요로 옮긴다.
 *
 * ## 부정 선언은 `!== true` 규약을 따른다
 *
 * 순위 부적격·공동상속 소수지분·동일세대 등은 **체크박스가 화면에 있으므로** 미체크를 「아님」으로
 * 읽는다 — 주택 축(`transfer-inheritance-exclusion.ts`)이 §155②③에서 쓰는 것과 같은 규약이다.
 */
export function qualifyInheritedRight(
  right: PresaleRight,
  input: Article89Clause2Input,
  newBuildAllowed: boolean,
  trace: Article89Clause2Trace,
): "qualified" | "undetermined" | "disqualified" {
  // ── ⑥ 본문 괄호 ①: 피상속인이 상속개시 당시 **주택**을 소유하지 않았을 것 ──
  //    ⚠️ ⑮·⑫ 선택으로도 **면제되지 않는다**(⑮ 본문이 「주택은 소유하지 않고」를 전제로 건다).
  if (right.decedentOwnedHouseAtDeath === true) return "disqualified";

  // ── ⑥ 본문 괄호 ②: 피상속인이 **다른 종류의 권리**를 소유하지 않았을 것 ──
  //    §156의2⑮ · §156의3⑫ 선택이 이 요건**만** 면제한다.
  const article15Applied = input.inheritedRightChoiceWhenBothHeld === right.type;
  if (right.decedentOwnedOtherRightTypeAtDeath === true && !article15Applied) {
    return "disqualified";
  }

  // ── ⑥1~3호 / §156의3④1~2호 순위 ──
  if (right.isRankingDisqualifiedInheritedRight === true) return "disqualified";

  // ── 공동상속: ⑦3호가목 / ⑤5호가목 — 최대지분 상속인이 소유한 것으로 본다 ──
  if (right.isCoInherited === true && right.isLargestCoInheritedShareholder !== true) {
    return "disqualified";
  }

  // ── ⑥ 단서: 상속개시 당시 상속인·피상속인이 1세대였으면 원칙 배제 ──
  if (
    right.decedentSameHouseholdAtInheritance === true &&
    right.parentalCareMergeInheritedRight !== true
  ) {
    return "disqualified";
  }

  // ── 일반주택 요건: 상속개시일 소급 2년 내 피상속인 증여분이면 배제 ──
  //    OH-12c — 2018-02-13 이후 증여분부터(대통령령 제28637호 부칙 제16조 — ⑥·⑦ 함께 적용).
  if (
    isDecedentGiftExclusionApplicable({
      gifted: input.generalHouseGiftedFromDecedentWithin2yr,
      giftDate: input.generalHouseGiftDate,
    })
  ) {
    return "disqualified";
  }

  // ── 일반주택 요건: 「상속개시 당시 보유한 주택」 — **날짜로 판정**한다 (결정 #8) ──
  //    OH-12b — 2013-02-15 전 취득 일반주택에는 이 한정이 없다(제24356호 부칙 제20조 — §155②·§156의2⑥·⑦에 대한 부칙이고
  //    §156의3은 2021 신설이라 대상이 아니지만, 상속 분양권은 상속개시가 2021 이후라 2013 전 취득 주택은 어차피 보유다).
  //    상속개시일은 **행에 입력한 원값**이다 — 분양권은 `acquisitionDate`(상속개시일), 입주권은 `inheritedDate`.
  //    ⚠️ `presaleRightDefinitionAcquisitionDate`(정의일)를 쓰면 안 된다: 동일세대 상속은 피상속인 취득일로 바뀌어
  //       피상속인 취득일~상속개시일 사이에 산 주택이 「미보유」로 잘못 과세된다.
  const inheritedDate = right.type === "presale_right" ? right.acquisitionDate : right.inheritedDate;
  const held = qualifiesAsInheritanceGeneralHouse({
    generalHouseAcquisitionDate: input.acquisitionDate,
    inheritedDate,
    transferDate: input.transferDate,
    // 신축주택 갈래는 ⑥·④ 모양에서만(⑦·⑤ 후단에는 포함 문구가 없다).
    rightAtInheritance: newBuildAllowed ? input.generalHouseRightAtInheritance : undefined,
  });
  if (held !== "yes") {
    // 모름 = 혜택 불성립 + 확인 필요(2026-10-04 원칙 1). 날짜로 확정된 `no`는 확정 불성립이다.
    trace.rights = { kind: held === "no" ? "after" : "unknown", right, newBuildAllowed, inheritedDate };
    return "disqualified";
  }

  return "qualified";
}
