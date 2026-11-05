/**
 * 계산기 ⑧과 ⑤ 카드가 §155⑳ 거주주택 요건 leaf(`rentalResidenceRequirementStatus`)에 넣는 **폼 수준 사실** — 한 곳에서 만든다.
 * ⑧(`transfer-tax-validate-asset.ts`)이 쓰던 식을 그대로 옮겼다. 카드는 Step1이 첫 자산 기준으로 만들어 내려보낸다
 * (`docs/00-pm/rhe-e1-notice-and-card-verdict-mismatch.plan.md` B · Q-B1 (a)).
 */
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { mergeRentalState } from "@/lib/calc/merge-rental-carveout-form";
import { qualifiesWinWinRental } from "@/lib/tax-engine/transfer-tax-exemption-requirements";
import { toWinWinRentalHouseFact } from "./one-house-extra-facts-payload";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { effectiveProvisoReason } from "./transfer-tax-api-helpers";
import { calcProvisoMode } from "./transfer-tax-api-residence";
import { buildResidenceReqInput } from "./transfer-tax-api-residence";
import { resolveExemptionProviso } from "@/lib/tax-engine/transfer-tax-exemption-holding";
import { calcEffectiveWasRegulatedAtAcquisition, calcStoredRegulatedFlags } from "@/lib/calc/effective-regulated-at-acquisition";
import type { RentalResidenceRequirementFacts } from "./rental-residence-requirement-status";

export function calcRentalResidenceFacts(form: TransferFormData, a: AssetForm, index: number): RentalResidenceRequirementFacts {
  const provisoReason = index === 0 ? effectiveProvisoReason(calcProvisoMode(form), form.provisoReason) : undefined;
  return {
    // OH-42 — 상생임대주택(§155의3①)이면 §155⑳1호 거주요건 면제. 엔진과 같은 술어·같은 사실(④가 보내는 운반 상자).
    winWinResidenceExempt: qualifiesWinWinRental({
      winWinRentalHouse: toWinWinRentalHouseFact(form.importedOneHouseFacts),
      // §155의3① 양도기한(대통령령 제36737호 · 2026.10.1. 시행) — 엔진(`transfer-tax-rental-housing-step.ts`)·부담부증여와 같은 양도일.
      // 빠지면 술어가 기한을 보지 않아 카드는 「거주 충족」, 엔진은 불성립으로 갈린다(SYNC-1).
      transferDate: toOptionalDate(form.transferDate),
      // ①1호 「취득한 후 체결」 날짜 하한 — 엔진과 같은 취득일·동일세대 상속 사실(④가 primary에서 싣는 값).
      acquisitionDate: toOptionalDate(a.acquisitionDate),
      decedentSameHouseholdBeforeInheritance:
        a.acquisitionCause === "inheritance" ? a.decedentSameHouseholdBeforeInheritance : undefined,
    }),
    // §154⑩ 표준 경로(I-5) — 거주주택 취득 당시 조정대상지역 여부. 주소(법정동코드)가 있으면 엔진과 같은 주소 판정,
    // 없으면 폼-전역 토글(일반 §154① 흐름과 동일 소스) — G1-13. 결정 #38-10 — 증여받은 주택은 ④와 같은 세대 사실 basis(첫 자산).
    wasRegulatedAtAcquisition: calcEffectiveWasRegulatedAtAcquisition(a, calcStoredRegulatedFlags(form).wasRegulatedAtAcquisition, form.regionCode, {
      isPrimary: index === 0,
    }),
    // §154① 단서 1호·2호가목·3호면 거주주택 보유 2년을 막지 않는다 — ④가 첫 자산에 싣는 것과 같은 게이트·정규화 값(D-9).
    provisoReason,
    // 그 사유가 실제로 성립하는 범위 — Step4 거주 안내와 같은 입력 빌더(`buildResidenceReqInput`)·엔진과 같은 판정 함수. ⑤ 카드만 쓴다.
    provisoScope: provisoReason ? provisoScopeOf(form) : undefined,
    mergeRental: index === 0 ? mergeRentalState(form) : undefined,
  };
}

/** 날짜가 덜 입력돼 빌더가 던지면 불성립으로 본다(모름 = 혜택 불성립). */
function provisoScopeOf(form: TransferFormData): "both" | "residence_only" | null {
  try {
    return resolveExemptionProviso(buildResidenceReqInput(form));
  } catch {
    return null;
  }
}
