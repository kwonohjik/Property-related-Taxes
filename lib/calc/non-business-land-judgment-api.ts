/**
 * ④⑬ 비사업용 토지 판정 메뉴 폼 → `POST /api/calc/non-business-land-judgment` 본문 · fetch.
 *
 * 계획서 `docs/01-plan/features/nbl-judgment-menu.engine.plan.md` §5.1 · 「사용자 결정 2차」 Q-1 (c).
 *
 * 변환 함수를 새로 쓰지 않는다 — 계산기 ④와 같은 `buildNonBusinessLandRaw`(AssetForm → raw)를 그대로 싣는다.
 * 메뉴의 토지 상태가 `AssetForm`이어야 하는 이유다(어댑터가 한 칸을 빠뜨리는 순간 「메뉴와 계산기가 다른 답」).
 * 이월과세는 증여 등기접수일(`carryoverGiftRegistryDate`)을 최상위에 더한다 — 서버가 시나리오 B(수증일 기산)를 판정하는 입력이다(계산기 ⑭와 같은 함수).
 *
 * 🔴 응답 envelope: 성공 `{ data }` · 실패 `{ error: { code, message, fieldErrors? } }` — 판정 route 공통(`one-house-exemption-api.ts` 머리 주석의 `[object Object]` 사고 선례).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { buildNonBusinessLandRaw } from "./non-business-land-request";
import { formatFieldErrors } from "./transfer-tax-error-format";
import type { NonBusinessLandJudgmentResponse } from "@/app/api/calc/non-business-land-judgment/route";

export interface NblJudgmentApiBody {
  nonBusinessLandRaw: Record<string, unknown>;
  /** 이월과세(`carryover_gift`)이고 증여 등기접수일이 있을 때만 */
  carryoverGiftRegistryDate?: string;
}

/**
 * ④ — `undefined` = ⑧이 먼저 막았어야 하는 상태(정밀판정 OFF · 면적·취득일·지목 누락 — 계산기 ④와 같다).
 * 이월과세 아닌 자산에 남은 `carryover.giftRegistryDate` 잔재는 싣지 않는다(취득원인이 게이트).
 */
export function buildNblJudgmentApiBody(asset: AssetForm, transferDate: string): NblJudgmentApiBody | undefined {
  const raw = buildNonBusinessLandRaw(asset, transferDate);
  if (!raw) return undefined;
  const giftRegistryDate = asset.acquisitionCause === "carryover_gift" ? asset.carryover?.giftRegistryDate : undefined;
  return { nonBusinessLandRaw: raw, ...(giftRegistryDate ? { carryoverGiftRegistryDate: giftRegistryDate } : {}) };
}

/** ⑬ fetch. 본문이 만들어지지 않으면(⑧ 통과 전) 요청하지 않고 던진다. */
export async function callNblJudgmentAPI(asset: AssetForm, transferDate: string): Promise<NonBusinessLandJudgmentResponse> {
  const body = buildNblJudgmentApiBody(asset, transferDate);
  if (!body) throw new Error("비사업용 토지 판정에 필요한 입력(토지 면적·취득일·지목)이 부족합니다.");
  const res = await fetch("/api/calc/non-business-land-judgment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (json as { error?: { message?: string; fieldErrors?: Record<string, string[]> } } | null)?.error;
    const message = error?.message ?? `HTTP ${res.status}`;
    if (error?.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
      throw new Error(formatFieldErrors(error.fieldErrors, message));
    }
    throw new Error(message);
  }
  return (json as { data: NonBusinessLandJudgmentResponse }).data;
}
