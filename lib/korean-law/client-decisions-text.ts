/**
 * 판례·결정례 본문 조회 (getDecisionText)
 */

import {
  fetchJson,
  readCache,
  writeCache,
} from "./client-core";
import { buildDecisionSourceUrl } from "./client-law";
import { DOMAIN_RESPONSE_KEY } from "./client-decisions-search";
import {
  compactBody,
  densifyLawRefs,
  densifyPrecedentRefs,
  stripRepeatedSummary,
  cleanHtml,
} from "./compact";
import { parseLawRefs, parsePrecedentRefs } from "./parsers/ref-parser";
import type { DecisionDomain, DecisionText } from "./types";

// ────────────────────────────────────────────────────────────────────────────
// 법제처 상세 응답 내부 타입
// ────────────────────────────────────────────────────────────────────────────

interface GenericDecisionDetail {
  판시사항?: string;
  판결요지?: string;
  주문?: string;
  이유?: string;
  판례내용?: string;
  판결본문?: string;
  결정문?: string;
  전문?: string;
  본문?: string;
  내용?: string;
  사건명?: string;
  제목?: string;
  안건명?: string;
  행정규칙명?: string;
  자치법규명?: string;
  사건번호?: string;
  결정번호?: string;
  안건번호?: string;
  법원명?: string;
  기관명?: string;
  결정기관?: string;
  회신기관명?: string;
  질의기관명?: string;
  소관부처명?: string;
  선고일자?: string;
  결정일?: string;
  판결일?: string;
  회신일자?: string;
  시행일자?: string;
  참조조문?: string;
  참조판례?: string;
  사건종류명?: string;
  판결유형?: string;
  데이터출처명?: string;
  // 조세심판원 재결(ttSpecialDecc) — 2026-10-04 실측 필드
  재결요지?: string;
  청구번호?: string;
  재결청?: string;
  의결일자?: string;
  관련법령?: string;
  참조결정?: string;
  // 법령해석례(expc) · 행정규칙(admrul) — 2026-10-04 실측 필드
  해석일자?: string;
  질의요지?: string;
  회답?: string;
  발령번호?: string;
  발령일자?: string;
  [key: string]: unknown;
}

// ────────────────────────────────────────────────────────────────────────────
// 판례·결정례 본문 조회
// ────────────────────────────────────────────────────────────────────────────

export async function getDecisionText(
  id: string,
  domain: DecisionDomain = "prec",
  options: { full?: boolean } = {}
): Promise<DecisionText | null> {
  const full = options.full ?? false;
  // v2: 구조화 필드 추가로 캐시 포맷 변경
  // v3: expc·admrul 본문 파서 수정 — 종전 파서가 남긴 빈약한 결과(제목 없음·부분 본문)를 재사용하지 않는다.
  const cacheKey = `decision_text_${domain}_${id}_${full ? "full" : "comp"}_v3`;
  const cached = await readCache<DecisionText>(cacheKey);
  if (cached) return cached;

  const data = await fetchJson<Record<string, unknown>>("lawService.do", {
    target: domain,
    // 자치법규의 id 는 자치법규일련번호다. 본문 API 의 `ID=` 는 자치법규ID 체계라 일련번호를 넣으면
    // **엉뚱한 조례**가 오류 없이 온다(2088205: 춘천시 → 양구군, 2026-10-04 실측) → 일련번호는 `MST=`.
    ...(domain === "ordin" ? { MST: id } : { ID: id }),
  });

  // 법제처 업스트림 에러 감지
  const lawMsg = typeof data.Law === "string" ? data.Law : null;
  if (lawMsg && /일치하는.*없|확인하여 주십시오/.test(lawMsg)) {
    return {
      id,
      domain,
      caseNo: "",
      title: "(본문 제공 불가)",
      holdings: "",
      reasoning:
        "법제처 Open API가 이 결정의 본문을 JSON으로 제공하지 않습니다. " +
        "대부분 '국세법령정보시스템'·하급심 출처 판례가 해당되며, 아래 법제처 원문 링크에서 직접 확인할 수 있습니다.",
      court: "",
      date: "",
      sourceUrl: buildDecisionSourceUrl(domain, id),
    };
  }

  // 루트 컨테이너 탐색: Service → Search → 최상위 → 도메인 리스트 첫 원소
  const rootSearch = DOMAIN_RESPONSE_KEY[domain].root;
  const rootServices = [DOMAIN_RESPONSE_KEY[domain].service ?? rootSearch.replace("Search", "Service")].flat();
  const list = DOMAIN_RESPONSE_KEY[domain].list;
  const candidates = [
    ...rootServices.flatMap((s) => [data[s], data[s.toLowerCase()]]),
    data[rootSearch],
    data[rootSearch.toLowerCase()],
    Array.isArray(data[list]) ? (data[list] as unknown[])[0] : data[list],
    data,
  ];
  const found = candidates.find(
    (c) => c && typeof c === "object" && !Array.isArray(c)
  ) as GenericDecisionDetail | undefined;
  const container = found && normalizeDomainDetail(domain, found);

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[korean-law] getDecisionText(${domain}, ${id}) — 응답 최상위 키:`,
      Object.keys(data),
      container ? `container 키: ${Object.keys(container).slice(0, 15).join(", ")}` : "container 없음"
    );
  }

  if (!container) return null;

  const holdingsRaw = container.판시사항 ?? "";
  const summaryRaw = container.판결요지 ?? container.재결요지 ?? "";
  const holdRulingRaw = container.주문 ?? "";
  const reasoningRaw =
    container.이유 ??
    container.판례내용 ??
    container.판결본문 ??
    container.결정문 ??
    container.전문 ??
    container.본문 ??
    container.내용 ??
    "";

  const holdings = cleanHtml(holdingsRaw);
  const summary = cleanHtml(summaryRaw);
  const ruling = cleanHtml(holdRulingRaw);

  let reasoning = stripRepeatedSummary(cleanHtml(reasoningRaw), [holdings, summary, ruling]);
  const beforeCompact = reasoning.length;
  reasoning = compactBody(reasoning, { full });
  const compacted = beforeCompact > 0 && reasoning.length < beforeCompact;

  if (!holdings && !summary && !reasoning) {
    const longest = findLongestString(container);
    if (longest) {
      reasoning = cleanHtml(longest);
    }
  }

  const refLawsRaw = container.참조조문 ?? container.관련법령 ?? "";
  const refPrecRaw = container.참조판례 ?? container.참조결정 ?? "";

  const refLawsCleaned = refLawsRaw ? cleanHtml(refLawsRaw) : "";
  const refPrecCleaned = refPrecRaw ? cleanHtml(refPrecRaw) : "";
  const refLawsStructured = refLawsCleaned ? parseLawRefs(refLawsCleaned) : undefined;
  const refPrecedentsStructured = refPrecCleaned ? parsePrecedentRefs(refPrecCleaned) : undefined;
  const hasStructuredLaws = !!refLawsStructured && refLawsStructured.length > 0;
  const hasStructuredPrec = !!refPrecedentsStructured && refPrecedentsStructured.length > 0;

  const result: DecisionText = {
    id,
    domain,
    // ttSpecialDecc 본문은 청구번호·사건번호가 빈 문자열로 온다 → `||` 로 넘긴다.
    caseNo: container.사건번호 || container.결정번호 || container.안건번호 || container.청구번호 || container.발령번호 || "",
    title: cleanHtml(
      container.사건명 ??
        container.제목 ??
        container.안건명 ??
        container.행정규칙명 ??
        container.자치법규명 ??
        "(제목 없음)"
    ),
    holdings,
    summary: summary || undefined,
    ruling: ruling || undefined,
    reasoning,
    refLaws:
      hasStructuredLaws
        ? undefined
        : refLawsCleaned
          ? densifyLawRefs(refLawsCleaned)
          : undefined,
    refPrecedents:
      hasStructuredPrec
        ? undefined
        : refPrecCleaned
          ? densifyPrecedentRefs(refPrecCleaned)
          : undefined,
    refLawsStructured: hasStructuredLaws ? refLawsStructured : undefined,
    refPrecedentsStructured: hasStructuredPrec ? refPrecedentsStructured : undefined,
    caseType: container.사건종류명 || undefined,
    judgmentType: container.판결유형 || undefined,
    court:
      container.법원명 ??
      container.기관명 ??
      container.결정기관 ??
      container.회신기관명 ??
      container.질의기관명 ??
      container.소관부처명 ??
      container.재결청 ??
      "",
    date:
      container.선고일자 ??
      container.결정일 ??
      container.판결일 ??
      container.회신일자 ??
      container.시행일자 ??
      container.의결일자 ??
      container.해석일자 ??
      container.발령일자 ??
      "",
    sourceUrl: buildDecisionSourceUrl(domain, id),
    compacted,
  };

  const hasAnyContent =
    result.holdings || result.summary || result.reasoning || result.caseNo || result.title !== "(제목 없음)";
  if (!hasAnyContent) return null;

  if (!result.holdings && !result.summary && !result.reasoning) {
    // 금융위·방통위는 법제처 웹에 상세 페이지가 없어 링크가 없다 — 없는 링크를 가리키지 않는다.
    result.reasoning = result.sourceUrl
      ? "본문이 제공되지 않는 결정입니다. 아래 법제처 원문 링크에서 확인하세요."
      : "본문이 제공되지 않는 결정입니다. 법제처 웹에도 이 결정의 상세 페이지가 없습니다.";
  }

  await writeCache(cacheKey, result);
  return result;
}

/**
 * 문자열 / 문자열 배열 / **배열의 배열** 을 줄 목록으로 편다. 법제처는 문단을 중첩 배열로 주기도 하고
 * (행정규칙 `제개정이유내용`: `[["◇ 제ㆍ개정 이유", "…", "    "]]`), 항목이 하나뿐이면 배열 대신
 * 단일 문자열을 준다(`조문내용` 3/17). 공백뿐인 줄은 버린다.
 */
function flattenLines(v: unknown): string[] {
  if (typeof v === "string") return v.trim() ? [v] : [];
  if (Array.isArray(v)) return v.flatMap(flattenLines);
  return [];
}

/** 소제목(【】)을 단 문단들을 이어 붙인다. 소제목이 빈 문자열이면 본문만, 내용이 비면 문단째 생략. */
function sectioned(parts: ReadonlyArray<readonly [heading: string, value: unknown]>): string {
  return parts
    .map(([heading, value]) => [heading, flattenLines(value).join("\n")] as const)
    .filter(([, text]) => text)
    .map(([heading, text]) => (heading ? `【${heading}】\n${text}` : text))
    .join("\n\n");
}

/**
 * 도메인별 본문 응답을 공통 필드명으로 맞춘다 — 2026-10-04 실측으로 expc·admrul 본문은 getDecisionText 가
 * 기대하는 평평한 판례형이 아니었다(둘 다 null). 화면은 holdings·summary·ruling 을 「판시사항」·「판결요지」·
 * 「주문」으로 고정 표기하므로 해석례·행정규칙에는 쓰지 않고, 중립 라벨 「이유 / 전문」(reasoning) 한 영역에
 * 소제목과 함께 싣는다. 앞 800자만 보이는 축약에서도 핵심(질의요지·회답)이 먼저 보이도록 순서를 정했다.
 */
function normalizeDomainDetail(
  domain: DecisionDomain,
  c: GenericDecisionDetail
): GenericDecisionDetail {
  if (domain === "expc") {
    return { ...c, 이유: sectioned([["질의요지", c.질의요지], ["회답", c.회답], ["이유", c.이유]]) };
  }
  // 아래 도메인은 원응답을 넘기지 않고 **필요한 필드만** 새 객체로 만든다. 원응답엔 당사자 정보
  // (피심정보·신청인·피신청인·대리인·조치대상자의인적사항·피심인·위원정보·담당자명·전화번호)가 섞여 있고,
  // 본문이 비면 「가장 긴 문자열」 fallback 이 그것을 집어 화면에 띄울 수 있다.
  // 공정위·권익위의 `결정요지`는 요지가 아니라 「사건번호 : … 신청인 : …」 머리말 덩어리라 싣지 않는다.
  // 「주문」 은 원문 필드가 실제로 `주문` 일 때만 ruling 슬롯(화면 라벨 「주문」)에 둔다.
  if (domain === "admrul" || domain === "public") {
    // 공공기관 규정도 행정규칙과 같은 모양(AdmRulService)이다.
    const info = obj(c.행정규칙기본정보);
    const why = obj(c.제개정이유).제개정이유내용;
    return {
      행정규칙명: str(info.행정규칙명),
      발령번호: str(info.발령번호),
      소관부처명: str(info.소관부처명),
      시행일자: str(info.시행일자),
      발령일자: str(info.발령일자),
      이유: sectioned([["", c.조문내용], ["제개정이유", why]]),
    };
  }
  if (domain === "ftc") {
    // 일부 건은 필드가 문자열 "null" 로 온다(결정문일련번호 18701 등) — str() 이 빈 값으로 본다.
    return {
      사건명: str(c.사건명),
      사건번호: str(c.사건번호),
      의결일자: str(c.의결일자) ?? str(c.결정일자),
      주문: str(c.주문),
      이유: sectioned([["", str(c.이유)]]),
    };
  }
  if (domain === "nlrc") {
    return {
      제목: str(c.제목),
      사건번호: str(c.사건번호),
      기관명: str(c.기관명),
      결정일: str(c.등록일),
      이유: sectioned([
        ["판정사항", c.판정사항],
        ["판정요지", c.판정요지],
        ["판정결과", c.판정결과],
        ["내용", c.내용],
      ]),
    };
  }
  if (domain === "acr") {
    const a = obj(c.의결서);
    return {
      제목: str(a.제목),
      안건번호: str(a.의안번호),
      기관명: str(a.기관명),
      의결일자: str(a.의결일),
      주문: str(a.주문),
      이유: sectioned([["", a.이유]]),
    };
  }
  if (domain === "fsc") {
    return {
      안건명: str(c.안건명),
      결정번호: str(c.의결번호),
      기관명: str(c.기관명),
      이유: sectioned([["조치내용", c.조치내용], ["조치이유", c.조치이유]]),
    };
  }
  if (domain === "kcc") {
    // `사건번호`(조사번호)는 caseNo 체인에서 안건번호보다 앞서므로 넘기지 않는다 — 의결서 번호는 안건번호다.
    return {
      사건명: str(c.안건명) ?? str(c.사건명),
      안건번호: str(c.안건번호),
      기관명: str(c.기관명),
      의결일자: str(c.의결일자),
      주문: str(c.주문),
      이유: imageOnly(c.이유)
        ? "【이유】\n법제처가 이 부분을 이미지로만 제공해 앱에서 표시할 수 없습니다."
        : sectioned([["", c.이유]]),
    };
  }
  if (domain === "ordin") {
    const info = obj(c.자치법규기본정보);
    const articles = ([] as unknown[]).concat(obj(c.조문).조 ?? []).map((x) => obj(x).조내용);
    return {
      자치법규명: str(info.자치법규명),
      발령번호: str(info.공포번호),
      기관명: str(info.지자체기관명),
      시행일자: str(info.시행일자),
      이유: sectioned([["", articles], ["제개정이유", obj(c.제개정이유).제개정이유내용]]),
    };
  }
  if (domain === "trty") {
    const info = obj(c.조약기본정보);
    return {
      제목: str(info.조약명_한글),
      결정번호: str(info.조약번호),
      시행일자: str(info.발효일자),
      이유: sectioned([["", obj(c.조약내용).조약내용]]),
    };
  }
  return c;
}

/**
 * 이미지 태그만 있고 글자가 없는 필드 — 방통위 의결서 「이유」는 스캔 이미지 10~19장뿐이다(2026-10-04 실측 3/3).
 * 그대로 두면 태그 제거 후 빈 문자열 → 「가장 긴 문자열」 fallback 이 엉뚱한 값을 본문에 올린다.
 */
function imageOnly(v: unknown): boolean {
  return typeof v === "string" && /<img\b/i.test(v) && !cleanHtml(v).trim();
}

/** 객체가 아니면 빈 객체 — 중첩 필드가 null·문자열·누락으로 오는 경우를 한 번에 막는다. */
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** 의미 있는 문자열만 — 공백뿐이거나 문자열 "null"(공정위 일부 건)이면 undefined. */
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() && v.trim() !== "null" ? v : undefined;
}

/** 객체의 모든 문자열 필드 중 가장 긴 값을 찾는다. */
function findLongestString(obj: Record<string, unknown>): string | null {
  let longest = "";
  for (const value of Object.values(obj)) {
    if (typeof value === "string" && value.length > longest.length) {
      longest = value;
    }
  }
  return longest.length >= 20 ? longest : null;
}
