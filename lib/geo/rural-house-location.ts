/**
 * §155⑦ 농어촌주택 **소재 요건** 자동 판별 (순수 — 네트워크 의존 없음).
 *
 * 법문(「소득세법 시행령」 §155⑦ MST 286211 · 시행 2026-07-01):
 *   "…**수도권 밖의 지역 중 읍지역(도시지역안의 지역을 제외한다) 또는 면지역**에 소재하는 주택…"
 *
 * ⚠️ 괄호가 **읍지역에만** 걸린다 — 면지역은 도시지역 여부를 따지지 않는다.
 *    실측(2026-07-31): 평창읍 하리 → 제2종일반주거지역(도시지역) → 읍이지만 **제외**.
 *    같은 평창군의 진부면은 용도지역 미지정(unknown)이나 면이라 도시지역 판정이 불필요하다.
 *
 * 계획서: docs/02-design/features/transfer-155-deeming-gaps.plan.md W-3
 */

/** 수도권 = 서울(11)·인천(28)·경기(41). 법정동코드 시도 2자리 기준. */
const CAPITAL_AREA_SIDO_CODES = new Set(["11", "28", "41"]);

export type EupMyeonKind = "eup" | "myeon" | "other" | "unknown";

/** 소재 요건 판정 결과. `unknown`은 **판정 불가**이지 미충족이 아니다. */
export type RuralLocationVerdict = "qualified" | "not_qualified" | "unknown";

/**
 * 지번주소 문자열에서 읍·면 여부 판별.
 *
 * Vworld 검색 결과의 `jibun`은 풀주소("강원특별자치도 평창군 진부면 하진부리 760")와
 * 축약형("진부면 상진부리 1306-3")이 섞여 온다(2026-07-31 실측) — 어느 쪽이든 토큰으로 잡는다.
 * 「면목동」·「읍내동」처럼 읍·면이 **접두**로 들어간 동 이름을 오탐하지 않도록
 * 토큰 **끝**이 읍·면일 때만 인정한다.
 */
export function classifyEupMyeon(jibun: string): EupMyeonKind {
  const tokens = (jibun ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "unknown";
  for (const t of tokens) {
    // 2글자 이상이어야 지명이다("읍" 한 글자 토큰은 지명이 아니다).
    if (t.length >= 2 && t.endsWith("읍")) return "eup";
    if (t.length >= 2 && t.endsWith("면")) return "myeon";
  }
  return "other";
}

/** 법정동코드(PNU 앞 10자리 또는 시군구 5자리) 기준 수도권 여부. 코드가 없으면 판정 불가. */
export function isCapitalAreaByRegionCode(regionCode: string | undefined): boolean | null {
  if (!regionCode || regionCode.length < 2) return null;
  return CAPITAL_AREA_SIDO_CODES.has(regionCode.slice(0, 2));
}

/**
 * §155⑦ 소재 요건 종합 판정.
 *
 * @param urbanVerdict `/api/address/land-use-zone`의 `verdict`("urban"|"non_urban"|"unknown").
 *                     **면지역이면 쓰지 않는다** — 괄호가 읍에만 걸리므로.
 */
export function judgeRuralHouseLocation(p: {
  regionCode?: string;
  jibun: string;
  urbanVerdict?: "urban" | "non_urban" | "unknown";
}): { verdict: RuralLocationVerdict; reason: string } {
  const inCapital = isCapitalAreaByRegionCode(p.regionCode);
  if (inCapital === null) {
    return { verdict: "unknown", reason: "소재지를 선택하면 수도권 여부·읍면을 자동 판정합니다." };
  }
  if (inCapital) {
    return { verdict: "not_qualified", reason: "수도권(서울·인천·경기) 소재 — 농어촌주택에 해당하지 않습니다." };
  }

  const kind = classifyEupMyeon(p.jibun);
  if (kind === "myeon") {
    return { verdict: "qualified", reason: "수도권 밖 면지역 — 소재 요건 충족 (도시지역 여부 불문)." };
  }
  if (kind === "other") {
    return { verdict: "not_qualified", reason: "읍·면이 아닌 지역(동 등) 소재 — 농어촌주택에 해당하지 않습니다." };
  }
  if (kind === "unknown") {
    return { verdict: "unknown", reason: "주소에서 읍·면을 확인하지 못했습니다." };
  }

  // 읍지역 — 「도시지역안의 지역을 제외한다」
  if (p.urbanVerdict === "urban") {
    return {
      verdict: "not_qualified",
      reason: "읍지역이나 용도지역이 도시지역 — §155⑦ 괄호로 제외됩니다.",
    };
  }
  if (p.urbanVerdict === "non_urban") {
    return { verdict: "qualified", reason: "수도권 밖 읍지역 + 비도시지역 — 소재 요건 충족." };
  }
  return {
    verdict: "unknown",
    reason: "읍지역입니다. 용도지역을 확인하지 못해 도시지역 제외 여부를 판정할 수 없습니다.",
  };
}
