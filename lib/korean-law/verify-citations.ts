/**
 * 법령 인용 환각 감지 (verify_citations)
 *
 * chrisryugj/korean-law-mcp src/tools/verify-citations.ts 의 핵심 로직을 이식.
 * LLM이 생성한 "소득세법 제104조 제7항 제2호" 류의 인용을 법제처 API에 실제로
 * 병렬 조회해 3분류(✓ 실존 / ✗ NOT_FOUND(환각) / ⚠ API 실패) 하고, 환각 탐지
 * 시 [HALLUCINATION_DETECTED] 헤더와 isError 플래그를 반환한다.
 *
 * 사용처:
 *  - app/api/law/verify-citations  — 독립 API
 *  - chains.ts:documentReview       — 기존 체인 위임
 *
 * 핵심 차별점:
 *  - 인용 앞 30자 역추적 + 20+ stopword 접두사 제거로 법령명 회복
 *  - dedup key = `${lawName}::${articleNo}::${hang}::${ho}`
 *  - hang 지정 시 parseHangNumber 원숫자 매칭으로 실제 해당 항 존재 여부 검증
 *  - Promise.all 병렬 + rate limit 의식 (max 20건)
 */

import { getLawText, searchLaw } from "./client";
import { LAW_ALIASES, resolveLawAlias } from "./aliases";
import { circledHangMark, circledHangNumber, parseHangNumber } from "./article-parser";
import { parseCitation } from "@/lib/legal-verification/citation-parser";

// ────────────────────────────────────────────────────────────────────────────
// 타입
// ────────────────────────────────────────────────────────────────────────────

export type CitationStatus = "verified" | "not_found" | "failed";

export interface VerifiedCitation {
  raw: string;
  status: CitationStatus;
  lawName?: string;
  articleNo?: string;
  hang?: number;
  ho?: number;
  /** ✗/⚠ 인 경우 사유 */
  reason?: string;
  /** 조문 출처 URL (✓ 일 때만) */
  sourceUrl?: string;
  /** 조문 제목 (✓ 일 때만) */
  title?: string;
}

export type VerifyHeader = "[VERIFIED]" | "[PARTIAL_VERIFIED]" | "[HALLUCINATION_DETECTED]";

export interface VerifyCitationsResult {
  header: VerifyHeader;
  /** 환각 1건 이상이면 true — UI는 경고 배너 */
  isError: boolean;
  totalCount: number;
  verifiedCount: number;
  hallucinationCount: number;
  failedCount: number;
  citations: VerifiedCitation[];
  /** 축약된 원문 (인용 부분만 하이라이트 가능하도록 위치 정보 포함) */
  summary: string;
}

export interface VerifyCitationsOptions {
  /** 한 요청에서 검증할 최대 인용 수 (기본 20) */
  maxCitations?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// 1. 인용 추출
// ────────────────────────────────────────────────────────────────────────────

type ExtractedCitation = {
  raw: string;
  lawName: string;
  articleNo: string;
  hang?: number;
  ho?: number;
  /** dedup 키 */
  key: string;
};

/**
 * 텍스트에서 법령 조문 인용 패턴 추출.
 *
 * 매칭 패턴: `법령명 제N조[의M][ 제P항][ 제Q호]` · `법령명 §N[의M][①][N호]`
 * 「제N조」와 「§N」을 원문 위치순으로 한 번에 돈다 — 이어받기(5)가 바로 앞 인용을 알아야 하기 때문이다.
 * 법령명은 인용 바로 앞에서 찾는다(우선순위 순):
 *  1. 낫표 이름 — 「소득세법 시행령」 제155조 · ｢민간임대주택에 관한 특별법｣ 제43조. 「구 「…」」(옛 조문)는 제외
 *  2. 상대 인용(「같은 법」「동법 시행령」「같은 영」)은 추출하지 않는다 — 종전엔 「동법」이 법령명으로 잡혀 거짓 「찾지 못함」이었다.
 *     「마지막으로 인용한 법령」을 따르게 해 봤으나 원문 묶음 표본 20건 중 3건이 틀렸다(관련 법령 목록의 「(4) 같은 법 시행령」은
 *     목록 머리의 법령을, 「○○법에 따른 … 같은 법 제48조」는 조문 없이 이름만 나온 법률을 가리킨다)
 *  3. 띄어 쓴 정식명(별칭 표) — 「상속세 및 증여세법」「민간임대주택에 관한 특별법」
 *  4. 법령명 회복(`recoverLawName`) — 「특별법」「법률」처럼 꼬리만 잡힌 이름은 버린다(다른 법령으로 조회된다)
 *  5. 이어받기 — 앞 인용과 접속어(및 , · ㆍ 와 과 또는)만 사이에 두면 그 법령명
 * 어느 것도 아니면 추출하지 않는다 — 틀린 법령으로 「확인됨」이 되느니 검사하지 않는다.
 */
export function extractCitations(text: string): ExtractedCitation[] {
  if (!text) return [];

  // 「제N조」 갈래와 「§N」 갈래(약칭형 「상증법 §18의2」 포함) — 꼬리는 「·」「§」 앞에서 멈춘다(뒤 인용은 따로 잡는다)
  const ARTICLE_RE = /제(\d+)조(?:의(\d+))?(?:\s*제(\d+)항)?(?:\s*제(\d+)호)?/g;
  const SECTION_RE = /§\d+(?:의\d+)?[^\s,.)·ㆍ§]*/g;
  const hits = [
    ...Array.from(text.matchAll(ARTICLE_RE), (m) => ({ m, kind: "article" as const })),
    ...Array.from(text.matchAll(SECTION_RE), (m) => ({ m, kind: "section" as const })),
  ].sort((a, b) => a.m.index - b.m.index);

  const results: ExtractedCitation[] = [];
  const seen = new Set<string>();
  let last: { lawName: string; end: number } | null = null;

  for (const { m, kind } of hits) {
    const lookback = text.slice(Math.max(0, m.index - 80), m.index);
    const lawName = nameBefore(lookback, kind, last, text.slice(last?.end ?? 0, m.index));
    if (!lawName) continue; // 법령명 회복 실패는 skip (후속 LLM-safe)

    const c = kind === "article" ? articleCitation(m, lawName) : sectionCitation(m[0], lawName);
    if (!c) continue;
    last = { lawName, end: m.index + m[0].length };
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    results.push(c);
  }
  return results;
}

function citationKey(lawName: string, articleNo: string, hang?: number, ho?: number): string {
  return `${lawName}::${articleNo}::${hang ?? ""}::${ho ?? ""}`;
}

function articleCitation(m: RegExpMatchArray, lawName: string): ExtractedCitation {
  const [articleFull, main, sub, hang, ho] = m;
  const articleNo = sub ? `제${main}조의${sub}` : `제${main}조`;
  const hangNum = hang ? parseInt(hang, 10) : undefined;
  const hoNum = ho ? parseInt(ho, 10) : undefined;
  // raw: 법령명 + 조문 전체 (원문 위치 보존용)
  return { raw: `${lawName} ${articleFull}`.trim(), lawName, articleNo, hang: hangNum, ho: hoNum, key: citationKey(lawName, articleNo, hangNum, hoNum) };
}

/** 「§N」 갈래 — 조·항·호와 약칭(「상증법」→ 상속세 및 증여세법)은 기존 파서(`parseCitation`)가 읽는다 */
function sectionCitation(section: string, lawName: string): ExtractedCitation | null {
  const raw = `${lawName} ${section}`;
  const parsed = parseCitation(raw);
  if (!parsed) return null;
  // `parseCitation`의 항 패턴은 ①~⑩까지다(`verify:legal`·커버리지 게이트가 공유해 여기서 고치지 않는다) —
  // §155⑳·㉑처럼 ⑪ 이상은 「§N」 바로 뒤 원숫자를 직접 읽는다.
  const markAfterArticle = section.match(/^§\d+(?:의\d+)?\s*([①-⑳㉑-㉟])/)?.[1];
  const hangNum = markAfterArticle
    ? (circledHangNumber(markAfterArticle) ?? undefined)
    : parsed.paragraph
      ? parseHangNumber(parsed.paragraph)
      : undefined;
  const hoNum = parsed.item ? parseInt(parsed.item, 10) : undefined;
  const hang = Number.isFinite(hangNum) ? hangNum : undefined;
  const ho = Number.isFinite(hoNum) ? hoNum : undefined;
  const name = normalizeLawName(parsed.lawFullName);
  return { raw, lawName: name, articleNo: parsed.articleNo, hang, ho, key: citationKey(name, parsed.articleNo, hang, ho) };
}

/** 앞 인용과 이 인용 사이가 접속어뿐인가 — 「제155조 및 제156조의2」 · 「§89①3호·§95②」 */
const JOINER_ONLY_RE = /^\s*(?:및|,|·|ㆍ|와|과|또는)\s*$/;

/** 「같은 법」「동법」「동 법」(+ 시행령·시행규칙) · 「동법령」 · 「같은 영」「동령」 — 앞 글자가 한글이면(「이동법」) 아니다 */
const RELATIVE_RE = /(?<![가-힣])(?:같은|동)\s?(?:법령|법(?:\s?(?:시행령|시행규칙))?|영|령)\s*$/;

/**
 * 낫표 이름 — 바로 앞이 「구 」면 옛 조문 인용이라 null(현행으로 대조하면 거짓 「찾지 못함」).
 * 안이 법령 꼬리로 끝나야 한다 — 「소득세법 시행령(2022.5.31. … 개정된 것)」처럼 낫표 안에 든 개정 괄호(옛 조문)와 각주 표시를 거른다
 */
const BRACKET_RE = /(구\s*)?[「｢]([^」｣「｢]{2,60})[」｣]\s*$/;
const LAW_SUFFIX_RE = /(?:법|법률|령|규칙|규정|조례)$/;

/** 이름 꼬리만 잡힌 것 — 「민간임대주택에 관한 특별법」 → 「특별법」은 다른 특별법으로 조회됐다(실측: 이태원참사 특별법 §43) */
const GENERIC_TAIL_NAMES = new Set(["특별법", "법률"]);

/**
 * 띄어 쓴 정식명(「상속세 및 증여세법」「국토의 계획 및 이용에 관한 법률」) — 별칭 표의 정식명과 그 시행령·시행규칙.
 * 정규식으로 「및」 앞 단어를 붙이면 문장을 이름으로 읽었다(원문 묶음 698건 실측: 「과천시 및 택지개발촉진법」 57 ·
 * 「취지 및 소득세법」 등 오탐이 진짜 「도시 및 주거환경정비법」 49 · 「상속세 및 증여세법」 10보다 많았다) ⇒ 아는 이름만 늘린다.
 */
const SPACED_LAW_NAMES = (() => {
  // 「상속세 및 증여세법」은 키에만 띄어 쓴 꼴이 있다(값은 「상속세및증여세법」) — 키와 값을 함께 본다
  const all = [...Object.keys(LAW_ALIASES), ...Object.values(LAW_ALIASES)];
  const bases = new Set(all.map((n) => n.replace(/ (?:시행령|시행규칙)$/, "")).filter((n) => n.includes(" ")));
  return [...bases].flatMap((b) => [b, `${b} 시행령`, `${b} 시행규칙`]).sort((a, b) => b.length - a.length);
})();

/** 원문이 띄어 쓴 정식명으로 끝나면 그 이름(가장 긴 것) — 앞 글자가 한글이면 단어 중간이라 아니다 */
function spacedNameAtEnd(lookback: string): string | null {
  const tail = lookback.replace(/\s+/g, " ").trimEnd();
  const full = SPACED_LAW_NAMES.find((n) => tail.endsWith(n));
  if (!full) return null;
  const before = tail.charAt(tail.length - full.length - 1);
  return /[\uAC00-\uD7A3]/.test(before) ? null : full;
}

function nameBefore(
  lookback: string,
  kind: "article" | "section",
  last: { lawName: string } | null,
  gap: string,
): string | null {
  const bracket = lookback.match(BRACKET_RE);
  if (bracket) {
    const inner = bracket[2].replace(/\s+/g, " ").trim();
    return bracket[1] || RELATIVE_RE.test(inner) || !LAW_SUFFIX_RE.test(inner) ? null : normalizeLawName(inner);
  }
  if (RELATIVE_RE.test(lookback)) return null;

  const spaced = spacedNameAtEnd(lookback);
  if (spaced) return spaced;
  const recovered = recoverLawName(lookback.slice(-30), kind === "section");
  if (recovered) return GENERIC_TAIL_NAMES.has(recovered) ? null : normalizeLawName(recovered);

  return last && JOINER_ONLY_RE.test(gap) ? last.lawName : null;
}

/** 「소득세법시행령」 → 「소득세법 시행령」 — 붙여 쓴 이름이 다른 키가 되어 같은 조문을 두 번 조회했다 */
function normalizeLawName(name: string): string {
  return name.replace(/([가-힣]법)(시행령|시행규칙)$/, "$1 $2");
}

/**
 * 인용 조문 앞 30자에서 법령명을 역추적.
 * 패턴: `[한글]+(법|시행령|시행규칙|규칙|규정|조례)$` 매칭 후 stopword 접두사 제거.
 * `section`(「§N」 갈래)은 약칭 「소득령 §155」도 받는다(종전 `SHORTHAND_RE`의 「령」 갈래).
 */
function recoverLawName(lookback: string, section = false): string | null {
  // "또한 소득세법" → "소득세법"
  // "민법"(2자) 포함 — 전체 2~30자 허용 (접두사 1자 이상 + 접미사)
  // 「소득세법 시행령」처럼 공백 띄운 공식 이름 — 아래 정규식은 공백을 넘지 못해 「시행령」 앞에서 멈추고 회복에 실패했다
  //   (실측: 「소득세법 시행령 제155조 제20항」 → 0건 — 시행령 인용이 검증 없이 통과했다)
  //   「상속세 및 증여세법 시행령」처럼 띄어 쓴 정식명은 이 함수 전에 `spacedNameAtEnd`가 별칭 표 이름으로 잡는다.
  //   (PR-0은 「및」 앞 단어를 정규식으로 붙였다 — 「제89조 및 소득세법 시행령」을 「조 및 소득세법 시행령」으로 읽었다)
  const DECREE_RE = /([\uAC00-\uD7A3]{1,29}?법)\s+(시행령|시행규칙)\s*$/;
  const decree = lookback.match(DECREE_RE);
  if (decree) return `${decree[1]} ${decree[2]}`;

  const LAW_NAME_RE = new RegExp(
    `([\\uAC00-\\uD7A3]{1,29}?(?:법률|법|시행령|시행규칙|규칙|규정|조례${section ? "|령" : ""}))\\s*$`,
  );
  const m = lookback.match(LAW_NAME_RE);
  if (!m) return null;
  const name = m[1];

  // ⚠ 종전엔 여기서 stopword 접두사("또한"·"해당"·"이"·"동"…)를 반복 제거했다.
  //   그런데 LAW_NAME_RE 의 `[가-힣]` 클래스는 **공백을 넘지 못하므로** "또한 소득세법"
  //   에서 이미 "소득세법"만 잡힌다 — 루프가 기여하는 바가 없다.
  //   반대로 붙여 쓴 실재 법령명은 갉아먹었다(실측):
  //     동물보호법 → 물보호법 · 위험물안전관리법 → 험물안전관리법 · 법률구조법 → 구조법
  //   환각 감지기가 **실존 조문을 「법령을 찾지 못했습니다」로 오판**하는 방향이라 제거했다.

  // 너무 짧은 법령명은 오탐(예: "법", "령" 단독)
  if (name.length < 2) return null;
  return name;
}

// ────────────────────────────────────────────────────────────────────────────
// 2. 단일 인용 검증
// ────────────────────────────────────────────────────────────────────────────

async function verifyOne(citation: {
  raw: string;
  lawName: string;
  articleNo: string;
  hang?: number;
  ho?: number;
}): Promise<VerifiedCitation> {
  const resolved = resolveLawAlias(citation.lawName);

  // 1) 법령 존재 확인
  let article;
  try {
    article = await getLawText(resolved, citation.articleNo);
  } catch (err) {
    return {
      raw: citation.raw,
      status: "failed",
      lawName: resolved,
      articleNo: citation.articleNo,
      reason: err instanceof Error ? err.message : "API 호출 실패",
    };
  }

  // 2) 조문이 없으면 환각
  if (!article) {
    // 법령 자체가 존재하는지 확인해 "법령 없음 vs 조문 없음" 구분
    let lawMeta = null;
    try {
      lawMeta = await searchLaw(resolved);
    } catch {
      // swallow
    }
    return {
      raw: citation.raw,
      status: "not_found",
      lawName: resolved,
      articleNo: citation.articleNo,
      hang: citation.hang,
      ho: citation.ho,
      reason: lawMeta
        ? `'${resolved}' 에는 ${citation.articleNo} 이(가) 존재하지 않습니다.`
        : `법령 '${resolved}' 을(를) 찾지 못했습니다.`,
    };
  }

  // 3) 항·호 검증 (지정된 경우만)
  if (citation.hang !== undefined) {
    const hangExists = verifyHangInBody(article.fullText, citation.hang);
    if (!hangExists) {
      return {
        raw: citation.raw,
        status: "not_found",
        lawName: resolved,
        articleNo: citation.articleNo,
        hang: citation.hang,
        ho: citation.ho,
        reason: `${citation.articleNo} 에 제${citation.hang}항이 존재하지 않습니다.`,
        sourceUrl: article.sourceUrl,
        title: article.title,
      };
    }

    if (citation.ho !== undefined) {
      const hoExists = verifyHoInBody(article.fullText, citation.hang, citation.ho);
      if (!hoExists) {
        return {
          raw: citation.raw,
          status: "not_found",
          lawName: resolved,
          articleNo: citation.articleNo,
          hang: citation.hang,
          ho: citation.ho,
          reason: `제${citation.hang}항에 제${citation.ho}호가 존재하지 않습니다.`,
          sourceUrl: article.sourceUrl,
          title: article.title,
        };
      }
    }
  }

  return {
    raw: citation.raw,
    status: "verified",
    lawName: resolved,
    articleNo: citation.articleNo,
    hang: citation.hang,
    ho: citation.ho,
    sourceUrl: article.sourceUrl,
    title: article.title,
  };
}

/**
 * 조문 본문에서 해당 항 번호 존재 여부 확인.
 * 원숫자(①②③) 또는 "제N항" 모두 수용.
 */
function verifyHangInBody(body: string, hang: number): boolean {
  if (!body || !Number.isFinite(hang)) return false;
  // 원숫자 매칭(①~㉟)
  const circled = circledHangMark(hang);
  if (circled && body.includes(circled)) return true;
  // 현행 경로(`getLawText`)는 16항부터 법제처 표기 그대로 `<16>`을 남긴다(그 아래 항은 원숫자로 온다)
  if (hang >= 16 && body.includes(`<${hang}>`)) return true;
  // "제N항" 매칭 — 단 **다른 조문의 상호참조**는 제외한다.
  //   조문 본문에는 "제94조제1항" 같은 인용이 흔한데, 그것까지 인정하면
  //   존재하지 않는 항이 verified 로 통과한다(환각을 «놓치는» 방향).
  if (new RegExp(`(?<!조\\s*)제${hang}항`).test(body)) return true;
  // 본문에 항 번호 없이 단일 문단인 경우(1개 항) — hang === 1 허용
  if (hang === 1 && !/[①-⑳]/.test(body)) return true;
  return false;
}

function verifyHoInBody(body: string, hang: number, ho: number): boolean {
  if (!body) return false;
  // 단순 체크: "N." 또는 "제N호" 패턴 존재
  // 정확한 항 내 호 범위 파싱은 복잡 — 현재는 본문 전체에서 호 존재 확인
  return new RegExp(`(?:^|[\\s\\n])${ho}\\.\\s|제${ho}호`).test(body);
}

// ────────────────────────────────────────────────────────────────────────────
// 3. 메인 API
// ────────────────────────────────────────────────────────────────────────────

/**
 * 동시 upstream 호출 상한.
 *
 * 🔴 종전엔 최대 20건을 `Promise.all` 로 한꺼번에 던졌는데, verifyOne 은 내부에서
 *    upstream 을 최대 2회(getLawText → searchLaw) 부르므로 **최대 40 동시 호출**이었다.
 *    "rate limit 의식(max 20건)" 이라는 주석과 달리 동시성 제한이 전혀 없었다.
 */
const VERIFY_CONCURRENCY = 4;

/** 상한을 지키며 순서를 보존해 매핑. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * 텍스트 내 모든 법령 조문 인용을 병렬 검증.
 * - 최대 20건(기본) — rate limit 30/min 준수
 * - 결과 3분류 집계 → 헤더 마커 + isError
 */
export async function verifyCitations(
  text: string,
  options: VerifyCitationsOptions = {}
): Promise<VerifyCitationsResult> {
  const maxCitations = options.maxCitations ?? 20;
  const extracted = extractCitations(text);
  const truncated = extracted.slice(0, maxCitations);

  if (truncated.length === 0) {
    return {
      header: "[VERIFIED]",
      isError: false,
      totalCount: 0,
      verifiedCount: 0,
      hallucinationCount: 0,
      failedCount: 0,
      citations: [],
      summary: "텍스트에서 법령 조문 인용을 찾지 못했습니다. (예: '소득세법 제89조', '지방세법 제111조 제1항 제2호')",
    };
  }

  const citations = await mapWithConcurrency(truncated, VERIFY_CONCURRENCY, verifyOne);

  const verifiedCount = citations.filter((c) => c.status === "verified").length;
  const hallucinationCount = citations.filter((c) => c.status === "not_found").length;
  const failedCount = citations.filter((c) => c.status === "failed").length;

  const header: VerifyHeader =
    hallucinationCount > 0
      ? "[HALLUCINATION_DETECTED]"
      : failedCount > 0
        ? "[PARTIAL_VERIFIED]"
        : "[VERIFIED]";

  const isError = hallucinationCount > 0;

  const truncatedNote =
    extracted.length > truncated.length
      ? ` (최대 ${maxCitations}건만 검증 — 전체 ${extracted.length}건 중 ${truncated.length}건 완료)`
      : "";

  const summary =
    `${header} ${verifiedCount}건 실존, ${hallucinationCount}건 환각, ${failedCount}건 확인 실패${truncatedNote}`;

  return {
    header,
    isError,
    totalCount: extracted.length,
    verifiedCount,
    hallucinationCount,
    failedCount,
    citations,
    summary,
  };
}
