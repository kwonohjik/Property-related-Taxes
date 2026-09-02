/**
 * 시·군·구 코드 → **자치단체 단위** 정규화 (재촌 판정 공용 leaf).
 *
 * 법령: 재촌·거주 요건의 「구」는 **자치구만**이다 — 일반구(행정구)는 「구」가 아니라
 * 상위 「시」가 판정 단위다. 두 세목의 문언이 같다(KoreanLaw `get_law_text` 직접 확인 2026-09-02):
 *
 *   · 「소득세법 시행령」 §153③1호 — 「농지가 소재하는 시(특별자치시와 …행정시를 포함한다.
 *     이하 이 항에서 같다)ㆍ군ㆍ구(**자치구인 구를 말한다**. 이하 이 항에서 같다)안의 지역」
 *     같은 항 2호 — 「제1호의 지역과 **연접한** 시ㆍ군ㆍ구안의 지역」
 *     (§168의8②·§168의9②가 이 정의를 그대로 끌어쓴다)
 *   · 「상속세 및 증여세법 시행령」 §16②1호나 — 「…시(…)ㆍ군ㆍ구(**자치구를 말한다**.
 *     이하 이 조에서 같다), 그와 연접한 시ㆍ군ㆍ구 또는 …30킬로미터 이내」
 *
 * 그러므로 **양도세(비사업용 토지 재촌)와 상속세(영농상속공제 거주지)가 같은 leaf를 쓴다** —
 * 한쪽만 고치면 두 세목이 갈린다(`non-business-land/residence.ts`가 미러임을 명시).
 *
 * ⚠️ **일반구 판별은 코드 자릿수 규칙이 아니라 명칭이다.** 실측(256건):
 *   · 「code[3:5] !== "00"」 → 238건이 걸려 서울 종로구·의정부시까지 오탐한다.
 *   · 「끝자리 ≠ 0」 → 서울 광진구·인천 연수구·증평군·태안군 12건을 오탐한다.
 *   · **fullName이 3토큰(도 + 시 + 구)** → 정확히 39건 · 13개 시. 반례 0건.
 *     (수원·성남·안양·부천·안산·고양·용인·화성·청주·천안·포항·창원·전주)
 *   같은 시의 구들은 앞 4자리가 일치하고, 그 prefix를 쓰는 비일반구 코드는 **0건**이다.
 *   따라서 「앞4자리 + '0'」이 곧 행안부 시 코드다(창원시 48120·고양시 41280·수원시 41110).
 *
 * 코드 체계: 5자리계(`lib/korean-law/sigungu-codes.json` — 양도세)와
 * 10자리계(5자리 + "00000" — 상속세 PNU·`administrative-district-adjacency.json`)를 모두 받는다.
 * 반환 단위 코드는 **항상 5자리**이므로 두 체계를 섞어 비교해도 안전하다.
 */

import { SIGUNGU_CODES } from "@/lib/korean-law/sigungu-codes";

/** 일반구가 속한 시의 앞 4자리 prefix 집합 (fullName 3토큰 = 도 + 시 + 구). */
const GENERAL_DISTRICT_PREFIXES: ReadonlySet<string> = new Set(
  SIGUNGU_CODES.filter((s) => s.fullName.trim().split(/\s+/).length === 3).map((s) =>
    s.code.slice(0, 4),
  ),
);

/** prefix → 그 시에 속한 일반구 5자리 코드 목록. */
const UNIT_MEMBERS: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const s of SIGUNGU_CODES) {
    const p = s.code.slice(0, 4);
    if (!GENERAL_DISTRICT_PREFIXES.has(p)) continue;
    const list = m.get(p);
    if (list) list.push(s.code);
    else m.set(p, [s.code]);
  }
  return m;
})();

/**
 * 시·군·구 코드를 자치단체 단위 코드(5자리)로 정규화.
 *
 * - 일반구 → 상위 시 코드 (창원시 진해구 `48129` → 창원시 `48120`)
 * - 자치구·시·군 → 앞 5자리 그대로 (서울 강남구 `11680`)
 * - 5자리 미만·빈 값 → 입력 그대로 (자동 추정 금지)
 */
export function resolveSigunguUnitCode(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const five = code.slice(0, 5);
  if (five.length < 5) return five;
  const prefix = five.slice(0, 4);
  return GENERAL_DISTRICT_PREFIXES.has(prefix) ? `${prefix}0` : five;
}

/**
 * 같은 자치단체에 속한 시·군·구 코드 목록 — 입력과 **같은 자릿수**로 반환.
 *
 * 일반구면 형제 구 전부, 아니면 자기 자신 하나. 10자리 입력에는 "00000"을 다시 붙인다.
 */
export function listSigunguCodesInUnit(code: string): string[] {
  const five = code.slice(0, 5);
  if (five.length < 5) return [code];
  const pad = code.length > 5 ? "0".repeat(code.length - 5) : "";
  const members = UNIT_MEMBERS.get(five.slice(0, 4));
  return members ? members.map((m) => m + pad) : [code];
}

/**
 * **자치단체 단위** 연접 코드 목록 (§153③2호 · 상증령 §16②1호나 「연접한 시ㆍ군ㆍ구」).
 *
 * 연접 매트릭스는 구 단위로 만들어져 있어(진해구의 인접에 같은 창원시 의창구가 없다)
 * 형제 구의 인접을 **union**한 뒤 단위 코드로 접고, 자기 단위는 제외한다.
 *
 * @param code        기준 토지·자산 소재지 코드 (5자리 또는 10자리)
 * @param resolveRaw  원본 매트릭스 조회 — 입력과 같은 자릿수 코드로 호출된다
 */
export function resolveAdjacentUnitCodes(
  code: string,
  resolveRaw: (sigunguCode: string) => readonly string[],
): string[] {
  const own = resolveSigunguUnitCode(code);
  const out = new Set<string>();
  for (const member of listSigunguCodesInUnit(code)) {
    for (const raw of resolveRaw(member)) {
      const unit = resolveSigunguUnitCode(raw);
      if (unit && unit !== own) out.add(unit);
    }
  }
  return [...out];
}
