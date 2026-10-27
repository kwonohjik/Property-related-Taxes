"use client";

/**
 * 일반건물 부담부증여 × 배우자등 이월과세 — [A]/[B] 비교 카드 (소득세법 §97조의2 · F27 PR-4)
 *
 * 계획서: docs/00-pm/gb-bg-carryover-presumed-scenario-b.plan.md §3.4
 * 값은 전부 route echo(`aggregated.burdenedGiftCarryoverDetail`)이고 이 카드는 계산하지 않는다.
 * 일반건물은 카드 여러 장이 하나의 신고를 이루므로 A·B 결정세액이 곧 **신고 전체** 결정세액이다(②3호 비교의 두 항 그대로).
 * 열 구성은 단건 `CarryoverComparisonCard`의 `ScenarioCol`·`InfoRow`를 쓴다.
 *
 * 함께 부담부증여 묶음(`assetLabel` 지정 · PR-1)은 자산마다 한 장이다. A·B는 **그 자산에만** 적용 / 미적용했을 때의 신고 전체 결정세액이고
 * 다른 자산의 채택이 함께 정해지므로, 「신고세액 = 큰 금액」 문구를 쓰지 않는다(다건 카드 `filingUnitComparison`과 같은 문구 · 계획서 §4.6).
 * [A] 열의 증여세 상당액은 ④가 신고서 금액으로 만든 값(`gb-bg-carryover-gift-tax-input.plan.md` §4.4)이다.
 */
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { InfoRow, ScenarioCol } from "./CarryoverComparisonCard";
import { baseCardId } from "@/lib/tax-engine/general-building-share-id";
import type { AggregateTransferResult, GbBgCarryoverScenarioSummary } from "@/lib/tax-engine/types/transfer-aggregate.types";

type Detail = NonNullable<AggregateTransferResult["burdenedGiftCarryoverDetail"]>;

type Part = "land" | "building";
interface Tag { acq: string; start: string }
const DONOR_TAG: Tag = { acq: "당초 증여자 기준", start: "당초 증여자 취득일" };
const DONEE_TAG: Tag = { acq: "수증자 기준", start: "수증자 취득일" };

/** 카드가 토지·건물 중 어느 파트인가 — 카드 id가 없는 옛 결과는 건물로 읽지 않고 `undefined`(꼬리표를 파트로 가르지 않는다). */
const partOfCard = (propertyId: string | undefined): Part | undefined =>
  propertyId === undefined ? undefined : baseCardId(propertyId).startsWith("land") ? "land" : "building";

function SummaryRows({ s, tagOf }: { s: GbBgCarryoverScenarioSummary | undefined; tagOf: (part: Part | undefined) => Tag }) {
  // 이 필드가 생기기 전에 저장된 결과 — 결정세액만 보인다.
  if (!s) return null;
  const gain = s.parts.reduce((t, p) => t + p.transferGain, 0);
  const landTag = tagOf("land");
  const buildingTag = tagOf("building");
  return (
    <div className="space-y-1">
      {s.parts.map((p) => (
        <InfoRow key={p.propertyLabel} label={`${p.propertyLabel} 취득가액 [${tagOf(partOfCard(p.propertyId)).acq}]`} value={formatKRW(p.acquisitionPrice)} />
      ))}
      {s.landHoldingStartDate === s.buildingHoldingStartDate && landTag.start === buildingTag.start ? (
        <InfoRow label={`보유기간 기산일 [${landTag.start}]`} value={s.landHoldingStartDate} />
      ) : (
        <>
          <InfoRow label={`토지 보유기간 기산일 [${landTag.start}]`} value={s.landHoldingStartDate} />
          <InfoRow label={`건물 보유기간 기산일 [${buildingTag.start}]`} value={s.buildingHoldingStartDate} />
        </>
      )}
      <InfoRow label="양도차익 (합계)" value={formatKRW(gain)} />
    </div>
  );
}

export function GbBurdenedGiftCarryoverCard({ detail, assetLabel }: { detail: Detail | undefined; assetLabel?: string }) {
  if (!detail) return null;
  const adoptedA = detail.adoptedScenario === "A";
  const adoptedTax = adoptedA ? detail.determinedTaxA : detail.determinedTaxB;
  const perAsset = assetLabel !== undefined;
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4" data-testid="gb-bg-carryover-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">이월과세 비교과세 결과{perAsset ? ` — ${assetLabel}` : ""}</p>
        <span className="text-caption text-muted-foreground">소득세법 §97조의2</span>
      </div>

      <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        적용기간 판정: {detail.applicablePeriodYears === 10 ? "10년 이내 (2022.12.31. 개정 — 증여일 ≥ 2023.1.1.)" : "5년 이내 (종전 규정)"}
        <span className="ml-2 text-emerald-700 font-medium dark:text-emerald-300">→ 이월과세 요건 충족</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ScenarioCol label="[A] 이월과세 적용" adopted={adoptedA} determinedTax={detail.determinedTaxA} filingUnit={perAsset} compared>
          {/* 증여받은 파트만 당초 증여자 기준이다(§97의2①1호 「해당 자산」 · `carryoverParts` — 없으면 둘 다). */}
          <SummaryRows s={detail.scenarioA} tagOf={(part) => (part && detail.carryoverParts && !detail.carryoverParts[part] ? DONEE_TAG : DONOR_TAG)} />
          {/* §97의2①3호 — A에만 산입된다. 채무 비율 안분·한도 전 금액이다(그 뒤 단계는 §159 명세). 0도 보인다 — 입력이 닿지 않은 것을 화면이 말하게(gb-bg-carryover-gift-tax-input.plan.md §4.4). */}
          <div data-testid="gb-bg-carryover-gift-tax">
            <InfoRow label="증여세 상당액 (채무 비율 안분 전)" value={formatKRW(detail.giftTaxAmount)} />
          </div>
          {/* §97의2①2호 — 당초 증여자 자본적지출도 A 필요경비에만 더한다. 채무 비율 안분 전 금액이다. */}
          {(detail.donorCapexAddedToExpense ?? 0) > 0 && (
            <div data-testid="gb-bg-carryover-donor-capex">
              <InfoRow label="증여자 자본적지출 (채무 비율 안분 전)" value={formatKRW(detail.donorCapexAddedToExpense ?? 0)} />
            </div>
          )}
        </ScenarioCol>
        <ScenarioCol
          label={`[B] 미적용 (비교과세)${adoptedA ? "" : " ← 비교과세 세액 역전"}`}
          adopted={!adoptedA}
          determinedTax={detail.determinedTaxB}
          filingUnit={perAsset}
          compared
        >
          <SummaryRows s={detail.scenarioB} tagOf={() => DONEE_TAG} />
        </ScenarioCol>
      </div>

      <div className="rounded-md border-t pt-3 space-y-1 text-xs text-muted-foreground">
        <div className="flex flex-wrap justify-between gap-2 font-semibold text-foreground text-sm">
          <span>채택 시나리오: {detail.adoptedScenario} ({adoptedA ? "이월과세 적용" : "비교과세 미적용"})</span>
          {!perAsset && (
            <span data-testid="gb-bg-carryover-filing-tax">신고세액 = 시나리오 A·B 중 큰 금액 = {formatKRW(adoptedTax)}</span>
          )}
        </div>
        {perAsset ? (
          <p>
            A·B 결정세액은 이 자산에만 이월과세를 적용 / 적용하지 않았을 때의 신고 전체 금액입니다 (§97조의2 ② 3호 · §92③2호). 함께
            양도한 다른 자산의 채택이 같이 정해지므로 최종 결정세액과 다를 수 있습니다.
          </p>
        ) : (
          <p>A·B 결정세액은 토지·건물 카드를 합친 신고 전체 금액입니다 (§97조의2 ② 3호는 양도소득 결정세액을 비교).</p>
        )}
        {!adoptedA && (
          <p className="text-rose-700 dark:text-rose-400">
            ※ §97조의2 ② 3호 비교과세 — 시나리오 B 채택 (세액 역전{perAsset ? " · 신고 전체 결정세액 기준" : ""})
          </p>
        )}
      </div>
    </div>
  );
}
