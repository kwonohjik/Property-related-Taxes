/**
 * G1 — 사례 28 역방향(첫 자산 주택부수토지 · 주택은 함께 양도) 「주택을 첫 자산으로 바꾸기」 순수 헬퍼.
 *
 * ⑧(`transfer-tax-validate-asset.ts`)이 이 구성을 막고 「주택을 첫 자산으로 입력하세요」라고 안내하는데, 순서를 바꾸는 방법이 «삭제 후 재입력»뿐이라
 * 입력이 사라졌다. 이 모듈은 **버튼 한 번으로 «주택을 맨 앞으로, 나머지는 입력 순서 그대로»** 폼 패치를 만든다(회전 — 단순 교환은 토지 2건 이상에서 순서가 뒤집혀
 * 반올림 잔액 흡수·한도 선점 순서가 달라진다). 값은 지우지 않는다.
 *
 * 순서와 함께 움직여야 하는 값은 둘이다(계획서 §3):
 *  - T1 `isPrimaryForHouseholdFlags` — index에서 파생되지 않는 독립 저장 필드(첫 자산만 true).
 *  - T2 미등기 — 주 자산은 **폼 전역** `form.isUnregistered`, 컴패니언은 **자산** `asset.isUnregistered`에 산다. 순서만 바꾸면 토지의 폼 전역 미등기가 주택에 붙는다.
 *
 * 짝 주택 판정은 ⑧·route와 같은 leaf(`reverseAppurtenantHouseAssetId`)를 쓴다 — 입력 객체는 바꾸지 않는다.
 */
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { reverseAppurtenantHouseAssetId } from "@/lib/calc/reverse-appurtenant-house";
import { selfBuiltActive } from "@/lib/calc/self-built-scope";

type SwapForm = Pick<TransferFormData, "assets" | "isUnregistered">;

/** 교환이 폼에 쓰는 두 키 — 한 번의 `onChange`로 같이 쓴다. */
export interface ReverseAppurtenantSwapPatch {
  assets: AssetForm[];
  isUnregistered: boolean;
}

/** 기본 라벨(`makeDefaultAsset`의 `자산 N`)만 재번호한다 — 사용자가 고친 라벨은 건드리지 않는다. */
const DEFAULT_LABEL = /^자산 \d+$/;

/**
 * 첫 자산 토지에 있으면 교환이 **침묵 소실·강등** 또는 다른 ⑧ 차단을 만드는 «첫 자산 전용» 입력 — 컴패니언 위치에서는
 * ④가 보내지 않거나(정밀판정·가업상속) ⑧이 막는다(다필지·매매사례가액). 실측: 계획서 §4-4 · `g1-reverse-appurtenant-swap.anchor.test.ts`.
 */
const FIRST_ASSET_ONLY_INPUTS: readonly { label: string; active: (a: AssetForm) => boolean }[] = [
  { label: "비사업용 토지 정밀판정", active: (a) => a.nblUseDetailedJudgment === true },
  { label: "다필지(환지·합병)", active: (a) => a.parcelMode === true },
  { label: "매매사례가액 추계", active: (a) => a.isSalesCaseAcquisition === true },
  { label: "가업상속 취득가액", active: (a) => !!a.familyBusinessInheritance },
];

function firstAssetOnlyLabels(first: AssetForm): string[] {
  return FIRST_ASSET_ONLY_INPUTS.filter((i) => i.active(first)).map((i) => i.label);
}

/** 교환 대상 짝 주택의 index. 짝 주택이 없거나 증환지 증가분이 있으면 -1 — 사유 문구 없이 버튼만 숨긴다(현행 ⑧·엔진 경고가 그대로 안내). */
function pairedHouseIndex(form: SwapForm): number {
  const houseId = reverseAppurtenantHouseAssetId(form.assets);
  if (houseId === undefined) return -1;
  // 증가분의 양도시 기준시가가 `assets[0]`(당초분)에서 파생된다(`replot-increment-std-price.ts`) — 주택이 0번이 되면 깨진다.
  if (form.assets.some((a) => a.isReplotIncrement)) return -1;
  return form.assets.findIndex((a) => a.assetId === houseId);
}

/**
 * 교환 패치. 가드가 하나라도 걸리면 `null`(버튼을 보이지 않는다).
 * - 짝 주택이 없다(주택 2건 이상·겸용·재개발 완공·토지 성격 미선택·지분 분할 묶음 …) · 증환지 증가분이 있다 · 첫 자산 토지에 «첫 자산 전용» 입력이 있다.
 */
export function reverseAppurtenantSwapPatch(form: SwapForm): ReverseAppurtenantSwapPatch | null {
  const houseIdx = pairedHouseIndex(form);
  if (houseIdx < 0) return null;
  const [oldFirst] = form.assets;
  if (firstAssetOnlyLabels(oldFirst).length > 0) return null;

  const house = form.assets[houseIdx];
  // 회전 — 주택을 맨 앞으로, 나머지는 상대 순서 그대로.
  const rotated = [house, ...form.assets.filter((_, i) => i !== houseIdx)];
  const assets = rotated.map((a, i): AssetForm => {
    const next: AssetForm = { ...a };
    // T1 — 새 첫 자산만 주 자산 배지.
    next.isPrimaryForHouseholdFlags = i === 0;
    // T2 — 미등기: 승격 주택은 자산 값을 폼 전역으로 올리고(자산 값은 false), 강등 토지는 옛 폼 전역 값을 자산으로 내린다.
    if (a === house) next.isUnregistered = false;
    if (a === oldFirst) next.isUnregistered = form.isUnregistered === true;
    // 미편집 기본 라벨만 새 위치로 재번호.
    if (DEFAULT_LABEL.test(a.assetLabel)) next.assetLabel = `자산 ${i + 1}`;
    return next;
  });
  return { assets, isUnregistered: house.isUnregistered === true };
}

/**
 * 구성은 맞지만 첫 자산 토지의 «첫 자산 전용» 입력 때문에 버튼을 숨길 때 보일 사유 한 줄. 그 밖에는 `null`.
 * 문구는 사실만 적는다 — 이 입력은 주택이 첫 자산이 되면 반영되지 않거나 다른 입력 차단을 만든다.
 */
export function reverseAppurtenantSwapBlockReason(form: SwapForm): string | null {
  if (pairedHouseIndex(form) < 0) return null;
  const labels = firstAssetOnlyLabels(form.assets[0]);
  if (labels.length === 0) return null;
  return `이 토지에 입력한 ${labels.join("·")}은(는) 첫 자산에서만 반영됩니다. 해당 입력을 해제하면 주택을 첫 자산으로 바꿀 수 있습니다.`;
}

/**
 * 승격 주택에 **교환으로 처음 반영되는 입력**(컴패니언일 때 ④가 보내지 않던 값) — 있을 때만 교환 직후 안내 한 줄에 쓴다.
 * 같은 입력은 «주택 먼저»에서는 반영됐으므로 올바른 방향이나, 사용자가 본 세액이 달라질 수 있다.
 */
export function reverseAppurtenantSwapNewlyReflected(form: SwapForm): string[] {
  const houseIdx = pairedHouseIndex(form);
  if (houseIdx < 0) return [];
  const house = form.assets[houseIdx];
  const out: string[] = [];
  if (selfBuiltActive(house)) out.push("신축·증축");
  if (house.rentalHousingException?.applyException === true) out.push("장기임대주택 거주주택 비과세 특례");
  return out;
}
