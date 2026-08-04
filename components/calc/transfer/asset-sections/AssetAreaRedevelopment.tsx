"use client";

/**
 * 재개발·재건축 / 입주권 토지 면적 — ① 기본정보 전용 위젯
 *
 * ## 왜 여기로 옮겼는가 (2026-08-04)
 *
 * 종전에는 `RedevelopmentValuationSection`의 **두 갈래**가 같은 `redevLandArea`를
 * 각각 렌더했다(`:174` `isLand ? <LandContribValuationContent> : <메인>` 삼항).
 * 상호배타라 화면 중복은 없었지만 입력 위치가 원자산 종류에 따라 달랐다.
 * ① 기본정보로 올려 한 자리로 만든다.
 * 계획: `docs/00-pm/transfer-area-unification-all-asset-kinds.plan.md` P2.
 *
 * ## 게이트를 함께 옮겼다 — `shouldShowRedevValuationSection`
 *
 * 면적을 무조건 노출하면 **승계조합원**처럼 이 값을 쓰지 않는 경로에도 입력칸이 뜬다.
 * 그래서 종전에 섹션 전체를 가리던 조건을 이 파일의 술어로 추출하고,
 * `RedevelopmentBlock`과 ① 양쪽이 **같은 함수**를 쓰도록 했다(dual-truth 방지).
 *
 * ## ⛔ 단일 필드를 2시점 쌍으로 확장하지 말 것
 *
 * `redevLandArea`는 취득·관리처분 시점 **동일 가정**의 단일 필드다
 * (`calc-wizard-asset-redev.ts:107`). 2시점으로 나누면 §166③ 분자·분모 공통 면적이
 * 깨지고 환산비율이 왜곡된다.
 * anchor: `__tests__/tax-engine/transfer/area-axis-single-field-invariant.anchor.test.ts`
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

/** 이 위젯이 담당하는 자산유형인지 */
export function isRedevAreaAsset(asset: AssetForm): boolean {
  return (
    asset.assetKind === "redevelopment_apt" ||
    asset.assetKind === "right_to_move_in"
  );
}

/**
 * 재개발 환산취득가 섹션(=`redevLandArea` 소비 경로)이 열리는 조건 — **단일 소스**.
 *
 * `RedevelopmentBlock`의 ⑥ rose 카드 게이트를 그대로 추출한 것이다:
 *  - 승계조합원(`redevIsSuccessorMember === "yes"`)은 본 경로 미지원 → 숨김
 *  - 단독주택 출자 §164⑤ 분기(housing + right + receive + estimated)는 전용
 *    ⑤-a 카드(`HousingContribEstimatedSection`)를 쓰므로 일반 환산 카드를 숨김
 *
 * ⚠️ 이 술어를 복제하지 말 것 — 면적 입력(①)과 섹션 렌더(③)가 갈리면 사용자가
 *    면적을 넣을 수 없거나(dead-end) 쓰이지 않는 값을 넣게 된다.
 */
export function shouldShowRedevValuationSection(asset: AssetForm): boolean {
  if (asset.redevIsSuccessorMember === "yes") return false;
  const isHousingContribEstimated =
    asset.redevOriginalAssetType === "housing" &&
    (asset.redevSubject === "right" || asset.assetKind === "right_to_move_in") &&
    asset.redevSettlementDirection === "receive" &&
    asset.useEstimatedAcquisition === true;
  return !isHousingContribEstimated;
}

export function AssetAreaRedevelopment({ asset, onChange }: Props) {
  // 사례 37 토지 출자 분기 — hint의 법령 맥락이 갈린다(§166③ vs 일반 환산)
  const isLand = asset.redevOriginalAssetType === "land";

  return (
    <ToneCard tone="sky" title="면적 정보 (㎡)" noDark>
      <FieldCard
        label="취득·양도 당시 토지 면적 (㎡)"
        hint={
          isLand
            ? "§166③ 분자·분모 공통 면적. 취득·관리처분 시점 동일 가정."
            : "시점별 동일 가정 — 환지·합병으로 면적이 다른 케이스는 후속 PR"
        }
      >
        <DecimalInput
          value={asset.redevLandArea}
          onChange={(v) => onChange({ redevLandArea: v })}
          unit="㎡"
        />
      </FieldCard>
    </ToneCard>
  );
}
