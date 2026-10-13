/**
 * 보유 주택 명부 행의 **중과 축 필수 칸**(장기임대 9유형·부득이 사유) — 계산기 ⑧과 판정 메뉴 ⑧이 쓰는 단일 소스(S09-1).
 *
 * ⑫ refine(`transfer-tax-schema-household-refines.ts` `refineRentalRows`·`transfer-tax-schema-required-refines.ts`
 * `refineHouseExclusionInputs`)의 거울이다. 판정 메뉴는 이 칸들을 명부 편집기에 **조건 없이** 렌더하는데(`HouseEntryEditor`),
 * 판정 ⑧이 거울을 갖지 않아 ⑧ 통과 → route 400 → 화면에는 「입력값이 올바르지 않습니다」만 남았다(VD-1 규약 「Zod가 400을 내기
 * 전에 ⑧이 잡는다」 위반). 두 ⑧이 손으로 적은 사본을 따로 두면 한쪽만 갈라진다 — 한 곳에 둔다.
 *
 * 메시지에는 **행 라벨을 붙이지 않는다**. 호출부가 「보유 주택 N: 」을 붙인다.
 * `field`는 비어 있는 칸의 이름이다(판정 ⑧의 오류 `field`로 쓴다).
 */
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";
import { unavoidableOutsideCapitalStatusIssue } from "./two-house-exclusion-status";
import { housesOwnedAtTransfer, isOwnedAtTransfer } from "./household-house-count";

export interface HouseRowIssue {
  field: string;
  message: string;
}

type RentalFields = Pick<
  HouseEntry,
  | "isLongTermRental"
  | "rentalType"
  | "rentalStartOfficialPrice"
  | "acquisitionOfficialPrice"
  | "rentalLandArea"
  | "rentalTotalFloorArea"
  | "firstSaleContractDate"
  | "rentalCancellationDate"
  | "saMokBaseArticle"
>;

/** 장기임대 9유형(§167의3①2호 가~자목) 유형별 필수 입력 — 미입력이면 엔진이 현재 공시가격·규모 미확인으로 오판정한다(H-3). */
export function houseRentalTypeIssue(h: RentalFields): HouseRowIssue | null {
  if (!(h.isLongTermRental && h.rentalType)) return null;
  const t = h.rentalType;
  // exact 비교(.includes(t)=정확매칭).
  if (["A", "C", "E", "F", "H", "I"].includes(t) && !h.rentalStartOfficialPrice)
    return { field: "rentalStartOfficialPrice", message: "임대개시 당시 공시가격을 입력하세요." };
  if (["B", "D"].includes(t) && !h.acquisitionOfficialPrice)
    return { field: "acquisitionOfficialPrice", message: "취득 당시 공시가격을 입력하세요." };
  if (["C", "D", "F", "I"].includes(t) && (!h.rentalLandArea || !h.rentalTotalFloorArea))
    return {
      field: !h.rentalLandArea ? "rentalLandArea" : "rentalTotalFloorArea",
      message: "대지면적·연면적(㎡)을 입력하세요.",
    };
  if (t === "D" && !h.firstSaleContractDate)
    return { field: "firstSaleContractDate", message: "최초 분양계약일을 입력하세요." };
  if (t === "G") {
    if (!h.rentalCancellationDate)
      return { field: "rentalCancellationDate", message: "자진·자동 말소일을 입력하세요." };
    // 사목 base 목(가·다·라·마) + 그 목의 "해당 목의 다른 요건"(임대기간요건 외) — 엔진 SAMOK_BASE_REQUIRED·base 게이트와 동기화
    const base = h.saMokBaseArticle;
    if (!base) return { field: "saMokBaseArticle", message: "사목 — 말소 전 base 목(가·다·라·마)을 선택하세요." };
    if ((base === "가" || base === "다" || base === "마") && !h.rentalStartOfficialPrice)
      return { field: "rentalStartOfficialPrice", message: "사목 base 목의 임대개시 당시 공시가격을 입력하세요." };
    if (base === "라" && !h.acquisitionOfficialPrice)
      return { field: "acquisitionOfficialPrice", message: "사목 base 라목의 취득 당시 공시가격을 입력하세요." };
    if ((base === "다" || base === "라") && (!h.rentalLandArea || !h.rentalTotalFloorArea))
      return {
        field: !h.rentalLandArea ? "rentalLandArea" : "rentalTotalFloorArea",
        message: "사목 base 목의 대지면적·연면적(㎡)을 입력하세요.",
      };
    if (base === "라" && !h.firstSaleContractDate)
      return { field: "firstSaleContractDate", message: "사목 base 라목의 최초 분양계약일을 입력하세요." };
  }
  return null;
}

/** §167의10①3호 부득이한 사유 주택 — 거주기간(년)·취득 당시 기준시가 필수(엔진 ≥1년 판정 · 비우면 0으로 읽혀 배제 미발동). */
export function houseUnavoidableIssue(
  h: Pick<HouseEntry, "isUnavoidableReason" | "unavoidableResidenceYears" | "acquisitionOfficialPrice">,
): HouseRowIssue | null {
  if (!h.isUnavoidableReason) return null;
  if (!h.unavoidableResidenceYears || parseFloat(h.unavoidableResidenceYears) <= 0)
    return { field: "unavoidableResidenceYears", message: "부득이한 사유 주택의 거주기간(년)을 입력하세요." };
  // 3호의 기준시가는 「취득 당시」다 — 미입력이면 엔진이 판정 불가로 두고 배제하지 않는다(F-16).
  if (!h.acquisitionOfficialPrice)
    return { field: "acquisitionOfficialPrice", message: "부득이한 사유 주택의 취득 당시 기준시가를 입력하세요." };
  return null;
}

/**
 * §155⑧ 수도권 밖 부득이 주택(영 §167의10①4호 겸용) — 사유 해소일 또는 「사유가 양도일 현재 해소되지 않음」 택일(#31).
 * ⑫ `unavoidableOutsideCapitalHouseSchema`의 거울이다 — 빈 값은 「모름」이라 엔진이 특례를 적용하지 않는다.
 *
 * 양도일 당일·뒤 취득 행(`uocRowAcquiredAfterTransfer`)은 ④가 명부에 싣지 않아 ⑫가 보지 않는 행이고, ⑤ 카드가 「반영되지 않음」이라
 * 밝히는 행이다 — 그 행에 해소일·미해소 택일을 요구하면 화면이 모순이므로 묻지 않는다(⑫ 거울). 양도일을 모르면 거르지 않는다.
 */
export function houseUnavoidableOutsideCapitalIssue(
  h: Pick<
    HouseEntry,
    | "oneHouseUnavoidableOutsideCapital"
    | "unavoidableOutsideCapitalResolvedDate"
    | "unavoidableOutsideCapitalUnresolved"
    | "acquisitionDate"
  >,
  transferDate: string | undefined,
): HouseRowIssue | null {
  if (!h.oneHouseUnavoidableOutsideCapital) return null;
  if (uocRowAcquiredAfterTransfer(h, transferDate)) return null;
  const issue = unavoidableOutsideCapitalStatusIssue({
    resolvedDate: h.unavoidableOutsideCapitalResolvedDate,
    unresolved: h.unavoidableOutsideCapitalUnresolved,
  });
  return issue ? { field: "unavoidableOutsideCapitalResolvedDate", message: issue.message } : null;
}

/**
 * §155⑧ 「각각 1개씩」 — ⑧ 표시 행이 둘 이상이면 **첫 ⑧ 행 다음** 행마다 `{ index, firstIndex }`를 돌려준다.
 *
 * 법문(실독 2026-10-13 · MST 290841): ⑧은 「부득이한 사유로 취득한 수도권 밖에 소재하는 주택과 그 밖의 주택(일반주택)을
 * 국내에 **각각 1개씩** 소유하고 있는 1세대」에만 적용되고, 영 §167의10①4호는 「제155조제8항에 따른 수도권 밖에 소재하는
 * 주택」을 그대로 인용한다 ⇒ ⑧ 주택은 **한 채**다.
 *
 * 세대 판정(`findUnavoidableOutsideCapitalRow`)과 중과 4호 분기(`multi-house-surcharge-exclusion.ts`)는 모두 **첫 ⑧ 행**을 본다.
 * 둘째 행을 허용하면 사유·해소일은 첫 행에서, 「중과 주택 수 2채 안인가」는 다른 행에서 읽는 모순이 생겼다(PR #2155 후속).
 * ⑫ refine이 이 leaf를, 계산기 ⑧·판정 메뉴 ⑧은 양도일 보유 행으로 거른 `duplicateOwnedUnavoidableOutsideCapitalRows`를 쓴다. 행 키 이름이 층마다 달라(폼 `oneHouseUnavoidableOutsideCapital` ·
 * API `isUnavoidableOutsideCapital`) 표시 여부 배열을 받는다.
 */
export function duplicateUnavoidableOutsideCapitalRows(
  flags: ReadonlyArray<boolean | undefined>,
): { index: number; firstIndex: number }[] {
  const firstIndex = flags.findIndex((f) => f === true);
  if (firstIndex < 0) return [];
  return flags.flatMap((f, index) => (f === true && index > firstIndex ? [{ index, firstIndex }] : []));
}

/**
 * ⑧ 계산기·판정 메뉴 — **양도일 현재 보유 행만** 세어 `duplicateUnavoidableOutsideCapitalRows`를 돌린다(색인은 명부 원래 순번).
 *
 * 세대 판정(`deriveOneHouseFactsFromHouses`)과 ④ 엔진 명부(`buildHousesPayload`)가 `housesOwnedAtTransfer`로 거른 행만 보므로,
 * 양도일 당일·이후 취득 행이나 §154⑨ 「먼저 양도」 선택 행의 ⑧ 표시는 어느 판정에도 실리지 않는다 — 그 행과 겹쳐도 막지 않는다.
 * 양도일이 없으면 leaf가 거르지 않으므로 전체 행을 센다(차단 유지). ⑫는 ④가 이미 거른 명부를 받아 같은 결과가 된다.
 */
export function duplicateOwnedUnavoidableOutsideCapitalRows(
  houses: readonly HouseEntry[] | undefined,
  transferDate: string | undefined,
  primaryKind: string | undefined,
): { index: number; firstIndex: number }[] {
  const owned = new Set(housesOwnedAtTransfer(houses, transferDate, primaryKind));
  return duplicateUnavoidableOutsideCapitalRows(
    (houses ?? []).map((h) => (owned.has(h) ? h.oneHouseUnavoidableOutsideCapital : undefined)),
  );
}

/** ⑧·⑫ 공용 문구 — `firstLabel`은 먼저 표시한 행(「보유 주택 N」 등). */
export function duplicateUnavoidableOutsideCapitalMessage(firstLabel: string): string {
  return (
    `§155⑧ 수도권 밖 부득이 주택은 한 채만 표시할 수 있습니다 — ${firstLabel}에도 표시돼 있습니다. ` +
    `이 특례는 그 주택과 일반주택을 「각각 1개씩」 소유한 세대에만 적용되므로(소득세법 시행령 §155⑧) 해당하는 한 행에만 켜세요.`
  );
}

/**
 * ⑤ — 편집 중인 행 말고 §155⑧ 표시가 있는 첫 행의 번호(1부터). 없으면 `undefined`.
 * ⑧과 같은 범위(`housesOwnedAtTransfer`)다 — 편집 중인 행이나 상대 행이 양도일 현재 보유 행이 아니면 겹침이 아니다.
 */
export function otherUocRowNumberOf(
  houses: readonly HouseEntry[],
  editingId: string,
  transferDate: string | undefined,
  primaryKind: string | undefined,
): number | undefined {
  const owned = new Set(housesOwnedAtTransfer(houses, transferDate, primaryKind));
  if (!houses.some((h) => h.id === editingId && owned.has(h))) return undefined;
  const i = houses.findIndex((h) => h.id !== editingId && owned.has(h) && h.oneHouseUnavoidableOutsideCapital === true);
  return i < 0 ? undefined : i + 1;
}

/**
 * ⑤ 「반영 안 됨」 안내 — §155⑧ 표시가 켜진 행이 **양도일 당일 또는 그 뒤에 취득한 행**인가 (사용자 결정 2026-10-13).
 *
 * 그 행은 세대 판정(`deriveOneHouseFactsFromHouses`)·④ 엔진 명부(`buildHousesPayload`)가 거르는 `housesOwnedAtTransfer`의
 * 같은 leaf(`isOwnedAtTransfer` — 같은 날 취득 = 양도 후 취득)에서 빠지므로 ⑧ 표시를 켜도 어느 판정에도 실리지 않는다.
 * ⑧ 중복 차단(`duplicateOwnedUnavoidableOutsideCapitalRows`)이 그 행을 세지 않게 된 짝이다 — 막지는 않되 화면이 사실을 밝힌다.
 *
 * 취득일·양도일을 모르면 `isOwnedAtTransfer`가 「보유」로 보므로 false다(모름을 「뒤 취득」으로 단정하지 않는다).
 * 저장하지 않고 카드의 취득일·양도일에서 렌더 때마다 도출한다. §154⑨ 「먼저 양도」 선택 행은 취득일 축이 아니라 여기서 다루지 않는다.
 */
export function uocRowAcquiredAfterTransfer(
  house: Pick<HouseEntry, "oneHouseUnavoidableOutsideCapital" | "acquisitionDate">,
  transferDate: string | undefined,
): boolean {
  return house.oneHouseUnavoidableOutsideCapital === true && !isOwnedAtTransfer(house.acquisitionDate, transferDate);
}
