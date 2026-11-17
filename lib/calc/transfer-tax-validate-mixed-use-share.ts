/**
 * ⑧ 겸용주택 × 지분 분할 취득(축 B) — 지분 카드가 받지 않는 조합(계획서 `bg-mixed-use-m2-bundle-share.plan.md` V-0 fix · Q-1 · Q-2).
 *
 * 지분 카드는 물건 단위 겸용 칸을 자산 1에서 잇는다(`mixed-use-share-object-fields.ts`). 아래 둘은 그 규약에 맞지 않아 계산하지 않는다 —
 * 종전에는 지분 카드가 일반 주택으로 조용히 계산됐다.
 *
 * 1. **보유 중 일부 용도변경(소득세법 시행령 §166⑥)** — 「취득 당시」 주택 · 상가 구성은 지분마다 취득일이 달라 다르다. 토글은 자산 1의 ① 기본정보에만 있어
 *    지분 카드가 자기 취득 당시 구성을 받을 칸이 없다.
 * 2. **지분 카드의 개별주택가격 미공시 환산(§164⑦)** — 3시점 입력에 양도시 칸(물건 단위)과 취득시 칸(지분 단위)이 섞여 있어 지분 카드에서 나눠 받지 못한다.
 *    자산 1(첫 지분)의 미공시 환산은 그대로 계산한다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export const MIXED_SHARE_PARTIAL_CHANGE_MESSAGE =
  "겸용주택을 지분으로 나눠 취득한 경우(지분 분할)에는 보유 중 일부 용도변경(소득세법 시행령 §166⑥)을 함께 계산하지 않습니다 — 지분마다 취득 당시 주택·상가 구성이 달라질 수 있는데 지분 카드가 그 구성을 받지 않습니다. 「보유 중 일부 용도변경」을 끄거나 지분 분할 없이 계산하세요.";
export const MIXED_SHARE_PHD_MESSAGE =
  "겸용주택 지분 카드(둘째 이후 지분)는 개별주택가격 미공시 환산(소득세법 시행령 §164⑦)을 계산하지 않습니다 — 양도시 칸(같은 건물)과 이 지분 취득시 칸을 지분 카드에서 나눠 받지 못합니다. 이 지분 카드의 「개별주택가격 미공시」를 끄세요.";

const isMixed = (a: Pick<AssetForm, "assetKind" | "isMixedUseHouse">) => a.assetKind === "housing" && a.isMixedUseHouse === true;

/** 축 B 지분 카드 i의 차단 사유. `merged` = 병합 자산(`axisBEffectiveAsset`), `raw` = 그 카드 저장값. */
export function mixedUseShareIssue(
  i: number,
  raw: AssetForm,
  merged: AssetForm,
): { field: keyof AssetForm; message: string; assetIndex: number } | undefined {
  if (!isMixed(merged)) return undefined;
  if (i === 0 && raw.hasPartialUsageChange) return { assetIndex: 0, field: "hasPartialUsageChange", message: `자산 1: ${MIXED_SHARE_PARTIAL_CHANGE_MESSAGE}` };
  if (i > 0 && raw.usePreHousingDisclosure) return { assetIndex: i, field: "usePreHousingDisclosure", message: `자산 ${i + 1}: ${MIXED_SHARE_PHD_MESSAGE}` };
  return undefined;
}
