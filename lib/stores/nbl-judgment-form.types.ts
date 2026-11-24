/**
 * 비사업용 토지 **판정 메뉴** 폼 타입 (계획서 `docs/01-plan/features/nbl-judgment-menu.ui.plan.md` §3)
 *
 * ## 새 타입을 만들지 않는다 — `TransferFormData` 그대로
 *
 * 재사용하는 NBL 위젯·④ 변환(`buildNonBusinessLandRaw`)·⑧ 검증(`validateNblDetailedJudgment`)이 전부 `AssetForm`에 묶여 있다.
 * 새 모양을 만들면 어댑터가 필요하고 그 어댑터가 dual truth다(한 칸을 빠뜨리는 순간 「메뉴와 계산기가 다른 답」).
 * 토지 1건은 `assets[0]` — `assetKind:"land"` · `isNonBusinessLand:true` · `nblUseDetailedJudgment:true`가 **항상** 선다(아래 `forceNblFacts`).
 *
 * 이 메뉴는 신규 폼 필드가 없다 — 기존 `AssetForm` 키만 쓴다(14지점 ①은 별칭 1개).
 */
import type { AssetForm } from "./calc-wizard-asset";
import type { TransferFormData } from "./calc-wizard-form.types";
import { createDefaultTransferFormData } from "./calc-wizard-store";
import { migrateAsset } from "./calc-wizard-asset-migrate";

export type NblJudgmentFormData = TransferFormData;

/**
 * 판정 메뉴의 자산은 항상 「토지 · 정밀 판정」이다.
 *
 * 🔴 세 곳이 모두 이 함수를 거친다(initial · normalize · store `updateAsset`) — 접기·토글·복원 어느 경로로도 정밀 판정이 꺼지지 않는다.
 *    (계산기 컨테이너의 「접기」는 `nblUseDetailedJudgment:false`를 쓴다 — 메뉴는 `part`를 지정해 그 버튼을 숨긴다.)
 */
export function forceNblFacts(asset: AssetForm): AssetForm {
  return { ...asset, assetKind: "land", isNonBusinessLand: true, nblUseDetailedJudgment: true };
}

/** ② initial — 기본 폼이 이미 자산 1건을 갖는다. */
export function createInitialNblJudgmentForm(): NblJudgmentFormData {
  const base = createDefaultTransferFormData();
  return { ...base, assets: [forceNblFacts(base.assets[0])] };
}

/**
 * ③ normalize — 외부에서 온 폼(세션 리하이드레이션 · **이력 재개**)을 초기값 위에 덮는다.
 *
 * 🔑 구 스키마 **판별을 하지 않는다** — 계산기 store가 키 화이트리스트로 판별했다가 「F5마다 자산 전부 소실」된 전례가 있다
 *    (`one-house-judgment-form.types.ts`). 덮어쓰기만 하면 오분류가 성립하지 않는다.
 * 🔑 자산은 **1건으로 자른다** — 이력·세션에 2건이 들어와도 첫 건만 쓴다(판정 메뉴는 단독 1필지).
 * 🔑 자산-수준 기본값은 계산기의 `migrateAsset`이 정본이다(그 leaf를 빠뜨려 결함을 낸 전례).
 */
export function normalizeNblJudgmentForm(raw: Record<string, unknown> | null | undefined): NblJudgmentFormData {
  const base = createInitialNblJudgmentForm();
  if (!raw || typeof raw !== "object") return base;
  const merged = { ...base, ...(raw as Partial<NblJudgmentFormData>) };
  const first = Array.isArray(merged.assets) && merged.assets.length > 0 ? merged.assets[0] : undefined;
  return { ...merged, assets: [forceNblFacts(first ? migrateAsset(first) : base.assets[0])] };
}
