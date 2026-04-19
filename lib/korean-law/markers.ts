/**
 * 섹션 상태 마커 표준 (원본 MCP korean-law-mcp v3.5.4 이식)
 *
 * 섹션·시나리오·별표 본문 변환이 실패·누락·환각 위험 상태일 때
 * 머신 파싱 가능한 구조적 프리픽스(`[NOT_FOUND]` 등)와 사람용 경고 배너를
 * 한 소스에서 관리해 LLM 이 실패 섹션을 실존 내용으로 추측/보완하지 못하도록 한다.
 *
 * UI(SectionView)는 `tag` 문자열 매칭으로 아이콘·배경 클래스를 선택한다.
 * 하위호환: 기존 `[NOT_FOUND]`, `[FAILED]`, `[TIMEOUT]` 문자열은 그대로 사용.
 */
export interface MarkerMeta {
  /** 머신 파싱용 프리픽스 (항상 대괄호 포함) */
  tag: string;
  /** 사람이 읽는 배너 텍스트 */
  banner: string;
  /** LLM용 추측 금지 경고문 (배너 뒤에 이어 붙여 사용) */
  llmWarning: string;
  /** 아이콘 이모지 */
  icon: string;
  /** Tailwind 배경/테두리 클래스 */
  bgClass: string;
  /** 보조 텍스트 색상 클래스 */
  textClass: string;
}

export const MARKERS = {
  NOT_FOUND: {
    tag: "[NOT_FOUND]",
    banner: "해당 조회 결과 없음",
    llmWarning: "LLM은 이 섹션의 내용을 추측·생성하지 마세요.",
    icon: "🔍",
    bgClass: "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/20",
    textClass: "text-zinc-800 dark:text-zinc-200",
  },
  HALLUCINATION_DETECTED: {
    tag: "[HALLUCINATION_DETECTED]",
    banner: "존재하지 않는 조문/판례가 인용되었습니다",
    llmWarning: "LLM 출력을 추가 검증 없이 사용하지 마세요.",
    icon: "⚠️",
    bgClass: "border-amber-400 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-900/15",
    textClass: "text-amber-900 dark:text-amber-200",
  },
  TIMEOUT: {
    tag: "[TIMEOUT]",
    banner: "조회 시간 초과",
    llmWarning: "LLM은 추측으로 내용을 보충하지 마세요.",
    icon: "⏱️",
    bgClass: "border-orange-300 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-900/15",
    textClass: "text-orange-900 dark:text-orange-200",
  },
  FAILED: {
    tag: "[FAILED]",
    banner: "섹션 조회 실패",
    llmWarning: "LLM은 내용을 추측/생성하지 마세요.",
    icon: "❌",
    bgClass: "border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-900/15",
    textClass: "text-red-900 dark:text-red-200",
  },
  NOT_CONVERTED: {
    tag: "[NOT_CONVERTED]",
    banner: "본문 변환 실패 — 원본 파일 다운로드 필요",
    llmWarning: "LLM은 별표 본문을 추측하지 마세요.",
    icon: "📎",
    bgClass: "border-sky-300 bg-sky-50 dark:border-sky-900/50 dark:bg-sky-900/15",
    textClass: "text-sky-900 dark:text-sky-200",
  },
} as const satisfies Record<string, MarkerMeta>;

export type MarkerKey = keyof typeof MARKERS;

/** tag(또는 이를 포함하는 메시지)에서 MarkerMeta 를 역조회. 미매칭 시 null. */
export function findMarker(text: string | undefined | null): MarkerMeta | null {
  if (!text) return null;
  for (const m of Object.values(MARKERS)) {
    if (text.includes(m.tag)) return m;
  }
  return null;
}

/** 표준 메시지 조립: `[TAG] icon banner — llmWarning. (상세)` */
export function formatMarkerMessage(key: MarkerKey, detail?: string): string {
  const m = MARKERS[key];
  const tail = detail ? ` — ${detail}` : "";
  return `${m.tag} ${m.icon} ${m.banner}. ${m.llmWarning}${tail}`;
}
