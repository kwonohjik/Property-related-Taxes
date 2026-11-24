/**
 * 비사업용 토지 판정 — 「입력했는데 이 판정에 쓰이지 않은 칸」 한국어 문구 (표시 전용 · 계획서 `nbl-judgment-menu.ui.plan.md` §6-4)
 *
 * 서버가 한 번만 정한 `inputEffects`(`NblInputEffects`)를 **그대로 읽는다** — 지목 표(`consumes*`)를 화면이 다시 부르지 않는다(이중 진실 금지).
 * `applied`·`not_declared`는 줄을 만들지 않는다(쓰였거나 입력하지 않았다). 상태·칸이 늘면 아래 `Record`가 컴파일에서 막는다.
 */
import type { NblInputEffect } from "@/lib/tax-engine/non-business-land-menu-effects";
import type { NblInputEffects } from "@/lib/tax-engine/non-business-land-menu-effects";

/** 칸 → 화면에서 부르는 이름 (키 누락은 컴파일 오류). */
const FIELD_LABEL = {
  gracePeriods: "부득이한 사유",
  deemedTransfer: "양도일 의제",
  urbanIncorporation: "도시편입일",
} as const satisfies Record<keyof NblInputEffects, string>;

/** 상태 → 문장 꼬리. `null` = 줄을 만들지 않는다. 상태가 늘면 컴파일 오류. */
const EFFECT_PREDICATE = {
  applied: null,
  not_declared: null,
  ignored_by_category: "입력했지만 이 지목의 판정에서는 읽지 않아 반영되지 않았습니다 — 확인 필요",
  overridden_by_unconditional: "입력했지만 무조건 사업용 의제가 성립해 판정에 쓰이지 않았습니다",
} as const satisfies Record<NblInputEffect, string | null>;

/** 받침 유무로 「은/는」을 고른다. */
function topicParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? "은" : "는";
}

export interface NblInputEffectLine {
  field: keyof NblInputEffects;
  effect: NblInputEffect;
  text: string;
}

export function nblInputEffectLines(effects: NblInputEffects | undefined | null): NblInputEffectLine[] {
  if (!effects) return [];
  const out: NblInputEffectLine[] = [];
  for (const field of Object.keys(FIELD_LABEL) as (keyof NblInputEffects)[]) {
    const effect = effects[field];
    const predicate = effect ? EFFECT_PREDICATE[effect] : null;
    if (!predicate) continue;
    const label = FIELD_LABEL[field];
    out.push({ field, effect, text: `${label}${topicParticle(label)} ${predicate}` });
  }
  return out;
}
