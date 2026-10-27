/**
 * 테스트 픽스처 전용 — 일반건물 부담부증여 × 토지·건물 **둘 다** 이월과세인데 당초 증여자의 건물 취득일이 비었으면 채운다.
 *  · 당초 증여자 신축(`donorBuiltType = "new"`)이면 신축 취득일 — 직접 지은 건물의 취득일이다(「소득세법 시행령」 제162조 제1항 제4호 · 계획서 Q-3 a).
 *  · 그 밖에는 **토지와 같은 날**.
 *
 * 건물 취득일 칸(`buildingCarryover.donorAcquisitionDate`)이 생기기 전(계획서 `gb-bg-donor-building-acquisition-date.plan.md` Q-1 a)의 픽스처는
 * 두 파트를 증여 사건 날짜 하나로 기산했다. 그 사실을 명시한다. 제품 코드는 채우지 않는다(⑧이 막는다).
 */
import { gbBgSplitsGiftValuation } from "@/lib/calc/gb-bg-gift-tax-return";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function sameDayBuildingDonorDate(a: AssetForm): AssetForm {
  if (!gbBgSplitsGiftValuation(a) || a.buildingCarryover?.donorAcquisitionDate) return a;
  const c = a.carryover;
  const date = c?.donorBuilt && c.donorBuiltType === "new" && c.donorBuiltDate ? c.donorBuiltDate : (c?.donorAcquisitionDate ?? "");
  return { ...a, buildingCarryover: { ...(a.buildingCarryover ?? CARRYOVER_DEFAULTS), donorAcquisitionDate: date } };
}
