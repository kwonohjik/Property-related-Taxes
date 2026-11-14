/**
 * 장기임대주택 「증여로 받았나요?」(S-4) — ⑤ 노출 · ④ 전송의 단일 술어.
 *
 * 말소된 등록이 있을 때만 묻는다(명부 행·양도 주택의 「임대사업자 말소일」 또는 사목). 별도세대에서 증여받기 전에 증여자의
 * 등록이 말소됐으면 엔진이 장기임대주택으로 보지 않는다(`isSeparateHouseholdGiftOfCancelledRental` · 소령 §167의3①2호).
 * 「아니오」(`none`)·미답은 싣지 않는다 — 엔진에서 증여 아님과 같다.
 */
import type { RentalDeclaration } from "@/lib/stores/calc-wizard-asset-nbl";

export function rentalGiftDonorInScope(d: RentalDeclaration | undefined): boolean {
  return !!d?.isLongTermRental && (!!d.rentalCancelledDate || d.rentalType === "G");
}

export function rentalGiftDonorPayload(d: RentalDeclaration | undefined): { rentalGiftDonorHousehold?: "same" | "separate" } {
  const v = d?.rentalGiftDonorHousehold;
  return rentalGiftDonorInScope(d) && (v === "same" || v === "separate") ? { rentalGiftDonorHousehold: v } : {};
}
