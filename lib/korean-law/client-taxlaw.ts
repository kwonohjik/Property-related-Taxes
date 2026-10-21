/**
 * 국세법령정보시스템(taxlaw.nts.go.kr) 문서 본문 — 해석·심판·판례 상세 화면이 부르는 내부 요청을 그대로 재현한다.
 *
 *   POST https://taxlaw.nts.go.kr/action.do
 *   actionId=ASIQTB002PR01 & paramData={"dcmDVO":{"ntstDcmId":"…"}}
 *
 * 브라우저·쿠키 없이 동작한다(2026-10-21 실측 — 카드 30건 0.5초 간격 30/30 성공, 차단 없음). robots.txt는
 * 통합검색(`/is/USEISA001M.do`)만 막고 이 경로는 막지 않는다 ⇒ 검색은 법제처 DRF, 본문만 여기서 받는다.
 *
 * ⚠ 문서화되지 않은 내부 엔드포인트다. 바뀌면 이 파일 하나만 고친다. 호출부는 실패(LawApiError)를 「확인 불가」로 다룬다.
 */
import { LawApiError, readCache, writeCache } from "./client-core";
import { docDate } from "./doc-key";
import { fetchWithRetry } from "./fetch-with-retry";

const ENDPOINT = "https://taxlaw.nts.go.kr/action.do";
const ACTION_ID = "ASIQTB002PR01";

export interface TaxlawDocument {
  ntstDcmId: string;
  /** interpretation = 해석(목록 분류 02) · decision = 심판·판례 등 — 상세 링크 경로가 다르다 */
  kind: "interpretation" | "decision";
  /** 문서번호(taxlaw 상세 표기 — 비교는 `docKey`로) */
  docNo: string;
  title: string;
  /** 「YYYY.MM.DD.」 */
  date: string;
  /** 요지 */
  gist: string;
  /** 회신 — 심판·판례는 「결정 내용은 붙임과 같습니다」뿐이다 */
  answer: string;
  /** 사실관계·질의·결정 이유 등 본문(HTML → 텍스트). 심판·판례의 내용은 여기에만 있다 */
  body: string;
  /** 관련 조문(「소득세법 시행령 제156조의2」 꼴) */
  relatedStatutes: string[];
  url: string;
}

type RawDoc = {
  ntstDcmDscmCntn?: string;
  ntstDcmTtl?: string;
  ntstDcmRgtDt?: string;
  ntstDcmGistCntn?: string;
  ntstDcmCntn?: string;
  ntstDcmClCd?: string;
};
type RawBody = {
  status?: string;
  data?: {
    [ACTION_ID]?: {
      dcmDVO?: RawDoc | null;
      dcmHwpEditorDVOList?: { dcmFleByte?: string | null }[] | null;
      dcmRltnStttList?: { ntstTextNm?: string | null }[] | null;
    };
  };
};

/**
 * 본문 HTML → 텍스트. 태그·엔터티 정리 + 사용자 정의 영역 글리프(한글 문서 변환 잡음 — 예: U+F080F) 제거.
 * 표본 6건에서 P0 원문 덤프 본문 줄의 70~91%를 그대로 포함했다(누락 줄은 수집기 머리말·제목·등록일자).
 */
export function cleanTaxlawHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n: string) => {
      const cp = n[0] === "x" || n[0] === "X" ? parseInt(n.slice(1), 16) : Number(n);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""; // 범위 밖이면 RangeError 대신 버린다
    })
    .replace(/&amp;/g, "&") // 반드시 마지막(이중 디코딩 방지)
    .replace(/[-]|[\u{F0000}-\u{FFFFD}]|[\u{100000}-\u{10FFFD}]/gu, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function detailUrl(kind: TaxlawDocument["kind"], ntstDcmId: string): string {
  return kind === "interpretation"
    ? `https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=${ntstDcmId}`
    : `https://taxlaw.nts.go.kr/pd/USEPDA002P.do?ntstDcmId=${ntstDcmId}`;
}

/**
 * 문서 한 건. 없는 id면 null(taxlaw는 이때도 `SUCCESS`에 `dcmDVO: null`을 준다 — 실측). 「없음」은 캐시하지 않는다.
 * 실패(네트워크·형식 변경)는 `LawApiError("UPSTREAM")` — 「없음」으로 바꾸지 않는다.
 * 캐시는 필요한 칸만 잘라 둔다(해석 응답 원본은 판례 목록 `trilPsagList` 탓에 문서당 약 2.1MB).
 */
export async function getTaxlawDocument(ntstDcmId: string): Promise<TaxlawDocument | null> {
  if (!/^\d{1,20}$/.test(ntstDcmId)) {
    throw new LawApiError(`국세법령정보시스템 문서 id 형식이 아닙니다: ${ntstDcmId}`, "BAD_REQUEST");
  }
  const cacheKey = `taxlaw_${ntstDcmId}_v1`;
  const cached = await readCache<TaxlawDocument>(cacheKey);
  if (cached) return cached;

  let res: Response;
  try {
    res = await fetchWithRetry(ENDPOINT, {
      timeout: 10_000,
      retries: 1,
      baseDelay: 400,
      retryOn: [429, 503, 504],
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0",
        },
        body: new URLSearchParams({ actionId: ACTION_ID, paramData: JSON.stringify({ dcmDVO: { ntstDcmId } }) }).toString(),
      },
    });
  } catch (err) {
    throw new LawApiError(err instanceof Error ? err.message : "국세법령정보시스템 호출 실패", "UPSTREAM");
  }
  if (!res.ok) throw new LawApiError(`국세법령정보시스템 오류 (${res.status})`, "UPSTREAM");

  let json: RawBody;
  try {
    json = (await res.json()) as RawBody;
  } catch {
    throw new LawApiError("국세법령정보시스템 응답이 JSON이 아닙니다(형식 변경 가능)", "UPSTREAM");
  }
  const unit = json.data?.[ACTION_ID];
  if (json.status !== "SUCCESS" || !unit) {
    throw new LawApiError(`국세법령정보시스템 응답 형식이 다릅니다(status=${json.status ?? "없음"})`, "UPSTREAM");
  }
  const d = unit.dcmDVO;
  // 「없음」은 캐시하지 않는다 — 일시적인 빈 응답이 30일 동안 굳지 않게(client-core의 0건 미캐시 정책과 같다)
  if (!d) return null;

  // 분류 02 = 해석(qt 상세) · 08 심판 · 09 판례(pd 상세) — 실측 표본 기준
  const kind: TaxlawDocument["kind"] = d.ntstDcmClCd === "02" ? "interpretation" : "decision";
  const doc: TaxlawDocument = {
    ntstDcmId,
    kind,
    docNo: (d.ntstDcmDscmCntn ?? "").trim(),
    title: (d.ntstDcmTtl ?? "").trim(),
    date: docDate(d.ntstDcmRgtDt) ?? "",
    gist: cleanTaxlawHtml(d.ntstDcmGistCntn ?? ""),
    answer: cleanTaxlawHtml(d.ntstDcmCntn ?? ""),
    body: (unit.dcmHwpEditorDVOList ?? [])
      .map((x) => cleanTaxlawHtml(x.dcmFleByte ?? ""))
      .filter(Boolean)
      .join("\n"),
    relatedStatutes: [...new Set((unit.dcmRltnStttList ?? []).map((x) => (x.ntstTextNm ?? "").trim()).filter(Boolean))],
    url: detailUrl(kind, ntstDcmId),
  };
  await writeCache(cacheKey, doc);
  return doc;
}
