/**
 * 거주요건 판정 입력 빌드 — Step4 거주요건 안내 메시지(②)가 엔진 meetsOneHouseResidenceRequirement
 * 호출에 사용. API 변환과 동일 도출(deriveResidencePeriodMonths·proviso 조립)로 단일 진실.
 * 호출 전 form.transferDate·primary.acquisitionDate 존재 보장 필요(toDate는 필수값 미입력 시 throw).
 * transfer-tax-api.ts에서 격리 (800줄 정책).
 */
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { deriveResidencePeriodMonths } from "@/lib/stores/calc-wizard-asset-residence";
import { toDate } from "@/lib/api/date-coerce";
import type { ResidenceReqInput } from "@/lib/tax-engine/transfer-tax-exemption";

export function buildResidenceReqInput(form: TransferFormData): ResidenceReqInput {
  const primary = form.assets?.[0];
  return {
    acquisitionDate: toDate(primary?.acquisitionDate, "acquisitionDate"),
    transferDate: toDate(form.transferDate, "transferDate"),
    residencePeriodMonths: primary
      ? deriveResidencePeriodMonths(primary, form.transferDate, form.residencePeriodMonths)
      : 0,
    regionCode: primary?.regionCode || form.regionCode || undefined,
    wasRegulatedAtAcquisition: form.wasRegulatedAtAcquisition,
    oneHouseExemptionProviso: form.provisoReason
      ? {
          reason: form.provisoReason,
          ...(form.provisoDepartureDate
            ? { departureDate: toDate(form.provisoDepartureDate, "provisoDepartureDate") }
            : {}),
          ...(form.provisoExpropriationDate
            ? { expropriationDate: toDate(form.provisoExpropriationDate, "provisoExpropriationDate") }
            : {}),
          ...(form.provisoBusinessApprovalDate
            ? { businessApprovalDate: toDate(form.provisoBusinessApprovalDate, "provisoBusinessApprovalDate") }
            : {}),
        }
      : undefined,
  };
}
