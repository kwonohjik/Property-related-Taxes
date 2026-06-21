"use client";

/**
 * BurdenedGiftTransferSection — 부담부증여 양도소득세 함께 계산 입력 섹션
 *
 * 설계: docs/02-design/features/gift-burdened-transfer-tax.ui.design.md §1
 * 위치: EstateBodyRealEstate.tsx §47③ 안내 이후 (mode==="gift" && assumedDebtForGift>0)
 *
 * 정책:
 *   - feedback_three_state_optional_mode_toggle: burdenedGiftTransferTax !== undefined = ON
 *   - mirror-pattern: onChange 핸들러로 동기화 (useEffect→store 미러링 금지)
 *   - feedback_dialog_data_discard_confirm: OFF 전환 시 shadcn Dialog (window.confirm 금지)
 *   - feedback_land_price_lookup_field: land category는 LandPriceLookupField 필수
 *   - feedback_no_silent_apportion_fallback: 미입력=차단 (validate에서 처리)
 *   - feedback_tailwind_static_tone_mapping: 정적 클래스 매핑
 */

import { useState } from "react";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import {
  DecimalInput,
  parseDecimal,
} from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { DateInput } from "@/components/ui/date-input";
import { ValuationModeSection } from "./BurdenedGiftValuationModeSection";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

// ─── helpers ───────────────────────────────────────────────────────────────

function dateToStr(d: Date | undefined): string {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function strToDate(s: string): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

/** 초기 빈 객체 — 토글 ON 시 생성 */
function createEmptyBgt(): BurdenedGiftTransferTaxInput {
  return {
    acquisitionDate: undefined as unknown as Date,
    standardPriceAtAcquisition: 0,
    // K-4/K-5 신규 필드 — 기본 기준시가 모드(K-1~K-3). store default = UI fallback = API/validate 3중 일치.
    valuationMode: "sangjeungbeop_standard",
    marketValueAtTransfer: undefined,
    acquisitionMethod: undefined,
    actualAcquisitionTotal: undefined,
    capitalExpenditure: undefined,
    transferExpense: undefined,
    landStdPriceAtTransfer: undefined,
    // §114조의2 신축·증축 가산세 (K-5 + 건물 전용)
    isSelfBuilt: undefined,
    buildingType: undefined,
    constructionDate: undefined,
    extensionFloorArea: undefined,
  };
}

/** 이미 값이 입력된 상태인지 (OFF 전환 시 경고 표시 여부) */
function hasData(bgt: BurdenedGiftTransferTaxInput): boolean {
  return (
    !!bgt.acquisitionDate ||
    bgt.standardPriceAtAcquisition > 0 ||
    bgt.isHousing !== undefined ||
    bgt.isOneHousehold !== undefined ||
    !!bgt.residencePeriodMonths ||
    !!bgt.householdHousingCount ||
    bgt.valuationMode === "sangjeungbeop_market" ||
    !!bgt.marketValueAtTransfer ||
    bgt.acquisitionMethod !== undefined ||
    !!bgt.actualAcquisitionTotal ||
    !!bgt.capitalExpenditure ||
    !!bgt.transferExpense ||
    !!bgt.landStdPriceAtTransfer ||
    bgt.isSelfBuilt === true ||
    !!bgt.constructionDate
  );
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  item: EstateItem;
  /** 이 아이템의 필드 업데이트 핸들러 */
  onChange: (patch: Partial<EstateItem>) => void;
  /** 같은 마법사 내 다른 자산 중 이미 토글 ON인 자산이 있는지 */
  hasOtherBurdenedGiftTransfer: boolean;
  /** 자산 소재지 jibun (LandPriceLookupField 조회용) */
  jibun?: string;
}

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────

export function BurdenedGiftTransferSection({
  item,
  onChange,
  hasOtherBurdenedGiftTransfer,
  jibun,
}: Props) {
  const [discardOpen, setDiscardOpen] = useState(false);

  const bgt = item.burdenedGiftTransferTax;
  const isOn = bgt !== undefined;
  const assumedDebt = item.assumedDebtForGift ?? 0;

  // 토글 노출 조건
  if (assumedDebt <= 0) return null;

  const category = item.category;
  const isLand = category === "real_estate_land";
  const isBuilding = category === "real_estate_building";
  const isApartment = category === "real_estate_apartment";

  if (!isLand && !isBuilding && !isApartment) return null;

  // housing 여부 파생
  const isHousingType =
    isApartment || (isBuilding && (bgt?.isHousing ?? false));

  // ─── 핸들러 ────────────────────────────────────────────────────────────────

  const set = (patch: Partial<BurdenedGiftTransferTaxInput>) => {
    if (!bgt) return;
    onChange({ burdenedGiftTransferTax: { ...bgt, ...patch } });
  };

  const handleToggleOn = () => {
    onChange({ burdenedGiftTransferTax: createEmptyBgt() });
  };

  const handleToggleOff = () => {
    if (bgt && hasData(bgt)) {
      setDiscardOpen(true);
    } else {
      onChange({ burdenedGiftTransferTax: undefined });
    }
  };

  const handleToggle = (checked: boolean) => {
    if (checked) {
      handleToggleOn();
    } else {
      handleToggleOff();
    }
  };

  const confirmDiscard = () => {
    setDiscardOpen(false);
    onChange({ burdenedGiftTransferTax: undefined });
  };

  // ─── 다자산 차단 배너 ──────────────────────────────────────────────────────

  if (hasOtherBurdenedGiftTransfer && !isOn) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50/70 dark:border-rose-700 dark:bg-rose-900/20 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
        <strong>양도소득세 동시 계산</strong>은 현재 부담부증여 자산 1건만
        지원합니다. 이미 다른 자산에서 계산이 켜져 있습니다.
        (여러 건은 양도소득세 계산기를 직접 이용하세요)
      </div>
    );
  }

  // ─── 취득시 기준시가 레이블/힌트 ────────────────────────────────────────────

  const stdPriceLabel = isLand
    ? "취득시 개별공시지가 (원/㎡)"
    : isApartment
      ? "취득시 공동주택공시가격 (원)"
      : "취득시 건물 기준시가 (원)";

  const stdPriceHint = isLand
    ? "취득 당시 공시지가 (원/㎡). §159①1호 안분 분자로 사용됩니다."
    : "취득 당시 기준시가. §159①1호 안분 분자로 사용됩니다.";

  // ─── 양도시(증여시) 기준시가 — item.standardPrice (평가 '보충적 평가'와 동일 필드, 양방향 read/write) ───
  // §159 양도차익 안분에 필요. 감정평가액으로 평가하면 평가 섹션 '보충적 평가'를 열지 않아 0이 되는 함정 방지.
  const transferStdPriceLabel = isApartment
    ? "양도시 공동주택공시가격 (원)"
    : "양도시 건물 기준시가 (원)";
  const transferStdPrice = item.standardPrice;
  const onTransferStdPriceChange = (v: number | undefined) =>
    onChange({ standardPrice: v });

  // ─── 렌더 ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* 토글 카드 */}
      <ToggleCard
        tone="sky"
        size="sm"
        title="양도소득세 함께 계산 (소득세법 §88)"
        description="부담부증여 채무인수분은 유상양도로 보아 증여자에게 양도소득세가 과세됩니다. (소득세법 §88·소령 §159)"
        checked={isOn}
        onCheckedChange={handleToggle}
        data-testid="bg-transfer-toggle"
      >
        {/* 안내 문구 */}
        <div className="rounded-md border border-sky-200 bg-sky-50/60 dark:border-sky-700 dark:bg-sky-900/20 px-3 py-2 text-xs text-sky-700 dark:text-sky-300 mb-2">
          채무인수분은 유상양도로 취급 → 증여자 과세 (소득세법 §88·소령 §159)
        </div>

        {/* ── land ── */}
        {isLand && bgt && (
          <div className="space-y-2">
            {/* 취득일 */}
            <FieldCard label="취득일 (증여자 당초 취득일)" required>
              <DateInput
                value={dateToStr(bgt.acquisitionDate)}
                onChange={(v) => set({ acquisitionDate: strToDate(v) })}
                data-testid="bg-transfer-acq-date"
              />
            </FieldCard>

            {/* 취득시 개별공시지가 (LandPriceLookupField 필수) */}
            <div data-testid="bg-transfer-acq-stdprice">
              <LandPriceLookupField
                pricePerSqm={
                  bgt.standardPriceAtAcquisition > 0
                    ? String(bgt.standardPriceAtAcquisition)
                    : ""
                }
                onPricePerSqmChange={(v) =>
                  set({ standardPriceAtAcquisition: parseAmount(v) || 0 })
                }
                area={item.areaSqm}
                referenceDate={dateToStr(bgt.acquisitionDate)}
                jibun={jibun}
                label={stdPriceLabel}
                hint={stdPriceHint}
              />
            </div>

            {/* 평가방식·취득가액 산정 (K-4/K-5) */}
            <ValuationModeSection
              bgt={bgt}
              set={set}
              item={item}
              isLandType={true}
              jibun={jibun}
            />

            {/* 기준시가 모드: 양도시 개별공시지가 (area prop 필수 → 총액으로 저장됨) */}
            {(bgt.valuationMode ?? "sangjeungbeop_standard") === "sangjeungbeop_standard" && (
              <div data-testid="bg-transfer-transfer-stdprice-land">
                <LandPriceLookupField
                  pricePerSqm={
                    item.standardPrice && item.standardPrice > 0
                      ? String(item.standardPrice)
                      : ""
                  }
                  onPricePerSqmChange={(v) =>
                    onTransferStdPriceChange(parseAmount(v) || undefined)
                  }
                  area={item.areaSqm}
                  jibun={jibun}
                  label="양도시(증여시) 개별공시지가 (원/㎡)"
                  hint="증여일(양도일) 기준 공시지가. §159 안분 분모로 사용됩니다."
                />
              </div>
            )}

            {/* 비사업용 토지 여부 */}
            <ToggleCard
              tone="rose"
              size="sm"
              title="비사업용 토지 (소득세법 §104의3)"
              description="비사업용 토지이면 ON — 기본세율 + 10%p 중과 적용됩니다."
              checked={bgt.isNonBusinessLand ?? false}
              onCheckedChange={(v) =>
                set({ isNonBusinessLand: v || undefined })
              }
              data-testid="bg-transfer-nonbiz-land"
            />

          </div>
        )}

        {/* ── building ── */}
        {isBuilding && bgt && (
          <div className="space-y-2">
            {/* 주택 여부 선행 분기 */}
            <ToggleCard
              tone="violet"
              size="sm"
              title="주택 여부 (§89·§104)"
              description="단독·다가구 등 주거용이면 ON — 1세대1주택 비과세·장특공제·중과 판정이 달라집니다."
              checked={bgt.isHousing ?? false}
              onCheckedChange={(v) =>
                set({
                  isHousing: v || undefined,
                  // housing→non-housing 전환 시 housing 전용 필드 초기화
                  ...(v === false
                    ? {
                        isOneHousehold: undefined,
                        householdHousingCount: undefined,
                        isRegulatedArea: undefined,
                        wasRegulatedAtAcquisition: undefined,
                        residencePeriodMonths: undefined,
                        temporaryTwoHouse: undefined,
                      }
                    : {}),
                })
              }
              data-testid="bg-transfer-is-housing"
            />

            {/* 주택 O → housing 세트 */}
            {isHousingType && (
              <HousingFieldSet
                bgt={bgt}
                set={set}
                referenceDate={dateToStr(bgt.acquisitionDate)}
                stdPriceLabel={stdPriceLabel}
                stdPriceHint={stdPriceHint}
                transferStdPrice={transferStdPrice}
                onTransferStdPriceChange={onTransferStdPriceChange}
                transferStdPriceLabel={transferStdPriceLabel}
                isLand={false}
                jibun={jibun}
                item={item}
              />
            )}

            {/* 주택 X → 취득일·기준시가 */}
            {!isHousingType && (
              <NonHousingFieldSet
                bgt={bgt}
                set={set}
                stdPriceLabel={stdPriceLabel}
                stdPriceHint={stdPriceHint}
                transferStdPrice={transferStdPrice}
                onTransferStdPriceChange={onTransferStdPriceChange}
                transferStdPriceLabel={transferStdPriceLabel}
                item={item}
              />
            )}
          </div>
        )}

        {/* ── apartment (항상 housing) ── */}
        {isApartment && bgt && (
          <HousingFieldSet
            bgt={bgt}
            set={set}
            referenceDate={dateToStr(bgt.acquisitionDate)}
            stdPriceLabel={stdPriceLabel}
            stdPriceHint={stdPriceHint}
            transferStdPrice={transferStdPrice}
            onTransferStdPriceChange={onTransferStdPriceChange}
            transferStdPriceLabel={transferStdPriceLabel}
            isLand={false}
            jibun={jibun}
            item={item}
          />
        )}
      </ToggleCard>

      {/* 데이터 폐기 확인 Dialog */}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>양도소득세 계산 OFF</DialogTitle>
            <DialogDescription>
              입력된 양도소득세 취득 정보가 삭제됩니다. 계속하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDiscardOpen(false)}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={confirmDiscard}
              className="rounded-md bg-rose-600 text-white px-4 py-2 text-sm font-medium hover:bg-rose-700 transition-colors"
            >
              삭제하고 OFF
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── 서브 컴포넌트: Housing 필드 세트 ─────────────────────────────────────────

interface HousingFieldSetProps {
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
}

function HousingFieldSet({ bgt, set, referenceDate, stdPriceLabel, stdPriceHint, transferStdPrice, onTransferStdPriceChange, transferStdPriceLabel, jibun, item }: HousingFieldSetProps) {
  const householdCount = bgt.householdHousingCount ?? 1;
  const isMarketMode = (bgt.valuationMode ?? "sangjeungbeop_standard") === "sangjeungbeop_market";
  // 시가 모드 + 실지취득가액(K-4): 비-토지 자산은 취득시 기준시가가 결과에 무영향 → 입력 불필요.
  const acqStdInert = isMarketMode && bgt.acquisitionMethod === "actual";
  return (
    <div className="space-y-2">
      {/* 취득일 */}
      <FieldCard label="취득일 (증여자 당초 취득일)" required>
        <DateInput
          value={
            bgt.acquisitionDate instanceof Date
              ? (() => {
                  const d = bgt.acquisitionDate;
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, "0");
                  const day = String(d.getDate()).padStart(2, "0");
                  return `${y}-${m}-${day}`;
                })()
              : ""
          }
          onChange={(v) => {
            const d = v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v) : undefined;
            set({ acquisitionDate: d as unknown as Date });
          }}
          data-testid="bg-transfer-acq-date"
        />
      </FieldCard>

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

      {/* 양도시 조정대상지역 */}
      <ToggleCard
        tone="rose"
        size="sm"
        title="양도시(증여일) 조정대상지역"
        description="증여일 기준 조정대상지역이면 ON."
        checked={bgt.isRegulatedArea ?? false}
        onCheckedChange={(v) =>
          set({ isRegulatedArea: v || undefined })
        }
        data-testid="bg-transfer-regulated"
      />

      {/* 취득시 조정대상지역 */}
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

      {/* 일시적 2주택 — 세대 주택수 == 2인 경우 */}
      {householdCount === 2 && (
        <div className="rounded-md border border-sky-200 bg-sky-50/40 dark:border-sky-700 dark:bg-sky-900/15 p-3 space-y-2">
          <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">
            일시적 2주택 비과세 특례 (§155①)
          </p>
          <FieldCard label="종전 주택 취득일">
            <DateInput
              value={
                bgt.temporaryTwoHouse?.previousAcquisitionDate instanceof Date
                  ? (() => {
                      const d = bgt.temporaryTwoHouse.previousAcquisitionDate;
                      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
                    })()
                  : ""
              }
              onChange={(v) => {
                const d = v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v) : undefined;
                set({
                  temporaryTwoHouse: {
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
                bgt.temporaryTwoHouse?.newAcquisitionDate instanceof Date
                  ? (() => {
                      const d = bgt.temporaryTwoHouse.newAcquisitionDate;
                      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
                    })()
                  : ""
              }
              onChange={(v) => {
                const d = v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v) : undefined;
                set({
                  temporaryTwoHouse: {
                    previousAcquisitionDate:
                      bgt.temporaryTwoHouse?.previousAcquisitionDate as Date,
                    newAcquisitionDate: d as unknown as Date,
                  },
                });
              }}
            />
          </FieldCard>
        </div>
      )}

    </div>
  );
}

// ─── 서브 컴포넌트: 비주택 건물 (취득일·기준시가) ──────────────────────────────

interface NonHousingFieldSetProps {
  bgt: BurdenedGiftTransferTaxInput;
  set: (patch: Partial<BurdenedGiftTransferTaxInput>) => void;
  stdPriceLabel: string;
  stdPriceHint: string;
  /** 양도시(증여시) 기준시가 — item.standardPrice (평가 '보충적 평가'와 동일 필드) */
  transferStdPrice: number | undefined;
  onTransferStdPriceChange: (v: number | undefined) => void;
  transferStdPriceLabel: string;
  item: EstateItem;
}

function NonHousingFieldSet({ bgt, set, stdPriceLabel, stdPriceHint, transferStdPrice, onTransferStdPriceChange, transferStdPriceLabel, item }: NonHousingFieldSetProps) {
  const isMarketMode = (bgt.valuationMode ?? "sangjeungbeop_standard") === "sangjeungbeop_market";
  // 시가 모드 + 실지취득가액(K-4): 비-토지 자산은 취득시 기준시가가 결과에 무영향 → 입력 불필요.
  const acqStdInert = isMarketMode && bgt.acquisitionMethod === "actual";
  return (
    <div className="space-y-2">
      <FieldCard label="취득일 (증여자 당초 취득일)" required>
        <DateInput
          value={
            bgt.acquisitionDate instanceof Date
              ? (() => {
                  const d = bgt.acquisitionDate;
                  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
                })()
              : ""
          }
          onChange={(v) => {
            const d = v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v) : undefined;
            set({ acquisitionDate: d as unknown as Date });
          }}
          data-testid="bg-transfer-acq-date"
        />
      </FieldCard>
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
      <ValuationModeSection bgt={bgt} set={set} item={item} isLandType={false} />

      {/* 기준시가 모드: 양도시 기준시가 */}
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
    </div>
  );
}

