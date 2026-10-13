"use client";

/**
 * 부담부증여 양도소득세 — **주택** 필드 세트 (`BurdenedGiftTransferSection`의 housing 분기)
 *
 * 2026-09-28 E-1 후속: 800줄 정책으로 `BurdenedGiftTransferSection.tsx`에서 분리했다(종전 JSX·testid 그대로).
 * 같은 작업으로 1세대1주택 후속 입력을 붙였다 — 모두 양도세 계산기·판정 메뉴의 **같은 위젯**이다
 * (평행 UI를 만들지 않는다). 게이트·조립은 `lib/calc/gift-burdened-one-house.ts` 한 곳이다(④⑧ 공용).
 *
 *   · 증여 주택 주소(PNU 앞 10자리)가 있으면 취득시 조정대상지역은 주소로 자동 판정(토글 대신 결과 표시)
 *     · 양도시 조정대상지역 토글은 안 만졌으면 주소 판정을 따르고, 만지면 그 선택이 주소 판정을 이긴다(E-1 잔여 A). 양도세 계산기는 주소가
       있으면 이 토글을 숨기고 주소 판정만 쓰므로(결정 #5, G7-6) 이 화면은 계산기와 다르다 — 정렬 여부(옵션 C)는 별도 결정이다
 *     · §155①2호 종전 주택 조정 여부도 주소로 판정(`TempTwoHouseRegulatedInputs`가 결과만 보여 준다)
 *   · §155①2호 신규 주택 소재지(E-1 잔여 B) — 같은 주소 위젯 한 칸 → 신규 주택 조정 여부도 자동 판정
 *   · §154① 단서(삭제 전 4호 OH-38 포함) — `ExemptionProvisoSection`
 *   · §154⑤ 단서 최종 1주택 재기산(OH-22) — `FinalHouseRestartSection`
 *   · §155⑳ 장기임대주택 보유자 거주주택 특례(E-1 잔여 C — ㉓ 말소일 포함) — `RentalHousingExceptionSection`
 *   · 상속받은 주택(E-1 잔여 D — §104②1호 세율 보유기간 · §154⑧3호 동일세대 통산) — `InheritedSameHouseholdField`
 *   · §155의3 상생임대주택 거주기간 면제(E-1 한계 G2) — `WinWinRentalSpecialField`
 *   · §155⑯ 공공기관 이전 · §155⑱ 처분 지연 사유(E-1 한계 G3) — `TempTwoHouseRelocationInputs` · `TempTwoHouseDelayReasonInput`
 *   · §155④⑤ 합가(E-1 한계 G4) — `MergeDateSection`
 */
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { CollapsibleHintCard } from "@/components/calc/shared/CollapsibleHintCard";
import { TempTwoHouseRegulatedInputs } from "@/components/calc/transfer/TempTwoHouseRegulatedInputs";
import { ExemptionProvisoSection } from "@/components/calc/transfer/ExemptionProvisoSection";
import { FinalHouseRestartSection } from "@/components/calc/transfer/FinalHouseRestartSection";
import { InheritedSameHouseholdField } from "@/components/calc/transfer/InheritedSameHouseholdField";
import { RentalHousingExceptionSection } from "@/components/calc/transfer/RentalHousingExceptionSection";
import { WinWinRentalSpecialField } from "@/components/calc/transfer/WinWinRentalSpecialField";
import { MergeDateSection } from "@/components/calc/transfer/MergeDateSection";
import { DeclaredNewHouseOriginBlock } from "@/components/calc/transfer/DeclaredNewHouseOriginBlock";
import {
  giftBurdenedRentalAsset,
  giftBurdenedRentalExceptionInScope,
  giftBurdenedRentalHousingException,
} from "@/lib/calc/gift-burdened-rental-exception";
import { ValuationModeSection } from "./BurdenedGiftValuationModeSection";
import { GIFT_BURDENED_ONE_HOUSEHOLD_OFF_HINT } from "@/lib/calc/gift-burdened-household-notice";
import { giftBurdenedValuationBasis } from "@/lib/calc/gift-burdened-valuation-basis";
import { dateToStr, strToDate } from "./burdened-gift-dates";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import {
  giftBurdenedDeadlineExceptionFields,
  giftBurdenedDeadlineExceptionPatch,
  giftBurdenedNewAcquisitionDatePatch,
  giftBurdenedNewHouseAddressPatch,
  giftBurdenedPreviousAcquisitionDate,
  giftBurdenedTempTwoHouseDeadlineInScope,
  giftBurdenedTempTwoHouseRegulatedGate,
} from "@/lib/calc/gift-burdened-temp-two-house";
import {
  TempTwoHouseDelayReasonInput,
  TempTwoHouseRelocationInputs,
} from "@/components/calc/transfer/TempTwoHouseDeadlineExceptionInputs";
import { judgeRelocationRegion } from "@/lib/calc/relocation-region-verdict";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { DesignatedDistrictQuestion } from "@/components/calc/transfer/DesignatedDistrictQuestion";
import {
  giftBurdenedEffectiveIsRegulatedArea,
  giftBurdenedFinalHouseRestartInScope,
  giftBurdenedInheritanceSlice,
  giftBurdenedOneHouseSlice,
  giftBurdenedProvisoMode,
  giftBurdenedRegionCode,
  giftBurdenedRegulatedByAddress,
  giftBurdenedEffectiveWasRegulatedAtAcquisition,
  giftBurdenedMergeInScope,
  giftBurdenedMergeSlice,
  giftBurdenedThreeHouseMergeNoticeNeeded,
  giftBurdenedWinWinInScope,
  giftBurdenedWinWinSlice,
} from "@/lib/calc/gift-burdened-one-house";

export interface HousingFieldSetProps {
  bgt: BurdenedGiftTransferTaxInput;
  set: (patch: Partial<BurdenedGiftTransferTaxInput>) => void;
  referenceDate: string;
  stdPriceLabel: string;
  stdPriceHint: string;
  /** 양도시(증여시) 기준시가 — item.standardPrice (평가 '보충적 평가'와 동일 필드) */
  transferStdPrice: number | undefined;
  onTransferStdPriceChange: (v: number | undefined) => void;
  transferStdPriceLabel: string;
  isLand: boolean;
  item: EstateItem;
  transferDate?: string;
}

export function HousingFieldSet({ bgt, set, referenceDate, stdPriceLabel, stdPriceHint, transferStdPrice, onTransferStdPriceChange, transferStdPriceLabel, item, transferDate }: HousingFieldSetProps) {
  const householdCount = bgt.householdHousingCount ?? 1;
  // §155①2호 새 입력(A2b · E-1) — ⑧과 같은 게이트. 두 주택 조정 여부가 기한을 바꾸는 시기에만 연다.
  //   증여 주택 주소가 있으면 종전 주택 조정 여부는 주소로 자동 판정된다(④가 싣는 `regionCode`와 같은 값).
  const regionCode = giftBurdenedRegionCode(item);
  const eraGate = giftBurdenedTempTwoHouseRegulatedGate(bgt, transferDate, regionCode);
  const byAddress = giftBurdenedRegulatedByAddress(
    regionCode,
    bgt.acquisitionDate,
    transferDate,
    bgt.regionInDesignatedDistrict,
  );
  // 「양도시 조정대상지역」 실효값 — ④⑧과 같은 leaf(E-1 잔여 A)
  const regulatedAtGift = giftBurdenedEffectiveIsRegulatedArea(bgt, regionCode, transferDate);
  // §154① 단서·§154⑤ 단서 재기산(E-1 후속) — ④·⑧과 같은 게이트
  const provisoMode = giftBurdenedProvisoMode(bgt);
  const oneHouse = giftBurdenedOneHouseSlice(bgt, transferDate);
  const restartInScope = giftBurdenedFinalHouseRestartInScope(bgt, transferDate);
  // 평가방식은 증여세 평가에서 파생한다(1h-G1-2 · 결정 #23) — ④·⑧과 같은 leaf.
  const valuation = giftBurdenedValuationBasis(item);
  const isMarketMode = valuation.mode === "sangjeungbeop_market";
  const collateralForced = isMarketMode && valuation.collateralForcesStandardAcquisition;
  // 시가 모드 + 실지취득가액(K-4): 비-토지 자산은 취득시 기준시가가 결과에 무영향 → 입력 불필요. 담보평가 승은 기준시가를 쓰므로 필수.
  const acqStdInert = isMarketMode && !collateralForced && bgt.acquisitionMethod === "actual";
  // 양도시 기준시가(공시가격)는 기준시가 안분·담보평가 승·환산(K-5)의 분모에 쓰인다 — 실지(K-4)에서는 쓰이지 않는다.
  const transferStdRequired = !isMarketMode || collateralForced || bgt.acquisitionMethod === "converted";
  // §155⑯·⑱(E-1 한계 G3) — ④와 같은 필드 파생(신규 주택 시·군 코드는 소재지 법정동코드에서)
  const deadlineFields = giftBurdenedDeadlineExceptionFields(bgt);
  return (
    <div className="space-y-2">
      {/* 취득일 */}
      <FieldCard label="취득일 (증여자 당초 취득일)" required>
        <DateInput
          value={
dateToStr(bgt.acquisitionDate)
          }
          onChange={(v) => {
            const d = strToDate(v);
            set({ acquisitionDate: d as unknown as Date });
          }}
          data-testid="bg-transfer-acq-date"
        />
      </FieldCard>

      {/* 상속받은 주택(E-1 잔여 D) — 판정 메뉴와 같은 위젯. 「위 취득일에는 상속개시일」 안내가 붙으므로
          취득일 바로 뒤에 둔다. ④·⑧은 같은 slice(`giftBurdenedInheritanceSlice`)를 본다. */}
      <InheritedSameHouseholdField asset={giftBurdenedInheritanceSlice(bgt)} onChange={(patch) => set(patch)} />
      {/* 결정 #38 범위 밖 고지 — 증여자가 이 주택을 증여받아 취득했다면 같은 세대 증여의 보유기간 통산은 이 화면에서 입력받지 않는다.
          판정 메뉴·양도세 계산기(이월과세)는 같은 사실을 받아 통산한다. 모르는 사실을 유리하게 읽지 않는다 — 증여일 기준으로 계산한다. */}
      <p className="text-caption text-muted-foreground" data-testid="bg-transfer-gift-household-out-of-scope">
        이 주택을 증여받아 취득했다면 취득일에는 증여받은 날을 입력하세요. 증여자와 계속 같은 세대였다면 증여자 세대의 보유기간을 1세대1주택
        비과세 판정에 통산하지만, 이 화면은 그 사실을 입력받지 않아 증여일부터 보유기간을 세어 판정합니다 — 같은 세대였다면 결과가 달라질 수
        있으니 확인이 필요합니다. 1세대1주택 판정 메뉴에서 같은 사실을 입력해 판정할 수 있습니다.
      </p>

      {/* 취득시 기준시가 */}
      <FieldCard
        label={stdPriceLabel}
        hint={
          acqStdInert
            ? "실지취득가액(K-4) 모드에서는 입력하지 않아도 됩니다 — 결과(양도차익)에 영향 없음."
            : stdPriceHint
        }
        required={!acqStdInert}
      >
        <CurrencyInput
          label={stdPriceLabel}
          value={bgt.standardPriceAtAcquisition > 0 ? String(bgt.standardPriceAtAcquisition) : ""}
          onChange={(v) => set({ standardPriceAtAcquisition: parseAmount(v) || 0 })}
          hideLabel
          hideUnit
          data-testid="bg-transfer-acq-stdprice"
        />
      </FieldCard>

      {/* 평가방식·취득가액 산정 (K-4/K-5) — 평가방식은 증여세 평가에서 파생(읽기 전용) */}
      <ValuationModeSection bgt={bgt} set={set} item={item} isLandType={false} />

      {/* 양도시 기준시가 — 평가 입력의 '보충적 평가(기준시가)'와 같은 한 칸. 기준시가 안분·담보평가 승·환산(K-5)에서 필수 */}
      <FieldCard
        label={transferStdPriceLabel}
        hint={
          transferStdRequired
            ? "증여일(양도일) 현재 기준시가. §159 안분·환산에 사용 — 평가 입력의 '보충적 평가(기준시가)'와 동일 값입니다."
            : "실지취득가액(K-4)에서는 입력하지 않아도 됩니다 — 평가 입력의 '보충적 평가(기준시가)'와 동일 값입니다."
        }
        required={transferStdRequired}
      >
        <CurrencyInput
          label={transferStdPriceLabel}
          value={transferStdPrice && transferStdPrice > 0 ? String(transferStdPrice) : ""}
          onChange={(v) => onTransferStdPriceChange(parseAmount(v) || undefined)}
          hideLabel
          hideUnit
          data-testid="bg-transfer-transfer-stdprice"
        />
      </FieldCard>

      {/* 일부 지분만 증여(1h-G1-6) — 12억 고가주택 판정은 물건 전체 가액 기준(소령 §156①·§160①)인데 이 화면에는 지분율·
          물건 전체 가액 칸이 없다. 켜면 ⑧이 막고 양도소득세 계산기로 안내한다(`giftBurdenedPartialOwnershipError`). */}
      <ToggleCard
        tone="amber"
        size="sm"
        title="물건의 일부 지분만 증여 (나머지 지분은 타인 소유)"
        description="ON이면 이 화면에서는 양도소득세를 함께 계산할 수 없습니다 — 12억 고가주택 판정이 물건 전체 가액 기준이라 양도소득세 계산기(공유 지분 + 부담부증여)에서 계산하세요."
        checked={bgt.isPartialOwnershipGift === true}
        onCheckedChange={(v) => set({ isPartialOwnershipGift: v || undefined })}
        data-testid="bg-transfer-partial-ownership"
      />

      {/* 1세대1주택 여부 */}
      {/* 엔진 필드 `isOneHousehold`는 «1세대에 해당하는가»(소득세법 §88 6호)다 — 1세대1주택 요건 충족 여부가 아니다(1h-G1-7 · 결정 #24).
          기본값 OFF는 그대로 두고, 끄면 무엇이 판정되지 않는지 늘 보인다. 결론을 가를 때의 결과 고지는 결과 카드가 낸다. */}
      <ToggleCard
        tone="emerald"
        size="sm"
        title="증여자 세대가 1세대에 해당 (소득세법 §88 6호)"
        description={`독립적인 생계를 유지하는 세대에 해당하면 ON — 1세대1주택 비과세 판정 및 장기보유특별공제 표2 적용. ${GIFT_BURDENED_ONE_HOUSEHOLD_OFF_HINT}`}
        checked={bgt.isOneHousehold ?? false}
        onCheckedChange={(v) =>
          set({
            isOneHousehold: v || undefined,
            residencePeriodMonths: v ? bgt.residencePeriodMonths : undefined,
          })
        }
        data-testid="bg-transfer-one-house"
      />

      {/* 세대 보유 주택 수 */}
      <FieldCard
        label="세대 보유 주택 수 (증여자 기준)"
        hint="증여자 세대가 보유한 주택 수. 비과세·중과 판정용."
      >
        <DecimalInput
          value={householdCount > 0 ? String(householdCount) : "1"}
          onChange={(v) =>
            set({ householdHousingCount: Math.max(1, parseDecimal(v) || 1) })
          }
          data-testid="bg-transfer-house-count"
        />
      </FieldCard>
      {/* §154⑨ 같은 날 양도 순서(결정 #40) — 이 화면은 보유 주택 목록이 없어 순서를 따로 받지 않는다. 길어서 접힘 카드로 둔다(안내문 길이 가드). */}
      <CollapsibleHintCard tone="slate" summary="같은 날 다른 주택도 양도한다면">
        <p data-testid="bg-transfer-same-day-hint" className="leading-relaxed">
          증여(양도)하는 주택과 같은 날 다른 주택도 양도한다면 거주자가 선택한 순서대로 양도한 것으로 보므로(소득세법 시행령 §154⑨, 중과는 §167의3⑥ 준용)
          먼저 양도하는 주택은 뺀 수를 입력하세요 — 이 화면에는 보유 주택 목록이 없어 순서를 따로 받지 않습니다. 같은 날 증여한 주택에는 쓰지 않습니다(확인 필요).
        </p>
      </CollapsibleHintCard>

      {/* 지정 지구 안인가(#2055 후속) — 증여 주택 법정동이 「동 안 일부 지구만 조정대상지역」일 때만 뜬다. 아래 두 조정
          판정(양도시·취득시)과 ④·⑧이 같은 답을 쓴다. 소재지가 바뀌면 답을 지운다(`giftBurdenedDistrictResetPatch`). */}
      <DesignatedDistrictQuestion
        regionCode={regionCode}
        value={bgt.regionInDesignatedDistrict}
        onChange={(regionInDesignatedDistrict) => set({ regionInDesignatedDistrict })}
        idSuffix="bg-gift-house"
      />

      {/* 양도시 조정대상지역 — E-1 잔여 A: 주소가 있으면 안 만진 토글은 주소 판정을 따르고, 만지면 그 선택을 저장해 주소보다
          우선한다. ④·⑧은 같은 leaf(`giftBurdenedEffectiveIsRegulatedArea`). ⚠️ 양도세 계산기는 주소가 있으면 이 토글을 숨기고 주소
          판정만 쓴다(결정 #5, G7-6) — 이 화면의 「직접 선택이 주소를 이긴다」는 계산기와 다른 규칙이다(정렬은 별도 결정). */}
      <ToggleCard
        tone="rose"
        size="sm"
        title="양도시(증여일) 조정대상지역"
        description={
          byAddress.atGift === undefined
            ? "증여일 기준 조정대상지역이면 ON."
            : bgt.isRegulatedArea === undefined
              ? `소재지 주소로 증여일 현재 ${byAddress.atGift ? "조정대상지역" : "조정대상지역 아님"}으로 자동 판정했습니다. 직접 바꾸면 그 선택을 따릅니다 — 중과·단기세율 판정에 쓰입니다.`
              : `증여일 기준 조정대상지역이면 ON. 소재지 주소로는 증여일 현재 ${byAddress.atGift ? "조정대상지역" : "조정대상지역 아님"}입니다 — 직접 선택한 값으로 판정합니다.`
        }
        checked={regulatedAtGift}
        onCheckedChange={(v) => set({ isRegulatedArea: v })}
        data-testid="bg-transfer-regulated"
      />

      {/* 취득시 조정대상지역 — 주소(법정동코드)가 있으면 엔진이 토글 대신 코드로 판정한다(양도세 계산기와 같은 우선순위 — 주소가 있으면 토글을 숨기고 코드로 판정).
          그때 토글을 두면 화면과 계산이 갈리므로 판정 결과만 보여 준다. */}
      {regionCode ? (
        <ToneCard tone="rose" title="취득시 조정대상지역" className="py-2">
          <p data-testid="bg-transfer-regulated-acq-auto" className="text-xs">
            {byAddress.atAcquisition === undefined
              ? "취득일을 입력하면 소재지 주소로 자동 판정합니다."
              : `${byAddress.atAcquisition ? "조정대상지역" : "조정대상지역 아님"} — 소재지 주소로 취득일 기준 자동 판정 (거주요건 판정에 사용)`}
          </p>
        </ToneCard>
      ) : (
        <ToggleCard
          tone="rose"
          size="sm"
          title="취득시 조정대상지역"
          description="취득일 기준 조정대상지역이면 ON. 2017.8.3 이전 취득 시 거주요건 면제."
          checked={bgt.wasRegulatedAtAcquisition ?? false}
          onCheckedChange={(v) =>
            set({ wasRegulatedAtAcquisition: v || undefined })
          }
          data-testid="bg-transfer-regulated-acq"
        />
      )}

      {/* 거주기간 — 1세대1주택 ON 시 노출 */}
      {(bgt.isOneHousehold) && (
        <FieldCard
          label="거주기간 (개월)"
          hint="1세대1주택 장특공제 표2 적용을 위한 거주기간 (개월 정수)."
          required
        >
          <div data-testid="bg-transfer-residence">
            <DecimalInput
              value={bgt.residencePeriodMonths !== undefined ? String(bgt.residencePeriodMonths) : ""}
              onChange={(v) =>
                set({ residencePeriodMonths: Math.max(0, Math.floor(parseDecimal(v) || 0)) })
              }
            />
          </div>
        </FieldCard>
      )}

      {/* §155의3 상생임대주택(E-1 한계 G2) — 판정 메뉴와 같은 위젯. 거주기간 요건(§154①·§155⑳1호·§159의4 표2)을
          면제하므로 거주기간 바로 뒤에 둔다. 게이트는 ④⑧과 같다(1세대 1주택 ON — `giftBurdenedWinWinInScope`). */}
      {giftBurdenedWinWinInScope(bgt) && (
        <WinWinRentalSpecialField value={giftBurdenedWinWinSlice(bgt)} onChange={(patch) => set(patch)} />
      )}

      {/* 일시적 2주택 — 세대 주택수 == 2인 경우 */}
      {householdCount === 2 && (
        <div className="rounded-md border border-sky-200 bg-sky-50/40 dark:border-sky-700 dark:bg-sky-900/15 p-3 space-y-2">
          <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">
            일시적 2주택 비과세 특례 (§155①)
          </p>
          {/* 종전 주택 = 이번에 증여(양도)하는 주택 — 취득일은 위 「취득일」 한 칸이 정본이다(1h-G1-3). 자유 입력으로 두면
              나중에 취득한 주택을 증여하면서 먼저 산 주택의 날짜를 넣어 비과세가 성립했다. ④·⑧·노출 게이트도 같은 leaf를 쓴다. */}
          <FieldCard
            label="종전 주택 취득일"
            hint="§155①의 종전 주택은 양도(증여)하는 주택입니다 — 위 「취득일 (증여자 당초 취득일)」과 같은 날로 판정합니다."
          >
            <p className="text-sm tabular-nums" data-testid="bg-transfer-prev-acq-date">
              {giftBurdenedPreviousAcquisitionDate(bgt) || "위 취득일을 입력하세요"}
            </p>
          </FieldCard>
          <FieldCard
            label="신규 주택 취득일"
            hint="증여하는 주택을 취득한 뒤 새로 취득한 다른 주택의 취득일입니다."
          >
            <DateInput
              value={
dateToStr(bgt.temporaryTwoHouse?.newAcquisitionDate)
              }
              onChange={(v) =>
                // 취득일을 비우고 쓴 항목이 없으면 객체를 되돌린다 — 한 글자만 쳐도 빈 객체가 남아 ⑧이 막던 갭(1h-G1-5)
                set({
                  temporaryTwoHouse: giftBurdenedNewAcquisitionDatePatch(
                    bgt.temporaryTwoHouse,
                    strToDate(v) as Date | undefined,
                    bgt.acquisitionDate,
                  ),
                })
              }
            />
          </FieldCard>
          {/* 신규 주택 취득 경위(결정 #43-4) — 이 화면에는 보유 주택 목록이 없어 양도세 명부 행의 경위 질문을 한 번만 받는다(같은 공용 블록).
              ④ 전송·⑧ 검증과 같은 값(`declared-new-house-origin.ts`) — 답하지 않으면 종전과 같이 취득일 그대로 판정 + 확인 필요. */}
          {bgt.temporaryTwoHouse && (
            <DeclaredNewHouseOriginBlock
              fields={bgt.temporaryTwoHouse}
              newAcquisitionDate={dateToStr(bgt.temporaryTwoHouse.newAcquisitionDate)}
              onChange={(patch) => set({ temporaryTwoHouse: { ...bgt.temporaryTwoHouse!, ...patch } })}
            />
          )}
          {/* 신규 주택 소재지(E-1 잔여 B) — 계산기는 보유 주택 명부 행 주소에서 코드를 얻는다. 이 화면엔 명부가 없어
              같은 주소 위젯으로 한 칸만 받는다. 코드가 있으면 아래 위젯이 신규 주택도 자동 판정한다(④⑧ 같은 값). */}
          {eraGate && bgt.temporaryTwoHouse && !(giftBurdenedTempTwoHouseDeadlineInScope(bgt) && bgt.temporaryTwoHouse.publicInstitutionRelocation) && (
            <FieldCard label="신규 주택 소재지" hint="신규 주택 취득일 현재 조정대상지역 여부를 주소로 판정합니다.">
              <div data-testid="bg-transfer-new-house-address">
                <AddressSearch
                  disableUnits
                  value={
                    {
                      road: "",
                      jibun: bgt.temporaryTwoHouse.newHouseJibun ?? "",
                      building: "",
                      detail: "",
                      lng: "",
                      lat: "",
                    } satisfies AddressValue
                  }
                  onChange={(v) =>
                    set({
                    temporaryTwoHouse: {
                      ...bgt.temporaryTwoHouse!,
                      ...giftBurdenedNewHouseAddressPatch(v, bgt.temporaryTwoHouse?.newHouseRegionCode),
                    },
                  })
                  }
                />
              </div>
              <DesignatedDistrictQuestion
                regionCode={bgt.temporaryTwoHouse.newHouseRegionCode || undefined}
                value={bgt.temporaryTwoHouse.newHouseInDesignatedDistrict}
                onChange={(newHouseInDesignatedDistrict) =>
                  set({ temporaryTwoHouse: { ...bgt.temporaryTwoHouse!, newHouseInDesignatedDistrict } })
                }
                idSuffix="bg-new-house"
              />
            </FieldCard>
          )}
          {/* §155⑯·⑱ 처분기한 예외(E-1 한계 G3) — 판정 메뉴와 같은 위젯. ⑯의 신규 주택 소재지는 위 칸과 같은 필드에
              저장하고(⑯이 켜지면 같은 주소를 두 번 받지 않도록 위 칸은 숨는다 — #29 이후 ⑯이어도 조정→조정 단축 기한에서는 조정 여부 칸이 열려 있다)
              시·군 코드는 거기서 파생한다. 게이트는 ④와 같다. */}
          {giftBurdenedTempTwoHouseDeadlineInScope(bgt) && (
            <>
              <TempTwoHouseRelocationInputs
                form={deadlineFields}
                onChange={(p) =>
                  set({ temporaryTwoHouse: { ...bgt.temporaryTwoHouse!, ...giftBurdenedDeadlineExceptionPatch(p) } })
                }
                relocationRegionVerdict={judgeRelocationRegion(deadlineFields)}
                onNewHouseAddress={(v) =>
                  set({
                    temporaryTwoHouse: {
                      ...bgt.temporaryTwoHouse!,
                      ...giftBurdenedNewHouseAddressPatch(v, bgt.temporaryTwoHouse?.newHouseRegionCode),
                    },
                  })
                }
              />
              <TempTwoHouseDelayReasonInput
                transferDate={transferDate}
                form={deadlineFields}
                onChange={(p) =>
                  set({ temporaryTwoHouse: { ...bgt.temporaryTwoHouse!, ...giftBurdenedDeadlineExceptionPatch(p) } })
                }
              />
            </>
          )}
          {/* §155①2호 — 양도세 계산기·판정 메뉴와 같은 위젯. 신규 주택 코드가 없으면 선언으로 받는다. */}
          {eraGate && bgt.temporaryTwoHouse && (
            <TempTwoHouseRegulatedInputs
              form={bgt.temporaryTwoHouse}
              onChange={(d) => set({ temporaryTwoHouse: { ...bgt.temporaryTwoHouse!, ...d } })}
              regulated={eraGate.regulated}
              newHouseAcquisitionDate={eraGate.newAcquisitionDate}
              hasHouseRoster={false}
            />
          )}
        </div>
      )}

      {/* §154① 단서(삭제 전 4호 포함) — 양도세 계산기·판정 메뉴와 같은 카드. 1주택이면 거주기간 뒤,
          일시적 2주택이면 §155① 블록 뒤(판정 메뉴와 같은 배치). 맥락별 사유 목록은 카드가 정한다. */}
      {provisoMode !== null && (
        <ExemptionProvisoSection
          provisoReason={oneHouse.provisoReason}
          provisoDepartureDate={oneHouse.provisoDepartureDate}
          provisoDepartureOnlyHouse={oneHouse.provisoDepartureOnlyHouse}
          provisoExpropriationDate={oneHouse.provisoExpropriationDate}
          provisoBusinessApprovalDate={oneHouse.provisoBusinessApprovalDate}
          provisoRentalLeaseResidenceMonths={oneHouse.provisoRentalLeaseResidenceMonths}
          provisoPreContractNoHouse={oneHouse.provisoPreContractNoHouse}
          rental4ho={oneHouse}
          mode={provisoMode}
          onChange={(patch) => set(patch)}
        />
      )}

      {/* §155④⑤ 합가(E-1 한계 G4) — 양도세 계산기와 같은 위젯. 계산기와 같이 세대 주택 수 2 이상에서 §155① 블록·
          단서 뒤에 둔다. 게이트는 ④와 같다(`giftBurdenedMergeInScope`). */}
      {giftBurdenedMergeInScope(bgt) && (
        <MergeDateSection form={giftBurdenedMergeSlice(bgt)} onChange={(patch) => set(patch)} variant="gift" />
      )}
      {/* 세대 3주택 + 합가일 — 이 화면에는 세대 보유 주택 목록이 없어 3주택 합가 특례(일시적 2주택 중첩·이중 합가)를 판정하지 않는다
          (결정 #25 C · #26 B). 게이트는 결과 화면 엔진 고지와 같은 술어다 — 1세대 ON · 주택 수 3 · 합가 요건 성립(결정 #24 조건 5 · #25 조건 1). */}
      {giftBurdenedThreeHouseMergeNoticeNeeded(bgt, transferDate) && (
        <ToneCard tone="amber" title="세대 3주택 합가 특례는 이 화면에서 판정하지 않습니다 (확인 필요)" className="py-2">
          <p data-testid="bg-three-house-merge-notice" className="text-xs">
            일시적 2주택(§155①)과 합가가 겹친 경우, 혼인·동거봉양 이중 합가는 보유 주택 목록이 있어야 판정할 수 있습니다. 이 화면에는 목록 입력 칸이
            없어 비과세와 다주택 중과 배제를 모두 판정하지 않고 계산합니다 — 양도소득세 계산기(부담부증여)에서 다른 보유 주택 목록을 입력해 확인하세요.
          </p>
        </ToneCard>
      )}

      {/* OH-22 §154⑤ 단서 최종 1주택 재기산 — 2021.1.1.~2022.5.9. 증여(양도) 1주택만 */}
      {restartInScope && (
        <FinalHouseRestartSection
          value={oneHouse}
          acquisitionDate={dateToStr(bgt.acquisitionDate)}
          onChange={(patch) => set(patch)}
        />
      )}

      {/* §155⑳ 장기임대주택 보유자 거주주택 특례(㉓ 말소일 포함 — E-1 잔여 C) — 양도세 계산기와 같은 카드.
          거주기간은 위 「거주기간 (개월)」 한 칸이 정본이라 구간 편집기(onChangeResidence)는 넘기지 않는다.
          게이트·합성 자산은 ④⑧과 같다(`gift-burdened-rental-exception.ts`). */}
      {giftBurdenedRentalExceptionInScope(bgt) && (
        <RentalHousingExceptionSection
          rh={giftBurdenedRentalHousingException(bgt)}
          asset={giftBurdenedRentalAsset(item, bgt)}
          acquisitionDate={dateToStr(bgt.acquisitionDate)}
          transferDate={transferDate ?? ""}
          mode="full"
          onChange={(rh) => set({ rentalHousingException: rh })}
          // §154⑩ 표준 경로(I-5) — 2019.2.12 전 취득 분기의 거주요건. ⑧ 검증과 같은 실효값(주소가 있으면 엔진과 같은 주소 판정 — G1-13).
          wasRegulatedAtAcquisition={giftBurdenedEffectiveWasRegulatedAtAcquisition(bgt, regionCode)}
        />
      )}
    </div>
  );
}
