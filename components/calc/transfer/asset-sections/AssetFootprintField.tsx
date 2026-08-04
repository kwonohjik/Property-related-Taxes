"use client";

/**
 * 축 C — 건물 바닥면적(정착면적) 단일 입력 위젯
 *
 * `AssetAreaSection`에서 분리했다(2026-08-04). 상업용건물·오피스텔에서는 이 필드가
 * 「면적 정보」 카드 **안**(연면적 자동계산 박스 옆)에 놓이고, 그 외 자산유형은
 * 종전대로 축 B(연면적) 옆에 놓인다 — 두 위치가 **같은 컴포넌트**를 쓰도록 떼어냈다.
 * 게이트(`showFootprintArea`)도 함께 옮겨 호출부 2곳이 단일 소스를 공유한다.
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";

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
const FOOTPRINT_AREA_KINDS: ReadonlySet<AssetForm["assetKind"]> = new Set([
  "housing",
  // 🟡 아래 2종은 **현재 엔진 소비처가 없다** — 사용자 확정(2026-08-04)에 따라
  //    장래 사용을 위해 입력만 받는다. 값은 store에 보존되고, hint가 "현재 세액에
  //    반영되지 않음"을 명시한다. validate에서 필수로 만들지 않는다(계산 차단 금지).
  //    소비처가 생기면 이 주석과 hint를 함께 갱신할 것.
  "commercial_building",
  "building",
]);

/** 축 C가 실제로 세액에 반영되는 자산유형 — hint 문구·배율 라디오 분기의 단일 소스 */
const FOOTPRINT_CONSUMED_KINDS: ReadonlySet<AssetForm["assetKind"]> = new Set(["housing"]);

/**
 * 겸용주택 분리계산 ON이면 기본정보 면적 섹션 전체를 숨기는 것이 기존 설계다
 * (`areaScenarioOptions`가 `[]` 반환 — `mixedUseTotalLandArea` + 겸용 전용 섹션이 담당).
 * 축 B·C도 같은 원칙을 따른다:
 *   축 B → `residentialFloorArea` / `nonResidentialFloorArea` (용도별 분해)
 *   축 C → `MixedUseAreaInputs`의 `buildingFootprintArea` (같은 필드, 겸용 섹션 내 입력)
 * 그러지 않으면 같은 필드가 두 곳에 동시 노출된다.
 */
export function isMixedUseSeparated(asset: AssetForm): boolean {
  return asset.assetKind === "housing" && !!asset.isMixedUseHouse;
}

/** 축 C(바닥면적) 입력을 이 자산에 렌더하는가. */
export function showFootprintArea(asset: AssetForm): boolean {
  return FOOTPRINT_AREA_KINDS.has(asset.assetKind) && !isMixedUseSeparated(asset);
}

/**
 * 축 C가 세액에 실제 반영되는가 — hint 문구와 배율 라디오 노출을 가른다.
 *
 * 배율 라디오(`appurtenantLandZone`)는 「소득세법 시행령」 제154조 제7항의 **주택**
 * 부수토지 한도 전용이라 상가·건물에는 법령상 대응 개념이 없다 → 노출하지 않는다.
 * (계획서 §4.2 — 상가·건물은 정착면적만 장래 대비 입력)
 */
export function isFootprintConsumed(asset: AssetForm): boolean {
  return FOOTPRINT_CONSUMED_KINDS.has(asset.assetKind);
}

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

export function AssetFootprintField({ asset, onChange }: Props) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">
        건물 바닥면적 (정착면적, ㎡)
        <span
          title={
            isFootprintConsumed(asset)
              ? "건물이 땅에 닿는 면적(1층 건축면적). 층별 합계인 연면적이 아닙니다. 「소득세법」 제89조 제1항 제3호의 「건물이 정착된 면적」 — 이 면적 × 지역별 배율(3·5·10배)이 1세대1주택 비과세 부수토지 한도입니다."
              : "건물이 땅에 닿는 면적(1층 건축면적). 층별 합계인 연면적이 아닙니다. 「소득세법 시행령」 제154조 제7항 부수토지 한도는 주택 전용이라 이 자산 종류에는 적용되지 않습니다 — 현재는 기록용입니다."
          }
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
        {isFootprintConsumed(asset)
          ? "미입력 시 부수토지 한도 검증 없이 전량 부수토지로 가정합니다 (「소득세법 시행령」 제154조 제7항)."
          : "이 자산 종류에서는 아직 세액 계산에 반영되지 않습니다 — 기록용으로 보관됩니다."}
      </p>
    </div>
  );
}
