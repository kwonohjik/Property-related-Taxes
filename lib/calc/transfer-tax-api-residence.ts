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
    // §154⑧3호 동일세대 상속 거주 통산 — meetsOneHouseResidenceRequirement가 소비하므로
    // Step4 거주요건 안내(이 빌더 소비)도 엔진과 동일 필드 전달 필수 (UI↔엔진 dual-truth 방지).
    acquisitionCause: primary?.acquisitionCause,
    decedentSameHouseholdBeforeInheritance:
      primary?.acquisitionCause === "inheritance"
        ? primary.decedentSameHouseholdBeforeInheritance
        : undefined,
    decedentCohabitationResidenceMonths:
      primary?.acquisitionCause === "inheritance" && primary.decedentSameHouseholdBeforeInheritance
        ? parseInt(primary.decedentCohabitationResidenceMonths) || 0
        : undefined,
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
