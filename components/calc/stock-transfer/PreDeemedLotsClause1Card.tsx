"use client";

/**
 * PreDeemedLotsClause1Card — 분할·다건 lot 의 의제취득일 전 «매수» 건 ① 비교 입력 (Step 2, 영 §176의2④1호)
 *
 * 의제취득일 전 매수 건마다 ② 취득 당시 실가 + 생산자물가상승분은 엔진이 자동 계산한다(`applyPreDeemedToLots`).
 * 이 카드는 ① 의제취득일 현재 가액을 «입력하면 견주는» 선택 입력이다 — 기본은 견주지 않음(`none` = ②만).
 *
 *   · 환산취득가액(상장) — 분자: 의제취득일 이전 1개월 종가평균(폼 전역) · 분모: 매도 건별 양도 당시 기준시가
 *   · 매매사례가액(비상장·기타자산) — 사례가·사례일 + 개산공제 기준(의제취득일 직전 사업연도 순손익·순자산)
 *   · 비상장·기타자산 환산 · 자본조정 동반 환산은 차단(⑧·⑫ 와 같은 술어 `isLotClause1MethodAllowed`)
 *
 * 노출 조건 `isLotsModeForm` ∧ `preDeemedLotIndexesForm ≥ 1` 은 엔진·④·⑧·⑫ 와 같은 leaf 다(단일 소스).
 * 「어느 매도 건이 분모가 필요한가」는 엔진 `allocateLots` 호출 기록(`transferLotsTouchingPreDeemedLots`)이 정한다 — 매칭을 다시 구현하지 않는다.
 * 계획서: docs/00-pm/stock-lot-pre-deemed-clause1.plan.md §11 · stock-lot-pre-deemed-clause1.ui-notes.md
 */

import { useEffect, useMemo, useRef } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { MarketSampleBlock } from "./MarketSampleBlock";
import { KiwoomAutoFetchButton } from "./KiwoomAutoFetchButton";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import {
  isLotsModeForm,
  isSection94_4Form,
  preDeemedLotIndexesForm,
} from "@/lib/calc/stock-transfer-section94-4-form";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { stockDeemedAcquisitionDate } from "@/lib/tax-engine/stock-transfer/stock-deemed-acquisition-date";
import { transferLotsTouchingPreDeemedLots } from "@/lib/tax-engine/stock-transfer/stock-pre-deemed-lot-clause1-check";
import {
  isLotClause1MethodAllowed,
  PRE_DEEMED_LOT_CAPITAL_ADJUSTMENT_MESSAGE,
  PRE_DEEMED_LOT_LISTED_SALE_CASE_MESSAGE,
  PRE_DEEMED_LOT_UNLISTED_ESTIMATED_MESSAGE,
} from "@/lib/tax-engine/stock-transfer/stock-pre-deemed-lot-clause1";

interface Props {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

type Mode = StockTransferFormData["preDeemedLotClause1Mode"];

export function PreDeemedLotsClause1Card({ form, onChange }: Props) {
  // 매도 건 행 갱신이 키움 조회(비동기) 뒤에 불려도 최신 배열 위에 쌓이도록 — 낡은 클로저 spread 덮어쓰기 방지
  const latest = useRef(form);
  useEffect(() => {
    latest.current = form;
  });

  const lotsMode = isLotsModeForm(form);
  const preDeemedIdx = lotsMode ? preDeemedLotIndexesForm(form) : [];
  const visible = lotsMode && preDeemedIdx.length > 0;
  const mode = form.preDeemedLotClause1Mode;
  const isSplit = form.lotsMode === "split";
  const is94_4 = isSection94_4Form(form);

  // 환산 ① — 의제 lot 을 소진하는 매도 건(엔진 매칭 단일 소스). 입력 도중(날짜 미완성 등)이면 계산하지 못한다.
  const touched = useMemo(() => {
    if (!visible || mode !== "estimated") return [] as number[];
    try {
      const input = buildEngineInput(coerceDates(buildStockTransferApiBody(form), [...STOCK_DATE_FIELDS]));
      return transferLotsTouchingPreDeemedLots(input, is94_4);
    } catch {
      return [] as number[];
    }
  }, [visible, mode, form, is94_4]);

  if (!visible) return null;

  const deemedIso = stockDeemedAcquisitionDate(is94_4);
  const deemedLabel = deemedIso.replace(/-0?/g, ".").concat(".");
  const hasCapAdj = (form.capitalAdjustments?.length ?? 0) > 0;
  const estimatedAllowed = isLotClause1MethodAllowed(form.marketType, "estimated");
  const saleCaseAllowed = isLotClause1MethodAllowed(form.marketType, "sale_case");

  // 선택돼 있는데 지금 조합으로는 막히는 경우(시장·자본조정을 나중에 바꿈) — 사유를 카드에 그대로 보인다(⑧·⑫ 와 같은 문구)
  const blockedReason =
    mode === "estimated" && hasCapAdj
      ? PRE_DEEMED_LOT_CAPITAL_ADJUSTMENT_MESSAGE
      : mode === "estimated" && estimatedAllowed === "unlisted_estimated"
        ? PRE_DEEMED_LOT_UNLISTED_ESTIMATED_MESSAGE
        : mode === "sale_case" && saleCaseAllowed === "listed_sale_case"
          ? PRE_DEEMED_LOT_LISTED_SALE_CASE_MESSAGE
          : null;
  const active = (mode === "estimated" || mode === "sale_case") && blockedReason === null;

  const updateLotStd = (idx: number, value: string) =>
    onChange({
      transferLots: latest.current.transferLots.map((l, i) =>
        i === idx ? { ...l, transferStdPricePerShare: value } : l,
      ),
    });

  const options: { value: Mode; label: string; description: string; disabled?: boolean }[] = [
    {
      value: "none",
      label: "견주지 않음 (② 만)",
      description: "① 미산정 — ② 취득 당시 실가 + 생산자물가상승분을 취득가액으로 합니다",
    },
    {
      value: "estimated",
      label: "환산취득가액",
      description: hasCapAdj
        ? "무상증자·감자(자본조정)가 있으면 쓸 수 없습니다"
        : estimatedAllowed === "unlisted_estimated"
          ? "비상장·기타자산은 지원하지 않습니다 — 매매사례가액을 고르세요"
          : "상장주식 — 양도가액에 (의제취득일 기준시가를 양도 당시 기준시가로 나눈 비율)을 곱합니다",
      disabled: hasCapAdj || estimatedAllowed !== "ok",
    },
    {
      value: "sale_case",
      label: "매매사례가액",
      description:
        saleCaseAllowed === "listed_sale_case"
          ? "상장주식은 쓸 수 없습니다 (영 §176의2③1호 괄호)"
          : "비상장·기타자산 — 의제취득일 현재 매매사례가액",
      disabled: saleCaseAllowed !== "ok",
    },
  ];

  return (
    <div data-testid="pre-deemed-lots-clause1-card">
      <ToneCard
        tone="amber"
        title="의제취득일 전 매수 건 — ① 의제취득일 현재 가액과 견주기 (소득세법 시행령 §176의2④)"
        bodyClassName="space-y-3"
      >
        <p className="text-xs text-amber-800 leading-relaxed">
          의제취득일({deemedLabel}) 전에 매수한 건의 취득가액은 매수 건마다 ① 의제취득일 현재 환산취득가액·매매사례가액과
          ② 취득 당시 실지거래가액에 생산자물가상승분을 더한 금액 중 <strong>많은 것</strong>입니다 (
          <LawArticleModal legalBasis="소득세법 시행령 §176의2" label="영 §176의2④" />
          {" · "}
          <LawArticleModal legalBasis="소득세법 시행규칙 §85의2" label="규칙 §85의2" />
          ). ②는 1단계 입력으로 자동 계산합니다. ①은 아래에서 고르고 입력하면 견줍니다.
        </p>
        <p className="text-xs text-amber-700" data-testid="pre-deemed-lots-targets">
          대상 매수 건:{" "}
          {preDeemedIdx
            .map((i) => `매수 #${i + 1}(${form.acquisitionLots[i].acquisitionDate})`)
            .join(" · ")}
        </p>

        <RadioCardGroup
          name="preDeemedLotClause1Mode"
          value={mode}
          onChange={(v) => onChange({ preDeemedLotClause1Mode: v as Mode })}
          tone="amber"
          layout="stack"
          columns={3}
          options={options}
          data-field="preDeemedLotClause1"
        />

        {blockedReason && (
          <ToneCard tone="rose" className="text-xs">
            <p role="alert" data-testid="pre-deemed-lots-blocked">
              {blockedReason}
            </p>
          </ToneCard>
        )}

        {mode === "none" && (
          <p className="text-xs text-amber-800" data-testid="pre-deemed-lots-none-note">
            ① 미산정 — 결과에는 ② 만 적용했다고 표시됩니다. ①을 견주려면 위에서 방식을 고르세요.
          </p>
        )}

        {active && mode === "estimated" && (
          <div className="space-y-3">
            <ToneCard
              tone="emerald"
              sectionNum={1}
              title="의제취득일 현재 1주당 기준시가 (환산비율의 분자)"
              bodyClassName="space-y-3"
            >
              <KiwoomAutoFetchButton
                axis="acquisition"
                securityCode={form.securityCode}
                transferDate={deemedIso}
                marketType={form.marketType}
                tradingHalt={false}
                // 취득일 축은 평균만 쓴다 — 일자별 배열·조회시각 등 이 카드가 쓰지 않는 키는 버린다
                onFill={(p) =>
                  onChange({ acquisitionDatePriceAvg1Month: p.acquisitionDatePriceAvg1Month ?? "" })
                }
              />
              <CurrencyInput
                label="의제취득일 이전 1개월 종가평균 (1주당)"
                required
                hint="소득세법 §99①3 · 시행령 §165③ — 환산비율의 분자이자 개산공제(§163⑥4) 산정 기준액. 모든 의제 매수 건에 공통입니다"
                value={form.acquisitionDatePriceAvg1Month}
                onChange={(v) => onChange({ acquisitionDatePriceAvg1Month: v })}
                data-field="acquisitionDatePriceAvg1Month"
                data-testid="pre-deemed-lots-deemed-std"
              />
            </ToneCard>

            <ToneCard
              tone="emerald"
              sectionNum={2}
              title="양도 당시 1주당 기준시가 (환산비율의 분모)"
              bodyClassName="space-y-3"
            >
              {isSplit ? (
                touched.length === 0 ? (
                  <p className="text-xs text-emerald-800" data-testid="pre-deemed-lots-no-sale-rows">
                    기준시가가 필요한 매도 건이 아직 없습니다 — 1단계의 매수·매도 건(일자·주식수·단가, 개별법은 배정)을 다
                    입력하면 의제취득일 전 매수분과 매칭되는 매도 건이 여기에 나타납니다.
                  </p>
                ) : (
                  touched.map((i) => {
                    const lot = form.transferLots[i];
                    return (
                      <div
                        key={lot.id}
                        data-testid={`pre-deemed-lots-sale-row-${i}`}
                        className="rounded-lg border border-emerald-200 bg-white p-3 space-y-2 dark:bg-gray-900"
                      >
                        <p className="text-xs font-semibold text-emerald-700">
                          매도 #{i + 1} · 양도일 {lot.transferDate || "미입력"}
                        </p>
                        <KiwoomAutoFetchButton
                          axis="transfer"
                          securityCode={form.securityCode}
                          transferDate={lot.transferDate}
                          marketType={form.marketType}
                          tradingHalt={false}
                          onFill={(p) => updateLotStd(i, p.transferDatePriceAvg1Month ?? "")}
                        />
                        <CurrencyInput
                          label="양도일 이전 1개월 종가평균 (1주당)"
                          required
                          hint="양도 당시 기준시가 — 소득세법 §99①3 · 시행령 §165③. 이 매도 건의 환산비율 분모입니다"
                          value={lot.transferStdPricePerShare ?? ""}
                          onChange={(v) => updateLotStd(i, v)}
                          data-field={`transferLots[${i}].transferStdPricePerShare`}
                          data-testid={`pre-deemed-lots-sale-std-${i}`}
                        />
                      </div>
                    );
                  })
                )
              ) : (
                <>
                  <KiwoomAutoFetchButton
                    axis="transfer"
                    securityCode={form.securityCode}
                    transferDate={form.transferDate}
                    marketType={form.marketType}
                    tradingHalt={false}
                    onFill={(p) => onChange({ transferDatePriceAvg1Month: p.transferDatePriceAvg1Month ?? "" })}
                  />
                  <CurrencyInput
                    label="양도일 이전 1개월 종가평균 (1주당)"
                    required
                    hint="양도 당시 기준시가 — 소득세법 §99①3 · 시행령 §165③. 환산비율의 분모입니다"
                    value={form.transferDatePriceAvg1Month}
                    onChange={(v) => onChange({ transferDatePriceAvg1Month: v })}
                    data-field="transferDatePriceAvg1Month"
                    data-testid="pre-deemed-lots-transfer-std"
                  />
                </>
              )}
            </ToneCard>
            <p className="text-xs text-emerald-700">
              ※ ① 채택 건의 필요경비는 개산공제(의제취득일 기준시가 × 1%)입니다. 환산취득가액은 §97②2호 단서 비교가 따릅니다.
            </p>
          </div>
        )}

        {active && mode === "sale_case" && (
          <div className="space-y-3">
            <MarketSampleBlock form={form} onChange={onChange} isListed={false} baseDateLabel="의제취득일" />
            <ToneCard
              tone="emerald"
              sectionNum={2}
              title="의제취득일 현재 기준시가 — 개산공제 기준 (소령 §163⑥4·§165④)"
              bodyClassName="space-y-3"
            >
              <p className="text-xs text-emerald-700/80">
                매매사례가액을 채택한 건의 필요경비는 <strong>의제취득일 현재 기준시가 × 1%</strong>(개산공제)입니다. 기준시가는
                비상장·기타자산 주식등의 보충적 평가(영 §165④)로 산정하므로 의제취득일 직전 사업연도의 1주당 순손익가치와
                순자산가치를 입력하세요.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <CurrencyInput
                  label="1주당 순손익가치 (의제취득일 직전 사업연도)"
                  required
                  allowNegative
                  hint="(순손익가치 × 3 + 순자산가치 × 2)를 5로 나눈 가중평균의 입력값"
                  value={form.acquisitionYearNetIncomePerShare}
                  onChange={(v) => onChange({ acquisitionYearNetIncomePerShare: v })}
                  data-field="acquisitionYearNetIncomePerShare"
                />
                <CurrencyInput
                  label="1주당 순자산가치 (의제취득일 직전 사업연도)"
                  required
                  allowNegative
                  hint="순자산 단독 평가 사유·결산서 상세 입력은 이 카드에서 지원하지 않습니다"
                  value={form.acquisitionYearNetAssetPerShare}
                  onChange={(v) => onChange({ acquisitionYearNetAssetPerShare: v })}
                  data-field="acquisitionYearNetAssetPerShare"
                />
              </div>
            </ToneCard>
          </div>
        )}
      </ToneCard>
    </div>
  );
}
