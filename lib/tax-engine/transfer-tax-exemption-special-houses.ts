/**
 * 1세대1주택 비과세 — **§155⑥⑦⑧ 특수주택 술어**(문화유산·농어촌·수도권 밖 부득이) + 2주택 전제 특례의 공용 주택 수 게이트.
 *
 * `transfer-tax-exemption-holding.ts`가 771줄로 위험구간(≥750)에 들어 분리했다(2026-11 리뷰 PR-2b · I-17). 이음매는
 * 「§155⑥⑦⑧ 요건·겹침(D3) 술어」와 「§154① 보유·거주」 사이다 — 이 블록은 나머지를 참조하지 않는다(단방향 끝점).
 * 하위 호환: `transfer-tax-exemption-holding.ts`가 이 모듈을 통째로 재수출하므로 기존 import 경로는 무변경이다.
 */

import { isWithinDeadline } from "./civil-period";
import { passesHouseholdGate } from "./transfer-inheritance-exclusion";
import { declaredRowAlreadyExcluded } from "./declared-row-excluded";
import { checkReturnToFarmFacts } from "./one-house/rural-return-to-farm-facts";
import type { TransferTaxInput, UnavoidableReasonKind, RuralHouseKind } from "./types/transfer.types";

export const UNAVOIDABLE_OUTSIDE_CAPITAL_YEARS = 3;

/**
 * §155⑧ 「해소된 날부터 3년」 개정규정의 적용 시작일 — 대통령령 제23588호(2012.2.2. 공포·시행).
 * 부칙 제10조 「제155조제8항의 개정규정은 이 영 시행 후 부득이한 사유가 해소된 분부터 적용한다」(DRF eflaw 실독 2026-10-11).
 * 종전 ⑧(2008.11.28. 신설)에는 해소 개념도 3년 기한도 없었으므로, 이 날 **전**에 해소된 분에는 기한을 걸지 않는다.
 * 시행일 당일 해소분은 「시행 후」로 보아 3년을 적용한다(`resolveUnavoidableResolvedDeadline`의 선례 규약).
 */
export const UNAVOIDABLE_OUTSIDE_CAPITAL_DEADLINE_RESOLVED_START = new Date("2012-02-02");

/** 해소일이 3년 기한의 적용 대상인가 — 2012.2.2. 전 해소분은 종전 규정(기한 없음)이다. */
export function unavoidableResolvedDeadlineApplies(resolvedDate: Date): boolean {
  return resolvedDate.getTime() >= UNAVOIDABLE_OUTSIDE_CAPITAL_DEADLINE_RESOLVED_START.getTime();
}

/** 해소일이 있을 때의 기한 충족 — 2012.2.2. 전 해소분은 기한이 없어 항상 충족이다. */
export function unavoidableResolvedWithinDeadline(resolvedDate: Date, transferDate: Date): boolean {
  return !unavoidableResolvedDeadlineApplies(resolvedDate) || isWithinDeadline(resolvedDate, UNAVOIDABLE_OUTSIDE_CAPITAL_YEARS, transferDate);
}

// §155⑦1호·2호 — 거주 요건 연수.
export const RURAL_HOUSE_RESIDENCE_YEARS = 5;
// §155⑦ 단서 — 귀농주택(3호)은 취득일부터 5년 이내 일반주택 양도에 한정.
export const RURAL_RETURN_TO_FARM_TRANSFER_YEARS = 5;
/**
 * D15 — ⑦ 단서는 대통령령 제26982호(2016.2.17. 공포·시행)가 신설했다(2016-01-01본에 없음 · DRF eflaw 실독).
 * 부칙 제10조 「제155조제7항 각 호 외의 부분 단서 … 의 개정규정은 이 영 시행 이후 **귀농주택을 취득하는 분부터**
 * 적용한다」 · 제22조 「이 영 시행 전에 귀농주택을 취득한 경우에는 … 종전의 규정에 따른다」 — 기준축은 양도일이
 * 아니라 귀농주택 취득일이다.
 */
export const RURAL_RETURN_TO_FARM_DEADLINE_ACQ_START = new Date("2016-02-17");

/** ⑦ 단서(귀농주택 취득일부터 5년 이내 양도)가 이 귀농주택에 붙는가 — 2016-02-17 전 취득분은 종전 규정(단서 없음). */
export function ruralReturnToFarmDeadlineApplies(acquisitionDate: Date): boolean {
  return acquisitionDate.getTime() >= RURAL_RETURN_TO_FARM_DEADLINE_ACQ_START.getTime();
}
// §155⑩3호 — 귀농주택 대지면적 상한(㎡).
export const RURAL_RETURN_TO_FARM_MAX_LAND_SQM = 660;

/** §155⑦ 각 호 라벨 (exemptReason 표시용 — 내부 id 노출 금지) */
export const RURAL_HOUSE_LABEL: Record<RuralHouseKind, string> = {
  inherited: "1호 상속",
  farm_exit: "2호 이농",
  return_to_farm: "3호 귀농",
};

/**
 * §155⑦ 농어촌주택 요건 판정 — 「각각 1개씩 소유(2주택)」 + 소재 + 유형별 요건.
 *
 * 비과세(E-3.8)와 중과 배제(영 §167의10①15호)가 같은 값을 쓰도록 정본으로 분리한다.
 * §154① 충족은 여기서 보지 않는다(15호 ② 요소는 별도 게이트).
 */
export function qualifiesRuralHouse(
  input: Pick<
    TransferTaxInput,
    "householdHousingCount" | "transferDate" | "ruralHouse" | "inheritedHouseExclusionCount" | "knownHouseExclusionHouseIds"
  >,
): boolean {
  if (!qualifiesRuralHouseApartFromDeadline(input)) return false;
  const r = input.ruralHouse!;
  if (r.kind !== "return_to_farm") return true;
  // ⑦ 단서 — 귀농주택(3호)은 그 취득일부터 5년 이내 일반주택 양도에 한정(2016-02-17 이후 취득분만 — D15).
  if (!ruralReturnToFarmDeadlineApplies(r.acquisitionDate!)) return true;
  return isWithinDeadline(r.acquisitionDate!, RURAL_RETURN_TO_FARM_TRANSFER_YEARS, input.transferDate);
}

/**
 * §155②(단독상속) · ③(공동상속 소수지분) 상속주택 제외가 **둘 다** 걸린 세대인가 — 「세 특례」 상한의 한 축.
 *
 * 제외 풀은 풀마다 최대 1채라 `inheritedHouseExclusionCount ≥ 2`는 ②와 ③을 **동시에** 적용했다는 뜻이다. 그 위에
 * 2주택 전제 §155 특례(①·④⑤·⑥·⑦·⑧)를 하나 더 얹으면 세 특례가 겹친다. 국세청은 ①②③ 중첩 적용을 불허했고
 * (사전-2023-법규재산-0209: 「…제155조제1항, 제2항, 및 제3항을 중첩 적용하여 같은 법 시행령 제154조제1항을 적용할 수 없는 것」),
 * 세 특례를 인정한 해석은 확인되지 않았다 — 사용자 결정 2026-10-06 「세 특례 불허 + 확인 필요」(`inheritedHouseExclusionCount` 주석).
 * 3주택 술어(`mergeOverlapTwoHouseHolds` · `ruralTemporaryTwoHouseOverlapCountHolds` · 이중 합가)는 이미 `> 0`으로 막고 있다 —
 * 상속주택을 둘 빼서 **2주택이 남는** 경로가 이 상한을 지나쳤다(S01-2).
 */
export function inheritedBothPoolsExcluded(input: Pick<TransferTaxInput, "inheritedHouseExclusionCount">): boolean {
  return (input.inheritedHouseExclusionCount ?? 0) >= 2;
}

/**
 * 2주택 전제 §155 특례(①·④⑤·⑥·⑦·⑧)의 **공용 주택 수 게이트** — 「각각 1개씩 소유(2주택)」이고 ②③ 동시 제외로 세 특례가
 * 되지 않을 것. 비과세 · 중과 15호 의제 · 판정 보류(pending)가 같은 술어를 쓴다.
 */
export function twoHouseSpecialCountHolds(
  input: Pick<TransferTaxInput, "householdHousingCount" | "inheritedHouseExclusionCount">,
): boolean {
  return input.householdHousingCount === 2 && !inheritedBothPoolsExcluded(input);
}

/**
 * D3 — §155⑦(농어촌주택)과 §155①(일시적 2주택)이 **겹쳐 3주택**인가 — 주택 수 축만 본다.
 *
 * ⑦ 농어촌주택과 일반주택을 각각 1개씩 소유한 1세대가 신규 주택을 취득해 3주택이 된 상태에서 종전 일반주택을
 * 양도하면, 농어촌주택을 빼고 §155①을 적용한다(서면인터넷방문상담4팀-3617 · 서면인터넷방문상담4팀-977 —
 * 조특법 §99의4 농어촌주택도 같다: 부동산납세과-2367 · 서면-2024-부동산-1967).
 * 그래서 ⑦ 요건은 **신규 주택을 뺀 2주택 기준**으로 본다(`householdHousingCount: 2`).
 *
 * 🔑 **3주택까지만** — ⑦·⑳·① 세 특례를 함께 적용한 4주택은 부인됐다(부동산납세과-870). §155②③ 상속주택 제외가
 *    겹친 경우(세 특례)도 성립하지 않는다(`inheritedHouseExclusionCount`). §155① 기간 요건은
 *    여기서 보지 않는다 — 호출부(비과세 E-3 · 중과 15호 `resolveDeemedOneHouseBy155`)가 2주택과 같은 술어로 본다.
 */
export function ruralTemporaryTwoHouseOverlapCountHolds(
  input: Pick<
    TransferTaxInput,
    "householdHousingCount" | "transferDate" | "ruralHouse" | "inheritedHouseExclusionCount" | "knownHouseExclusionHouseIds"
  >,
): boolean {
  return ruralTemporaryTwoHouseOverlapApartFromDeadline(input) && qualifiesRuralHouse({ ...input, householdHousingCount: 2 });
}

/**
 * D3 주택 수 술어에서 **⑦ 단서 5년 기한만 뺀** 것 — `ruralTemporaryTwoHouseOverlapCountHolds` = 이 술어 && 기한 내(2026-11 리뷰 D-07).
 *
 * 기한만 넘긴 3주택은 「주택 수가 3채라 2주택에만 적용」이 아니라 「귀농주택 기한을 넘겼다」가 탈락 원인이다. 불성립 사유 · 기한 안내(pending) ·
 * 판정 메뉴의 신규 주택 후보 제외가 이 술어로 3주택 겹침을 알아본다 — 2주택의 `qualifiesRuralHouseApartFromDeadline`과 같은 짝이다.
 */
export function ruralTemporaryTwoHouseOverlapApartFromDeadline(
  input: Pick<
    TransferTaxInput,
    "householdHousingCount" | "transferDate" | "ruralHouse" | "inheritedHouseExclusionCount" | "knownHouseExclusionHouseIds"
  >,
): boolean {
  // 상속주택 제외까지 겹치면 세 특례 — 인정 해석 없음(`inheritedHouseExclusionCount` 주석).
  if ((input.inheritedHouseExclusionCount ?? 0) > 0) return false;
  return input.householdHousingCount === 3 && qualifiesRuralHouseApartFromDeadline({ ...input, householdHousingCount: 2 });
}

/**
 * §155⑥1호 문화유산 주택 + 일반주택 — 「각각 1개씩 소유(2주택)」 + 문화유산 주택 선언.
 *
 * 2·3호가 삭제돼 요건은 선언 boolean 하나다. 비과세(E-3.6)와 겸용주택 판정(S08-3)이 같은 술어를 쓴다.
 * §154① 충족은 여기서 보지 않는다 — 호출부(`meetsOneHouseHoldingResidence`)가 따로 AND한다.
 */
export function qualifiesCulturalHeritageHouse(
  input: Pick<
    TransferTaxInput,
    | "householdHousingCount"
    | "inheritedHouseExclusionCount"
    | "culturalHeritageHouse"
    | "culturalHeritageHouseId"
    | "knownHouseExclusionHouseIds"
  >,
): boolean {
  return (
    twoHouseSpecialCountHolds(input) &&
    input.culturalHeritageHouse === true &&
    !declaredRowAlreadyExcluded(input, input.culturalHeritageHouseId)
  );
}

/**
 * D3 — §155⑥1호(문화유산 주택)와 §155①(일시적 2주택)이 **겹쳐 3주택**인가 — 주택 수 축만 본다(2026-11 리뷰 D-02).
 *
 * ⑥은 ⑦과 같은 문형(「…각각 1개씩 소유하고 있는 1세대가 일반주택을 양도하는 경우에는 국내에 1개의 주택을 소유하고 있는 것으로 보아
 * 제154조제1항을 적용한다」)이고, 국세청은 문화재주택 + 일반주택 + 신규 주택 3주택에서 종전 일반주택을 신규 취득일부터 3년 안에
 * 양도하면 1세대1주택으로 보았다(상속증여세과-212, 2013.6.13.). 그래서 ⑥ 요건은 신규 주택을 뺀 2주택 기준으로 본다.
 * 상속주택 제외까지 겹치면 세 특례라 인정 해석이 없다(`inheritedHouseExclusionCount` 주석 — ⑦ D3와 같은 상한).
 */
export function heritageTemporaryTwoHouseOverlapCountHolds(
  input: Pick<
    TransferTaxInput,
    | "householdHousingCount"
    | "inheritedHouseExclusionCount"
    | "culturalHeritageHouse"
    | "culturalHeritageHouseId"
    | "knownHouseExclusionHouseIds"
  >,
): boolean {
  if ((input.inheritedHouseExclusionCount ?? 0) > 0) return false;
  return input.householdHousingCount === 3 && qualifiesCulturalHeritageHouse({ ...input, householdHousingCount: 2 });
}

/**
 * D3 — ⑥(문화유산)·⑦(농어촌) 특수주택이 §155①과 겹친 3주택인가. 일시적 2주택 분기의 **주택 수 게이트**를 쓰는 소비처
 * (비과세 E-3 · 중과 15호 의제 · pending · 요건 검토표 · 판정 보류 · 불성립 사유)가 이 하나를 쓴다. §155⑧(부득이)은 넣지 않는다 —
 * ⑧+① 정면 해석이 없어 결정 Q-18 (b)로 과세를 유지하고 「확인 필요」 문구만 둔다.
 */
export function specialHouseTemporaryTwoHouseOverlapCountHolds(
  input: Parameters<typeof ruralTemporaryTwoHouseOverlapCountHolds>[0] & Parameters<typeof heritageTemporaryTwoHouseOverlapCountHolds>[0],
): boolean {
  return ruralTemporaryTwoHouseOverlapCountHolds(input) || heritageTemporaryTwoHouseOverlapCountHolds(input);
}

/**
 * §155⑦ 농어촌주택 요건 중 **⑦ 단서의 5년 기한만 뺀** 나머지 — `qualifiesRuralHouse`와
 * pending 귀농 축(`one-house/pending.ts`)의 **같은 술어**(OH-23).
 *
 * pending은 「기한 하나만 남았을 때」만 기한을 안내한다. 기한 외 요건(소재·⑩2·3·5호)을 따로
 * 베껴 쓰면 한쪽만 개정 반영되므로, 기한 판정만 떼어 낸 이 함수를 둘이 함께 쓴다.
 */
export function qualifiesRuralHouseApartFromDeadline(
  input: Pick<
    TransferTaxInput,
    "householdHousingCount" | "transferDate" | "ruralHouse" | "inheritedHouseExclusionCount" | "knownHouseExclusionHouseIds"
  >,
): boolean {
  const r = input.ruralHouse;
  if (!twoHouseSpecialCountHolds(input) || !r) return false;
  if (declaredRowAlreadyExcluded(input, r.houseId)) return false;
  // 소재: 수도권 밖의 읍(도시지역 제외)·면 — 유형 불문 공통 요건.
  if (!r.isOutsideCapitalEupMyeon) return false;

  switch (r.kind) {
    case "inherited":
      // 1호: 피상속인이 취득 후 5년 이상 거주 + §155② 단서(동일세대 상속 배제 — 동거봉양 합가 전 보유분 예외, D7)
      return (r.decedentResidenceYears ?? 0) >= RURAL_HOUSE_RESIDENCE_YEARS && passesHouseholdGate(r);
    case "farm_exit":
      // 2호: 이농인이 취득일 후 5년 이상 거주. 이농했다가 그 주택으로 다시 귀농했으면 적용하지 않는다(부동산납세과-67).
      return (r.ownerResidenceYears ?? 0) >= RURAL_HOUSE_RESIDENCE_YEARS && r.returnedToFarmExitHouse !== true;
    case "return_to_farm":
      // 3호 + ⑩ 요건 (⑦ 단서 5년 기한은 호출부 몫)
      // 당초 5년 이상 거주한 이농주택으로 귀농하면 영농 목적으로 취득한 귀농주택이 아니다(재산세과-1504 · 부동산납세과-67).
      if (r.returnedToFarmExitHouse === true) return false;
      if (r.isHighPriceAtAcquisition === true) return false; // ⑩2호
      if ((r.landAreaSqm ?? Infinity) > RURAL_RETURN_TO_FARM_MAX_LAND_SQM) return false; // ⑩3호
      if (r.wholeHouseholdMoved !== true) return false; // ⑩5호
      // ⑩4호(영농·영어 목적) · ⑪(귀농 후 최초 1개) · 귀농 전 취득 일반주택 — 키가 없거나 「모름」이면 불성립(결정 #44)
      if (!checkReturnToFarmFacts(r, input.transferDate).qualified) return false;
      return !!r.acquisitionDate; // ⑦ 단서 판정 불가 → 적용하지 않는다
  }
}

/**
 * §155⑧ 요건 판정 — 「각각 1개씩 소유(2주택)」 + 「해소된 날부터 3년 이내」.
 *
 * 비과세(E-3.7)와 중과 배제(영 §167의10①4호)가 **같은 값을 써야** 한다 — 앞 계획서 F-2에서
 * 기한 규칙을 양쪽이 따로 구현했다가 「비과세 O / 중과배제 X」 모순이 났던 것과 같은 구조다.
 *
 * §154① 충족(「§154①을 적용한다」)은 여기서 보지 않는다 — 비과세는 `meetsOneHouseHoldingResidence`가,
 * 중과는 §167의10①4호가 §154①을 요구하지 않으므로(15호와 달리 문언에 없다) 별도로 다룬다.
 */
export function qualifiesUnavoidableOutsideCapital(
  input: Pick<
    TransferTaxInput,
    | "householdHousingCount"
    | "transferDate"
    | "unavoidableOutsideCapitalHouse"
    | "inheritedHouseExclusionCount"
    | "knownHouseExclusionHouseIds"
  >,
): boolean {
  const u = input.unavoidableOutsideCapitalHouse;
  if (!twoHouseSpecialCountHolds(input) || !u) return false;
  if (declaredRowAlreadyExcluded(input, u.houseId)) return false;
  // 해소일 또는 「양도일 현재 미해소」 택일(#31 · 2026-10-04 원칙) — 둘 다 없으면 「모름」이라 혜택 불성립이다(⑧·⑫가 차단하고
  //   엔진은 직접 호출 방어로 불성립). 종전에는 빈 값을 「미해소」로 읽어 3년 기한 없이 특례를 줬다(계획서 W-1).
  //   🔶 해소 전 양도에 특례를 적용하는 독법(「미해소」 선택)은 사전-2024-법규재산-0319가 질의 전제로 받친다.
  if (u.resolvedDate === undefined) return u.unresolvedAtTransfer === true;
  return unavoidableResolvedWithinDeadline(u.resolvedDate, input.transferDate);
}

/** §155⑧ 부득이한 사유 라벨 (exemptReason 표시용 — 내부 id 노출 금지) */
export const UNAVOIDABLE_REASON_LABEL: Record<UnavoidableReasonKind, string> = {
  study: "취학",
  work: "근무상 형편",
  illness: "질병 요양",
  other: "그 밖의 부득이한 사유",
};
