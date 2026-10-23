"use client";

/**
 * 결과 카드 일반건물 블록 6종 — 일반건물 한 물건분(`GbBlockView`).
 *
 * 구분 기재 미입력 안내 · §100③ 판정 · §163⑨ 상속 취득가액 · 의제취득일 전 ①②③ · 환산주택가격 · §97②2호 단서.
 * (3-way 표는 「핵심 결과·계산 내역」 자리라 `GeneralBuilding3WayTable`이 따로 그린다.)
 *
 * ⚠️ 일반건물은 aggregate 경로로 흐르므로 `GeneralBuildingValuationDetailCard`(TransferTaxResultView 전용)는
 *    렌더되지 않는다 — 블록은 일괄 결과 카드(`BundledAllocationCard`)의 「양도가액 안분」 표 아래가 종착지다
 *    (memory `feedback_transfer_result_view_is_not_one` — 2회 재발한 함정).
 *
 * 함께 양도는 일반건물 자산마다 이 컴포넌트를 반복하고 자산 라벨 소제목을 단다(`gb-bundled-result-blocks.plan.md` Q-1 a).
 * 단건은 소제목 없이 종전과 같다.
 */
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { SaleSplitJudgmentBlock } from "@/components/calc/results/transfer/SaleSplitJudgmentBlock";
import { SaleSplitUnenteredNotice } from "@/components/calc/results/transfer/SaleSplitUnenteredNotice";
import { isSaleSplitActual, saleSplitUnenteredNotice } from "@/components/calc/results/transfer/sale-split-unentered-notice";
import { GbPreDeemedAcquisitionBlock } from "@/components/calc/results/transfer/GbPreDeemedAcquisitionBlock";
import type { GbBlockView } from "@/components/calc/results/transfer/gb-result-block-views";

/** §163⑨ 상속 블록의 파트 라벨 — 의제취득일 전 상속 파트는 엔진이 채택한 후보를 따른다(PR-4). */
const PRE_DEEMED_ADOPTED_LABEL = {
  reported: "(상속개시일 평가액)",
  sec164: "(영 §164 가액)",
  converted: "(환산취득가액)",
} as const;

export function GbResultBlocks({ view }: { view: GbBlockView }) {
  const d = view.detail;
  const preDeemed = d.preDeemedAcquisition;
  /**
   * 그 파트 카드가 ③(추계)으로 계산됐는가 — 지분 분할은 비교 echo를 싣지 않으므로(지분마다 다름) 카드가 유일한 소스다.
   * 증축분(건물2)은 상속 대상이 아니라 뺀다.
   */
  const partConverted = (kind: "land" | "building") =>
    (d.assetCards ?? []).some((c) =>
      c.usedEstimatedAcquisition &&
      (kind === "land" ? c.propertyType === "land" : c.propertyType === "general_building_unit" && !c.propertyId.includes("building2")));
  const inheritedOf = (kind: "land" | "building") =>
    kind === "land" ? d.acquisitionByInheritance : d.buildingAcquisitionByInheritance;
  const inheritedConverted = (kind: "land" | "building") => !!inheritedOf(kind) && partConverted(kind);

  // «구분 기재 + 두 칸 비움» — 판정이 비는 자리(구분 기재 없이 안분)에서만 뜬다. 폼 선택 ∧ 엔진 echo(판정과 배타).
  const unentered = saleSplitUnenteredNotice(isSaleSplitActual(view.asset), d.saleApportionBasisKind);
  const inheritance = !!(d.acquisitionByInheritance || d.buildingAcquisitionByInheritance);
  if (!unentered && !d.saleSplitJudgment && !inheritance && !preDeemed && !d.convertedHousing && !view.swapComparison) return null;

  return (
    <div className="space-y-6" data-testid={view.assetId ? `gb-result-blocks-${view.assetId}` : "gb-result-blocks"}>
      {view.label && <h3 className="font-semibold text-base">일반건물 — {view.label}</h3>}

      {/*
        §100③ 판정 (Phase 2) — **일반건물 구분양도 전용**.
        표시를 붙일 곳을 일괄 결과 카드로 잡지 않으면 **판정이 계산에만 반영되고 화면에는 안 보인다**.
      */}
      {unentered && <SaleSplitUnenteredNotice text={unentered} />}
      {d.saleSplitJudgment && (
        <SaleSplitJudgmentBlock
          j={d.saleSplitJudgment}
          // 근거 문구는 엔진을 거치지 않는다(계획서 §15.3) — 폼에서 직접 읽는다.
          {...(view.asset?.saleSplitExemptionNote ? { exemptionNote: view.asset.saleSplitExemptionNote } : {})}
        />
      )}

      {/* §163⑨ 상속 취득가액 직접 산정 — **파트별**(C1 전부 상속 · C2·C2′·C3 부분 상속). */}
      {inheritance && (
        <div className="rounded-lg border border-violet-300 bg-violet-50/60 p-3 text-sm space-y-1 dark:bg-violet-950/40">
          <p className="font-semibold text-violet-900 dark:text-violet-200">
            상속 취득가액 직접 산정 — 소득세법 시행령 §163⑨
          </p>
          <p className="text-xs text-violet-800 dark:text-violet-200">
            상속개시일 현재 「상속세 및 증여세법」 §60~§66 평가액을 취득당시의 실지거래가액으로
            봅니다. 그 파트는 환산취득가·개산공제(§163⑥)를 적용하지 않습니다.
            {(preDeemed || inheritedConverted("land") || inheritedConverted("building")) &&
              " 다만 1985.1.1. 전 상속 파트는 환산취득가액이 더 크면 환산취득가액과 개산공제를 적용합니다."}
          </p>
          <ul className="text-xs text-violet-900 space-y-0.5 pt-1 dark:text-violet-200">
            {(["land", "building"] as const).map((kind) => {
              const acq = view.partAcquisitionPrice(kind);
              if (acq === undefined) return null;
              return (
                <li key={kind} className="flex items-baseline justify-between gap-3">
                  <span>
                    {kind === "land" ? "토지분" : "건물분"} 취득가액
                    <span className="ml-1 text-violet-700 dark:text-violet-400">
                      {inheritedOf(kind)
                        ? PRE_DEEMED_ADOPTED_LABEL[preDeemed?.[kind]?.adopted ?? (partConverted(kind) ? "converted" : "reported")]
                        : "(상속 아님 — 종전 산정)"}
                    </span>
                  </span>
                  <span className="font-mono tabular-nums font-semibold whitespace-nowrap">
                    {formatKRW(acq)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 의제취득일 전 상속·증여 파트 — ①②③ 비교(PR-4). 증여 파트는 위 상속 블록이 없으므로 따로 그린다. */}
      {preDeemed && <GbPreDeemedAcquisitionBlock echo={preDeemed} />}

      {/* §99-164-10 환산주택가격 — 취득당시 기준시가를 **덮어쓴 근거**. */}
      {d.convertedHousing && (() => {
        const c = d.convertedHousing;
        const rows: Array<[string, number]> = [
          ["최초공시주택가격", c.firstDisclosurePrice],
          ["취득 당시 토지 기준시가", c.acqLandStd],
          ["취득 당시 건물 기준시가", c.acqBuildingStd],
          ["최초공시 당시 토지 기준시가", c.firstDiscLand],
          ["최초공시 당시 건물 기준시가", c.firstDiscBuilding],
        ];
        return (
          <div className="rounded-lg border border-violet-300 bg-violet-50/60 p-3 text-sm space-y-1 dark:bg-violet-950/40">
            <p className="font-semibold text-violet-900 dark:text-violet-200">
              환산주택가격 — 양도소득세 집행기준 99-164-10
            </p>
            <p className="text-xs text-violet-800 dark:text-violet-200">
              취득 당시 주택으로 개별주택가격이 고시된 뒤 상가로 용도변경했으므로, 최초공시주택가격을
              자산별 기준시가 비율로 환산해 <b>취득 당시 기준시가</b>로 사용합니다.
            </p>
            <ul className="text-xs text-violet-900 space-y-0.5 pt-1 dark:text-violet-200">
              {rows.map(([label, v]) => (
                <li key={label} className="flex items-baseline justify-between gap-3">
                  <span>{label}</span>
                  <span className="font-mono tabular-nums whitespace-nowrap">
                    {formatKRW(v)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="pt-1 text-xs text-violet-800 dark:text-violet-200">
              환산주택가격 = 최초공시주택가격 {formatKRW(c.firstDisclosurePrice)} ×{" "}
              <Frac
                top={`취득 당시 기준시가 합계 ${formatKRW(c.acqTotal)}`}
                bottom={`최초공시 당시 기준시가 합계 ${formatKRW(c.firstDiscTotal)}`}
              />
            </p>
            <ul className="text-xs text-violet-900 space-y-0.5 pt-1 dark:text-violet-200">
              <li className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">환산주택가격</span>
                <span className="font-mono tabular-nums font-semibold whitespace-nowrap">
                  {formatKRW(c.converted)}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-3">
                <span>
                  토지분<span className="ml-1 text-violet-700 dark:text-violet-400">(취득 당시 기준시가 비율 안분)</span>
                </span>
                <span className="font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(c.convertedLand)}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-3">
                <span>건물분</span>
                <span className="font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(c.convertedBuilding)}
                </span>
              </li>
            </ul>
          </div>
        );
      })()}

      {/* §97② 2호 단서 swap 발동 표시 (일반건물 환산 자산총액 판정 — F10) */}
      {view.swapComparison && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-sm space-y-1 dark:bg-amber-950/40">
          <p className="font-semibold text-amber-900 dark:text-amber-200">
            필요경비 swap 적용 — 소득세법 §97② 2호 단서
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-200">
            환산취득가 + 개산공제 합 {formatKRW(view.swapComparison.estimatedSide)}
            {" < "}자본적지출 + 양도비 {formatKRW(view.swapComparison.directSide)}
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-200">
            → 자본적지출 + 양도비 {formatKRW(view.swapComparison.directSide)}을 필요경비로 적용(환산취득가 미차감, 자산별 비율 배분)
          </p>
        </div>
      )}
    </div>
  );
}
