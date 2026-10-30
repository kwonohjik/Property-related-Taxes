/**
 * 재개발·재건축(시행령 §166) **원조합원** 자산 × 이월과세(비부담부증여) — 종전 부동산 취득가액을 「확인할 수 있는가」를 **이월과세 ② 한 곳**에서 묻는다.
 * 계획서 `docs/02-design/features/redev-carryover-estimation-toggle-sync.plan.md`(사용자 결정 Q-1 a · Q-2 a).
 *
 * 이월과세 A의 취득가액은 증여자 취득 당시 금액이다(「소득세법」 제97조의2 제1항 제1호). 그것을 확인할 수 있으면 증여자 취득가액(이월과세 ②)이,
 * 확인할 수 없으면 「소득세법 시행령」 제166조 제3항 환산(⑤의 §166③ 칸)이 인가 전 분 취득가액이다. 종전에는 ② 「환산취득가 사용」과
 * ⑤ 실가/환산 라디오가 서로를 몰라 ② 환산 + ⑤ 실가는 칸 없는 400, ② 실가 + ⑤ 환산은 입력한 증여자 취득가액을 버리고 §166③으로 계산했다.
 *
 * ④(주 자산·컴패니언·다건)·⑧·⑤ 화면이 자산을 읽기 전에 `normalizeRedevCarryoverAcqMode`를 통과시킨다 — 자산의 `useEstimatedAcquisition`을
 * 직접 읽는 하위 코드(주택 출자 분기 판정·환산 섹션 게이트·④ payload)가 모두 ② 토글 값을 보게 된다. 저장값은 바꾸지 않는다(읽는 쪽 정규화).
 */
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

/** 범위 판정에 필요한 필드 — 저장된 input_data에도 쓰이도록 선택형 `unknown`이다(`redev-pre-approval-acq-mode.ts`와 같은 규약). */
export interface RedevCarryoverScopeFields {
  assetKind?: unknown;
  acquisitionCause?: unknown;
  transferType?: unknown;
  redevIsSuccessorMember?: unknown;
  isSuccessorRightToMoveIn?: unknown;
}

/** 원조합원 재개발 자산(완공 아파트 · 입주권) × 취득원인 이월과세 × 부담부증여 아님. 부담부증여는 산정방식을 부담부증여 블록이 정한다. */
export function isRedevCarryoverDonorBasis(asset: RedevCarryoverScopeFields): boolean {
  return (
    (asset.assetKind === "redevelopment_apt" || asset.assetKind === "right_to_move_in") &&
    asset.acquisitionCause === "carryover_gift" &&
    asset.transferType !== "burdened_gift" &&
    asset.redevIsSuccessorMember !== "yes" &&
    asset.isSuccessorRightToMoveIn !== true
  );
}

/**
 * 인가 전 분 종전 부동산의 「취득당시」 기준일 — 범위 안이면 당초 증여자 취득일, 아니면 자산 취득일.
 * 이월과세 A의 취득가액은 증여자가 「취득할 당시」의 금액이라(「소득세법」 제97조의2 제1항 제1호) 「소득세법 시행령」 제164조 제7항
 * (공시되기 전에 취득한 주택) 판정과 「취득당시」 칸 조회도 그 날짜를 쓴다 — 엔진(`transfer-tax-carryover.ts` A의 `acquisitionDate`)·⑫와 같다.
 * 계획서 `docs/02-design/features/redev-carryover-phd-donor-date.plan.md`(Q-1 a · Q-2 a).
 */
export function redevPreApprovalAcquisitionDate(
  asset: RedevCarryoverScopeFields & { acquisitionDate?: unknown; carryover?: { donorAcquisitionDate?: unknown } | null },
): string | undefined {
  const d = isRedevCarryoverDonorBasis(asset) ? asset.carryover?.donorAcquisitionDate : asset.acquisitionDate;
  return typeof d === "string" && d ? d : undefined;
}

/**
 * 범위 안이면 ⑤ 라디오 값(`useEstimatedAcquisition`)을 이월과세 ② 토글 값으로 바꾸고, 이월과세에서 쓰이지 않는 ⑤ 실거래가를 비운 사본.
 * A의 취득가액은 증여자 취득가액(엔진 `donorAcquisitionPrice`), B는 증여 당시 평가액이라 ⑤ 실거래가는 세액에 쓰이지 않는다(계획서 §1.5).
 */
export function normalizeRedevCarryoverAcqMode<T extends RedevCarryoverScopeFields & Pick<AssetForm, "useEstimatedAcquisition" | "redevActualAcquisitionPrice" | "carryover">>(asset: T): T {
  if (!isRedevCarryoverDonorBasis(asset)) return asset;
  return { ...asset, useEstimatedAcquisition: asset.carryover?.useEstimatedAcquisition === true, redevActualAcquisitionPrice: "" };
}

/** 폼 전체 — ④·⑧ 진입부. 바뀐 자산이 없으면 같은 객체를 돌려준다. */
export function withRedevCarryoverAcqMode(form: TransferFormData): TransferFormData {
  const assets = form.assets?.map(normalizeRedevCarryoverAcqMode);
  return assets && assets.some((a, i) => a !== form.assets[i]) ? { ...form, assets } : form;
}
