/**
 * 겸용주택 별개 취득 파트 모델(B1) — 결과 표시용 **순수 문자열 파생**(JSX 없음).
 *
 * 신고서 4열 열별 주석·상세 계산 명세서 취득가액/필요경비 행이 같은 문장을 쓴다. 입력은 엔진 echo
 * (`breakdown.separateAcquisition`)뿐이다 — 값을 다시 계산하지 않는다(재도출 금지).
 * 엔진은 파트 모델에 새 `acquisitionConversionRoute`를 만들지 않으므로(`section97_direct`/`phd_corrected`),
 * 표시 분기는 **echo 유무가 route보다 먼저**여야 한다(실거래가 파트에 「환산취득가액」 거짓 라벨 방지).
 */
import type { PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";
import { splitAcqModeLabel } from "@/lib/tax-engine/transfer-tax-split-display";
import type {
  MixedUseGainBreakdown,
} from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { MixedPartKey } from "@/lib/tax-engine/types/transfer-mixed-use-part-acq.types";

/**
 * 산정방식 표시명 — 화면 라디오·신고서 열 주석·결과 카드가 같은 어휘를 쓴다.
 * 어휘의 **단일 소스는 엔진 leaf `splitAcqModeLabel`**(Phase C 결정 9 — 별개 취득 split 결과뷰와 겸용 결과뷰가 같은 문자열).
 */
export const sepAcqModeLabel: (mode: PartAcqMode) => string = splitAcqModeLabel;

const fmt = (n: number) => n.toLocaleString();

/** 신고서 4열의 취득가액 행 열별 주석 — 열마다 산정방식과 안분 근거를 밝힌다. echo가 없으면 `undefined`. */
export function separateAcqFilingNotes(
  mu: MixedUseGainBreakdown | undefined,
): Record<"housingLand" | "housingBuilding" | "commercialLand" | "commercialBuilding", string> | undefined {
  const echo = mu?.separateAcquisition;
  if (!echo) return undefined;
  const note = (key: MixedPartKey): string => {
    const part = echo.parts[key];
    const isLand = key.endsWith("Land");
    const mode = sepAcqModeLabel(part.mode);
    const proviso =
      echo.provisoGroup?.chosen === "direct" && echo.provisoGroup.parts.includes(isLand ? "land" : "building") && part.mode === "estimated"
        ? " · 소법 §97②2호 단서(자본적지출·양도비)"
        : "";
    if (part.mode === "estimated") return `${mode}${proviso}`;
    if (isLand) return `${mode} · 면적비 안분`;
    return echo.buildingSplit?.kind === "contract" ? `${mode} · 용도별 계약액` : `${mode} · 건물 기준시가 비율`;
  };
  return {
    housingLand: note("housingLand"),
    housingBuilding: note("housingBuilding"),
    commercialLand: note("commercialLand"),
    commercialBuilding: note("commercialBuilding"),
  };
}

/** 상세 계산 명세서 「취득가액」 행 산식 — 파트별 산정방식과 4부분 값. echo가 없으면 `undefined`. */
export function separateAcqFormulaText(mu: MixedUseGainBreakdown | undefined): string | undefined {
  const echo = mu?.separateAcquisition;
  if (!mu || !echo) return undefined;
  const p = echo.parts;
  const proviso =
    echo.provisoGroup?.chosen === "direct"
      ? " ※ 환산 파트는 「소득세법」 §97②2호 단서에 따라 환산취득가액을 차감하지 않고 자본적지출·양도비를 필요경비로 적용"
      : "";
  return (
    `토지(${sepAcqModeLabel(echo.landMode)}) 주택부수토지분 ${fmt(p.housingLand.acquisitionPrice)} + 상가부수토지분 ${fmt(p.commercialLand.acquisitionPrice)}` +
    ` + 건물(${sepAcqModeLabel(echo.buildingMode)}) 주택건물분 ${fmt(p.housingBuilding.acquisitionPrice)} + 상가건물분 ${fmt(p.commercialBuilding.acquisitionPrice)}` +
    ` — 토지·건물 취득일이 달라 파트별로 산정${proviso}`
  );
}

/** 상세 계산 명세서 「필요경비」 행 산식 — 파트별 실제 필요경비 / 개산공제. echo가 없으면 `undefined`. */
export function separateAcqExpenseText(mu: MixedUseGainBreakdown | undefined, total: number): string | undefined {
  const echo = mu?.separateAcquisition;
  if (!echo) return undefined;
  const parts = Object.values(echo.parts);
  const hasDeemed = parts.some((x) => x.deemedDeduction);
  const hasActual = parts.some((x) => !x.deemedDeduction);
  const body =
    hasDeemed && hasActual
      ? "실거래가 파트는 실제 필요경비(자본적지출·양도비), 감정가액·매매사례가액·환산취득가 파트는 개산공제(취득시 기준시가 × 율)"
      : hasDeemed
        ? "개산공제(취득시 기준시가 × 율)"
        : "실제 필요경비(자본적지출·양도비)";
  return `필요경비 ${fmt(total)} = ${body} 파트별 합계 — 소득세법 §97①·§97②2호·시행령 §163⑥`;
}
