/**
 * ④⑬ §154① 단서(삭제 전 4호 포함) — `oneHouseExemptionProviso` 본문 조립 (양도세 계산기 · 증여세 부담부증여 공용)
 *
 * 2026-09-28 E-1 후속: `transfer-tax-api.ts`의 인라인 조립을 옮겼다(동작 그대로). 증여세 부담부증여 양도 경로
 * (`gift-burdened-one-house.ts`)도 같은 카드(`ExemptionProvisoSection`)로 같은 이름의 필드를 받으므로,
 * 두 경로가 **한 조립**을 쓰게 한다 — 두 벌이면 한쪽만 필드를 빠뜨리는 순간 같은 사실이 다른 결론이 된다.
 *
 * 🔑 맥락(`mode`)은 호출부가 자기 정본으로 `provisoGate`를 불러 넘긴다. 카드가 숨는 맥락(null)·일시적 2주택
 *    화이트리스트 밖 사유는 `effectiveProvisoReason`이 버린다(stale 사유 미전송).
 */
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { effectiveProvisoReason, type ProvisoMode } from "./transfer-tax-api-helpers";
import { buildRental4hoPayload, type Rental4hoFormSlice } from "./rental-4ho-proviso";

export type ExemptionProvisoFormSlice = Pick<
  TransferFormData,
  | "provisoReason"
  | "provisoDepartureDate"
  | "provisoExpropriationDate"
  | "provisoBusinessApprovalDate"
  | "provisoRentalLeaseResidenceMonths"
  | "provisoPreContractNoHouse"
> &
  Rental4hoFormSlice;

/**
 * 1호 「임차일부터 양도일까지 세대전원 거주 개월」 — 빈 값·숫자 아님이면 `undefined`(엔진은 본문 거주기간으로 판정).
 * ④(단건·다건·판정 메뉴·부담부증여)·클라이언트 판정이 **같은 파서**를 쓴다.
 */
export function parseRentalLeaseResidenceMonths(raw: string | undefined): number | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  const n = Math.floor(Number(t));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** 1호일 때만 싣는 조각 — 다른 사유로 바꾼 뒤 남은 값은 보내지 않는다. */
export function rentalLeaseResidencePayload(
  reason: string,
  raw: string | undefined,
): { rentalLeaseResidenceMonths: number } | Record<string, never> {
  const months = reason === "rental_5yr_residence" ? parseRentalLeaseResidenceMonths(raw) : undefined;
  return months !== undefined ? { rentalLeaseResidenceMonths: months } : {};
}

export function buildExemptionProvisoPayload(
  form: ExemptionProvisoFormSlice,
  mode: ProvisoMode,
): { oneHouseExemptionProviso: Record<string, unknown> } | Record<string, never> {
  const reason = effectiveProvisoReason(mode, form.provisoReason);
  if (!reason) return {};
  return {
    oneHouseExemptionProviso: {
      reason,
      ...(form.provisoDepartureDate ? { departureDate: form.provisoDepartureDate } : {}),
      ...(form.provisoExpropriationDate ? { expropriationDate: form.provisoExpropriationDate } : {}),
      ...(form.provisoBusinessApprovalDate ? { businessApprovalDate: form.provisoBusinessApprovalDate } : {}),
      ...rentalLeaseResidencePayload(reason, form.provisoRentalLeaseResidenceMonths),
      ...(reason === "rental_registration_4ho" ? { rentalRegistration4ho: buildRental4hoPayload(form) } : {}),
      // O4 — 5호 「계약금 지급일 현재 무주택」 확인. ⑫가 true를 요구한다(⑧과 같은 규칙) — 종전엔 싣지 않아 strip됐다.
      ...(reason === "pre_designation_contract" ? { preContractNoHouse: form.provisoPreContractNoHouse === true } : {}),
    },
  };
}
