"use client";

/**
 * ① 기본정보 — 자산종류·겸용토글·소재지·입주권·자산명칭·면적·토지성격·지분율·지분안내.
 * CompanionAssetCard L175–472 JSX를 그대로 이동 (동작 변화 0).
 */
import { Fragment } from "react";

import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { AddressSearch, type AddressValue } from "@/components/ui/address-search";
import {
  resolveSigunguCode,
  isReverseGeocodeError,
} from "@/lib/calc/vworld-reverse-geocode";
import { MixedUseToggleRow } from "../MixedUseSection";
import { OwnershipRatioInput, isFractionalMode } from "../OwnershipRatioInput";
import { CompanionLandNatureBlock } from "../CompanionLandNatureBlock";
import { ReplotReductionFields, ReplotIncreaseFields } from "../CompanionAssetCardReplot";

const ASSET_KIND_OPTIONS = [
  { value: "housing", label: "주택" },
  { value: "commercial_building", label: "상업용건물·오피스텔", description: "기준시가 공시된 것" },
  { value: "general_building", label: "일반건물(토지+건물 일괄)", description: "취득가액 확인 불가 시 환산취득가 적용" },
  { value: "land", label: "토지·농지" },
  { value: "building", label: "건물(토지 제외)" },
  { value: "redevelopment_apt", label: "재개발/재건축 APT", description: "관리처분 인가일 분기로 3분할 양도차익 산정 (시행령 §166)" },
  { value: "right_to_move_in", label: "입주권" },
  { value: "presale_right", label: "분양권" },
] as const;

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 다건(일괄양도) 모드 — 자산 명칭 입력 노출 */
  isMultiBundled: boolean;
  /** 증환지 증가분 등 자산 자동 추가 콜백 */
  onAddAsset?: (patch: Partial<AssetForm>) => void;
}

export function AssetSectionBasic({ asset, onChange, isMultiBundled, onAddAsset }: Props) {
  return (
    <>
      {/* 자산 종류 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">자산 종류</label>
        <div className="flex gap-2 flex-wrap">
          {ASSET_KIND_OPTIONS.map((opt) => (
            <Fragment key={opt.value}>
              {opt.value === "redevelopment_apt" && <div className="basis-full" />}
              <button
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
            </Fragment>
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

      {/* 겸용주택 분리계산 토글 — 자산 종류가 주택일 때 상단에 노출. */}
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
          onChange={async (v) => {
            const patch: Parameters<typeof onChange>[0] = {
              addressRoad: v.road,
              addressJibun: v.jibun,
              buildingName: v.building,
              addressDetail: v.detail,
              addressDong: v.dong ?? "",
              addressHo: v.ho ?? "",
              longitude: v.lng,
              latitude: v.lat,
            };
            // 소재지 선택 시 자산 명칭 자동 입력 (사용자가 비워둔 경우에만)
            if (!asset.assetLabel.trim()) {
              const auto = [v.building || v.road || v.jibun, v.detail]
                .filter(Boolean)
                .join(" ")
                .trim();
              if (auto) patch.assetLabel = auto;
            }
            // PNU 앞 10자리 = 법정동코드(regionCode) — 엔진 정밀 조정대상지역 판정에 사용.
            if (v.pnu && v.pnu.length >= 10) {
              patch.regionCode = v.pnu.slice(0, 10);
            }
            // RTMS 매매사례가액 자동조회용 시군구코드 파생 (취득가액 추계 모드).
            const latNum = v.lat ? parseFloat(v.lat) : NaN;
            const lngNum = v.lng ? parseFloat(v.lng) : NaN;
            const hasCoord = Number.isFinite(latNum) && Number.isFinite(lngNum);
            if (v.pnu || hasCoord) {
              try {
                const outcome = await resolveSigunguCode(
                  v.pnu || undefined,
                  hasCoord ? latNum : undefined,
                  hasCoord ? lngNum : undefined,
                );
                if (!isReverseGeocodeError(outcome)) {
                  patch.acquisitionSigunguCode = outcome.sigunguCode;
                }
              } catch {
                /* 네트워크 실패 silent */
              }
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

      {/* 토지 성격 — 부수토지 vs 독립 나대지 (사례 28 landNature 명시 입력 정책) */}
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
    </>
  );
}
