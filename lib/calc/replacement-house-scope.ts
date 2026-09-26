/**
 * §156의2⑤ 대체주택 특례가 **성립할 수 있는 세대 구성인가** — 판정 메뉴·계산기 공용 술어 (OH-05).
 *
 * 「소득세법 시행령」 §156의2⑤ 「국내에 1주택을 소유한 1세대가 그 주택에 대한 재개발사업 …
 * 시행기간 동안 거주하기 위하여 다른 주택(대체주택)을 취득한 경우로서 … 3. 관리처분계획등에 따라
 * 취득하는 주택이 **완성되기 전** 또는 완성된 후 3년 이내에 대체주택을 양도할 것」.
 * 완성 전 양도의 기본 사례는 **대체주택 1채 + 조합원입주권 1개**(종전주택이 입주권이 됐다)이고,
 * 완성 후 양도·관리처분 전은 **2주택**이다.
 *
 * ⇒ 열리는 조건: **2주택 이상**이거나, 양도 대상이 주택이고 **조합원입주권을 1개 이상 보유**.
 *    분양권은 §156의3 축이라 세지 않는다.
 *
 * 🔴 엔진의 대체주택 분기(`checkExemption`)는 주택 수·입주권 보유를 보지 않는다. 그래서 이 조건
 *    밖에서 남은 토글을 보내면 입주권 없는 1주택 세대가 보유기간과 무관하게 비과세가 된다.
 *    판정 메뉴(⑤·④·⑧)와 계산기(④)가 **같은 술어**를 쓰도록 인자만 화면별로 채운다
 *    (`feedback_shared_predicate_argument_parity`).
 */
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { resolveHouseholdHousingCount } from "./household-house-count";

export function replacementHouseApplies(args: {
  /** §89①3호 주택 수 — 양도 대상이 주택이면 그것을 포함한다. */
  houseCount: number;
  saleIsHousing: boolean;
  holdsRedevelopmentRight: boolean;
}): boolean {
  if (args.houseCount >= 2) return true;
  return args.saleIsHousing && args.holdsRedevelopmentRight;
}

/**
 * 계산기 폼 → 같은 술어. 주택 수는 계산기 ④·⑧의 정본(`resolveHouseholdHousingCount`)을 쓴다 —
 * 판정 메뉴에서 넘겨받은 폼은 그 값이 명부 파생값으로 확정돼 오므로 두 화면의 답이 같다.
 */
export function calcReplacementHouseApplies(form: TransferFormData): boolean {
  const primary = form.assets?.[0];
  return replacementHouseApplies({
    houseCount: resolveHouseholdHousingCount({
      primaryKind: primary?.assetKind,
      declared: parseInt(form.householdHousingCount || "1", 10) || 0,
      houses: form.houses,
      legacyPrecedence: form.legacyHouseCountPrecedence ?? false,
    }),
    saleIsHousing: primary?.assetKind === "housing",
    holdsRedevelopmentRight: (form.presaleRights ?? []).some((r) => r.type === "redevelopment_right"),
  });
}
