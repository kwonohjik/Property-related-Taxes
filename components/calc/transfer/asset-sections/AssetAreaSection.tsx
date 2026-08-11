"use client";

/**
 * 자산 카드 ① 기본정보 — **면적 섹션** (축 A/B/C + 부수토지 배율)
 *
 * `AssetSectionBasic`에서 분리했다(2026-08-04, 793줄 → 트리거 800 임박).
 * 면적은 자산유형별 분기가 가장 깊은 영역이라 응집 단위로 떼어냈다.
 *
 * ## 구성
 *  - 자산유형 **전용 위젯**: 상가 3축 · 일반건물 3축 · 재개발 1축 · 겸용 안분 11칸
 *    (각자 단일 필드를 그대로 쓴다 — 축 A 시나리오 쌍으로 흡수하지 않는다)
 *  - 축 A: 토지 면적 + 시나리오(same·partial·reduction·increase)
 *  - 축 B: 건물 연면적
 *  - 축 C: 건물 바닥면적(정착면적) + 부수토지 배율 소재지 구분
 *  - 일반건물 한정: **비사업용토지 판정**(rose) + **주택→상가 용도변경**(fuchsia)
 *    — ③ 취득정보에서 이전(2026-08-11). 사유는 렌더 지점 주석 참조.
 *
 * ## ⛔ 단일 필드를 2시점 쌍으로 확장하지 말 것 (F2 폐기 §11)
 *
 * 전용 위젯 4종의 면적은 **단일 필드**다. 엔진이 시점별 단가에 같은 면적을 곱해
 * 환산 산식에서 면적이 약분된다. 2시점으로 나누면 취득/양도에 다른 면적이 들어가
 * 양도차익이 0이 되는 경로가 생긴다.
 * anchor: `__tests__/tax-engine/transfer/area-axis-single-field-invariant.anchor.test.ts`
 *
 * 계획: `docs/00-pm/transfer-area-unification-all-asset-kinds.plan.md`
 */

import { cn } from "@/lib/utils";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import {
  ReplotReductionFields,
  ReplotIncreaseFields,
} from "../CompanionAssetCardReplot";
import { AssetAreaCommercial, isCommercialAreaAsset } from "./AssetAreaCommercial";
import {
  AssetAreaGeneralBuilding,
  isGeneralBuildingAreaAsset,
} from "./AssetAreaGeneralBuilding";
import { GeneralBuildingNblSection } from "../GeneralBuildingNblSection";
import { GeneralBuildingConversionSection } from "../GeneralBuildingConversionSection";
import {
  AssetAreaRedevelopment,
  isRedevAreaAsset,
  shouldShowRedevValuationSection,
} from "./AssetAreaRedevelopment";
import { MixedUseAreaInputs } from "../mixed-use/MixedUseAreaInputs";
import {
  AssetFootprintField,
  isFootprintConsumed,
} from "./AssetFootprintField";
import { isMixedUseSeparated } from "./AssetFootprintField";
import { showFootprintArea } from "./AssetFootprintField";

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

/** 축 B(연면적) 입력을 이 자산에 렌더하는가. */
function showFloorArea(asset: AssetForm): boolean {
  return FLOOR_AREA_KINDS.has(asset.assetKind) && !isMixedUseSeparated(asset);
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
export function areaResetPatchForAssetKind(
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
  /** 증환지(increase) 증가분 자동 추가용 — `ReplotIncreaseFields`가 소비 */
  onAddAsset?: (patch: Partial<AssetForm>) => void;
  /** 양도일 — 일반건물 「주택→상가 용도변경」 보유기간 미리보기가 소비 */
  transferDate?: string;
}

export function AssetAreaSection({ asset, onChange, onAddAsset, transferDate }: Props) {
  return (
    <>
      {/* 면적 정보 — AREA_SCENARIOS_BY_ASSET_KIND 등재 자산유형 + 전용 위젯 보유 자산유형.
          ⚠️ 전용 위젯(상가 등)은 **자산별 단일 필드**를 그대로 쓴다 — 축 A 시나리오 쌍
             (`acquisitionArea`/`transferArea`)으로 흡수하지 않는다(F2 폐기 §11 준수). */}
      {(areaScenarioOptions(asset).length > 0 ||
        showFloorArea(asset) ||
        showFootprintArea(asset) ||
        isCommercialAreaAsset(asset) ||
        isGeneralBuildingAreaAsset(asset) ||
        (isRedevAreaAsset(asset) && shouldShowRedevValuationSection(asset)) ||
        asset.isMixedUseHouse === true) && (
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
            <>
              <AssetAreaGeneralBuilding asset={asset} onChange={onChange} />

              {/* ── 비사업용토지 판정 + 주택→상가 용도변경 ─────────────────
                  ③ 취득정보(`GeneralBuildingBlock`)에서 옮겨왔다(2026-08-11).

                  둘 다 **취득 사실이 아니라 보유 중의 토지 이용·용도 상태**를 묻는다.
                  ③은 기본 접힘인데(`CompanionAssetCard.tsx` open 초기값 `{1:true}`)
                  `gbZoneType`은 미선택 시 계산을 차단하는 **필수 필드**여서
                  (`transfer-tax-validate-gb.ts`) 접힌 섹션 안에 숨어 있었다.

                  비사업용 판정은 바로 위 카드의 `gbBuildingFootprintArea`·`gbLandArea`를
                  읽어 한도를 미리 계산한다 — 읽는 값과 쓰는 칸이 한 화면에 모인다.

                  🔒 지분(%) 분할 2번째 이후 카드에서는 이 두 카드가 **물건-수준**이라
                     노출하면 안 되는데(`GB_PROPERTY_LEVEL_FORM_FIELDS`가 자산 1의 값을
                     전 지분에 복사한다), ① 기본정보 자체가 그 경우 통째로 숨겨지므로
                     (`CompanionAssetCard.tsx` `hideInheritedSections =
                      splitMode==="fractional" && index>0`) 별도 게이트가 필요 없다.
                     종전 게이트 `shareAcquisitionOnly = splitMode==="fractional" && !isFirst`와
                     `isFirst={index === 0}`이라 **동일 조건**이다. */}
              <GeneralBuildingNblSection asset={asset} onChange={onChange} />
              <GeneralBuildingConversionSection
                asset={asset}
                onChange={onChange}
                transferDate={transferDate}
              />
            </>
          )}

          {/* ── 재개발·재건축 / 입주권 토지 면적 ──────────────────────────
              게이트는 `shouldShowRedevValuationSection` 단일 소스 — 이 값을 소비하는
              ③ 환산 섹션이 열릴 때만 노출한다(승계조합원 등은 미노출). */}
          {isRedevAreaAsset(asset) && shouldShowRedevValuationSection(asset) && (
            <AssetAreaRedevelopment asset={asset} onChange={onChange} />
          )}

          {/* ── 겸용주택 면적 안분 카드 (11칸) ────────────────────────────
              ⚠️ **카드 통째로** 옮겼다. `mixedUseTotalLandArea`는 주택/상가 부수토지
                 안분의 **분모**이고(`mixed-use-derived-areas.ts:66-73`) 결과 6칸이 같은
                 카드에 있다. 1칸만 떼면 분모와 결과가 두 화면으로 갈리고, "부수토지 합 =
                 전체 토지" validate를 맞추려 사용자가 ①↔③을 오가야 한다.
              ※ 1-A(취득시점 자산 구성)는 ③에 남는다 — 카드 안내 문구가 그 관계를 설명. */}
          {asset.isMixedUseHouse === true && (
            <MixedUseAreaInputs asset={asset} onChange={onChange} sectionNum={1} />
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

          {/* ── 축 C: 건물 바닥면적(정착면적) ────────────────────────────
              ⚠️ 상가·오피스텔은 여기서 렌더하지 않는다 — `AssetAreaCommercial`
                 카드 안(연면적 자동계산 박스 옆)이 그 자산유형의 입력 자리다.
                 같은 `AssetFootprintField`를 쓰므로 필드·testid는 동일하다. */}
          {showFootprintArea(asset) && !isCommercialAreaAsset(asset) && (
            <AssetFootprintField asset={asset} onChange={onChange} />
          )}
          </div>

          {/* ── 부수토지 배율 판정용 소재지 구분 (영 §168의12 · §167의5 · §154⑦ — 배율 동일) ──
              「소득세법 시행령」 제154조 제7항은 **주택** 부수토지 한도라 상가·건물에는
              대응 개념이 없다 → `isFootprintConsumed`로 주택 전용 유지. */}
          {showFootprintArea(asset) && isFootprintConsumed(asset) && parseDecimal(asset.buildingFootprintArea) > 0 && (
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
    </>
  );
}
