"use client";

import type { AssetForm, ParcelFormItem } from "@/lib/stores/calc-wizard-store";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import { ParcelListInput } from "@/components/calc/inputs/ParcelListInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { CompanionSaleModeBlock, type BundledSaleMode } from "./CompanionSaleModeBlock";
import { NblSectionContainer } from "./nbl/NblSectionContainer";
import { OwnershipRatioInput, isFractionalMode } from "./OwnershipRatioInput";
import { MixedUseToggleRow, MixedUseExpandedPanel } from "./MixedUseSection";
import { RentalHousingExceptionSection } from "./RentalHousingExceptionSection";
import { RENTAL_HOUSING_EXCEPTION_DEFAULTS } from "@/lib/stores/calc-wizard-asset-factory";
import {
  useUnifiedRateBadge,
  CompanionLandRateOverrideToggle,
  NewConstructionPrimarySection,
} from "./CompanionAssetCardNewConstruction";
import { CompanionLandNatureBlock } from "./CompanionLandNatureBlock";
import { CompanionAcquisitionCauseSection } from "./CompanionAcquisitionCauseSection";
import { getAssetDateOrderError } from "@/lib/calc/transfer-tax-validate-asset";
import { TransferModeBlock } from "./TransferModeBlock";
import { CommercialBuildingBlock } from "./CommercialBuildingBlock";
import { GeneralBuildingBlock } from "./GeneralBuildingBlock";
import { RedevelopmentBlock } from "./RedevelopmentBlock";

const ASSET_KIND_LABELS: Record<string, string> = {
  housing: "주택",
  land: "토지",
  building: "건물(토지 외)",
  right_to_move_in: "입주권",
  presale_right: "분양권",
  commercial_building: "상업용건물·오피스텔",
  general_building: "일반건물(토지+건물 일괄)",
  redevelopment_apt: "재개발/재건축 APT",
};

const ASSET_KIND_OPTIONS = [
  { value: "housing", label: "주택" },
  { value: "land", label: "토지·농지" },
  { value: "building", label: "건물(토지 외)" },
  { value: "right_to_move_in", label: "입주권" },
  { value: "presale_right", label: "분양권" },
  { value: "commercial_building", label: "상업용건물·오피스텔", description: "기준시가 공시된 것" },
  { value: "general_building", label: "일반건물(토지+건물 일괄)", description: "취득가액 확인 불가 시 환산취득가 적용" },
  { value: "redevelopment_apt", label: "재개발/재건축 APT", description: "관리처분 인가일 분기로 3분할 양도차익 산정 (시행령 §166)" },
] as const;

interface Props {
  index: number;
  asset: AssetForm;
  bundledSaleMode: BundledSaleMode;
  onChange: (patch: Partial<AssetForm>) => void;
  /** undefined이면 삭제 버튼을 숨김 (1건일 때) */
  onRemove?: () => void;
  /** 단일 자산 모드: 양도가액 레이블·힌트를 §166⑥ 없이 단순화 */
  singleMode?: boolean;
  /** 양도일 (공시가격 기준연도 자동 계산용) */
  transferDate?: string;
  /** 증환지 증가분 등 자산 자동 추가 콜백 */
  onAddAsset?: (patch: Partial<AssetForm>) => void;
  /** 폼-수준 총 양도가액 — 지분 모드 시 ratio×total 자동 계산용 */
  contractTotalPrice?: string;
  /** 폼-수준 총 양도비 — 자산별 자동 안분 표시용 */
  totalTransferExpense?: string;
  /**
   * 사례 28 — 주된 자산 정보 (부수토지 일체과세 자동 분기 배지 표시용).
   * companion 토지 카드에서 primary의 신축 여부·건물 정착면적·도시지역 여부를 읽어
   * 일체과세 조건 충족 여부를 판정. useEffect → store 미러링 금지 — useMemo로 처리.
   */
  primaryAsset?: AssetForm;
  /**
   * 1세대1주택 + householdHousingCount === 1 충족 여부 (form-전역).
   * 사례 45 — RedevelopmentBlock §⑤ 거주월수 분리 입력 카드 가시성 가드.
   */
  isOneHouseSingle?: boolean;
  /** 검증 실패 메시지 — 이 자산 카드에 해당하는 오류. 상단 인라인 배너 + 테두리 강조. */
  errorMessage?: string;
}

export function CompanionAssetCard({
  index,
  asset,
  bundledSaleMode,
  onChange,
  onRemove,
  singleMode,
  transferDate,
  onAddAsset,
  contractTotalPrice,
  totalTransferExpense,
  primaryAsset,
  isOneHouseSingle,
  errorMessage,
}: Props) {
  const isMultiBundled = !singleMode && bundledSaleMode !== undefined;
  const isPrimary = asset.isPrimaryForHouseholdFlags;
  const kindLabel = ASSET_KIND_LABELS[asset.assetKind] ?? asset.assetKind;

  // ── 신축주택 케이스 판정 (사례 28) ──
  const isNewConstruction = asset.acquisitionCause === "newConstruction";

  // ── 부수토지 일체과세 자동 분기 배지 판정 (별도 훅 — useEffect 금지) ──
  const showUnifiedBadge = useUnifiedRateBadge(asset, primaryAsset, transferDate);

  // ── 날짜 순서 실시간 경고 — 입력 직후 즉시 표시 (차단은 "다음" 시점 동일 규칙) ──
  // validateAssetEntry와 단일 진실 공유 (getAssetDateOrderError) — 규칙 복제 금지
  const dateOrderWarning = getAssetDateOrderError(asset, transferDate);

  return (
    <div
      data-asset-card-index={index}
      className={cn(
        "border rounded-lg p-4 space-y-4 scroll-mt-24",
        errorMessage
          ? "border-destructive ring-1 ring-destructive/30 bg-destructive/[0.03]"
          : isPrimary ? "bg-background border-primary/30" : "bg-muted/30",
      )}
    >
      {errorMessage && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {errorMessage}
        </p>
      )}
      {/* 실시간 날짜 순서 경고 — 차단 배너(errorMessage)와 중복 시 차단 배너 우선 */}
      {dateOrderWarning && !errorMessage && (
        <p className="rounded-md border border-amber-300 bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
          {dateOrderWarning} 날짜를 확인해 주세요.
        </p>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">
            자산 {index + 1} — {kindLabel}
          </span>
          {isPrimary && (
            <span className="inline-flex rounded bg-primary/10 px-2 py-0.5 text-[10px] text-primary font-medium">
              주 자산
            </span>
          )}
          {bundledSaleMode === "actual" && (
            <span className="inline-flex rounded bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
              계약서 가액
            </span>
          )}
          {/* 부수토지 일체과세 자동 적용 배지 (companion 토지 카드) */}
          {showUnifiedBadge && (
            <span className="inline-flex rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] text-amber-800">
              주택·부수토지 일체과세 자동 적용 중 (§89·영 §154⑦, 재산-53·재산-1354)
            </span>
          )}
        </div>
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onRemove}
          >
            삭제
          </Button>
        )}
      </div>

      {/* 자산 종류 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">자산 종류</label>
        <div className="flex gap-2 flex-wrap">
          {ASSET_KIND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ assetKind: opt.value })}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm border transition-colors",
                asset.assetKind === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {asset.assetKind === "commercial_building" && (
          <p className="text-xs text-muted-foreground mt-1">
            ※ 기준시가 공시된 것 — 국세청이 호별 ㎡당 기준시가를 고시한 상업용건물·오피스텔(수도권·5대 광역시 3,000㎡ 이상 또는 100호 이상 구분소유 건물 / 구분소유된 오피스텔)에 한합니다.
          </p>
        )}
        {asset.assetKind === "general_building" && (
          <p className="text-xs text-muted-foreground mt-1">
            ※ 토지와 건물을 일괄 양도하는 일반건물 — 근린생활시설·단독건물 등. 취득가액 확인 불가 시 하단 환산취득가 섹션에서 양도·취득 시점 기준시가를 입력하세요.
          </p>
        )}
      </div>

      {/* 겸용주택 분리계산 토글 — 자산 종류가 주택일 때 상단에 노출.
         확장 패널은 자산 카드 하단(직접 귀속 필요경비 위)에 별도 배치. */}
      {asset.assetKind === "housing" && (
        <MixedUseToggleRow asset={asset} onChange={onChange} />
      )}

      {/* 소재지 검색 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">소재지</label>
        <AddressSearch
          value={{
            road: asset.addressRoad,
            jibun: asset.addressJibun,
            building: asset.buildingName ?? "",
            detail: asset.addressDetail ?? "",
            lng: asset.longitude ?? null,
            lat: asset.latitude ?? null,
          } satisfies AddressValue}
          onChange={(v) => {
            const patch: Parameters<typeof onChange>[0] = {
              addressRoad: v.road,
              addressJibun: v.jibun,
              buildingName: v.building,
              addressDetail: v.detail,
              longitude: v.lng,
              latitude: v.lat,
            };
            // 소재지 선택 시 자산 명칭 자동 입력 (사용자가 비워둔 경우에만)
            // 일괄양도(isMultiBundled)일 때만 UI에 노출되지만, 입력 시점과 무관하게 동기화
            if (!asset.assetLabel.trim()) {
              const auto = [v.building || v.road || v.jibun, v.detail]
                .filter(Boolean)
                .join(" ")
                .trim();
              if (auto) patch.assetLabel = auto;
            }
            onChange(patch);
          }}
        />
        <p className="text-xs text-muted-foreground">
          ※ 조정대상지역 여부·공시가격 조회에 사용됩니다.
        </p>
      </div>

      {/* 입주권 승계조합원 */}
      {asset.assetKind === "right_to_move_in" && (
        <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3">
          <label className="block text-sm font-medium">조합원 유형</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: false, label: "원조합원", desc: "조합원자격을 직접 취득" },
              { value: true, label: "승계조합원", desc: "입주권을 양수(승계취득)" },
            ].map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => onChange({ isSuccessorRightToMoveIn: opt.value })}
                className={cn(
                  "rounded-md border-2 p-2 text-left transition-all",
                  asset.isSuccessorRightToMoveIn === opt.value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
                )}
              >
                <div className="text-sm font-semibold">{opt.label}</div>
                <div className="text-[11px] text-muted-foreground">{opt.desc}</div>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            ※ 승계조합원은 장기보유특별공제 미적용 (소득세법 §95② 단서)
          </p>
        </div>
      )}

      {/* 자산 명칭 (1건 초과 시만 표시) */}
      {isMultiBundled && (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">자산 명칭</label>
          <input
            type="text"
            value={asset.assetLabel}
            onChange={(e) => onChange({ assetLabel: e.target.value })}
            placeholder="예: 아파트, 농지(밭)"
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          />
        </div>
      )}

      {/* 면적 정보 — 토지 자산만 표시 */}
      {asset.assetKind === "land" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">면적 입력 방식</label>
            <Select
              value={asset.areaScenario ?? "same"}
              onValueChange={(v) => {
                const next = v as AssetForm["areaScenario"];
                if (next === "same") {
                  const val = asset.transferArea || asset.acquisitionArea || "";
                  onChange({ areaScenario: next, acquisitionArea: val, transferArea: val,
                    replottingConfirmDate: "", entitlementArea: "", allocatedArea: "", priorLandArea: "" });
                } else if (next === "reduction" || next === "increase") {
                  onChange({ areaScenario: next,
                    replottingConfirmDate: "", entitlementArea: "", allocatedArea: "", priorLandArea: "" });
                } else {
                  onChange({ areaScenario: next });
                }
              }}
            >
              <SelectTrigger className="h-9 w-full">
                <span className="text-left">
                  {asset.areaScenario === "partial"
                    ? "일부 양도 — 취득 토지 중 일부만 양도"
                    : asset.areaScenario === "reduction"
                      ? "환지처분 (감환지) — 교부면적 < 권리면적"
                      : asset.areaScenario === "increase"
                        ? "환지처분 (증환지) — 교부면적 > 권리면적"
                        : "취득면적 = 양도면적 (일반)"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="same">취득면적 = 양도면적 (일반)</SelectItem>
                <SelectItem value="partial">일부 양도 — 취득 토지 중 일부만 양도</SelectItem>
                <SelectItem value="reduction">환지처분 (감환지) — 교부면적 &lt; 권리면적</SelectItem>
                <SelectItem value="increase">환지처분 (증환지) — 교부면적 &gt; 권리면적</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* same: 단일 면적 입력 */}
          {(asset.areaScenario ?? "same") === "same" && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                취득·양도 당시 면적 (㎡)
                <span
                  title="취득·양도 기준시가 = ㎡ 단가 × 이 면적. 공시가격 자동 조회 및 환산취득가 계산에 사용됩니다."
                  className="ml-1 cursor-help"
                >ⓘ</span>
              </label>
              <DecimalInput
                value={asset.transferArea}
                onChange={(v) =>
                  onChange({ acquisitionArea: v, transferArea: v })
                }
                placeholder="면적 입력"
              />
            </div>
          )}

          {/* partial: 취득·양도 분리 입력 */}
          {asset.areaScenario === "partial" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                취득 당시 면적 (㎡)
                <span title="처음 취득 시 보유한 전체 면적. 취득 기준시가 = ㎡ 단가 × 이 면적." className="ml-1 cursor-help">ⓘ</span>
              </label>
                <DecimalInput
                  value={asset.acquisitionArea}
                  onChange={(v) => onChange({ acquisitionArea: v })}
                  placeholder="전체 취득한 면적"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                양도 당시 면적 (㎡)
                <span title="이번 양도 계약에서 매매하는 면적. 양도 기준시가 = ㎡ 단가 × 이 면적." className="ml-1 cursor-help">ⓘ</span>
              </label>
                <DecimalInput
                  value={asset.transferArea}
                  onChange={(v) => onChange({ transferArea: v })}
                  placeholder="이번에 파는 면적"
                />
              </div>
            </div>
          )}

          {/* reduction: 환지처분 (감환지) — 의제취득면적 자동계산 */}
          {asset.areaScenario === "reduction" && (
            <ReplotReductionFields asset={asset} onChange={onChange} />
          )}

          {/* increase: 환지처분 (증환지) — 경고 + 직접 입력 + 증가분 자동 추가 */}
          {asset.areaScenario === "increase" && (
            <ReplotIncreaseFields asset={asset} onChange={onChange} onAddAsset={onAddAsset} />
          )}
        </div>
      )}

      {/* 토지 성격 — 부수토지 vs 독립 나대지 (사례 28 landNature 명시 입력 정책)
          assetKind === "land" 인 모든 자산에 표시. 면적 입력 직후, 지분율 입력 직전. */}
      {asset.assetKind === "land" && (
        <CompanionLandNatureBlock
          landNature={asset.landNature}
          onChange={onChange}
        />
      )}

      {/* 공유 지분율 — 단독 100/100 기본, 지분 단계취득 자산은 명시 입력 */}
      <OwnershipRatioInput
        numerator={asset.ownershipNumerator}
        denominator={asset.ownershipDenominator}
        onChange={(patch) =>
          onChange({
            ...(patch.numerator !== undefined ? { ownershipNumerator: patch.numerator } : {}),
            ...(patch.denominator !== undefined ? { ownershipDenominator: patch.denominator } : {}),
          })
        }
      />

      {/* 지분 모드 활성 시 100% 기준 입력 안내 (단독 소유는 미표시) */}
      {isFractionalMode(asset.ownershipNumerator, asset.ownershipDenominator) && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50/70 px-4 py-3 text-sm">
          <div className="flex items-start gap-2">
            <span aria-hidden className="text-amber-600 font-bold text-base leading-none mt-0.5">
              ⚠
            </span>
            <div className="space-y-1.5 flex-1">
              <p className="font-semibold text-amber-900">
                지분 모드 — 모든 금액을 <span className="underline">100% 기준</span>으로 입력하세요
              </p>
              <ul className="text-xs text-amber-800 space-y-0.5 leading-relaxed list-disc list-inside">
                <li>
                  <strong>양도가액·취득가액·필요경비</strong>는 물건 전체(100%) 기준으로 입력합니다.
                  시스템이 지분율(
                  {asset.ownershipNumerator}/{asset.ownershipDenominator})을 자동으로 적용합니다.
                </li>
                <li>
                  예: 60% 지분의 실제 매매가 600,000,000원 → 100% 기준{" "}
                  <strong>1,000,000,000원</strong>으로 입력 (600M ÷ 0.6).
                </li>
                <li>상속 보충적평가는 공동주택가격(100%)을 그대로 입력하면 됩니다.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/*
       * 양도 정보 카드 — Phase 2 (2026-05-12)
       * 부담부증여(소령 §159)는 "양도" 사건이므로 취득원인과 분리하여 별도 카드로 노출.
       * housing·land·building·general_building 모두 지원.
       *
       * 위치(2026-05-12 후속): 양도가액 입력 위로 이동 — 사용자가 양도 형태를 먼저 결정한 뒤
       * 그 결과에 따라 양도가액 입력란/자동 산정 안내가 분기되는 자연스러운 순방향 흐름 확보.
       */}
      <TransferModeBlock asset={asset} onChange={onChange} />

      {/* 양도가액 — 부담부증여 시 엔진 자동 도출 (소령 §159) 안내 + 기준시가는 별도 유지 */}
      {asset.transferType === "burdened_gift" && (
        <div className="rounded-lg border border-fuchsia-300 bg-fuchsia-50/60 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fuchsia-200 text-[10px] font-bold text-fuchsia-800 select-none">
              §159
            </span>
            <p className="text-sm font-semibold text-fuchsia-900">
              양도가액은 자동 산정됩니다 (직접 입력 불필요)
            </p>
          </div>
          <p className="text-xs text-fuchsia-800">
            부담부증여(소득세법 시행령 §159)에서는 <b>양도가액 = 인수 채무액 × (자산별 평가가액 ÷ 증여가액)</b>으로
            엔진이 자동 산정합니다. 채무액·평가액은 위 <b>양도 정보</b> 카드(인수 채무 + 임대 평가 보조)에서 입력하세요.
          </p>
          <p className="text-[11px] text-fuchsia-700">
            ※ 아래 <b>양도시 기준시가</b> 입력은 §159 분모(증여가액 C)의 보충적 평가 산정에 사용됩니다 (기준시가 모드).
          </p>
        </div>
      )}
      {/*
        부담부증여 모드에서도 standardPriceAtTransfer는 §159 분모(C)의 보충적 평가 산정 입력으로 필요.
        general_building은 GeneralBuildingBlock의 gb* 필드, 시가 모드는 bgMarketValueAtTransfer 사용.
        따라서 housing/land/building/commercial_building + 기준시가 모드일 때만 표시.
      */}
      {!(asset.transferType === "burdened_gift" && asset.assetKind === "general_building") &&
       !(asset.transferType === "burdened_gift" && asset.bgValuationMode === "sangjeungbeop_market") && (
        <CompanionSaleModeBlock
          bundledSaleMode={
            asset.transferType === "burdened_gift" ? "apportioned" : (singleMode ? "actual" : bundledSaleMode)
          }
          assetKind={(asset.assetKind === "commercial_building" || asset.assetKind === "general_building" || asset.assetKind === "redevelopment_apt") ? "building" : asset.assetKind}
          actualSalePrice={asset.actualSalePrice}
          onActualSalePriceChange={(v) => onChange({ actualSalePrice: v })}
          standardPriceAtTransfer={asset.standardPriceAtTransfer}
          onStandardPriceAtTransferChange={(v) => onChange({ standardPriceAtTransfer: v })}
          singleMode={singleMode}
          jibun={asset.addressJibun || undefined}
          transferDate={transferDate}
          transferArea={asset.assetKind === "land" ? asset.transferArea : undefined}
          onTransferAreaChange={asset.assetKind === "land" ? (v) => onChange({ transferArea: v }) : undefined}
          ownershipNumerator={asset.ownershipNumerator}
          ownershipDenominator={asset.ownershipDenominator}
          contractTotalPrice={contractTotalPrice}
          standardPricePerSqmAtTransfer={asset.standardPricePerSqmAtTransfer}
          onStandardPricePerSqmAtTransferChange={(v) => onChange({ standardPricePerSqmAtTransfer: v })}
        />
      )}

      {/* 취득 원인 + 원인별 세부 입력 (별도 파일로 분리 — 800줄 정책) */}
      <CompanionAcquisitionCauseSection
        asset={asset}
        onChange={onChange}
        transferDate={transferDate}
        isNewConstruction={isNewConstruction}
      />

      {/* 신축주택 — 부수토지 한도 산정 섹션 (영 §154⑦)
          주 자산이 신축(자가건축)인 경우 건물 정착면적 + 도시지역 여부 입력.
          companion 토지 면적 정보는 자산 자신의 acquisitionArea에서 읽음. */}
      {isNewConstruction && asset.assetKind === "housing" && (
        <NewConstructionPrimarySection
          asset={asset}
          onChange={onChange}
        />
      )}

      {/* companion 토지 — 수동 세율 오버라이드 토글 (부수토지 일체과세 §89·영§154⑦)
          자동 분기 배지가 표시된 케이스(신축 + 1년 미만 + 부수토지 인정)에서만 노출.
          또는 일반적으로 토지 companion이면 항상 노출하되 자동 분기 없을 때는 설명 다름. */}
      {asset.assetKind === "land" && !isPrimary && (
        <CompanionLandRateOverrideToggle
          asset={asset}
          onChange={onChange}
        />
      )}

      {/* 다필지 토글 (토지 전용) */}
      {asset.assetKind === "land" && (
        <ToggleCard
          tone="sky"
          title="취득시기 상이 (환지·합병 등 다필지)"
          description="취득원인·취득일이 다른 2필지 이상인 경우 (소득세법 시행령 §162①6호)"
          checked={asset.parcelMode ?? false}
          onCheckedChange={(checked) => {
            const defaultParcel: ParcelFormItem = {
              id: `parcel-${Date.now()}-0`,
              acquisitionDate: "",
              acquisitionMethod: "estimated",
              acquisitionPrice: "",
              acquisitionArea: "",
              transferArea: "",
              standardPricePerSqmAtAcq: "",
              standardPricePerSqmAtTransfer: "",
              expenses: "0",
              capitalExpenditure: "0",
              transferExpense: "0",
              useDayAfterReplotting: false,
              replottingConfirmDate: "",
              useExchangeLandReduction: false,
              entitlementArea: "",
              allocatedArea: "",
              priorLandArea: "",
              areaScenario: "same",
            };
            onChange({
              parcelMode: checked,
              parcels: checked && (!asset.parcels || asset.parcels.length === 0)
                ? [defaultParcel]
                : asset.parcels,
            });
          }}
        >
          <ParcelListInput
            parcels={asset.parcels ?? []}
            totalTransferPrice={parseAmount(asset.actualSalePrice || "0")}
            onChange={(parcels) => onChange({ parcels })}
          />
        </ToggleCard>
      )}

      {/* 겸용주택 확장 패널 — 체크박스 ON 시 직접 귀속 필요경비 위에 노출.
         transferDate는 폼-전역 양도일을 사용 (PHD 양도시 시점 기준연도용). */}
      {asset.assetKind === "housing" && (
        <MixedUseExpandedPanel
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
          useEstimatedAcquisition={asset.useEstimatedAcquisition}
          jibun={asset.addressJibun || undefined}
        />
      )}

      {/* 상업용건물·오피스텔 환산취득가 입력 (assetKind === "commercial_building" 시만 표시) */}
      {asset.assetKind === "commercial_building" && (
        <CommercialBuildingBlock
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
        />
      )}

      {/* 일반건물(토지+건물 일괄) — 취득방법 무관 항상 마운트 (2026-05-10 실거래가 모드 지원) */}
      {asset.assetKind === "general_building" && (
        <GeneralBuildingBlock
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
        />
      )}

      {/* 재개발/재건축 (시행령 §166) — assetKind === "redevelopment_apt" 시만 표시 (사례 44) */}
      {asset.assetKind === "redevelopment_apt" && (
        <RedevelopmentBlock asset={asset} onChange={onChange} isOneHouseSingle={isOneHouseSingle} />
      )}

      {/* 필요경비 — 자본적지출 / 양도비 분리 입력 (소득세법 §97① 가목·나목)
          두 필드 합 > 환산취득가+개산공제 → §97② 단서 swap 발동 */}
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
        <p className="text-xs font-semibold text-foreground">
          필요경비 <span className="text-muted-foreground font-normal">(소득세법 §97①·②)</span>
        </p>
        <CurrencyInput
          label="자본적 지출액 (원) — §97① 가목"
          value={asset.capitalExpenditure}
          onChange={(v) => onChange({ capitalExpenditure: v })}
          hint={
            isFractionalMode(asset.ownershipNumerator, asset.ownershipDenominator)
              ? "자산 보유 중 발생한 인테리어·증축 등. 100% 기준 입력 — 시스템이 지분율 자동 적용"
              : "자산 보유 중 발생한 인테리어·증축 등 자본적 지출"
          }
        />
        {(() => {
          const formTotal = parseAmount(totalTransferExpense || "0");
          const num = parseFloat(asset.ownershipNumerator || "100");
          const den = parseFloat(asset.ownershipDenominator || "100");
          const fractional = isFractionalMode(asset.ownershipNumerator, asset.ownershipDenominator);
          const ratio = isFinite(num) && isFinite(den) && den > 0 ? Math.min(num / den, 1.0) : 1.0;
          const allocated = formTotal > 0 ? Math.floor(formTotal * ratio) : 0;
          const useFormLevel = formTotal > 0;
          return (
            <CurrencyInput
              label="양도비 (원) — §97① 나목"
              value={useFormLevel ? String(allocated) : asset.transferExpense}
              onChange={(v) => onChange({ transferExpense: v })}
              disabled={useFormLevel}
              hint={
                useFormLevel
                  ? fractional
                    ? `자동 안분 ${allocated.toLocaleString()} = 총 양도비 ${formTotal.toLocaleString()} × 지분 ${num}/${den}. 폼 상단 "총 양도비"를 비우면 직접 입력 가능`
                    : `자동 적용 ${allocated.toLocaleString()} (폼 상단 "총 양도비"). 비우면 직접 입력 가능`
                  : fractional
                    ? "양도 시 1회 발생 (중개수수료·인지대 등). 지분 모드는 폼 상단 \"총 양도비\"에서 일괄 입력 권장 (자동 안분)"
                    : "양도 시 발생한 중개수수료·인지대 등"
              }
            />
          );
        })()}
        <p className="text-[11px] text-muted-foreground">
          환산취득가/감정가액 모드에서 (자본+양도비) &gt; (환산+개산공제) 시 §97② 단서에 따라 자본+양도비를 필요경비로 적용합니다.
        </p>
      </div>

      {/* legacy 단일 필드 — backward-compat (sessionStorage 로드 시 표시).
          신규 입력은 위 분리 필드 사용. 둘 다 0이면 이 값이 합산으로 사용됨 (실가 모드만). */}
      {parseInt(asset.directExpenses || "0", 10) > 0
       && parseInt(asset.capitalExpenditure || "0", 10) === 0
       && parseInt(asset.transferExpense || "0", 10) === 0 && (
        <CurrencyInput
          label="직접 귀속 필요경비 (원) — legacy"
          value={asset.directExpenses}
          onChange={(v) => onChange({ directExpenses: v })}
        />
      )}

      {/* 비사업용 토지 정밀 판정 — "판정 도움" 모드일 때만 표시 */}
      {asset.assetKind === "land" && asset.isNonBusinessLand && asset.nblUseDetailedJudgment && (
        <div className="pt-2 border-t border-border/60">
          <NblSectionContainer asset={asset} onAssetChange={onChange} />
        </div>
      )}

      {/* 장기임대주택 보유자 거주주택 비과세 특례 — 주택 자산에만 표시 (소령 §155⑳) */}
      {(asset.assetKind === "housing" || asset.assetKind === "right_to_move_in") && (
        <div className="pt-2 border-t border-border/60">
          <RentalHousingExceptionSection
            rh={asset.rentalHousingException ?? { ...RENTAL_HOUSING_EXCEPTION_DEFAULTS }}
            acquisitionDate={asset.acquisitionDate}
            transferDate={transferDate ?? ""}
            residencePeriodMonthsAsset={asset.residencePeriodMonthsAsset}
            onChangeResidencePeriodMonths={(v) => onChange({ residencePeriodMonthsAsset: v })}
            onChange={(rh) => onChange({ rentalHousingException: rh })}
          />
        </div>
      )}

      {/* 감면은 Step 5(감면·공제)에서 자산별로 선택합니다 */}
    </div>
  );
}

import {
  ReplotReductionFields,
  ReplotIncreaseFields,
} from "./CompanionAssetCardReplot";

