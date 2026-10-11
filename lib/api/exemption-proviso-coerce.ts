/**
 * ⑭ §154① 단서 `oneHouseExemptionProviso` — JSON 본문(문자열 날짜) → 엔진 입력(Date).
 *
 * 단건(`engine-input.ts` — 계산기·판정 메뉴 공용)과 다건(`multi/route.ts`) route가 **같은 변환**을 쓴다.
 * 두 벌로 열거하면 한쪽만 키가 늘어 같은 사실이 다른 결론이 된다 — 다건이 1호 `rentalLeaseResidenceMonths`를
 * 빠뜨려 단건 비과세(0원)가 다건 과세(130,350,000원)로 뒤집힌 G2-1이 그 실례다.
 * 날짜는 `date-coerce`로만 바꾼다(`Date < string` silent false 함정 — CLAUDE.md API Date 직렬화).
 *
 * `preContractNoHouse`(5호 「계약금 지급일 현재 무주택」)는 엔진이 소비하지 않고 ⑧·⑫가 담보하므로 옮기지 않는다.
 */
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { toOptionalDate } from "./date-coerce";
import { toEngineRental4ho, type Rental4hoApiPayload } from "./rental-4ho-coerce";

/** ⑬ 본문 형태 — ⑫ Zod(`transfer-tax-schema-base-shape.ts`)의 `oneHouseExemptionProviso`와 같은 키 */
export interface OneHouseExemptionProvisoApiPayload {
  reason: NonNullable<TransferTaxInput["oneHouseExemptionProviso"]>["reason"];
  departureDate?: string;
  departureOnlyHouse?: boolean;
  expropriationDate?: string;
  businessApprovalDate?: string;
  rentalLeaseResidenceMonths?: number;
  rentalRegistration4ho?: Rental4hoApiPayload;
}

export function toEngineOneHouseExemptionProviso(
  raw: OneHouseExemptionProvisoApiPayload | undefined,
): TransferTaxInput["oneHouseExemptionProviso"] {
  if (!raw) return undefined;
  return {
    reason: raw.reason,
    departureDate: toOptionalDate(raw.departureDate),
    departureOnlyHouse: raw.departureOnlyHouse,
    expropriationDate: toOptionalDate(raw.expropriationDate),
    businessApprovalDate: toOptionalDate(raw.businessApprovalDate),
    rentalLeaseResidenceMonths: raw.rentalLeaseResidenceMonths,
    rentalRegistration4ho: toEngineRental4ho(raw.rentalRegistration4ho),
  };
}
