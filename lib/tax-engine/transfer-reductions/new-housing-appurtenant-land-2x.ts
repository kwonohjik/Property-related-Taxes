/**
 * 조특법 §99①·§99의3① 「딸린 토지 — 해당 건물 연면적의 2배 이내」 (리뷰 NH-22·NH-31 · 계획서 `new-housing-appurtenant-land-2x-nh22-31.plan.md`).
 *
 * **계산은 바꾸지 않는다** — 령 §99①·§99의3②에 2배 초과 토지분을 안분하는 방법이 없고 해석례도 확인하지 못해(계획서 §3.3)
 * 어떤 키를 쓰든 법 근거 없는 불리 적용이 된다(Q-1 b). 판정은 «확정 초과»일 때만 확인 필요 고지로 내보낸다.
 *
 * - 연면적·딸린 토지 면적이 둘 다 양수일 때만 판정한다(한쪽이라도 없으면 «판정 불가» — 고지하지 않는다).
 * - 공동주택(`apartment`)은 판정 단위(대지권 면적 대 전용·공용면적)를 검토하지 않아 판정하지 않는다(계획서 V-2).
 * - 비교는 `round2`(면적 소수 둘째 자리)로 한다.
 */
import { round2 } from "../area-utils";
import { NEW_HOUSING_SUB_ARTICLE } from "../legal-codes/transfer-house";
import { REDUCTION_METADATA } from "./metadata";
import type { TransferReductionId } from "./types";

export const APPURTENANT_LAND_MULTIPLE = 2;

export type AppurtenantLand2xVerdict = "exceeded" | "within" | "unknown";

export interface AppurtenantLand2xFacts {
  houseType?: string;
  grossFloorAreaSqm?: number;
  attachedLandAreaSqm?: number;
}

export function judgeAppurtenantLand2x(f: AppurtenantLand2xFacts): AppurtenantLand2xVerdict {
  if (f.houseType === "apartment") return "unknown";
  const gross = f.grossFloorAreaSqm;
  const land = f.attachedLandAreaSqm;
  if (gross === undefined || land === undefined || !(gross > 0) || !(land > 0)) return "unknown";
  return round2(land) > round2(gross * APPURTENANT_LAND_MULTIPLE) ? "exceeded" : "within";
}

type ReductionLike = { type: string; [key: string]: unknown };
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

/** 적용된 §99의3·§99 선언의 연면적·토지 면적이 2배를 확정적으로 넘으면 확인 필요 고지(계산 불변). 적용 안 됐거나 판정 불가면 undefined. */
export function appurtenantLand2xNotice(
  reductions: ReadonlyArray<{ type: string }> | undefined,
  appliedId: string | undefined,
): string | undefined {
  if (appliedId !== "new_99_3" && appliedId !== "new_99") return undefined;
  const r = (reductions as ReadonlyArray<ReductionLike> | undefined)?.find((x) => x.type === appliedId);
  if (!r) return undefined;
  const sfx = appliedId === "new_99_3" ? "993" : "99";
  const facts: AppurtenantLand2xFacts = {
    houseType: typeof r[`houseType${sfx}`] === "string" ? (r[`houseType${sfx}`] as string) : undefined,
    grossFloorAreaSqm: num(r[`grossFloorAreaSqm${sfx}`]),
    attachedLandAreaSqm: num(r[`attachedLandAreaSqm${sfx}`]),
  };
  if (judgeAppurtenantLand2x(facts) !== "exceeded") return undefined;
  const article = appliedId === "new_99_3" ? NEW_HOUSING_SUB_ARTICLE.NEW_99_3_APPURTENANT_LAND : NEW_HOUSING_SUB_ARTICLE.NEW_99_APPURTENANT_LAND;
  const gross = facts.grossFloorAreaSqm as number;
  return (
    `확인 필요: 딸린 토지 면적 ${facts.attachedLandAreaSqm}㎡가 건물 연면적 ${gross}㎡의 2배(${round2(gross * APPURTENANT_LAND_MULTIPLE)}㎡)를 넘습니다. ` +
    `${article}은 신축주택에 «해당 건물 연면적의 2배 이내»의 딸린 토지를 포함한다고 하므로 초과 토지분은 감면 대상이 아닐 수 있습니다. ` +
    `다만 초과분을 안분하는 방법이 법령에 없어 계산에는 반영하지 않았습니다 — 신고 전 관할 세무서 확인이 필요합니다.`
  );
}

/** 「딸린 토지 — 건물 연면적의 2배」 문언이 있는 조문(법 §99①·§99의3①). 이 둘만 아래 «2배 이내 토지는 주택 카드에 합쳐 입력» 문구가 맞다. */
const APPURTENANT_2X_IDS: ReadonlySet<string> = new Set(["new_99", "new_99_3"]);

/**
 * 5년 이내 **세액감면**으로 주택 카드에 적용되는 주택 감면 — 별도 토지 카드가 있으면 그 카드 세액은 감면에서 빠진다(소득금액 차감형과 같은 구조).
 * §98의4(비거주자 10%)·§97 계열·자경·수용 등은 부수토지 포함 여부를 확인하지 못했거나 토지 대상이라 넣지 않았다.
 */
export const SEPARATE_LAND_TAX_REDUCTION_IDS: ReadonlySet<string> = new Set([
  "new_99", "unsold_98_3", "unsold_98_5", "unsold_98_6", "unsold_98_7", "unsold_99_2",
]);

/**
 * 일괄양도(합산) 경로에서 주택 카드에 감면이 적용됐는데 별도 토지 카드가 함께 있으면, 토지 카드가 감면에서 빠진다는 고지(계산 불변).
 * 별도 토지 카드(`propertyType === "land"`)가 있고 아래 둘 중 하나일 때만 낸다.
 *  - 소득금액 차감형: `incomeDeductionReducibles[i] > 0` — 5년 후 안분(§99의3 · §99 · §98의8 · 하이브리드 5년 후).
 *  - 5년 이내 세액감면: `taxReductionIds[i]`가 있는 카드(`SEPARATE_LAND_TAX_REDUCTION_IDS`) — 2026-11-11 이전에는 고지가 없었다
 *    (실측 §99의2 5년 이내: 한 장 카드 결정세액 0 · 주택+별도 토지 62,681,442, 고지 없음).
 *
 * 문구는 **감면을 낸 조문**에 따라 갈린다(`articleIds` · `taxReductionIds` — 카드와 같은 순서):
 *  - §99·§99의3: 「해당 건물 연면적의 2배 이내」의 딸린 토지를 신축주택에 포함한다는 문언이 근거다(NH-31).
 *  - 그 밖(§98 시리즈·§98의8·§99의2): 그 문언이 없다. 부수토지 포함은 §98의3 해석례(재산세과-861 등)로만 확인했고 ⑧(US-34)이
 *    한 장의 주택 카드로 입력하게 막는다 — 이 고지는 그 확인을 거치지 않은 입력(API 직접 호출 등)에 붙는다.
 * 둘 다 생략하면 종전과 같이 §99 계열 소득금액 차감 문구다.
 */
export function separateLandCardReductionNotice(
  items: ReadonlyArray<{ propertyType?: string }>,
  incomeDeductionReducibles: ReadonlyArray<number>,
  articleIds?: ReadonlyArray<string | undefined>,
  taxReductionIds?: ReadonlyArray<string | undefined>,
): string | undefined {
  if (!items.some((i) => i.propertyType === "land")) return undefined;
  type Mech = "deduction" | "tax";
  const entries: { id: string | undefined; mech: Mech }[] = [];
  incomeDeductionReducibles.forEach((v, i) => {
    if (v > 0) entries.push({ id: articleIds?.[i], mech: "deduction" });
  });
  taxReductionIds?.forEach((id) => {
    if (id !== undefined) entries.push({ id, mech: "tax" });
  });
  if (entries.length === 0) return undefined;

  const labelOf = (id: string) => REDUCTION_METADATA[id as TransferReductionId]?.article ?? id;
  const parts: string[] = [];
  const push = (text: string) => {
    if (!parts.includes(text)) parts.push(text);
  };

  // §99 계열(2배 문언) — 소득금액 차감 문구는 종전 그대로
  if (entries.some((e) => e.mech === "deduction" && (e.id === undefined || APPURTENANT_2X_IDS.has(e.id)))) {
    push(
      "일괄양도에 별도 토지 카드가 있습니다. 주택 카드에 선택한 §99·§99의3 감면은 그 주택 카드의 양도소득금액에서만 차감하고, 별도 토지 카드의 소득은 차감 대상에 넣지 않습니다. " +
        "신축주택에 포함되는 «해당 건물 연면적의 2배 이내»의 딸린 토지는 주택 카드에 합쳐 입력해야 차감 대상에 들어갑니다 " +
        "(별도 카드로 입력한 딸린 토지를 감면 대상에 연결하는 기능은 아직 없습니다 — 확인 필요).",
    );
  }
  if (entries.some((e) => e.mech === "tax" && e.id !== undefined && APPURTENANT_2X_IDS.has(e.id))) {
    push(
      "일괄양도에 별도 토지 카드가 있습니다. 주택 카드에 선택한 §99 5년 이내 세액감면은 그 주택 카드의 산출세액에서만 감면하고, 별도 토지 카드의 세액은 감면 대상에 넣지 않습니다. " +
        "신축주택에 포함되는 «해당 건물 연면적의 2배 이내»의 딸린 토지는 주택 카드에 합쳐 입력해야 감면 대상에 들어갑니다 " +
        "(별도 카드로 입력한 딸린 토지를 감면 대상에 연결하는 기능은 아직 없습니다 — 확인 필요).",
    );
  }
  // 그 밖 조문(2배 문언 없음)
  for (const mech of ["deduction", "tax"] as const) {
    const ids = [...new Set(entries.filter((e) => e.mech === mech && e.id !== undefined && !APPURTENANT_2X_IDS.has(e.id)).map((e) => e.id as string))];
    if (ids.length === 0) continue;
    const what =
      mech === "deduction"
        ? "감면은 그 주택 카드의 양도소득금액에서만 차감하고, 별도 토지 카드의 소득은 차감 대상에 넣지 않았습니다. "
        : "5년 이내 세액감면은 그 주택 카드의 산출세액에서만 감면하고, 별도 토지 카드의 세액은 감면 대상에 넣지 않았습니다. ";
    push(
      `일괄양도에 별도 토지 카드가 있습니다. 주택 카드에 선택한 ${ids.map(labelOf).join("·")} ${what}` +
        "그 토지가 감면주택의 부수토지라면 토지분이 특례에서 빠진 것입니다 — 화면은 주택과 부수토지를 한 장의 주택 카드로 입력하게 막지만(해석례: 재산세과-861 등 §98의3 사건), " +
        "이 입력은 그 확인을 거치지 않았습니다(별도 카드로 입력한 부수토지를 감면 대상에 연결하는 기능은 없습니다 — 확인 필요).",
    );
  }
  return parts.join(" ");
}
