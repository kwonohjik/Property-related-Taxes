/**
 * 판정 메뉴 단계 6.9 — 토지만 본인 × 건물(주택) 소유자 세대 (2026-11 리뷰 D-39 · 결정 Q-7 (a)).
 *
 * 계산기는 STEP 1에서 `applyLandOnlyHouseholdRule`로 다른 세대면 비과세를 거두고 고지를 단다(`transfer-tax-one-house-judgment-step.ts`).
 * 판정 route에는 이 단계가 없어 API 직접 호출에서 같은 사실이 비과세였다(Zod refine은 답을 요구하고 route는 버렸다). 같은 leaf를 부르고,
 * 판정 메뉴에는 계산기 경고 칸이 없으므로 고지를 결과 채널로 옮긴다 — 다른 세대는 확정 사유(「선언했으나 적용되지 않은 특례」 채널).
 * 같은 세대는 판정을 그대로 둔다(합가 여부는 Zod가 필수로 받아 보유·거주 기산에 반영된다 — 종전 「합가일 확인」 고지는 route로 닿지 않아 2026-11-23 지웠다).
 */
import { TRANSFER } from "../legal-codes";
import { applyLandOnlyHouseholdRule } from "../land-only-owner-household";
import type { TransferTaxInput } from "../types/transfer.types";
import type { OneHouseJudgment } from "./types";

export const LAND_ONLY_OTHER_HOUSEHOLD_UNMET_ID = "154-1-land-only-other-household";

export function applyLandOnlyHouseholdVerdict(judgment: OneHouseJudgment, input: TransferTaxInput): OneHouseJudgment {
  const { judgment: out, notice } = applyLandOnlyHouseholdRule(judgment, input);
  if (!notice) return out;
  return {
    ...out,
    unmetExceptions: [
      ...out.unmetExceptions,
      {
        id: LAND_ONLY_OTHER_HOUSEHOLD_UNMET_ID,
        label: "토지만 본인 소유 — 건물 소유자가 다른 세대",
        legalBasis: `${TRANSFER.ONE_HOUSE_REQUIREMENT}①`,
        reasons: [notice],
      },
    ],
  };
}
