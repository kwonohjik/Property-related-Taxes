/**
 * 체인 워크플로 오케스트레이터 (8종)
 *
 * korean-law-mcp의 8개 chain 도구(`chain_full_research` 등)를 로컬 서버에서
 * LLM 없이 다단계 API 호출만으로 재현한다. 각 체인은 결과를 섹션 배열로 반환하며
 * UI는 섹션 kind에 따라 카드 레이아웃을 선택한다.
 *
 * 부동산 세법 리서치에 가치 있는 체인 4개(full_research, law_system,
 * action_basis, document_review)는 전체 구현하고 나머지 4개는 최소 구조로
 * 스켈레톤 구현한다(사용자가 향후 Phase 2에서 보강).
 *
 * 2026-04-18 업데이트: 부분 실패 시 `[NOT_FOUND]`·`[FAILED]` 마커 섹션으로
 * 대체하는 `secOrSkip()` 헬퍼 도입 (upstream 이식). LLM이 실패 섹션을 실존
 * 내용으로 추측하는 것을 방지.
 */

import {
  searchLaw,
  searchLawMany,
  searchDecisions,
  getAnnexes,
} from "./client";
import { verifyCitations } from "./verify-citations";
import { detectScenarios, runScenarios } from "./scenarios";
import { formatMarkerMessage } from "./markers";
import type {
  ChainInput,
  ChainResult,
  ChainSection,
  ChainType,
  DecisionSearchPage,
} from "./types";

type Runner = (input: ChainInput) => Promise<ChainSection[]>;

// ────────────────────────────────────────────────────────────────────────────
// 부분 실패 허용 헬퍼
// ────────────────────────────────────────────────────────────────────────────

/**
 * 섹션 빌더를 에러 안전하게 실행. 실패 시 [FAILED] 마커 섹션 반환.
 *
 * upstream: src/tools/chains.ts:secOrSkip. LLM이 실패 섹션을 실존 내용으로
 * 추측/생성하지 않도록 명시적 배너 삽입.
 *
 * notFoundIfEmpty: true(기본)면 결과 배열이 비어있을 때 [NOT_FOUND] 섹션 반환.
 */
/**
 * 섹션 타임아웃 (ms). 개별 섹션이 이 값보다 오래 걸리면 [TIMEOUT] 마커 섹션 반환.
 * Next.js route maxDuration(30s) 내에 모든 병렬 섹션이 완료되도록 보호.
 */
const SECTION_TIMEOUT_MS = 12_000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`섹션 타임아웃(${ms}ms)`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export async function secOrSkip(
  heading: string,
  builder: () => Promise<ChainSection | null>,
  options: { notFoundIfEmpty?: boolean } = {}
): Promise<ChainSection> {
  const notFoundIfEmpty = options.notFoundIfEmpty ?? true;
  try {
    const sec = await withTimeout(builder(), SECTION_TIMEOUT_MS);
    if (!sec) {
      return {
        kind: "note",
        heading,
        note: formatMarkerMessage("NOT_FOUND", "이 섹션은 결과가 없습니다"),
      };
    }
    if (notFoundIfEmpty && isEmpty(sec)) {
      return {
        kind: "note",
        heading,
        note: formatMarkerMessage("NOT_FOUND", "이 섹션은 결과가 없습니다"),
      };
    }
    return sec;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = /타임아웃/.test(msg);
    return {
      kind: "note",
      heading,
      note: isTimeout
        ? formatMarkerMessage("TIMEOUT", `${SECTION_TIMEOUT_MS}ms 내 응답 없음`)
        : formatMarkerMessage("FAILED", `사유: ${msg}`),
    };
  }
}

function isEmpty(sec: ChainSection): boolean {
  switch (sec.kind) {
    case "laws":      return !sec.laws || sec.laws.length === 0;
    case "articles":  return !sec.articles || sec.articles.length === 0;
    case "decisions": return !sec.decisions || sec.decisions.length === 0;
    case "annexes":   return !sec.annexes || sec.annexes.length === 0;
    case "citations": return !sec.citations || sec.citations.length === 0;
    case "note":      return !sec.note;
    default:          return false;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 체인 1. 전체 리서치 (법령 검색 + 판례 검색 병렬)
// ────────────────────────────────────────────────────────────────────────────

const fullResearch: Runner = async ({ query }) => {
  return Promise.all([
    secOrSkip("관련 법령", async () => ({
      kind: "laws",
      heading: "관련 법령",
      laws: await searchLawMany(query, 5),
    })),
    secOrSkip("대법원 판례", async () => {
      const p: DecisionSearchPage = await searchDecisions(query, "prec", 1, 5);
      return { kind: "decisions", heading: "대법원 판례", decisions: p.items };
    }),
    secOrSkip("법령해석례", async () => {
      const p: DecisionSearchPage = await searchDecisions(query, "detc", 1, 5);
      return { kind: "decisions", heading: "법령해석례", decisions: p.items };
    }),
  ]);
};

// ────────────────────────────────────────────────────────────────────────────
// 체인 2. 법령 체계 (현재 API 한계: 상·하위 체계 추정 검색)
// ────────────────────────────────────────────────────────────────────────────

const lawSystem: Runner = async ({ query }) => {
  const main = await searchLaw(query).catch(() => null);
  if (!main) {
    return [
      {
        kind: "note",
        heading: "법령 없음",
        note: formatMarkerMessage(
          "NOT_FOUND",
          `'${query}' 에 해당하는 법령을 찾지 못했습니다`
        ),
      },
    ];
  }
  const [enforcementSec, regulationSec] = await Promise.all([
    secOrSkip("시행령", async () => ({
      kind: "laws",
      heading: "시행령",
      laws: await searchLawMany(`${main.lawName} 시행령`, 1),
    })),
    secOrSkip("시행규칙", async () => ({
      kind: "laws",
      heading: "시행규칙",
      laws: await searchLawMany(`${main.lawName} 시행규칙`, 1),
    })),
  ]);
  return [
    { kind: "laws", heading: "본법", laws: [main] },
    enforcementSec,
    regulationSec,
  ];
};

// ────────────────────────────────────────────────────────────────────────────
// 체인 3. 처분 근거 (법령 + 판례 + 행정규칙)
// ────────────────────────────────────────────────────────────────────────────

const actionBasis: Runner = async ({ query }) => {
  return Promise.all([
    secOrSkip("근거 법령", async () => ({
      kind: "laws",
      heading: "근거 법령",
      laws: await searchLawMany(query, 3),
    })),
    secOrSkip("관련 판례", async () => {
      const p = await searchDecisions(query, "prec", 1, 5);
      return { kind: "decisions", heading: "관련 판례", decisions: p.items };
    }),
    secOrSkip("행정규칙", async () => {
      const p = await searchDecisions(query, "admrul", 1, 5);
      return { kind: "decisions", heading: "행정규칙", decisions: p.items };
    }),
  ]);
};

// ────────────────────────────────────────────────────────────────────────────
// 체인 4. 분쟁 대응 (헌재 + 조세심판 + 국민권익위)
// ────────────────────────────────────────────────────────────────────────────

const disputePrep: Runner = async ({ query }) => {
  return Promise.all([
    secOrSkip("대법원 판례", async () => {
      const p = await searchDecisions(query, "prec", 1, 5);
      return { kind: "decisions", heading: "대법원 판례", decisions: p.items };
    }),
    secOrSkip("헌재결정례", async () => {
      const p = await searchDecisions(query, "expc", 1, 5);
      return { kind: "decisions", heading: "헌재결정례", decisions: p.items };
    }),
    secOrSkip("조세심판원", async () => {
      const p = await searchDecisions(query, "ppc", 1, 5);
      return { kind: "decisions", heading: "조세심판원", decisions: p.items };
    }),
    secOrSkip("국민권익위", async () => {
      const p = await searchDecisions(query, "oia", 1, 3);
      return { kind: "decisions", heading: "국민권익위", decisions: p.items };
    }),
  ]);
};

// ────────────────────────────────────────────────────────────────────────────
// 체인 5. 개정 추적 (현재 단일 법령의 공포일만 제공 — Phase 2에서 확장)
// ────────────────────────────────────────────────────────────────────────────

const amendmentTrack: Runner = async ({ query }) => {
  return [
    await secOrSkip("공포 이력 (최신 5건)", async () => ({
      kind: "laws",
      heading: "공포 이력 (최신 5건)",
      laws: await searchLawMany(query, 5),
    })),
    await secOrSkip("관련 판례 타임라인", async () => {
      const p = await searchDecisions(query, "prec", 1, 5);
      return { kind: "decisions", heading: "관련 판례 타임라인", decisions: p.items };
    }),
    {
      kind: "note",
      heading: "안내",
      note: "개정 전문 대조는 Phase 2에서 제공 예정. 현재는 공포일자 기준 최신 순 목록.",
    },
  ];
};

// ────────────────────────────────────────────────────────────────────────────
// 체인 6. 자치법규 비교
// ────────────────────────────────────────────────────────────────────────────

const ordinanceCompare: Runner = async ({ query }) => {
  return [
    await secOrSkip("자치법규", async () => {
      const p = await searchDecisions(query, "ordin", 1, 10);
      return { kind: "decisions", heading: "자치법규", decisions: p.items };
    }),
  ];
};

// ────────────────────────────────────────────────────────────────────────────
// 체인 7. 행정절차 + 서식
// ────────────────────────────────────────────────────────────────────────────

const procedureDetail: Runner = async ({ query }) => {
  const lawsSection = await secOrSkip("근거 법령", async () => ({
    kind: "laws",
    heading: "근거 법령",
    laws: await searchLawMany(query, 3),
  }));

  const sections: ChainSection[] = [lawsSection];

  // 첫 법령의 별표 조회 (lawsSection이 성공한 경우만)
  const firstLaw = lawsSection.kind === "laws" ? lawsSection.laws?.[0] : undefined;
  if (firstLaw) {
    sections.push(
      await secOrSkip(`${firstLaw.lawName} 별표·서식`, async () => ({
        kind: "annexes",
        heading: `${firstLaw.lawName} 별표·서식`,
        annexes: await getAnnexes(firstLaw.lawName),
      }))
    );
  }

  sections.push(
    await secOrSkip("행정규칙", async () => {
      const p = await searchDecisions(query, "admrul", 1, 5);
      return { kind: "decisions", heading: "행정규칙", decisions: p.items };
    })
  );

  return sections;
};

// ────────────────────────────────────────────────────────────────────────────
// 체인 8. 문서 인용 검증 (verify-citations 모듈로 위임)
// ────────────────────────────────────────────────────────────────────────────

const documentReview: Runner = async ({ rawText }) => {
  if (!rawText) {
    return [{ kind: "note", heading: "입력 필요", note: "검증할 텍스트를 rawText 필드에 포함하세요." }];
  }

  const result = await verifyCitations(rawText);

  const citations = result.citations.map((c) => ({
    raw: c.raw,
    valid: c.status === "verified",
    lawName: c.lawName,
    articleNo: c.articleNo,
    reason:
      c.status === "verified"
        ? undefined
        : c.reason ?? (c.status === "not_found" ? "환각 감지 (존재하지 않음)" : "확인 실패"),
  }));

  const statusNote = result.isError
    ? `${result.header} — ⚠️ 존재하지 않는 조문이 인용되었습니다. LLM 출력은 추가 검증 없이 사용하지 마세요.`
    : `${result.header} — ${result.summary}`;

  return [
    { kind: "note", heading: "검증 결과 요약", note: statusNote },
    {
      kind: "citations",
      heading: `인용 검증 (${result.verifiedCount}/${result.totalCount} 실존)`,
      citations,
    },
  ];
};

// ────────────────────────────────────────────────────────────────────────────
// 디스패처
// ────────────────────────────────────────────────────────────────────────────

const RUNNERS: Record<ChainType, Runner> = {
  full_research:     fullResearch,
  law_system:        lawSystem,
  action_basis:      actionBasis,
  dispute_prep:      disputePrep,
  amendment_track:   amendmentTrack,
  ordinance_compare: ordinanceCompare,
  procedure_detail:  procedureDetail,
  document_review:   documentReview,
};

export async function runChain(input: ChainInput): Promise<ChainResult> {
  const runner = RUNNERS[input.type];
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const sections = await runner(input);

  // 시나리오 자동 탐지 & 부착 (세법 실무 확장)
  const scenarios = detectScenarios(input.type, {
    query: input.query,
    rawText: input.rawText,
  });
  if (scenarios.length > 0) {
    const scenarioSections = await runScenarios(
      input.type,
      { query: input.query, rawText: input.rawText },
      scenarios
    );
    sections.push(...scenarioSections);
  }

  return {
    chainType: input.type,
    query: input.query,
    startedAt,
    elapsedMs: Date.now() - t0,
    sections,
  };
}
