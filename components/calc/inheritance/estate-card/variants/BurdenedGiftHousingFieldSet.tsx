"use client";

/**
 * 부담부증여 양도소득세 — **주택** 필드 세트 (`BurdenedGiftTransferSection`의 housing 분기)
 *
 * 2026-09-28 E-1 후속: 800줄 정책으로 `BurdenedGiftTransferSection.tsx`에서 분리했다(종전 JSX·testid 그대로).
 * 같은 작업으로 1세대1주택 후속 입력을 붙였다 — 모두 양도세 계산기·판정 메뉴의 **같은 위젯**이다
 * (평행 UI를 만들지 않는다). 게이트·조립은 `lib/calc/gift-burdened-one-house.ts` 한 곳이다(④⑧ 공용).
 *
 *   · 증여 주택 주소(PNU 앞 10자리)가 있으면 취득시 조정대상지역은 주소로 자동 판정(토글 대신 결과 표시)
 *     · 양도시 조정대상지역 토글은 안 만졌으면 주소 판정을 따른다(계산기와 같은 규칙 — E-1 잔여 A)
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
import { TempTwoHouseRegulatedInputs } from "@/components/calc/transfer/TempTwoHouseRegulatedInputs";
import { ExemptionProvisoSection } from "@/components/calc/transfer/ExemptionProvisoSection";
import { FinalHouseRestartSection } from "@/components/calc/transfer/FinalHouseRestartSection";
import { InheritedSameHouseholdField } from "@/components/calc/transfer/InheritedSameHouseholdField";
import { RentalHousingExceptionSection } from "@/components/calc/transfer/RentalHousingExceptionSection";
import { WinWinRentalSpecialField } from "@/components/calc/transfer/WinWinRentalSpecialField";
import { MergeDateSection } from "@/components/calc/transfer/MergeDateSection";
import {
  giftBurdenedRentalAsset,
  giftBurdenedRentalExceptionInScope,
  giftBurdenedRentalHousingException,
} from "@/lib/calc/gift-burdened-rental-exception";
import { ValuationModeSection } from "./BurdenedGiftValuationModeSection";
import { dateToStr, strToDate } from "./burdened-gift-dates";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import {
  giftBurdenedDeadlineExceptionFields,
  giftBurdenedDeadlineExceptionPatch,
  giftBurdenedNewHouseAddressPatch,
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
  giftBurdenedMergeInScope,
  giftBurdenedMergeSlice,
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
  jibun?: string;
  item: EstateItem;
  transferDate?: string;
}

export function HousingFieldSet({ bgt, set, referenceDate, stdPriceLabel, stdPriceHint, transferStdPrice, onTransferStdPriceChange, transferStdPriceLabel, jibun, item, transferDate }: HousingFieldSetProps) {
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
  const isMarketMode = (bgt.valuationMode ?? "sangjeungbeop_standard") === "sangjeungbeop_market";
  // 시가 모드 + 실지취득가액(K-4): 비-토지 자산은 취득시 기준시가가 결과에 무영향 → 입력 불필요.
  const acqStdInert = isMarketMode && bgt.acquisitionMethod === "actual";
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

      {/* 평가방식·취득가액 산정 (K-4/K-5) */}
      <ValuationModeSection bgt={bgt} set={set} item={item} isLandType={false} jibun={jibun} />

      {/* 기준시가 모드: 양도시 기준시가 (시가 모드에서는 ValuationModeSection 내 시가 입력으로 대체) */}
      {!isMarketMode && (
        <FieldCard
          label={transferStdPriceLabel}
          hint="증여일(양도일) 현재 기준시가. §159 안분에 사용 — 평가 입력의 '보충적 평가(기준시가)'와 동일 값입니다."
          required
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
      )}

      {/* 1세대1주택 여부 */}
      <ToggleCard
        tone="emerald"
        size="sm"
        title="1세대 1주택 (§89)"
        description="증여자가 1세대 1주택 요건을 충족하면 ON — 비과세 판정 및 장특공제 표2 적용."
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
      <FieldCard label="세대 보유 주택 수 (증여자 기준)" hint="증여자 세대가 보유한 주택 수. 비과세·중과 판정용.">
        <DecimalInput
          value={householdCount > 0 ? String(householdCount) : "1"}
          onChange={(v) =>
            set({ householdHousingCount: Math.max(1, parseDecimal(v) || 1) })
          }
          data-testid="bg-transfer-house-count"
        />
      </FieldCard>

      {/* 지정 지구 안인가(#2055 후속) — 증여 주택 법정동이 「동 안 일부 지구만 조정대상지역」일 때만 뜬다. 아래 두 조정
          판정(양도시·취득시)과 ④·⑧이 같은 답을 쓴다. 소재지가 바뀌면 답을 지운다(`giftBurdenedDistrictResetPatch`). */}
      <DesignatedDistrictQuestion
        regionCode={regionCode}
        value={bgt.regionInDesignatedDistrict}
        onChange={(regionInDesignatedDistrict) => set({ regionInDesignatedDistrict })}
        idSuffix="bg-gift-house"
      />

      {/* 양도시 조정대상지역 — 양도세 계산기와 같은 규칙(E-1 잔여 A): 주소가 있으면 안 만진 토글은 주소 판정을
          따르고, 만지면 그 선택을 저장해 주소보다 우선한다. ④·⑧은 같은 leaf(`giftBurdenedEffectiveIsRegulatedArea`). */}
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

      {/* 취득시 조정대상지역 — 주소(법정동코드)가 있으면 엔진이 토글 대신 코드로 판정한다(양도세 계산기와 같은 우선순위).
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
          <FieldCard label="종전 주택 취득일">
            <DateInput
              value={
dateToStr(bgt.temporaryTwoHouse?.previousAcquisitionDate)
              }
              onChange={(v) => {
                const d = strToDate(v);
                set({
                  temporaryTwoHouse: {
                    ...bgt.temporaryTwoHouse,
                    previousAcquisitionDate: d as unknown as Date,
                    newAcquisitionDate:
                      bgt.temporaryTwoHouse?.newAcquisitionDate as Date,
                  },
                });
              }}
            />
          </FieldCard>
          <FieldCard label="신규 주택 취득일">
            <DateInput
              value={
dateToStr(bgt.temporaryTwoHouse?.newAcquisitionDate)
              }
              onChange={(v) => {
                const d = strToDate(v);
                set({
                  temporaryTwoHouse: {
                    ...bgt.temporaryTwoHouse,
                    previousAcquisitionDate:
                      bgt.temporaryTwoHouse?.previousAcquisitionDate as Date,
                    newAcquisitionDate: d as unknown as Date,
                  },
                });
              }}
            />
          </FieldCard>
          {/* 신규 주택 소재지(E-1 잔여 B) — 계산기는 보유 주택 명부 행 주소에서 코드를 얻는다. 이 화면엔 명부가 없어
              같은 주소 위젯으로 한 칸만 받는다. 코드가 있으면 아래 위젯이 신규 주택도 자동 판정한다(④⑧ 같은 값). */}
          {eraGate && bgt.temporaryTwoHouse && (
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
              저장하고(⑯이 켜지면 조정 기한 연혁이 닫혀 위 칸은 숨는다) 시·군 코드는 거기서 파생한다. 게이트는 ④와 같다. */}
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
        <MergeDateSection form={giftBurdenedMergeSlice(bgt)} onChange={(patch) => set(patch)} />
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
          // §154⑩ 표준 경로(I-5) — 2019.2.12 전 취득 분기의 거주요건. API 변환·⑧ 검증과 같은 소스.
          wasRegulatedAtAcquisition={bgt.wasRegulatedAtAcquisition ?? false}
        />
      )}
    </div>
  );
}
