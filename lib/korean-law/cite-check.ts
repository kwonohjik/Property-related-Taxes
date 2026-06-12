/**
 * 판례 생사 확인 (cite_check) — 후속 인용 역추적으로 변경·폐기 신호 감지.
 *
 * upstream: chrisryugj/korean-law-mcp v4.3 src/tools/cite-check.ts (한국형 Shepard's).
 *
 * 메커니즘 (2026-06-12 probe로 확인):
 *   reverse citation = lawSearch.do?target=prec&search=2&query=<사건번호>
 *   → search=2(본문 전문검색)로 그 사건번호를 본문에 인용한 후속 판례 목록.
 *   각 후속 판례(대법원) 본문에서 대상 사건번호 ±윈도우 내 변경·폐기 신호 정규식 스캔.
 *
 * ⚠ 정확성 원칙(법령 정확성 최우선): 휴리스틱이므로 "폐기됨" 단정 금지.
 *    status는 "검토 필요"의 위계로만 표현하고, 근거 후속 판례를 함께 제시한다.
 */

import { getDecisionText } from "./client";
import { LawApiError, fetchJson, readCache, safeCacheKey, toArray, writeCache } from "./client-core";
import type { ChangeSignal, CiteCheckResult, CiteCheckStatus, CitingCase } from "./types";

// ────────────────────────────────────────────────────────────────────────────
// 1. 순수 함수 — 신호 스캔 (upstream CHANGE_PATTERNS)
// ────────────────────────────────────────────────────────────────────────────

export const CHANGE_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /변경하기로\s*(?:한다|하면서|함|하였)/, label: "판례 변경 선언" },
  { re: /폐기하기로|폐기한다|폐기되었/, label: "판례 폐기 선언" },
  { re: /더\s*이상\s*유지(?:될\s*수\s*없|하기\s*어렵)/, label: "선례 유지 불가 판시" },
  { re: /배치되는\s*범위\s*에?서?\s*(?:이를\s*)?(?:모두\s*)?변경/, label: "저촉 범위 변경" },
];

const WINDOW = 250;

/**
 * 후속 판례 본문에서 대상 사건번호 주변(±WINDOW)의 변경·폐기 신호 스캔.
 * 대상 사건번호를 언급하지 않으면(본문검색 노이즈) 신호 없음 처리.
 */
export function scanForChangeSignals(
  text: string,
  targetCaseNo: string
): { label: string; excerpt: string } | null {
  if (!text || !targetCaseNo) return null;
  const flat = text.replace(/\s+/g, " ");
  const idx = flat.indexOf(targetCaseNo);
  if (idx < 0) return null;

  const from = Math.max(0, idx - WINDOW);
  const to = Math.min(flat.length, idx + targetCaseNo.length + WINDOW);
  const windowText = flat.slice(from, to);

  for (const { re, label } of CHANGE_PATTERNS) {
    const m = re.exec(windowText);
    if (m) {
      const center = m.index;
      const exFrom = Math.max(0, center - 60);
      const exTo = Math.min(windowText.length, center + 80);
      return { label, excerpt: windowText.slice(exFrom, exTo).trim() };
    }
  }
  return null;
}

/** 전원합의체 판례 여부 */
export function isEnBanc(title: string, judgmentType?: string): boolean {
  return /전원합의체|전합/.test(`${title} ${judgmentType ?? ""}`);
}

/**
 * 사건번호 정규화 — 출처별 표기 차 흡수.
 * "2021두59908" / "대법원-2021-두-59908" / "부산고등법원(울산)-2021-누-10817"
 *   → "2021두59908" / "2021누10817".
 * 자기 자신 제외·중복 제거 비교용.
 */
export function normalizeCaseNo(s: string): string {
  const flat = (s ?? "").replace(/\s/g, "");
  const m = flat.match(/(\d{2,4})-?([가-힣]{1,2})-?(\d{1,7})/);
  return m ? `${m[1]}${m[2]}${m[3]}` : flat;
}

/**
 * 본문(전문) 제공 판례인지 — DRF prec는 데이터출처가 "대법원"인 것만 본문 JSON을 제공.
 * "국세법령정보시스템" 등 하급심 출처는 본문 미제공(링크만) → 스캔 대상에서 제외.
 */
export function hasFullTextSource(source: string): boolean {
  return /대법원/.test(source);
}

/** status 판정 (단정 금지 위계) */
export function decideStatus(
  signals: ChangeSignal[],
  enBancUnscanned: CitingCase[],
  citingCount: number
): CiteCheckStatus {
  if (signals.length > 0) return "review_needed";
  if (enBancUnscanned.length > 0) return "review_needed";
  if (citingCount > 0) return "no_signal";
  return "no_citations";
}

// ────────────────────────────────────────────────────────────────────────────
// 2. fetch — reverse citation (search=2 본문검색)
// ────────────────────────────────────────────────────────────────────────────

interface PrecSearchEntry {
  사건번호?: string;
  사건명?: string;
  법원명?: string;
  선고일자?: string;
  판결유형?: string;
  /** 본문 조회 ID (검색 응답 실제 필드명 — probe 확인) */
  판례일련번호?: string;
  /** "대법원" | "국세법령정보시스템" 등 */
  데이터출처명?: string;
}

/** 대상 사건번호를 본문에 인용한 후속 판례 목록 (대상 자신 제외) */
export async function findCitingCases(caseNo: string, display = 50): Promise<CitingCase[]> {
  const cacheKey = `citing_${safeCacheKey(caseNo)}_${display}`;
  const cached = await readCache<CitingCase[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchJson<{
    PrecSearch?: { prec?: PrecSearchEntry | PrecSearchEntry[] };
  }>("lawSearch.do", {
    target: "prec",
    search: "2", // 본문 전문검색 — reverse citation
    query: caseNo,
    display: String(display),
  });

  const arr = toArray(data.PrecSearch?.prec);
  const target = normalizeCaseNo(caseNo);
  // 정규화 사건번호 기준 중복 제거 — 같은 판례가 대법원·국세 두 출처로 중복 등장.
  // 본문 제공(대법원) 출처를 우선 보존.
  const byNorm = new Map<string, CitingCase>();
  for (const p of arr) {
    const norm = normalizeCaseNo(p.사건번호 ?? "");
    if (!norm || norm === target) continue; // 대상 자신(표기 무관) 제외
    const source = p.데이터출처명 ?? "";
    const title = p.사건명 ?? "";
    const entry: CitingCase = {
      caseNo: p.사건번호 ?? "",
      title,
      court: p.법원명 || source,
      date: p.선고일자 ?? "",
      isEnBanc: isEnBanc(title, p.판결유형),
      id: p.판례일련번호 ?? "",
      hasFullText: hasFullTextSource(source),
    };
    const prev = byNorm.get(norm);
    if (!prev || (!prev.hasFullText && entry.hasFullText)) byNorm.set(norm, entry);
  }
  const out = [...byNorm.values()];
  await writeCache(cacheKey, out);
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// 3. 오케스트레이션
// ────────────────────────────────────────────────────────────────────────────

/** 본문 스캔할 대법원 후속 판례 상한 (API 호출 제어) */
const MAX_SCAN = 6;

/**
 * 판례 생사 확인 — 후속 인용 + 변경·폐기 신호 스캔.
 *
 * @throws LawApiError 사건번호 형식 오류
 */
export async function checkPrecedentStatus(caseNoInput: string): Promise<CiteCheckResult> {
  const caseNo = caseNoInput.trim();
  if (!caseNo) {
    throw new LawApiError("사건번호를 입력하세요.", "BAD_REQUEST");
  }

  const citing = await findCitingCases(caseNo);
  const citingCount = citing.length;

  // 대법원 본문 제공 후속 판례 우선(전원합의체 먼저) 스캔.
  const scannable = citing
    .filter((c) => c.hasFullText && c.id)
    .sort((a, b) => Number(b.isEnBanc) - Number(a.isEnBanc));

  const signals: ChangeSignal[] = [];
  let scannedCount = 0;
  const scannedIds = new Set<string>();

  for (const c of scannable.slice(0, MAX_SCAN)) {
    scannedIds.add(c.id);
    try {
      const text = await getDecisionText(c.id, "prec", { full: true });
      scannedCount++;
      const body = text ? `${text.reasoning ?? ""} ${text.holdings ?? ""} ${text.summary ?? ""}` : "";
      const hit = scanForChangeSignals(body, caseNo);
      if (hit) {
        signals.push({
          citingCaseNo: c.caseNo,
          citingDate: c.date,
          label: hit.label,
          excerpt: hit.excerpt,
        });
      }
    } catch {
      // 본문 조회 실패는 무시 (graceful) — 미스캔으로 남김
    }
  }

  // 전원합의체인데 스캔 못한 것 (본문 미제공 또는 상한 초과) → 수동 확인 권장 대상
  const enBancUnscanned = citing.filter((c) => c.isEnBanc && !scannedIds.has(c.id));

  const status = decideStatus(signals, enBancUnscanned, citingCount);

  return { caseNo, citingCount, scannedCount, signals, enBancUnscanned, status };
}
