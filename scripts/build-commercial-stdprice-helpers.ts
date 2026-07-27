/**
 * 상업용건물·오피스텔 기준시가 변환 보조 헬퍼 — 순수 함수만 (800줄 정책 sibling 분리).
 *
 * 본 파일 책임 (I/O 없음 — 단위 테스트 대상):
 *   - 원본 4세대 형식 판별 (값 sniffing — 헤더명 판별 금지)
 *   - 컬럼명 정규화 (단위 접미사 제거 · 연도별 별칭 통일)
 *   - 라벨→코드 변환 (건물구분·특수지·층구분)
 *   - 텍스트 정규화 (soft hyphen · 따옴표 · 공백)
 *   - 호 값 Excel 날짜 오염 복원 (`03월 02일` → `3-2`)
 *   - CSV 라인 분해 (RFC4180 따옴표 인식)
 *   - 중복 배포본 채택 판정 (파일명 기준일 → 엔트리 타임스탬프, mtime 금지)
 *   - 파티션 키 산출
 *
 * 설계: docs/02-design/features/commercial-officetel-standard-price-lookup.engine.design.md §2
 * 계획: docs/01-plan/features/commercial-officetel-standard-price-lookup.plan.md §6 Phase 1
 */

/** 원본 형식 세대. 판별은 **값 sniffing** — 헤더명으로 판별하면 2019에서 오판한다. */
export type Generation = "quoted-code" | "plain-code" | "plain-label" | "padded-label";

/**
 * 파티션에 저장되는 물건(호) 1건.
 * 필드명을 1~2자로 줄인 것은 26,458,783행 × 13필드의 JSON 키 반복 비용 때문이다.
 */
export interface StdPriceUnit {
  b: string; // 법정동코드 10자리
  s: string; // 특수지코드 — "0"=일반 "1"=산 "2"~"9" "A" ★ number 금지 ("A" 실재)
  bn: number; // 번지(본번)
  jn: number; // 호(부번)
  nm: string; // 건물명(상가건물블록주소) ★ 물건 키 구성요소
  dg: string; // 동(상가건물동주소)
  fc: 1 | 4 | 5; // 층구분 1=지하 4=지상 5=옥탑 ★ 물건 키 구성요소
  fl: string; // 층
  ho: string; // 호수
  p: number; // 고시가격 원/㎡
  ea: number; // 전용면적 ㎡
  sa: number; // 공유면적 ㎡
  k: 1 | 2 | 3; // 건물구분 1=상가 2=오피스텔 3=복합건물
}

/** 원본 1행을 컬럼 정규화명으로 접근하기 위한 인덱스 맵. */
export type ColumnIndex = Record<string, number>;

export const REQUIRED_COLUMNS = [
  "고시일자",
  "법정동코드",
  "특수지코드",
  "번지",
  "호",
  "상가건물블록주소",
  "상가건물동주소",
  "건물층구분코드",
  "상가건물층주소",
  "상가건물호주소",
  "고시가격",
  "전용면적",
  "공유면적",
  "건물구분",
] as const;

/** 연도별 컬럼 별칭 → 정규화명. 단위 접미사는 별도 제거하므로 여기 넣지 않는다. */
const COLUMN_ALIASES: Record<string, string> = {
  전유면적: "전용면적",
  공용면적: "공유면적",
  상가종류코드: "건물구분",
  건물구분코드: "건물구분",
};

/**
 * 컬럼명 정규화 — 단위 접미사 제거 후 별칭 통일.
 * `고시가격(원)`·`전유면적(㎡)`·`공유면적(m2)` 3세대가 모두 존재한다(실측).
 */
export function normalizeColumnName(raw: string): string {
  const base = stripQuotes(raw)
    .replace(/\([^)]*\)\s*$/, "")
    .trim();
  return COLUMN_ALIASES[base] ?? base;
}

/**
 * 헤더 행 → 정규화명 인덱스 맵.
 * 2016은 헤더 끝에 빈 컬럼 3개가 붙어 있다(실측 18칸) — 빈 이름은 무시된다.
 */
export function buildColumnIndex(headerFields: readonly string[]): ColumnIndex {
  const idx: ColumnIndex = {};
  headerFields.forEach((raw, i) => {
    const name = normalizeColumnName(raw);
    if (!name) return;
    if (!(name in idx)) idx[name] = i;
  });
  return idx;
}

/** 필수 컬럼 누락 목록 (빈 배열이면 정상). */
export function missingColumns(idx: ColumnIndex): string[] {
  return REQUIRED_COLUMNS.filter((c) => !(c in idx));
}

/**
 * 형식 세대 판별 — **값 sniffing 필수**.
 *
 * ⚠️ 헤더명으로 판별하면 안 된다: 2019는 헤더가 `상가종류코드`(코드계 이름)인데
 *    값은 코드(`1`)다. 반대로 2020·2021·2022도 헤더는 `상가종류코드`인데 값은 라벨(`상가`)이다.
 */
export function detectGeneration(
  headerLine: string,
  firstDataFields: readonly string[],
  idx: ColumnIndex,
): Generation {
  const kind = stripQuotes(firstDataFields[idx["건물구분"]] ?? "");
  const isCode = /^[123]$/.test(kind);
  if (isCode) {
    return headerLine.trimStart().startsWith('"') ? "quoted-code" : "plain-code";
  }
  const bunji = stripQuotes(firstDataFields[idx["번지"]] ?? "");
  return /^0\d{3}$/.test(bunji) ? "padded-label" : "plain-label";
}

const BUILDING_KIND_BY_LABEL: Record<string, 1 | 2 | 3> = {
  상가: 1,
  오피스텔: 2,
  복합건물: 3,
};

const FLOOR_CLASS_BY_LABEL: Record<string, 1 | 4 | 5> = {
  지하: 1,
  지하층: 1,
  지상: 4,
  지상층: 4,
  옥탑: 5,
  옥탑층: 5,
};

/** 특수지 라벨 → 코드. 분류코드표(2018년) 원본 그대로. */
const SPECIAL_LOT_BY_LABEL: Record<string, string> = {
  일반지번: "0",
  산: "1",
  "가,확정예정지번": "2",
  "구,확정예정지번(부번이세분화된경우)": "3",
  구획정리1: "4",
  구획정리2: "5",
  블록: "6",
  구역: "7",
  단지: "8",
  무번지: "9",
  해당없음: "A",
};

export function toBuildingKind(raw: string): 1 | 2 | 3 | null {
  const v = stripQuotes(raw);
  if (v === "1" || v === "2" || v === "3") return Number(v) as 1 | 2 | 3;
  return BUILDING_KIND_BY_LABEL[v] ?? null;
}

export function toFloorClass(raw: string): 1 | 4 | 5 | null {
  const v = stripQuotes(raw);
  if (v === "1" || v === "4" || v === "5") return Number(v) as 1 | 4 | 5;
  return FLOOR_CLASS_BY_LABEL[v] ?? null;
}

export function toSpecialLotCode(raw: string): string | null {
  const v = stripQuotes(raw);
  if (/^([0-9A])$/.test(v)) return v;
  return SPECIAL_LOT_BY_LABEL[v] ?? null;
}

function stripQuotes(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/""/g, '"').trim();
  }
  return t;
}

/**
 * 텍스트 필드 정규화.
 *
 * U+00AD(SOFT HYPHEN)는 2018년분 건물명·동에 실재한다(실측: `신부파스칼텔(431­5)`,
 * 동 값이 `­` 단독). 눈에 보이지 않아 연도 간 물건 키 매칭을 조용히 깨뜨리므로
 * 하이픈으로 치환하고, 결과가 구분자뿐이면 빈 값으로 처리한다.
 */
export function normalizeText(raw: string): string {
  const v = stripQuotes(raw).replace(/­/g, "-").trim();
  return /^[-\s]*$/.test(v) ? "" : v;
}

/**
 * 호수(`상가건물호주소`) Excel 날짜 오염 복원 — `03월 02일` → `3-2`.
 * 한국 Excel 로케일 `M월 D일`. 복원 불가 형태는 원문 유지(호출부가 건수를 집계한다).
 */
export function restoreHoAddress(raw: string): { value: string; restored: boolean } {
  const v = normalizeText(raw);
  const m = /^(\d{1,2})월\s*(\d{1,2})일$/.exec(v);
  if (!m) return { value: v, restored: false };
  return { value: `${Number(m[1])}-${Number(m[2])}`, restored: true };
}

/** 고시일자 → ISO. CSV는 `2020-01-01`, xlsx는 `20240101`(실측). */
export function normalizeNoticeDate(raw: string): string | null {
  const v = stripQuotes(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * CSV 라인 분해 — 따옴표 인식 필수.
 * 특수지 라벨 `"가,확정예정지번"`처럼 **필드 안에 콤마**가 있는 값이 규격상 존재한다
 * (분류코드표 실측). 단순 `split(",")`는 이 행에서 컬럼을 밀어버린다.
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export interface RowParseResult {
  unit: StdPriceUnit;
  noticeDate: string;
  hoRestored: boolean;
}

/**
 * 원본 1행 → StdPriceUnit. 파싱 불가 행은 null (호출부가 사유별로 집계한다).
 *
 * 번지·호는 `parseInt` 정규화한다 — 2022·2024~2026의 zero-pad(`0080`)를 그대로 두면
 * PNU 조인(`PNU[11:15]` = `0080` → 80)이 깨진다.
 */
export function parseRow(fields: readonly string[], idx: ColumnIndex): RowParseResult | null {
  const at = (col: string) => fields[idx[col]] ?? "";

  const noticeDate = normalizeNoticeDate(at("고시일자"));
  if (!noticeDate) return null;

  const b = stripQuotes(at("법정동코드"));
  if (!/^\d{10}$/.test(b)) return null;

  const s = toSpecialLotCode(at("특수지코드"));
  if (s === null) return null;

  const bn = Number.parseInt(stripQuotes(at("번지")), 10);
  const jn = Number.parseInt(stripQuotes(at("호")), 10);
  if (!Number.isFinite(bn) || !Number.isFinite(jn)) return null;

  const fc = toFloorClass(at("건물층구분코드"));
  const k = toBuildingKind(at("건물구분"));
  if (fc === null || k === null) return null;

  const p = Number.parseInt(stripQuotes(at("고시가격")), 10);
  const ea = Number.parseFloat(stripQuotes(at("전용면적")));
  const sa = Number.parseFloat(stripQuotes(at("공유면적")));
  if (!Number.isFinite(p) || !Number.isFinite(ea) || !Number.isFinite(sa)) return null;

  const ho = restoreHoAddress(at("상가건물호주소"));

  return {
    noticeDate,
    hoRestored: ho.restored,
    unit: {
      b,
      s,
      bn,
      jn,
      nm: normalizeText(at("상가건물블록주소")),
      dg: normalizeText(at("상가건물동주소")),
      fc,
      fl: normalizeText(at("상가건물층주소")),
      ho: ho.value,
      p,
      ea,
      sa,
      k,
    },
  };
}

/** 파티션 키 = 시군구 5자리. 법정동코드 앞 5자리. */
export function sigunguOf(bjdCode: string): string {
  return bjdCode.slice(0, 5);
}

/**
 * 물건 키 — 건물명·층구분 **필수 포함**.
 * 층구분 제외 시 0.370%, 건물명 제외 시 0.225%가 충돌한다(2021 전수 실측).
 * 적선현대빌딩 1층 1호는 지상 5,898,000원 / 지하 2,485,000원으로 단가가 2.4배 다르다.
 */
export function unitKey(u: StdPriceUnit): string {
  return `${u.nm}|${u.dg}|${u.fc}|${u.fl}|${u.ho}`;
}

/** 필지 키 — PNU 조인 4요소. */
export function parcelKey(u: StdPriceUnit): string {
  return `${u.b}|${u.s}|${u.bn}|${u.jn}`;
}

export interface DeploymentCandidate {
  /** 원본 파일명 (NFC 정규화된 것) */
  fileName: string;
  /** zip 내부 엔트리 최신 타임스탬프 (epoch ms). zip이 아니면 undefined */
  entryTimestamp?: number;
}

/**
 * 동일 고시일자 중복 배포본 채택 — 후행본 우선.
 *
 * ⚠️ **파일 mtime 금지**: mtime은 다운로드 시각이라 재다운로드 시 순서가 역전된다.
 *    오채택하면 2022년 지번 정정 104건이 유입되지 않아 PNU 조인이 깨진다.
 *
 * 판정 순서: 파일명의 기준일 표기 → zip 엔트리 타임스탬프 → 파일명 사전순(결정성 확보).
 */
export function pickAdoptedDeployment(
  candidates: readonly DeploymentCandidate[],
): { adopted: DeploymentCandidate; superseded: DeploymentCandidate[] } {
  const sorted = [...candidates].sort((a, b) => {
    const da = extractBaseDateFromFileName(a.fileName);
    const db = extractBaseDateFromFileName(b.fileName);
    if (da && db && da !== db) return db.localeCompare(da);
    const ta = a.entryTimestamp ?? 0;
    const tb = b.entryTimestamp ?? 0;
    if (ta !== tb) return tb - ta;
    return a.fileName.localeCompare(b.fileName);
  });
  return { adopted: sorted[0], superseded: sorted.slice(1) };
}

/**
 * 파일명의 기준일 표기 → ISO. `2022년2월28일 기준` → `2022-02-28`. 없으면 null.
 * 이미 ISO인 입력(배포본 그룹 키)도 그대로 인식한다.
 */
export function extractBaseDateFromFileName(fileName: string): string | null {
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(fileName);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(fileName);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  const ymd = /(\d{4})(\d{2})(\d{2})/.exec(fileName);
  return ymd ? `${ymd[1]}-${ymd[2]}-${ymd[3]}` : null;
}

/** 원본 선두 바이트로 실체 판별. 확장자는 신뢰하지 않는다(실측: `.zip`인데 CSV). */
export function sniffKind(head: Buffer): "zip" | "text" {
  return head.length >= 4 &&
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    head[2] === 0x03 &&
    head[3] === 0x04
    ? "zip"
    : "text";
}
