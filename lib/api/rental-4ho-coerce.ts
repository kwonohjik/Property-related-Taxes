/**
 * ⑭ 삭제 전 §154①4호(임대사업자 등록) 판정 사실 — JSON 본문(문자열 날짜) → 엔진 입력(Date) (OH-38).
 *
 * 단건(`engine-input.ts` — 계산기·판정 메뉴 공용)·다건(`multi/route.ts`) route와 Step4 거주요건 안내
 * (`transfer-tax-api-residence.ts`)가 **같은 변환**을 쓴다. 날짜는 `date-coerce`로만 바꾼다
 * (`Date < string` 비교가 조용히 false가 되는 함정 — CLAUDE.md API Date 직렬화).
 */
import type { Rental4hoRegistrationFacts } from "@/lib/tax-engine/types/transfer.types";
import { toOptionalDate } from "./date-coerce";

/** ⑬ 본문 형태 — ⑫ Zod(`transfer-tax-schema-base-shape.ts`)와 같은 키 */
export interface Rental4hoApiPayload {
  businessRegistrationApplicationDate?: string;
  rentalRegistrationApplicationDate?: string;
  regulatedOneHouseAtApplication?: boolean;
  statusAtTransfer?: Rental4hoRegistrationFacts["statusAtTransfer"];
  transferredDuringMandatoryPeriod?: boolean;
  rentIncreaseOver5Percent?: boolean;
  rentIncreaseContractDate?: string;
  giftSuccessionSeparatedHousehold?: boolean;
}

export function toEngineRental4ho(
  raw: Rental4hoApiPayload | undefined,
): Rental4hoRegistrationFacts | undefined {
  if (!raw) return undefined;
  return {
    businessRegistrationApplicationDate: toOptionalDate(raw.businessRegistrationApplicationDate),
    rentalRegistrationApplicationDate: toOptionalDate(raw.rentalRegistrationApplicationDate),
    regulatedOneHouseAtApplication: raw.regulatedOneHouseAtApplication,
    statusAtTransfer: raw.statusAtTransfer,
    transferredDuringMandatoryPeriod: raw.transferredDuringMandatoryPeriod,
    rentIncreaseOver5Percent: raw.rentIncreaseOver5Percent,
    rentIncreaseContractDate: toOptionalDate(raw.rentIncreaseContractDate),
    giftSuccessionSeparatedHousehold: raw.giftSuccessionSeparatedHousehold,
  };
}
