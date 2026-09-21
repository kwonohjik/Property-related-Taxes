/**
 * 명부 행 → 세대 단위 비과세 사실 도출 (D-6 · 계획서 §5.10)
 *
 * ## 원칙: 사실은 한 번, 규칙은 조문별로
 *
 * §155 특례의 「주택별 사실」은 **명부 행**이 정본이다. 엔진 입력은 세대 단위 그대로 두고
 * (계획서 §5.10 결정 1 — 엔진을 바꾸면 세액 불변 증명이 흐려진다) **어댑터가 행에서 도출**한다.
 *
 * ## 🔑 레거시는 지우지 않고 **폴백**으로 둔다 (OH-21·OH-30)
 *
 * 기존 record의 세대 단위 값(`culturalHeritageHouseSpecial` 등)은 **어느 행인지 알 수 없다**.
 * 자동 배정하면 틀린 주택에 사실을 붙이게 된다. ⇒ 「행에 표시가 있으면 행, 없으면 레거시」다.
 * 둘 다 있으면 **행이 이긴다**(행이 더 구체적인 선언이다).
 *
 * 그래서 **저장 당시와 같은 세액**이 나온다 — 행 표시가 없는 옛 record는 레거시 값을 그대로 쓴다.
 *
 * ## ⚠️ 이 모듈은 비과세 축 전용이다
 *
 * 같은 사실이 중과 축(영 §167의3·§167의10)에도 쓰이지만 **요건이 다르다**. 한 값으로 합치면
 * 조용히 틀린다([[feedback_one_field_serving_two_legal_axes]]). 중과 쪽 행 속성은
 * `HouseEntry`에 이미 따로 있고(`isCulturalHeritage`계열·`isUnavoidableReason`계열),
 * 이 모듈은 그것들을 **읽지 않는다**.
 */
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset";
import { judgeRuralHouseLocation } from "@/lib/geo/rural-house-location";

/**
 * 도출에 필요한 행 속성만 — 테스트가 전체 `HouseEntry`를 만들지 않아도 되게 좁힌다.
 *
 * 🔑 `acquisitionDate`·`addressJibun`·`regionCode`는 `HouseEntry`에서 필수이거나 optional이지만
 *    여기서는 **전부 optional**로 둔다. 도출은 「있으면 쓴다」이지 「없으면 못 센다」가 아니다
 *    (취득일 없는 행은 애초에 ④가 걸러 낸다 — `transfer-tax-api-houses.ts:75`).
 */
export type OneHouseFactRow = Partial<
  Pick<
    HouseEntry,
    | "oneHouseCulturalHeritage"
    | "oneHouseRuralHouse"
    | "ruralHouseKind"
    | "ruralOutsideCapitalEupMyeon"
    | "ruralUrbanZone"
    | "ruralDecedentResidenceYears"
    | "ruralOwnerResidenceYears"
    | "ruralLandAreaSqm"
    | "ruralWholeHouseholdMoved"
    | "ruralHighPriceAtAcquisition"
    | "oneHouseUnavoidableOutsideCapital"
    | "unavoidableOutsideCapitalReason"
    | "unavoidableOutsideCapitalResolvedDate"
    | "acquisitionDate"
    | "addressJibun"
    | "regionCode"
  >
>;

/** ④가 만드는 §155⑦ nested payload — 엔진 `TransferTaxInput["ruralHouse"]`와 같은 모양. */
export interface RuralHousePayload {
  kind: "inherited" | "farm_exit" | "return_to_farm";
  isOutsideCapitalEupMyeon: boolean;
  decedentResidenceYears?: number;
  ownerResidenceYears?: number;
  acquisitionDate?: string;
  isHighPriceAtAcquisition?: boolean;
  landAreaSqm?: number;
  wholeHouseholdMoved?: boolean;
}

/** ④가 만드는 §155⑧ nested payload — 엔진 `TransferTaxInput["unavoidableOutsideCapitalHouse"]`. */
export interface UnavoidableOutsideCapitalPayload {
  reason: "study" | "work" | "illness" | "other";
  resolvedDate?: string;
}

/** 세대 단위 레거시 값(폼 스칼라) — 행에 표시가 없을 때만 쓴다. */
export interface OneHouseLegacyFacts {
  /** §155⑥1호 — 종전 세대 단위 토글(`form.culturalHeritageHouseSpecial`). */
  culturalHeritageHouseSpecial?: boolean;
  /** §155⑦ — 종전 세대 단위 블록 전체. 행 표시가 없을 때 그대로 쓴다. */
  ruralHouse?: RuralHousePayload;
  /** §155⑧ — 종전 세대 단위 블록. 행 표시가 없을 때 그대로 쓴다. */
  unavoidableOutsideCapitalHouse?: UnavoidableOutsideCapitalPayload;
}

export interface DerivedOneHouseRowFacts {
  /** ④⑬ 엔진 입력 `culturalHeritageHouse` — true일 때만 전송한다(false는 미전송 규약 유지). */
  culturalHeritageHouse: boolean;
  /** ④⑬ 엔진 입력 `ruralHouse` — 미해당이면 `undefined`(키 자체 미전송). */
  ruralHouse?: RuralHousePayload;
  /**
   * ④⑬ 엔진 입력 `unavoidableOutsideCapitalHouse` (§155⑧ = 영 §167의10①4호).
   *
   * 🔑 이 값 하나가 **두 축**을 움직인다 — 비과세(`qualifiesUnavoidableOutsideCapital`)와
   *    중과 배제(`transfer-tax-judgment-steps.ts:55`가 그 술어 결과를 중과 엔진에 주입).
   *    그래서 §155⑧은 비과세를 주장할 수 없는 세대에도 입력 경로가 필요했다(P6-b 실측).
   */
  unavoidableOutsideCapitalHouse?: UnavoidableOutsideCapitalPayload;
  /**
   * 레거시 값만으로 성립했는가 — 화면이 「어느 주택인지 지정하세요」를 띄울 신호(OH-30).
   * 행 표시가 하나라도 있으면 false다.
   */
  fromLegacyOnly: boolean;
}

/** 행 중 §155⑥1호 국가유산주택으로 표시된 것이 있는가. */
export function hasCulturalHeritageRow(
  houses: readonly OneHouseFactRow[] | undefined,
): boolean {
  return (houses ?? []).some((h) => h.oneHouseCulturalHeritage === true);
}

/** 행 중 §155⑦ 농어촌주택으로 표시된 **첫 행**. 법문이 「각각 1개씩」이라 하나만 쓴다. */
export function findRuralHouseRow(
  houses: readonly OneHouseFactRow[] | undefined,
): OneHouseFactRow | undefined {
  return (houses ?? []).find((h) => h.oneHouseRuralHouse === true && !!h.ruralHouseKind);
}

/**
 * 소재 요건(수도권 밖 읍·면 — 도시지역 읍 제외)을 **행 주소에서 판정**한다.
 *
 * 🔑 **읽는 시점에 판정한다.** 종전 세대 단위 구현은 `useEffect`로 파생 boolean을 store에
 * 써 넣었는데(미러링 금지 위반 — `feedback_useeffect_store_mirror_forbidden`), 여기서는
 * 행이 **조회 결과**(`ruralUrbanZone`)와 **사용자 지정값**(`ruralOutsideCapitalEupMyeon`)만
 * 들고 있고 판정은 순수 함수가 한다.
 *
 * 우선순위: 사용자 지정(있으면) → 주소 자동 판정.
 */
export function resolveRuralLocationQualified(row: OneHouseFactRow): boolean {
  if (row.ruralOutsideCapitalEupMyeon !== undefined) return row.ruralOutsideCapitalEupMyeon;
  return (
    judgeRuralHouseLocation({
      regionCode: row.regionCode || undefined,
      jibun: row.addressJibun ?? "",
      urbanVerdict: row.ruralUrbanZone,
    }).verdict === "qualified"
  );
}

/**
 * 행 중 §155⑧ 주택으로 표시된 **첫 행**. 법문이 「각각 1개씩」이라 하나만 쓴다.
 *
 * ⛔ `isUnavoidableReason`(영 §167의10①3호)은 **보지 않는다** — 다른 호다. 합치면 3호의
 *    기준시가 3억·1년 거주 요건이 4호에 조용히 붙는다.
 */
export function findUnavoidableOutsideCapitalRow(
  houses: readonly OneHouseFactRow[] | undefined,
): OneHouseFactRow | undefined {
  return (houses ?? []).find((h) => h.oneHouseUnavoidableOutsideCapital === true);
}

const num = (s: string | undefined) => parseFloat(s ?? "") || 0;

/**
 * 행 하나 → ④ `ruralHouse` payload.
 *
 * ⚠️ **유형별로 무의미한 필드는 싣지 않는다** — 종전 ④ 규약을 그대로 지킨다
 * (상속 유형에 귀농 대지면적을 실어 보내면 조용한 오판정이 된다).
 */
function toRuralPayload(row: OneHouseFactRow): RuralHousePayload | undefined {
  const kind = row.ruralHouseKind;
  if (!kind) return undefined;
  return {
    kind,
    isOutsideCapitalEupMyeon: resolveRuralLocationQualified(row),
    ...(kind === "inherited"
      ? { decedentResidenceYears: num(row.ruralDecedentResidenceYears) }
      : {}),
    ...(kind === "farm_exit" ? { ownerResidenceYears: num(row.ruralOwnerResidenceYears) } : {}),
    ...(kind === "return_to_farm"
      ? {
          // §155⑦ 단서의 「**그 주택**을 취득한 날」 = 이 행의 취득일. 별도 칸이 없는 이유다.
          ...(row.acquisitionDate ? { acquisitionDate: row.acquisitionDate } : {}),
          isHighPriceAtAcquisition: row.ruralHighPriceAtAcquisition === true,
          landAreaSqm: num(row.ruralLandAreaSqm),
          wholeHouseholdMoved: row.ruralWholeHouseholdMoved === true,
        }
      : {}),
  };
}

/**
 * 명부 행에서 세대 단위 §155 사실을 도출한다 — **행 우선, 레거시 폴백**.
 *
 * @param houses  ④ 다른 보유 주택 목록
 * @param legacy  세대 단위 레거시 값(폼 스칼라). 행 표시가 없을 때만 쓰인다.
 */
export function deriveOneHouseFactsFromHouses(
  houses: readonly OneHouseFactRow[] | undefined,
  legacy: OneHouseLegacyFacts = {},
): DerivedOneHouseRowFacts {
  const rowHeritage = hasCulturalHeritageRow(houses);
  const legacyHeritage = legacy.culturalHeritageHouseSpecial === true;

  const ruralRow = findRuralHouseRow(houses);
  const rowRural = ruralRow ? toRuralPayload(ruralRow) : undefined;

  const uocRow = findUnavoidableOutsideCapitalRow(houses);
  const rowUoc: UnavoidableOutsideCapitalPayload | undefined = uocRow
    ? {
        reason: uocRow.unavoidableOutsideCapitalReason ?? "work",
        // 미입력 = **미해소**다. 빈 문자열을 그대로 보내면 엔진이 기한을 기산해 버린다(W-1).
        ...(uocRow.unavoidableOutsideCapitalResolvedDate
          ? { resolvedDate: uocRow.unavoidableOutsideCapitalResolvedDate }
          : {}),
      }
    : undefined;

  const anyRow = rowHeritage || rowRural !== undefined || rowUoc !== undefined;
  const anyLegacy =
    legacyHeritage ||
    legacy.ruralHouse !== undefined ||
    legacy.unavoidableOutsideCapitalHouse !== undefined;

  return {
    culturalHeritageHouse: rowHeritage || legacyHeritage,
    ruralHouse: rowRural ?? legacy.ruralHouse,
    unavoidableOutsideCapitalHouse: rowUoc ?? legacy.unavoidableOutsideCapitalHouse,
    fromLegacyOnly: !anyRow && anyLegacy,
  };
}
