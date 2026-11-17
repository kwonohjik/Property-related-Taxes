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
 * 3. **지분 카드가 미공시 환산을 꼭 써야 하는 취득** — 2005.4.30. 전 상속·증여(§163⑨ 단서 구간)와 부담부증여 × 의제취득일 전 상속·증여는
 *    주택분 취득당시 기준시가가 §164⑦ 환산가액뿐이다. 2가 그 환산을 막으므로 이 지분은 계산하지 않는다(계획서 Q-12 a — 종전에는 「켜세요」 ↔ 「끄세요」 막다른 길).
 *    `exclusive` — 이 지분은 칸을 채워도 계산하지 않으므로 그 카드의 다른 오류(「미공시를 켜세요」 포함)를 내지 않고 이 한 문구만 낸다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { mixedSec163_9CompareOf } from "./mixed-use-sec163-9";
import { isMixedBgPreDeemedInherited } from "./burdened-gift-mixed-use-scope";

export const MIXED_SHARE_PARTIAL_CHANGE_MESSAGE =
  "겸용주택을 지분으로 나눠 취득한 경우(지분 분할)에는 보유 중 일부 용도변경(소득세법 시행령 §166⑥)을 함께 계산하지 않습니다 — 지분마다 취득 당시 주택·상가 구성이 달라질 수 있는데 지분 카드가 그 구성을 받지 않습니다. 「보유 중 일부 용도변경」을 끄거나 지분 분할 없이 계산하세요.";
export const MIXED_SHARE_PHD_MESSAGE =
  "겸용주택 지분 카드(둘째 이후 지분)는 개별주택가격 미공시 환산(소득세법 시행령 §164⑦)을 계산하지 않습니다 — 양도시 칸(같은 건물)과 이 지분 취득시 칸을 지분 카드에서 나눠 받지 못합니다. 이 지분 카드의 「개별주택가격 미공시」를 끄세요.";

export const MIXED_SHARE_PHD_ERA_MESSAGE =
  "겸용주택 지분 카드(둘째 이후 지분)를 개별주택가격 공시(2005.4.30.) 전에 상속·증여받은 경우는 계산하지 않습니다 — 이 지분의 주택분 취득당시 기준시가는 개별주택가격 미공시 환산가액(소득세법 시행령 §164⑦·§163⑨ 단서 제2호)뿐인데, 지분 카드는 그 환산을 받지 않습니다.";

/** 지분 카드가 미공시 환산을 꼭 써야 하는 취득인가 — ⑤ 토글 안내 · ⑧ 같은 술어(⑤ `clausePhdRequired`와 같은 조건). */
export function mixedSharePhdRequired(merged: AssetForm): boolean {
  return mixedSec163_9CompareOf(merged)?.era === "clause" || isMixedBgPreDeemedInherited(merged);
}

const isMixed = (a: Pick<AssetForm, "assetKind" | "isMixedUseHouse">) => a.assetKind === "housing" && a.isMixedUseHouse === true;

/** 축 B 지분 카드 i의 차단 사유. `merged` = 병합 자산(`axisBEffectiveAsset`), `raw` = 그 카드 저장값. */
export function mixedUseShareIssue(
  i: number,
  raw: AssetForm,
  merged: AssetForm,
): { field: keyof AssetForm; message: string; assetIndex: number; exclusive?: true } | undefined {
  if (!isMixed(merged)) return undefined;
  if (i > 0 && mixedSharePhdRequired(merged)) return { assetIndex: i, field: "acquisitionDate", message: `자산 ${i + 1}: ${MIXED_SHARE_PHD_ERA_MESSAGE}`, exclusive: true };
  if (i === 0 && raw.hasPartialUsageChange) return { assetIndex: 0, field: "hasPartialUsageChange", message: `자산 1: ${MIXED_SHARE_PARTIAL_CHANGE_MESSAGE}` };
  if (i > 0 && raw.usePreHousingDisclosure) return { assetIndex: i, field: "usePreHousingDisclosure", message: `자산 ${i + 1}: ${MIXED_SHARE_PHD_MESSAGE}` };
  return undefined;
}
