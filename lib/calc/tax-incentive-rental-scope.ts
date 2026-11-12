/**
 * 소령 §167의3①3호 「감면대상장기임대주택」 — ⑤ 노출 · ④ 전송 · ⑧ 검증의 **단일 술어**.
 *
 * 법문(MST 290841 · 2026.10.1. 시행 실독): 「3. 「조세특례제한법」 제97조ㆍ제97조의2 및 제98조에 따라
 * 양도소득세가 감면되는 임대주택으로서 5년 이상 임대한 국민주택(이하 이 조에서 "감면대상장기임대주택"
 * 이라 한다). 이 경우 감면대상장기임대주택이 … 아파트 … 민간매입임대주택인 경우에는 제11항에 따른
 * 기한까지 양도하는 주택으로 한정한다.」
 *
 * 🔴 종전에는 엔진(`isTaxIncentiveRentalHousingExempt`)만 있고 **입력 경로가 0곳**이었다 —
 *    폼 칸·④ 매핑·⑫ Zod 키·⑭ 매퍼가 모두 없어 그 분기가 잠들어 있었다(과다 과세 방향).
 *
 * ## 양도 주택은 2호 선언과 세 사실을 공유한다
 *
 * 「임대기간」·「아파트 여부」·「국민주택(규모)」는 한 주택의 **같은 사실**이고 엔진 `HouseInfo`도
 * 한 칸씩만 가진다. 양도 주택의 2호 선언(`sellingHouseExclusion.longTermRental`)이 켜져 있으면 그 칸이
 * 이미 값을 싣고 있으므로 3호는 **그 값을 쓴다**(두 칸이 다른 값을 들고 엔진에서 한쪽이 조용히 지는
 * 일을 막는다). 국민주택규모는 2호 위젯이 **나목(B)에서만** 묻기 때문에 그때만 공유한다.
 * 명부 행은 처음부터 한 칸(`HouseEntry.rentalPeriodYears` 등)을 두 호가 함께 쓴다.
 */
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TaxIncentiveRentalFacts } from "@/lib/stores/calc-wizard-asset-nbl";
import { aptDeadlineExtensionIncomplete, aptDeadlineExtensionPayload } from "./apt-deadline-extension-scope";
import { rentalDeclarationUrbanLifeQuestionInScope } from "./apt-deadline-extension-scope";
import type { RentalDeclaration } from "@/lib/stores/calc-wizard-asset-nbl";

type SellingExclusion = TransferFormData["sellingHouseExclusion"];

/**
 * ⑤ 「양도 주택이 조특법 감면 임대주택인 경우」 섹션을 렌더하는가 — 2호 섹션과 **같은 게이트(2채)**.
 * 3호도 2주택에서 §167의10①2호(「제167조의3제1항제2호부터 제8호까지」 준용)로 성립하고 엔진이
 * `effectiveHouseCount >= 2`에서 판정한다. 켜져 있으면 주택수와 무관하게 남긴다(끌 화면이 사라지면
 * ⑧의 임대기간 요구가 막다른 길이 된다).
 */
export function sellingHouseTaxIncentiveRentalVisible(form: TransferFormData): boolean {
  if (form.sellingHouseExclusion?.taxIncentiveRental?.isTaxIncentiveRental) return true;
  return parseInt(form.householdHousingCount || "1", 10) >= 2;
}

/** 양도 주택의 2호 선언이 켜져 있으면 임대기간·아파트 여부는 그 칸을 쓴다. */
export function sellingTaxIncentiveSharesRentalFacts(se: SellingExclusion): boolean {
  return !!se?.longTermRental?.isLongTermRental;
}

/** 2호 유형이 나목(B)이면 국민주택규모도 2호 칸을 쓴다 — 2호 위젯이 그 칸을 노출하는 유일한 유형이다. */
export function sellingTaxIncentiveSharesNationalSize(se: SellingExclusion): boolean {
  return sellingTaxIncentiveSharesRentalFacts(se) && se?.longTermRental?.rentalType === "B";
}

/** 양도 주택 3호의 **유효 사실** — 미선언이면 undefined. ⑤·④·⑧이 같은 값을 본다. */
export function effectiveSellingTaxIncentiveRental(se: SellingExclusion): TaxIncentiveRentalFacts | undefined {
  const tir = se?.taxIncentiveRental;
  if (!tir?.isTaxIncentiveRental) return undefined;
  const ltr = se?.longTermRental;
  const sharesRental = sellingTaxIncentiveSharesRentalFacts(se);
  return {
    ...tir,
    // 옛 기록의 연수도 같은 규칙으로 고른다(④는 보내지 않지만 양도 주택 교체가 옮긴다 — `swap-selling-house.ts`).
    rentalPeriodYears: sharesRental ? ltr?.rentalPeriodYears : tir.rentalPeriodYears,
    rentalStartDate: sharesRental ? ltr?.rentalStartDate : tir.rentalStartDate,
    rentalEndDate: sharesRental ? ltr?.rentalEndDate : tir.rentalEndDate,
    isApartment: sharesRental ? ltr?.isApartment : tir.isApartment,
    isNationalSizeHousing: sellingTaxIncentiveSharesNationalSize(se)
      ? ltr?.isNationalSizeHousing
      : tir.isNationalSizeHousing,
  };
}

/**
 * 양도 주택 3호 칸이 「도시형 생활주택인 아파트」를 묻는가 — ⑤(`TaxIncentiveRentalFields`)가 그 질문을 여는 조건과 같다
 * (아파트 · 민간매입 · 장기일반/단기). 아파트 여부는 2호가 켜져 있으면 2호 칸 값이다(유효 사실).
 */
export function sellingTaxIncentiveAsksUrbanLife(se: SellingExclusion): boolean {
  const eff = effectiveSellingTaxIncentiveRental(se);
  if (!eff?.isApartment || eff.isTaxIncentiveRentalPurchase !== true) return false;
  return eff.taxIncentiveRentalRegistrationType === "long_term_general" || eff.taxIncentiveRentalRegistrationType === "short_term";
}

/**
 * 양도 주택의 「「주택법」에 따른 도시형 생활주택인 아파트」 — 엔진 `HouseInfo` 한 칸에 실리는 **하나의 사실**(V-12 · 사용자 결정 2026-11-05).
 *
 * 2호(소령 §167의3①2호 가목2) 괄호 — 가·나·라·마목 아파트 양도기한만 비적용)와 3호 후단(같은 조 ①3호 — 매입 장기일반·단기 아파트)이
 * 같은 사실을 묻는다. 3호 칸이 묻는 범위면 **3호 칸의 답**, 아니면 2호 칸이 묻는 범위에서 2호 토글(켜면 true)이다. 어느 칸도 묻지 않으면
 * undefined — 화면에 없는 옛 값은 싣지 않는다. ⑤·④·⑧·양도 주택 교체가 같은 값을 본다.
 */
export function effectiveSellingUrbanLife(se: SellingExclusion): boolean | undefined {
  if (sellingTaxIncentiveAsksUrbanLife(se)) return se?.taxIncentiveRental?.isUrbanLifeHousingApartment;
  const ltr = se?.longTermRental;
  return rentalDeclarationUrbanLifeQuestionInScope(ltr) && ltr?.isUrbanLifeHousingApartment === true ? true : undefined;
}

/** 양도 주택에서 도시형 생활주택 사실을 묻는 칸이 있는가(3호 또는 2호) — 없으면 유효 사실은 정해지지 않는다(양도 주택 교체는 원값을 옮긴다). */
export function sellingUrbanLifeAsked(se: SellingExclusion): boolean {
  return sellingTaxIncentiveAsksUrbanLife(se) || rentalDeclarationUrbanLifeQuestionInScope(se?.longTermRental);
}

/** 2호 선언에 위 유효 사실을 덮은 보기 — 2호 위젯·④·⑧이 ⑪ 연장 칸 범위(`rentalDeclarationAptDeadlineInScope`)를 같은 값으로 판정한다. */
export function sellingRentalDeclarationView(se: SellingExclusion): RentalDeclaration | undefined {
  const ltr = se?.longTermRental;
  if (!ltr) return undefined;
  return { ...ltr, isUrbanLifeHousingApartment: effectiveSellingUrbanLife(se) };
}

/**
 * ④⑬ 3호 사실 → `houseSchema` 필드. 미선언이면 키를 만들지 않는다(`{}`).
 *
 * 후단 4사실은 **미입력이면 그대로 undefined로 둔다** — 엔진이 「모른다」로 읽어 후단 대상으로 보고(불리 적용 ·
 * 사용자 결정 2026-10-04) 결론이 갈리면 확인 필요를 고지한다. false로 채우면 근거 없이 「후단 대상 아님」이 된다.
 * `isApartment`는 여기서 다루지 않는다 — 명부 행은 행 칸이 이미 실리고, 양도 주택은 호출부가 정한다.
 */
export function taxIncentiveRentalPayload(f: TaxIncentiveRentalFacts | undefined): object {
  if (!f?.isTaxIncentiveRental) return {};
  return {
    isTaxIncentiveRental: true,
    // 3호도 임대개시일·종료일만 — 엔진이 자르지 않고 센다(소령 §167의3③은 2호 한정). 상속 개월은 2호 전용이라 싣지 않는다.
    rentalStartDate: f.rentalStartDate || undefined,
    rentalEndDate: f.rentalEndDate || undefined,
    isNationalSizeHousing: f.isNationalSizeHousing ?? false,
    isTaxIncentiveRentalPurchase: f.isTaxIncentiveRentalPurchase,
    taxIncentiveRentalRegistrationType: f.taxIncentiveRentalRegistrationType,
    isUrbanLifeHousingApartment: f.isUrbanLifeHousingApartment,
    // ⑪ 연장 사실 3-state(모름·없음·날짜) — 2호와 같은 leaf
    taxIncentiveRentalAptDeadlineExtension: aptDeadlineExtensionPayload(f.taxIncentiveRentalAptDeadlineExtension),
  };
}

/** ⑧ 임대개시일 미입력 판정 — 엔진은 미입력을 0년으로 읽어 3호를 **조용히** 불적용한다. */
export function taxIncentiveRentalPeriodMissing(f: TaxIncentiveRentalFacts | undefined): boolean {
  return !!f?.isTaxIncentiveRental && !f.rentalStartDate;
}

/**
 * ④ 2호 임대기간 사실 → `houseSchema` 필드(양도 주택 2호 선언·명부 행 공용). 연수는 싣지 않는다(Q-3).
 * 피상속인 개월은 「상속받아 계속 임대」가 켜져 있고 값이 있을 때만(조특령 §97⑤3호).
 */
export function rentalPeriodDatesPayload(r: {
  rentalStartDate?: string;
  rentalEndDate?: string;
  isInheritedRental?: boolean;
  decedentRentalMonths?: string;
}): object {
  const decedent = r.isInheritedRental ? parseFloat(r.decedentRentalMonths ?? "") : NaN;
  return {
    rentalStartDate: r.rentalStartDate || undefined,
    rentalEndDate: r.rentalEndDate || undefined,
    decedentRentalMonths: decedent > 0 ? decedent : undefined,
  };
}

/**
 * ⑧ 2호 임대기간 입력 문제 — 개시일 필수 여부는 호출부가 정하고(현행과 같은 범위), 여기서는 날짜 역전·상속 개월 미입력만 본다.
 */
export function rentalPeriodDatesIssue(r: {
  rentalStartDate?: string;
  rentalEndDate?: string;
  isInheritedRental?: boolean;
  decedentRentalMonths?: string;
}): string | null {
  if (r.rentalStartDate && r.rentalEndDate && r.rentalEndDate < r.rentalStartDate)
    return "임대 종료일은 임대개시일 이후여야 합니다.";
  if (r.isInheritedRental && !(parseFloat(r.decedentRentalMonths ?? "") > 0))
    return "상속받아 계속 임대하는 주택이면 피상속인 임대기간(개월)을 입력하세요.";
  return null;
}

/**
 * ⑧ 3호 후단 ⑪ 「연장 사유 있음」 입력이 덜 됐다(`aptDeadlineExtensionIncomplete` 문구) — ⑤(`TaxIncentiveRentalFields`)가
 * 그 칸을 여는 조건(아파트 · 민간매입 · 장기일반/단기 · 도시형 생활주택 아님)과 같은 범위에서만 본다.
 */
export function taxIncentiveAptDeadlineIncomplete(f: TaxIncentiveRentalFacts | undefined): string | null {
  if (!f?.isTaxIncentiveRental || !f.isApartment) return null;
  if (f.isTaxIncentiveRentalPurchase !== true || f.isUrbanLifeHousingApartment !== false) return null;
  const t = f.taxIncentiveRentalRegistrationType;
  if (t !== "long_term_general" && t !== "short_term") return null;
  return aptDeadlineExtensionIncomplete(f.taxIncentiveRentalAptDeadlineExtension);
}
