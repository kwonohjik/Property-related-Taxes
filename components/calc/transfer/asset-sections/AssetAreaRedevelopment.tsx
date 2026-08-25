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

import { isHousingContribEstimatedAxes } from "@/lib/tax-engine/redevelopment-branch-gate";
interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

/** 이 위젯이 담당하는 자산유형인지 */
/**
 * 자산 종류 → `redevSubject` 파생 patch (2026-08-13 축 일원화).
 *
 *   입주권(`right_to_move_in`)      → "right" (조합원입주권 양도 — §166①)
 *   재개발APT(`redevelopment_apt`)  → "apt"   (완공 신축주택 양도 — §166②)
 *
 * 종전에는 재개발 블록 안 ① 「양도 대상」 라디오가 축을 겸해 「APT 자산인데 입주권 양도」
 * 같은 불일치 조합이 저장될 수 있었다. 그 라디오를 없애고 자산 종류가 축을 결정한다.
 * 저장된 불일치 조합은 `calc-wizard-asset-migrate.ts`가 자산 종류를 승격시켜 흡수한다.
 *
 * 재개발 자산이 아니면 빈 patch — 다른 자산 종류의 잔재 값은 건드리지 않는다
 * (자산 종류를 되돌리면 그대로 복귀).
 */
export function redevSubjectPatchForAssetKind(
  assetKind: AssetForm["assetKind"],
): Partial<AssetForm> {
  if (assetKind === "right_to_move_in") {
    return {
      redevSubject: "right",
      /**
       * 세션 내 전환 경로의 stale 정리 (2026-08-23).
       *
       * `calc-wizard-asset-migrate.ts`의 입주권 정규화는 **저장값 재수화 시점**에만 돈다.
       * 다른 자산 종류에서 입주권으로 **지금 바꾸는** 경우에는 그 경로를 거치지 않으므로
       * 여기서 같은 3필드를 비운다. 한쪽만 두면 「새로고침해야 정상화되는」 상태가 된다.
       *
       *  · `isAppraisalAcquisition`·`isSalesCaseAcquisition` — 입주권에는 감정·매매사례 추계
       *    입력 경로가 없다(상단 축 A 제거). 남으면 취득가액이 0으로 전송된다.
       *  · `redevIsSuccessorMember` — 사례 48 **완공APT** 전용 필드. 입주권의 승계 여부는
       *    ① 기본정보 `isSuccessorRightToMoveIn`이 받는다(다른 사실).
       *
       * ⚠️ `useEstimatedAcquisition`은 건드리지 않는다 — ⑤ 카드 실가/환산 라디오의 정본이다.
       */
      isAppraisalAcquisition: false,
      isSalesCaseAcquisition: false,
      redevIsSuccessorMember: "",
      /**
       * `redevPostApprovalExpenses` — ②-a 승계조합원 전용 칸이다(U1-02). `redevIsSuccessorMember`를
       * 비우는 것만으로는 금액이 남아 ⑥ 사이드바 합계에 계속 잡힌다.
       */
      redevPostApprovalExpenses: "",
    };
  }
  if (assetKind === "redevelopment_apt") return { redevSubject: "apt" };
  return {};
}

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
  return !isHousingContribEstimatedBranch(asset);
}

/**
 * 단독주택 출자 §164⑤ PHD 2-point 분기 — 일반 환산 카드 대신 전용 카드
 * (`HousingContribEstimatedSection`)를 쓰는 조합.
 *
 * `shouldShowRedevValuationSection`과 취득가액 모드 라디오(`RedevelopmentBlock` ⑤)가
 * **같은 술어**를 써야 한다. 복제하면 환산을 골랐는데 아무 입력칸도 안 뜨거나
 * 두 카드가 동시에 뜬다.
 */
export function isHousingContribEstimatedBranch(asset: AssetForm): boolean {
  return isHousingContribEstimatedAxes({
    originalAssetType: asset.redevOriginalAssetType,
    // subject 미입력 fallback — 입주권 자산이면 "right"(④ 변환·⑧ validate와 동일 fallback).
    subject: asset.redevSubject || (asset.assetKind === "right_to_move_in" ? "right" : undefined),
    settlementDirection: asset.redevSettlementDirection,
    useEstimatedAcquisition: asset.useEstimatedAcquisition,
  });
}

export function AssetAreaRedevelopment({ asset, onChange }: Props) {
  // 사례 37 토지 출자 분기 — hint의 법령 맥락이 갈린다(§166③ vs 일반 환산)
  const isLand = asset.redevOriginalAssetType === "land";

  return (
    <ToneCard tone="sky" title="면적 정보 (㎡)" noDark>
      <FieldCard
        label="토지 면적 (㎡)"
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
