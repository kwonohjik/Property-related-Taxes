# 1세대1주택 AI 검토 도구 — 실시간 법령·해석례 조회와 원문 검증 · 설계

- 계획서: [`docs/00-pm/one-house-ai-live-law.plan.md`](../../00-pm/one-house-ai-live-law.plan.md) (결정 D-1~D-5 · Q-1 (a) · 실측 F-1~F-19 · 안전망 P-1~P-6)
- 이 문서는 PR-0~PR-4를 다른 세션에서 이어받을 수 있게 **타입·시그니처·프롬프트 문안·화면 배치·테스트**를 고정한다. 결정의 근거는 계획서에 있다 — 여기서 다시 쓰지 않는다.
- 세액 불변(엔진·14지점 무변경). 줄 번호는 적지 않는다.

## 1. 모듈 지도

| PR | 파일 | 신규/수정 | 목표 줄 수 |
|---|---|---|---|
| 0 | `lib/korean-law/article-parser.ts`(시행본 경로 항번호 `<NN>` → 원숫자 · `toCircledDigit`·`CIRCLED_DIGIT_MAP` 21~35 확장) · `verify-citations.ts`(`recoverLawName` 「X법 시행령/시행규칙」 · `verifyHangInBody`가 원숫자 ⑯~㉟ **와** `<NN>` 둘 다 읽음 · `§` 표기 ⑪ 이상 항 보충) — `lib/legal-verification/`은 **무변경** | 수정 | 각 +10~30 |
| 1 | `lib/korean-law/client-cgm-expc.ts` | 신규 | ≤200 |
| 1 | `lib/korean-law/client-taxlaw.ts` | 신규 | ≤200 |
| 1 | `lib/korean-law/doc-key.ts`(`docKey`) | 신규 | ≤40 |
| 2 | `lib/one-house-ai/law-tools.ts`(도구 셋 팩토리 · 조회 기록) | 신규 | ≤250 |
| 2 | `lib/one-house-ai/statute-ref.ts`(구조화 조문 스키마 · 표시 포맷 · 항 자르기) | 신규 | ≤120 |
| 2 | `lib/one-house-ai/tool-run.ts`(toolRunner 공통 실행 · usage 합산 · stop_reason 처리) | 신규 | ≤120 |
| 2 | `lib/one-house-ai/opinion/opinion.ts` · `opinion-prompt.ts` · `opinion-schema.ts` · `app/api/one-house-ai/opinion/route.ts` | 수정 | route ≤180 |
| 2 | `components/calc/one-house/OneHouseAiOpinionView.tsx`(패널에서 결과 보기 분리) · `OneHouseAiLawLookups.tsx`(조회 기록 목록 — 추출 대화창과 공용) | 신규 | 각 ≤200 |
| 3 | `lib/one-house-ai/verify/verify.ts`(결정론) · `verify-llm.ts`(2차 대조) · `verify-schema.ts` · `app/api/one-house-ai/verify/route.ts` | 신규 | 각 ≤200 |
| 3 | `OneHouseAiOpinionView.tsx`(배지·발췌) | 수정 | ≤280 |
| 4 | `lib/one-house-ai/source-citations.ts`(원문 속 인용 대조) · `extract.ts` · `prompt.ts` · `app/api/one-house-ai/extract/route.ts` · `OneHouseAiExtractDialog.tsx` · `OneHouseAiReviewCard.tsx` | 신규·수정 | dialog ≤320 |

> 패널(184줄)에 배지·발췌·조회 기록을 더하면 300줄을 넘는다 — PR-2에서 결과 보기를 `OneHouseAiOpinionView`로 먼저 떼어 낸다(동작 무변경 이동 → 기존 패널 테스트 그대로 통과가 확인 기준).

## 2. 타입·시그니처

### 2.1 PR-0 (공용 모듈)

- **(구현 정정)** `toCircledDigit`·`CIRCLED_DIGIT_MAP`은 고치지 않았다 — `__tests__/korean-law/article-parser.test.ts`가 `toCircledDigit(21) === "21"`을 단언한다(공유 단언 반전 회피). 대신 새 함수 `circledHangMark(n)`(1~35 → ①~㉟, 그 밖 null)과 역함수 `circledHangNumber(mark)`를 `article-parser.ts`에 두었다.
- 항번호 변환(**시행본 경로만** — `formatArticleUnit`): 항 단위 `항번호`가 `/^<(\d+)>$/`이면 `toCircledDigit(n)`로 바꿔 `항내용` 앞의 `<n>`도 같은 원숫자로 바꾼 뒤 태그 제거를 한다. 결과: `getApplicableLaw`의 `fullText`에 ⑯ 이후 항이 원숫자로 시작한다.
- **현행 경로는 건드리지 않는다.** `getLawText`는 `lib/legal-verification/korean-law-client.ts`의 `fetchArticle`을 쓰고, 그 함수는 `verify:legal`(조문 키워드 416건)의 조회 경로이기도 하다. 현행 `fullText`의 `<16>` 표기는 지워지지 않고 남아 있으므로(F-13 ②) 표기를 바꿀 이득보다 회귀 표면이 크다. 대신 **읽는 쪽이 두 표기를 모두 받는다** — `verifyHangInBody`와 `sliceParagraph`(2.3)는 원숫자와 `<NN>`을 같은 항 경계로 본다. `<NN>`은 **16 이상일 때만** 항 표지로 본다(법제처가 15항까지는 원숫자로 준다).
- `recoverLawName(lookback)`: 「`[가-힣]+법\s(시행령|시행규칙)`」을 먼저 시도하고, 맞으면 「소득세법 시행령」 전체를 돌려준다. 맞지 않으면 기존 정규식. `SHORTHAND_RE` 경로도 앞 조각에 「X법 」이 붙어 있으면 같은 규칙으로 법령명을 다시 잡는다.
- `§` 표기 항 보충: `parseCitation`이 항을 못 잡았고(`paragraph` 없음) raw가 `§N(의M)?` 바로 뒤에 원숫자 ⑪~㉟를 가지면 그 값을 항으로 쓴다. `lib/legal-verification/citation-parser.ts`는 고치지 않는다 — `verify:legal`(`verifier.ts`)·커버리지 게이트(`coverage.ts`)·`scripts/warmup-legal-cache.ts`가 함께 쓴다.
- 캐시: `.legal-cache/`의 조문 캐시는 옛 포맷(항번호 없음)이다 — **캐시 키에 버전 접미사를 올린다**(`client-decisions-text.ts`의 `_v3` 선례). 올리지 않으면 개발 환경만 옛 결과를 읽어 통과한다(`restoreBoxTableLines` 주석의 같은 함정).

### 2.2 PR-1 (데이터 계층)

```ts
// client-cgm-expc.ts
export type TaxInterpretationSource = "nts" | "moef";
export interface TaxInterpretationHit {
  source: TaxInterpretationSource;
  docNo: string;          // 안건번호 원문(DRF)
  title: string;
  date: string;           // "YYYY.MM.DD."
  drfId: string;          // 법령해석일련번호
  ntstDcmId: string | null; // 법령해석상세링크에서 추출
  url: string;            // taxlaw 상세 링크(없으면 법제처 링크)
}
export async function searchTaxInterpretations(
  query: string,
  opts: { source: TaxInterpretationSource; bodySearch?: boolean; page?: number; display?: number },
): Promise<{ total: number; items: TaxInterpretationHit[] }>;
export async function findInterpretationByDocNo(
  docNo: string, date?: string,
): Promise<TaxInterpretationHit | null>; // 3.3 원문 속 번호 전용 — nts·moef 둘 다 찾는다

// client-taxlaw.ts
export interface TaxlawDocument {
  ntstDcmId: string;
  docNo: string;          // ntstDcmDscmCntn
  title: string;          // ntstDcmTtl(trim)
  date: string;           // ntstDcmRgtDt → "YYYY.MM.DD."
  gist: string;           // ntstDcmGistCntn
  answer: string;         // ntstDcmCntn(심판·판례는 「붙임과 같습니다」)
  body: string;           // dcmHwpEditorDVOList[].dcmFleByte 정제 결합
  relatedStatutes: string[];
  url: string;
}
export async function getTaxlawDocument(ntstDcmId: string): Promise<TaxlawDocument>; // 실패는 LawApiError
export function cleanTaxlawHtml(html: string): string; // 태그·엔터티·PUA(U+E000–F8FF, U+F0000–10FFFD) 제거

// doc-key.ts
export function docKey(docNo: string): string;
// "서면-2016-법령해석재산-3189 [법령해석과-2507]" → "서면2016법령해석재산3189"
// "기획재정부 조세정책과-1199 [...]" ↔ "조세정책과-1199" → "조세정책과1199"
// "조심 2025중4302" ↔ "조심-2025-중-4302" → "조심2025중4302"
```

- 캐시 키: `cgm_${source}_${safeCacheKey(query)}_${body?1:0}_p${page}` · `taxlaw_${ntstDcmId}_v1`(잘라 낸 결과만).
- `getTaxlawDocument` 요청: `POST action.do` · `Content-Type: application/x-www-form-urlencoded; charset=UTF-8` · `X-Requested-With: XMLHttpRequest` · UA · 본문 `actionId=ASIQTB002PR01&paramData={"dcmDVO":{"ntstDcmId":…}}`. `fetchWithRetry`(기존) 타임아웃 10초 · 재시도 1회.

### 2.3 PR-2 (도구·의견)

```ts
// statute-ref.ts
export const statuteRefSchema = z.object({
  law: z.string(),                  // 「소득세법 시행령」처럼 공식 이름
  article: z.number().int(),        // 155
  articleSub: z.number().int().optional(), // 제156조의2 → 2
  paragraph: z.number().int().optional(),
  item: z.number().int().optional(),
});
export type StatuteRef = z.infer<typeof statuteRefSchema>;
export function formatStatuteRef(r: StatuteRef): string; // "소득세법 시행령 §155⑳" · "소득세법 §89①3호"
export function sliceParagraph(fullText: string, paragraph: number): string | null; // 원숫자 또는 `<NN>` 경계 — 없으면 null

// law-tools.ts
export type LawLookup = {
  tool: "lookup_statute" | "search_interpretations" | "read_interpretation";
  input: Record<string, unknown>;
  ok: boolean;
  error?: string;
  docNo?: string; url?: string; title?: string;
};
export type ReadDoc = { source: "nts" | "moef" | "tax_tribunal"; id: string; docNo: string; title: string; date: string; url: string; excerpt: string };
export function createLawTools(opts: { allow: ("lookup_statute" | "search_interpretations" | "read_interpretation")[] }): {
  tools: BetaRunnableTool<unknown>[];
  lookups: LawLookup[];          // 요청 한 번 동안 쌓인다(성공·실패 모두)
  readDocs: Map<string, ReadDoc>; // key = docKey(docNo) — 인용 가능 집합의 실시간 쪽
};

// tool-run.ts
export async function runWithTools<T>(params: {
  system: string; user: string; schema: z.ZodType<T>; tools: BetaRunnableTool<unknown>[];
  maxIterations: number; maxTokens: number; client?: Anthropic;
}): Promise<{ parsed: T; model: string; usage: ExtractionRun["usage"]; iterations: number }>;
// 반복마다 finalMessage의 usage를 더한다 · 마지막 메시지 stop_reason이 refusal/max_tokens거나 parsed_output이 없으면 ExtractionFailedError
// 반복 상한에 걸려 최종 구조화 출력이 없으면 ExtractionFailedError("조회 반복 상한")
```

- 도구 오류는 `ToolError`(`@anthropic-ai/sdk` — import 경로는 착수 시 패키지 exports로 확인)를 던져 `is_error` 결과로 돌린다. `lookups`에는 `ok: false`로 남긴다.
- `eager_input_streaming`: `betaZodTool` 옵션에 없다(SDK 0.135 `helpers/beta/zod.d.ts`) — 반환 객체에 `{ ...tool, eager_input_streaming: true }`로 붙이고 실호출에서 400이 나지 않는지 확인한다. 나면 끈다(입력이 짧아 이득이 작다).
- `opinion-schema.ts`: `statutes: z.array(statuteRefSchema)`.
- `OneHouseAiOpinionData`(route): 기존 + `citations: { docNo: string; origin: "card" | "live"; url: string; title: string; date: string; source?: string; id?: string }[]` · `liveDocs: ReadDoc 서지(excerpt 제외)[]` · `lawLookups: LawLookup[]`.
- route 인용 필터: `allowed = new Set([...cards.map(c => docKey(c.docNo)), ...readDocs.keys()])` · `citedDocNos.filter(d => allowed.has(docKey(d)))`. 카드와 key가 같으면 `origin: "card"`.

### 2.4 PR-3 (검증)

```ts
// verify-schema.ts — 요청
const verifyBodySchema = z.object({
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  opinion: oneHouseOpinionSchema,
  citations: z.array(z.object({ docNo: z.string(), origin: z.enum(["card", "live"]), source: z.string().optional(), id: z.string().optional() })),
});
// 응답
export type StatuteCheck = { ref: StatuteRef; status: "verified" | "not_found" | "failed"; baseDate: string | null; versionEfYd?: string; sameAsCurrent?: boolean | null; excerpt?: string; reason?: string; url?: string };
export type DocCheck = { docNo: string; status: "fetched" | "mismatch" | "failed"; excerpt?: string; url?: string; reason?: string };
export type PointCheck = { index: number; support: "supported" | "partial" | "not_supported" | "cannot_verify"; reason: string; unsupportedClaims: string[] };
export type OneHouseAiVerifyData = { statutes: StatuteCheck[]; docs: DocCheck[]; points: PointCheck[]; model: string | null; usage: ExtractionRun["usage"] | null };
```

- 카드 인용: 서버가 `loadOneHouseCards()`에서 `docKey`로 카드를 찾아 url의 `ntstDcmId`를 얻는다. 화면이 보낸 url은 쓰지 않는다.
- 실시간 인용: `source`·`id`로 다시 받는다(nts·moef → `getTaxlawDocument` · tax_tribunal → `getDecisionText`). 캐시 적중이 보통이다.
- `mismatch` 판정: `docKey(받은 docNo) !== docKey(인용 docNo)` 또는 (카드일 때) 일자가 카드 date와 다름.
- 2차 대조는 `support`를 결정론 결과로 덮지 않는다 — 단 **원문을 하나도 받지 못한 쟁점은 LLM에 보내지 않고 `cannot_verify`**(서버가 정한다).
- 조문 확인 동시성 4 · 해석례 동시성 2.

### 2.5 PR-4 (추출)

```ts
// source-citations.ts
export type SourceCitation =
  | { kind: "statute"; raw: string; status: "found" | "not_found" | "failed"; basis: "transfer_date" | "current"; note?: string; url?: string }
  | { kind: "doc"; raw: string; status: "found" | "not_found" | "failed"; docNo?: string; url?: string; note?: string };
export async function checkSourceCitations(text: string, transferDate: string | null): Promise<SourceCitation[]>;
// statute: extractCitations(PR-0 수정본) → transferDate 있으면 getApplicableLaw, 없으면 getLawText
//   basis "current" + not_found → note "현행에 없음 — 과거 조문일 수 있음"
// doc: 문서번호 정규식 → findInterpretationByDocNo → not_found note "표기가 다를 수 있음"
// 상한: 조문 20건 · 문서 10건
```

- 추출 route 순서: LLM 추출(도구 `lookup_statute`만, `max_iterations` 4) → `applyExtraction` → `checkSourceCitations(text, form.transferDate ?? null)`. 대조가 실패해도 추출 응답은 그대로 낸다(대조 칸만 `failed`).
- `OneHouseAiExtractData` + `lawLookups: LawLookup[]` · `sourceCitations: SourceCitation[]`. `OneHouseAiReview`의 `Pick`에 두 칸을 더한다.

## 3. 프롬프트 문안

### 3.1 의견 — `OPINION_SYSTEM_PROMPT` 바꾸는 원칙

- 원칙 3 →「**인용은 받은 카드 또는 이번에 `read_interpretation`으로 본문을 읽은 문서의 문서번호로만 한다.** 검색 목록에서 제목만 본 문서는 인용하지 않는다. 받지 않은 번호를 지어내지 않는다. 카드·문서가 질문과 사실관계가 다르면 그 차이를 밝히고 인용하거나, 인용하지 않는다.」
- 새 원칙 9 →「**카드가 답하지 못하는 쟁점에 한해** `search_interpretations`로 찾고, 쓸 만한 문서는 `read_interpretation`으로 본문을 읽은 뒤 쓴다. 카드가 이미 답하는 쟁점은 검색하지 않는다. 받은 카드가 없으면 검색부터 한다. 검색어에는 법령 용어와 쟁점만 쓰고, 원문의 이름·주소·번호를 넣지 않는다.」
- 새 원칙 10 →「조문 내용이 기억과 다를 수 있으면 `lookup_statute`로 양도일 시행본을 확인한다. **도구 결과와 카드에 없는 법령 내용·사실을 기억으로 덧붙이지 않는다** — 확인하지 못했으면 caveats나 factsToConfirm에 적는다.」
- 원칙 7 →「조문은 statutes에 법령명(공식 이름)·조·항·호로 나눠 적는다. 본문에서는 「소득세법 시행령 §155①」처럼 쓴다.」
- 도구 설명에 고정 문구: 「판례는 검색할 수 없다(카드에 있는 판례만 인용).」 「기획재정부 해석은 법제처 수록분만 검색된다.」

### 3.2 추출 — RULES 추가 1줄

「`lookup_statute`는 칸의 뜻(용어의 법적 정의)을 확인할 때만 쓴다. 칸의 값은 원문 구절(evidence)이 있을 때만 넣는다 — 조문 내용으로 사실을 만들지 않는다. 조문 조회로 판단이 갈리는 사정은 notes에 「…(소득세법 시행령 §155⑳ 조회)」처럼 적는다.」

### 3.3 검증 2차 대조 — 시스템 프롬프트(고정)

「너는 의견 문장이 주어진 원문 발췌로 뒷받침되는지만 판단한다. 원문 밖 지식을 쓰지 않는다. supported = 의견의 핵심 주장이 원문에 있다 · partial = 일부만 있다 · not_supported = 원문과 다르거나 원문에 없다 · cannot_verify = 발췌만으로 판단할 수 없다. 원문에 없는 주장은 그 구절을 unsupportedClaims에 그대로 옮긴다. 시점이 다른 법령(발췌의 시행일)과 의견의 시점이 어긋나면 partial로 보고 사유에 적는다.」 effort high · 도구 없음 · max_tokens 8000.

## 4. 화면 배치

```
[AI 참고 의견]  ← 기존 버튼
┌ 의견 (OneHouseAiOpinionView) ───────────────────────────────┐
│ 엔진 결론과의 관계 배지 · 요약                                 │
│ 쟁점 1  ───────────────  [원문 일치 ✓] ← PR-3 배지(검증 중이면 「원문 검증 중」) │
│   의견 문장                                                    │
│   소득세법 시행령 §155㉑ · 서면-2021-부동산-6414 [실시간]        │
│   ▸ 원문 발췌 (펼치기 — 조문 항 · 해석례 요지·회신, 링크)          │
│ …                                                              │
│ 확인할 사실 · 유의 사항(지운 인용 포함)                          │
│ ▸ 대조한 해석례 N건 (카드)   ▸ 실시간으로 읽은 문서 M건            │
│ ▸ AI가 조회한 법령·해석례 K건 (OneHouseAiLawLookups — 실패 포함)   │
│ 호출 비용(의견+검증 합산)                                        │
└────────────────────────────────────────────────────────────────┘
```

- 배지 톤: 원문 일치 emerald · 일부 일치 amber · 확인 불가 slate는 `tones.ts` 배지 표면(의미: emerald=긍정·확정 · amber=주의 · slate=중립). **원문과 다름**은 `tones.ts`의 `rose`가 「지역·지정」 의미라 쓰지 않는다 — 같은 컴포넌트군의 경고 문구 패턴(`OneHouseAiExtractDialog`의 `role="alert"` 문단: `border-rose-300 bg-rose-50 text-rose-700` + `dark:` 짝)을 따른다. 다크 짝 게이트 대상.
- 「실시간」 표지는 `origin: "live"` 인용에만. 카드와 같은 문서면 카드로 표시.
- 쟁점 머리줄(주제 + 배지)은 `flex flex-wrap gap-2` — 375px에서 배지가 다음 줄로 내려간다(가로 넘침 게이트). 문서번호·조문 줄은 `break-words`.
- 펼치기 목록은 지금 패널의 「대조한 해석례 N건」과 같은 `<details>`/`<summary>` 패턴을 쓴다(새 토글 컴포넌트를 만들지 않는다).
- 추출 대화창: 메모 아래에 「원문 속 인용 대조」 목록(확인됨/찾지 못함/확인 불가 + note + 링크)과 `OneHouseAiLawLookups`.
- data-testid: `one-house-ai-verify-badge-{i}` · `one-house-ai-verify-excerpt-{i}` · `one-house-ai-live-docs` · `one-house-ai-law-lookups` · `one-house-ai-source-citations`.

## 5. 테스트·anchor

| PR | 파일 | 내용 | mutation |
|---|---|---|---|
| 0 | `__tests__/korean-law/hang16-circled.test.ts` | DRF 실응답 fixture(시행령 §155 — `<16>`~`<25>`) → 시행본 `fullText`에 ⑯~㉕ · `verifyHangInBody(…, 21)`이 원숫자 본문·`<21>` 본문 둘 다 참 · 없는 항(26)은 거짓 | P-1 |
| 0 | `__tests__/korean-law/verify-citations.test.ts`(추가) | 「소득세법 시행령 제155조 제20항」 1건 · 「소득세법 시행령 §155⑳」 법령명·항 · 「또한 소득세법 제89조」 기존 동작 유지 | P-2 |
| 1 | `__tests__/korean-law/client-taxlaw.test.ts` | 실응답 fixture(해석 1 — `trilPsagList`만 제거 · 심판 1 · 판례 1) → 요지·회신·본문·일자 · PUA 0 · SUCCESS 아님 → UPSTREAM | — |
| 1 | `__tests__/korean-law/client-cgm-expc.test.ts` | DRF 실응답 fixture(nts·moef 각 1) → `ntstDcmId` 추출 · `findInterpretationByDocNo` 일자 불일치 거절 | — |
| 1 | `__tests__/korean-law/doc-key.test.ts` | 실표기 8종 쌍 대조 | — |
| 2 | `__tests__/lib/one-house-ai/law-tools.test.ts` | 도구 실행(클라이언트 mock) · 실패도 `lookups`에 · 검색어 40자·연속 숫자 6자리 거절 · `readDocs`는 성공만 | — |
| 2 | `__tests__/api/one-house-ai-opinion-route.test.ts`(확장) | 기존 「받지 않은 번호 삭제」 유지 + 검색만 한 번호 삭제 + 읽은 번호 유지 + 카드와 같은 key면 origin card | P-3 · P-4 |
| 2 | `__tests__/lib/one-house-ai/statute-ref.test.ts` | 포맷 · `sliceParagraph`(㉑ 경계 · 없는 항 null) | — |
| 3 | `__tests__/lib/one-house-ai/verify.test.ts` | 조문 3분류 · 해석례 fetched/mismatch/failed · 원문 0건 쟁점 → cannot_verify(LLM 미호출) · failed는 verified로 집계되지 않는다 | P-5 · P-6 |
| 3 | `__tests__/components/one-house/one-house-ai-opinion-panel.test.tsx`(확장) | 배지 4종 문구 · 의견이 바뀌면 검증 결과를 버린다 | — |
| 4 | `__tests__/lib/one-house-ai/source-citations.test.ts` | basis current + not_found → note · 문서번호 not_found note · 조회 실패 → failed | — |
| 4 | `__tests__/api/one-house-ai-extract-route.test.ts`(확장) | 대조 실패해도 추출 응답 200 · 새 칸 2개 | — |

- fixture는 실응답(CLAUDE.md 법제처 fixture 규칙). 해석 응답만 `trilPsagList`를 지운다 — 지운 사실을 fixture 옆 README 1줄로 남긴다.
- fixture는 공개 원문이다. 교재 문구·쪽수·카드 칸은 넣지 않는다. 문서 선택은 카드와 무관한 공개 문서로 해도 된다.

## 6. 상수

| 이름 | 값 | 근거 |
|---|---|---|
| 의견 `max_iterations` | 8 | V-7에서 조정 |
| 추출 `max_iterations` | 4 | 〃 |
| 검색어 최대 길이 | 40자 | 계획 3.2 |
| 도구 결과 본문 상한 | 해석례 6,000자 · 조문 항 3,000자(항 없으면 조 6,000자) | §155 시행본 8,299~12,506자(F-18) — V-7에서 조정 |
| taxlaw 타임아웃·재시도 | 10초 · 1회 | F-12 최대 1.3초 |
| 조문 확인 동시성 | 4 | `verifyCitations`와 같음 |
| 해석례 재수신 동시성 | 2 | F-12(0.5초 간격 무차단) |
