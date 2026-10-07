"use client";

/**
 * 겸용주택 결과 — **별개 취득 파트 모델**(B1) 취득가액·양도차익 행.
 *
 * 엔진 echo `breakdown.separateAcquisition`을 **그대로 읽어** 풀어 쓴다(재도출 금지 — memory `feedback_aggregate_display_rederives_engine_value`).
 * 분기 순서가 중요하다: 엔진은 새 `acquisitionConversionRoute` 값을 만들지 않아 파트 모델도 route는 `section97_direct`/`phd_corrected`로 나온다.
 * 그래서 **echo 분기를 route 분기보다 먼저** 타야 한다 — 아니면 실거래가 파트에도 「환산취득가액」 거짓 라벨이 붙는다.
 *
 * 표기 규칙: 한국어 풀어쓰기 · 각 숫자 옆 변수명 라벨 · `floor` 묵시 · 중간 산술 미표시 · 산정방식(실거래가·환산취득가·감정가액·매매사례가액)을 파트마다 밝힌다.
 */
import type { ReactNode } from "react";
import type {
  MixedUseCommercialPart,
  MixedUseGainBreakdown,
  MixedUseHousingPart,
} from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { MixedUseSeparateAcquisitionEcho } from "@/lib/tax-engine/types/transfer-mixed-use-part-acq.types";
import type { PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";
import { sepAcqModeLabel } from "@/components/calc/results/mixed-use/mixed-use-separate-acq-text";
import { FLine, Frac, Row, fmt, fmtPlain } from "@/components/calc/results/mixed-use/MixedUseResultCardParts";

type Echo = MixedUseSeparateAcquisitionEcho;
type PartKind = "housing" | "commercial";

/** 가액 이름 — 감정은 「감정가액」, 매매사례는 「매매사례가액」, 그 밖은 「취득가액」. */
function valueName(mode: PartAcqMode): string {
  return mode === "appraisal" ? "감정가액" : mode === "salesCase" ? "매매사례가액" : "취득가액";
}

/** 토지 파트를 나눈 근거 — 면적비(같은 필지이므로 ㎡당 단가가 소거된다). 환산 파트는 근거가 별도(양도가액 비율). */
function landBasisFormula(echo: Echo, kind: PartKind): ReactNode {
  const part = echo.parts[kind === "housing" ? "housingLand" : "commercialLand"];
  const other = echo.parts[kind === "housing" ? "commercialLand" : "housingLand"];
  const total = part.acquisitionPrice + other.acquisitionPrice;
  const split = echo.landSplit;
  if (!split) return null;
  const mine = kind === "housing" ? split.housingArea : split.commercialArea;
  return (
    <FLine>
      토지 {valueName(echo.landMode)} {fmtPlain(total)} ×{" "}
      <Frac
        top={`${kind === "housing" ? "주택" : "상가"}부수토지 면적 ${mine.toFixed(2)}㎡`}
        bottom={`주택부수토지 ${split.housingArea.toFixed(2)}㎡ + 상가부수토지 ${split.commercialArea.toFixed(2)}㎡`}
      />{" "}
      (같은 필지라 토지 기준시가 비율 = 면적 비율)
    </FLine>
  );
}

/** 건물 파트를 나눈 근거 — 용도별 계약액 우선, 없으면 건물 취득일 기준시가 비율. */
function buildingBasisFormula(echo: Echo, kind: PartKind): ReactNode {
  const split = echo.buildingSplit;
  if (!split) return null;
  const mine = echo.parts[kind === "housing" ? "housingBuilding" : "commercialBuilding"];
  const other = echo.parts[kind === "housing" ? "commercialBuilding" : "housingBuilding"];
  const total = mine.acquisitionPrice + other.acquisitionPrice;
  if (split.kind === "contract") {
    return kind === "housing" ? (
      <FLine>건물 {valueName(echo.buildingMode)} {fmtPlain(total)} 중 주택건물 계약액 {fmtPlain(split.contract ?? 0)} (도급계약서·세금계산서)</FLine>
    ) : (
      <FLine>
        건물 {valueName(echo.buildingMode)} {fmtPlain(total)} − 주택건물 계약액 {fmtPlain(split.contract ?? 0)} (상가건물 계약액 = 총액에서 주택건물분을 뺀 값)
      </FLine>
    );
  }
  const hs = split.housingStd ?? 0;
  const cs = split.commercialStd ?? 0;
  return (
    <FLine>
      건물 {valueName(echo.buildingMode)} {fmtPlain(total)} ×{" "}
      <Frac
        top={`${kind === "housing" ? "주택건물" : "상가건물"} 기준시가 ${fmtPlain(kind === "housing" ? hs : cs)}`}
        bottom={`주택건물 ${fmtPlain(hs)} + 상가건물 ${fmtPlain(cs)} 기준시가 (건물 취득일 기준)`}
      />
    </FLine>
  );
}

/** §97②2호 단서 — 이 파트가 환산 묶음에서 나목(자본적지출·양도비)을 채택했는가. */
function provisoDirectOf(echo: Echo, partKey: "land" | "building"): boolean {
  const g = echo.provisoGroup;
  return !!g && g.chosen === "direct" && g.parts.includes(partKey);
}

/**
 * 파트 양도차익 산식 한 줄 — 취득가액 − (개산공제 | 실제 필요경비). 숫자 옆에 변수명 라벨을 둔다.
 * 단서 나목 채택 파트는 취득가액을 차감하지 않고 자본적지출·양도비 몫만 필요경비로 적용한다(엔진 echo `deemedDeduction:false`·취득가액 0).
 */
export function separatePartGainFormula(
  echo: Echo,
  key: "housingLand" | "housingBuilding" | "commercialLand" | "commercialBuilding",
  transferPrice: number,
  acqPrice: number,
  ded: number,
  stdAtAcq: number | undefined,
): string {
  const part = echo.parts[key];
  const partKey = key.endsWith("Land") ? "land" : "building";
  const modeName = sepAcqModeLabel(part.mode);
  if (part.deemedDeduction) {
    return `양도가액 ${fmtPlain(transferPrice)} - ${modeName === "환산취득가" ? "환산취득가액" : "취득가액"} ${fmtPlain(acqPrice)} - 개산공제 ${fmtPlain(ded)} (취득시 ${partKey === "land" ? "토지분" : "건물분"} 기준시가 ${stdAtAcq != null ? fmtPlain(stdAtAcq) + " " : ""}× 율)`;
  }
  if (provisoDirectOf(echo, partKey)) {
    return `양도가액 ${fmtPlain(transferPrice)} - 필요경비 ${fmtPlain(ded)} (「소득세법」 §97②2호 단서 — 환산취득가액 대신 자본적지출·양도비)`;
  }
  return ded > 0
    ? `양도가액 ${fmtPlain(transferPrice)} - 취득가액 ${fmtPlain(acqPrice)} - 실제 필요경비 ${fmtPlain(ded)}`
    : `양도가액 ${fmtPlain(transferPrice)} - 취득가액 ${fmtPlain(acqPrice)}`;
}

/**
 * ② 주택부분 / ③ 상가부분의 **취득가액** 블록 — 합계 행 + 토지분·건물분 근거 행.
 * `estimatedFormula`는 환산 파트가 있을 때 호출부가 넘기는 환산 산식(분자·분모 숫자) — 호출부 기존 산식을 그대로 재사용한다.
 */
export function SeparateAcqPartRows({
  kind,
  breakdown,
  estimatedFormula,
}: {
  kind: PartKind;
  breakdown: MixedUseGainBreakdown;
  estimatedFormula?: ReactNode;
}) {
  const echo = breakdown.separateAcquisition;
  if (!echo) return null;
  const p: MixedUseHousingPart | MixedUseCommercialPart = kind === "housing" ? breakdown.housingPart : breakdown.commercialPart;
  const name = kind === "housing" ? "주택" : "상가";
  const anyEstimated = echo.landMode === "estimated" || echo.buildingMode === "estimated";
  const sub = (part: "land" | "building") => {
    const mode = part === "land" ? echo.landMode : echo.buildingMode;
    const partName = `${name}${part === "land" ? "부수토지" : "건물"}분`;
    const value = part === "land" ? p.landAcqPrice : p.buildingAcqPrice;
    const basis =
      mode === "estimated" ? (
        <FLine>{name} 환산취득가액을 취득시 토지분 : 건물분 기준시가 비율로 나눈 {part === "land" ? "토지분" : "건물분"} (환산 산식은 아래 참조)</FLine>
      ) : part === "land" ? (
        landBasisFormula(echo, kind)
      ) : (
        buildingBasisFormula(echo, kind)
      );
    return (
      <Row
        label={`  ▸ ${partName} 취득가액 (${part === "land" ? "토지" : "건물"} ${sepAcqModeLabel(mode)})`}
        value={fmt(value)}
        small
        formula={basis}
      />
    );
  };
  return (
    <div data-testid={`mixed-sep-acq-${kind}-rows`} className="space-y-2">
      <Row
        label={`${name} 취득가액 (토지·건물 산정방식 각각)`}
        value={fmt(p.landAcqPrice + p.buildingAcqPrice)}
        formula={
          <FLine>
            {name}부수토지분 {fmtPlain(p.landAcqPrice)} + {name}건물분 {fmtPlain(p.buildingAcqPrice)} — 토지 {sepAcqModeLabel(echo.landMode)} · 건물{" "}
            {sepAcqModeLabel(echo.buildingMode)} (토지·건물 취득일이 달라 파트별로 산정)
          </FLine>
        }
      />
      {sub("land")}
      {sub("building")}
      {anyEstimated && estimatedFormula && (
        <Row label={`  ▸ 환산 파트 산식 (${name} 전체 환산취득가액)`} value="" small formula={estimatedFormula} />
      )}
      {echo.provisoGroup && (
        <p className="text-caption text-muted-foreground/90 leading-snug" data-testid={`mixed-sep-acq-${kind}-proviso`}>
          「소득세법」 §97②2호 단서 판정(환산 파트{" "}
          {echo.provisoGroup.parts.map((x) => (x === "land" ? "토지" : "건물")).join("·")} 묶음): 환산취득가액 + 개산공제{" "}
          {fmtPlain(echo.provisoGroup.estimatedSide)} / 자본적지출·양도비 {fmtPlain(echo.provisoGroup.directSide)} →{" "}
          {echo.provisoGroup.chosen === "direct" ? "자본적지출·양도비 채택(환산취득가액 차감 안 함)" : "환산취득가액 + 개산공제 적용"}
        </p>
      )}
    </div>
  );
}

/** ② 주택부분 머리 — 파트별 산정방식 한 줄 요약(어느 방식으로 계산됐는지 한눈에). */
export function SeparateAcqSummary({ breakdown }: { breakdown: MixedUseGainBreakdown }) {
  const echo = breakdown.separateAcquisition;
  if (!echo) return null;
  return (
    <p
      className="rounded-md bg-muted/30 px-3 py-2 text-caption text-muted-foreground/90 leading-snug"
      data-testid="mixed-sep-acq-parts-card"
    >
      <span className="font-medium text-foreground/80">취득가액 산정방식(별개 취득 — 토지·건물 각각)</span>
      <br />
      토지 <span data-testid="mixed-sep-part-land-method">{sepAcqModeLabel(echo.landMode)}</span> · 건물{" "}
      <span data-testid="mixed-sep-part-building-method">{sepAcqModeLabel(echo.buildingMode)}</span> — 주택분·상가분 모두 같은 산정방식으로 계산합니다.
    </p>
  );
}
