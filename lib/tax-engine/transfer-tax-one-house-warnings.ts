/**
 * 1세대1주택 비과세 판정 결과 → **결과 경고** — 일반 주택 경로와 재개발 완공APT 경로 공용 leaf.
 *
 * 종전에는 `transfer-tax.ts` STEP 1 직후에 인라인으로 있어 일반 주택 경로만 이 안내를 냈다.
 * 완공APT(STEP 0.65a)도 같은 정본 판정(`judgeOneHouseExemptionFromInput`)을 부르지만 그 결과를
 * `calculateRedevelopmentTax`로 넘기기만 해, 결론(세액)은 같은데 **그 결론의 이유**(미충족 특례 ·
 * 판정 보류 · 재기산 등)가 결과 화면에 하나도 나오지 않았다(계획서 redev-apt-one-house-warning-parity.plan.md §1).
 * 두 경로가 이 함수를 부르도록 옮겼다 — 문장·조건·순서 불변.
 *
 * ⚠️ §155⑳ 세대 구성 불성립 회수 고지(`revokeExemptionOnRentalCompositionExceeded`)는 일반 경로 전용 단계의
 *    산출물이라 여기 두지 않는다.
 */
import { rental4hoDeemedPathNotice } from "./one-house/rental-registration-4ho";
import type { OneHouseSpecialRulesData } from "./schemas/rate-table.schema";
import type { TransferTaxInput } from "./types/transfer.types";
import type { OneHouseJudgment, OneHouseUnmetException } from "./one-house/types";
import { ERA_UNDETERMINED_IDS } from "./one-house/era-undetermined";
import { returnToFarmPostManagementNotice } from "./one-house/rural-return-to-farm-facts";
import { INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_ID, INHERITED_SPECIAL_OVERLAP_UNVERIFIED_ID, REVERSE_DOUBLE_MERGE_UNVERIFIED_ID } from "./one-house/pending";
import {
  DESIGNATED_DISTRICT_UNDECLARED_ID_PREFIX,
  surchargeRegulatedAreaNotices,
} from "./one-house/designated-district-undeclared";
import { CALC_WARNING_UNMET_IDS } from "./one-house/unmet-exceptions";
import { article89Clause2Notices, surchargeDeclarationMatters } from "./transfer-tax-89-2-consequences";
import { meetsOneHouseHoldingResidence } from "./transfer-tax-exemption";
import { mergeConfirmWarnings } from "./one-house/merge-confirm-warnings";

/** 「적용되지 않은 특례」 1건 → 결과 경고 문장 — 겸용주택 경로(`transfer-tax-mixed-use-unmet-notices.ts`)와 같은 형식. */
export function unmetExceptionWarning(u: Pick<OneHouseUnmetException, "label" | "reasons" | "notice">): string {
  return u.notice ?? `${u.label}을 적용하지 않았습니다 — ${u.reasons.join(" ")}`;
}

/**
 * §155 의제 경로에 거주기간만 푸는 §154① 단서(5호 · 삭제 전 4호)를 적용했을 때 무엇에 기댔는지 — 일반 경로와 겸용 경로
 * (`transfer-tax-mixed-use-exemption.ts`)가 같은 문장을 낸다. `appliedIds`는 판정 메뉴 「적용된 특례」 id 형식이다.
 */
export function deemedPathProvisoNotices(appliedIds: readonly string[]): string[] {
  const out: string[] = [];
  // F-2 — 일시적 2주택 종전주택에 §154① 단서 5호(공고 전 계약 · 거주요건 면제)를 적용했으면 근거의 한계를 남긴다.
  if (appliedIds.includes("155-1-temporary-two-house") && appliedIds.includes("154-1-proviso:pre_designation_contract")) {
    out.push(
      "일시적 2주택(「소득세법 시행령」 §155①) 종전주택에 §154① 단서 5호(조정대상지역 공고 전 계약)를 적용해 거주요건을 면제했습니다 — " +
        "§155①이 「1세대1주택으로 보아 제154조제1항을 적용」하고, 5호의 무주택은 계약금 지급일 현재 기준이라 그 뒤 일시적 2주택과 양립한다고 보았습니다. " +
        "5호는 「1년 이상 지난 후 취득」 요건은 면제하지 않습니다. 일시적 2주택 종전주택에 5호를 적용한 정면 해석례는 확인하지 못했습니다 — 확인 필요.",
    );
  }
  // 2026-11-01 Q-1 (a) — §155 의제 경로의 삭제 전 §154①4호는 무엇에 기댔는지 남긴다.
  const rental4hoNotice = rental4hoDeemedPathNotice(appliedIds);
  if (rental4hoNotice) out.push(rental4hoNotice);
  return out;
}

export function oneHouseJudgmentWarnings(
  exemptionResult: OneHouseJudgment,
  ctx: {
    /** 원본 입력 — 양도일·명부·귀농주택(§89② 고지 기준일 · 지구 미선언 · 귀농 사후관리). */
    input: TransferTaxInput;
    /** 판정이 실제로 본 입력 — 합가 「모름」 고지가 판정과 같은 술어를 보게 한다. */
    judgeInput: TransferTaxInput;
    surchargeApplicable: boolean | undefined;
    oneHouseRules: OneHouseSpecialRulesData;
  },
): string[] {
  const { input, judgeInput, surchargeApplicable, oneHouseRules } = ctx;
  const warnings: string[] = [];

  /**
   * §89② 후속 경고 — 판정 보류 고지 · §156의2⑬·§156의3⑩ 사후관리(추징) 고지.
   * 겸용 단건 엔진과 같은 leaf(`article89Clause2Notices` — E-7). 추징 리스크는 특례가 실제로 적용돼
   * 비과세를 받은 경우에만 있다(⑤는 선언만으로 `exception_met`이고 요건 판정은 E-5가 한다).
   */
  warnings.push(
    ...article89Clause2Notices(
      exemptionResult.article89Clause2,
      exemptionResult.isExempt || exemptionResult.isPartialExempt,
      input.transferDate,
      {
        // 미선언·확인 필요 고지는 선언이 비과세 또는 중과 배제를 바꿀 때만(G5-8) — 판정 메뉴의 `coreWouldPass` 게이트와 같은 값.
        coreWouldPass: exemptionResult.coreWouldPass === true,
        surchargeDeclarationMatters: surchargeDeclarationMatters(input.transferDate, surchargeApplicable),
      },
    ),
  );

  // 입력 경로가 없는 연혁 분기(OH-22·OH-38·OH-01)의 판정 보류 — 판정 메뉴와 같은 문장을 낸다.
  for (const u of exemptionResult.undetermined) {
    // 지정 지구 미선언(확인 필요)도 판정 메뉴와 같은 문장으로 알린다.
    if (
      ERA_UNDETERMINED_IDS.has(u.id) ||
      u.id.startsWith(DESIGNATED_DISTRICT_UNDECLARED_ID_PREFIX) ||
      // 별도세대 상속 분양권(피상속인 취득일 2021.1.1. 전) — 판정 메뉴와 같은 확인 필요
      u.id === INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_ID ||
      // D4 역순 이중 합가(동거봉양 합가 → 혼인) — 해석 미확보 확인 필요
      u.id === REVERSE_DOUBLE_MERGE_UNVERIFIED_ID ||
      u.id === INHERITED_SPECIAL_OVERLAP_UNVERIFIED_ID // §155②③ 상속 제외 뒤 ⑥·⑦·⑧ 2중첩(#16)
    ) {
      warnings.push(u.reason);
    }
  }
  // 다주택 중과가 양도일 조정 여부에 달려 있으면(판정 메뉴는 중과를 계산하지 않는다) 양도 주택 지구 미선언도 알린다(S02-7).
  warnings.push(...surchargeRegulatedAreaNotices(input, surchargeApplicable, exemptionResult));
  // OH-22 — §154⑤ 단서 재기산을 적용했으면 판정 메뉴 결과 카드와 같은 문장으로 알린다(재기산 기산일·근거).
  if (exemptionResult.finalOneHouseRestart?.applied) warnings.push(exemptionResult.finalOneHouseRestart.description);
  // OH-38 삭제 전 §154①4호 · §155① 취득 선후(D-1) 미충족이면 판정 메뉴의 「적용되지 않은 특례」와 같은 사유를 낸다.
  for (const u of exemptionResult.unmetExceptions ?? []) if (CALC_WARNING_UNMET_IDS.has(u.id)) warnings.push(unmetExceptionWarning(u));

  /**
   * §155④⑤ 합가 — 「모름」으로 불성립했고 그것이 **결론을 가를 때만** 확인 필요를 고지한다
   * (§155⑳ 선례와 같은 모양 — `transfer-tax-rental-housing-step.ts`의 `confirmNotice` + `rhe.applied`).
   * 이미 비과세·부분과세(다른 의제 포함)면 합가 외 요건이 §154①(보유·거주)뿐이어도 고지하지 않는다 —
   * 다른 의제(§155① 등)로 비과세가 선 경우를 가리지 않기 위해서다(계획서 §3-1).
   */
  if (!exemptionResult.isExempt && !exemptionResult.isPartialExempt) {
    warnings.push(
      ...mergeConfirmWarnings(
        judgeInput,
        meetsOneHouseHoldingResidence(judgeInput, oneHouseRules.one_house_exemption),
      ),
    );
  }

  // §155⑦3호 귀농주택 — ⑩4호·⑪은 입력으로 받아 판정한다(결정 #44). 장래 사실인 ⑫ 사후관리(추징)만 고지한다 — 판정 메뉴 결과와 같은 문장.
  if (exemptionResult.exemptReason?.includes("§155⑦3호")) warnings.push(returnToFarmPostManagementNotice(input.ruralHouse));

  warnings.push(...deemedPathProvisoNotices((exemptionResult.appliedExceptions ?? []).map((e) => e.id)));

  // F-1 — ①+④⑤ 중첩 의제는 국세청 해석에 기댄다. 무엇에 기댔고 어디까지 확인됐는지 남긴다.
  if (exemptionResult.exemptReason?.includes("중첩")) {
    warnings.push(
      "일시적 2주택(§155①)과 합가(§155④·⑤) 특례를 중첩 적용해 1세대1주택으로 보았습니다 — " +
        "국세청 사전-2025-법규재산-1240(동거봉양)·서면-2022-법규재산-5124(혼인) 및 기본통칙 89-155…2①. " +
        "중과 배제는 사전-2021-법령해석재산-1719이 「§154①의 요건을 모두 충족하면 §167의3①13호에 따라 " +
        "중과세율을 적용하지 아니한다」고 회신한 구조를 따랐습니다(그 회신의 중첩 조합은 §155①+⑳). " +
        "①과 ④·⑤의 조합에서 중과 배제를 정면으로 판단한 해석·심판례는 확인되지 않았고, 4주택 이상은 적용 대상이 아닙니다.",
    );
  }
  return warnings;
}
