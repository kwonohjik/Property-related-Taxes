/**
 * ④ 주 자산 배우자등 이월과세(소득세법 §97의2) 서브객체 — 단건(`callTransferTaxAPI`)·다건(`buildPropertyPayload`) 공용 leaf.
 *
 * 다건 ④는 종전에 이 키를 만들지 않았다(⑧·⑫가 이월과세를 막았다). 계획서
 * `docs/00-pm/multi-carryover-bg-gb-shares.plan.md` 트랙 CO에서 다건도 같은 값을 싣는다 — 두 경로가 각자 조건을 두면
 * 한쪽만 고쳐지는 drift가 생기므로 조건·빌더를 여기 하나로 모은다.
 *
 * ⚠️ `transfer-tax-api-carryover.ts`는 `transfer-tax-api-helpers`가 import한다 — `withDonorBuilt`를 그쪽으로 끌어오면
 *    순환 위험이 있어 이 파일을 따로 둔다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { partCarryover } from "./transfer-land-part-cause";
import { buildCarryoverPayload } from "./transfer-tax-api-carryover";
import { carryoverEventForm } from "./transfer-tax-api-carryover";
import { withDonorBuilt } from "./transfer-tax-api-donor-built";

/**
 * 파트 이월과세(건물 파트)는 자산 단위 서브객체와 상호배제다(R-1) — 사건 1벌 + 파트(`buildLandPartCausePayload`)가 대신한다.
 * 부담부증여 일반건물은 건물만 이월과세여도 싣는다(사건 = 건물 블록 · `carryoverEventForm`).
 */
export function primaryCarryoverTaxationPayload(
  primary: AssetForm,
  transferDate: string,
  /** 공유 지분 비율 (단독 소유는 1.0) */
  ownershipRatio: number,
): { carryoverTaxation?: ReturnType<typeof withDonorBuilt<NonNullable<ReturnType<typeof buildCarryoverPayload>>["carryoverTaxation"]>> } {
  if (!carryoverEventForm(primary) || partCarryover(primary).building) return {};
  const payload = buildCarryoverPayload(primary, transferDate, ownershipRatio);
  return payload
    ? { carryoverTaxation: withDonorBuilt(payload.carryoverTaxation, primary, { transferDate }, ownershipRatio) }
    : {};
}
