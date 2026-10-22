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
import { type CitationEra, getApplicableLaw, resolveCitationEraDate } from "./applicable-law";
import { LawApiError } from "./client-core";
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
  /** 옛 조문 인용 — 법령명 뒤 개정 괄호. 있으면 그 시대 시행본으로 대조한다 */
  era?: CitationEra;
  /** dedup 키 */
  key: string;
};

/** 법령명과 (옛 조문이면) 그 시대 — 이어받기·항 이어짐·「같은 조」가 함께 넘겨받는다 */
type Named = { lawName: string; era?: CitationEra };

/**
 * 텍스트에서 법령 조문 인용 패턴 추출.
 *
 * 매칭 패턴: `법령명 제N조[의M][ 제P항][ 제Q호]` · `법령명 §N[의M][①][N호]`
 * 「제N조」와 「§N」을 원문 위치순으로 한 번에 돈다 — 이어받기(6)가 바로 앞 인용을 알아야 하기 때문이다.
 * 법령명은 인용 바로 앞에서 찾는다(우선순위 순):
 *  1. 낫표 이름 — 「소득세법 시행령」 제155조 · ｢민간임대주택에 관한 특별법｣ 제43조. 「구 「…」」(옛 조문)는 제외
 *  2. 상대 인용(「같은 법」「동법 시행령」「같은 영」) — **같은 줄에서 마지막으로 이름이 나온 법령**(조문 유무 무관).
 *     같은 줄에 이름이 없거나 사이에 목록 표시(「(4)」「①」「가.」)가 있으면 건너뛴다.
 *     「바로 앞 인용의 법령」을 따르면 원문 묶음 표본 20건 중 3건이 틀렸다(목록 항목 머리의 「(4) 같은 법 시행령」 ·
 *     조문 없이 이름만 나온 법률을 가리키는 「같은 법」) — 이 규칙은 둘 다 피하고 표본 40건이 모두 맞았다(계획서 F-2)
 *  3. 띄어 쓴 정식명(별칭 표) — 「상속세 및 증여세법」「민간임대주택에 관한 특별법」
 *  4. 법령명 회복(`recoverLawName`) — 「특별법」「법률」처럼 꼬리만 잡힌 이름은 버린다(다른 법령으로 조회된다)
 *  5. 약칭 「법 제N조」「영 제N조」 — 마지막으로 인용된 조문 머리(「○○ 시행령 제N조【…】」)가 시행령·시행규칙일 때만 그 모법·모법 시행령
 *     (하위 법령 본문이 모법을 「법」이라 부르는 작성 관례. 앞 이름이 법률이면 무엇을 가리키는지 정할 근거가 없다)
 *  6. 이어받기 — 앞 인용과 접속어(및 , · ㆍ 와 과 또는)만 사이에 두면 그 법령명
 * 「구 소득세법」처럼 옛 조문이라 밝힌 이름과 그것을 가리키는 상대 인용·약칭은 건너뛴다. 단 법령명 뒤 괄호에 날짜가 있으면
 * (「(2020. 2. 11. 대통령령 제30395호로 개정되기 전의 것)」·「(… 제N호로 개정된 것)」) 그 시대(`era`)를 붙여 추출한다.
 * 어느 것도 아니면 추출하지 않는다 — 틀린 법령으로 「확인됨」이 되느니 검사하지 않는다.
 * 인용 뒤에 「및 제21항」「및 제2호」처럼 항·호만 이어지면 같은 조문의 항·호로, 「같은 조 제N항」은 바로 앞 인용의 조문으로 읽는다.
 */
export function extractCitations(text: string): ExtractedCitation[] {
  if (!text) return [];
  // 1차는 이름이 직접 붙은 인용만 — 거기서 나온 법령명이 상대 인용·약칭의 「앞 이름」 후보가 된다(별칭 표 이름과 함께)
  const direct = extractWith(text, null);
  return extractWith(text, mentionIndex(text, direct.map((c) => c.lawName)));
}

// 「제N조」 갈래와 「§N」 갈래(약칭형 「상증법 §18의2」 포함) — 꼬리는 「·」「§」 앞에서 멈춘다(뒤 인용은 따로 잡는다).
// 「제99조의 2」처럼 띄어 쓴 가지 번호도 받는다 — 종전엔 「제99조」로 읽어 **다른 조문으로 「확인됨」**이 됐다(원문 묶음 263회).
// 단 「제154조의 1세대1주택」「제97조의 10년」의 숫자는 가지 번호가 아니다 — 뒤따르는 말로 거른다
const ARTICLE_RE = /제\s?(\d+)\s?조(?:\s?의\s?(\d+)(?!\d|세대|년|개월|배|분|%|주택))?(?:\s*제(\d+)항)?(?:\s*제(\d+)호)?/g;
const SECTION_RE = /§\d+(?:의\d+)?[^\s,.)·ㆍ§]*/g;
/** 「같은 조 제N항」 — 바로 앞 인용의 조문 */
const SAME_ARTICLE_RE = /같은\s?조\s*제(\d+)항(?:\s*제(\d+)호)?/g;
/** 인용 바로 뒤에 항·호만 이어진 것 — 「제155조 제20항 및 제21항」 · 「제89조 제3호 및 제4호」 */
const CONTINUATION_RE = /\s*(?:및|,|·|ㆍ|또는|과|와)\s*제(\d+)(항|호)(?:\s*제(\d+)호)?/y;

type LastCitation = Named & { articleNo: string; hang?: number; end: number };

function extractWith(text: string, mentions: Mention[] | null): ExtractedCitation[] {
  const hits = [
    ...Array.from(text.matchAll(ARTICLE_RE), (m) => ({ m, kind: "article" as const })),
    ...Array.from(text.matchAll(SECTION_RE), (m) => ({ m, kind: "section" as const })),
    ...Array.from(text.matchAll(SAME_ARTICLE_RE), (m) => ({ m, kind: "same" as const })),
  ].sort((a, b) => a.m.index - b.m.index);

  const results: ExtractedCitation[] = [];
  const seen = new Set<string>();
  const add = (c: ExtractedCitation) => {
    if (seen.has(c.key)) return;
    seen.add(c.key);
    results.push(c);
  };
  let last: LastCitation | null = null;

  for (const { m, kind } of hits) {
    if (kind === "same") {
      // 앞 인용과 같은 줄이고 사이에 닫는 괄호가 없을 때만 — 「제154조 …(… 제160조 …) 같은 조 제1항」의 「같은 조」는
      // 괄호 앞 조문을 가리킨다(원문 묶음 표본). 줄이 바뀌어도 무엇을 가리키는지 원문 구조를 봐야 한다
      if (!last || /[\n)）]/.test(text.slice(last.end, m.index))) continue;
      const hang = parseInt(m[1], 10);
      const ho = m[2] ? parseInt(m[2], 10) : undefined;
      add(paragraphCitation(last, last.articleNo, hang, ho));
      last = { ...named(last), articleNo: last.articleNo, hang, end: m.index + m[0].length };
      continue;
    }

    const name = nameBefore(text, m.index, kind, last, text.slice(last?.end ?? 0, m.index), mentions);
    if (!name) continue; // 법령명 회복 실패는 skip (후속 LLM-safe)

    const c = kind === "article" ? articleCitation(m, name) : sectionCitation(m[0], name);
    if (!c) continue;
    add(c);
    last = { ...name, articleNo: c.articleNo, hang: c.hang, end: m.index + m[0].length };

    if (kind !== "article") continue;
    CONTINUATION_RE.lastIndex = last.end;
    for (let x = CONTINUATION_RE.exec(text); x; x = CONTINUATION_RE.exec(text)) {
      const n = parseInt(x[1], 10);
      const hang: number | undefined = x[2] === "항" ? n : last.hang;
      const ho = x[2] === "항" ? (x[3] ? parseInt(x[3], 10) : undefined) : n;
      add(paragraphCitation(name, c.articleNo, hang, ho));
      last = { ...name, articleNo: c.articleNo, hang, end: CONTINUATION_RE.lastIndex };
    }
  }
  return results;
}

function named(n: Named): Named {
  return n.era ? { lawName: n.lawName, era: n.era } : { lawName: n.lawName };
}

/** 표시용 법령명 — 옛 조문이면 시대를 붙인다(「소득세법 시행령(2020-02-11 개정 전)」) */
function displayName({ lawName, era }: Named): string {
  if (!era) return lawName;
  return `${lawName}(${era.kind === "before" ? `${era.date} 개정 전` : `제${era.ancNo}호 개정`})`;
}

/** 이어진 항·호와 「같은 조」 — 조문 표기는 앞 인용 그대로 */
function paragraphCitation(n: Named, articleNo: string, hang?: number, ho?: number): ExtractedCitation {
  const raw = `${displayName(n)} ${articleNo}${hang ? ` 제${hang}항` : ""}${ho ? ` 제${ho}호` : ""}`;
  return { raw, ...named(n), articleNo, hang, ho, key: citationKey(n, articleNo, hang, ho) };
}

/** 같은 조문의 현행 인용과 옛 인용은 따로 검사한다 */
function citationKey({ lawName, era }: Named, articleNo: string, hang?: number, ho?: number): string {
  const e = era ? (era.kind === "before" ? `before:${era.date}` : `amended:${era.ancNo}`) : "";
  return `${lawName}::${articleNo}::${hang ?? ""}::${ho ?? ""}::${e}`;
}

function articleCitation(m: RegExpMatchArray, n: Named): ExtractedCitation {
  const [articleFull, main, sub, hang, ho] = m;
  const articleNo = sub ? `제${main}조의${sub}` : `제${main}조`;
  const hangNum = hang ? parseInt(hang, 10) : undefined;
  const hoNum = ho ? parseInt(ho, 10) : undefined;
  // raw: 법령명 + 조문 전체 (원문 위치 보존용)
  return { raw: `${displayName(n)} ${articleFull}`.trim(), ...named(n), articleNo, hang: hangNum, ho: hoNum, key: citationKey(n, articleNo, hangNum, hoNum) };
}

/** 「§N」 갈래 — 조·항·호와 약칭(「상증법」→ 상속세 및 증여세법)은 기존 파서(`parseCitation`)가 읽는다 */
function sectionCitation(section: string, n: Named): ExtractedCitation | null {
  const parsed = parseCitation(`${n.lawName} ${section}`);
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
  const name: Named = { ...named(n), lawName: normalizeLawName(parsed.lawFullName) };
  return { raw: `${displayName(name)} ${section}`, ...name, articleNo: parsed.articleNo, hang, ho, key: citationKey(name, parsed.articleNo, hang, ho) };
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
/** 「주택법 일부개정법률 제63조의2」 — 개정하는 법률(그 부칙 조문)이지 법령명이 아니다 */
const AMENDING_ACT_RE = /개정법(?:률)?$/;

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

/** 약칭 「법 제N조」「영 제N조」 — 「이 법」「구 법」은 아니다(앞 글자가 한글이면 「세법」 같은 이름의 꼬리) */
const ABBREVIATION_RE = /(?<![가-힣]|(?:이|구)\s)(법|영)\s*$/;

/** 「구 소득세법」 — 이름 앞에 「구」(옛 조문). 앞 글자가 한글이면(「광산구 」) 아니다 */
function isLegacyName(lookback: string, name: string): boolean {
  const body = escapeRe(name).replace(/ /g, "\\s*");
  return new RegExp(`(?:^|[^가-힣])구\\s*${body}\\s*$`).test(lookback);
}

/** 법령명 바로 뒤의 괄호 — 「소득세법 시행령(2020. 2. 11. … 개정되기 전의 것) 제155조」 · 「「…」(…) 제N조」 */
const ERA_TAIL_RE = /([」｣]?)\s*\(([^()]{4,90})\)\s*$/;
const ERA_DATE_RE = /^\s*(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?/;

/**
 * 개정 괄호 → 시대. 날짜가 없거나(「(… 개정되기 전의 것)」만) 다른 괄호(「(이하 '법')」「(… 시행)」)면 null — 추출하지 않는다.
 * `owner`는 괄호가 붙은 법령 — 「개정된 것」의 공포번호를 그 법령의 연혁 목록에서 찾는다
 */
export function parseCitationEra(bracket: string, owner: string): CitationEra | null {
  const d = bracket.match(ERA_DATE_RE);
  if (!d) return null;
  const date = `${d[1]}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}`;
  const t = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== date) return null;
  const compact = bracket.replace(/\s+/g, "");
  if (/개정되기전의것$/.test(compact)) return { kind: "before", date };
  const no = compact.match(/(?:법률|대통령령|[가-힣]+부령|총리령)제(\d+)호로개정된것$/);
  return no ? { kind: "amendedBy", date, ancNo: no[1], owner } : null;
}

/**
 * 인용 바로 앞의 법령명. `allowLegacy`는 개정 괄호에 날짜가 있을 때(시대를 정할 수 있을 때) 「구 」를 받는다.
 */
function nameBefore(
  text: string,
  pos: number,
  kind: "article" | "section",
  last: Named | null,
  gap: string,
  mentions: Mention[] | null,
  allowLegacy = false,
): Named | null {
  const lookback = text.slice(Math.max(0, pos - 80), pos);
  const eraTail = lookback.match(ERA_TAIL_RE);
  if (eraTail) {
    const namePos = pos - lookback.length + eraTail.index! + eraTail[1].length;
    const r = nameBefore(text, namePos, kind, null, "", mentions, true);
    const era = r && parseCitationEra(eraTail[2], r.lawName);
    return r && era ? { lawName: r.lawName, era } : null;
  }
  const bracket = lookback.match(BRACKET_RE);
  if (bracket) {
    let inner = bracket[2].replace(/\s+/g, " ").trim();
    // 낫표 안에 든 개정 괄호 — 「소득세법 시행령(2022. 5. 31. … 개정된 것)」
    const innerEra = inner.match(/^(.+?)\s*\(([^()]{4,90})\)$/);
    let era: CitationEra | null = null;
    if (innerEra) {
      inner = innerEra[1];
      era = parseCitationEra(innerEra[2], normalizeLawName(inner.replace(/^구\s/, "")));
      if (!era) return null;
    }
    const legacy = !!bracket[1] || /^구\s/.test(inner);
    if ((legacy && !era && !allowLegacy) || RELATIVE_RE.test(inner)) return null; // 「구 소득세법 시행령」
    inner = inner.replace(/^구\s/, "");
    if (!LAW_SUFFIX_RE.test(inner)) return null;
    return era ? { lawName: normalizeLawName(inner), era } : { lawName: normalizeLawName(inner) };
  }
  const relative = lookback.match(RELATIVE_RE);
  if (relative) return mentions ? relativeName(text, pos - lookback.length + relative.index!, relative[0], mentions) : null;

  const spaced = spacedNameAtEnd(lookback);
  if (spaced) return isLegacyName(lookback, spaced) && !allowLegacy ? null : { lawName: spaced };
  const recovered = recoverLawName(lookback.slice(-30), kind === "section");
  if (recovered) {
    if (GENERIC_TAIL_NAMES.has(recovered) || AMENDING_ACT_RE.test(recovered)) return null;
    if (isLegacyName(lookback, recovered) && !allowLegacy) return null;
    // 붙여 쓴 「구소득세법」 · 이름 없는 「구법」「구시행령」
    const rest = recovered.slice(1).replace(/\s/g, "");
    if (recovered.startsWith("구") && /^(?:법|시행령|시행규칙)$/.test(rest)) return null;
    if (recovered.startsWith("구") && COMPACT_ALIAS_NAMES.has(rest)) {
      return allowLegacy ? { lawName: normalizeLawName(recovered.slice(1)) } : null;
    }
    return { lawName: normalizeLawName(recovered) };
  }
  const abbreviation = lookback.match(ABBREVIATION_RE);
  if (abbreviation) {
    return mentions ? abbreviationName(pos - lookback.length + abbreviation.index!, abbreviation[1], mentions) : null;
  }

  return last && JOINER_ONLY_RE.test(gap) ? named(last) : null;
}

// ── 앞 이름(언급) — 상대 인용·약칭이 가리키는 법령 ─────────────────────────────

/** `era`: 이름 뒤 개정 괄호의 시대 · `"unknown"`은 개정 괄호가 있으나 날짜를 못 읽은 것(가리키면 건너뛴다) */
type Mention = { start: number; end: number; name: string; legacy: boolean; era: CitationEra | "unknown" | null; heading: boolean };

/** 법령 이름 후보 — 별칭 표 키·값 중 법령 꼬리로 끝나는 것(「소득령」「상증법」 같은 약칭 포함) */
const MENTION_ALIAS_NAMES = [...new Set([...Object.keys(LAW_ALIASES), ...Object.values(LAW_ALIASES)])].filter(
  (n) => n.length >= 3 && /(?:법|법률|령|규칙)$/.test(n),
);
const COMPACT_ALIAS_NAMES = new Set(MENTION_ALIAS_NAMES.map((n) => n.replace(/\s/g, "")));

/** 이름 바로 뒤의 개정 괄호 — 「소득세법 시행령(2011. 3. 28. … 개정되기 전의 것)」. 「(이하 '영'이라 한다)」는 아니다 */
const ERA_BRACKET_RE = /^\s*[」｣]?\s*\(([^()]{0,90})\)/;
/** 조문 머리 — 「소득세법 시행령 제154조【1세대1주택의 범위】」「… 제152조(환지 등의 정의)」. 인용된 조문 본문이 이 뒤에 온다 */
const HEADING_AFTER_RE = /^\s*[」｣]?\s*(?:\([^()]{0,90}\)\s*)?제\s?\d+\s?조(?:\s?의\s?\d+)?\s*(?:\([^()]{0,60}\)\s*)?[【\[〔(]/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 원문에서 법령 이름이 나온 자리 전부(위치순). 띄어쓰기는 있든 없든 같은 이름이다 */
function mentionIndex(text: string, extracted: string[]): Mention[] {
  const names = [...new Set([...MENTION_ALIAS_NAMES, ...extracted])].sort((a, b) => b.length - a.length);
  const re = new RegExp(names.map((n) => escapeRe(n).replace(/ /g, "\\s?")).join("|"), "g");
  const out: Mention[] = [];
  for (const m of text.matchAll(re)) {
    const start = m.index;
    const pre = text.slice(Math.max(0, start - 3), start);
    const legacy = /(?:^|[^가-힣])구\s?$/.test(pre);
    if (/[가-힣]$/.test(pre) && !legacy) continue; // 단어 중간(「이동법」)
    const end = start + m[0].length;
    const n = normalizeLawName(m[0].replace(/\s+/g, " "));
    const name = /(?:시행령|시행규칙|법|법률)$/.test(n) ? n : resolveLawAlias(n); // 「소득령」 → 소득세법 시행령
    const after = text.slice(end, end + 100);
    const bracket = after.match(ERA_BRACKET_RE)?.[1];
    const era = bracket && /개정|전의\s*것/.test(bracket) ? (parseCitationEra(bracket, name) ?? "unknown") : null;
    out.push({ start, end, name, legacy, era, heading: HEADING_AFTER_RE.test(after) });
  }
  return out;
}

/** pos 앞에서 끝난 마지막 이름(시작이 minStart 이후) */
function lastMention(mentions: Mention[], pos: number, minStart: number): Mention | null {
  for (let i = mentions.length - 1; i >= 0; i--) {
    const m = mentions[i];
    if (m.end > pos) continue;
    return m.start >= minStart ? m : null;
  }
  return null;
}

/** 목록 표시 — 「(4) 같은 법 시행령」은 목록 머리의 법령을 가리킬 수 있다(앞 계획 V-5 오류 2건) */
const LIST_MARK_RE = /(?:^|\s)(?:\(\d+\)|\d+\)|[①-⑳]|[가-하]\.|\d+\.)\s/;
const DECREE_TAIL_RE = / (?:시행령|시행규칙)$/;

/** 가리킨 이름의 시대를 넘겨받는다 — 「구 X법」(날짜 없음)·읽지 못한 개정 괄호는 현행으로 대조하지 않도록 null */
function inheritEra(m: Mention, lawName: string | null): Named | null {
  if (!lawName || m.era === "unknown" || (m.legacy && !m.era)) return null;
  return m.era ? { lawName, era: m.era } : { lawName };
}

function relativeName(text: string, relStart: number, relText: string, mentions: Mention[]): Named | null {
  const lineStart = text.lastIndexOf("\n", relStart - 1) + 1;
  const m = lastMention(mentions, relStart, lineStart);
  // 이름 바로 뒤 개정 괄호의 날짜(「2020. 2. 11.」)는 목록 표시(「2. 」)가 아니다
  if (!m || LIST_MARK_RE.test(text.slice(m.end, relStart).replace(ERA_BRACKET_RE, ""))) return null;
  const base = m.name.replace(DECREE_TAIL_RE, "");
  switch (relText.replace(/\s/g, "").replace(/^(?:같은|동)/, "")) {
    case "법":
      return inheritEra(m, base);
    case "법시행령":
      return inheritEra(m, `${base} 시행령`);
    case "법시행규칙":
      return inheritEra(m, `${base} 시행규칙`);
    case "영":
    case "령":
      return inheritEra(m, m.name.endsWith(" 시행령") ? m.name : null);
    default:
      return null; // 「동법령」 — 법인지 영인지 가를 수 없다
  }
}

/**
 * 약칭은 **인용 중인 조문의 머리**를 따른다 — 마지막 이름이 아니다. 조문 본문 안에서 다른 시행령을 언급하면
 * (「「소득세법 시행령」 제32조를 준용한다」) 그 뒤의 「법 제97조」가 엉뚱한 모법으로 읽혔다(원문 묶음 표본 30건 중 2건).
 * 머리가 법률이면(법률 본문에는 「법 제N조」가 없다) 건너뛴다.
 */
function abbreviationName(abbrStart: number, which: string, mentions: Mention[]): Named | null {
  let m: Mention | null = null;
  for (let i = mentions.length - 1; i >= 0 && !m; i--) if (mentions[i].end <= abbrStart && mentions[i].heading) m = mentions[i];
  if (!m || !DECREE_TAIL_RE.test(m.name)) return null;
  const base = m.name.replace(DECREE_TAIL_RE, "");
  return inheritEra(m, which === "법" ? base : `${base} 시행령`);
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

/**
 * 옛 조문 인용 — 그 시대 시행본(`getApplicableLaw`). 연혁 목록 밖(OUT_OF_RANGE)·법제처 장애는 「확인 불가」,
 * 그 시행본에 조문이 없거나 법령 연혁이 없으면 「없음」.
 */
async function eraArticle(
  lawName: string,
  articleNo: string,
  era: CitationEra,
): Promise<{ article: { fullText: string; sourceUrl: string; title: string } } | { status: CitationStatus; reason: string }> {
  try {
    const date = await resolveCitationEraDate(era);
    const r = await getApplicableLaw(lawName, articleNo, date);
    if (!r.article) return { status: "not_found", reason: `${date} 시행본 ${lawName}에 ${articleNo} 이(가) 존재하지 않습니다.` };
    return { article: { fullText: r.article.fullText, sourceUrl: r.sourceUrl, title: r.article.title } };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "API 호출 실패";
    return { status: err instanceof LawApiError && err.code === "NOT_FOUND" ? "not_found" : "failed", reason };
  }
}

async function verifyOne(citation: {
  raw: string;
  lawName: string;
  articleNo: string;
  hang?: number;
  ho?: number;
  era?: CitationEra;
}): Promise<VerifiedCitation> {
  const resolved = resolveLawAlias(citation.lawName);

  // 1) 법령 존재 확인 — 옛 조문 인용은 그 시대 시행본
  let article;
  if (citation.era) {
    const got = await eraArticle(resolved, citation.articleNo, citation.era);
    if (!("article" in got)) {
      return { raw: citation.raw, lawName: resolved, articleNo: citation.articleNo, hang: citation.hang, ho: citation.ho, ...got };
    }
    article = got.article;
  } else {
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
