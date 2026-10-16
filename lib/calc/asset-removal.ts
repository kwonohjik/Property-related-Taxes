/**
 * 자산 삭제 패치 — 순수 헬퍼. 계획서 `docs/00-pm/first-asset-removal-primary-reindex.plan.md` §4-2.
 *
 * 삭제는 배열에서 빼는 것만으로 끝나지 않는다. 위치(첫 자산 여부)에 묶인 값이 있어 순서와 함께 다시 맞춘다
 * (교환 `reverse-appurtenant-swap.ts`의 T1·T2와 같은 규칙):
 *  - T1 `isPrimaryForHouseholdFlags` — 첫 자산만 true(index에서 파생되지 않는 저장 필드).
 *  - T2 미등기 — 주 자산은 **폼 전역** `form.isUnregistered`, 컴패니언은 **자산** `asset.isUnregistered`에 산다.
 *    첫 자산을 지우면 지운 자산의 폼 전역 값이 새 첫 자산에 붙는다(실측: 토지 3건 29,408,500 → 81,966,500).
 *  - 기본 라벨(`자산 N`)만 새 위치로 재번호 — 카드 제목은 index로 그리므로 라벨과 갈린다. 사용자가 고친 라벨은 그대로.
 */
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

type RemovalForm = Pick<TransferFormData, "assets" | "isUnregistered">;

/** 삭제가 폼에 쓰는 두 키 — 한 번의 `onChange`로 같이 쓴다. */
export interface AssetRemovalPatch {
  assets: AssetForm[];
  isUnregistered: boolean;
}

const DEFAULT_LABEL = /^자산 \d+$/;

export function assetRemovalPatch(form: RemovalForm, idx: number): AssetRemovalPatch {
  const rest = form.assets.filter((_, i) => i !== idx);
  // T2 — 첫 자산을 지우면 새 첫 자산(승격)의 자산 값이 폼 전역 값이 된다. 지운 자산의 폼 전역 값은 버린다.
  const isUnregistered = idx === 0 ? rest[0]?.isUnregistered === true : form.isUnregistered === true;
  const assets = rest.map((a, i): AssetForm => {
    const next: AssetForm = { ...a, isPrimaryForHouseholdFlags: i === 0 };
    if (idx === 0 && i === 0) next.isUnregistered = false;
    if (DEFAULT_LABEL.test(a.assetLabel)) next.assetLabel = `자산 ${i + 1}`;
    return next;
  });
  return { assets, isUnregistered };
}
