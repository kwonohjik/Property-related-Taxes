/**
 * 공시지가·기준시가 조회 API — Vworld NED(국토정보) 오픈 API 프록시
 *
 * GET /api/address/standard-price
 *   ?pnu={19자리PNU}           우선 사용 (검색 API의 item.id)
 *   &jibun={지번주소}          pnu 없을 때 자동 PNU 구성에 사용
 *   &propertyType={housing|land}
 *   &year={YYYY}
 *   &dong={동명}               선택 시 해당 동·호 가격 반환
 *   &ho={호명}
 *
 * 응답:
 *   - units: 전체 동·호 목록 (프론트 드롭다운용)
 *   - priceType: "apart_housing_price" | "indvd_housing_price" | "land_price"
 *   - 선택된 dong·ho 기준 price 포함
 */

import { NextRequest, NextResponse } from "next/server";

const VWORLD_ADDR_URL = "https://api.vworld.kr/req/address";
const VWORLD_NED_URL  = "https://api.vworld.kr/ned/data";

const VWORLD_DOMAIN      = process.env.VWORLD_DOMAIN ?? "http://localhost:3000";
const VWORLD_DOMAIN_HOST = new URL(VWORLD_DOMAIN).hostname;

// ──────────────────────────────────────────────────
// 타입
// ──────────────────────────────────────────────────

interface AddrStructure {
  level4LC?: string;
  [key: string]: unknown;
}

interface AddrResponse {
  response?: {
    status?: string;
    refined?: { structure?: AddrStructure };
  };
}

export interface NedPriceItem {
  pnu?: string;
  stdrYear?: string;
  stdrMt?: string;
  pblntfDe?: string;
  pblntfPclnd?: string;  // 개별공시지가 (원/㎡)
  prposArea1Nm?: string; // 용도지역명 (토지특성정보, 예: "일반상업지역")
  lndpclAr?: string;     // 필지면적 (㎡, 토지특성정보 — 실측 확정: "87534.3")
  pblntfPc?: string;     // 공동주택 공시가격 (원)
  housePc?: string;      // 개별단독주택 공시가격 (원) ← getIndvdHousingPriceAttr 전용 필드
  dongNm?: string;
  hoNm?: string;
  floorNm?: string;
  prvuseAr?: string;
  aphusNm?: string;
  aphusSeCodeNm?: string;
  ldCodeNm?: string;
  [key: string]: unknown;
}

interface NedRawResponse {
  indvdLandPrices?:      { field?: NedPriceItem | NedPriceItem[]; totalCount?: string };
  landCharacteristicss?: { field?: NedPriceItem | NedPriceItem[]; totalCount?: string };
  apartHousingPrices?:   { field?: NedPriceItem | NedPriceItem[]; totalCount?: string };
  indvdHousingPrices?:   { field?: NedPriceItem | NedPriceItem[]; totalCount?: string };
  response?: { totalCount?: string; resultCode?: string };
}

// ──────────────────────────────────────────────────
// 법정동코드 조회 → PNU 구성 (jibun 기반 fallback)
// ──────────────────────────────────────────────────

async function getLegalDongCode(jibun: string, apiKey: string): Promise<string | null> {
  const params = new URLSearchParams({
    service: "address", request: "getcoord", version: "2.0",
    crs: "epsg:4326", address: jibun, refine: "true",
    simple: "false", format: "json", type: "parcel", key: apiKey,
  });
  try {
    const res = await fetch(`${VWORLD_ADDR_URL}?${params}`, {
      cache: "no-store",
      headers: { Accept: "application/json", Referer: VWORLD_DOMAIN },
    });
    if (!res.ok) return null;
    const data: AddrResponse = await res.json();
    if (data.response?.status !== "OK") return null;
    const code = data.response?.refined?.structure?.level4LC;
    return code && code.length >= 10 ? code.slice(0, 10) : null;
  } catch { return null; }
}

function buildPnu(legalDongCode: string, jibun: string): string | null {
  const parts = jibun.trim().split(/\s+/);
  let token = parts[parts.length - 1] ?? "";
  // 대지구분: 1 = 대지(일반토지), 2 = 산(임야)
  // Vworld `address.parcel`은 산번지를 「… 행현리 산 100」처럼 **공백을 넣어** 주는 표기와
  // 「산100」 붙임 표기가 모두 온다. 마지막 토큰만 보면 앞의 표기에서 판정이 실패해
  // 대지구분이 "1"로 남고, 19자리 형식검증을 통과한 채 **같은 본번의 대지 필지**가 조회된다.
  // 직전 토큰이 정확히 "산"인 경우만 본다 — 「산성동」·「산북면」 같은 지명은 걸리지 않는다.
  let landType = "1";
  if (token.startsWith("산")) { landType = "2"; token = token.slice(1); }
  else if (parts[parts.length - 2] === "산") { landType = "2"; }
  const [mainStr, subStr] = token.split("-");
  const mainNum = parseInt(mainStr ?? "0", 10);
  const subNum  = parseInt(subStr  ?? "0", 10);
  if (isNaN(mainNum) || mainNum <= 0) return null;
  const pnu = legalDongCode + landType
    + String(mainNum).padStart(4, "0")
    + String(subNum).padStart(4, "0");
  return pnu.length === 19 ? pnu : null;
}

// ──────────────────────────────────────────────────
// NED API 호출 — 전체 페이지 수집
// ──────────────────────────────────────────────────

async function callNedAllPages(
  endpoint: string,
  pnu: string,
  year: string,
  apiKey: string,
  responseKey: "apartHousingPrices" | "indvdHousingPrices" | "indvdLandPrices" | "landCharacteristicss",
): Promise<NedPriceItem[]> {
  const allItems: NedPriceItem[] = [];
  let pageNo = 1;

  while (true) {
    const params = new URLSearchParams({
      key: apiKey, pnu, stdrYear: year,
      format: "json", numOfRows: "1000",
      pageNo: String(pageNo),
      domain: VWORLD_DOMAIN_HOST,
    });
    try {
      const url = `${VWORLD_NED_URL}/${endpoint}?${params}`;
      const res = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json", Referer: VWORLD_DOMAIN },
      });
      if (!res.ok) {
        console.warn(`[NED] ${endpoint} HTTP ${res.status}`);
        break;
      }
      const data = (await res.json()) as NedRawResponse;
      // case-insensitive key fallback (Vworld API casing은 버전마다 다를 수 있음)
      const container: { field?: NedPriceItem | NedPriceItem[]; totalCount?: string } | undefined =
        data[responseKey] ??
        (Object.entries(data).find(([k]) => k.toLowerCase() === responseKey.toLowerCase())?.[1] as typeof container);
      if (!container) break;

      const raw = container.field;
      const items = raw
        ? (Array.isArray(raw) ? raw : [raw]).filter((it) => it && typeof it === "object" && Object.keys(it).length > 0)
        : [];
      allItems.push(...items);

      // totalCount가 없거나 0이면 빈 페이지가 올 때까지 계속 페이지 수집
      const total = parseInt(container.totalCount ?? "0", 10);
      if (items.length === 0 || (total > 0 && allItems.length >= total)) break;
      pageNo++;
    } catch { break; }
  }

  return allItems;
}

// ──────────────────────────────────────────────────
// 동·호 필터링 + 가격 추출
// ──────────────────────────────────────────────────

function pickUnit(
  items: NedPriceItem[],
  priceField: string,
  dong?: string,
  ho?: string,
): { price: number; item: NedPriceItem } | null {
  let candidates = items;

  if (dong || ho) {
    const cleanDong = dong?.replace(/동$/, "").trim() ?? "";
    const cleanHo   = ho?.replace(/호$/, "").trim() ?? "";
    const matched = items.filter((it) => {
      const iDong = String(it.dongNm ?? "").replace(/동$/, "").trim();
      const iHo   = String(it.hoNm   ?? "").replace(/호$/, "").trim();
      return (!cleanDong || iDong === cleanDong) && (!cleanHo || iHo === cleanHo);
    });
    // 동·호를 지정했으면 정확히 매칭된 세대만 사용. 매치가 없으면 임의 세대로 fallback하지 않고
    // 조회 실패(null)를 반환 — 잘못된 세대 공시가격이 세금 계산에 들어가는 것을 방지.
    if (matched.length === 0) return null;
    candidates = matched;
  }

  // 최신 연도 우선
  const sorted = candidates
    .map((it) => ({
      price: parseInt(String(it[priceField] ?? "0").replace(/[^0-9]/g, ""), 10) || 0,
      item: it,
    }))
    .filter((x) => x.price > 0)
    .sort((a, b) => (b.item.stdrYear ?? "").localeCompare(a.item.stdrYear ?? ""));
  return sorted[0] ?? null;
}

// 동·호 드롭다운용 unit 목록 생성
function buildUnitList(items: NedPriceItem[], priceField: string) {
  return items.map((it) => ({
    dong:          it.dongNm ?? "",
    ho:            it.hoNm ?? "",
    floor:         it.floorNm ?? "",
    exclusiveArea: it.prvuseAr ? parseFloat(it.prvuseAr) : undefined,
    price:         parseInt(String(it[priceField] ?? "0").replace(/[^0-9]/g, ""), 10) || 0,
    year:          it.stdrYear ?? "",
    announcedDate: it.pblntfDe ?? "",
  }));
}

// ──────────────────────────────────────────────────
// GET handler
// ──────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let   pnu          = searchParams.get("pnu")?.trim() ?? "";
  const jibun        = searchParams.get("jibun")?.trim() ?? "";
  const propertyType = searchParams.get("propertyType") ?? "housing";
  const year         = searchParams.get("year") ?? String(new Date().getFullYear());
  const dong         = searchParams.get("dong") ?? undefined;
  const ho           = searchParams.get("ho") ?? undefined;

  const apiKey = process.env.VWORLD_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: { code: "VWORLD_API_KEY_MISSING", message: "VWORLD_API_KEY가 설정되지 않았습니다." } },
      { status: 500 },
    );
  }

  // PNU 확보 — 직접 전달이 없으면 jibun에서 구성
  if (!pnu) {
    if (!jibun) {
      return NextResponse.json(
        { error: { code: "MISSING_PNU", message: "pnu 또는 jibun 파라미터가 필요합니다." } },
        { status: 400 },
      );
    }
    const dongCode = await getLegalDongCode(jibun, apiKey);
    if (!dongCode) {
      return NextResponse.json(
        { error: { code: "DONG_CODE_NOT_FOUND", message: "법정동코드를 조회할 수 없습니다. 지번 주소를 확인해 주세요." } },
        { status: 404 },
      );
    }
    const built = buildPnu(dongCode, jibun);
    if (!built) {
      return NextResponse.json(
        { error: { code: "PNU_BUILD_FAILED", message: `법정동코드(${dongCode})와 지번(${jibun})으로 PNU를 구성할 수 없습니다.` } },
        { status: 422 },
      );
    }
    pnu = built;
  }

  try {
    // ── 토지 ──────────────────────────────────────
    if (propertyType === "land") {
      const items = await callNedAllPages("getIndvdLandPriceAttr", pnu, year, apiKey, "indvdLandPrices");
      const hit = pickUnit(items, "pblntfPclnd", dong, ho);
      if (!hit) {
        return NextResponse.json(
          { error: { code: "PRICE_NOT_FOUND", message: `개별공시지가 없음 (PNU: ${pnu}, ${year}년)` }, pnu },
          { status: 404 },
        );
      }
      // 용도지역(도시지역 여부 판정용) 보강 — 토지특성정보. 실패해도 가격은 반환.
      let zoneName: string | undefined;
      let landArea: number | undefined; // 필지면적(㎡) — getLandCharacteristics.lndpclAr (실측 확정)
      try {
        const chars = await callNedAllPages("getLandCharacteristics", pnu, year, apiKey, "landCharacteristicss");
        const charHit = [...chars].sort((a, b) => (b.stdrYear ?? "").localeCompare(a.stdrYear ?? ""))[0];
        const z = charHit?.prposArea1Nm;
        if (typeof z === "string" && z && z !== "지정되지않음") zoneName = z;
        const ar = charHit?.lndpclAr;
        if (typeof ar === "string" && ar) {
          const n = parseFloat(ar);
          if (Number.isFinite(n) && n > 0) landArea = n;
        }
      } catch { /* 용도지역·면적 보강 실패는 가격 반환에 영향 없음 */ }

      return NextResponse.json({
        pnu, priceType: "land_price",
        year: hit.item.stdrYear, price: hit.price,
        announcedDate: hit.item.pblntfDe ?? "",
        ldCodeNm: hit.item.ldCodeNm,
        zoneName,
        area: landArea,
        message: `${hit.item.stdrYear}년 개별공시지가 (원/㎡)`,
      });
    }

    // ── 공동주택 우선 → 개별주택 fallback ─────────
    const aptItems = await callNedAllPages("getApartHousingPriceAttr", pnu, year, apiKey, "apartHousingPrices");
    const aptHit = pickUnit(aptItems, "pblntfPc", dong, ho);
    if (aptHit) {
      return NextResponse.json({
        pnu, priceType: "apart_housing_price",
        year:          aptHit.item.stdrYear,
        price:         aptHit.price,
        announcedDate: aptHit.item.pblntfDe ?? "",
        dong:          aptHit.item.dongNm,
        ho:            aptHit.item.hoNm,
        floor:         aptHit.item.floorNm,
        exclusiveArea: aptHit.item.prvuseAr ? parseFloat(aptHit.item.prvuseAr) : undefined,
        buildingName:  aptHit.item.aphusNm,
        buildingType:  aptHit.item.aphusSeCodeNm,
        ldCodeNm:      aptHit.item.ldCodeNm,
        stdrMt:        aptHit.item.stdrMt,
        units: buildUnitList(aptItems, "pblntfPc"),
        message: `${aptHit.item.stdrYear}년 공동주택 공시가격`,
      });
    }

    // 공동주택 없음 → 개별단독주택 시도
    // ※ getIndvdHousingPriceAttr 응답 가격 필드는 pblntfPc가 아닌 housePc
    const indvdItems = await callNedAllPages("getIndvdHousingPriceAttr", pnu, year, apiKey, "indvdHousingPrices");
    const indvdHit = pickUnit(indvdItems, "housePc", dong, ho);
    if (indvdHit) {
      // pblntfDe 없음 → stdrYear + "0429" 로 공시일 추정
      //
      // 🔴 **추정값임을 응답에 표시한다** — 종전에는 실제 공시일과 **같은 필드로 섞여** 나가
      //    호출부가 구분할 수 없었다. 이 값을 그대로 §164⑧ 「기준시가 조정월수」
      //    (시행규칙 §80②1호 — 결정일 기준 월수) 산출에 쓰면 월 경계(4/29 vs 5/1)에서
      //    **1개월이 어긋난다**. 추정이면 호출부가 자동 파생을 끄고 수동 입력으로 돌려야 한다.
      const announcedDateEstimated = !indvdHit.item.pblntfDe;
      const announcedDate = indvdHit.item.pblntfDe
        ?? `${indvdHit.item.stdrYear ?? year}0429`;
      return NextResponse.json({
        pnu, priceType: "indvd_housing_price",
        year: indvdHit.item.stdrYear, price: indvdHit.price,
        announcedDate,
        announcedDateEstimated,
        ldCodeNm: indvdHit.item.ldCodeNm,
        units: buildUnitList(indvdItems, "housePc"),
        message: `${indvdHit.item.stdrYear}년 개별주택 공시가격`,
      });
    }

    return NextResponse.json(
      { error: { code: "PRICE_NOT_FOUND", message: `공시가격 없음 (PNU: ${pnu}, ${year}년)` }, pnu },
      { status: 404 },
    );
  } catch (err) {
    console.error("[standard-price]", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "공시가격 조회 중 오류가 발생했습니다." } },
      { status: 500 },
    );
  }
}
