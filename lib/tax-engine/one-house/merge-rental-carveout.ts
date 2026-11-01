/**
 * §155④⑤ 합가 × §155⑳ 장기임대 — 임대주택이 **합가 상대 쪽**에 있을 때 양도자 쪽 주택 (`docs/00-pm/parental-merge-rental-155-20.plan.md`)
 *
 * 기준-2024-법규재산-0061(법규과-2152, 2026.8.20.): 1주택 자녀가 장기임대주택 1개와 2년 이상 거주한 거주주택을 보유한 60세 이상 부친을
 * 동거봉양하려 합가하고 합가일부터 10년 이내 **자녀 소유 주택**을 양도하면 「제155조제20항제1호의 거주요건을 적용받지 않는 것」.
 * ⇒ ⑳ 경로에서 거주만 끄지 않는다. ⑳ A는 표2를 무조건 적용하고 §154① 조정 거주를 보지 않아 강남·거주 0이 비과세로 뒤집힌다.
 *    임대 행만 주택 수에서 빼고 §155④⑤ 의제(E-3.5)로 보낸다 — §154①·12억 안분·표2·중과 배제가 그 경로를 따른다.
 *
 * 경계(원문 확인): 양쪽 각자 거주주택+임대 불가(서면-2024-법규재산-2203) · 임대 5호+1주택 불가(사전-2024-법규재산-0598) ·
 * 시어머니 쪽 9채 불가(서울행정법원 2020구단76589) ⇒ 임대 1채만 연다(사용자 결정 2026-11-01 Q-1 (a)).
 * 혼인(⑤)은 정면 회신이 없지만 ④와 같은 문형이고 상속증여세과-21이 일반론을 밝혀 함께 열고 고지한다(Q-2 (b)).
 * ⑳ 생애 한 차례·임대 말소 후 기한은 보지 않는다 — 거주주택 특례가 아니라 합가 의제로 서는 경로다(사용자 결정 2026-11-01).
 *
 * 🔑 ⑳2호 임대 호별 요건만 빌린다(`failReasons`). 거주 사유(`residenceFailReasons`)는 보지 않는다.
 * 🔑 상대 쪽 주택의 2년 거주는 0061의 사실이라 3-state 문항으로 받는다 — 미선택은 불성립(Q-5 (a)).
 */
import { TRANSFER } from "../legal-codes/transfer";
import { CLAUSE_13_SURCHARGE_EXCLUSION_EFFECTIVE_DATE, MULTI_HOUSE, TRANSFER_RENTAL_HOUSING } from "../legal-codes";
import type { OneHouseSpecialRulesData } from "../schemas/rate-table.schema";
import { resolveExemptionHouseCountExclusions } from "../transfer-tax-house-exclusion-step";
import { judgeRentalHousingEligibility } from "../transfer-tax-rental-housing-judge";
import { meetsOneHouseHoldingResidence } from "../transfer-tax-exemption-requirements";
import type { TransferTaxInput } from "../types/transfer.types";
import { classifyMergeHouse } from "./merge-composition";
import { resolveMergeDeeming } from "./merge-deeming";
import { translateRedevAptForHousingJudgment } from "./redev-apt-judgment-input";

export const MERGE_RENTAL_CARVEOUT_RULING = "기준-2024-법규재산-0061";
/** 판정 메뉴 확인 사항 id */
export const MERGE_RENTAL_CARVEOUT_NOTICE_ID = "155-20-merge-rental-carveout";

type RosterRow = { id: string; acquisitionDate: Date; isLongTermRental: boolean; mergeOrigin?: "seller_side" | "counterpart_side" };

/**
 * 합가 전 구성이 「양도자 쪽 = 양도 주택뿐 · 상대 쪽 = 그 밖의 1주택 + 임대 1채」인가 — 엔진·⑧이 같은 술어를 쓴다.
 * 임대가 명부 밖이면(판정 메뉴) `unitOrigin`으로 본다.
 */
export function mergeRentalRosterHolds(
  others: readonly RosterRow[],
  mergeDate: Date,
  unitOrigin: string | undefined,
): { holds: boolean; rentalRowId?: string } {
  const rentals = others.filter((h) => h.isLongTermRental);
  const rest = others.filter((h) => !h.isLongTermRental);
  if (rest.length !== 1 || rentals.length > 1) return { holds: false };
  if (classifyMergeHouse(rest[0].acquisitionDate, mergeDate, rest[0].mergeOrigin) !== "counterpart_side") return { holds: false };
  if (rentals.length === 1) {
    return classifyMergeHouse(rentals[0].acquisitionDate, mergeDate, rentals[0].mergeOrigin) === "counterpart_side"
      ? { holds: true, rentalRowId: rentals[0].id }
      : { holds: false };
  }
  return { holds: unitOrigin === "counterpart_side" };
}

/** 합가 축 하나 — 이중 합가는 이 경로가 아니다. */
function singleMergeDate(input: TransferTaxInput): Date | undefined {
  const m = input.marriageMerge?.marriageDate;
  const p = input.parentalCareMerge?.mergeDate;
  return m && p ? undefined : (m ?? p);
}

function rosterOf(input: TransferTaxInput, mergeDate: Date) {
  const others = (input.houses ?? []).filter((h) => h.id !== input.sellingHouseId) as unknown as RosterRow[];
  return mergeRentalRosterHolds(others, mergeDate, input.rentalHousingException?.rentalUnits?.[0]?.mergeOrigin);
}

function deemsWithoutRental(input: TransferTaxInput, rentalRowId: string | undefined): boolean {
  return (
    resolveMergeDeeming({
      ...input,
      householdHousingCount: 2,
      knownHouseExclusionCount: rentalRowId ? 1 : 0,
      knownHouseExclusionHouseIds: rentalRowId ? [rentalRowId] : [],
    }) !== undefined
  );
}

/** 임대 행을 빼면 §155④⑤가 서는 양도인가 — 임대 요건·상대 쪽 거주 문항은 빼고 본다. */
function structureHolds(raw: TransferTaxInput): { rentalRowId?: string } | undefined {
  // 완공APT도 §154①의 주택이다(판정 번역). 청산금 수령 단독신고는 신축주택을 양도하지 않고 ⑳도 받지 않는다(`judgeRedevAptOneHouseExemption`).
  if (raw.redevelopment?.settlementDirection === "receive" && raw.redevelopment.receiveOnlyMode === true) return undefined;
  const input = translateRedevAptForHousingJudgment(raw);
  if (input.propertyType !== "housing" || !input.isOneHousehold || input.isUnregistered || !input.sellingHouseId) return undefined;
  const mergeDate = singleMergeDate(input);
  if (!mergeDate) return undefined;
  const roster = rosterOf(input, mergeDate);
  if (!roster.holds) return undefined;
  if (input.householdHousingCount !== (roster.rentalRowId ? 3 : 2)) return undefined;
  const ex = resolveExemptionHouseCountExclusions(raw, raw.acquisitionDate); // 주택 수 제외는 번역 전 원본을 본다(`redev-apt-judgment-input.ts`)
  if (ex.specialActExcludedCount + ex.inheritedExclusion.excludedCount > 0) return undefined; // 3중첩 불허(서면-2022-법규재산-4283)
  return deemsWithoutRental(input, roster.rentalRowId) ? { rentalRowId: roster.rentalRowId } : undefined;
}

/**
 * 성립하면 ⑳ 선언을 걷고 표식을 단 입력을 돌려준다 — 이후 STEP 2.5·불성립 되돌림·회수가 돌지 않고 E-3.5가 판정한다.
 * 계산기 진입과 판정 메뉴 파이프라인이 함께 부른다. 불성립이면 입력 그대로(동일 참조).
 */
export function withMergeRentalCarveout(input: TransferTaxInput): TransferTaxInput {
  const rhe = input.rentalHousingException;
  if (rhe?.applyException !== true || rhe.scenario !== "A" || rhe.rentalUnits.length !== 1) return input;
  if (rhe.counterpartHouseResidedTwoYears !== true) return input;
  const structure = structureHolds(input);
  if (!structure) return input;
  const eligibility = judgeRentalHousingEligibility(translateRedevAptForHousingJudgment(input));
  if (!eligibility || eligibility.failReasons.length > 0) return input;
  return { ...input, rentalHousingException: undefined, mergeRentalCarveout: structure };
}

/** 적용 고지 — 무엇을 빼고 무엇에 기댔는지. */
export function mergeRentalCarveoutNotice(input: Pick<TransferTaxInput, "marriageMerge">): string {
  const base = input.marriageMerge ? TRANSFER.MARRIAGE_MERGE_EXEMPT : TRANSFER.PARENTAL_CARE_MERGE_EXEMPT;
  const head =
    `합가 상대 쪽 장기임대주택 1채를 ${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20}에 따라 주택 수에서 빼고 ${base}를 적용했습니다 — ` +
    `상대 쪽 주택은 2년 이상 거주한 거주주택이라는 입력을 전제로, 양도 주택에는 같은 항 1호의 거주 2년을 적용하지 않습니다(${MERGE_RENTAL_CARVEOUT_RULING}). ` +
    "「소득세법 시행령」 §154① 보유·거주 요건은 그대로 봅니다.";
  return input.marriageMerge
    ? `${head} 혼인 합가에서 임대주택이 없는 쪽 주택을 먼저 양도한 정면 회신은 확인하지 못해 동거봉양 회신과 문형이 같다고 보았습니다 — 확인 필요.`
    : head;
}

/**
 * 중과 고지 — 이 경로에서 중과세율이 걸렸을 때만 낸다. 임대를 빼는 것은 비과세 판정 주택 수뿐이고, 중과 주택 수는 영 §167의3① 본문대로 따로 센다
 * (수에서 빼는 것은 1호·12호뿐 — 서울행정법원 2020구단76589). 양도 주택이 §154① 요건을 못 갖추면 배제 호(§167의3①13호 · §167의10①15호)도 받지 못한다.
 */
export function mergeRentalCarveoutSurchargeNotice(
  input: Pick<TransferTaxInput, "marriageMerge" | "transferDate">,
  surchargeHouseCount: number,
  meetsOneHouseRequirements: boolean,
): string {
  const head =
    `합가 특례(${MERGE_RENTAL_CARVEOUT_RULING})에서 장기임대주택 1채를 뺀 것은 비과세 판정의 주택 수입니다. ` +
    `중과 판정의 주택 수는 따로 세어 ${surchargeHouseCount}주택으로 보고 중과세율을 적용했습니다`;
  const clause =
    surchargeHouseCount < 3
      ? input.marriageMerge ? MULTI_HOUSE.MARRIAGE_MERGE_2HOUSE_BASIS : MULTI_HOUSE.PARENTAL_CARE_MERGE_2HOUSE_BASIS
      : input.transferDate >= CLAUSE_13_SURCHARGE_EXCLUSION_EFFECTIVE_DATE ? MULTI_HOUSE.MERGE_3HOUSE_OVERLAP_BASIS : undefined;
  return !meetsOneHouseRequirements && clause
    ? `${head} — 양도 주택이 「소득세법 시행령」 §154① 요건을 충족하지 못해 ${clause}의 중과 배제를 받지 못합니다.`
    : `${head}.`;
}

/**
 * 미적용 고지 — 사실 입력만 있으면 이 경로로 결론이 바뀔 때만 낸다(Q-3 (a)).
 * ⑳을 선언하지 않았으면 임대 요건을 볼 입력이 없고, 선언했어도 상대 쪽 거주 문항이 「예」가 아니면 성립하지 않는다.
 */
export function mergeRentalCarveoutMissingNotice(
  input: TransferTaxInput,
  rule: OneHouseSpecialRulesData["one_house_exemption"],
): string | undefined {
  if (input.mergeRentalCarveout) return undefined;
  const rhe = input.rentalHousingException;
  if (rhe?.applyException && (rhe.scenario !== "A" || rhe.counterpartHouseResidedTwoYears !== undefined)) return undefined;
  if (!structureHolds(input) || !meetsOneHouseHoldingResidence(translateRedevAptForHousingJudgment(input), rule)) return undefined;
  const ask = rhe?.applyException
    ? "상대 쪽 주택에 2년 이상 거주했는지 답하세요"
    : `장기임대주택 특례(${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20})를 선언해 임대 요건을 입력하세요`;
  return `합가 상대 쪽 장기임대주택 1채가 요건을 갖추면 주택 수에서 빼고 합가 특례를 적용할 수 있습니다(${MERGE_RENTAL_CARVEOUT_RULING}) — ${ask}. 입력이 없어 판정하지 않았습니다.`;
}
