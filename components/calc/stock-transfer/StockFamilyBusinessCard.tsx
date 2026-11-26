"use client";

/**
 * StockFamilyBusinessCard — 가업상속공제 자산 의제 취득가액 (소득세법 §97의2④) 입력 (⑤)
 *
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §7.3·§7.4
 * 노출·전송·검증 술어: `lib/calc/stock-family-business.ts` (④·⑤·⑧ 공유 — 3중 패턴)
 *
 * 입력 순서 = 계산 순서: 피상속인 1주당 취득가액 → 피상속인 자본적지출(선택) → 적용률 법정량 쌍 → 미리보기.
 * 상속개시일 = 위 「취득일」 칸, 상속개시일 평가액 = 위 「취득가액」 칸 — 같은 값을 두 번 받지 않는다(읽기 문구로 안내).
 * 적용률은 % 직접 입력이 없고 **양도일**에서 쌍이 갈린다(구 ③ 공제금액·재산가액 / ③2호 총자산·사업무관자산).
 *
 * **단건 카드와 lot 카드가 같은 컴포넌트다**(복제 금지) — `lot` prop이 있으면 취득 lot 축(계획서 §7.7):
 *   입력칸 7개·적용률 쌍·강제 적용 안내는 같고, 다음만 다르다.
 *     · 상속개시일 = 이 lot의 취득일, 상속개시일 평가액 = 이 lot의 1주당 단가(읽기 문구)
 *     · 자본적지출 = 이 lot **전체 주식수** 총액(매도에 배정된 몫만 산입)
 *     · 적용률 쌍 = 매도 lot들의 양도일 시대 — 2026-02-27을 사이에 두면 차단 문구(쌍 입력칸 없음)
 *     · 이력 불러오기·미리보기는 두지 않는다(미리보기는 아래 「취득가액 (자동 산출)」 카드가 엔진 배정값으로 보인다)
 *
 * 정책:
 *   - useEffect → store 미러링 금지 — 토글·입력은 onChange에서 직접 쓴다
 *   - ToggleCard emerald(OFF도 tone 유지). 모드 때문에 막히면 disabled + disabledReason
 *   - 이력 불러오기는 1주당 평가액을 덮어쓰지 않는다 — 참고값만 보인다(계획서 Q-8)
 *   - 공제액(§18의2⑩)은 이 양도세에서 빼지 않는다 — 문구가 오해 없게
 */

import { useState } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Button } from "@/components/ui/button";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { FamilyBusinessInheritanceHistoryModal } from "@/components/calc/transfer/FamilyBusinessInheritanceHistoryModal";
import type { FamilyBusinessInheritancePrefill } from "@/lib/calc/family-business-inheritance-lookup";
import { formatFractionPercent } from "@/lib/calc/format-fraction-percent";
import {
  buildStockFamilyBusinessInput,
  isStockFbCardVisible,
  isStockFbOn,
  previewStockFbAcquisitionPrice,
  stockFbBlockedReason,
  stockFbRateEra,
} from "@/lib/calc/stock-family-business";
import {
  STOCK_FB_LOT_STRADDLE_MESSAGE,
  isStockFbLotCardVisible,
  isStockFbLotOn,
  lotFbFields,
  stockFbLotBlockedReason,
  stockFbLotSaleEra,
} from "@/lib/calc/stock-family-business-lots";
import { parseIntOrUndef } from "@/lib/calc/stock-transfer-tax-api-parse";
import { FB_MOVING_AVG_NOTICE } from "@/lib/tax-engine/stock-transfer/stock-family-business-lot";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { basisToFraction } from "@/lib/tax-engine/family-business-applied-rate";
import { isFamilyBusinessCgtEra } from "@/lib/tax-engine/data/family-business-cgt-era";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { AcquisitionLotForm } from "@/lib/stores/calc-wizard-stock-types";
import type { StockFbFields } from "@/lib/calc/stock-family-business";

type Props =
  | {
      /** 단건 취득 — 폼 전역 7필드 */
      form: StockTransferFormData;
      onChange: (patch: Partial<StockTransferFormData>) => void;
      lot?: undefined;
    }
  | {
      /** 취득 lot 축 — `form`은 시장·취득방식·매도일·배정방법을 읽는 맥락이고, 값은 `lot`의 7필드다 */
      form: StockTransferFormData;
      lot: AcquisitionLotForm;
      /** 0-based lot 행 — 표시 번호·testid·field 경로에 쓰인다 */
      lotIndex: number;
      onLotChange: (patch: Partial<AcquisitionLotForm>) => void;
      onChange?: undefined;
    };

/** 이력 불러오기 직후 안내 — 화면 내 참고용(저장하지 않는다) */
type PrefillNote =
  | { kind: "applied"; reference: number; basisFilled: boolean }
  | { kind: "mismatch"; inheritanceDate: string; acquisitionDate: string };

export function StockFamilyBusinessCard(props: Props) {
  const { form } = props;
  // 좁힌 두 변형 — 단건이면 `single`, lot 축이면 `lotProps`(둘 중 하나만 값이 있다)
  const lotProps = props.lot !== undefined ? props : null;
  const singleOnChange = props.lot === undefined ? props.onChange : null;
  const lot = lotProps?.lot;
  const lotIndex = lotProps?.lotIndex ?? 0;

  const [lookupOpen, setLookupOpen] = useState(false);
  const [note, setNote] = useState<PrefillNote | null>(null);

  const visible = lot ? isStockFbLotCardVisible(form, lot) : isStockFbCardVisible(form);
  if (!visible) return null;

  /** 7필드 — 단건은 폼, lot은 lot(없는 값은 factory와 같은 기본값). 변경은 같은 이름의 patch로 각자의 store에 쓴다 */
  const fields: StockFbFields = lot ? lotFbFields(lot) : form;
  const patch = (p: Partial<StockFbFields>) => {
    if (lotProps) lotProps.onLotChange(p);
    else singleOnChange?.(p);
  };
  /** testid 접두 — 단건은 기존 `stock-fb-*` 그대로, lot은 `stock-fb-lot-{행}-*` */
  const tid = lot ? `stock-fb-lot-${lotIndex}` : "stock-fb";
  /** 검증 오류 field 경로 — lot은 `acquisitionLots[i].…`(⑧과 같은 경로) */
  const fieldPath = (name: string) => (lot ? `acquisitionLots[${lotIndex}].${name}` : name);

  const blockedReason = lot ? stockFbLotBlockedReason(form, lot) : stockFbBlockedReason(form);
  const on = lot ? isStockFbLotOn(form, lot) : isStockFbOn(form);
  const saleEra = lot ? stockFbLotSaleEra(form) : { era: stockFbRateEra(form.transferDate), straddle: false };
  // 매도일이 2026.2.27.을 사이에 두면 한 쌍을 정할 수 없다 — 입력칸을 열지 않고 사유를 보인다
  const era = saleEra.straddle ? null : saleEra.era;

  /** 이력 불러오기(단건 전용) — 1주당 평가액(위 취득가액 칸)은 덮어쓰지 않고 참고값만 남긴다(Q-8). */
  function handlePrefill(prefill: FamilyBusinessInheritancePrefill) {
    if (!singleOnChange) return;
    // 취득일(= 상속개시일)이 이미 있고 이력의 상속개시일과 다르면 다른 상속 건이다 — 적용하지 않는다(후보 비선택).
    if (form.acquisitionDate && form.acquisitionDate !== prefill.inheritanceDate) {
      setNote({ kind: "mismatch", inheritanceDate: prefill.inheritanceDate, acquisitionDate: form.acquisitionDate });
      return;
    }
    const patch: Partial<StockTransferFormData> = {};
    if (!form.acquisitionDate) patch.acquisitionDate = prefill.inheritanceDate;
    const basis = prefill.fbRateBasis;
    if (basis?.kind === "deduction_ratio") {
      patch.fbDeductionAmount = String(basis.deductionAmount);
      patch.fbBusinessEstateValue = String(basis.businessEstateValue);
    } else if (basis?.kind === "corporate_business_assets") {
      patch.fbCorpTotalAssets = String(basis.totalAssets);
      patch.fbCorpNonBusinessAssets = String(basis.nonBusinessAssets);
    } else if (prefill.rateUnavailable) {
      // 산정 불가 — 1·0으로 채우지 않고 빈칸으로 두어 ⑧이 직접 입력을 요구한다(자동 fallback 금지)
      if (era === "corporate_business_assets") {
        patch.fbCorpTotalAssets = "";
        patch.fbCorpNonBusinessAssets = "";
      } else {
        patch.fbDeductionAmount = "";
        patch.fbBusinessEstateValue = "";
      }
    }
    singleOnChange(patch);
    setNote({ kind: "applied", reference: prefill.inheritanceMarketValue, basisFilled: basis !== undefined });
  }

  // 의제 취득가액 미리보기 — 단건 전용·입력이 완결일 때만(엔진 leaf를 그대로 호출). lot은 배정 주식수가 정해져야 값이 나온다.
  const preview = on && !lot ? previewStockFbAcquisitionPrice(form) : null;
  const fb = on && !lot ? buildStockFamilyBusinessInput(form) : null;
  const shares = parseIntOrUndef(lot ? lot.shareCount : form.shareCount) ?? 0;
  const acquisitionDate = toOptionalDate(lot ? lot.acquisitionDate : form.acquisitionDate);
  const cgtEraOk = acquisitionDate ? isFamilyBusinessCgtEra(acquisitionDate) : true;
  const frac = fb && preview !== null ? basisToFraction(fb.fbRateBasis) : null;
  const valuation =
    form.acquisitionActualInputMode === "total"
      ? (parseIntOrUndef(form.acquisitionTotalPrice) ?? 0)
      : (parseIntOrUndef(form.perShareAcquisitionPrice) ?? 0) * shares;

  return (
    <ToggleCard
      tone="emerald"
      checked={on}
      onCheckedChange={(v) => patch({ familyBusinessInheritance: v })}
      // 막힌 상태에서는 켜지 않는다. 남은 값은 inert라(④ 미전송·⑧ 미검증) 끌 곳이 없어도 막다른 길이 아니다.
      disabled={blockedReason !== null}
      disabledReason={blockedReason ?? undefined}
      title={lot ? `가업상속공제 적용 주식 — 매수 #${lotIndex + 1} (소법 §97의2④)` : "가업상속공제 적용 주식 (소법 §97의2④)"}
      description={
        on
          ? "의제 취득가액 적용 — 피상속인 취득가액 × 적용률 + 상속개시일 평가액 × (1 − 적용률)"
          : "가업상속공제를 받은 주식을 양도하는 경우 취득가액 특례 (소득세법 §97의2④, 시행령 §163의2③)"
      }
      data-testid={`${tid}-toggle`}
    >
      {on && (
        <div className="space-y-3 mt-2" data-testid={`${tid}-body`}>
          <div className="flex flex-wrap items-center gap-1.5">
            <LawArticleModal legalBasis="소득세법 §97의2 ④" label="§97의2④" />
            <LawArticleModal legalBasis="소득세법 시행령 §163의2 ③" label="시행령 §163의2③" />
            <LawArticleModal legalBasis="소득세법 시행령 §163의2 ④" label="시행령 §163의2④" />
            <LawArticleModal legalBasis="상속세및증여세법 §18의2" label="상증법 §18의2" />
          </div>

          {/* 이력 불러오기 — 법인 주식 후보 · 양도일 era별 법정량 (단건 전용 — lot은 직접 입력) */}
          {!lot && (
            <ToneCard tone="emerald" bodyClassName="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-emerald-800 dark:text-emerald-200">
                  <p className="font-semibold">상속세 이력에서 불러오기</p>
                  <p className="text-micro text-emerald-700 mt-0.5 dark:text-emerald-400">
                    상속개시일·적용률 법정량을 채웁니다 — 1주당 취득가액(상속개시일 평가액)은 바꾸지 않고 참고값만 보여줍니다
                  </p>
                </div>
                <Button
                  type="button"
                  variant="modalLauncher"
                  size="xs"
                  disabled={!form.transferDate}
                  onClick={() => setLookupOpen(true)}
                  data-testid="stock-fb-lookup-open"
                >
                  📋 이력 조회
                </Button>
              </div>
              {!form.transferDate && (
                <p className="text-micro text-emerald-700 dark:text-emerald-400">
                  양도일(1단계)을 입력하면 이력 조회가 열립니다 — 양도일에 따라 적용률의 법정량이 달라집니다.
                </p>
              )}
              {note?.kind === "applied" && (
                <p className="text-xs text-emerald-800 dark:text-emerald-200" data-testid="stock-fb-lookup-note">
                  이력의 상속개시일 평가액(참고 · 해당 가업 자산 총액): {note.reference.toLocaleString()} — 위 취득가액 칸은 바꾸지 않았습니다.
                  양도하는 주식분의 평가액과 같은지 확인하세요.
                  {!note.basisFilled && " 이력에서 적용률의 법정량(금액)을 구할 수 없어 아래 적용률 칸은 직접 입력해야 합니다."}
                </p>
              )}
              {note?.kind === "mismatch" && (
                <p className="text-xs text-amber-800 dark:text-amber-200" data-testid="stock-fb-lookup-note">
                  선택한 이력의 상속개시일({note.inheritanceDate})이 입력한 취득일({note.acquisitionDate})과 달라 적용하지 않았습니다.
                </p>
              )}
            </ToneCard>
          )}

          {!lot && (
            <FamilyBusinessInheritanceHistoryModal
              open={lookupOpen}
              onOpenChange={setLookupOpen}
              currentTransferDate={form.transferDate}
              onSelect={handlePrefill}
              target="stock"
            />
          )}

          {/* ① 피상속인 1주당 취득가액 */}
          <CurrencyInput
            label="피상속인의 1주당 취득가액 (원)"
            required
            hint="소법 §97의2④1호 — 피상속인의 취득가액(소법 §97①1호). 실지거래가액이 원칙이며, 확인할 수 없는 경우에 한정해 매매사례가액·감정가액·환산취득가액을 순차 적용합니다. 상속개시일 이전에 취득한 날의 1주당 금액을 입력하세요"
            value={fields.fbDecedentPerSharePrice}
            onChange={(v) => patch({ fbDecedentPerSharePrice: v })}
            data-field={fieldPath("fbDecedentPerSharePrice")}
            data-testid={`${tid}-decedent-per-share`}
          />

          {/* ② 피상속인 자본적지출 (선택) */}
          <CurrencyInput
            label={
              lot
                ? "피상속인 자본적 지출액 — 이 lot 전체 주식수에 대한 총액 (원, 선택)"
                : "피상속인 자본적 지출액 — 양도하는 주식분 총액 (원, 선택)"
            }
            hint={
              lot
                ? "피상속인이 보유 중 이 lot의 주식에 지출한 금액의 총액(1주당 아님 · 이 lot 전체 주식수 기준). 매도에 배정된 주식수 몫만 취득가액에 산입됩니다. 피상속인 취득가액에 합산한 뒤 적용률을 곱합니다 — 이 합산은 해석례가 확인되지 않은 처리입니다. 없으면 비워두세요"
                : "피상속인이 보유 중 그 주식에 지출한 금액 중 양도하는 주식분의 총액(1주당 아님). 피상속인 취득가액에 합산한 뒤 적용률을 곱합니다 — 이 합산은 해석례가 확인되지 않은 처리입니다. 없으면 비워두세요"
            }
            value={fields.fbDecedentCapitalExpenditure}
            onChange={(v) => patch({ fbDecedentCapitalExpenditure: v })}
            data-field={fieldPath("fbDecedentCapitalExpenditure")}
            data-testid={`${tid}-decedent-capex`}
          />

          {/* ③ 가업상속공제적용률 — 양도일(lot은 매도일)에서 파생된 법정량 쌍 */}
          {era === "deduction_ratio" && (
            <FieldCard
              label="가업상속공제적용률"
              required
              hint={
                <>
                  {lot ? "매도일이" : "양도일이"} 2026.2.26. 이전 — 구 소득세법 시행령 §163의2③{" "}
                  <Frac top="가업상속공제금액" bottom="가업상속 재산가액" />
                </>
              }
            >
              <div className="space-y-2" data-testid={`${tid}-pair-deduction`}>
                <CurrencyInput
                  label="가업상속공제금액 (원)"
                  hint="상속세 과세가액에서 공제한 가업상속공제액(상증법 §18의2①)"
                  value={fields.fbDeductionAmount}
                  onChange={(v) => patch({ fbDeductionAmount: v })}
                  data-field={fieldPath("fbDeductionAmount")}
                  data-testid={`${tid}-deduction-amount`}
                />
                <CurrencyInput
                  label="가업상속 재산가액 (원)"
                  hint="상증법 §18의2① 각 호 외의 부분 전단에 따른 가업상속 재산가액"
                  value={fields.fbBusinessEstateValue}
                  onChange={(v) => patch({ fbBusinessEstateValue: v })}
                  data-field={fieldPath("fbBusinessEstateValue")}
                  data-testid={`${tid}-estate-value`}
                />
              </div>
            </FieldCard>
          )}
          {era === "corporate_business_assets" && (
            <FieldCard
              label="가업상속공제적용률"
              required
              hint={
                <>
                  {lot ? "매도일이" : "양도일이"} 2026.2.27. 이후 — 소득세법 시행령 §163의2③2호 (법인가업){" "}
                  <Frac top="법인 총자산가액 − 사업무관자산가액" bottom="법인 총자산가액" />
                </>
              }
            >
              <div className="space-y-2" data-testid={`${tid}-pair-corporate`}>
                <CurrencyInput
                  label="법인 총자산가액 (원)"
                  hint="상속개시일 현재 법인의 총자산가액 — 상증법 제4장에 따라 평가한 가액"
                  value={fields.fbCorpTotalAssets}
                  onChange={(v) => patch({ fbCorpTotalAssets: v })}
                  data-field={fieldPath("fbCorpTotalAssets")}
                  data-testid={`${tid}-corp-total-assets`}
                />
                <CurrencyInput
                  label="사업무관자산가액 (원)"
                  hint="상증령 §15⑤2호의 사업무관자산 — 없으면 0을 입력하세요"
                  value={fields.fbCorpNonBusinessAssets}
                  onChange={(v) => patch({ fbCorpNonBusinessAssets: v })}
                  data-field={fieldPath("fbCorpNonBusinessAssets")}
                  data-testid={`${tid}-corp-non-business`}
                />
              </div>
            </FieldCard>
          )}
          {era === null && !saleEra.straddle && (
            <p className="text-xs text-muted-foreground" data-testid={`${tid}-era-pending`}>
              적용률 입력칸은 {lot ? "매도일(1단계 매도 건)" : "양도일(1단계)"}에서 정해집니다 — {lot ? "매도일" : "양도일"}을 먼저 입력하세요
              (2026.2.26. 이전은 공제금액·가업상속 재산가액, 2026.2.27. 이후는 법인 총자산가액·사업무관자산가액).
            </p>
          )}
          {saleEra.straddle && (
            <ToneCard tone="rose" title="매도일이 적용률 법정량 시대를 걸칩니다" bodyClassName="space-y-1">
              <p role="alert" className="text-xs text-rose-800 dark:text-rose-200" data-testid={`${tid}-straddle`}>
                {STOCK_FB_LOT_STRADDLE_MESSAGE}
              </p>
            </ToneCard>
          )}

          {/* 읽기 문구 — 같은 값을 두 번 받지 않는다 */}
          <ToneCard tone="sky" bodyClassName="space-y-1">
            {lot ? (
              <>
                <p className="text-xs text-sky-800 dark:text-sky-200">
                  상속개시일 = 이 매수 건의 <strong>취득일</strong> · 상속개시일 평가액 = 이 매수 건의 <strong>1주당 단가</strong>입니다 — 여기서 다시 입력하지 않습니다.
                </p>
                <p className="text-micro text-sky-700 dark:text-sky-400">
                  이 매수 건 중 매도에 배정된 주식수만큼만 의제 취득가액이 적용됩니다 — 가업상속공제를 받은 주식과 받지 않은 주식은 매수 건을 나누어 입력하세요.
                  배정 결과는 취득가액 미리보기·결과 화면에서 확인합니다.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-sky-800 dark:text-sky-200">
                  상속개시일 = 위 <strong>취득일</strong> · 상속개시일 평가액 = 위 <strong>취득가액</strong>(1주당 또는 합계)입니다 — 여기서 다시 입력하지 않습니다.
                </p>
                <p className="text-micro text-sky-700 dark:text-sky-400">
                  가업상속공제를 받은 주식과 받지 않은 주식이 섞여 있으면 양도하는 주식분만 이 입력으로 계산되도록 종목(또는 취득 건)을 나누어 입력하세요.
                </p>
              </>
            )}
          </ToneCard>

          {lot && form.costAllocationMethod === "moving_avg" && (
            <ToneCard tone="amber" title="이동평균법 — 가업상속 주식 구분 관리 확인 필요" bodyClassName="space-y-1">
              <p className="text-xs text-amber-800 dark:text-amber-200" data-testid={`${tid}-moving-avg-notice`}>
                {FB_MOVING_AVG_NOTICE}
              </p>
            </ToneCard>
          )}

          {!cgtEraOk && (
            <ToneCard tone="amber" title="§97의2④ 의제 취득가액 특례 미적용" bodyClassName="space-y-1">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                상속개시일이 2014.1.1. 전이라 「소득세법」 부칙(법률 제12169호) §12의 적용 대상이 아닙니다. 일반 §97 산식으로 계산됩니다.
              </p>
            </ToneCard>
          )}

          {/* 의제 취득가액 미리보기 — 엔진 leaf 값 */}
          {cgtEraOk && preview !== null && fb && frac && (
            <ToneCard tone="emerald" title="의제 취득가액 미리보기 (소법 §97의2④)" bodyClassName="space-y-1">
              <p className="text-xs text-emerald-700 dark:text-emerald-300" data-testid={`${tid}-preview`}>
                피상속인 {fb.decedentCapitalExpenditure ? "(" : ""}취득가액 {(fb.decedentAcquisitionPricePerShare * shares).toLocaleString()}
                {fb.decedentCapitalExpenditure ? ` + 자본적지출 ${fb.decedentCapitalExpenditure.toLocaleString()})` : ""}
                {" × "}
                {formatFractionPercent(frac.numerator, frac.denominator)}%{" + "}상속개시일 평가액 {valuation.toLocaleString()}
                {" × "}
                {formatFractionPercent(frac.denominator - frac.numerator, frac.denominator)}%{" = "}
                <strong>{preview.toLocaleString()}</strong>
              </p>
              <p className="text-micro text-emerald-700 dark:text-emerald-400">※ 최종 의제 취득가액은 계산 결과 화면에서 확인하세요.</p>
            </ToneCard>
          )}

          {/* §97의2④ 강제 적용 · §18의2⑩ 안내 — 이 양도세에서 빼지 않는다 */}
          {cgtEraOk && (
            <ToneCard tone="rose" title="소법 §97의2④ 본문 강제 적용" bodyClassName="space-y-1">
              <p className="text-xs text-rose-800 dark:text-rose-200">
                의제 취득가액이 일반 §97 취득가액과 달라도 반드시 적용됩니다.
              </p>
              <p className="text-xs text-rose-800 dark:text-rose-200">
                상증법 §18의2⑩의 양도소득세 상당액은 가업상속 사후관리로 상속세를 추징할 때 상속세 산출세액에서 빼는 금액입니다 —
                이 양도소득세에서 빼지 않으며, 결과 화면에는 안내용으로만 표시됩니다.
              </p>
            </ToneCard>
          )}
        </div>
      )}
    </ToggleCard>
  );
}
