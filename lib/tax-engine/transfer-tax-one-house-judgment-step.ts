/**
 * 양도세 STEP 0.96 + STEP 1 — §155⑳ 불성립 전제 되돌림 → 1세대1주택 공유 판정 → 임대·토지 세대 고지.
 *
 * `transfer-tax.ts` 800줄 정책 분리 — 로직은 오케스트레이터에서 **그대로** 옮겼다(동작 불변).
 */
import { judgeOneHouseExemptionFromInput } from "./one-house/judge";
import { hasNoMergeRosterInputPath } from "./one-house/roster-input-path";
import { applyLandOnlyHouseholdRule, landOnlyMergeResidenceNotice } from "./land-only-owner-household";
import { landOnlyMergeNoticeSuppressed } from "./transfer-tax-appurtenant-land";
import { presaleRightStartDate, type ParsedRates } from "./transfer-tax-helpers";
import { restoreRentalUnitsToHouseCount, revokeExemptionOnStandardPathUnmet } from "./transfer-tax-rental-housing-judge";
import { prhpUnmetOtherExemptionNotice, resolvePrhpUnmet } from "./transfer-tax-rental-housing-judge";
import { resolveRentalResidenceComposition } from "./transfer-tax-rental-residence-composition";
import type { TransferTaxInput } from "./types/transfer.types";

export function runOneHouseJudgmentStep(args: {
  judgeInputBeforeRental: TransferTaxInput;
  effectiveInput: TransferTaxInput;
  parsedRates: ParsedRates;
  generalHouseAcquisitionDate: Date | undefined;
  warnings: string[];
}) {
  const { judgeInputBeforeRental, effectiveInput, parsedRates, generalHouseAcquisitionDate: hceGeneralHouseAcquisitionDate, warnings } = args;
  // STEP 0.96 (E-1 한계 G5): §155⑳ A 미충족이면 「임대주택 제외」 주택 수 1 전제를 되돌린다 — 판정·장특이 한 전제를 본다.
  const rentalPremise = restoreRentalUnitsToHouseCount(judgeInputBeforeRental, effectiveInput, parsedRates, hceGeneralHouseAcquisitionDate);
  // 증여세 마법사는 세대 보유 주택 명부 입력 칸이 없어 합가 전 구성 「모름」을 불리하게 쓰지 않는다(Q-10) — 그 화면이 싣는
  // 표식(`burdenedGiftInfo.houseRosterInputUnavailable`)이 있을 때만 세운다(1h-G1-12). 계산기·판정 메뉴·표식 없는 호출은 세우지 않는다.
  const exemptionJudgeInput = {
    ...rentalPremise.input,
    noMergeRosterInputPath: hasNoMergeRosterInputPath(effectiveInput),
  };

  /**
   * STEP 1: 1세대1주택 비과세 판정 — **공유 판정 엔진**을 거친다(P2 · D-1).
   *
   * 판정 메뉴(P4)와 같은 진입점이다. 계산기는 이미 `TransferTaxInput`을 들고 있지만 일부러
   * `OneHouseFacts`로 분해했다가 다시 조립한다 — 「사실만으로 같은 판정이 나오는가」를 매
   * 테스트마다 증명시키기 위해서다(`one-house/judge.ts` 머리 주석).
   */
  // §154⑩ 표준 경로(B · 0호) 불성립이면 비과세를 거둔다. 세대 구성 불성립은 거두지 않는다 — 판정이 임대주택을 센 결론이 정본(composition-revoke Q-1).
  const rentalComposition = revokeExemptionOnStandardPathUnmet(
    judgeOneHouseExemptionFromInput(exemptionJudgeInput, parsedRates.oneHouseSpecialRules, presaleRightStartDate(parsedRates)),
    effectiveInput,
  );
  // V-3′ — 토지만 본인 × 건물(주택) 소유자 다른 세대면 이 세대의 1주택에 딸린 토지가 아니다 · 같은 세대면 합가일 고지(`land-only-owner-household.ts`).
  const landOnlyHousehold = applyLandOnlyHouseholdRule(rentalComposition.judgment, effectiveInput, landOnlyMergeNoticeSuppressed(effectiveInput));
  const exemptionResult = landOnlyHousehold.judgment;
  // §155⑳ 불성립 원인(호별·거주 · 세대 구성) — 조기 반환·㉒ 안내·불성립 고지가 한 판정을 본다(composition-revoke D-2).
  const prhpUnmet =
    effectiveInput.rentalHousingException?.applyException === true
      ? resolvePrhpUnmet(effectiveInput, resolveRentalResidenceComposition(effectiveInput, parsedRates, hceGeneralHouseAcquisitionDate))
      : undefined;
  // F-1 D-3 — STEP 0.96 고지는 판정 뒤에 확정한다: 임대주택을 센 판정이 다른 특례로 비과세를 내면 「…적용하지 않습니다」 대신 불성립 고지.
  const rentalUnmetOther = prhpUnmetOtherExemptionNotice(effectiveInput, exemptionResult, prhpUnmet);
  if (rentalUnmetOther) warnings.push(rentalUnmetOther);
  else if (rentalPremise.notice) warnings.push(rentalPremise.notice);
  if (rentalComposition.notice) warnings.push(rentalComposition.notice);
  // 거주기간 합가일 이후 통산 고지 — 비과세로 끝나는 경로에서도 실려야 하므로 합가 판정 고지와 같은 자리에서 단다.
  for (const n of [landOnlyHousehold.notice, landOnlyMergeResidenceNotice(effectiveInput)]) if (n) warnings.push(n);
  return { exemptionJudgeInput, exemptionResult, prhpUnmet };
}
