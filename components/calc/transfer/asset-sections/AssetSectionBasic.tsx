"use client";

/**
 * ① 기본정보 — 자산종류·겸용토글·소재지·입주권·자산명칭·면적·토지성격·공유 지분율.
 * (지분율은 2026-06-30에 ③ 취득정보로 나갔다가 2026-08-11에 사용자 확정으로 되돌아왔다 —
 *  지분 분할 모드의 「취득 지분율」만 ③에 남는다.)
 * CompanionAssetCard L175–472 JSX를 그대로 이동 (동작 변화 0).
 */
import { Fragment } from "react";

import type {
  AssetForm,
  TransferFormData,
} from "@/lib/stores/calc-wizard-store";
import { cn } from "@/lib/utils";
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import {
  AddressSearch,
  type AddressValue,
} from "@/components/ui/address-search";
import {
  resolveSigunguCode,
  isReverseGeocodeError,
} from "@/lib/calc/vworld-reverse-geocode";
import { MixedUseToggleRow } from "../MixedUseSection";
import { NonHousingConversionToggleRow } from "../NonHousingConversionSection";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import {
  AssetAreaSection,
  areaResetPatchForAssetKind,
} from "./AssetAreaSection";
import { redevSubjectPatchForAssetKind } from "./AssetAreaRedevelopment";
import { housingFlagResetPatchForAssetKind } from "./housing-flag-reset";
import { successorRightTogglePatch } from "@/lib/calc/transfer-successor-right";
import { CompanionLandNatureBlock } from "../CompanionLandNatureBlock";
import { OwnershipRatioBlock, type AssetSplitMode } from "../OwnershipRatioInput";

const ASSET_KIND_OPTIONS = [
  { value: "housing", label: "주택" },
  {
    value: "commercial_building",
    label: "상업용건물·오피스텔",
    description: "기준시가 공시된 것",
  },
  {
    value: "general_building",
    label: "일반건물(토지+건물 일괄)",
    description: "취득가액 확인 불가 시 환산취득가 적용",
  },
  { value: "land", label: "단순토지(나대지,농지,임야)" },
  { value: "building", label: "건물(토지 제외)" },
  {
    value: "redevelopment_apt",
    label: "재개발/재건축 APT",
    description: "관리처분 인가일 분기로 3분할 양도차익 산정 (시행령 §166)",
  },
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
  /** 첫 자산(주 자산) 카드일 때만 양도일·신고일 입력란 노출 (폼-전역값) */
  showFormDates?: boolean;
  /** 폼-전역 양도일 */
  transferDate?: string;
  /** 폼-전역 신고일 */
  filingDate?: string;
  /** 신고기한 초과 여부 (Step1 산출) */
  filingOverdue?: boolean;
  /** 신고기한 문자열 (Step1 산출, 양도일 미입력 시 빈 문자열) */
  filingDeadline?: string;
  /** 폼-전역 패치 (양도일·신고일 write — handleFormChange 경유) */
  onFormChange?: (patch: Partial<TransferFormData>) => void;
  /** 첫 자산(index 0) 여부 — §95⑤ 용도변경 토글 노출 게이트 (거주분이 assets[0] 전용) */
  isFirst?: boolean;
  /**
   * 자산 분할 모드 — 「공유 지분율」 노출 게이트.
   * `"fractional"`이면 지분율은 ③ 취득정보 최상단에 「취득 지분율」로 뜨므로 여기서는 숨긴다.
   */
  splitMode?: AssetSplitMode;
}

export function AssetSectionBasic({
  asset,
  onChange,
  isMultiBundled,
  onAddAsset,
  showFormDates,
  transferDate,
  filingDate,
  filingOverdue,
  filingDeadline,
  onFormChange,
  isFirst,
  splitMode,
}: Props) {
  return (
    <>
      {/* 양도일·신고일 — 폼-전역값. 첫 자산(주 자산)에만 입력란, 나머지는 공통 안내 */}
      {showFormDates ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldCard
            label="양도일"
            required
            warning={
              filingOverdue
                ? `⚠ 신고기한(${filingDeadline})을 지났습니다 — 가산세 자동 적용`
                : undefined
            }
          >
            <DateInput
              value={transferDate ?? ""}
              onChange={(v) => onFormChange?.({ transferDate: v })}
              data-testid="transfer-date"
            />
          </FieldCard>
          <FieldCard label="신고일">
            <DateInput
              value={filingDate ?? ""}
              onChange={(v) => onFormChange?.({ filingDate: v })}
              data-testid="filing-date"
            />
          </FieldCard>
        </div>
      ) : (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          양도일·신고일은 주 자산(자산 1)과 공통입니다.
        </p>
      )}

      {/* 자산 종류 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">자산 종류</label>
        <div className="flex gap-2 flex-wrap">
          {ASSET_KIND_OPTIONS.map((opt) => (
            <Fragment key={opt.value}>
              {opt.value === "redevelopment_apt" && (
                <div className="basis-full" />
              )}
              <button
                type="button"
                onClick={() =>
                  onChange({
                    assetKind: opt.value,
                    ...areaResetPatchForAssetKind(asset, opt.value),
                    ...redevSubjectPatchForAssetKind(opt.value),
                    // 🔴 주택 전용 플래그(겸용·용도변경)도 함께 비운다 — 두 토글은 아래
                    //    `assetKind === "housing"` 게이트 안에만 있어 전환 즉시 끄는 수단이
                    //    사라지는데, ⑧은 자산 종류를 보지 않아 칸 없는 입력을 요구했다.
                    ...housingFlagResetPatchForAssetKind(opt.value),
                  })
                }
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
            ※ 기준시가 공시된 것 — 국세청이 호별 ㎡당 기준시가를 고시한
            상업용건물·오피스텔(수도권·5대 광역시 3,000㎡ 이상 또는 100호 이상
            구분소유 건물 / 구분소유된 오피스텔)에 한합니다.
          </p>
        )}
        {asset.assetKind === "general_building" && (
          <p className="text-xs text-muted-foreground mt-1">
            ※ 토지와 건물을 일괄 양도하는 일반건물 — 근린생활시설·단독건물 등.
            취득가액 확인 불가 시 하단 환산취득가 섹션에서 양도·취득 시점
            기준시가를 입력하세요.
          </p>
        )}
      </div>

      {/* 미등기 양도(§104③) — **컴패니언 자산 전용**.
          주 자산은 폼-전역 값을 「보유 상황 ⑤ 특수 상황」에서 받으므로 여기 두면 dual-truth가 된다.
          일괄양도는 물건마다 등기 여부가 다를 수 있어 자산-수준 입력이 필요하다.
          컴패니언 `assetKind` enum은 housing·land·building 3종뿐이라(§94①1호 자산) 종류 게이트가 없다. */}
      {!isFirst && (
        <ToggleCard
          variant="chip"
          tone="rose"
          title="미등기 양도"
          description="70% 단일세율 — 장기보유공제·기본공제 배제, 개산공제 0.3%"
          checked={asset.isUnregistered}
          onCheckedChange={(v) => onChange({ isUnregistered: v })}
        />
      )}

      {/* 겸용주택 분리계산 토글 — 자산 종류가 주택일 때 상단에 노출.
          바로 아래 §95⑤ 토글과 **배타**라(일부만 주택 ↔ 전부 주택) 나란히 둔다. */}
      {asset.assetKind === "housing" && (
        <>
          <MixedUseToggleRow asset={asset} onChange={onChange} />
          {/* 건물 전체를 주택으로 용도변경 (§95⑤·⑥) — 토글만. 개시일·미리보기는 ③ 취득정보.
              전체폭: 설명문이 가장 길고, 위 2토글은 §166⑥이 겸용주택에 종속돼 한 줄로 묶인다. */}
          {isFirst && (
            <NonHousingConversionToggleRow asset={asset} onChange={onChange} />
          )}
        </>
      )}

      {/* 소재지 검색 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">소재지</label>
        <AddressSearch
          value={
            {
              road: asset.addressRoad,
              jibun: asset.addressJibun,
              building: asset.buildingName ?? "",
              detail: asset.addressDetail ?? "",
              lng: asset.longitude ?? null,
              lat: asset.latitude ?? null,
            } satisfies AddressValue
          }
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
            // 전체 PNU 19자리 — 건물 기준시가 모달 prefill 시 건축물대장 조회 활성화용(UI 전용).
            if (v.pnu && v.pnu.length === 19) {
              patch.addressPnu = v.pnu;
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
              {
                value: false,
                label: "원조합원",
                desc: "조합원자격을 직접 취득",
              },
              {
                value: true,
                label: "승계조합원",
                desc: "입주권을 양수(승계취득)",
              },
            ].map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => onChange(successorRightTogglePatch(opt.value))}
                className={cn(
                  "rounded-md border-2 p-2 text-left transition-all",
                  asset.isSuccessorRightToMoveIn === opt.value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
                )}
              >
                <div className="text-sm font-semibold">{opt.label}</div>
                <div className="text-caption text-muted-foreground">
                  {opt.desc}
                </div>
              </button>
            ))}
          </div>
          <p className="text-caption text-muted-foreground">
            ※ 승계조합원은 장기보유특별공제 미적용 (소득세법 §95② 본문 괄호)
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


      {/* 면적 섹션 (축 A/B/C + 전용 위젯) — 793줄 초과로 분리(2026-08-04) */}
      <AssetAreaSection
        asset={asset}
        onChange={onChange}
        onAddAsset={onAddAsset}
        transferDate={transferDate}
      />

      {/* 토지 성격 — 부수토지 vs 독립 나대지 (사례 28 landNature 명시 입력 정책) */}
      {asset.assetKind === "land" && (
        <CompanionLandNatureBlock
          landNature={asset.landNature}
          assetId={asset.assetId}
          onChange={onChange}
        />
      )}

      {/* 공유 지분율 — ③ 취득정보에서 되돌아왔다 (2026-08-11 사용자 확정).
          「이 물건 중 내 몫이 얼마인가」는 자산 정체성이라 ①이 제자리다. ③에서는
          「취득가액 산정 방식 → 취득가액 → 기준시가」 흐름 한가운데를 끊었다.
          ⚠️ 지분 분할 모드(splitMode==="fractional")에서는 여기가 아니라 ③ 최상단에
             「취득 지분율」로 뜬다 — 취득시기·원인이 지분마다 다른 최상위 분기이기 때문이다.
             두 자리는 **배타**다(둘 다 뜨면 같은 값을 두 곳에서 고치게 된다). */}
      {splitMode !== "fractional" && (
        <OwnershipRatioBlock
          numerator={asset.ownershipNumerator}
          denominator={asset.ownershipDenominator}
          label="공유 지분율"
          onChange={(patch) =>
            onChange({
              ...(patch.numerator !== undefined
                ? { ownershipNumerator: patch.numerator }
                : {}),
              ...(patch.denominator !== undefined
                ? { ownershipDenominator: patch.denominator }
                : {}),
              // 지분율이 100%로 되돌아오면 선언은 뜻을 잃는다 — ⑤가 토글을 숨기므로
              // 값만 남으면 화면에 없는 상태가 게이트를 통과시킨다(③ normalize와 같은 규율).
              ...((patch.numerator ?? asset.ownershipNumerator) ===
              (patch.denominator ?? asset.ownershipDenominator)
                ? { ownershipRemainderThirdParty: "" as const }
                : {}),
            })
          }
          remainderThirdParty={asset.ownershipRemainderThirdParty}
          onRemainderChange={(v) => onChange({ ownershipRemainderThirdParty: v })}
        />
      )}

    </>
  );
}
