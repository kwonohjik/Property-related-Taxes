/**
 * 시·군·구 코드 별칭 — 행정구역 개편으로 코드가 바뀐 지역의 **구·신 코드를 서로 잇는다**.
 *
 * 계획서: docs/02-design/features/sigungu-code-system-drift.plan.md (X-1)
 *
 * ## 왜 데이터 파일을 고치지 않고 별칭을 두는가
 *
 * 양도세는 **과거 양도**를 다룬다(경정청구 5년·수정신고). 그런데 주소검색은 **항상 현행 코드**를
 * 준다 — 「2021년 시점 주소검색」 같은 것은 없다. 반면 판정 집합(조정대상지역 이력·인구감소지역)은
 * 그 시점 기준으로 작성돼 구 코드로 남아 있다.
 *
 * ⇒ 판정 집합을 신 코드로 **치환**하면 저장된 이력·수동 입력의 구 코드가 깨지고,
 *   구 코드만 두면 지금 조회한 주소가 깨진다. **양쪽을 모두 인식**해야 한다.
 *
 * ## 현재 대상 — 전남·광주 통합 (시행 2026-07-01)
 *
 * 「전남광주통합특별시 설치를 위한 특별법」(법령ID 015064 · 공포 2026-06-02 · 시행 2026-07-01)로
 * 광주 `29`·전남 `46`이 통합 시도코드 `12`로 바뀌었다. **뒷자리도 규칙적으로 바뀌지 않는다**
 * (46890 완도군 → 12850) — 산술 변환이 불가해 명시 테이블을 둔다.
 *
 * 수록 범위는 **프로젝트가 실제로 구 코드를 갖고 있는 24건**이다(`regulated-areas.ts` 8 +
 * `population-decline-areas.ts` 16). 통합 27개 시·군·구 중 나머지(목포·나주·무안)는
 * 어느 판정 집합에도 없어 별칭이 필요 없다 — 필요해지면 여기에 추가한다.
 *
 * `name`은 장식이 아니라 **검증 필드**다 — anchor가 `lookupSigungu(current).name`과 대조해
 * 손으로 적은 매핑이 틀리는 것을 막는다.
 */

export interface SigunguAlias {
  /** 개편 이전 코드 (5자리) */
  legacy: string;
  /** 현행 코드 (5자리) — 주소검색 PNU가 주는 값 */
  current: string;
  /** 시·군·구 이름 — 매핑 검증용 (anchor가 현행 테이블과 대조) */
  name: string;
}

/** 전남·광주 통합(2026-07-01) 별칭 — 구 광주 `29xxx` · 전남 `46xxx` → 통합 `12xxx` */
export const JEONNAM_GWANGJU_ALIASES: readonly SigunguAlias[] = Object.freeze([
  // 광주광역시 5개 자치구
  { legacy: "29110", current: "12210", name: "동구" },
  { legacy: "29140", current: "12240", name: "서구" },
  { legacy: "29155", current: "12270", name: "남구" },
  { legacy: "29170", current: "12300", name: "북구" },
  { legacy: "29200", current: "12330", name: "광산구" },
  // 전라남도 시부
  { legacy: "46130", current: "12130", name: "여수시" },
  { legacy: "46150", current: "12150", name: "순천시" },
  { legacy: "46230", current: "12190", name: "광양시" },
  // 전라남도 군부
  { legacy: "46710", current: "12710", name: "담양군" },
  { legacy: "46720", current: "12720", name: "곡성군" },
  { legacy: "46730", current: "12730", name: "구례군" },
  { legacy: "46770", current: "12740", name: "고흥군" },
  { legacy: "46780", current: "12750", name: "보성군" },
  { legacy: "46790", current: "12760", name: "화순군" },
  { legacy: "46800", current: "12770", name: "장흥군" },
  { legacy: "46810", current: "12780", name: "강진군" },
  { legacy: "46820", current: "12790", name: "해남군" },
  { legacy: "46830", current: "12800", name: "영암군" },
  { legacy: "46860", current: "12820", name: "함평군" },
  { legacy: "46870", current: "12830", name: "영광군" },
  { legacy: "46880", current: "12840", name: "장성군" },
  { legacy: "46890", current: "12850", name: "완도군" },
  { legacy: "46900", current: "12860", name: "진도군" },
  { legacy: "46910", current: "12870", name: "신안군" },
]);

/** 전체 별칭 — 다른 개편이 생기면 여기에 배열을 추가한다 */
const ALL_ALIASES: readonly SigunguAlias[] = JEONNAM_GWANGJU_ALIASES;

const LEGACY_TO_CURRENT = new Map(ALL_ALIASES.map((a) => [a.legacy, a.current]));
/** 현행 → 구 코드 목록 (한 현행 코드에 구 코드가 여럿일 수 있어 배열) */
const CURRENT_TO_LEGACY = new Map<string, string[]>();
for (const a of ALL_ALIASES) {
  CURRENT_TO_LEGACY.set(a.current, [...(CURRENT_TO_LEGACY.get(a.current) ?? []), a.legacy]);
}

/** 5자리 시·군·구 코드로 정규화. 10자리(행안부 표준·PNU 앞10)도 받는다. 5자리 미만은 null. */
function toFive(code: string | undefined): string | null {
  if (!code || code.length < 5) return null;
  return code.slice(0, 5);
}

/**
 * 어떤 시점의 코드든 **현행 대표 코드**로 정규화.
 * 별칭에 없으면 입력을 그대로 5자리로 돌려준다(개편되지 않은 지역).
 */
export function normalizeSigunguCode(code: string | undefined): string | null {
  const five = toFive(code);
  if (!five) return null;
  return LEGACY_TO_CURRENT.get(five) ?? five;
}

/**
 * 그 지역을 가리키는 **모든 코드**(현행 + 구). 판정 집합 조회 시 이 배열로 훑으면
 * 데이터 파일이 어느 체계로 적혀 있든 매칭된다.
 *
 * 반환 순서는 [현행, …구 코드]이며 중복은 없다.
 */
export function expandSigunguAliases(code: string | undefined): string[] {
  const five = toFive(code);
  if (!five) return [];
  const current = LEGACY_TO_CURRENT.get(five) ?? five;
  return [current, ...(CURRENT_TO_LEGACY.get(current) ?? [])];
}

/** 집합 조회 헬퍼 — 현행·구 코드 중 하나라도 들어 있으면 true */
export function hasAnySigunguAlias(set: ReadonlySet<string>, code: string | undefined): boolean {
  return expandSigunguAliases(code).some((c) => set.has(c));
}
