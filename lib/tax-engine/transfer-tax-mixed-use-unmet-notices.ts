/**
 * 겸용주택 — 「선언했으나 적용되지 않은 특례」 결과 경고 (계획서 `mixed-use-one-house-warning-parity.plan.md` D-1·D-2 · Q-1 (a)).
 *
 * 일반 주택·완공APT는 정본 판정의 `unmetExceptions`를 `oneHouseJudgmentWarnings`로 옮긴다. 겸용주택은 자체 판정
 * (`judgeMixedUseOneHouseExemption`)이라 그 목록이 없어, 결론(과세)은 같은데 이유가 결과에 없었다.
 * 여기서는 일반 경로가 경고로 옮기는 두 종류(`CALC_WARNING_UNMET_IDS`)만 **같은 leaf·같은 문장**으로 만든다.
 *
 * - 삭제 전 §154①4호 미충족 — `collectRental4hoUnmet`
 * - §155① 종전·신규 주택 취득 선후 — `collectTemporaryTwoHouseUnmet`과 같은 조건(주택 수 2 · 선후 역전)
 *
 * 게이트(「결론을 가를 때만」)는 호출부가 일반 경로와 같은 값으로 건다 — 1세대 · 비과세 아님 · 핵심 판정 불성립
 * (`transfer-tax-exemption.ts`의 `coreWouldPass` · `one-house/unmet-exceptions.ts` 자산·1세대 게이트).
 */
import type { OneHouseSpecialRulesData } from "./schemas/rate-table.schema";
import type { TransferTaxInput } from "./types/transfer.types";
import { collectRental4hoUnmet } from "./one-house/rental-registration-4ho";
import { evaluateTemporaryTwoHouseTiming, type DeemedOneHouseReqInput } from "./one-house/merge-deeming";
import { temporaryTwoHouseOrderReason } from "./one-house/new-house-origin";
import { twoHouseSpecialCountHolds } from "./transfer-tax-exemption-holding";
import { unmetExceptionWarning } from "./transfer-tax-one-house-warnings";

export function mixedUseUnmetNotices(
  /** §155① 판정에 넘긴 입력 그대로 — 주택 수·타이밍이 같은 술어를 본다 */
  deemedInput: DeemedOneHouseReqInput,
  oneHouseRules: OneHouseSpecialRulesData,
  rental4hoInput: Pick<TransferTaxInput, "transferDate" | "oneHouseExemptionProviso">,
): string[] {
  const out: string[] = [];
  const tth = deemedInput.temporaryTwoHouse;
  const twoHouseRule = oneHouseRules.temporary_two_house;
  if (tth && twoHouseRule && twoHouseSpecialCountHolds(deemedInput)) {
    const { timing } = evaluateTemporaryTwoHouseTiming(deemedInput, twoHouseRule);
    if (!timing.acquiredInOrder) out.push(temporaryTwoHouseOrderReason(tth.previousAcquisitionDate, tth.newAcquisitionDate));
  }
  for (const u of collectRental4hoUnmet(rental4hoInput)) out.push(unmetExceptionWarning(u));
  return out;
}
