/**
 * 토지·건물 별개 취득(split) 결과 표시 — 상세명세서 취득가액·필요경비 행 산식 + 집계 소제목 (Phase C UI).
 *
 * **순수 문자열 파생**(JSX 없음, `mixed-use-separate-acq-text.ts`와 같은 규약). 입력은 엔진 echo
 * (`splitDetail` · `assetCards[].acquisitionMode` · `filingDisplay`)뿐이고 값을 새로 계산하지 않는다 —
 * 합은 엔진 leaf `summarizeSplitGain`이 낸 값을 그대로 쓴다(재도출 금지, 신고서·카드·step 문구와 한 정의).
 *
 * ⚠️ 문구에 `숫자 / 숫자`를 쓰지 않는다 — `FormulaText`가 분수로 치환한다.
 * 설계: docs/02-design/features/transfer-split-acq-result-display.ui.design.md §3
 */
import { baseCardId, isSameShare } from "@/lib/tax-engine/general-building-share-id";
import {
  splitAcqModeLabel,
  splitAcqBasisFormula,
  splitAcqBasisView,
  splitCauseLabel,
  splitRateBasisNote,
  SPLIT_CAUSE_VALUE_LABEL,
  summarizeSplitGain,
  type SplitAcqMode,
  type SplitGainPartSummary,
} from "@/lib/tax-engine/transfer-tax-split-display";
import type { GeneralBuildingOutput } from "@/lib/tax-engine/types/general-building.types";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { SplitGainResult } from "@/lib/tax-engine/types/transfer-split-gain.types";

const fmt = (n: number) => n.toLocaleString();

/**
 * 개산공제율 표기 — `0.03 → "3%"` · `0.003 → "0.3%"` · `0.01 → "1%"`.
 * 율을 문자열로 박지 않는다(미등기 3/1000 · §163⑥4호 1/100에서 등식이 거짓이 된다). 율이 없으면 「개산공제율」.
 */
export function formatLumpRate(rate: number | undefined): string {
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) return "개산공제율";
  return `${Number((rate * 100).toFixed(4))}%`;
}

/**
 * 「토지(실거래가)」 — 모드 echo가 없는 구 이력은 라벨 없이 「토지」.
 * 원인이 다르고(`mixedCause`) 그 파트가 상속·증여면 입력 화면 라벨과 같은 어휘로 「토지(상속개시일 평가액)」(D1-3) ·
 * 건물이 상속·증여면 「건물(상속개시일 평가액)」(D2 — 같은 파트 중립 상수).
 */
function partTag(p: SplitGainPartSummary, mixedCause: boolean): string {
  // D1-4 — 영 §163⑨ 단서 1호 비교가 적용된 파트는 **채택된 쪽** 이름을 쓴다(② 채택인데 「평가액」이라 적으면 거짓 라벨).
  const basis = splitAcqBasisView(p);
  if (basis) return `${p.label}(${basis.adoptedLabel})`;
  const cause = p.acquisitionCause;
  if (mixedCause && (cause === "inheritance" || cause === "gift")) return `${p.label}(${SPLIT_CAUSE_VALUE_LABEL[cause]})`;
  return p.mode ? `${p.label}(${splitAcqModeLabel(p.mode)})` : p.label;
}

/**
 * 상세명세서 「취득일자」 행에 붙이는 파트별 원인·취득일·세율 기산일 한 줄(D1-3) — 원인이 같으면 `undefined`(종전 문구 그대로).
 * 예: `토지 상속 2025-02-01 · 세율 기산일 2018-03-02 (피상속인 취득일 …) / 건물 매매 2018-03-02 · 세율 기산일 2018-03-02 (취득일 — …)`
 */
export function splitCauseDateText(sd: SplitGainResult | undefined): string | undefined {
  if (!sd) return undefined;
  const s = summarizeSplitGain(sd);
  if (!s.mixedCause) return undefined;
  return s.parts
    .map((p) => {
      const head = `${p.label} ${splitCauseLabel(p.acquisitionCause!)} ${p.acquisitionDate ?? "-"}`;
      // 세율 기산일은 엔진이 파트별로 판정했을 때만(`rateBasisShown`) — 자산 단위 세율이면 계산과 어긋난다.
      if (!s.rateBasisShown) return head;
      const note = splitRateBasisNote(p, sd.building.acquisitionCause);
      return `${head} · 세율 기산일 ${p.appliedRateBasisDate ?? "-"}${note ? ` (${note})` : ""}`;
    })
    .join(" / ");
}

/**
 * 상세명세서 「취득가액」 행 산식 — `토지(실거래가) A + 건물(환산취득가) B`.
 *
 * 각 항은 엔진이 **실제로 차감한** 값이다(§97②2호 단서 swap 파트는 0 — 신고서 합계 열과 같은 정의).
 * 글자 그대로 더하면 행 값이 나온다. 소유 파트만 싣는다(소유자 분리).
 */
export function splitAcqFormulaText(sd: SplitGainResult | undefined): string | undefined {
  if (!sd) return undefined;
  const s = summarizeSplitGain(sd);
  if (s.parts.length === 0) return undefined;
  const body = s.parts.map((p) => `${partTag(p, s.mixedCause)} ${fmt(p.acquisitionDeducted)}`).join(" + ");
  const swapped = s.parts.filter((p) => p.swapApplied);
  const swapNote =
    swapped.length > 0
      ? ` ※ ${swapped.map((p) => `${p.label} 취득가액 ${fmt(p.acquisitionPrice)}`).join(" · ")}은(는) 「소득세법」 §97②2호 단서에 따라 차감하지 않고 자본적지출·양도비를 필요경비로 적용합니다`
      : "";
  // D1-4 — 평가액 vs 영 §164④ 가액 비교가 적용된 토지 파트는 두 값과 채택을 한 줄로 밝힌다(카드·신고서·PDF와 같은 문장).
  const basisPart = s.parts.find((p) => splitAcqBasisView(p));
  const basisNote = basisPart ? ` ※ ${splitAcqBasisFormula(splitAcqBasisView(basisPart)!)} (소득세법 시행령 §163조 제9항 단서 1호)` : "";
  return `${body} — 토지·건물 파트별 산정 (소득세법 §97①1호 가목·나목)${swapNote}${basisNote}`;
}

/**
 * 상세명세서 「필요경비」 행 산식 — 파트별 자본적지출·양도비 + 개산공제.
 *
 * 개산공제 파트(환산취득가·감정가액·매매사례가액)도 swap 파트도 없으면 `undefined` — 호출부가 종전 문구(양도비 등)를 유지한다.
 * base·율은 엔진 echo(`lumpDeductionBase`·`lumpDeductionRate`)를 읽는다. 율 echo가 없는 구 이력은 호출부가 폼에서
 * 산출한 `fallbackRate`(엔진 leaf `estimatedDeductionRate`)를 쓴다.
 */
export function splitExpenseText(sd: SplitGainResult | undefined, fallbackRate?: number): string | undefined {
  if (!sd) return undefined;
  const s = summarizeSplitGain(sd);
  if (!s.parts.some((p) => p.appraisalDeduction > 0 || p.swapApplied)) return undefined;
  const items: string[] = [];
  for (const p of s.parts) {
    const raw = sd[p.key];
    if (p.directExpenses > 0) {
      items.push(
        `${p.label} 자본적지출·양도비 ${fmt(p.directExpenses)}${p.swapApplied ? " (§97②2호 단서 — 취득가액·개산공제 대신 적용)" : ""}`,
      );
    }
    if (p.appraisalDeduction > 0) {
      const base = raw.lumpDeductionBase ?? raw.stdPriceAtAcq;
      const rate = raw.lumpDeductionRate ?? fallbackRate;
      items.push(
        base != null
          ? `${p.label} 개산공제 ${fmt(p.appraisalDeduction)} (취득시 기준시가 ${fmt(base)} × ${formatLumpRate(rate)})`
          : `${p.label} 개산공제 ${fmt(p.appraisalDeduction)}`,
      );
    }
  }
  if (items.length === 0) return undefined;
  return `필요경비 ${fmt(s.necessaryExpense)} = ${items.join(" + ")} — 소득세법 §97①·§97②2호·시행령 §163⑥`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 집계 소제목 (G-4) — 자산별 산정방식 집합
// ─────────────────────────────────────────────────────────────────────────────

const MODE_ORDER: SplitAcqMode[] = ["actual", "estimated", "appraisal", "salesCase"];

/**
 * 집계 자산들의 취득가액 산정방식 집합 — **응답에 실재하는 echo 세 종**에서 파생한다(우선순위):
 *  1. `p.splitDetail` — 분리 자산의 소유 파트 `acqMode`
 *  2. 일반건물 `assetCards[]` 중 이 자산의 카드 `acquisitionMode`(구 이력은 `usedEstimatedAcquisition`)
 *  3. `p.filingDisplay.estimatedBase` 실재 + swap 아님 — 평범한 환산 자산(`FilingFormTableAggregateHelpers`의 규칙과 같다)
 *  4. 그 밖 → 실거래가
 * 어댑터가 상수로 내리던 `usedEstimatedAcquisition:false`로는 환산 자산을 잡지 못했다.
 */
export function aggregateAcqModes(
  properties: PerPropertyBreakdown[],
  gb: GeneralBuildingOutput | undefined,
): Set<SplitAcqMode> {
  const modes = new Set<SplitAcqMode>();
  for (const p of properties) {
    if (p.splitDetail) {
      for (const part of summarizeSplitGain(p.splitDetail).parts) modes.add(part.mode ?? "actual");
      continue;
    }
    const card = gb?.assetCards.find(
      (c) => baseCardId(c.propertyId) === baseCardId(p.propertyId) && isSameShare(c.propertyId, p.propertyId),
    );
    if (card) {
      modes.add(card.acquisitionMode ?? (card.usedEstimatedAcquisition ? "estimated" : "actual"));
      continue;
    }
    const fd = p.filingDisplay;
    modes.add(fd?.estimatedBase !== undefined && !fd.swapApplied ? "estimated" : "actual");
  }
  return modes;
}

/** 전부 환산취득가인가 — 집계 어댑터가 단일 `usedEstimatedAcquisition` 플래그를 채울 때만 쓴다(자산이 없으면 false). */
export function allEstimated(modes: Set<SplitAcqMode>): boolean {
  return modes.size === 1 && modes.has("estimated");
}

const MIXED_LAW = "소득세법 §97①1호 가목·나목";

/** 취득가액 집계 소제목 — 전부 실거래가/전부 환산취득가는 종전 문구, 그 밖은 산정방식을 밝힌다. 자산이 없으면 `undefined`. */
export function aggregateAcqHeading(modes: Set<SplitAcqMode>): string | undefined {
  if (modes.size === 0) return undefined;
  if (modes.size === 1 && modes.has("actual")) return "자산별 실제 거래가액 합계 (자본적지출은 필요경비 — §97① 2호)";
  if (modes.size === 1 && modes.has("estimated")) return "자산별 환산취득가 합계 — 시행령 §163·§176의2②";
  const names = MODE_ORDER.filter((m) => modes.has(m)).map(splitAcqModeLabel).join("·");
  return `자산별 취득가액 합계 (산정방식: ${names} — 자산·파트별로 다름, ${MIXED_LAW})`;
}

/** 필요경비 집계 소제목 — 위와 같은 규칙. */
export function aggregateExpenseHeading(modes: Set<SplitAcqMode>): string | undefined {
  if (modes.size === 0) return undefined;
  if (modes.size === 1 && modes.has("actual")) return "자산별 양도비 합계 (중개수수료·법무사 비용 등) — §97① 나목";
  if (modes.size === 1 && modes.has("estimated")) return "자산별 개산공제·양도비 합계 — §97① 나목·시행령 §163⑥";
  const parts: string[] = [];
  if (modes.has("actual")) parts.push("실거래가 파트는 자본적지출·양도비");
  if ([...modes].some((m) => m !== "actual")) parts.push("환산취득가·감정가액·매매사례가액 파트는 개산공제");
  return `자산별 필요경비 합계 (${parts.join(", ")} — 소득세법 §97②2호·시행령 §163⑥)`;
}
