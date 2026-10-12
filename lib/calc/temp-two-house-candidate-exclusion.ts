/**
 * §155① 신규 주택 **후보에서 뺄** 명부 행 id — 조특법 소유주택 제외 행 + §155②③ 상속주택 제외 행 (D1).
 *
 * `resolveTemporaryTwoHouse`는 「양도 주택보다 나중에 취득한 행이 정확히 1채」일 때만 신규 주택을 도출한다.
 * 종전에는 조특법 제외 행(`eligibleCountExcludedHouseIds`)만 뺐다 — §155②③으로 주택 수에서 빠지는 상속주택
 * 행이 후보에 남아 「상속주택 + 일반주택 + 신규주택」 세대(가장 흔한 상속 시나리오)에서 후보가 2채가 되어
 * 일시적 2주택이 도출되지 않았다(서면-2016-부동산-2944 · 재재산-833 — 해석례 평가셋 `E004-era`·`E050-era`). 직접 선언 칸도 없어
 * 두 화면 모두 구제할 길이 없었다.
 *
 * 🔑 상속주택 제외는 **엔진 정본**(`resolveInheritedHouseExclusionFromInput`)을 그대로 부른다 — 게이트(동일세대·
 *    순위·상속개시 당시 보유·증여 괄호·같은 상속)를 여기서 다시 쓰지 않는다. 명부 payload는 route와 같은
 *    빌더(`buildHousesPayload`)로 만들고 날짜만 route(⑭)와 같은 규칙으로 바꾼다.
 * 🔑 `eligibleCountExcludedHouseIds`에 섞지 않는다 — 그 집합의 크기는 다른 화면 문구가 쓴다(조특법 제외 행 수).
 *
 * D3 — §155⑦ 요건을 갖춘 농어촌주택 행도 뺀다(`ruralCountExcludedHouseIds`). 귀농주택은 대개 일반주택보다 **나중에**
 * 취득하므로, 그 행이 후보에 남으면 「농어촌주택 + 일반주택 + 신규주택」에서 후보가 2채가 되어 ⑦·① 중첩
 * (`ruralTemporaryTwoHouseOverlapCountHolds`)이 엔진에 닿지 않는다. 2주택(일반 + 농어촌)이면 ⑦이 직접 성립하므로
 * 후보에서 빼도 결론이 같다. 요건을 못 갖춘 농어촌주택은 보통 주택이라 후보에 남긴다(①의 신규 주택일 수 있다).
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import { qualifiesRuralHouse } from "@/lib/tax-engine/transfer-tax-exemption-holding";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { deriveOneHouseFactsFromHouses, findRuralHouseRow } from "./one-house-row-facts";
import { resolveInheritedHouseExclusionFromInput } from "@/lib/tax-engine/transfer-inheritance-exclusion";
import { resolvePopulationDecline71_2 } from "@/lib/tax-engine/transfer-reductions/population-decline-71-2";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { eligibleCountExcludedHouseIds } from "./house-count-exclusion-rows";
import { housesOwnedAtTransfer } from "./household-house-count";
import { resolveHouseholdHousingCount } from "./household-house-count";
import { buildHousesPayload } from "./transfer-tax-api-houses";
import { primaryAcquisitionDateOf } from "./transfer-tax-api-carryover";
import { buildInheritanceGeneralHousePayload } from "./inheritance-general-house-scope";

type CandidateFormLike = Partial<
  Pick<
    TransferFormData,
    | "houses"
    | "assets"
    | "transferDate"
    | "specialHouseExclusions"
    | "presaleRights"
    | "sellingHouseExclusion"
    | "generalHouseGiftedFromDecedentWithin2yr"
    | "generalHouseGiftDate"
    | "generalHouseRightAtInheritance"
    | "isOneHousehold"
    | "householdHousingCount"
    | "legacyHouseCountPrecedence"
  >
>;

/** §155②③으로 주택 수에서 빠지는 상속주택 명부 행 id(엔진 판정). 양도일·양도 주택 취득일이 없으면 빈 집합. */
export function inheritedCountExcludedHouseIds(form: CandidateFormLike): ReadonlySet<string> {
  const primary = form.assets?.[0];
  const acquisitionDate = toOptionalDate(primaryAcquisitionDateOf(primary));
  const transferDate = toOptionalDate(form.transferDate);
  if (!primary || !acquisitionDate || !transferDate || !(form.houses ?? []).some((h) => h.isInherited)) {
    return new Set();
  }
  const payload = buildHousesPayload(
    primary,
    form.houses ?? [],
    form.presaleRights?.length ?? 0,
    form.sellingHouseExclusion,
    form.transferDate,
  ) as Array<Record<string, unknown>> | undefined;
  if (!payload) return new Set();
  const houses = payload.map((h) => ({
    ...h,
    acquisitionDate: toOptionalDate(h.acquisitionDate as string | undefined),
    inheritedDate: toOptionalDate(h.inheritedDate as string | undefined),
  })) as unknown as HouseInfo[];
  const general = buildInheritanceGeneralHousePayload({
    houses: form.houses ?? [],
    assets: form.assets ?? [],
    transferDate: form.transferDate ?? "",
    generalHouseGiftedFromDecedentWithin2yr: form.generalHouseGiftedFromDecedentWithin2yr,
    generalHouseGiftDate: form.generalHouseGiftDate,
    generalHouseRightAtInheritance: form.generalHouseRightAtInheritance,
  } as Parameters<typeof buildInheritanceGeneralHousePayload>[0]);
  const r = resolveInheritedHouseExclusionFromInput({
    houses,
    sellingHouseId: "selling", // route와 같은 양도 행 id(`transfer-tax-api.ts`·`one-house-exemption-api.ts`)
    generalHouseGiftedFromDecedentWithin2yr: form.generalHouseGiftedFromDecedentWithin2yr === true,
    generalHouseGiftDate: toOptionalDate(general.generalHouseGiftDate),
    generalHouseRightAtInheritance: general.generalHouseRightAtInheritance,
    acquisitionDate,
    transferDate,
  });
  return new Set(r.excludedHouses.map((e) => e.houseId));
}

/**
 * §155⑦ 요건을 갖춘 농어촌주택 명부 행 id(엔진 판정 — 신규 주택을 뺀 2주택 기준). 양도일이 없거나 요건 미달이면 빈 집합.
 * 엔진에 실리는 것과 같은 행·같은 payload다(`findRuralHouseRow` · `deriveOneHouseFactsFromHouses`).
 */
export function ruralCountExcludedHouseIds(form: CandidateFormLike): ReadonlySet<string> {
  // 양도일 현재 보유 행만 — ④가 싣는 행·payload와 같다(`deriveOneHouseFactsFromHouses`의 `transferDate`).
  const owned = housesOwnedAtTransfer(form.houses, form.transferDate, form.assets?.[0]?.assetKind);
  const ruralRow = findRuralHouseRow(owned);
  const row = owned.find((h) => h === ruralRow); // 같은 객체 — id가 있는 명부 행 타입으로 되찾는다
  const rural = deriveOneHouseFactsFromHouses(owned).ruralHouse;
  const transferDate = toOptionalDate(form.transferDate);
  if (!row?.id || !rural || !transferDate) return new Set();
  const qualifies = qualifiesRuralHouse({
    householdHousingCount: 2,
    transferDate,
    ruralHouse: { ...rural, acquisitionDate: toOptionalDate(rural.acquisitionDate) } as TransferTaxInput["ruralHouse"],
  });
  return qualifies ? new Set([row.id]) : new Set();
}

/**
 * 비과세 판정의 **주택 수에서 빠지는** 명부 행 id — 조특법 소유주택 제외(§99의4·§98의9·보유 감면주택) ∪ §155②③ 상속주택.
 *
 * 엔진 `resolveExemptionHouseCountExclusions`가 `householdHousingCount`에서 빼는 두 갈래(`hceApplied`·
 * `specialHouseExclusionDetail` · `inheritedExclusion`)의 행이다. §154① 단서 게이트(`provisoGate`)·일시적 2주택 후보·
 * 「제외 후 주택 수」(`resolveExemptionHousingCount`)가 **이 한 함수**를 읽는다(재검증 S03-4).
 */
export function exemptionCountExcludedHouseIds(form: CandidateFormLike): ReadonlySet<string> {
  const ids = new Set(eligibleCountExcludedHouseIds(form));
  for (const id of inheritedCountExcludedHouseIds(form)) ids.add(id);
  for (const id of popDeclineCountExcludedHouseIds(form, ids)) ids.add(id);
  return ids;
}

/**
 * 조특법 §71의2① 인구감소지역주택으로 주택 수에서 빠지는 명부 행 id(엔진 판정 · 결정 #42) — 엔진 `resolveExemptionHouseCountExclusions`가 보는 것과
 * 같은 평가기(`resolvePopulationDecline71_2`)에 같은 명부 payload를 넘긴다. 이 행이 §155① 신규 주택 후보에 남으면 일시적 2주택 도출·⑧ 취득 경위 요구가
 * 엉뚱한 행으로 간다. 양도일·양도 주택 취득일이 없으면 빈 집합.
 *
 * @param alreadyExcluded 다른 제외(조특법 선언·§99의4·§98의9·§155②③)로 이미 빠진 행 — 같은 행을 두 번 빼지 않고 겹침 판정에 쓴다.
 *
 * 🔑 평가기 입력은 엔진 STEP 0.9(`resolveExemptionHouseCountExclusions`)와 같게 둔다 — 1세대가 아니면 평가하지 않고,
 *    세대 주택 수는 ④가 싣는 값(`resolveHouseholdHousingCount` — OH-34 레거시 스칼라 포함)이다. 종전에는 명부 행 수를 세어
 *    1세대가 아닌 세대·레거시 스칼라 이력에서 엔진이 빼지 않는 행을 여기서만 뺐다(대조 anchor
 *    `temp-two-house-candidate-exclusion-pop-decline-parity`).
 */
export function popDeclineCountExcludedHouseIds(
  form: CandidateFormLike,
  alreadyExcluded: ReadonlySet<string>,
): ReadonlySet<string> {
  const primary = form.assets?.[0];
  const transferDate = toOptionalDate(form.transferDate);
  if (form.isOneHousehold === false) return new Set(); // 엔진 `effectiveInput.isOneHousehold &&`
  if (!primary || !transferDate || !(form.houses ?? []).length) return new Set();
  const payload = buildHousesPayload(
    primary,
    form.houses ?? [],
    form.presaleRights?.length ?? 0,
    form.sellingHouseExclusion,
    form.transferDate,
  ) as Array<Record<string, unknown>> | undefined;
  if (!payload) return new Set();
  const houses = payload.map((h) => ({
    ...h,
    acquisitionDate: toOptionalDate(h.acquisitionDate as string | undefined),
    popDeclPriorRightDate: toOptionalDate(h.popDeclPriorRightDate as string | undefined),
  })) as unknown as HouseInfo[];
  if (houses.some((h) => !h.acquisitionDate)) return new Set();
  const sellingIsHousing = primary.assetKind !== "right_to_move_in";
  const r = resolvePopulationDecline71_2({
    houses,
    sellingHouseId: "selling", // route와 같은 양도 행 id
    transferDate,
    presaleRights: (form.presaleRights ?? []).flatMap((p) => {
      const d = toOptionalDate(p.acquisitionDate);
      return d ? [{ acquisitionDate: d, regionCode: p.regionCode }] : [];
    }),
    alreadyExcludedIds: alreadyExcluded,
    otherExcludedCount: alreadyExcluded.size,
    // ④ `householdHousingCount`와 같은 leaf·같은 파싱(`transfer-tax-api.ts`) — 엔진은 그 값을 받는다.
    householdHousingCount: resolveHouseholdHousingCount({
      primaryKind: primary.assetKind,
      declared: parseInt(form.householdHousingCount ?? "") || 0,
      houses: form.houses,
      transferDate: form.transferDate,
      legacyPrecedence: form.legacyHouseCountPrecedence ?? false,
    }),
    sellingIsHousing,
  });
  return new Set(r.entries.filter((e) => e.eligible && e.houseId).map((e) => e.houseId as string));
}

/**
 * 「소득세법 시행령」 제155조제20항(장기임대주택 보유자의 거주주택 특례) **시나리오 A를 선언했을 때** 명부의
 * 「장기임대」 행 id — 「나중 취득 행」이 2채 이상이라 모호할 때 §155① 신규 주택 후보에서 뺀다 (S06-1).
 *
 * 영 §155⑳은 「장기임대주택과 그 밖의 1주택」을 소유한 1세대가 거주주택을 양도하는 경우를 규율하며 **임대주택을
 * 거주주택보다 먼저 취득해야 한다는 요건이 없다**(MST 286211 본문). 그런데 임대주택이 거주주택보다 **나중에** 취득이면
 * 「나중 취득 행이 정확히 1채」가 임대주택 + 신규 주택 2채로 깨져 §155①이 도출되지 않았다 — 임대주택 취득일 하나가
 * ⑳+① 중첩 성립 여부를 갈랐다(거주주택 앞이면 성립). 서면-2019-부동산-1303 · 사전-2025-법규재산-0993은 ⑳+① 중첩을 인정했다.
 *
 * 🔑 ⑳ 시나리오 A를 **선언한 경우에만** 뺀다(D1 상속·D3 농어촌과 같은 형제 패턴) — 선언하지 않은 세대의 「장기임대」 표식 행은
 *    다른 판정(중과 주택 수)이 쓰는 값일 뿐 §155① 후보 판단을 바꾸지 않는다.
 * 🔑 `temporaryTwoHouseCandidateExcludedIds`에 **섞지 않는다** — 임대주택이 유일한 나중 취득 행이면 그 행이 신규 주택으로 도출되는
 *    종전 동작을 지킨다(구 §167의10①8호 「3년 안에 임대주택을 취득한 세대」가 그 도출을 쓴다 — `rental-residence-155-20-e14gh` OE-2).
 *    그래서 `resolveTemporaryTwoHouse`가 별도 인자(`rentalResidenceHouseIds`)로 받아 후보가 모호할 때만 다시 센다.
 */
export function rentalResidenceCandidateHouseIds(form: CandidateFormLike): ReadonlySet<string> {
  const rhe = form.assets?.[0]?.rentalHousingException;
  if (rhe?.applyException !== true || rhe.scenario !== "A") return new Set();
  const ids = new Set<string>();
  for (const h of housesOwnedAtTransfer(form.houses, form.transferDate, form.assets?.[0]?.assetKind)) {
    if (h.isLongTermRental && h.id) ids.add(h.id);
  }
  return ids;
}

/** §155① 신규 주택 후보에서 뺄 행 — 주택 수 제외 행 ∪ ⑦ 농어촌주택. `resolveTemporaryTwoHouse`의 `excludedHouseIds`. */
export function temporaryTwoHouseCandidateExcludedIds(form: CandidateFormLike): ReadonlySet<string> {
  const ids = new Set(exemptionCountExcludedHouseIds(form));
  for (const id of ruralCountExcludedHouseIds(form)) ids.add(id);
  return ids;
}
