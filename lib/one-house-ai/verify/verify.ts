/**
 * 1세대1주택 AI 원문 검증 — 결정론 단계(서버 · LLM 없음, 계획 §3.5-1).
 *
 * - 조문: 의견의 구조화 조문을 양도일 시행본(없으면 현행)으로 다시 조회 — 조·항이 있는지, 그 항 발췌.
 * - 해석례: 인용 가능 집합 필터(의견 route)를 거친 인용만 온다 ⇒ 「지어낸 번호」는 여기 오지 않는다. 일은 **원문을 다시
 *   받는 것**과 **id 어긋남 감지**다. 카드는 서버의 카드 저장소에서 id를 다시 찾는다(화면이 보낸 url을 믿지 않는다).
 * - 조회 실패(failed)는 통과로 치지 않는다 — 화면은 「확인 불가」로 보여 준다.
 */
import { getApplicableLaw } from "@/lib/korean-law/applicable-law";
import { LawApiError } from "@/lib/korean-law/client-core";
import { getDecisionText } from "@/lib/korean-law/client-decisions-text";
import { getLawText } from "@/lib/korean-law/client-law";
import { getTaxlawDocument } from "@/lib/korean-law/client-taxlaw";
import { docKey } from "@/lib/korean-law/doc-key";
import type { OneHouseCard } from "../opinion/cards";
import { articleNoOf, formatStatuteRef, sliceParagraph, type StatuteRef } from "../statute-ref";
import type { DocCheck, StatuteCheck, VerifyBody } from "./verify-schema";

export const VERIFY_LIMITS = { statuteExcerpt: 3000, docExcerpt: 3000, statuteConcurrency: 4, docConcurrency: 2 } as const;

const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 상한을 지키며 순서를 보존해 매핑(`verifyCitations`와 같은 방식) */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export const statuteKey = (r: StatuteRef) => formatStatuteRef(r);

export async function checkStatute(ref: StatuteRef, baseDate: string | null): Promise<StatuteCheck> {
  const articleNo = articleNoOf(ref);
  const base = { ref, baseDate };
  try {
    let fullText: string;
    let extra: Partial<StatuteCheck> = {};
    if (baseDate) {
      const r = await getApplicableLaw(ref.law, articleNo, baseDate);
      if (!r.article) return { ...base, status: "not_found", reason: `${baseDate} 시행본에 ${ref.law} ${articleNo}이(가) 없습니다.` };
      fullText = r.article.fullText;
      extra = { versionEfYd: r.version.efYd, sameAsCurrent: r.sameAsCurrentText, url: r.sourceUrl };
    } else {
      const r = await getLawText(ref.law, articleNo);
      if (!r) return { ...base, status: "not_found", reason: `현행 ${ref.law}에 ${articleNo}이(가) 없습니다.` };
      fullText = r.fullText;
      extra = { url: r.sourceUrl };
    }
    if (ref.paragraph) {
      const p = sliceParagraph(fullText, ref.paragraph);
      if (!p) return { ...base, ...extra, status: "not_found", reason: `${ref.law} ${articleNo}에 제${ref.paragraph}항이 없습니다.` };
      return { ...base, ...extra, status: "verified", excerpt: cap(p, VERIFY_LIMITS.statuteExcerpt) };
    }
    return { ...base, ...extra, status: "verified", excerpt: cap(fullText, VERIFY_LIMITS.statuteExcerpt) };
  } catch (e) {
    // 법령·버전이 없다는 응답은 「없음」, 그 밖(네트워크·법제처 장애)은 확인 불가
    if (e instanceof LawApiError && e.code === "NOT_FOUND") return { ...base, status: "not_found", reason: e.message };
    return { ...base, status: "failed", reason: e instanceof Error ? e.message : String(e) };
  }
}

type Citation = VerifyBody["citations"][number];

export async function checkDoc(c: Citation, cards: readonly OneHouseCard[]): Promise<DocCheck> {
  const key = docKey(c.docNo);
  try {
    if (c.origin === "card") {
      const card = cards.find((x) => docKey(x.docNo) === key);
      if (!card) return { docNo: c.docNo, status: "failed", reason: "서버의 카드 저장소에서 이 문서를 찾지 못했습니다." };
      const id = new URL(card.url).searchParams.get("ntstDcmId");
      if (!id) return { docNo: c.docNo, status: "failed", reason: "카드 링크에 국세법령정보시스템 id가 없습니다." };
      const d = await getTaxlawDocument(id);
      if (!d) return { docNo: c.docNo, status: "mismatch", reason: "카드의 원문 id로 문서를 받지 못했습니다(id 변경 가능)." };
      if (docKey(d.docNo) !== key || d.date !== card.date) {
        return { docNo: c.docNo, status: "mismatch", url: d.url, reason: `받은 문서가 다릅니다(${d.docNo} · ${d.date}).` };
      }
      return { docNo: c.docNo, status: "fetched", url: d.url, excerpt: cap(joinDoc(d.gist, d.answer, d.body), VERIFY_LIMITS.docExcerpt) };
    }
    if (!c.source || !c.id) return { docNo: c.docNo, status: "failed", reason: "실시간 문서의 출처·id가 없습니다." };
    if (c.source === "tax_tribunal") {
      const t = await getDecisionText(c.id, "ttSpecialDecc", { full: true });
      if (!t || t.title === "(본문 제공 불가)") return { docNo: c.docNo, status: "failed", reason: "조세심판 본문을 받지 못했습니다." };
      if (docKey(t.caseNo) !== key) return { docNo: c.docNo, status: "mismatch", reason: `받은 문서가 다릅니다(${t.caseNo}).` };
      return { docNo: c.docNo, status: "fetched", url: t.sourceUrl, excerpt: cap(joinDoc(t.holdings, t.ruling ?? "", t.reasoning), VERIFY_LIMITS.docExcerpt) };
    }
    const d = await getTaxlawDocument(c.id);
    if (!d) return { docNo: c.docNo, status: "mismatch", reason: "문서를 다시 받지 못했습니다." };
    if (docKey(d.docNo) !== key) return { docNo: c.docNo, status: "mismatch", url: d.url, reason: `받은 문서가 다릅니다(${d.docNo}).` };
    return { docNo: c.docNo, status: "fetched", url: d.url, excerpt: cap(joinDoc(d.gist, d.answer, d.body), VERIFY_LIMITS.docExcerpt) };
  } catch (e) {
    return { docNo: c.docNo, status: "failed", reason: e instanceof Error ? e.message : String(e) };
  }
}

function joinDoc(gist: string, answer: string, body: string): string {
  return [gist && `요지: ${gist}`, answer && `회신·주문: ${answer}`, body && `본문: ${body}`].filter(Boolean).join("\n");
}
