/**
 * 「양도일 기준 조정대상지역」 칸을 보이는 자산 — ⑤ 렌더 · 만짐 표지 존중 · Step4 리셋 · 결과 고지가 함께 읽는 단일 소스.
 *
 * 칸이 있어야 하는 곳은 그 값이 **세액을 바꾸는** 자산이다(계획서 `docs/00-pm/regulated-rights-transfer-toggle.plan.md` §2 실측).
 *
 * | 자산 | 양도일 값이 바꾸는 것 | 칸 |
 * |---|---|---|
 * | 주택 | 다주택 중과(소득세법 §104⑦) · 거주요건 | ✅ |
 * | 재개발 완공 APT | 다주택 중과(같은 §104⑦ — `housing`으로 번역돼 같은 경로) | ✅ |
 * | 분양권 | **§104①4호(조정대상지역 주택분양권 50%)** — 그 호가 있는 양도일 구간에서만 | ✅ 구간 안만 |
 * | 조합원입주권 | 단건 양도 세액 불변(실측 M-8) — 비과세·일시적 2주택 경로는 미확인 | ❌ |
 *
 * 분양권의 구간은 상수를 복제하지 않고 엔진 단계표(`SHORT_TERM_RATE_HISTORY`)의 `regulatedPresaleRight`에서 읽는다 —
 * 엔진 `resolveShortTermRate`가 같은 칸으로 4호를 정한다. 단서(영 §167의6) 구간(`PRESALE_RIGHT_CLAUSE4_PROVISO_WINDOW`)은 이보다 43일 좁고 별개다.
 */
import { SHORT_TERM_RATE_HISTORY } from "@/lib/tax-engine/data/short-term-rate-history";
import { isOneHouseExemptionAsset } from "@/lib/calc/housing-like-asset";

/** 양도일에 §104①4호(조정대상지역 주택분양권)가 존재하는가 — 엔진과 같은 단계표를 읽는다. */
export function presaleRightClause4Era(transferDate: string | undefined): boolean {
  if (!transferDate) return false;
  const tier = SHORT_TERM_RATE_HISTORY.find((t) => transferDate >= t.from);
  return tier?.regulatedPresaleRight != null;
}

/** 양도일 조정대상지역 칸이 있는 자산·양도일인가. */
export function regulatedAtTransferToggleApplies(kind: string | undefined, transferDate: string | undefined): boolean {
  if (isOneHouseExemptionAsset(kind)) return true;
  return kind === "presale_right" && presaleRightClause4Era(transferDate);
}
