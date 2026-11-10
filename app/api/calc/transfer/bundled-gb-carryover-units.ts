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
import type { DonorBuiltPenaltyEcho } from "@/lib/tax-engine/types/transfer-carryover.types";
import { donorBuiltNotAppliedEcho } from "@/lib/tax-engine/transfer-tax-carryover-donor-penalty";
import { donorBuiltPenaltyNotice } from "@/lib/tax-engine/transfer-tax-carryover-donor-display";
import { SHARE_ID_SEPARATOR } from "@/lib/tax-engine/general-building-share-id";
import { donorBuiltAppliedEcho } from "./general-building-route-carryover";

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
    .map((p) => ({ propertyId: p.propertyId, propertyLabel: p.propertyLabel, acquisitionPrice: p.acquisitionPrice, transferGain: p.transferGain })),
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
      scenarioA: summaryOf(runA, unit, d.holdingStartA.land, d.holdingStartA.building),
      scenarioB: summaryOf(runB, unit, d.holdingStartB.land, d.holdingStartB.building),
      carryoverParts: d.carryoverParts,
      ...(d.donorCapex > 0 ? { donorCapexAddedToExpense: d.donorCapex } : {}),
    };
    if (adoptedA && detailsByAsset && d.detailA) detailsByAsset[d.assetId] = d.detailA;
  });
  aggregated.burdenedGiftCarryoverUnits = out;
}

/**
 * 연간 합산 — 일반건물 부담부증여 × 이월과세 × **당초 증여자 신축·증축**(§114조의2) echo를 자산별로 싣는다
 * (계획서 `multi-carryover-bg-gb-shares.plan.md` 트랙 GB-BG-CO-DNB). 사유 판별은 단건 F27(`general-building-route-carryover.ts`)과 같다:
 * A 채택 → 그 자산 건물 카드(최종 결과)의 가산세로 적용 echo · B 채택 → scenario_b · 이월과세 배제 → carryover_excluded(`excluded` — 비교 단위가 없다).
 * 비교는 단건과 같이 가산세 전 결정세액이다(`determinedTax` — 집계가 §114조의2분을 따로 더한다). 고지 문장도 단건과 같은 것을 `warnings`에 싣는다.
 */
export function attachGbDonorBuiltEchoes(
  calc: ReturnType<typeof calculateTransferTaxAggregateWithUnits>,
  aggregated: AggregateTransferResult,
  drafts: readonly GbBgCarryoverUnitDraft[],
  units: readonly ExternalCarryoverUnit[],
  excluded: Readonly<Record<string, { label: string; echo: DonorBuiltPenaltyEcho }>>,
): void {
  const out: Record<string, { label: string; echo: DonorBuiltPenaltyEcho }> = { ...excluded };
  drafts.forEach((d, i) => {
    if (!d.donorBuilt) return;
    const unit = units[i];
    const adoptedA = calc.units[d.assetId]?.adoptedScenario === "A";
    const building = aggregated.properties
      .slice(unit.start, unit.start + unit.cardsA.length)
      .find((p) => p.propertyId.split(SHARE_ID_SEPARATOR)[0] === "building");
    out[d.assetId] = {
      label: d.assetLabel,
      echo: adoptedA
        ? donorBuiltAppliedEcho(d.donorBuilt.input, building, d.cardsA[0].transferDate, d.donorBuilt.method)
        : donorBuiltNotAppliedEcho(d.donorBuilt.input, "scenario_b"),
    };
  });
  if (Object.keys(out).length === 0) return;
  aggregated.donorBuiltPenaltyByAsset = out;
  const notices = Object.values(out).flatMap(({ echo }) => donorBuiltPenaltyNotice(echo) ?? []);
  aggregated.warnings = [...aggregated.warnings, ...new Set(notices.filter((n) => !aggregated.warnings.includes(n)))];
}
