/**
 * 1세대1주택 AI 참고 의견 — 해석례 카드 타입과 관련 카드 고르기(순수 함수).
 *
 * 카드는 비공개 자료다(`~/tax-knowledge-private/cards/one-house/E###.json` — 교재 파생 칸 포함). 저장소에는 넣지 않고
 * 서버가 로컬 파일에서 읽는다(`card-store.ts`). 이 파일에는 카드 내용이 없다.
 */

export type OneHouseCard = {
  id: string;
  docNo: string;
  kind: string;
  date: string;
  url: string;
  title: string;
  /** 쟁점 조문 — 「소득세법 시행령 §155①」 */
  lawAxis: string[];
  topic: string;
  judgmentAxis?: string;
  era?: { transferDate: string | null; appliedLaw: string | null };
  facts: string[];
  question: string;
  answer: string;
  verdict: string;
  assertable?: boolean;
  assertableReason?: string;
  textbookDiff?: string | null;
  eraCaution?: string | null;
  relatedRefs?: string[];
  currentRule?: unknown;
  textbookDiffType?: string[];
  conflicts?: unknown;
  verifiedAt?: string;
  rawFile?: string;
};

/** 화면에 보여 주는 카드 칸 — 공개 원문의 서지 정보만 */
export type OneHouseCardRef = Pick<OneHouseCard, "docNo" | "kind" | "date" | "url" | "title">;

export const cardRefOf = ({ docNo, kind, date, url, title }: OneHouseCard): OneHouseCardRef => ({
  docNo,
  kind,
  date,
  url,
  title,
});

const CIRCLED = "①-⑳㉑-㉟"; // ①~⑳ · ㉑~㉟
const ARTICLE = new RegExp(`§\\s*(\\d+(?:의\\d+)?)\\s*([${CIRCLED}])?`, "g");

/**
 * 글에 나온 조문 — `"155"`(조) · `"155⑳"`(항). 법·령 구분은 버린다(판정 결과 문구는 「§155⑳」처럼 층위를 생략하고,
 * 1세대1주택 범위에서 법·령 조번호가 겹치는 일은 드물다).
 */
export function articleTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(ARTICLE)) {
    out.add(m[1]);
    if (m[2]) out.add(`${m[1]}${m[2]}`);
  }
  return out;
}

/** 카드 `topic` ↔ 판정 결과·폼·원문에 나오는 말 */
const TOPIC_WORDS: Record<string, RegExp> = {
  일시적2주택: /일시적|대체취득|신규\s?주택|종전\s?주택/,
  상속: /상속/,
  혼인: /혼인/,
  동거봉양: /봉양/,
  농어촌: /농어촌|귀농|이농/,
  장기임대거주주택: /장기임대|임대주택|임대등록/,
  비수도권: /수도권\s?밖|비수도권/,
};

export function topicsIn(text: string): Set<string> {
  return new Set(Object.entries(TOPIC_WORDS).filter(([, re]) => re.test(text)).map(([t]) => t));
}

/**
 * 판정 맥락(판정 결과·폼·원문을 이은 글)에 가까운 카드를 고른다.
 * 점수 = 겹치는 항 2점 · 겹치는 조 1점 · 같은 주제 3점. 점수가 0인 카드는 넣지 않는다.
 * 동점이면 엔진 결론을 단언할 수 있는 카드(`assertable`) 먼저, 그다음 id 순(결정론).
 */
export function selectCards(cards: readonly OneHouseCard[], context: string, limit = 10): OneHouseCard[] {
  const tokens = articleTokens(context);
  const topics = topicsIn(context);
  return cards
    .map((card) => {
      let score = topics.has(card.topic) ? 3 : 0;
      for (const t of articleTokens(card.lawAxis.join(" "))) if (tokens.has(t)) score += /\d$/.test(t) ? 1 : 2;
      return { card, score };
    })
    .filter((s) => s.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.card.assertable === true) - Number(a.card.assertable === true) ||
        a.card.id.localeCompare(b.card.id),
    )
    .slice(0, limit)
    .map((s) => s.card);
}
