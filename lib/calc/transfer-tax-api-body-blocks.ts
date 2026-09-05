/**
 * `callTransferTaxAPI` body 조립 블록 — ④⑬ 전송 페이로드 4군
 *
 * transfer-tax-api.ts 800줄 정책에 따라 분리(2026-08-04, Phase A-0).
 * 각 함수는 body에 그대로 spread되는 **부분 객체**를 반환한다 —
 * 조건 미충족 시 `{}`를 반환해 필드를 아예 보내지 않는다(Zod optional 계약).
 * 선례: `buildReplacementHousePayload`(transfer-tax-api-helpers.ts).
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TemporaryTwoHouseDelayReason } from "@/lib/tax-engine/types/transfer.types";
import { getFilingDeadline, isAllBurdenedGift } from "@/lib/calc/filing-deadline";
import { deriveStatutoryDeadline } from "@/lib/calc/transfer-amendment-helpers";
import { derivePre1990PlainHousePhdLandPricePerSqmAtAcq } from "@/lib/calc/transfer-pre1990-phd-bridge";

/**
 * ④⑬ 기한 후 신고 감면 축 — 「국세기본법」 §48②2호·§48②3호라목 (🔴 G-05)
 *
 * **무신고(§47의2)에만 싣는다.** 두 조문 모두 「제47조의2에 따른 가산세만 해당」이고,
 * 과소신고는 §48②**1호**(수정신고 — `amendment` 블록)가 담당한다.
 *
 * 세 날짜는 모두 **이미 있는 폼 값에서 파생**한다(신규 입력은 배제 토글 하나뿐):
 *   · 법정신고기한 = 예정신고기한 `getFilingDeadline` (소득세법 §105①1호·3호)
 *   · 실제 신고일  = `form.filingDate`
 *   · 확정신고기한 = `deriveStatutoryDeadline` (소득세법 §110① — 다음 해 5월 31일)
 *
 * 🔑 파생을 새로 짜지 않고 **기존 두 헬퍼를 그대로 재사용**한다 — `derivePenaltyFields`
 *    (양도일·신고일 자동 전이)·수정신고 경로와 같은 단일 소스라야 화면이 말하는 기한과
 *    payload 의 기한이 갈리지 않는다.
 *
 * 🔑 **단건과 다건이 같은 함수를 부른다.** 리뷰 G-11 이 정확히 「단건 빌더는 싣는데 다건
 *    빌더만 빠뜨린」 결함이었다 — 같은 규칙을 두 번 쓰지 않는다.
 */
export function buildLateFilingPayload(form: TransferFormData): object {
  if (form.filingType !== "none" || !form.transferDate || !form.filingDate) return {};
  return {
    lateFiling: {
      statutoryDeadline: getFilingDeadline(form.transferDate, isAllBurdenedGift(form.assets)),
      actualFilingDate: form.filingDate,
      finalReturnDeadline: deriveStatutoryDeadline(form.transferDate),
      priorAssessmentNotified: form.lateFilingNotified ?? false,
    },
  };
}

/** ④⑬ §155⑤ 일시적 2주택 · §155⑧ 수도권 밖 부득이 · §155⑦ 농어촌주택 (FLAT → nested) */
export function buildHouseholdSpecialPayload(form: TransferFormData, primary: AssetForm): object {
  return {
  ...(form.temporaryTwoHouseSpecial &&
  primary?.acquisitionDate &&
  form.newHouseAcquisitionDate
    ? {
        temporaryTwoHouse: {
          // 종전주택 취득일 = 양도 자산 취득일(단일소스)
          previousAcquisitionDate: primary.acquisitionDate,
          newAcquisitionDate: form.newHouseAcquisitionDate,
          // §155⑯ — 처분기한 5년 + 1년 요건 면제. false는 보내지 않는다(Zod optional).
          ...(form.publicInstitutionRelocation
            ? {
                publicInstitutionRelocation: true,
                // 연접 판정 코드 — 둘 다 있을 때만 자동 판정된다(엔진이 한쪽만 있으면 자기선언 유지).
                ...(form.relocatedSigunguCode ? { relocatedSigunguCode: form.relocatedSigunguCode } : {}),
                ...(form.newHouseSigunguCode ? { newHouseSigunguCode: form.newHouseSigunguCode } : {}),
              }
            : {}),
          // §155⑱ — 빈 문자열은 "해당 없음"이므로 미전송.
          ...(form.disposalDelayReason
            ? { disposalDelayReason: form.disposalDelayReason as TemporaryTwoHouseDelayReason }
            : {}),
        },
      }
    : {}),
  // ④⑬ §155⑧ 수도권 밖 부득이 주택 FLAT → nested. 해소일은 미입력 시 미전송(= 미해소).
  ...(form.unavoidableOutsideCapitalSpecial
    ? {
        unavoidableOutsideCapitalHouse: {
          reason: form.unavoidableOutsideCapitalReason as
            | "study"
            | "work"
            | "illness"
            | "other",
          ...(form.unavoidableOutsideCapitalResolvedDate
            ? { resolvedDate: form.unavoidableOutsideCapitalResolvedDate }
            : {}),
        },
      }
    : {}),
  // ④⑬ §155⑥1호 문화유산 주택 — 요건이 boolean 하나(2·3호 삭제). false는 보내지 않는다.
  ...(form.culturalHeritageHouseSpecial ? { culturalHeritageHouse: true } : {}),
  // ④⑬ §155⑦ 농어촌주택 FLAT → nested. 유형별로 무의미한 필드는 보내지 않는다
  //     (침묵 오판정 방지 — 예: 상속 유형에 귀농 대지면적을 실어 보내면 안 된다).
  ...(form.ruralHouseSpecial
    ? {
        ruralHouse: {
          kind: form.ruralHouseKind as "inherited" | "farm_exit" | "return_to_farm",
          isOutsideCapitalEupMyeon: form.ruralHouseOutsideCapitalEupMyeon,
          ...(form.ruralHouseKind === "inherited"
            ? { decedentResidenceYears: parseFloat(form.ruralHouseDecedentResidenceYears) || 0 }
            : {}),
          ...(form.ruralHouseKind === "farm_exit"
            ? { ownerResidenceYears: parseFloat(form.ruralHouseOwnerResidenceYears) || 0 }
            : {}),
          ...(form.ruralHouseKind === "return_to_farm"
            ? {
                ...(form.ruralHouseAcquisitionDate
                  ? { acquisitionDate: form.ruralHouseAcquisitionDate }
                  : {}),
                isHighPriceAtAcquisition: form.ruralHouseHighPriceAtAcquisition,
                landAreaSqm: parseFloat(form.ruralHouseLandAreaSqm) || 0,
                wholeHouseholdMoved: form.ruralHouseWholeHouseholdMoved,
              }
            : {}),
        },
      }
    : {}),
  };
}

/** ⑬ 무신고·과소신고 가산세 · 납부지연 가산세 · 수정신고(경정) — 「국세기본법」 §45·§48 */
export function buildPenaltyAmendmentPayload(form: TransferFormData): object {
  return {
  // 수정신고 모드에서는 무신고/과소신고 가산세 블록을 전송하지 않음 (상호배타)
  ...(!form.amendmentMode && form.enablePenalty && form.filingType !== "correct"
    ? {
        filingPenaltyDetails: {
          determinedTax: 0,
          reductionAmount: 0,
          priorPaidTax: parseAmount(form.priorPaidTax),
          /**
           * 🔴 G-10: **신고 유형별 게이트.** ⑤ UI 는 이 두 칸을 조건부로만 노출하는데
           * (`Step6.tsx` — 당초 신고세액은 과소·초과환급, 환급세액은 초과환급에서만)
           * ④ 변환은 유형과 무관하게 무조건 실어 **stale 값이 가산세 base 를 움직였다**.
           *
           * 실측(토지 10억/2억 무신고, 기준금액 211,650,000 · 가산세 42,330,000):
           *   · `originalFiledTax` 1억 잔존 → 22,330,000 (**20,000,000 과소**)
           *   · `excessRefundAmount` 5천만 잔존 → 52,330,000 (**10,000,000 과대**)
           * 「무신고납부세액」(국세기본법 §47의2①)은 「그 신고로 납부하여야 할 세액」이고
           * 당초 신고세액을 빼라는 문언이 없다.
           *
           * 🔑 도달 경로는 라디오 전환만이 아니다 — `lib/calc/filing-deadline.ts`의
           *    `derivePenaltyFields`가 양도일·신고일 변경만으로 `filingType`을 자동 전이시킨다.
           * 형제 축(주식)은 이미 ④·⑤ 양쪽에서 막는다(`stock-transfer-tax-api.ts`).
           */
          originalFiledTax:
            form.filingType === "under" || form.filingType === "excess_refund"
              ? parseAmount(form.originalFiledTax)
              : 0,
          excessRefundAmount:
            form.filingType === "excess_refund" ? parseAmount(form.excessRefundAmount) : 0,
          interestSurcharge: parseAmount(form.interestSurcharge),
          // 빈 문자열이면 키 자체를 넣지 않는다 — 미입력 = 전액 부정(종전 동작).
          // 0 은 「부정행위분이 없다」는 유효한 선언이라 0도 보낸다.
          ...((form.fraudulentPortion ?? "").trim() !== ""
            ? { fraudulentPortion: parseAmount(form.fraudulentPortion) }
            : {}),
          filingType: form.filingType,
          penaltyReason: form.penaltyReason,
          ...buildLateFilingPayload(form),
        },
      }
    : {}),
  ...(!form.amendmentMode && form.enablePenalty && form.paymentDeadline
    ? {
        delayedPaymentDetails: {
          unpaidTax: parseAmount(form.unpaidTax),
          paymentDeadline: form.paymentDeadline,
          actualPaymentDate: form.actualPaymentDate || undefined,
        },
      }
    : {}),
  // 수정신고(경정) — 국세기본법 §45·§48
  ...(form.amendmentMode
    ? {
        amendment: {
          correctionKind: form.correctionKind,
          originalDeterminedTax: parseAmount(form.originalDeterminedTax),
          // [F6] 경정청구(refund)는 가산세 없음 → 플래그 강제 false(stale 누출 차단)
          applyUnderReportingPenalty:
            form.correctionKind === "refund_claim" ? false : form.applyUnderReportingPenalty,
          underReportingReason: form.underReportingReason,
          underReductionMode: form.underReductionMode,
          ...(form.statutoryFilingDeadline ? { statutoryFilingDeadline: form.statutoryFilingDeadline } : {}),
          ...(form.amendedFilingDate ? { amendedFilingDate: form.amendedFilingDate } : {}),
          priorAssessmentNotified: form.priorAssessmentNotified,
          applyLatePaymentPenalty:
            form.correctionKind === "refund_claim" ? false : form.applyLatePaymentPenalty,
          ...(form.amendedPaymentDate ? { amendedPaymentDate: form.amendedPaymentDate } : {}),
          // 경정청구 전용 — §45의2
          ...(form.correctionKind === "refund_claim" ? { claimReasonType: form.claimReasonType } : {}),
          ...(form.posteriorEventDate ? { posteriorEventDate: form.posteriorEventDate } : {}),
        },
      }
    : {}),
  };
}

/** ④⑬ 개별주택가격 미공시 취득 환산 §164⑤ (일반 자산 전용 — 겸용주택은 mixedUse 경로) */
export function buildPreHousingDisclosurePayload(
  primary: AssetForm,
  isMixed: boolean,
  /** 양도일 — 영 §164④ 등급가액 환산 파생에 필요(1990.8.30. 이전 취득 주택) */
  transferDate: string,
): object {
  return {
  // ── 개별주택가격 미공시 취득 환산 §164⑤ (일반 자산 전용) ──
  // 겸용주택은 mixedUse.preHousingDisclosure에서 별도 전송하므로 여기 송신 금지.
  // hasSeperateLandAcquisitionDate 무관 — 취득일 동일(공동주택 사례 23 등)도 PHD 전송.
  ...(!isMixed &&
  primary.usePreHousingDisclosure &&
  primary.phdFirstDisclosureDate &&
  parseAmount(primary.phdFirstDisclosureHousingPrice) > 0
    ? {
        preHousingDisclosure: {
          firstDisclosureDate: primary.phdFirstDisclosureDate,
          firstDisclosureHousingPrice: parseAmount(primary.phdFirstDisclosureHousingPrice),
          landArea: parseFloat(primary.acquisitionArea) || 0,
          // 1990.8.30. 이전 취득 주택 — 그날 이전에는 개별공시지가가 고시되지 않았다.
          // 영 §164④ 등급가액 환산이 §164⑦ 분자의 「가목 가액」을 채운다(법 §99③2호가 토지·주택을
          // 한 호에서 위임). ⑤·⑧과 **같은 파생 함수**를 쓴다(3중 패턴 — 한쪽만 열면 침묵 불일치).
          landPricePerSqmAtAcquisition:
            parseAmount(primary.phdLandPricePerSqmAtAcq) ||
            (derivePre1990PlainHousePhdLandPricePerSqmAtAcq(primary, transferDate) ?? 0),
          buildingStdPriceAtAcquisition: parseAmount(primary.phdBuildingStdPriceAtAcq) || 0,
          landPricePerSqmAtFirstDisclosure: parseAmount(primary.phdLandPricePerSqmAtFirst) || 0,
          buildingStdPriceAtFirstDisclosure: parseAmount(primary.phdBuildingStdPriceAtFirst) || 0,
          transferHousingPrice: parseAmount(primary.phdTransferHousingPrice) || 0,
          landPricePerSqmAtTransfer: parseAmount(primary.phdLandPricePerSqmAtTransfer) || 0,
          buildingStdPriceAtTransfer: parseAmount(primary.phdBuildingStdPriceAtTransfer) || 0,
        },
      }
    : {}),
  };
}

/** ④⑬ 신축(자가건축) 취득일 4-시점(영 §162①4호) + 부수토지 한도 산정(영 §167의5) */
export function buildNewConstructionPayload(primary: AssetForm): object {
  return {
  // ④⑬ 사례 28 + G-5 — 신축(자가건축) 취득일 4-시점 + 부수토지 한도 산정 (영 §162①4호, 영 §167의5)
  // acquisitionCause === "newConstruction" 시 4-시점 날짜 전송.
  // buildingFootprintArea / isUrbanArea는 신축 여부와 무관하게 값이 있으면 전송.
  ...(primary.acquisitionCause === "newConstruction"
    ? {
        occupancyApprovalDate: primary.occupancyApprovalDate || undefined,
        approvalCertificateDate: primary.approvalCertificateDate || undefined,
        temporaryApprovalDate: primary.temporaryApprovalDate || undefined,
        actualUseDate: primary.actualUseDate || undefined,
      }
    : {}),
  ...(parseFloat(primary.buildingFootprintArea) > 0
    ? { buildingFootprintArea: parseFloat(primary.buildingFootprintArea) }
    : {}),
  ...(primary.isUrbanArea !== undefined
    ? { isUrbanArea: primary.isUrbanArea }
    : {}),
  ...(primary.appurtenantLandZone !== undefined
    ? { appurtenantLandZone: primary.appurtenantLandZone }
    : {}),
  };
}
