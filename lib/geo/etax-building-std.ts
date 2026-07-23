/**
 * 서울시 ETAX 주택외건물(비주거용) 시가표준액 자동조회.
 *
 * `POST etax.seoul.go.kr/BldnStndAmtLstAction.tran` (무인증, EUC-KR 응답).
 * - PNU(19, 서울) → etax 폼 파라미터. `tsj_gubun`은 **raw pnu[10]** 에서 도출
 *   (decompose의 `platGbCd`는 건축HUB 규약 "0"=대지/"1"=산 → etax 일반="1"/산="2"와 불일치, 사용 금지).
 * - etax는 약한 DH키 → Node 기본 fetch `ERR_SSL_DH_KEY_TOO_SMALL` 실패.
 *   node:https 요청 한정 `ciphers: DEFAULT@SECLEVEL=1`로만 우회(전역 미변경, 인증서 검증 유지).
 * - 반환 "계"(건축물+시설)가 재산세 건축물분 과세표준(§104-2→§6④, 시설 포함) 및 소방분 base(§146④).
 *
 * 설계: docs/02-design/features/property-building-nonresidential-stdprice-etax-lookup.plan.md
 */
import * as https from "node:https";
import * as iconv from "iconv-lite";
import { decomposePnuForBuildingRegister } from "@/lib/geo/pnu-building-register";

const ETAX_TRAN = "https://etax.seoul.go.kr/BldnStndAmtLstAction.tran";
const ETAX_VIEW =
  "https://etax.seoul.go.kr/BldnStndAmtLstAction.view?gnb_id=0709&lnb_id=0709&gl_gubun=l";

// etax는 약한 DH키를 사용 → Node 기본(OpenSSL SECLEVEL=2)은 ERR_SSL_DH_KEY_TOO_SMALL로 실패.
// node:https 내장 모듈에 이 요청 한정 ciphers 완화만 적용(전역 미변경, 인증서 검증 유지). undici 의존성 불요.
const ETAX_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Referer: ETAX_VIEW,
  "Content-Type": "application/x-www-form-urlencoded",
};

/** etax POST — 약한 DH키 허용(ciphers SECLEVEL=1). 응답 Buffer(EUC-KR) 반환. */
function postEtax(body: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      ETAX_TRAN,
      {
        method: "POST",
        ciphers: "DEFAULT@SECLEVEL=1",
        headers: { ...ETAX_HEADERS, "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on("error", reject);
    req.setTimeout(15000, () => req.destroy(new Error("timeout")));
    req.write(body);
    req.end();
  });
}

export interface EtaxBuildingStdParams {
  /** 자치구 3자리 (서울 "11" 접두 제거) */
  siguCd: string;
  /** 법정동 5자리 */
  hdongCd: string;
  /** 특수지: "1"=일반번지 / "2"=산번지 */
  tsjGubun: string;
  /** 본번 (선행 0 제거) */
  bonbun: string;
  /** 부번 (선행 0 제거, 0000→"") */
  bubun: string;
}

export interface EtaxBuildingStdResult {
  no: string;
  year: string;
  /** 번지 (예: "0737-0000") */
  lot: string;
  /** 동 */
  dongNo: string;
  /** 호수 */
  ho: string;
  /** 물건명 (예: "강남구 역삼동 737") */
  name: string;
  /** 시가표준액 계 (원) — 재산세 건축물분 과세표준 */
  total: number;
  /** 건축물분 (원) — 보조표시 */
  building: number | null;
  /** 시설분 (원) — 보조표시. 없으면 null */
  facility: number | null;
  /** 연면적 (㎡) */
  area: number | null;
}

/**
 * PNU(19자리, 서울) → etax 폼 파라미터.
 * 서울(sigunguCd "11" 시작) 아니면 null. `tsj_gubun`은 raw pnu[10]에서(§4 함정).
 */
export function buildEtaxParams(pnu: string): EtaxBuildingStdParams | null {
  const parts = decomposePnuForBuildingRegister(pnu);
  if (!parts) return null;
  if (!parts.sigunguCd.startsWith("11")) return null; // 서울 전용
  return {
    siguCd: parts.sigunguCd.slice(2, 5),
    hdongCd: parts.bjdongCd,
    // ⚠ parts.platGbCd(HUB 규약) 금지 — raw pnu[10]에서 직접.
    tsjGubun: pnu[10] === "2" ? "2" : "1",
    bonbun: String(parseInt(parts.bun, 10)),
    bubun: parseInt(parts.ji, 10) === 0 ? "" : String(parseInt(parts.ji, 10)),
  };
}

/** "225,037,140,965 원" → 225037140965. 숫자 없으면 null. */
function toWon(s: string): number | null {
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

function cellsOf(rowHtml: string): string[] {
  return (rowHtml.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? [])
    .map((c) =>
      c
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .trim(),
    )
    .filter((c) => c !== "");
}

/**
 * etax 응답 HTML(EUC-KR 디코딩 문자열) → 결과 배열.
 * table[1]에서 파싱. **고정 인덱스 금지** — 헤더는 8칼럼이나 데이터 메인행은 9셀
 * (물건명 뒤 `계` 라벨 삽입). 금액칸은 `계` 다음 셀로 특정. 하위 2셀행(건축물/시설)은 라벨로 수집.
 */
export function parseEtaxBuildingStd(html: string): EtaxBuildingStdResult[] {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  if (tables.length < 2) return [];
  const rows = tables[1].match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  const results: EtaxBuildingStdResult[] = [];
  let current: EtaxBuildingStdResult | null = null;

  for (const row of rows) {
    const cells = cellsOf(row);
    if (cells.length === 0) continue;

    // 메인행: 첫 셀이 순수 번호 + 6셀 이상 (헤더행 "번호"·form 행은 자연 스킵)
    const isMainRow = /^\d+$/.test(cells[0]) && cells.length >= 6;
    if (isMainRow) {
      // `계` 라벨 기준 역/순참조 — 빈 셀 필터로 인한 선행 컬럼 밀림에 강건.
      // 레이아웃: [번호,년도,번지,동,호,물건명,계,시가표준액,연면적]
      const gyeIdx = cells.indexOf("계");
      const at = (i: number) => cells[i] ?? "";
      const hasGye = gyeIdx >= 5;
      const parseArea = (s: string) => parseFloat(s.replace(/,/g, "")) || null;
      current = hasGye
        ? {
            no: at(0),
            year: at(1),
            lot: at(gyeIdx - 4),
            dongNo: at(gyeIdx - 3),
            ho: at(gyeIdx - 2),
            name: at(gyeIdx - 1),
            total: toWon(at(gyeIdx + 1)) ?? 0,
            building: null,
            facility: null,
            area: parseArea(at(gyeIdx + 2)),
          }
        : {
            no: at(0),
            year: at(1),
            lot: at(2),
            dongNo: at(3),
            ho: at(4),
            name: at(5),
            total: toWon(at(cells.length - 2)) ?? 0,
            building: null,
            facility: null,
            area: parseArea(at(cells.length - 1)),
          };
      results.push(current);
    } else if (cells.length === 2 && current) {
      const [label, value] = cells;
      const won = toWon(value);
      if (label.includes("건축물")) current.building = won;
      else if (label.includes("시설")) current.facility = won;
    }
  }
  return results;
}

/**
 * PNU·연도로 서울 ETAX 주택외건물 시가표준액 조회. 비차단(실패=warnings).
 * dong/hosu 지정 시 집합건물 세대로 좁힘.
 */
export async function fetchEtaxBuildingStd(
  pnu: string,
  year: string,
  dong = "",
  hosu = "",
): Promise<{ results: EtaxBuildingStdResult[]; warnings: string[] }> {
  const params = buildEtaxParams(pnu);
  if (!params) {
    return {
      results: [],
      warnings: ["서울 소재 건축물만 ETAX 조회가 가능합니다."],
    };
  }

  const body = new URLSearchParams({
    sysCode: "EAX",
    transSeq1: "1",
    isLogin: "",
    SIGU_NAME: "null",
    PRE_SIGU_CD: params.siguCd,
    HDONG_CD: params.hdongCd,
    BDONG_CD: "99999",
    SIGU_CD: params.siguCd,
    [`HDONG${params.siguCd}`]: params.hdongCd,
    tsj_gubun: params.tsjGubun,
    bonbun: params.bonbun,
    bubun: params.bubun,
    dong,
    hosu,
    downExcel: "N",
    GWAPO_YEAR: year,
    INPUT: "",
  }).toString();

  let html: string;
  try {
    const buf = await postEtax(body);
    html = iconv.decode(buf, "euc-kr");
  } catch (err) {
    return {
      results: [],
      warnings: [`ETAX 조회 네트워크 오류: ${String(err)}`],
    };
  }

  const results = parseEtaxBuildingStd(html);
  if (results.length === 0) {
    return {
      results: [],
      warnings: [
        "해당 소재지의 ETAX 주택외건물 시가표준액 자료를 찾을 수 없습니다. 직접 입력하세요.",
      ],
    };
  }
  return { results, warnings: [] };
}
