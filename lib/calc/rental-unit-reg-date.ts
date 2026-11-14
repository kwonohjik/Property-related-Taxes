/**
 * §155⑳ 임대주택 호 — 등록일 칸·승계 종류 변경 시 「임대 구분」 자가 치유 (G-3 · 계획서 PR-2 ⑤).
 *
 * 임대 구분은 **실효 등록 기준**(`rentalUnitRegistrationBasis` — 증여 승계면 증여자 등록)으로 선택 가능 여부가 갈린다.
 * 그 기준이 바뀌는 입력(등록일 6칸·승계 종류)이 바뀔 때 무효가 된 현재 선택만 장기일반으로 되돌린다.
 * onChange 이벤트에서 한 번에 계산해 돌려준다(useEffect → store 미러링 금지).
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import { deriveCategoryAvailability } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import { registeredDateAfterApplicationChange, withRentalSuccession } from "@/lib/stores/calc-wizard-asset-rental-period";
import type { RentalSuccessionForm } from "@/lib/stores/calc-wizard-asset-rental-period";
import { rentalUnitRegistrationBasis } from "./rental-succession";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type RentalUnitForm = AssetForm["rentalHousingException"]["rentalUnits"][number];

export type RentalRegDateKey =
  | "businessRegistrationDate"
  | "rentalRegistrationDate"
  | "rentalRegisteredDate"
  | "donorBusinessRegistrationDate"
  | "donorRentalRegistrationDate"
  | "donorRentalRegisteredDate";

const toDateOrNull = (s: string) => toOptionalDate(s) ?? null;

/** 실효 등록 기준으로 현재 임대 구분이 무효이면 장기일반으로 되돌린다(유효하면 그대로). */
function healRentalCategory(next: RentalUnitForm): RentalUnitForm {
  const b = rentalUnitRegistrationBasis(next);
  const avail = deriveCategoryAvailability(
    toDateOrNull(b.businessRegistrationDate),
    toDateOrNull(b.rentalRegistrationDate),
    toDateOrNull(b.rentalRegisteredDate),
  );
  // avail[...]가 undefined일 수 있음(stale/legacy rentalCategory) — 옵셔널 체이닝으로 크래시 방지 + 유효 기본값으로 self-heal
  return avail[next.rentalCategory]?.available ? next : { ...next, rentalCategory: "long_general" };
}

/** 등록일 칸 변경 — 신청일을 넣으면 등록일이 비었거나 종전 신청일과 같을 때 같은 날로 따라간다(V-3). 본인·증여자 칸 공통. */
export function applyRentalRegDate(unit: RentalUnitForm, key: RentalRegDateKey, v: string): RentalUnitForm {
  const next: RentalUnitForm = { ...unit, [key]: v };
  if (key === "rentalRegistrationDate") {
    next.rentalRegisteredDate = registeredDateAfterApplicationChange(unit.rentalRegistrationDate, unit.rentalRegisteredDate, v);
  }
  if (key === "donorRentalRegistrationDate") {
    next.donorRentalRegisteredDate = registeredDateAfterApplicationChange(unit.donorRentalRegistrationDate, unit.donorRentalRegisteredDate, v);
  }
  return healRentalCategory(next);
}

/** 승계 종류 변경 — 종류·개월·증여자 칸 정리(`withRentalSuccession`) 뒤 실효 등록 기준이 바뀌었으니 임대 구분도 점검한다. */
export function applyRentalSuccession(unit: RentalUnitForm, kind: RentalSuccessionForm): RentalUnitForm {
  return healRentalCategory(withRentalSuccession(unit, kind));
}
