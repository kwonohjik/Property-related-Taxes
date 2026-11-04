/**
 * §155⑳ 임대주택 카드 「아파트 여부」 문항 범위 — ⑤(`RentalUnitCard`)·④(`transfer-tax-api-rental-housing.ts`)가 같은 술어를 쓴다(3중 패턴).
 *
 * 단기 6년(아·자목, `short_6y`)은 아파트를 등록할 수 없는 유형이라 문항을 묻지 않는다. 그 전에 다른 구분에서 고른 「아파트」가 store에
 * 남아 엔진에 닿으면 아·자목 아파트 일괄 배제(`rental-article/check.ts`)로 세액이 바뀌었다(SYNC-3 · 계획서
 * `docs/00-pm/rental-155-20-review-fixes.plan.md` PR-4) — 묻지 않는 문항의 값은 보내지 않는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type RentalUnitForm = AssetForm["rentalHousingException"]["rentalUnits"][number];

export function rentalUnitApartmentInScope(u: Pick<RentalUnitForm, "rentalCategory">): boolean {
  return u.rentalCategory !== "short_6y";
}
