/**
 * §155⑳ 「장기임대주택 … 과 **그 밖의 1주택**을 국내에 소유하고 있는 1세대」 — 세대 구성 판정 (E-14h).
 *
 * 비과세(STEP 2.5 `runRentalHousingExceptionStep`)와 중과 배제 ① 요소(`resolveSurchargeDeemedOneHouseDetail`)가
 * **같은 이 함수**를 부른다. 종전에는 중과 쪽만 명부의 비임대 주택 수를 셌고, 비과세 쪽은 세대 구성을 보지
 * 않아 거주 + 임대 + 다른 일반주택(특례 불성립)에도 특례를 적용했다(E-14h 실측 199,997,600).
 *
 * ## 다른 특례와의 중첩 — 해석 (taxlaw.nts.go.kr 원문 실독 2026-09-29 · ④⑤⑦3호·§99의2 행 2026-10-04 추가)
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
 * | §155⑳ + §155④ 동거봉양 합가 | 적용 | 부동산거래관리과-44(2012.1.17.) · 기준-2024-법규재산-0061(2026.8.20.) |
 * | §155⑳ + §155⑤ 혼인 합가 | 적용 | 상속증여세과-21(2013.3.28.) · 사전-2025-법규재산-1062(2025.11.28.) |
 * | §155⑳ + §155⑦3호 귀농주택 | 적용 | 서면-2015-부동산-0193(2015.3.13.) |
 * | §155⑳ + 조특법 §99의2 감면주택 (+ §155①) | 적용 | 서면-2015-부동산-2422 · 사전-2019-법령해석재산-0398 · 서면-2021-부동산-5418 · 사전-2023-법규재산-0830 |
 * | §155⑳ + 조특법 §99의2② 같은 문형 조문 | 적용(같은 문형) | 사용자 결정 Q2(가) 2026-10-04 — E-14a(#1927) 15호 기준과 같다(아래 목록) |
 * | §155⑳ + 조특법 §98의9 준공후미분양주택 | 적용(§99의4① 같은 문형) | 사용자 결정 2026-10-04 — §99의4 해석(3686 등) 기준 · §98의9 직접 해석 없음 |
 * | §155⑳ + §155③ 공동상속 소수지분 (2중첩) | 적용 | 사용자 결정 Q3(가) 2026-10-04 — 3중첩 불허 회신(0584·0029·2439·4283)이 2중첩 허용을 전제 · 서면-2021-부동산-7265(소수지분은 「소유주택으로 보지 아니하므로」) |
 *
 * ## 해석 미확보 — 「모름」은 불리하게 (사용자 결정 2026-10-04 · taxlaw.nts 재검색 2026-10-04)
 *
 * 아래 겹침은 직접 해석례를 찾지 못했다 ⇒ 특례 **불성립**(`exceeded` + `confirmNotice`)으로 계산하고,
 * 그 겹침이 결론을 가를 때만(나머지 요건 충족 — 호출부 `rhe.applied`) 「확인 필요」를 고지한다.
 * - §155⑦1호(상속받은 농어촌주택)·2호(이농주택)와의 2중첩 — 3중첩(+§155①)은 불가(부동산납세과-870).
 * - 확인 목록(`RENTAL_RESIDENCE_VERIFIED_SPECIAL_ACT`) **밖** 조특법 제외 — §98(근거가 시행령 §98②·⑥ · 문형 다름).
 *
 * ## 중과 배제 13호·15호 ① 요소 — 법문 추론 (사용자 결정 Q1(가) 2026-10-04)
 *
 * `met`이면 중과 배제 ① 요소도 함께 연다(`qualifiesRentalResidenceDeeming`). 근거는 13호·15호의 「제155조 또는
 * 「조세특례제한법」에 따라 … 1세대 1주택으로 보아 제154조제1항이 적용되는 주택」 꼬리 — 위 비과세 회신이 그
 * 주택을 「1세대1주택으로 보아 제154조제1항을 적용」한다고 하므로 꼬리에 걸린다는 **추론**이다. §155①·②(1719·0162)
 * 외 겹침에서 13호·15호를 직접 다룬 회신은 없다.
 *
 * ## 판정 (명부 `houses[]` 기준 — 장기임대주택 행은 `isLongTermRental`)
 *
 * - `met` — 거주주택 외 비임대 주택이 없거나, 한 채가 §155①(신규 주택 취득일이 그 행과 같은 날)·§155② 단독상속
 *   (그 행이 선순위 상속주택으로 제외)·§155③ 공동상속 소수지분·§155④⑤ 합가·§155⑦3호 귀농주택으로 빠진다.
 *   확인 목록의 조특법 제외(§99의2와 같은 문형 조문·§99의4와 같은 문형 조문)는 주택이 없는 것으로 보고 나머지를 같은 규칙으로
 *   판정한다. → 비과세 적용 · 중과 배제 ① 요소 성립.
 * - `exceeded` — 거주주택 외 비임대 주택이 조특법 제외 후에도 2채 이상(3중첩)이거나, 한 채가 어느 특례로도
 *   빠지지 않거나, 위 「해석 미확보」 겹침이다. → 비과세 특례 적용 불가 · 중과 배제 불성립.
 * - `undetermined` — 명부 없음 + 세대 주택 수가 임대주택 수보다 작음(입력 모순) · 명부 없음 + 확인 목록의 조특법
 *   제외로만 그 밖의 주택이 0이 됨. → **양쪽 모두 종전 동작**(비과세는 적용, 중과 배제는 열지 않음).
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
import { TRANSFER, TRANSFER_RENTAL_HOUSING } from "./legal-codes/transfer";
import { resolveDeemedOneHouseBy155 } from "./transfer-tax-exemption-requirements";
import {
  resolveExemptionHouseCountExclusions,
  SPECIAL_ACT_15HO_VERIFIED_ARTICLES,
} from "./transfer-tax-house-exclusion-step";
import type { ParsedRates } from "./transfer-tax-helpers";
import type { TransferTaxInput } from "./types/transfer.types";

export type RentalResidenceComposition =
  | {
      status: "met";
      via:
        | "sole"
        | "temporary_two_house"
        | "inherited_house"
        | "co_inherited_house"
        | "parental_care_merge"
        | "marriage_merge"
        | "rural_house";
    }
  | {
      status: "exceeded";
      otherHouseCount: number;
      reason: string;
      /** 사실·해석을 몰라 불성립으로 계산했고 그것이 결론을 가를 때만 — 「확인 필요」 고지 문구 */
      confirmNotice?: string;
    }
  | { status: "undetermined"; reason: "no_roster" };

/**
 * §155⑳과 겹쳐도 거주주택 특례를 적용하는 조특법 소유주택 제외 조문.
 *
 * - §99의2 — 회신(서면-2015-부동산-2422 등). §99의2②와 **같은 문형**(「「소득세법」 제89조제1항제3호를 적용할 때 …
 *   해당 거주자의 소유주택으로 보지 아니한다」)인 조문은 확인된 것으로 본다(사용자 결정 Q2(가) 2026-10-04 —
 *   E-14a(#1927)가 13호·15호에 쓴 기준과 같아 그 목록 `SPECIAL_ACT_15HO_VERIFIED_ARTICLES`를 그대로 쓴다).
 *   MST 284389 대조: §97② · §97의2②(§97② 준용) · §98의2④ · §98의3③ · §98의5② · §98의6② · §98의7② · §98의8② ·
 *   §99②·§99의3②(「… 2007년 12월 31일까지 양도하는 경우에만」 — 기한은 `evaluateSpecialHouseExclusion`이 거른다).
 * - §99의4 — 회신(서면-2016-법령해석재산-3686 「소유주택에서 제외되므로」 등). 1호 농어촌주택·2호 고향주택이 같은
 *   항의 한 문장으로 효과를 받으므로 함께 둔다.
 * - §98의9 — §99의4와 같은 문형(조특법 MST 284389 실독 2026-10-04): §98의9① 「… 준공후미분양주택을 취득하기 전에
 *   보유한 주택을 양도하는 경우에는 그 준공후미분양주택을 해당 1세대의 소유주택이 아닌 것으로 보아 같은 법
 *   제89조제1항제3호를 적용한다」 ↔ §99의4① 「… 그 농어촌주택등 취득 전에 보유하던 다른 주택 … 을 양도하는
 *   경우에는 그 농어촌주택등을 해당 1세대의 소유주택이 아닌 것으로 보아 「소득세법」 제89조제1항제3호를 적용한다」.
 *   §99의4 해석(서면-2016-법령해석재산-3686 등) 기준이며 §98의9 직접 해석은 없다(사용자 결정 2026-10-04
 *   「§99의4와 같은 문형도 확인된 것으로 본다」). 13호·15호 단독 축(`SPECIAL_ACT_15HO_VERIFIED_ARTICLES`, E-14a)에도
 *   같은 날 §98의9·§99의4를 넣었다(사용자 결정 2026-10-04 · §99의4는 같은 문형 근거) — 아래 세 키는 그 목록과 겹친다.
 *   이 목록은 §155⑳ 구성 축 전용 상수로 남긴다(축별 결정이 다시 갈릴 수 있다).
 * - 넣지 않은 것: §98(①·③ 본문에 소유주택 제외 문언이 없고 ②가 「… 주택의 판정 … 은 대통령령으로 정한다」로
 *   시행령 §98②·⑥에 위임 — 문형이 다르다).
 */
const RENTAL_RESIDENCE_VERIFIED_SPECIAL_ACT: ReadonlySet<string> = new Set([
  ...SPECIAL_ACT_15HO_VERIFIED_ARTICLES,
  "new_99_4_rural",
  "new_99_4_hometown",
  "unsold_98_9",
]);

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

type Exclusions = ReturnType<typeof resolveExemptionHouseCountExclusions>;

/** 조특법 소유주택 제외(적격분) — 조문 키·명부 행 id·인용 */
function specialActExclusions(ex: Exclusions) {
  const all = [
    ...ex.hceApplied.map((d) => ({ key: d.id as string, houseId: d.houseId, legalBasis: d.legalBasis })),
    ...ex.specialHouseExclusionDetail.entries
      .filter((e) => e.eligible)
      .map((e) => ({ key: e.article as string, houseId: e.houseId, legalBasis: e.legalBasis })),
  ];
  return { all, unverified: all.filter((x) => !RENTAL_RESIDENCE_VERIFIED_SPECIAL_ACT.has(x.key)) };
}

/** 해석 미확보 조특법 제외가 섞여 결론이 「적용」에서 「불성립」으로 바뀌는 경우 */
function specialActUnverified(otherHouseCount: number, unverified: { legalBasis: string }[]): RentalResidenceComposition {
  const basis = [...new Set(unverified.map((u) => u.legalBasis))].join("·");
  return {
    status: "exceeded",
    otherHouseCount,
    reason:
      `거주주택 외 주택을 ${basis}에 따라 소유주택에서 빼야 ${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20}이 성립하는데, ` +
      `그 겹침을 인정한 해석이 확인되지 않아 ${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20}을 적용하지 않았습니다`,
    confirmNotice: rentalResidenceSpecialActConfirmNotice(basis),
  };
}

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
  const sa = specialActExclusions(ex);
  // 조특법 「소유주택으로 보지 아니한다」 제외는 §155 특례가 아니라 중첩 수에 들지 않는다(3686·0198).
  const remaining = others.length - sa.all.length;
  if (remaining >= 2) {
    return {
      status: "exceeded",
      otherHouseCount: remaining,
      reason:
        `거주주택 외에 장기임대주택이 아닌 주택이 ${remaining}채 있습니다 — ${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20}은 ` +
        `「장기임대주택과 그 밖의 1주택」을 소유한 1세대에 적용되며, 다른 특례를 둘 이상 겹쳐 적용하지 않습니다`,
    };
  }

  // 조특법 제외를 모두 인정한 판정 — 해석 미확보 조문이 섞였으면 그 판정이 「적용」일 때만 결론이 갈린다.
  let favorable: RentalResidenceComposition;
  if (remaining <= 0) {
    favorable = { status: "met", via: "sole" };
  } else {
    const saIds = new Set(sa.all.flatMap((x) => (x.houseId ? [x.houseId] : [])));
    const candidates = others.filter((h) => !saIds.has(h.id));
    // 명부 행에 연결되지 않은 조특법 선언(엔진 직접 입력 — 계산기는 ⑧이 막는다)이면 어느 행이 남는지 모른다 — 불성립.
    if (candidates.length !== 1) {
      return {
        status: "exceeded",
        otherHouseCount: 1,
        reason:
          `조특법 소유주택 제외 선언이 세대 보유 주택 목록의 어느 행인지 연결되지 않아 남는 주택을 특정할 수 없습니다 — ` +
          `${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20}을 적용하지 않았습니다`,
        confirmNotice: `조특법 소유주택 제외 선언을 세대 보유 주택 목록의 행에 연결하면 ${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20} 적용 여부를 판정합니다(확인 필요)`,
      };
    }
    favorable = judgeOtherHouse(input, parsedRates, ex, candidates[0]);
  }
  if (favorable.status === "met" && sa.unverified.length > 0) {
    return specialActUnverified(Math.max(remaining, 0) + sa.unverified.length, sa.unverified);
  }
  return favorable;
}

/** 거주주택·임대주택 외 비임대 주택 **한 채**가 §155 특례로 빠지는가 */
function judgeOtherHouse(
  input: TransferTaxInput,
  parsedRates: ParsedRates,
  ex: Exclusions,
  other: NonNullable<TransferTaxInput["houses"]>[number],
): RentalResidenceComposition {
  const inherited = ex.inheritedExclusion.excludedHouses.find((e) => e.houseId === other.id);
  // §155② 단독상속(0162) · §155③ 공동상속 소수지분(Q3(가) — 3중첩 불허 회신이 2중첩 허용을 전제 · 7265).
  if (inherited) return { status: "met", via: inherited.basis === "sole" ? "inherited_house" : "co_inherited_house" };

  /**
   * §155④⑤ 합가 전 구성(`resolveMergeComposition`)은 명부 행 수와 판정 주택수(여기서는 강제로
   * 2로 둔다)를 대조한다. `input.houses`는 장기임대주택 행을 포함한 **원본 롤스터**라 행 수가
   * 항상 어긋난다 — 그 어긋남은 장기임대주택이라는 **이미 알려진 사실**로 설명되므로
   * `knownHouseExclusionCount`로 알려 종전 동작(판정 보류 → met 경로 유지)을 보존한다.
   * 2026-10-05 — `merge-composition-unknown-unfavorable.plan.md` §3-1.
   *
   * 🔑 **PR-3(`knownHouseExclusionHouseIds`로 행을 빼고 실제 판정)을 일부러 열지 않는다.**
   * 사용자 결정 Q-4는 §155②③ 상속주택·조특법 감면주택만 「합가 당시 주택 수에서 뺀다」고
   * 정했다 — 장기임대주택은 그 결정 밖이다. 장기임대주택 행을 빼고 남는 [거주주택, 그 밖의
   * 주택] 2행으로 실제 구성(seller_side/counterpart_side)을 판정하면, 「그 밖의 주택」에
   * `mergeOrigin`을 입력하지 않은 기존 가정(§155⑳은 합가 전 소유자 구분을 요구한 적이 없다)이
   * 전부 `origin_missing`(불성립)으로 뒤집힌다(실측: `rental-residence-composition-e14h.
   * anchor.test.ts` L-4/L-179 · `transfer.route.unknown-unfavorable-interp-axes.anchor.
   * test.ts` UX-C1/UX-C2가 `mergeOrigin` 없이 `met`을 기대) — Q-4가 승인하지 않은 축까지
   * 조이는 과잉 적용이라 `knownHouseExclusionHouseIds`는 넘기지 않는다(필드 미전달 =
   * `resolveMergeComposition`의 레거시 분기, `knownHouseExclusionCount`만으로 판정 보류).
   */
  const rentalRowCount = input.houses?.filter((h) => h.isLongTermRental).length ?? 0;
  const deemed = resolveDeemedOneHouseBy155(
    { ...input, householdHousingCount: 2, knownHouseExclusionCount: rentalRowCount },
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
  // §155④⑤ — 부동산거래관리과-44 · 상속증여세과-21 등(위 표)이 §155⑳과 겹쳐 적용한다.
  if (deemed === "marriage_merge" || deemed === "parental_care_merge") return { status: "met", via: deemed };
  if (deemed === "rural_house") {
    // §155⑦3호 귀농주택만 회신(서면-2015-부동산-0193)이 있다. 1호 상속·2호 이농은 해석 미확보.
    if (input.ruralHouse?.kind === "return_to_farm") return { status: "met", via: "rural_house" };
    return {
      status: "exceeded",
      otherHouseCount: 1,
      reason:
        `거주주택 외 주택 1채가 ${TRANSFER.RURAL_HOUSE} 상속받은 농어촌주택·이농주택인데, ` +
        `${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20}과 겹쳐 적용한 해석이 확인되지 않아 ${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20}을 적용하지 않았습니다`,
      confirmNotice: RENTAL_RESIDENCE_RURAL_CONFIRM_NOTICE,
    };
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
  // 명부의 비임대 행 0채(`others.length === 0`)와 같은 결론이다(#1947). 음수(입력 모순)만 판정 보류로 둔다.
  if (others === 0) return { status: "met", via: "sole" };
  if (others < 0) return { status: "undetermined", reason: "no_roster" };
  const sa = specialActExclusions(resolveExemptionHouseCountExclusions(input, generalHouseAcquisitionDate));
  const remaining = others - sa.all.length;
  if (remaining <= 0) {
    // 확인 목록 밖 조특법 제외(§98)가 있어야 「그 밖의 주택 0」이 되면 불성립 + 확인 필요(#1949).
    // 확인 목록의 제외뿐이면 종전대로 판정 보류 — `met`으로 열면 명부 없는 중과 행 구성
    // (`noRosterRentalResidenceHouses` — 거주 + 임대만)이 그 조특법 주택을 빠뜨린 채 15호를 판정하게 되고,
    // 명부 없이는 그 조특법 주택이 어느 행인지도 모른다.
    return sa.unverified.length > 0
      ? specialActUnverified(sa.unverified.length, sa.unverified)
      : { status: "undetermined", reason: "no_roster" };
  }
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

/** §155⑦1호·2호 농어촌주택과의 겹침 — 「확인 필요」 고지 (결론을 가를 때만 싣는다). */
export const RENTAL_RESIDENCE_RURAL_CONFIRM_NOTICE =
  `거주주택·장기임대주택 외 주택이 상속받은 농어촌주택·이농주택(${TRANSFER.RURAL_HOUSE} 1호·2호)인 경우 ` +
  `${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20}을 겹쳐 적용하는지는 해석이 확인되지 않았습니다(귀농주택은 서면-2015-부동산-0193) — ` +
  `적용하지 않고 계산했습니다(확인 필요)`;

/** 조특법 소유주택 제외(확인 목록 밖 — §98)와의 겹침 — 「확인 필요」 고지 (결론을 가를 때만 싣는다). */
export function rentalResidenceSpecialActConfirmNotice(basis: string): string {
  return (
    `거주주택·장기임대주택 외 주택이 ${basis}에 따라 소유주택에서 빠지는 경우 ${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20}을 ` +
    `겹쳐 적용하는지는 해석이 확인되지 않았습니다(조특법 §99의2·§99의4와 같은 문형 조문만 확인) — 적용하지 않고 계산했습니다(확인 필요)`
  );
}
