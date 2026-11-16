/**
 * 종부령 §3① 가격 상한 관련 칸 — 화면이 「무엇을 묻는가」의 단일 소스.
 * ⑤ 칸 표시(ExclusionInfoInput · RentalExclusionPriceBasisField) · ④ 전송(comprehensive-api)이 같은 술어를 쓴다.
 *   - 30호 이상 토글(`asksThirtyPlusUnits`) · 사용승인일(`asksUsageApprovalDate`) — comprehensive-api.ts에서 옮김
 *   - 기준 공시가격(`asksPriceBasisValue`) — 계획서 comprehensive-rental-excl-tax-defects-3.plan.md T-03 Q-1 a
 * 상한 금액은 엔진 `rentalPriceCap`을 그대로 부른다(화면에서 재정의하지 않는다).
 */
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { priceBasisApplies } from "@/lib/tax-engine/comprehensive-exclusion";
import { rentalPriceCap } from "@/lib/tax-engine/comprehensive-exclusion";
import type { RentalPriceCapInput } from "@/lib/tax-engine/comprehensive-exclusion";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { parseAmount } from "./number-parse";
import { priceRegistrationType } from "./comprehensive-rental-459ho";

/**
 * §3①1·2·7·8호 가목 「30호 이상」 상향 구간 — 대통령령 제35352호(2025.2.28.) 신설·2025 과세연도부터.
 * ⑤ 토글 표시 · ④ 전송이 같은 술어를 쓴다(엔진 `thirtyPlusTierApplies`와 같은 경계).
 */
const THIRTY_PLUS_REG_TYPES = new Set([
  "private_construction",
  "public_construction",
  "public_support_construction",
  "private_purchase_long",
  "private_purchase_short",
  "public_purchase",
  "public_support_purchase",
]);
export function asksThirtyPlusUnits(registrationType: string, assessmentYear: string): boolean {
  const year = parseInt(assessmentYear) || new Date().getFullYear();
  return THIRTY_PLUS_REG_TYPES.has(registrationType) && year >= 2025;
}

/**
 * §3①1호·7호 가목 건설임대 6억/9억 — 사용승인일(선택) 칸을 묻는가. 엔진 `builtRentalBaseCap`과 같은 경계:
 * 2021~2024 과세연도(2021년분 민간건설은 등록일로 보므로 공공건설만) · 공시가격이 6억 초과일 때만(6억 이하면 어느 쪽이든 성립).
 * 비면 엔진이 6억 + 확인 필요(⑧ 차단 없음 — 계획서 Q-2 a). 2025 이후는 전면 9억/12억(Q-3 a)이라 묻지 않는다.
 */
const BUILT_REG_TYPES = new Set(["private_construction", "public_construction", "public_support_construction"]);
export function asksUsageApprovalDate(registrationType: string, assessmentYear: string, assessedValue: number): boolean {
  if (!BUILT_REG_TYPES.has(registrationType) || !(assessedValue > 600_000_000)) return false;
  const year = parseInt(assessmentYear) || new Date().getFullYear();
  if (year < 2021 || year > 2024) return false;
  return !(year === 2021 && registrationType !== "public_construction");
}

/**
 * 「기준 공시가격」(임대개시일 등 또는 최초 합산배제신고 연도 과세기준일 공시가격 · 선택) 칸을 묻는가 — Q-1 a:
 * 대상 유형(1·2·6·7·8·10·11호 · 9호는 바탕 유형)이고 그해 공시가격이 상한을 넘을 때만.
 * 상한은 ④가 엔진에 보내는 값(사용승인일·30호는 각 술어가 참일 때만 보낸다)으로 엔진 `rentalPriceCap`이 정한다.
 * 비면 ⑧은 막지 않고 엔진이 그해 공시가격으로 판정 + 안내(Q-2 a).
 */
export function asksPriceBasisValue(p: PropertyEntry, registrationType: string, assessmentYear: string): boolean {
  const priceType = priceRegistrationType(p, registrationType);
  if (!priceType || !priceBasisApplies(priceType)) return false;
  const assessedValue = parseAmount(p.assessedValue);
  const assessmentDate = toOptionalDate(`${parseInt(assessmentYear) || 0}-06-01`);
  if (!assessmentDate || !(assessedValue > 0)) return false;
  const cap = rentalPriceCap({
    registrationType: priceType as RentalPriceCapInput["registrationType"], // priceBasisApplies가 유형 집합 안을 보장
    location: p.location,
    assessmentDate,
    rentalRegistrationDate: toOptionalDate(p.rentalRegistrationDate),
    usageApprovalDate: asksUsageApprovalDate(priceType, assessmentYear, assessedValue)
      ? toOptionalDate(p.usageApprovalDate)
      : undefined,
    isThirtyPlusUnits: asksThirtyPlusUnits(priceType, assessmentYear) ? p.isThirtyPlusUnits || undefined : undefined,
  });
  return assessedValue > cap;
}
