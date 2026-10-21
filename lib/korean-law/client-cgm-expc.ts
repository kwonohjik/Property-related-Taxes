/**
 * 국세청·기획재정부 법령해석 검색 — 법제처 DRF `lawSearch.do?target=ntsCgmExpc|moefCgmExpc`.
 *
 * 목록만 받는다. 본문(`lawService.do`)은 「미신청된 목록/본문」으로 막혀 있어(2026-10-21 실측) 국세법령정보시스템
 * 상세(`client-taxlaw.ts`)로 받는다 — 목록의 `법령해석상세링크`에 그 id(`ntstDcmId`)가 들어 있다.
 *
 * `DECISION_DOMAINS`에 넣지 않는다 — 넣으면 `/law` 화면 드롭다운·Zod enum·라우터까지 번진다(계획 §3.1).
 */
import { fetchJson, LawApiError, readCacheNonEmpty, safeCacheKey, toArray, writeCacheNonEmpty } from "./client-core";
import { docDate, docKey } from "./doc-key";

export type TaxInterpretationSource = "nts" | "moef";

const TARGET: Record<TaxInterpretationSource, string> = { nts: "ntsCgmExpc", moef: "moefCgmExpc" };

export interface TaxInterpretationHit {
  source: TaxInterpretationSource;
  /** 안건번호 원문(DRF 표기 — 비교는 `docKey`로) */
  docNo: string;
  title: string;
  /** 「YYYY.MM.DD.」 */
  date: string;
  /** 법령해석일련번호 */
  drfId: string;
  /** 국세법령정보시스템 상세 id — 링크가 없으면 null */
  ntstDcmId: string | null;
  /** 국세법령정보시스템 상세 링크 — 없으면 null */
  url: string | null;
}

export interface TaxInterpretationPage {
  total: number;
  items: TaxInterpretationHit[];
}

type RawItem = {
  안건명?: string;
  안건번호?: string;
  해석일자?: string;
  법령해석일련번호?: string;
  법령해석상세링크?: string;
};

function toHit(source: TaxInterpretationSource, i: RawItem): TaxInterpretationHit {
  // 화면이 href로 쓰는 값이다 — 국세법령정보시스템 주소만 받는다
  const link = i.법령해석상세링크?.trim() ?? "";
  const url = link.startsWith("https://taxlaw.nts.go.kr/") ? link : null;
  return {
    source,
    docNo: (i.안건번호 ?? "").trim(),
    title: (i.안건명 ?? "").trim(),
    date: docDate(i.해석일자) ?? (i.해석일자 ?? "").trim(),
    drfId: String(i.법령해석일련번호 ?? ""),
    ntstDcmId: url?.match(/[?&]ntstDcmId=(\d+)/)?.[1] ?? null,
    url,
  };
}

/** 해석 목록 검색(최신순). `bodySearch`면 본문 검색(DRF `search=2`). 0건은 캐시하지 않는다(`readCacheNonEmpty`) */
export async function searchTaxInterpretations(
  query: string,
  opts: { source: TaxInterpretationSource; bodySearch?: boolean; page?: number; display?: number },
): Promise<TaxInterpretationPage> {
  const { source, bodySearch = false, page = 1, display = 10 } = opts;
  const cacheKey = `cgm_${source}_${safeCacheKey(query)}_${bodySearch ? "body" : "title"}_p${page}_s${display}`;
  const cached = await readCacheNonEmpty<TaxInterpretationPage>(cacheKey);
  if (cached) return cached;

  const data = await fetchJson<{ CgmExpc?: { resultCode?: string; totalCnt?: string; cgmExpc?: RawItem | RawItem[] } }>("lawSearch.do", {
    target: TARGET[source],
    query,
    display: String(display),
    page: String(page),
    sort: "ddes",
    ...(bodySearch ? { search: "2" } : {}),
  });
  const root = data.CgmExpc;
  // 루트가 없거나 resultCode가 00이 아니면(미신청·인증 오류 등) 0건이 아니라 실패다 — 「없음」으로 바꾸지 않는다
  if (!root || (root.resultCode !== undefined && root.resultCode !== "00")) {
    throw new LawApiError(`법제처 해석 검색 응답이 정상이 아닙니다(resultCode=${root?.resultCode ?? "없음"})`, "UPSTREAM");
  }
  // 1건이면 객체, 0건이면 칸 자체가 없다(실측)
  const items = toArray(root.cgmExpc).map((i) => toHit(source, i));
  const result: TaxInterpretationPage = { total: Number(root.totalCnt) || items.length, items };
  await writeCacheNonEmpty(cacheKey, result);
  return result;
}

/**
 * 문서번호(+일자)로 해석 한 건을 찾는다 — 사용자가 붙여 넣은 원문 속 번호의 실존 확인용(계획 §3.3).
 *
 * - DRF 검색어는 **부분 일치**다(「조세정책과-69」 → -695·-697도 온다) ⇒ `docKey`가 같은 것만 채택한다.
 * - 일자를 주면 일자까지 같아야 한다. 「번호는 같고 일자만 다른」 대체 매칭은 P0 수집에서 13/13 오매칭이었다.
 * - 국세청·기재부를 함께 찾는다. 한쪽 조회가 실패해도 다른 쪽에서 찾으면 돌려주고, 못 찾았는데 실패가 있으면 그 오류를 던진다
 *   (실패를 「없음」으로 바꾸지 않는다).
 */
export async function findInterpretationByDocNo(docNo: string, date?: string): Promise<TaxInterpretationHit | null> {
  const key = docKey(docNo);
  if (!key) return null;
  const query = docNo.replace(/\[.*$/s, "").replace(/^\s*(?:기획재정부|재정경제부)\s*/, "").trim();
  const want = date ? docDate(date) : null;
  // 일자를 줬는데 읽지 못하면 일자 조건이 사라져 「번호만 같은」 매칭이 된다 — 조용히 넘기지 않는다
  if (date && !want) throw new LawApiError(`일자 형식을 해석할 수 없습니다: ${date}`, "BAD_REQUEST");

  const settled = await Promise.allSettled(
    (["nts", "moef"] as const).map((source) => searchTaxInterpretations(query, { source, display: 100 })),
  );
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    const hit = s.value.items.find((h) => docKey(h.docNo) === key && (!want || h.date === want));
    if (hit) return hit;
  }
  const failed = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
  if (failed) throw failed.reason;
  // 부분 일치 결과가 한 쪽(100건)을 넘으면 오래된 문서가 다음 쪽에 있을 수 있다 — 「없음」이 아니라 확인 불가
  if (settled.some((s) => s.status === "fulfilled" && s.value.total > s.value.items.length)) {
    throw new LawApiError(`「${query}」 검색 결과가 너무 많아 문서번호를 확인하지 못했습니다`, "UPSTREAM");
  }
  return null;
}
