/**
 * 거주요건 판정 입력 빌드 — Step4 거주요건 안내 메시지(②)가 엔진 meetsOneHouseResidenceRequirement
 * 호출에 사용. API 변환과 동일 도출(deriveResidencePeriodMonths·proviso 조립)로 단일 진실.
 * 호출 전 form.transferDate·primary.acquisitionDate 존재 보장 필요(toDate는 필수값 미입력 시 throw).
 * transfer-tax-api.ts에서 격리 (800줄 정책).
 */
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { clampResidenceToHousingPeriod } from "@/lib/stores/calc-wizard-asset-residence";
import { isUsageConversionActive } from "@/lib/stores/calc-wizard-asset-usage-conversion";
import { toDate } from "@/lib/api/date-coerce";
import type { ResidenceReqInput } from "@/lib/tax-engine/transfer-tax-exemption";

export function buildResidenceReqInput(form: TransferFormData): ResidenceReqInput {
  const primary = form.assets?.[0];
  const conversionOn = isUsageConversionActive(primary);
  // ⚠️ **API 변환(`transfer-tax-api.ts`)과 같은 클램프를 써야 한다.**
  // §95⑤2호 클램프로 거주가 2년 미만이 되면 비과세가 탈락한다(계획 C-10c — 세액이 바뀌는
  // 유일한 케이스). 여기서 클램프 전 원값을 쓰면 **화면은 "요건 충족"인데 엔진은 차단**하는
  // dual truth가 된다. Phase D verify("Step4 안내 ↔ 엔진 판정 일치")의 불변식이다.
  const residence = primary
    ? clampResidenceToHousingPeriod(
        primary,
        form.transferDate,
        form.residencePeriodMonths,
        conversionOn ? primary.residentialUseStartDate : undefined,
      )
    : { months: 0, trimmed: 0 };
  return {
    acquisitionDate: toDate(primary?.acquisitionDate, "acquisitionDate"),
    transferDate: toDate(form.transferDate, "transferDate"),
    residencePeriodMonths: residence.months,
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
    // §154⑤ 단서·§154① 거주요건 판정 기준일 — 용도변경 시 주거용 사용일이 「주택 취득일」이다.
    // Step4 안내가 엔진과 같은 기준일을 보게 하려면 이 빌더도 같은 술어로 조립해야 한다.
    nonHousingToHousingConversion: conversionOn
      ? {
          residentialUseStartDate: toDate(
            primary!.residentialUseStartDate,
            "residentialUseStartDate",
          ),
          residenceMonthsTrimmed: residence.trimmed,
        }
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
