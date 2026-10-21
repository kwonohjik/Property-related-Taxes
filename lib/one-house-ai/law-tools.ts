/**
 * 1세대1주택 AI — LLM 도구(tool use): 앱 내장 법령 모듈(`lib/korean-law`)을 그대로 노출한다(계획 D-4 — 원격 MCP 아님).
 *
 *   lookup_statute          조문(양도일 시행본 또는 현행) — 항을 주면 그 항만
 *   search_interpretations  국세청·기재부 해석 · 조세심판 목록(본문 없음)
 *   read_interpretation     본문 — 이번 요청에서 **읽은 문서만** 인용할 수 있다(`readDocs`)
 *
 * 판례는 실시간 출처에서 뺐다 — 세무 판례는 법제처 본문이 막혀 있고 국세법령정보시스템으로 우회할 id도 없다(계획 F-17).
 * 조회 기록(`lookups`)은 성공·실패를 모두 남긴다 — 화면이 「AI가 무엇을 조회했는지」를 그대로 보여 준다.
 * 요청마다 새로 만든다(기록·읽은 문서가 요청 단위다).
 */
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { z } from "zod";
import { getApplicableLaw } from "@/lib/korean-law/applicable-law";
import { searchTaxInterpretations } from "@/lib/korean-law/client-cgm-expc";
import { searchDecisions } from "@/lib/korean-law/client-decisions-search";
import { getDecisionText } from "@/lib/korean-law/client-decisions-text";
import { getLawText } from "@/lib/korean-law/client-law";
import { getTaxlawDocument } from "@/lib/korean-law/client-taxlaw";
import { docDate, docKey } from "@/lib/korean-law/doc-key";
import { sliceParagraph } from "./statute-ref";

export type LawToolName = "lookup_statute" | "search_interpretations" | "read_interpretation";

export type LawLookup = {
  tool: LawToolName;
  input: Record<string, unknown>;
  ok: boolean;
  error?: string;
  /** 무엇을 받았는지 한 줄 — 「소득세법 시행령 제155조 ⑳ (2024-04-30 시행본)」 · 「목록 5건」 · 문서번호 */
  summary?: string;
  url?: string;
};

export type InterpretationSource = "nts" | "moef" | "tax_tribunal";

/** 이번 요청에서 본문을 읽은 문서 — 공개 서지만 */
export type ReadDoc = { source: InterpretationSource; id: string; docNo: string; title: string; date: string; url: string };

/**
 * 도구 상한 — 본문은 시행령 §155 시행본 8,299~12,506자(계획 F-18).
 * 검색 횟수: 실호출(V-7, 2026-10-22)에서 카드 10장을 받고도 검색 8회(그중 6회 0건 — 긴 구절을 제목 검색에 넣음)였다 ⇒ 요청당 4회.
 */
export const LAW_TOOL_LIMITS = { statuteFull: 6000, statuteParagraph: 3000, docBody: 6000, queryMax: 40, searchesPerRequest: 4 } as const;

const SOURCE_LABEL: Record<InterpretationSource, string> = { nts: "국세청 해석", moef: "기획재정부 해석", tax_tribunal: "조세심판" };

const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n…(이하 ${s.length - n}자 생략)` : s);

/**
 * 검색어에 원문의 개인 식별 정보가 실리지 않게 — 하이픈을 이어 붙여 9자리 이상인 숫자열(주민번호 13자리·전화번호 10~11자리 꼴)은
 * 거절한다. 날짜(「2022-05-10」 = 8자리)는 통과한다.
 */
function assertSafeQuery(query: string): void {
  if (/\d{9,}/.test(query.replace(/-/g, ""))) {
    throw new Error("검색어에 긴 숫자열을 넣지 마세요 — 법령 용어와 쟁점만 쓰세요(개인 식별 정보 보호).");
  }
}

export function createLawTools(opts: { allow: readonly LawToolName[] }): {
  tools: BetaRunnableTool<unknown>[];
  lookups: LawLookup[];
  readDocs: Map<string, ReadDoc>;
} {
  const lookups: LawLookup[] = [];
  const readDocs = new Map<string, ReadDoc>();
  let searches = 0;

  /** 실행을 감싸 성공·실패를 기록한다. 실패는 그대로 던져 SDK가 `is_error` 결과로 모델에 돌려준다 */
  const recorded =
    <I extends Record<string, unknown>>(tool: LawToolName, run: (input: I) => Promise<{ text: string; summary: string; url?: string }>) =>
    async (input: I): Promise<string> => {
      try {
        const r = await run(input);
        lookups.push({ tool, input, ok: true, summary: r.summary, url: r.url });
        return r.text;
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        lookups.push({ tool, input, ok: false, error });
        throw e;
      }
    };

  const lookupStatute = betaZodTool({
    name: "lookup_statute",
    description:
      "법령 조문 본문을 법제처에서 조회한다. baseDate(양도일 등)를 주면 그 날 시행 중이던 조문, 없으면 현행 조문. " +
      "paragraph를 주면 그 항만 돌려준다. 조문 내용이 기억과 다를 수 있을 때 쓴다.",
    inputSchema: z.object({
      lawName: z.string().describe("공식 법령명 — 「소득세법」「소득세법 시행령」「조세특례제한법」"),
      article: z.string().describe("조 번호 — 「제155조」「제156조의2」"),
      paragraph: z.number().int().min(1).optional().describe("항 번호(정수)"),
      baseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("기준일 YYYY-MM-DD"),
    }),
    run: recorded("lookup_statute", async ({ lawName, article, paragraph, baseDate }) => {
      let fullText: string;
      let title: string;
      let basis: string;
      let url: string | undefined;
      let sameAsCurrent: boolean | null = null;
      if (baseDate) {
        const r = await getApplicableLaw(lawName, article, baseDate);
        if (!r.article) throw new Error(`${r.lawName} ${r.articleNo}은(는) ${baseDate} 시행본에 없습니다.`);
        fullText = r.article.fullText;
        title = r.article.title;
        basis = `${baseDate} 시행본(시행일 ${r.version.efYd})`;
        sameAsCurrent = r.sameAsCurrentText;
        url = r.sourceUrl;
      } else {
        const r = await getLawText(lawName, article);
        if (!r) throw new Error(`${lawName} ${article}을(를) 현행 법령에서 찾지 못했습니다.`);
        fullText = r.fullText;
        title = r.title;
        basis = "현행";
        url = r.sourceUrl;
      }
      let text: string;
      if (paragraph) {
        const p = sliceParagraph(fullText, paragraph);
        if (!p) throw new Error(`${lawName} ${article}에 제${paragraph}항이 없습니다(${basis}).`);
        text = cap(p, LAW_TOOL_LIMITS.statuteParagraph);
      } else {
        text = cap(fullText, LAW_TOOL_LIMITS.statuteFull);
      }
      const same = sameAsCurrent === null ? "" : sameAsCurrent ? " · 현행과 같음" : " · 현행과 다름";
      return {
        text: `${lawName} ${article}${title ? `(${title})` : ""} — ${basis}${same}\n${text}`,
        summary: `${lawName} ${article}${paragraph ? ` 제${paragraph}항` : ""} (${basis})`,
        url,
      };
    }),
  });

  const searchInterpretations = betaZodTool({
    name: "search_interpretations",
    description:
      "국세청·기획재정부 법령해석 또는 조세심판 결정을 검색해 목록(문서번호·제목·일자·id)을 돌려준다. 본문은 없다 — " +
      "인용하려면 read_interpretation으로 본문을 읽어야 한다. 판례는 검색할 수 없다(받은 카드의 판례만 인용). " +
      "기획재정부 해석은 법제처 수록분만 검색된다. 검색어는 핵심어 2~4개(예: 「분양권 일시적 2주택」)로 쓴다 — 긴 구절은 0건이 된다. " +
      "제목 검색이 0건이면 같은 핵심어로 bodySearch=true를 한 번 시도한다. 요청당 4회까지 쓸 수 있다. " +
      "검색어에는 법령 용어와 쟁점만 쓰고 원문의 이름·주소·번호를 넣지 않는다.",
    inputSchema: z.object({
      query: z.string().min(1).max(LAW_TOOL_LIMITS.queryMax).describe("검색어 — 쟁점 구절(40자 이하)"),
      source: z.enum(["nts", "moef", "tax_tribunal"]).describe("nts=국세청 해석 · moef=기획재정부 해석 · tax_tribunal=조세심판"),
      bodySearch: z.boolean().optional().describe("true면 본문 검색(기본은 제목)"),
    }),
    run: recorded("search_interpretations", async ({ query, source, bodySearch }) => {
      assertSafeQuery(query);
      if (++searches > LAW_TOOL_LIMITS.searchesPerRequest) {
        throw new Error(`검색은 요청당 ${LAW_TOOL_LIMITS.searchesPerRequest}회까지다 — 지금까지 받은 카드·문서로 답하라.`);
      }
      let rows: { docNo: string; title: string; date: string; id: string | null }[];
      if (source === "tax_tribunal") {
        const page = await searchDecisions(query, "ttSpecialDecc", 1, 10, { bodySearch: bodySearch ?? false });
        rows = page.items.map((i) => ({ docNo: i.caseNo, title: i.title, date: docDate(i.date.replace(/-/g, "")) ?? i.date, id: i.id }));
      } else {
        const page = await searchTaxInterpretations(query, { source, bodySearch: bodySearch ?? false, display: 10 });
        rows = page.items.map((i) => ({ docNo: i.docNo, title: i.title, date: i.date, id: i.ntstDcmId }));
      }
      const text =
        rows.length === 0
          ? `${SOURCE_LABEL[source]} 검색 결과 0건 — 「${query}」`
          : rows
              .map((r) => `- ${r.docNo} (${r.date}) ${r.title} · id=${r.id ?? "없음(본문을 읽을 수 없음)"}`)
              .join("\n");
      return { text, summary: `${SOURCE_LABEL[source]} 「${query}」 ${rows.length}건` };
    }),
  });

  const readInterpretation = betaZodTool({
    name: "read_interpretation",
    description:
      "search_interpretations가 준 id로 해석·심판 본문(요지·회신·사실관계)을 읽는다. 이 도구로 읽은 문서만 인용할 수 있다.",
    inputSchema: z.object({
      source: z.enum(["nts", "moef", "tax_tribunal"]),
      id: z.string().min(1).max(30).describe("search_interpretations 목록의 id"),
    }),
    run: recorded("read_interpretation", async ({ source, id }) => {
      let doc: ReadDoc;
      let text: string;
      if (source === "tax_tribunal") {
        const t = await getDecisionText(id, "ttSpecialDecc", { full: true });
        if (!t || t.title === "(본문 제공 불가)") throw new Error(`조세심판 결정 ${id}의 본문을 받지 못했습니다.`);
        doc = { source, id, docNo: t.caseNo, title: t.title, date: docDate(t.date.replace(/-/g, "")) ?? t.date, url: t.sourceUrl ?? "" };
        text = cap([t.holdings && `요지: ${t.holdings}`, t.ruling && `주문: ${t.ruling}`, t.reasoning && `이유: ${t.reasoning}`].filter(Boolean).join("\n"), LAW_TOOL_LIMITS.docBody);
      } else {
        const d = await getTaxlawDocument(id);
        if (!d) throw new Error(`국세법령정보시스템에서 문서 ${id}를 찾지 못했습니다.`);
        doc = { source, id, docNo: d.docNo, title: d.title, date: d.date, url: d.url };
        text = cap([`요지: ${d.gist}`, `회신: ${d.answer}`, d.body && `본문: ${d.body}`].filter(Boolean).join("\n"), LAW_TOOL_LIMITS.docBody);
      }
      // 문서번호가 비면 비교 키가 「」이 되어 아무 인용이나 통과시킨다 — 읽은 문서로 치지 않는다
      if (!docKey(doc.docNo)) throw new Error(`문서 ${id}의 문서번호가 비어 있어 인용할 수 없습니다.`);
      readDocs.set(docKey(doc.docNo), doc);
      return { text: `${doc.docNo} (${doc.date}) ${doc.title}\n${text}`, summary: doc.docNo, url: doc.url || undefined };
    }),
  });

  const all: Record<LawToolName, BetaRunnableTool<unknown>> = {
    lookup_statute: lookupStatute as BetaRunnableTool<unknown>,
    search_interpretations: searchInterpretations as BetaRunnableTool<unknown>,
    read_interpretation: readInterpretation as BetaRunnableTool<unknown>,
  };
  return { tools: opts.allow.map((n) => all[n]), lookups, readDocs };
}
