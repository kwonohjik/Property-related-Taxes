/**
 * 1세대1주택 AI 사실 추출 — 붙여 넣은 원문 속 조문·해석례 번호 대조(결정론 · LLM 무관, 계획 §3.3-1).
 *
 * 원문은 사용자가 붙여 넣은 글이다 ⇒ 결과를 「환각」이라 부르지 않는다(확인됨 / 찾지 못함 / 확인 불가).
 * - 조문: 원문에 양도일이 있으면 그 날 시행본, 없으면 현행으로 확인. 현행 기준의 「찾지 못함」은 과거 조문일 수 있다
 *   (예: 장기임대주택 항이 옛 §155⑳ → 현행 ㉑, 계획 F-15).
 * - 해석례: 국세청·기재부 해석 번호만 찾는다(`findInterpretationByDocNo`). 조세심판·판례 번호는 DRF로 번호 조회가 되지 않아
 *   대조하지 않는다. 교재식 약식 번호(「재산-123」 등)는 DRF 안건번호와 표기가 달라 「찾지 못함」이 될 수 있다.
 */
import { findInterpretationByDocNo } from "@/lib/korean-law/client-cgm-expc";
import { resolveLawAlias } from "@/lib/korean-law/aliases";
import { resolveCitationEraDate } from "@/lib/korean-law/applicable-law";
import { buildLawSourceUrl } from "@/lib/korean-law/client-law";
import { extractCitations } from "@/lib/korean-law/verify-citations";
import type { StatuteRef } from "./statute-ref";
import { checkStatute, mapLimit } from "./verify/verify";

export type SourceCitation = {
  kind: "statute" | "doc";
  /** 원문에 나온 표기 */
  raw: string;
  /** `unchecked` — 확인 상한(`SOURCE_CITATION_LIMITS`)을 넘어 조회하지 않았다. 사용자가 직접 확인하도록 목록에 남긴다 */
  status: "found" | "not_found" | "failed" | "unchecked";
  /** 조문 — 양도일 시행본 · 현행 · 원문이 괄호로 밝힌 옛 시행본(「(… 개정되기 전의 것)」) 중 무엇으로 봤는지 */
  basis?: "transfer_date" | "current" | "cited_era";
  /** 해석례 — 찾은 문서번호(DRF 표기) */
  docNo?: string;
  note?: string;
  url?: string;
};

export const SOURCE_CITATION_LIMITS = { statutes: 20, docs: 10 } as const;

/** 국세청·기재부 해석 문서번호(F-7 표기 — 카드·DRF·taxlaw에서 실제로 쓰는 꼴) */
const DOC_NO_RE =
  /(?:서면|사전|기준)-\d{4}-[가-힣]+-\d+|(?:기획재정부\s)?(?:재산세제과|조세정책과|조세법령운용과|금융세제과|소득세제과)-\d+|(?:재산세과|부동산납세과|부동산거래관리과|법규과|법령해석과)-\d+|서면인터넷방문상담\d팀-\d+|서면\d팀-\d+|(?:재일|서일|재산)46014-\d+/g;

function toRef(lawName: string, articleNo: string, hang?: number, ho?: number): StatuteRef | null {
  const m = articleNo.match(/^제(\d+)조(?:의(\d+))?$/);
  if (!m) return null;
  return { law: lawName, article: Number(m[1]), ...(m[2] ? { articleSub: Number(m[2]) } : {}), ...(hang ? { paragraph: hang } : {}), ...(ho ? { item: ho } : {}) };
}

export async function checkSourceCitations(text: string, transferDate: string | null): Promise<SourceCitation[]> {
  const baseDate = transferDate && /^\d{4}-\d{2}-\d{2}$/.test(transferDate) ? transferDate : null;
  const basis = baseDate ? "transfer_date" : "current";

  const allStatutes = extractCitations(text).flatMap((c) => {
    const ref = toRef(c.lawName, c.articleNo, c.hang, c.ho);
    return ref ? [{ raw: c.raw, ref, era: c.era, url: buildLawSourceUrl(resolveLawAlias(c.lawName), c.articleNo) }] : [];
  });
  const statutes = allStatutes.slice(0, SOURCE_CITATION_LIMITS.statutes);
  // 상한을 넘은 인용은 버리지 않는다 — 법제처 조문 링크(현행)를 붙여 사용자가 직접 확인하게 한다
  const uncheckedStatutes = allStatutes.slice(SOURCE_CITATION_LIMITS.statutes).map(
    ({ raw, era, url }): SourceCitation => ({
      kind: "statute",
      raw,
      status: "unchecked",
      url,
      note: era ? "현행 조문 링크입니다 — 옛 시행본은 법제처 연혁에서 확인하세요" : undefined,
    }),
  );
  const statuteResults = await mapLimit(statutes, 4, async ({ raw, ref, era }): Promise<SourceCitation> => {
    // 원문이 괄호로 시대를 밝힌 인용은 양도일이 아니라 그 시행본으로 본다
    let date = baseDate;
    const b: SourceCitation["basis"] = era ? "cited_era" : basis;
    if (era) {
      try {
        date = await resolveCitationEraDate(era);
      } catch (e) {
        return { kind: "statute", raw, status: "failed", basis: b, note: e instanceof Error ? e.message : String(e) };
      }
    }
    const r = await checkStatute(ref, date);
    if (r.status === "verified") return { kind: "statute", raw, status: "found", basis: b, url: r.url };
    if (r.status === "failed") return { kind: "statute", raw, status: "failed", basis: b, note: r.reason };
    return {
      kind: "statute",
      raw,
      status: "not_found",
      basis: b,
      note: date ? r.reason : `현행에 없음 — 과거 조문일 수 있음${r.reason ? ` (${r.reason})` : ""}`,
    };
  });

  const allDocNos = [...new Set(text.match(DOC_NO_RE) ?? [])];
  const docNos = allDocNos.slice(0, SOURCE_CITATION_LIMITS.docs);
  const uncheckedDocs = allDocNos.slice(SOURCE_CITATION_LIMITS.docs).map((raw): SourceCitation => ({ kind: "doc", raw, status: "unchecked" }));
  const docResults = await mapLimit(docNos, 2, async (raw): Promise<SourceCitation> => {
    try {
      const hit = await findInterpretationByDocNo(raw);
      return hit
        ? { kind: "doc", raw, status: "found", docNo: hit.docNo, url: hit.url ?? undefined }
        : { kind: "doc", raw, status: "not_found", note: "법제처 해석 목록에서 찾지 못함 — 표기가 다를 수 있음" };
    } catch (e) {
      return { kind: "doc", raw, status: "failed", note: e instanceof Error ? e.message : String(e) };
    }
  });

  return [...statuteResults, ...docResults, ...uncheckedStatutes, ...uncheckedDocs];
}
