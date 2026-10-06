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
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import { resolveInheritedHouseExclusionFromInput } from "@/lib/tax-engine/transfer-inheritance-exclusion";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { eligibleCountExcludedHouseIds } from "./house-count-exclusion-rows";
import { buildHousesPayload } from "./transfer-tax-api-houses";
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
  >
>;

/** §155②③으로 주택 수에서 빠지는 상속주택 명부 행 id(엔진 판정). 양도일·양도 주택 취득일이 없으면 빈 집합. */
export function inheritedCountExcludedHouseIds(form: CandidateFormLike): ReadonlySet<string> {
  const primary = form.assets?.[0];
  const acquisitionDate = toOptionalDate(primary?.acquisitionDate);
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

/** §155① 신규 주택 후보에서 뺄 행 — 조특법 제외 ∪ 상속주택 제외. `resolveTemporaryTwoHouse`의 `excludedHouseIds`. */
export function temporaryTwoHouseCandidateExcludedIds(form: CandidateFormLike): ReadonlySet<string> {
  const ids = new Set(eligibleCountExcludedHouseIds(form));
  for (const id of inheritedCountExcludedHouseIds(form)) ids.add(id);
  return ids;
}
