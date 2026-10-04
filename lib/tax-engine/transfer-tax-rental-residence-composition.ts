/**
 * §155⑳ 「장기임대주택 … 과 **그 밖의 1주택**을 국내에 소유하고 있는 1세대」 — 세대 구성 판정 (E-14h).
 *
 * 비과세(STEP 2.5 `runRentalHousingExceptionStep`)와 중과 배제 ① 요소(`resolveSurchargeDeemedOneHouseDetail`)가
 * **같은 이 함수**를 부른다. 종전에는 중과 쪽만 명부의 비임대 주택 수를 셌고, 비과세 쪽은 세대 구성을 보지
 * 않아 거주 + 임대 + 다른 일반주택(특례 불성립)에도 특례를 적용했다(E-14h 실측 199,997,600).
 *
 * ## 다른 특례와의 중첩 — 해석 (taxlaw.nts.go.kr 원문 실독 2026-09-29)
 *
 * | 중첩 | 결론 | 근거 |
 * |---|---|---|
 * | §155⑳ + §155① 일시적 2주택 | 적용 | 부동산납세과-33(2015.1.12.) · 서면-2019-부동산-1303(2019.9.3.) · 사전-2021-법령해석재산-1719 |
 * | §155⑳ + §155② 상속주택 | 적용 | 사전-2025-법규재산-0162(2025.4.24.) · 서면-2018-부동산-3009(2019.12.30.) |
 * | §155⑳ + §155② + §155① | 적용 불가 | 서면-2018-부동산-3009 |
 * | §155⑳ + §155② + §155④ | 적용 불가 | 서면-2018-부동산-3009 |
 * | §155⑳ + §155③ 소수지분 + §155① | 적용 불가 | 기준-2019-법령해석재산-0029(사전-2016-법령해석재산-0584 인용) |
 * | §155 특례 3중첩 일반 | 허용하지 않음 | 서면-2022-법규재산-4283(2024.6.27.) |
 * | §155⑳ + 조특법 §99의4 농어촌주택 (+ §155①) | 적용 | 서면-2016-법령해석재산-3686(2016.12.14.) · 사전-2016-법령해석재산-0198(2017.7.10.) |
 *
 * ## 판정 (명부 `houses[]` 기준 — 장기임대주택 행은 `isLongTermRental`)
 *
 * - `met` — 거주주택 외 비임대 주택이 없거나, 한 채가 §155①(신규 주택 취득일이 그 행과 같은 날)·§155② 단독상속
 *   (그 행이 선순위 상속주택으로 제외)로 빠진다. → 비과세 적용 · 중과 배제 ① 요소 성립.
 * - `exceeded` — 거주주택 외 비임대 주택이 조특법 제외 후에도 2채 이상(3중첩)이거나, 한 채가 어느 특례로도
 *   빠지지 않는다. → 비과세 특례 적용 불가 · 중과 배제 불성립.
 * - `undetermined` — 명부 없음 + 세대 주택 수가 임대주택 수보다 작음(입력 모순) · 조특법 제외가 섞임 ·
 *   §155③·④⑤·⑦과의 2중첩(해석 미확보). → **양쪽 모두 종전 동작**(비과세는 적용, 중과 배제는 열지 않음 — 확인 필요).
 *
 * ## 명부 없음 — 「모름」은 불리하게 (사용자 결정 2026-10-04)
 *
 * 명부가 없으면 세대 주택 수(`householdHousingCount`)에서 거주주택 1채와 임대주택(`rentalUnits`)을 뺀 수가
 * 「그 밖의 주택」이다. 그 수가 **1채**면 그 주택이 §155①·②로 빠지는지 **알 수 없다** — 빠지는 사실이 있어야
 * 성립하는 특례이므로 불성립(`exceeded` + `confirmNotice`)으로 계산하고 「명부에 입력하면 판정한다」를 고지한다.
 * **2채 이상**이면 명부가 있어도 결론이 같아(3중첩) 고지하지 않는다. **0채**면 그 밖의 주택이 없다는 사실이
 * 확정되므로 `met`이다 — 종전에는 판정 보류여서 중과 배제 ① 요소가 열리지 않았고, 명부가 없어 정밀 중과 판정도
 * 돌지 않아 원시 플래그 중과가 붙었다(거주 + 임대 1 · 20억 167,360,600 vs 명부 입력 102,086,600). 중과 쪽은
 * `runMultiHouseSurchargeStep`이 같은 사실로 행을 구성해 정밀 판정을 돌린다. 음수(입력 모순)만 판정 보류다.
 */
import { TRANSFER_RENTAL_HOUSING } from "./legal-codes/transfer";
import { resolveDeemedOneHouseBy155 } from "./transfer-tax-exemption-requirements";
import { resolveExemptionHouseCountExclusions } from "./transfer-tax-house-exclusion-step";
import type { ParsedRates } from "./transfer-tax-helpers";
import type { TransferTaxInput } from "./types/transfer.types";

export type RentalResidenceComposition =
  | { status: "met"; via: "sole" | "temporary_two_house" | "inherited_house" }
  | {
      status: "exceeded";
      otherHouseCount: number;
      reason: string;
      /** 사실을 몰라 불성립으로 계산했고 그 사실이 결론을 가를 때만 — 「확인 필요」 고지 문구 */
      confirmNotice?: string;
    }
  | { status: "undetermined"; reason: "no_roster" | "special_act" | "co_inherited" | "other_special_rule" };

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function resolveRentalResidenceComposition(
  input: TransferTaxInput,
  parsedRates: ParsedRates,
  /** §99의4·§98의9 「취득 전 보유 주택」 판정 기준일 — STEP 0.9와 같은 값(`hceGeneralHouseAcquisitionDate`) */
  generalHouseAcquisitionDate?: Date,
): RentalResidenceComposition {
  const houses = input.houses ?? [];
  if (houses.length === 0) return resolveWithoutRoster(input, generalHouseAcquisitionDate);
  const sellingId = input.sellingHouseId ?? houses[0].id;
  const others = houses.filter((h) => !h.isLongTermRental && h.id !== sellingId);
  if (others.length === 0) return { status: "met", via: "sole" };

  const ex = resolveExemptionHouseCountExclusions(input, generalHouseAcquisitionDate);
  // 조특법 「소유주택으로 보지 아니한다」 제외는 §155 특례가 아니라 중첩 수에 들지 않는다(3686·0198).
  const remaining = others.length - ex.specialActExcludedCount;
  if (remaining >= 2) {
    return {
      status: "exceeded",
      otherHouseCount: remaining,
      reason:
        `거주주택 외에 장기임대주택이 아닌 주택이 ${remaining}채 있습니다 — ${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20}은 ` +
        `「장기임대주택과 그 밖의 1주택」을 소유한 1세대에 적용되며, 다른 특례를 둘 이상 겹쳐 적용하지 않습니다`,
    };
  }
  if (ex.specialActExcludedCount > 0) return { status: "undetermined", reason: "special_act" };

  const other = others[0];
  const inherited = ex.inheritedExclusion.excludedHouses.find((e) => e.houseId === other.id);
  if (inherited?.basis === "sole") return { status: "met", via: "inherited_house" };
  if (inherited) return { status: "undetermined", reason: "co_inherited" };

  const deemed = resolveDeemedOneHouseBy155(
    { ...input, householdHousingCount: 2 },
    parsedRates.oneHouseSpecialRules,
  );
  // 명부 도출은 양도 주택보다 나중에 취득한 행을 「신규 주택」으로 고른다 — 그 행이 장기임대주택이면
  // 거주주택 외 일반주택은 §155①로 빠진 것이 아니다. 신규 주택 취득일이 그 일반주택 행과 같을 때만 본다.
  if (
    deemed === "temporary_two_house" &&
    input.temporaryTwoHouse !== undefined &&
    sameDay(input.temporaryTwoHouse.newAcquisitionDate, other.acquisitionDate)
  ) {
    return { status: "met", via: "temporary_two_house" };
  }
  if (deemed === "rural_house" || deemed === "marriage_merge" || deemed === "parental_care_merge") {
    return { status: "undetermined", reason: "other_special_rule" };
  }
  return {
    status: "exceeded",
    otherHouseCount: 1,
    reason:
      `거주주택 외에 장기임대주택이 아닌 주택이 1채 더 있고 일시적 2주택·상속주택 특례로 제외되지 않습니다 — ` +
      `${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20}은 「장기임대주택과 그 밖의 1주택」을 소유한 1세대에 적용됩니다` +
      ` (명부에서 장기임대주택 행은 「장기임대」로 표시해야 합니다)`,
  };
}

/**
 * 명부 없음 — 세대 주택 수에서 거주주택(양도 주택)·임대주택(`rentalUnits`)을 뺀 「그 밖의 주택」 수로 본다.
 * 조특법 「소유주택으로 보지 아니한다」 제외는 명부 경로와 같이 그 수에서 뺀다(폼 전역 입력도 있다).
 */
function resolveWithoutRoster(
  input: TransferTaxInput,
  generalHouseAcquisitionDate: Date | undefined,
): RentalResidenceComposition {
  const rentalCount = input.rentalHousingException?.rentalUnits?.length ?? 0;
  const others = input.householdHousingCount - 1 - rentalCount;
  // 세대 주택 수가 거주주택 + 임대주택으로 정확히 채워지면 「그 밖의 주택」이 없다는 사실이 입력으로 확정된다 —
  // 명부의 비임대 행 0채(`others.length === 0`)와 같은 결론이다. 음수(입력 모순)만 판정 보류로 둔다.
  if (others === 0) return { status: "met", via: "sole" };
  if (others < 0) return { status: "undetermined", reason: "no_roster" };
  const ex = resolveExemptionHouseCountExclusions(input, generalHouseAcquisitionDate);
  const remaining = others - ex.specialActExcludedCount;
  if (remaining <= 0) return { status: "undetermined", reason: "special_act" };
  if (remaining >= 2) {
    return {
      status: "exceeded",
      otherHouseCount: remaining,
      reason:
        `세대 보유 주택 ${input.householdHousingCount}채 중 거주주택·장기임대주택(${rentalCount}채)이 아닌 주택이 ` +
        `${remaining}채 있습니다 — ${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20}은 「장기임대주택과 그 밖의 1주택」을 ` +
        `소유한 1세대에 적용되며, 다른 특례를 둘 이상 겹쳐 적용하지 않습니다`,
    };
  }
  return {
    status: "exceeded",
    otherHouseCount: 1,
    reason:
      `세대 보유 주택 ${input.householdHousingCount}채 중 거주주택·장기임대주택(${rentalCount}채)이 아닌 주택이 ` +
      `1채 있는데, 그 주택이 일시적 2주택·상속주택 특례로 제외되는지 확인되지 않아 ` +
      `${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20}을 적용하지 않았습니다`,
    confirmNotice: RENTAL_RESIDENCE_NO_ROSTER_CONFIRM_NOTICE,
  };
}

/** 명부 없음 + 그 밖의 주택 1채 — 「확인 필요」 고지 (결론을 가를 때만 싣는다). */
export const RENTAL_RESIDENCE_NO_ROSTER_CONFIRM_NOTICE =
  `거주주택·장기임대주택 외 주택 1채가 일시적 2주택(${TRANSFER_RENTAL_HOUSING.PIT_RD_155_1})·상속주택` +
  `(${TRANSFER_RENTAL_HOUSING.PIT_RD_155_2})으로 주택 수에서 빠지면 ${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20}이 적용될 수 있습니다 — 세대 보유 주택 목록에 그 주택을 입력하면 ` +
  `판정합니다(확인 필요)`;
