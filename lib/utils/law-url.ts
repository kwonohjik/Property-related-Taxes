/**
 * 도움말·결과뷰의 법조문 인용 문자열 → 국가법령정보센터 조회용 {lawName, articleNum}.
 *
 * 약칭 해석은 `resolveLawAlias`(lib/korean-law/aliases.ts) 단일 진실에 위임한다
 * (상증법→상속세및증여세법, 상증령→상속세및증여세법 시행령, 조특법→조세특례제한법 등).
 * 과거의 자체 LAW_NAME_MAP(7개)은 폐기 — aliases.ts로 일원화.
 *
 * 지원 표기:
 *   "상속세및증여세법 §19"        → [{상속세및증여세법, "19"}]
 *   "상증법 §18의2"                → [{상속세및증여세법, "18의2"}]
 *   "상증령 §15"                   → [{상속세및증여세법 시행령, "15"}]
 *   "상속세및증여세법 제19조"      → [{상속세및증여세법, "19"}]            (제N조 표기)
 *   "상증법 §60·시행령 §49②④"     → [{상속세및증여세법, "60"}, {상속세및증여세법 시행령, "49"}]
 *                                    ("시행령" 단독 = 직전 본법 상속)
 *   "상증법 §18의2 + 상증령 §15"   → 2 refs
 * 보수 처리(텍스트 유지):
 *   법령명 없는 단독 "§56" — 본법 불명 → skip (직전 상속 시 본법↔시행령 오인 방지)
 */

import { resolveLawAlias } from "@/lib/korean-law/aliases";

const ARTICLE_RE = /(?:§|제)\s*(\d+)(?:조)?(?:의\s*(\d+))?/;

/** 조각에서 조문번호 추출: "§18의2"→"18의2", "제19조"→"19", "§49②④"→"49" */
function extractArticleNum(chunk: string): string | null {
  const m = chunk.match(ARTICLE_RE);
  if (!m) return null;
  return m[1] + (m[2] ? "의" + m[2] : "");
}

/** 조각에서 법령명 부분(§·제N조 앞)만 추출. "상증법 §60"→"상증법", "§56⑤"→"" */
function extractNamePart(chunk: string): string {
  return chunk.split(/§|제\s*\d+\s*조|제\s*\d+/)[0].trim();
}

/**
 * 복합 인용 → 모달 조회용 ref 배열.
 * 구분자: , ; · + 줄바꿈. "시행령"/"시행규칙" 단독은 직전 본법명을 상속.
 */
export function parseLawRefsForModal(
  legalBasis: string,
): { lawName: string; articleNum: string }[] {
  if (!legalBasis) return [];
  const segments = legalBasis
    .split(/[,;·+\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const refs: { lawName: string; articleNum: string }[] = [];
  let baseLaw = ""; // 직전 본법 정식명 (시행령/시행규칙 접미 제외)

  for (const seg of segments) {
    const articleNum = extractArticleNum(seg);
    if (!articleNum) continue; // 조문 없는 조각 skip

    const namePart = extractNamePart(seg);
    let lawName: string;

    if (!namePart) {
      // 법령명 없는 단독 § → 본법 불명. 직전 상속은 본법↔시행령 오인 위험 → skip
      continue;
    } else if (namePart === "시행령" || namePart === "시행규칙") {
      if (!baseLaw) continue; // 직전 본법 없으면 해석 불가 → skip
      lawName = `${baseLaw} ${namePart}`;
    } else {
      lawName = resolveLawAlias(namePart);
      // baseLaw 갱신: 본법명(시행령/시행규칙 접미 제거)
      baseLaw = lawName.replace(/\s*시행(령|규칙)$/, "");
    }

    refs.push({ lawName, articleNum });
  }

  return refs;
}

/**
 * 단일 ref (첫 조문) — LawArticleModal 기존 시그니처·동작 보존.
 */
export function parseLawRef(
  legalBasis: string,
): { lawName: string; articleNum: string } | null {
  return parseLawRefsForModal(legalBasis)[0] ?? null;
}

/**
 * 국가법령정보센터 법령 페이지 URL.
 */
export function buildLawUrl(legalBasis: string): string {
  const ref = parseLawRefsForModal(legalBasis)[0];
  if (ref) {
    return `https://www.law.go.kr/법령/${encodeURIComponent(ref.lawName)}`;
  }
  // 조문 없는 법령명만 — 약칭 해석 후 URL
  const namePart = extractNamePart(legalBasis) || legalBasis.trim();
  const name = namePart ? resolveLawAlias(namePart) : "";
  return name ? `https://www.law.go.kr/법령/${encodeURIComponent(name)}` : "";
}

/** 항(項) 번호 동그라미 숫자 ①~⑮ (법령 본문 항 마커) */
const CLAUSE_MARKERS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮";

/**
 * 인용 문자열에서 항(項) 마커(①~⑮) 추출 — 조문 팝업 본문 하이라이트용 (G-5).
 *   "§63③ 할증평가" → ["③"] · "상증령 §56①④" → ["①","④"] · "§8 보험금" → []
 * 등장 순서 보존·중복 제거. 호(N호)는 인용 항 블록에 포함되므로 별도 추출하지 않는다.
 */
export function extractClauseMarkers(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const ch of text) {
    if (CLAUSE_MARKERS.includes(ch) && !found.includes(ch)) found.push(ch);
  }
  return found;
}

/**
 * 자유 텍스트(카드 제목·설명 등)에서 인라인 조문 인용을 스캔 → 배지용 ref 배열.
 *
 * `parseLawRefsForModal`은 § 앞 전체 구절을 법령명으로 간주하므로
 * "특수관계인 간 거래 (§35①)" 같은 자유 텍스트엔 쓸 수 없다(쓰레기 lawName).
 * 이 함수는 **§ 직전에 인접한 법령명 토큰(…법/…령)만** 역방향으로 보고,
 * 없으면 `defaultLaw`로 귀속한다.
 *
 *   "특수관계인 간 거래 (§35①)" + 상증법
 *     → [{ label:"§35①", legalBasis:"상속세및증여세법 §35①" }]
 *   "법인세법 §52② 시가 해당" + 상증법
 *     → [{ label:"§52②", legalBasis:"법인세법 §52②" }]
 *   "상증법 §60①·시령 §49①" + 상증법
 *     → [ ...§60①, 상속세및증여세법 시행령 §49① ]
 *
 * label에는 항(項) 마커(①…)를 포함 → LawArticleModal 항 하이라이트(label 우선) 동작.
 * 중복(legalBasis 기준) 제거·등장 순서 유지. 토큰이 깔끔히 붙지 않는 외부법 인용
 * (예: "민법상 §1001")은 defaultLaw로 귀속되므로, 그런 카드는 호출부에서 `lawRefs` 수동 지정.
 */
// 법령명 토큰: "…법" 또는 "…령"(1자+령 → "시령"·"상증령" 포함). § 직전 인접 시에만 귀속.
// "제"는 뒤에 숫자+조가 올 때만 조문 표기로 인정(공제·면제 등 흔한 단어의 '제' 오인 차단).
const INLINE_LAW_SCAN_RE =
  /([가-힣]+법|[가-힣]+령)?\s*(?:§|제(?=\s*\d+\s*조))\s*(\d+)(?:조)?(?:의\s*(\d+))?([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]*)/g;

export function extractInlineLawRefs(
  text: string,
  defaultLaw: string,
): { label: string; legalBasis: string }[] {
  if (!text) return [];
  const defaultResolved = resolveLawAlias(defaultLaw);
  let baseLaw = defaultResolved.replace(/\s*시행(령|규칙)$/, ""); // 시령 귀속용 본법
  let lastLaw = defaultResolved; // 토큰 없는 § 가 상속할 직전 법령("민법 §A·§B" → 둘 다 민법)

  const out: { label: string; legalBasis: string }[] = [];
  const seen = new Set<string>();
  let prevEnd = 0; // 직전 매치 끝 위치 — bare § 의 carry-over 판정용

  for (const m of text.matchAll(INLINE_LAW_SCAN_RE)) {
    const token = m[1];
    const num = m[2];
    if (!num) {
      prevEnd = m.index + m[0].length;
      continue;
    }
    const branch = m[3];
    const clause = m[4] ?? "";

    let lawName: string;
    if (token && /^시(행)?령$/.test(token)) {
      lawName = `${baseLaw} 시행령`;
      lastLaw = lawName;
    } else if (token === "시행규칙") {
      lawName = `${baseLaw} 시행규칙`;
      lastLaw = lawName;
    } else if (token) {
      lawName = resolveLawAlias(token);
      baseLaw = lawName.replace(/\s*시행(령|규칙)$/, "");
      lastLaw = lawName;
    } else {
      // 토큰 없는 § — 직전 매치와 이 § 사이에 한글 단어가 있으면 별개 맥락(기본법),
      // 구분자(·, , 공백·괄호)만이면 직전 법령 상속("민법 §1013·§1073" → 둘 다 민법).
      const gap = text.slice(prevEnd, m.index);
      lawName = /[가-힣]/.test(gap) ? defaultResolved : lastLaw;
      lastLaw = lawName;
    }
    prevEnd = m.index + m[0].length;

    const articleNum = num + (branch ? "의" + branch : "");
    const label = `§${articleNum}${clause}`;
    const legalBasis = `${lawName} §${articleNum}${clause}`;
    if (seen.has(legalBasis)) continue;
    seen.add(legalBasis);
    out.push({ label, legalBasis });
  }

  return out;
}
