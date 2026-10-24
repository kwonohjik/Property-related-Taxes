/**
 * 양도세 PHD(개별주택가격 미공시 취득 환산) 결과의 «환산 …가격» 이름 — 주택 종류별. (단일 정의)
 *
 * 소득세법 시행령 §164⑥·⑦ 산식으로 구한 취득 당시 주택가격의 이름은 주택 종류로 갈린다.
 *   · 단독·다가구 → «환산 개별주택가격»
 *   · 공동주택    → «환산 공동주택가격»
 * 이 둘 외의 조어(«추정값»·«법정 값»·«취득 당시 …가격 산식으로 계산한…» 등)는 쓰지 않는다 (memory `feedback_no_coined_legal_terms`).
 *
 * 주택 종류는 엔진 result에 없다 — 입력 위젯(`PreHousingDisclosureSection`)의 라디오가 쓰는 폼 필드
 * `AssetForm.phdHousingType`(표시 축 — API 페이로드에 싣지 않는다)에서 읽어 내려온다
 * (`saleSplitActual`·`exemptionNote` 와 같은 규약). 필드가 없는 옛 이력·미입력은 «단독·다가구»다.
 *
 * 위치: 결과 화면(components)·PDF(lib/pdf)·⑧ 검증 메시지(lib/calc)가 함께 읽으므로 lib/calc에 둔다.
 * `AssetForm`은 타입으로만 가져온다(런타임 import 순환 없음).
 * 상속 주택(영 §163⑨2호 경로)의 같은 이름은 `convertedHousePriceNames`(`lib/tax-engine/inheritance-house-valuation.ts`)다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 이 자산의 PHD 주택 종류가 공동주택인가 — 호출부가 결과 카드에 넘기는 불리언의 단일 정의. */
export function isPhdApartment(asset: Pick<AssetForm, "phdHousingType"> | undefined): boolean {
  return asset?.phdHousingType === "apartment";
}

/** §164⑦ 산식 결과의 이름 — 공동주택 «환산 공동주택가격», 그 밖(미지정·옛 이력 포함) «환산 개별주택가격». */
export function phdConvertedPriceName(apartment: boolean | undefined): string {
  return apartment ? "환산 공동주택가격" : "환산 개별주택가격";
}

/**
 * 환산의 재료인 **고시 가격 자체**의 이름 — 공동주택 «공동주택가격», 그 밖 «개별주택가격».
 * 결과 이름(`phdConvertedPriceName`)과 한 문장에 나올 때(예: «…주택가격 최초 공시일 전이면 … 환산 …가격») 짝을 맞추는 데 쓴다.
 */
export function phdDisclosedPriceName(apartment: boolean | undefined): string {
  return apartment ? "공동주택가격" : "개별주택가격";
}

/**
 * 배율 초과 분리 카드·⑧ 메시지가 쓰는 **주택 종류** — 단독·다가구 / 공동주택 / 모름. (단일 정의 — 카드와 ⑧이 같은 함수를 읽는다)
 *
 * `phdHousingType`만 읽으면 안 된다 — 그 필드는 PHD 입력 패널 라디오의 값이고 기본값이 «individual»이라(`createInitialAssetForm`·migrate),
 * 패널을 연 적 없는 공동주택(예: 비환산 방식)도 «individual»로 보여 «개별주택가격»이 표시된다. 그래서 **사용자가 직접 정한 값·세대 식별 사실**만 신호로 읽고,
 * 어느 신호도 없으면 «모름»으로 두어 두 이름을 함께 적는다(추정 금지 — `PRE_DISCLOSURE_STD_PRICE_HINT`와 같은 방식).
 *
 * 우선순위(위가 이긴다):
 *   1. `phdHousingType === "apartment"` — 기본값이 아닌 값은 PHD 라디오에서 사용자가 골랐을 때뿐이다. 사용자가 명시한 값이 우선.
 *   2. `inheritanceAssetKind` — 기본값 «land»가 아닌 값은 주택 구분 픽커에서 사용자가 골랐을 때뿐(④가 엔진에 싣는 값과 같은 필드).
 *   3. 동·호가 **둘 다** 채워짐 — 공동주택 세대 목록에서 골랐다는 사실(개별주택 공시는 동·호가 빈 행으로 온다). 상속 경로의 주택 구분 파생
 *      (`deriveInheritanceHouseKind`)이 쓰는 것과 같은 조건이라 한 화면의 두 곳이 어긋나지 않는다.
 * «individual»(PHD 라디오 기본값)은 신호로 읽지 않는다 — 기본값과 사용자가 고른 값을 구분할 수 없다.
 * 위 어느 것도 아니면 «unknown». 결과 화면·PDF(`isPhdApartment`)는 PHD 패널을 반드시 거치므로 이 함수를 쓰지 않는다.
 */
export type HousingKind = "individual" | "apartment" | "unknown";

export function resolveHousingKind(
  asset: Pick<AssetForm, "phdHousingType" | "inheritanceAssetKind" | "addressDong" | "addressHo"> | undefined,
): HousingKind {
  if (!asset) return "unknown";
  if (asset.phdHousingType === "apartment") return "apartment";
  if (asset.inheritanceAssetKind === "house_apart") return "apartment";
  if (asset.inheritanceAssetKind === "house_individual") return "individual";
  if (asset.addressDong?.trim() && asset.addressHo?.trim()) return "apartment";
  return "unknown";
}

/** `resolveHousingKind` 결과에 따른 §164⑥·⑦ 산식 결과 이름 — 모름이면 두 이름을 함께 적는다. */
export function housingConvertedPriceName(kind: HousingKind): string {
  return kind === "unknown"
    ? `${phdConvertedPriceName(false)}(공동주택은 ${phdConvertedPriceName(true)})`
    : phdConvertedPriceName(kind === "apartment");
}

/** `resolveHousingKind` 결과에 따른 고시 가격 자체의 이름 — 모름이면 두 이름을 함께 적는다. */
export function housingDisclosedPriceName(kind: HousingKind): string {
  return kind === "unknown"
    ? `${phdDisclosedPriceName(false)}(공동주택은 ${phdDisclosedPriceName(true)})`
    : phdDisclosedPriceName(kind === "apartment");
}

/** «…가격 최초 공시일» 뒤에 붙이는 날짜 — 2005-04-30은 개별주택가격의 최초 공시일이다(공동주택의 최초 공시일은 자산마다 다르다). */
export function housingFirstDisclosureDateNote(kind: HousingKind): string {
  if (kind === "apartment") return "";
  return kind === "unknown" ? "(개별주택은 2005-04-30)" : "(2005-04-30)";
}

/**
 * 공동주택의 «취득시 공동주택가격(부수토지 포함 총액)» 입력 안내 — 배율 초과 분리 카드 hint와 ⑧ 메시지가 함께 읽는 **핵심 문장**. (단일 정의 — 끝에 마침표·붙임말 없음)
 *
 * 공동주택은 취득일(고정 2005-04-30)로 «공시가격이 없었다»를 단정하지 않는다 — 2005.4.30. 전 취득이라도 국세청장 고시 기준시가가 있던 아파트는 그 값이 맞고,
 * 2005.4.30. 뒤 취득이라도 그 단지의 첫 공시가 늦으면 공시가격이 없다. 그래서 날짜와 무관하게 «있었으면 그 값, 없었으면 §164⑥·⑦ 산식 결과»를 한 문장으로 안내한다.
 */
export const APARTMENT_ACQ_PRICE_SENTENCE =
  `취득 당시 ${phdDisclosedPriceName(true)}(국세청장이 고시한 기준시가 포함)이 있었으면 그 값을, ` +
  `없었으면 소득세법 시행령 §164⑥·⑦ 산식으로 계산한 ${phdConvertedPriceName(true)}(부수토지 포함 총액)을 입력하세요`;

/** 공동주택 카드 hint에 핵심 문장 뒤로 붙는 안내 — 처음 매겨진 가격의 주체에 따라 §164⑥/⑦이 갈린다(`apart-nts-price.ts` APART_FIRST_PRICE_AGENCY_REQUIRED_MESSAGE 참조). */
export const APARTMENT_ACQ_PRICE_AGENCY_NOTE = "처음 매겨진 가격이 국세청장 고시면 §164⑥, 국토교통부장관 공시면 §164⑦입니다";

/**
 * PHD 산식 조문 표시 — 공동주택은 처음 매겨진 가격이 국세청장 고시 기준시가면 §164⑥, 국토교통부장관 공시 공동주택가격이면 §164⑦이다.
 * 두 산식·두 단서(⑧·⑤ 준용)가 같아 값이 같으므로 고르게 하지 않고 함께 적는다. 단독·다가구는 §164⑦뿐이다(§164⑥은 오피스텔·상업용 건물·공동주택만).
 * 계획서: docs/00-pm/phd-fill-164-6-apartment.plan.md §9 (Q-1 (a))
 */
export function phdClause(apartment: boolean | undefined): string {
  return apartment ? "§164⑥·⑦" : "§164⑦";
}

/** 취득 당시 이미 있었는지 따지는 가격의 이름 — 공동주택은 국세청장 고시 기준시가를 포함한다(`APARTMENT_ACQ_PRICE_SENTENCE`와 같은 표현). */
export function phdAcqDisclosedPriceName(apartment: boolean | undefined): string {
  return apartment ? `${phdDisclosedPriceName(true)}(국세청장이 고시한 기준시가 포함)` : "주택공시가격";
}
