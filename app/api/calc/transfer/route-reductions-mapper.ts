/**
 * 감면(reductions) Zod payload → 엔진 TransferReduction 변환 (⑭ Date 변환)
 *
 * route.ts 800줄 정책 분리 (2026-06-11).
 */

import type { z } from "zod";
import type { reductionSchema } from "@/lib/api/transfer-tax-schema-sub";
import type { TransferReduction } from "@/lib/tax-engine/transfer-tax";

type ReductionPayload = z.infer<typeof reductionSchema>;

export function mapReductionsToEngine(reductions: ReductionPayload[]): TransferReduction[] {
  return reductions.map((r): TransferReduction => {
    if (r.type === "public_expropriation") {
      return { ...r, businessApprovalDate: new Date(r.businessApprovalDate) };
    }
    if (r.type === "self_farming") {
      return {
        ...r,
        incorporationDate: r.incorporationDate ? new Date(r.incorporationDate) : undefined,
      };
    }
    // Phase 2 (2026-06-11): 장기임대 §97 시리즈 — string 일자 → Date 변환 (⑭)
    if (
      r.type === "rental_97_main" ||
      r.type === "rental_97_proviso" ||
      r.type === "rental_97_2" ||
      r.type === "rental_97_3" ||
      r.type === "rental_97_4" ||
      r.type === "rental_97_5"
    ) {
      return {
        ...r,
        registrationDate: r.registrationDate ? new Date(r.registrationDate) : undefined,
        rentalStartDate: r.rentalStartDate ? new Date(r.rentalStartDate) : undefined,
        rentHistory: r.rentHistory?.map((h) => ({
          contractDate: new Date(h.contractDate),
          contractType: h.contractType,
          monthlyRent: h.monthlyRent,
          deposit: h.deposit,
        })),
        vacancyPeriods: r.vacancyPeriods?.map((v) => ({
          startDate: new Date(v.startDate),
          endDate: new Date(v.endDate),
        })),
      } as TransferReduction;
    }
    // §99의4 농어촌·고향주택 (2026-06-11): string 일자 → Date 변환 (⑭ — 단건+다건 공용)
    if (r.type === "new_99_4_rural" || r.type === "new_99_4_hometown") {
      return {
        ...r,
        ruralHouseAcquisitionDate: r.ruralHouseAcquisitionDate
          ? new Date(r.ruralHouseAcquisitionDate)
          : undefined,
      } as TransferReduction;
    }
    // P1 §99 신축주택 IMF 1차 (2026-06-11): string 일자 → Date 변환 (⑭)
    // (income-deduction-router는 coerceOptionalDate로 string도 수용하나, 엔진 입력 계약은 Date)
    if (r.type === "new_99") {
      return {
        ...r,
        contractDate99: r.contractDate99 ? new Date(r.contractDate99) : undefined,
        usageApprovalDate99: r.usageApprovalDate99 ? new Date(r.usageApprovalDate99) : undefined,
      } as TransferReduction;
    }
    // P1 §98의8 준공후미분양 50% (2026-06-11): string 일자 → Date 변환 (⑭)
    if (r.type === "unsold_98_8") {
      return {
        ...r,
        contractDate988: r.contractDate988 ? new Date(r.contractDate988) : undefined,
        rentalStartDate988: r.rentalStartDate988 ? new Date(r.rentalStartDate988) : undefined,
        rentalEndDate988: r.rentalEndDate988 ? new Date(r.rentalEndDate988) : undefined,
      } as TransferReduction;
    }
    // P2 §98의7 9억↓ 미분양 (2026-06-11): string 일자 → Date 변환 (⑭)
    if (r.type === "unsold_98_7") {
      return {
        ...r,
        contractDate987: r.contractDate987 ? new Date(r.contractDate987) : undefined,
      } as TransferReduction;
    }
    // P2 §99의2 신축·미분양·1세대1주택 (2026-06-11): string 일자 → Date 변환 (⑭)
    if (r.type === "unsold_99_2") {
      return {
        ...r,
        contractDate992: r.contractDate992 ? new Date(r.contractDate992) : undefined,
        usageApprovalDate992: r.usageApprovalDate992 ? new Date(r.usageApprovalDate992) : undefined,
      } as TransferReduction;
    }
    // §98의9 수도권 밖 준공후미분양 (2026-06-11): string 일자 → Date 변환 (⑭)
    if (r.type === "unsold_98_9") {
      return {
        ...r,
        unsoldHouseAcquisitionDate: r.unsoldHouseAcquisitionDate
          ? new Date(r.unsoldHouseAcquisitionDate)
          : undefined,
      } as TransferReduction;
    }
    // §99의3 (Phase 2, 2026-05-06) + Phase 1 stub 잔여: Zod schema에 본 요건 필드가
    // 모두 정의되어 있으므로 r 그대로 통과. string 일자 필드(contractDate993 등)는
    // transfer-tax.ts의 STEP 4.6 §99의3 분기에서 new Date() 변환.
    return r;
  });
}
