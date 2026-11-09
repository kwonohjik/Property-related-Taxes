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

/**
 * 일괄양도(합산) 경로에서 주택 카드에 §99의3·§99가 적용됐는데 별도 토지 카드가 함께 있으면, 토지 카드 소득이 차감 대상에서 빠진다는 고지.
 * `incomeDeductionReducible > 0`인 카드가 있고 `propertyType === "land"` 카드가 있을 때만(계산 불변).
 */
export function separateLandCardReductionNotice(
  items: ReadonlyArray<{ propertyType?: string }>,
  incomeDeductionReducibles: ReadonlyArray<number>,
): string | undefined {
  const hasLandCard = items.some((i) => i.propertyType === "land");
  const hasReducedCard = incomeDeductionReducibles.some((v) => v > 0);
  if (!hasLandCard || !hasReducedCard) return undefined;
  return (
    "일괄양도에 별도 토지 카드가 있습니다. 주택 카드에 선택한 §99·§99의3 감면은 그 주택 카드의 양도소득금액에서만 차감하고, 별도 토지 카드의 소득은 차감 대상에 넣지 않습니다. " +
    "신축주택에 포함되는 «해당 건물 연면적의 2배 이내»의 딸린 토지는 주택 카드에 합쳐 입력해야 차감 대상에 들어갑니다 " +
    "(별도 카드로 입력한 딸린 토지를 감면 대상에 연결하는 기능은 아직 없습니다 — 확인 필요)."
  );
}
