/**
 * 1세대1주택 판정 — **주택 수 산정 명세** (P4-2a · G-1)
 *
 * 계획서 `docs/00-pm/one-house-exemption-automation.plan.md` G-1 · D-3 ·
 * 엔진 설계 「4. 주택 수 산정」.
 *
 * ## G-1 — 무엇이 이중 트랙이었나
 *
 * 계산기는 주택 수를 **두 경로**로 안다:
 *   ① `householdHousingCount` 스칼라(사용자가 「1 / 2 / 3+」 버튼으로 선언)
 *   ④ `houses[]` 명부(**다른** 보유 주택 목록 — 양도 대상은 빠져 있다)
 * 둘이 어긋나도 **경고만** 띄운다(`house-count-divergence.ts`).
 *
 * 판정 메뉴(P4)는 **명부를 정본**으로 삼는다(D-3). 그래서 스칼라를 받지 않고 여기서 도출한다.
 *
 * ## 🔴 명부에는 양도 대상이 없다 — 실측
 *
 * UI 명부(`HouseEntry[]`)는 「다른 보유 주택」이고, 양도 대상은 **API 변환 층이**
 * `id: "selling"` 행으로 앞에 붙인다(`lib/calc/transfer-tax-api-houses.ts:29`).
 * 그래서 세대 주택 수는 **`1 + 명부 행 수`** 이며, 같은 식을 `house-count-divergence.ts:53`이
 * 이미 `structuralCount`로 쓰고 있다(표시 전용). 이 파일은 그 식을 **판정의 정본**으로 승격한다.
 *
 * ## 🔑 제외는 다시 구현하지 않는다
 *
 * §99의4·§98의9·보유 감면주택·§155②③ 상속 제외는 `runHouseCountExclusionStep`
 * (`transfer-tax-house-exclusion-step.ts`)이 이미 판정 **직전**에 계산한다. 여기서는 그 결과를
 * **화면이 읽을 형태로 옮기기만** 한다 — 제외 규칙을 두 벌 만들면 계산기와 판정 메뉴의
 * 주택 수가 조용히 갈린다.
 */
import { INHERITED_HOUSE } from "../legal-codes";
import type { HouseInfo } from "../types/multi-house-surcharge.types";
import type { InheritedHouseExclusionResult } from "../transfer-inheritance-exclusion";
import type { SpecialHouseExclusionResolution } from "../transfer-reductions/unsold-hybrid-p5";
import type { HouseCountExclusionResolution } from "../transfer-reductions/unsold-98-9";

/** 비과세 판정 주택 수에서 빠진 주택 1건 — 판정 메뉴 「주택 수 산정」 한 줄. */
export type OneHouseCountExclusion = {
  /** 명부에서 특정된 경우의 행 id. 조문 기반 제외(§99의4 등)는 행을 특정하지 않아 생략된다. */
  houseId?: string;
  /** 사람이 읽는 제외 사유 */
  label: string;
  /** 근거 조문 — `legal-codes` 상수값 */
  legalBasis: string;
};

/**
 * 주택 수 산정 결과.
 *
 * ⚠️ 이 타입은 **판정 메뉴 응답 전용**이고 `OneHouseJudgment`에 담지 않는다.
 *    제외를 계산하는 `runHouseCountExclusionStep`이 판정 **바깥**(`transfer-tax.ts` STEP 0.9)에서
 *    돌기 때문이다. 판정 안으로 옮기려면 호출 순서를 바꿔야 하고 그건 **세액 회귀 위험**이다
 *    (계획서 §17.7). 판정 메뉴는 route에서 조립해 응답에 함께 싣는다.
 */
export type OneHouseCountBreakdown = {
  /** 세대 보유 주택 수 — **양도 대상 포함** */
  total: number;
  /** §89①3호 판정에 쓰는 유효 주택 수 = `total` − 제외 */
  countedForExemption: number;
  excluded: OneHouseCountExclusion[];
};

/**
 * 명부 → 세대 보유 주택 수 (**정본**, G-1).
 *
 * @param engineHouses `buildTransferEngineInput`이 만든 엔진 형태의 `houses[]`
 *   (`id: "selling"` 행이 이미 앞에 붙어 있다). 명부가 비고 권리도 없으면 `undefined`가 오며,
 *   그때 세대는 **양도 대상 1채**뿐이다.
 *
 * 🔑 분양권·조합원입주권은 더하지 않는다 — §89①3호의 「주택 수」가 아니라 §89②의 별개 축이고,
 *    `house-count-divergence.ts:53`도 같은 이유로 주택 행만 센다(F7).
 *
 * 🔴 **양도 대상이 주택이 아니면 1을 더하지 않는다**(P4-3b). 조합원입주권을 양도하는 세대는
 *    §89①4호 가목이 「다른 주택을 보유하지 아니할 것」 = **0채**를 요구하는데, `selling` 행을
 *    주택으로 세면 명부가 비어도 1채가 되어 가목이 **절대 성립하지 않는다**.
 *    `buildHousesPayload`는 입주권 양도에도 `selling` 행을 붙이므로(중과 축에서 필요하다)
 *    여기서 그 행을 빼고 센다.
 */
export function deriveHouseholdHousingCount(
  engineHouses: HouseInfo[] | undefined,
  /** 양도 대상이 §89①3호의 「주택」인가. 기본값 `true` — 넘기지 않으면 종전 동작 그대로다. */
  sellingIsHousing = true,
): number {
  if (!engineHouses || engineHouses.length === 0) return sellingIsHousing ? 1 : 0;
  if (sellingIsHousing) return engineHouses.length;
  return engineHouses.filter((h) => h.id !== SELLING_HOUSE_ID).length;
}

/** `buildHousesPayload`가 양도 대상 행에 붙이는 고정 id. */
export const SELLING_HOUSE_ID = "selling";

/**
 * 명부 → 세대 보유 **조합원입주권 수** (§89①4호 본문 「조합원입주권을 1개 보유한 1세대」).
 *
 * 🔑 **양도하는 입주권 자체를 포함**한다 — 계산기 위젯의 안내문과 같은 규약이다
 *    (`Step4.tsx:470` 「양도하는 입주권 자체도 포함하여」).
 * 🔑 분양권(`presale_right`)은 세지 않는다. 그 보유 여부는 가·나목이 **따로** 묻는 축이고
 *    `householdHoldsPresaleRight`가 본다 — 여기 합치면 두 요건이 한 숫자로 뭉개진다.
 */
export function deriveHouseholdRightCount(
  presaleRights: { type: "presale_right" | "redevelopment_right" }[] | undefined,
  /** 양도 대상이 조합원입주권인가. */
  sellingIsRedevelopmentRight: boolean,
): number {
  const listed = (presaleRights ?? []).filter((r) => r.type === "redevelopment_right").length;
  return listed + (sellingIsRedevelopmentRight ? 1 : 0);
}

/**
 * 제외 결과 3종 → 화면이 읽을 명세.
 *
 * 인자는 전부 `runHouseCountExclusionStep`이 이미 만든 값이다(재계산 금지 —
 * `feedback_aggregate_display_rederives_engine_value`).
 */
export function buildOneHouseCountBreakdown(p: {
  total: number;
  /** §99의4 농어촌·고향주택 / §98의9 준공후미분양 */
  houseCountExclusion: HouseCountExclusionResolution;
  /** 보유 감면주택 7조문 */
  specialHouseExclusion: SpecialHouseExclusionResolution;
  /** §155②③ 상속·공동상속 */
  inheritedExclusion: InheritedHouseExclusionResult;
}): OneHouseCountBreakdown {
  const excluded: OneHouseCountExclusion[] = [];

  // §99의4 · §98의9 — 조문 단위 제외(각 1채). 어느 명부 행인지는 특정되지 않는다.
  for (const applied of p.houseCountExclusion.appliedList) {
    excluded.push({
      label:
        applied.id === "unsold_98_9"
          ? "준공후미분양주택 — 소유주택으로 보지 않음"
          : "농어촌주택등 — 소유주택으로 보지 않음",
      legalBasis: applied.legalBasis,
    });
  }

  // 보유 감면주택 — 엔트리 단위로 라벨·근거가 이미 있다.
  for (const entry of p.specialHouseExclusion.entries) {
    if (!entry.eligible) continue;
    excluded.push({ label: `${entry.articleLabel} — 주택 수 제외`, legalBasis: entry.legalBasis });
  }

  // §155②③ 상속 — **행을 특정할 수 있는 유일한 축**이다.
  for (const h of p.inheritedExclusion.excludedHouses) {
    excluded.push({
      houseId: h.houseId,
      label: h.basis === "sole" ? "상속주택 — 주택 수 제외" : "공동상속주택(소수지분) — 주택 수 제외",
      legalBasis:
        h.basis === "sole"
          ? INHERITED_HOUSE.EXEMPTION_SOLE_BASIS
          : INHERITED_HOUSE.EXEMPTION_CO_INHERITED_BASIS,
    });
  }

  return {
    total: p.total,
    // 음수 방지는 `runHouseCountExclusionStep`과 같은 규약(`Math.max(… , 0)`).
    countedForExemption: Math.max(p.total - excluded.length, 0),
    excluded,
  };
}
