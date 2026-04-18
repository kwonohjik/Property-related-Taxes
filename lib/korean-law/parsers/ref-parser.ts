/**
 * 판례 본문의 참조조문·참조판례 문자열을 구조화 배열로 파싱.
 *
 * Design Ref: §3.1 — LawRef, PrecedentRef 타입 / Plan FR-04
 * Plan SC: refLaws·refPrecedents 구조화 배열 반환
 *
 * 법제처 API가 내려주는 원시 문자열은 다음 형태:
 *   "구 소득세법 제94조 제1항 제1호, 제95조 제1항, 제2항, 제4항, 제98조, 제161조 제1항"
 *   "대법원 2020.3.26. 2018두56077, 대법원 2018. 5. 15. 선고 2017두46066 판결"
 *
 * 파싱 전략:
 *   - refLaws: 법령명이 명시된 지점을 기준으로 그룹화, 그룹 내에서는 마지막 법령명을
 *     계속 이어받음(예: "소득세법 제94조, 제95조" → 둘 다 lawName=소득세법).
 *   - refPrecedents: 법원명 + 날짜 + 사건번호 트리플을 정규식으로 추출.
 *
 * 실패 시 raw 문자열로만 채운 단일 요소 배열을 반환 (UI 폴백용).
 */

import type { LawRef, PrecedentRef } from "../types";
import { resolveLawAlias } from "../aliases";

// ────────────────────────────────────────────────────────────────────────────
// 1. LawRef 파서
// ────────────────────────────────────────────────────────────────────────────

/**
 * 법령명 인식용 정규식.
 * 한글 2~20자 + (법|법률|령|규칙|시행령|시행규칙|조례|규정|기준)
 * "구 " prefix 허용 (과거 법령 표기).
 */
const LAW_NAME_RE = /(?:구\s+)?([가-힣·\s]{2,30}?)(?=\s*제\d)/;
const LAW_NAME_STRICT_RE =
  /(?:^|[,;\n\s])((?:구\s+)?(?:[가-힣·]+(?:\s+[가-힣·]+)*)(?:법|법률|령|규칙|시행령|시행규칙|조례|규정|기준|통칙))(?=\s*제?\d*조?)/g;

const ARTICLE_RE = /제(\d+)조(?:의(\d+))?/;
const HANG_RE = /제(\d+)항/;
const HO_RE = /제(\d+)호/;
const MOK_RE = /제([가-힣])목/;

const CIRCLED_DIGIT_MAP: Record<string, number> = {
  "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5,
  "⑥": 6, "⑦": 7, "⑧": 8, "⑨": 9, "⑩": 10,
  "⑪": 11, "⑫": 12, "⑬": 13, "⑭": 14, "⑮": 15,
  "⑯": 16, "⑰": 17, "⑱": 18, "⑲": 19, "⑳": 20,
};

/**
 * 원숫자 또는 "제N항" 또는 "N" 을 숫자로 변환.
 */
function parseHangLike(input: string): number | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  if (CIRCLED_DIGIT_MAP[trimmed[0]]) return CIRCLED_DIGIT_MAP[trimmed[0]];
  const m = trimmed.match(/\d+/);
  return m ? parseInt(m[0], 10) : undefined;
}

/**
 * 하나의 조문 참조 문자열(이미 법령명 그룹 내부)을 LawRef로 변환.
 * 예: "제94조 제1항 제1호 가목" → {articleNo:94, hangNo:1, hoNo:1, mokNo:"가"}
 */
function parseArticleRef(chunk: string, lawName: string, isPrior: boolean, raw: string): LawRef {
  const ref: LawRef = { raw, lawName, isPrior };
  const art = chunk.match(ARTICLE_RE);
  if (art) {
    ref.articleNo = parseInt(art[1], 10);
    if (art[2]) ref.articleSubNo = parseInt(art[2], 10);
  }
  const hang = chunk.match(HANG_RE);
  if (hang) ref.hangNo = parseInt(hang[1], 10);
  const ho = chunk.match(HO_RE);
  if (ho) ref.hoNo = parseInt(ho[1], 10);
  const mok = chunk.match(MOK_RE);
  if (mok) ref.mokNo = mok[1];
  return ref;
}

/**
 * 참조조문 문자열 → LawRef 배열.
 *
 * 알고리즘:
 *   1) 문자열을 "," / ";" / 줄바꿈 기준으로 segment 분할
 *   2) 각 segment 에서 법령명 prefix 탐색 (없으면 직전 segment 의 법령명 상속)
 *   3) segment 내 모든 "제N조..." 매칭을 LawRef 로 변환
 */
export function parseLawRefs(text: string | null | undefined): LawRef[] {
  if (!text) return [];
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const segments = cleaned.split(/\s*[,;]\s*|\n+/).filter((s) => s.trim().length > 0);
  const refs: LawRef[] = [];
  let currentLaw = "";
  let currentIsPrior = false;

  for (const seg of segments) {
    // 법령명 추출 (앞부분) — "구 "/"" 허용
    let lawName: string = currentLaw;
    let isPrior: boolean = currentIsPrior;

    // 새 법령명이 있는지 체크: segment 시작부분이 법령명 패턴과 매치
    const priorMatch = seg.match(/^(?:구\s+)?([가-힣·]+(?:\s+[가-힣·]+)*(?:법|법률|령|규칙|시행령|시행규칙|조례|규정|기준|통칙))/);
    if (priorMatch) {
      const rawName = priorMatch[1].trim();
      lawName = resolveLawAlias(rawName);
      isPrior = /^구\s/.test(seg);
      currentLaw = lawName;
      currentIsPrior = isPrior;
    }

    // 법령명이 없으면 조문만 있어도 currentLaw 사용 — 단 최초 segment에 법령명이 없으면 skip
    if (!lawName) continue;

    // segment 내 모든 "제N조..." 매칭 (한 segment 에 여러 조 포함 가능)
    // 조 기준으로 split — 뒤에 붙은 항/호/목은 각 조문과 묶어서 파싱
    const articleMatches = [...seg.matchAll(/제(\d+)조(?:의(\d+))?(?:\s*(?:제\d+항|제\d+호|제[가-힣]목|\([^)]+\))\s*)*/g)];
    if (articleMatches.length > 0) {
      for (const am of articleMatches) {
        const chunk = am[0];
        refs.push(parseArticleRef(chunk, lawName, isPrior, chunk));
      }
    } else {
      // 조번호 없이 항/호만 있는 segment — 직전 조번호 상속
      const prev = refs[refs.length - 1];
      if (prev && prev.lawName === lawName) {
        const ref: LawRef = {
          raw: seg,
          lawName,
          isPrior,
          articleNo: prev.articleNo,
          articleSubNo: prev.articleSubNo,
        };
        const hang = seg.match(HANG_RE);
        if (hang) ref.hangNo = parseInt(hang[1], 10);
        const ho = seg.match(HO_RE);
        if (ho) ref.hoNo = parseInt(ho[1], 10);
        const mok = seg.match(MOK_RE);
        if (mok) ref.mokNo = mok[1];
        if (ref.hangNo || ref.hoNo || ref.mokNo) refs.push(ref);
      }
    }
  }

  return refs;
}

// ────────────────────────────────────────────────────────────────────────────
// 2. PrecedentRef 파서
// ────────────────────────────────────────────────────────────────────────────

/**
 * 참조판례 문자열 → PrecedentRef 배열.
 *
 * 인식 패턴:
 *   - "대법원 2020. 3. 26. 선고 2018두56077 판결"
 *   - "대법원 2020.3.26. 2018두56077" (densify 후)
 *   - "서울고등법원 2019. 10. 15. 선고 2018누56010 판결"
 *   - "헌법재판소 2020. 7. 16. 2018헌바120 전원재판부 결정"
 *   - "대법원 2018. 5. 15.자 2017마5226 결정"
 */
const PRECEDENT_RE =
  /((?:대법원|서울고등법원|부산고등법원|대구고등법원|광주고등법원|대전고등법원|수원고등법원|특허법원|서울행정법원|서울중앙지방법원|[가-힣]+지방법원|[가-힣]+고등법원|헌법재판소|조세심판원))\s*(\d{4})[.\s]\s*(\d{1,2})[.\s]\s*(\d{1,2})\.?\s*(?:선고|자)?\s*(\d{4}[가-힣]{1,3}\d+)\s*(?:(판결|결정|명령))?/g;

export function parsePrecedentRefs(text: string | null | undefined): PrecedentRef[] {
  if (!text) return [];
  const refs: PrecedentRef[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(PRECEDENT_RE.source, "g");
  while ((m = re.exec(text)) !== null) {
    const court = m[1];
    const year = m[2];
    const month = String(parseInt(m[3], 10)).padStart(2, "0");
    const day = String(parseInt(m[4], 10)).padStart(2, "0");
    const caseNo = m[5];
    const judgmentType = m[6];
    const date = `${year}-${month}-${day}`;
    const key = `${court}::${caseNo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({
      raw: m[0].trim(),
      court,
      date,
      caseNo,
      judgmentType: judgmentType || undefined,
    });
  }
  return refs;
}
