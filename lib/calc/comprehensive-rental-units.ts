/**
 * 종부령 §3①1·3·7·10호 「다음 각 목의 요건을 모두 갖춘 주택이 2호 이상인 경우 그 주택」 — 화면이 호수를 묻는가의 단일 소스.
 * ⑤ 칸 표시(ExclusionInfoInput) · ⑧ 차단(validateQualifyingUnits) · ④ 전송(comprehensive-api)이 모두 `qualifyingUnitHo`를 쓴다.
 * 엔진 판정은 `lib/tax-engine/comprehensive-exclusion.ts` `twoPlusUnitsIssue` — 유형 집합이 같아야 한다.
 * 범위: 1·7·10호는 같은 특별시·광역시·도(§3⑤), 3호는 ⑤ 밖이라 전국(직접 해석 0건 — 확인 필요).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-two-plus-units.plan.md (Q-1~Q-7 a)
 */
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";

const HO_BY_TYPE: Record<string, "1" | "3" | "7" | "10"> = {
  private_construction: "1",
  public_construction: "1",
  existing_rental: "3",
  public_support_construction: "7",
  private_short_term_6y_construction: "10",
};

/** 이 임대등록 유형이 「2호 이상」을 묻는 호(1·3·7·10). 아니면 null. */
export function qualifyingUnitHo(registrationType: string): "1" | "3" | "7" | "10" | null {
  return HO_BY_TYPE[registrationType] ?? null;
}

/** ⑤ 칸 안내(150자 미만) */
export function qualifyingUnitHint(ho: "1" | "3" | "7" | "10"): string {
  const scope =
    ho === "3"
      ? "전국에서 3호 요건을 모두 갖춘 주택 수(§3⑤에 3호가 없어 전국 — 확인 필요)"
      : ho === "1"
        ? "같은 시·도에서 1호 요건을 모두 갖춘 건설임대 수(민간·공공 합산 · §3⑤)"
        : `같은 시·도에서 ${ho}호 요건을 모두 갖춘 주택 수(§3⑤)`;
  return `이 주택 포함, ${scope}. 2호 이상이어야 합니다. 다가구주택은 1구를 1호로 셉니다.`;
}

/** §3①1·7호 — 「30호 이상 임대」 토글과 호수가 함께 있는 유형 */
const THIRTY_TIER_HO = new Set(["1", "7"]);

/**
 * ⑧ — 호수 칸이 비면 차단(엔진은 「모름」=불성립). 요건을 갖춘 호수가 30호 이상인데 「30호 이상 임대」를 끈 1·7호도 차단
 * (요건을 갖춘 주택만 30호 이상이어도 임대 호수는 30호 이상이다 · 반대 방향은 요건 미충족 주택이 섞일 수 있어 막지 않는다).
 */
export function validateQualifyingUnits(
  p: PropertyEntry,
  registrationType: string,
  thirtyPlusAsked: boolean,
  label: string,
): string | null {
  const ho = qualifyingUnitHo(registrationType);
  if (!ho) return null;
  const basis = `종합부동산세법 시행령 §3①${ho}호${ho === "3" ? "" : "·§3⑤"}`;
  if (typeof p.qualifyingUnitCount !== "number") {
    return `${label}: 이 주택을 포함해 ${ho === "3" ? "전국" : "같은 시·도"}에서 ${ho}호 요건을 모두 갖춘 임대주택 호수를 입력하세요 — 2호 이상이어야 합니다 (${basis}).`;
  }
  if (thirtyPlusAsked && THIRTY_TIER_HO.has(ho) && p.qualifyingUnitCount >= 30 && !p.isThirtyPlusUnits) {
    return `${label}: 요건을 갖춘 호수가 30호 이상이면 「30호 이상 임대」를 켜세요 (종합부동산세법 시행령 §3①${ho}호 가목).`;
  }
  return null;
}
