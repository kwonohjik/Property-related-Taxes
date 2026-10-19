/**
 * 1세대1주택 AI 참고 의견 — 판정 메뉴 폼에서 **입력한 칸만** 남긴다(LLM에 보낼 사실 요약).
 *
 * 폼은 기본값 칸이 수백 개라 그대로 보내면 사실이 묻힌다. 빈 폼(`createInitialOneHouseJudgmentForm`)과 같은 값,
 * 명부 행은 「+ 주택 추가」 기본 행(`createHouseEntry`)과 같은 값을 뺀다. 자동 생성 식별자(`assetId` 등)도 뺀다.
 */
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { createHouseEntry } from "@/lib/stores/house-entry-factory";

const DROP_KEYS = new Set(["assetId", "assetLabel"]);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function diff(value: unknown, base: unknown): unknown {
  if (same(value, base)) return undefined;
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && base && typeof base === "object" && !Array.isArray(base)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (DROP_KEYS.has(k)) continue;
      const d = diff(v, (base as Record<string, unknown>)[k]);
      if (d !== undefined) out[k] = d;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return value;
}

export function compactJudgmentForm(form: Record<string, unknown>): Record<string, unknown> {
  const base = createInitialOneHouseJudgmentForm() as unknown as Record<string, unknown>;
  const { assets, houses, ...top } = form;
  const out = (diff(top, base) ?? {}) as Record<string, unknown>;
  const asset = Array.isArray(assets) ? diff(assets[0], (base.assets as unknown[])[0]) : undefined;
  if (asset !== undefined) out.asset = asset;
  if (Array.isArray(houses) && houses.length > 0) {
    out.houses = houses.map((h: Record<string, unknown>) => ({ id: h.id, ...((diff(h, createHouseEntry(String(h.id))) ?? {}) as object) }));
  }
  return out;
}
