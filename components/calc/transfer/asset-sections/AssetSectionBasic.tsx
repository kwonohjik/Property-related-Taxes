"use client";

/**
 * ① 기본정보 — 자산종류·겸용토글·소재지·입주권·자산명칭·면적·토지성격. (지분율은 ③ 취득정보로 이전)
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import {
  AddressSearch,
  type AddressValue,
} from "@/components/ui/address-search";
import {
  resolveSigunguCode,
  isReverseGeocodeError,
} from "@/lib/calc/vworld-reverse-geocode";
import { MixedUseToggleRow } from "../MixedUseSection";
import {
  AssetAreaCommercial,
  isCommercialAreaAsset,
} from "./AssetAreaCommercial";
import {
  AssetAreaGeneralBuilding,
  isGeneralBuildingAreaAsset,
} from "./AssetAreaGeneralBuilding";
import { CompanionLandNatureBlock } from "../CompanionLandNatureBlock";
import {
  ReplotReductionFields,
  ReplotIncreaseFields,
} from "../CompanionAssetCardReplot";

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

type AreaScenario = NonNullable<AssetForm["areaScenario"]>;

/**
 * 면적 시나리오 허용 자산유형 — **키 부재 = 면적 섹션 미렌더**.
 *
 * 자산유형마다 전용 전체면적 필드가 이미 존재하므로(docs/02-design/area-taxonomy.md ·
 * transfer-asset-area-basic-info.engine.design.md §4.1), 여기 등재하는 것은
 * `acquisitionArea`/`transferArea`를 소비하면서 **전용 입력 섹션이 없는** 자산유형뿐이다.
 *
 *   land    → acquisitionArea/transferArea (본 섹션이 정본)
 *   housing → acquisitionArea (PHD·환산이 소비. 종전엔 PHD 섹션에만 입력 칸이 있어
 *             PHD를 끄면 입력 수단이 사라졌다 → 본 섹션으로 승격)
 *
 * 등재하지 않는 자산유형과 그 전용 필드:
 *   housing+겸용        → mixedUseTotalLandArea (MixedUseAreaInputs)
 *   commercial_building → cbLandArea + cbExclusiveArea + cbSharedArea (§164⑥ 3축)
 *   general_building    → gbLandArea + gbBuildingArea + gbBuildingFootprintArea
 *   redevelopment_apt · right_to_move_in → redevLandArea
 * 이들을 등재하면 같은 면적을 두 곳에서 입력받게 된다.
 *
 * 환지(reduction·increase)는 소득령 §162의2 토지 제도이므로 land 전용.
 */
const AREA_SCENARIOS_BY_ASSET_KIND: Partial<
  Record<AssetForm["assetKind"], AreaScenario[]>
> = {
  land: ["same", "partial", "reduction", "increase"],
  housing: ["same", "partial"],
  /**
   * 건물(토지 제외) — 축 A(**토지** 면적)와 축 B(연면적)를 **모두** 갖는다.
   *
   * 라벨 "건물(토지 제외)"는 「소득세법」 제99조 제1항 제1호 **나목**의 *기준시가 공시 범위*를
   * 뜻한다 — 토지가 없다는 뜻이 아니다. 나목에는 "딸린 토지" 문구가 없고 다목(오피스텔·
   * 상업용건물)에만 "이에 딸린 토지를 포함한다"가 붙으므로(같은 조 제3항 제4호에서 확인),
   * **나목 건물의 부수토지는 가목으로 별도 평가**된다. 그래서 축 A가 실재한다:
   *   `toPropertyType(building_non_residential)` → "land"(`StandardPriceInput.tsx:69~70`)
   *   → 조회 대상이 **개별공시지가**이고 `acquisitionArea`가 그 곱셈 인자다.
   *
   * ⚠️ **`same` 단일**이다. 종전 `["same","partial"]`(PR #912)은 land·housing 패턴을
   *    기계적으로 복사한 것으로, `partial`은 취득·양도에 **서로 다른 면적**을 기준시가
   *    곱셈에 넣어 환산비율을 왜곡했다(면적비가 단가비를 상쇄해 양도차익 0).
   *    anchor: `basic-info-building-area.anchor.test.ts` A-6.
   *    ※ `land`·`housing`처럼 `resolveAcqAreaForStdPrice`(B-4)를 태우면 `partial`도
   *      안전해지지만, 별건이다 — 필요해지면 그때 확장한다.
   */
  building: ["same"],
};

/**
 * `same` 시나리오 단일 입력의 라벨 — taxonomy 원칙 C `[세법 역할]+[기준 시점]+"면적 (㎡)"`.
 * 대상어는 그 면적이 실제로 곱해지는 대상에서 온다:
 *   land    → 토지 기준시가 = ㎡당 개별공시지가 × 면적
 *   housing → 부수토지 면적(PHD §164⑤·환산의 곱셈 인자)
 *   building→ 부수토지 면적 — 「소득세법」 제99조 제1항 제1호 **가목**(개별공시지가 × 면적).
 *             나목 건물분은 축 B(`buildingFloorArea`)가 담당한다.
 */
const AREA_LABEL_BY_ASSET_KIND: Partial<Record<AssetForm["assetKind"], string>> = {
  land: "취득·양도 당시 면적 (㎡)",
  housing: "취득·양도 당시 토지 면적 (㎡)",
  building: "취득·양도 당시 토지 면적 (㎡)",
};

/**
 * 축 B(건물 연면적) 입력 대상 자산유형.
 *
 * - `housing`: 「건물 기준시가 계산서」의 곱셈 인자. 종전에는 폼 필드가 없어 시점별 모달에서
 *   각각 수동 입력했고 스냅샷 키가 시점별로 갈려 **3시점 불일치**가 무검증 통과했다
 *   (anchor A-3). 단독주택 건물분 기준시가·PHD §164⑤ 환산이 이 값에 의존한다.
 * - `building`: 자산 자체가 건물이므로 축 B가 유일한 면적이다.
 *
 * GB·상가·겸용은 전용 필드(`gbBuildingArea`·`cbExclusiveArea`+`cbSharedArea`·
 * `residentialFloorArea`)가 담당한다 — F2 범위.
 */
const FLOOR_AREA_KINDS: ReadonlySet<AssetForm["assetKind"]> = new Set(["housing", "building"]);

/**
 * 축 C(건물 바닥면적·정착면적) 입력 대상 자산유형.
 *
 * `housing`만이다. 소비처는 「소득세법」 제89조 제1항 제3호("건물이 정착된 면적") →
 * 「소득세법 시행령」 제154조 제7항 부수토지 한도(`limitArea = 정착면적 × 3/5/10배`)와
 * 겸용 주거분 정착면적 안분이다.
 *
 * 종전 입력 경로는 **겸용 ON** 또는 **취득원인 신축**뿐이어서, 주택·겸용OFF·매매 자산은
 * 영구 공백이 되고 엔진이 "전량 부수토지"로 가정했다(anchor A-1 — 초과 200㎡ ↔ 0㎡).
 *
 * ⚠️ `land`는 제외한다. 그 축 C는 `nblHousingFootprint`(「소득세법」 제104조의3 제1항
 *    제5호 "**주택**이 정착된 면적")가 담당하며 **다른 법령 개념**이다 — 합치면 겸용에서
 *    오답이 된다(계획서 U-3).
 * ⚠️ `building`은 토지가 없어 부수토지 판정 자체가 없다 → 제외.
 */
const FOOTPRINT_AREA_KINDS: ReadonlySet<AssetForm["assetKind"]> = new Set(["housing"]);

/**
 * 부수토지 인정 배율 — 「소득세법」 시행령 제168의12(비사업용 토지)·제167조의5(세율)·제154조 제7항
 * (비과세) 세 조문의 배율이 동일하다(3/5/5/10). 2022.1.1. 전 양도분은 도시지역 일률 5배.
 * 라벨은 `NewConstructionFootprintSection`의 ZONE_OPTIONS와 같은 문구를 쓴다.
 */
const APPURTENANT_ZONE_OPTIONS: { value: NonNullable<AssetForm["appurtenantLandZone"]>; label: string; description: string }[] = [
  {
    value: "metropolitan_residential",
    label: "수도권 도시지역 (주거·상업·공업)",
    description: "정착면적 × 3배 한도",
  },
  {
    value: "non_metropolitan_or_green",
    label: "수도권 녹지 / 수도권 외 도시지역",
    description: "정착면적 × 5배 한도",
  },
  { value: "non_urban", label: "도시지역 외", description: "정착면적 × 10배 한도" },
];

/**
 * 겸용주택 분리계산 ON이면 기본정보 면적 섹션 전체를 숨기는 것이 기존 설계다
 * (`areaScenarioOptions`가 `[]` 반환 — `mixedUseTotalLandArea` + 겸용 전용 섹션이 담당).
 * 축 B·C도 같은 원칙을 따른다:
 *   축 B → `residentialFloorArea` / `nonResidentialFloorArea` (용도별 분해)
 *   축 C → `MixedUseAreaInputs`의 `buildingFootprintArea` (같은 필드, 겸용 섹션 내 입력)
 * 그러지 않으면 같은 필드가 두 곳에 동시 노출된다.
 */
function isMixedUseSeparated(asset: AssetForm): boolean {
  return asset.assetKind === "housing" && !!asset.isMixedUseHouse;
}

/** 축 B(연면적) 입력을 이 자산에 렌더하는가. */
function showFloorArea(asset: AssetForm): boolean {
  return FLOOR_AREA_KINDS.has(asset.assetKind) && !isMixedUseSeparated(asset);
}

/** 축 C(바닥면적) 입력을 이 자산에 렌더하는가. */
function showFootprintArea(asset: AssetForm): boolean {
  return FOOTPRINT_AREA_KINDS.has(asset.assetKind) && !isMixedUseSeparated(asset);
}

const AREA_SCENARIO_LABEL: Record<AreaScenario, string> = {
  same: "취득면적 = 양도면적 (일반)",
  partial: "일부 양도 — 취득 토지 중 일부만 양도",
  reduction: "환지처분 (감환지) — 교부면적 < 권리면적",
  increase: "환지처분 (증환지) — 교부면적 > 권리면적",
};

/** 이 자산에서 선택 가능한 면적 시나리오. 빈 배열 = 면적 섹션 미렌더. */
function areaScenarioOptions(asset: AssetForm): AreaScenario[] {
  // 겸용주택은 mixedUseTotalLandArea + 겸용 전용 섹션이 전체 면적을 담당한다.
  if (asset.assetKind === "housing" && asset.isMixedUseHouse) return [];
  return AREA_SCENARIOS_BY_ASSET_KIND[asset.assetKind] ?? [];
}

/**
 * assetKind 변경 시 함께 보낼 면적 패치.
 * 새 자산유형에서 허용되지 않는 areaScenario가 stale로 남으면 숨은 분기(환지 3필드 등)가
 * 계산에 반영된다 → 허용 목록 첫 항목으로 리셋하고 환지 전용 필드를 비운다.
 * useEffect 미러링 금지 정책상 assetKind onChange와 **단일 배치**로 전달한다.
 */
function areaResetPatchForAssetKind(
  asset: AssetForm,
  nextKind: AssetForm["assetKind"],
): Partial<AssetForm> {
  const allowed = areaScenarioOptions({ ...asset, assetKind: nextKind });
  const current = asset.areaScenario ?? "same";
  if (allowed.length === 0 || allowed.includes(current)) return {};
  return {
    areaScenario: allowed[0],
    replottingConfirmDate: "",
    entitlementArea: "",
    allocatedArea: "",
    priorLandArea: "",
  };
}

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

      {/* 겸용주택 분리계산 토글 — 자산 종류가 주택일 때 상단에 노출. */}
      {asset.assetKind === "housing" && (
        <MixedUseToggleRow asset={asset} onChange={onChange} />
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
                onClick={() =>
                  onChange({ isSuccessorRightToMoveIn: opt.value })
                }
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

      {/* 면적 정보 — AREA_SCENARIOS_BY_ASSET_KIND 등재 자산유형 + 전용 위젯 보유 자산유형.
          ⚠️ 전용 위젯(상가 등)은 **자산별 단일 필드**를 그대로 쓴다 — 축 A 시나리오 쌍
             (`acquisitionArea`/`transferArea`)으로 흡수하지 않는다(F2 폐기 §11 준수). */}
      {(areaScenarioOptions(asset).length > 0 ||
        showFloorArea(asset) ||
        showFootprintArea(asset) ||
        isCommercialAreaAsset(asset) ||
        isGeneralBuildingAreaAsset(asset)) && (
        <div className="space-y-3">
          {/* ── 상업용건물·오피스텔 전용 면적 3축 (전용·공유·대지) ──────────
              취득원인 무관 단일 입력. 종전에는 CommercialBuildingBlock(비상속)과
              CommercialInheritanceStdPriceSection(상속)이 같은 3필드를 각각 렌더했다. */}
          {isCommercialAreaAsset(asset) && (
            <AssetAreaCommercial asset={asset} onChange={onChange} />
          )}

          {/* ── 일반건물 전용 면적 (토지·연면적·바닥면적) ──────────────────
              ⚠️ 「건축물 바닥면적」(건축법 시행령 §119①3호)은 주택 「정착면적」
                 (소득세법 §89①3호)과 **다른 법령 개념**이다 — 통합 금지. */}
          {isGeneralBuildingAreaAsset(asset) && (
            <AssetAreaGeneralBuilding asset={asset} onChange={onChange} />
          )}
          {/* ── 축 A: 토지 면적 (시나리오 분기) ──────────────────────────
              ⛔ **자산유형별로 축 A를 끄는 예외를 만들지 말 것**(2026-07-30 U-12).
                 `building`("건물(토지 제외)")을 제외했다가 되돌렸다 — 그 라벨은 「소득세법」
                 제99조 제1항 제1호 나목의 *기준시가 공시 범위*이지 토지 부재가 아니고,
                 부수토지는 가목으로 별도 평가된다. 끄면 토지 면적의 입력 경로가 사라져
                 validate가 "토지 면적을 입력하세요"로 차단하는 dead-end가 된다
                 (`transfer-tax-validate-split.ts:115,155,247`).
                 축 A가 불필요한 자산유형은 `AREA_SCENARIOS_BY_ASSET_KIND` 미등재로 표현한다. */}
          {areaScenarioOptions(asset).length > 0 && (
          <>
          <div
            className={cn(
              (asset.areaScenario ?? "same") === "same" &&
                "grid grid-cols-1 sm:grid-cols-2 gap-3 items-end",
            )}
          >
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">
                면적 입력 방식
              </label>
              <Select
                value={asset.areaScenario ?? "same"}
                onValueChange={(v) => {
                  const next = v as AssetForm["areaScenario"];
                  if (next === "same") {
                    const val =
                      asset.transferArea || asset.acquisitionArea || "";
                    onChange({
                      areaScenario: next,
                      acquisitionArea: val,
                      transferArea: val,
                      replottingConfirmDate: "",
                      entitlementArea: "",
                      allocatedArea: "",
                      priorLandArea: "",
                    });
                  } else if (next === "reduction" || next === "increase") {
                    onChange({
                      areaScenario: next,
                      replottingConfirmDate: "",
                      entitlementArea: "",
                      allocatedArea: "",
                      priorLandArea: "",
                    });
                  } else {
                    onChange({ areaScenario: next });
                  }
                }}
              >
                <SelectTrigger className="h-9 w-full" data-testid="area-scenario-select">
                  <span className="text-left">
                    {AREA_SCENARIO_LABEL[asset.areaScenario ?? "same"]}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {areaScenarioOptions(asset).map((sc) => (
                    <SelectItem key={sc} value={sc}>
                      {AREA_SCENARIO_LABEL[sc]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* same: 단일 면적 입력 */}
            {(asset.areaScenario ?? "same") === "same" && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  {AREA_LABEL_BY_ASSET_KIND[asset.assetKind] ??
                    "취득·양도 당시 면적 (㎡)"}
                  <span
                    title="취득·양도 기준시가 = ㎡ 단가 × 이 면적. 공시가격 자동 조회 및 환산취득가 계산에 사용됩니다."
                    className="ml-1 cursor-help"
                  >
                    ⓘ
                  </span>
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
          </div>

          {/* partial: 취득·양도 분리 입력 */}
          {asset.areaScenario === "partial" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  취득 당시 면적 (㎡)
                  <span
                    title="처음 취득 시 보유한 전체 면적. 취득 기준시가 = ㎡ 단가 × 이 면적."
                    className="ml-1 cursor-help"
                  >
                    ⓘ
                  </span>
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
                  <span
                    title="이번 양도 계약에서 매매하는 면적. 양도 기준시가 = ㎡ 단가 × 이 면적."
                    className="ml-1 cursor-help"
                  >
                    ⓘ
                  </span>
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
            <ReplotIncreaseFields
              asset={asset}
              onChange={onChange}
              onAddAsset={onAddAsset}
            />
          )}
          </>
          )}

          {/* ── 축 B·C: 건물 연면적 · 바닥면적(정착면적) — 둘 다 표시되면 한 행 ── */}
          <div
            className={cn(
              showFloorArea(asset) &&
                showFootprintArea(asset) &&
                "grid grid-cols-1 sm:grid-cols-2 gap-3 items-start",
            )}
          >
          {/* ── 축 B: 건물 연면적 ──────────────────────────────────────── */}
          {showFloorArea(asset) && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                건물 연면적 (㎡)
                <span
                  title="각 층 바닥면적의 합(건축물대장 연면적). 건물 기준시가 = ㎡당 금액 × 이 면적. 취득·최초공시·양도 3시점 계산에 같은 값이 쓰입니다."
                  className="ml-1 cursor-help"
                >
                  ⓘ
                </span>
              </label>
              <DecimalInput
                value={asset.buildingFloorArea}
                onChange={(v) => onChange({ buildingFloorArea: v })}
                placeholder="건축물대장 연면적"
                data-testid="basic-building-floor-area"
              />
            </div>
          )}

          {/* ── 축 C: 건물 바닥면적(정착면적) ──────────────────────────── */}
          {showFootprintArea(asset) && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                건물 바닥면적 (정착면적, ㎡)
                <span
                  title="건물이 땅에 닿는 면적(1층 건축면적). 층별 합계인 연면적이 아닙니다. 「소득세법」 제89조 제1항 제3호의 「건물이 정착된 면적」 — 이 면적 × 지역별 배율(3·5·10배)이 1세대1주택 비과세 부수토지 한도입니다."
                  className="ml-1 cursor-help"
                >
                  ⓘ
                </span>
              </label>
              <DecimalInput
                value={asset.buildingFootprintArea}
                onChange={(v) => onChange({ buildingFootprintArea: v })}
                placeholder="1층 건축면적"
                data-testid="basic-building-footprint-area"
              />
              <p className="text-caption text-muted-foreground">
                미입력 시 부수토지 한도 검증 없이 전량 부수토지로 가정합니다 (「소득세법 시행령」 제154조 제7항).
              </p>
            </div>
          )}
          </div>

          {/* ── 부수토지 배율 판정용 소재지 구분 (영 §168의12 · §167의5 · §154⑦ — 배율 동일) ── */}
          {showFootprintArea(asset) && parseDecimal(asset.buildingFootprintArea) > 0 && (
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-muted-foreground">
                부수토지 소재지 구분
                <span
                  title="정착면적에 곱할 배율을 정합니다. 한도를 넘는 부수토지는 1세대1주택 비과세에서 제외되고 「소득세법」 제104조의3 제1항 제5호의 비사업용 토지가 됩니다."
                  className="ml-1 cursor-help"
                >
                  ⓘ
                </span>
              </label>
              <RadioCardGroup
                name={`appurtenantLandZone-${asset.assetId}`}
                tone="sky"
                layout="stack"
                columns={3}
                value={asset.appurtenantLandZone ?? ""}
                onChange={(v) =>
                  onChange({ appurtenantLandZone: v as AssetForm["appurtenantLandZone"] })
                }
                options={APPURTENANT_ZONE_OPTIONS}
              />
              <p className="text-caption text-muted-foreground">
                미선택 시 배율 한도 검증을 하지 않습니다 — 토지 면적이 정착면적의 3배를 넘으면 필수입니다.
              </p>
            </div>
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

    </>
  );
}
