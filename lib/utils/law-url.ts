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
