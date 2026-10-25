/**
 * 부담부증여 × 일반건물 × 배우자등 이월과세 — §97의2②3호 **외부 비교 단위** 등록·결과 echo (묶음 PR-1 · 지분 분할 PR-2)
 *
 * 계획서: `docs/00-pm/gb-bg-carryover-share-bundled.plan.md` §4.2·§4.5·§4.6
 *
 * 일반건물 부담부증여는 A/B가 §159 안분 단계(카드 조립 전)에서 갈려 카드에 `carryoverTaxation`이 없다. 그래서
 * `buildGbCompanionItems`가 두 카드 세트를 미리 만들고(`GbBgCarryoverUnitDraft`), 여기서 그 B 구간을 신고 카드 목록에서 찾아
 * 집계의 외부 단위로 넘긴다. 다른 자산의 이월과세(단건 엔진 단위)와 **한 번의 순차 고정점**으로 풀린다 — 단위 순서 = 카드 순서.
 */
import type {
  calculateTransferTaxAggregateWithUnits,
  AggregateTransferResult,
  ExternalCarryoverUnit,
  TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import type {
  GbBgCarryoverScenarioSummary,
  GbBgCarryoverUnitDetail,
  GbBundledAssetDetail,
} from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { GbBgCarryoverUnitDraft } from "./general-building-part-cards";

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * 드래프트의 B 카드 구간을 신고 카드 목록에서 찾아 외부 단위로 만든다. `mapCard`는 신고 카드 목록에 적용한 변환(축 B 표지 등)을
 * A 카드에도 똑같이 적용한다 — 한쪽만 바뀌면 채택 시나리오에 따라 다른 사실로 계산된다.
 */
export function toGbCarryoverUnits(
  drafts: readonly GbBgCarryoverUnitDraft[],
  items: readonly TransferTaxItemInput[],
  mapCard: (c: TransferTaxItemInput) => TransferTaxItemInput,
): ExternalCarryoverUnit[] {
  return drafts.map((d) => {
    const start = items.findIndex((it) => it.propertyId === d.cardsB[0]?.propertyId);
    const aligned =
      start >= 0 &&
      d.cardsA.length === d.cardsB.length &&
      d.cardsA.every((c, i) => items[start + i]?.propertyId === c.propertyId);
    if (!aligned) throw new Error(`함께 양도 입력: 일반건물 ${d.assetId}의 이월과세 A·B 카드 구성이 서로 다릅니다.`);
    return { key: d.assetId, start, cardsA: d.cardsA.map(mapCard) };
  });
}

const summaryOf = (
  r: AggregateTransferResult,
  unit: ExternalCarryoverUnit,
  land: Date,
  building: Date,
): GbBgCarryoverScenarioSummary => ({
  parts: r.properties
    .slice(unit.start, unit.start + unit.cardsA.length)
    .map((p) => ({ propertyLabel: p.propertyLabel, acquisitionPrice: p.acquisitionPrice, transferGain: p.transferGain })),
  landHoldingStartDate: ymd(land),
  buildingHoldingStartDate: ymd(building),
});

/**
 * 단위별 명세(`burdenedGiftCarryoverUnits`)를 싣고, A가 채택된 자산은 결과 상세(산식 재료)를 A 카드 것으로 바꾼다.
 * [A]/[B] 요약은 **최종 배정**에서 만든다 — 채택 쪽은 최종 결과, 다른 쪽은 이 단위만 반대 시나리오로 돌린 반사실 실행(§4.6).
 */
export function attachGbCarryoverUnits(
  calc: ReturnType<typeof calculateTransferTaxAggregateWithUnits>,
  aggregated: AggregateTransferResult,
  drafts: readonly GbBgCarryoverUnitDraft[],
  units: readonly ExternalCarryoverUnit[],
  /** 함께 양도 묶음 — A 채택 자산의 결과 상세를 A 카드 것으로 바꾼다. 지분 분할은 넘기지 않는다(물건 상세를 route가 다시 조립한다). */
  detailsByAsset?: Record<string, GbBundledAssetDetail>,
): void {
  if (drafts.length === 0) return;
  const out: Record<string, GbBgCarryoverUnitDetail> = {};
  drafts.forEach((d, i) => {
    const unit = units[i];
    const o = calc.units[d.assetId];
    const adoptedA = o.adoptedScenario === "A";
    const runA = adoptedA ? calc.result : o.counterfactual;
    const runB = adoptedA ? o.counterfactual : calc.result;
    out[d.assetId] = {
      assetLabel: d.assetLabel,
      isEligible: true,
      applicablePeriodYears: d.applicablePeriodYears,
      adoptedScenario: o.adoptedScenario,
      determinedTaxA: o.filingUnitComparison.determinedTaxWithCarryover,
      determinedTaxB: o.filingUnitComparison.determinedTaxWithout,
      donorAcquisitionDate: d.donorAcquisitionDate,
      giftTaxAmount: d.giftTaxAmount,
      scenarioA: summaryOf(runA, unit, d.donorAcquisitionDate, d.donorAcquisitionDate),
      scenarioB: summaryOf(runB, unit, d.holdingStartB.land, d.holdingStartB.building),
    };
    if (adoptedA && detailsByAsset && d.detailA) detailsByAsset[d.assetId] = d.detailA;
  });
  aggregated.burdenedGiftCarryoverUnits = out;
}
