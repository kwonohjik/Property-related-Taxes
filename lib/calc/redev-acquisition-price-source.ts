/**
 * 재개발·재건축(시행령 §166) 자산의 **실가 모드 취득가액이 어느 칸에서 오는가** — 주 자산 ④와 컴패니언 ④의 단일 leaf.
 *
 * 원조합원(입주권·비승계 완공APT)은 상단 「취득가액」 칸이 화면에 없다(`CompanionAcqPurchaseBlock` 게이트) —
 * 취득가액은 §166 섹션의 「종전 부동산 취득가액」(`redevActualAcquisitionPrice`)이 정한다.
 * 숨은 `fixedAcquisitionPrice`를 읽으면 비어 있을 때 ⑩이 400, 옛 값이 남아 있으면 엔진이 그 값을 취득가액으로 쓴다.
 * 승계조합원 완공APT만 상단 칸(`fixedAcquisitionPrice`)이 유일한 입력 경로다(E2-01).
 *
 * 주 자산(`transfer-tax-api.ts`)과 컴패니언(`transfer-tax-api-companion-payload.ts` `fixedAcquisitionPriceRaw`)이
 * 각자 이 규칙을 다시 쓰면 한쪽만 빠뜨려도 조용히 어긋난다 — 두 곳이 이 파일만 쓴다.
 */

import { parseAmount } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { isSuccessorRightTransfer } from "./transfer-successor-right";

/**
 * §166 서브객체(`redevelopment`)를 만드는 자산인가 — 완공APT 또는 **원조합원** 입주권.
 * 승계조합원 입주권은 §166① 요건 밖이라 제외한다(§97①1호 가목 일반 경로).
 */
export function isRedevelopmentSec166Asset(
  asset: Pick<AssetForm, "assetKind" | "isSuccessorRightToMoveIn">,
): boolean {
  return (
    !isSuccessorRightTransfer(asset) &&
    (asset.assetKind === "redevelopment_apt" || asset.assetKind === "right_to_move_in")
  );
}

/**
 * §166 자산의 실가 모드 취득가액(100% 기준 · 지분 스케일 전).
 *  · 승계조합원 완공APT(사례 48) — 자산 카드 `fixedAcquisitionPrice`
 *  · 그 밖(사례 45/46 원조합원) — §166 섹션 `redevActualAcquisitionPrice`
 */
export function redevActualAcquisitionPriceRaw(
  asset: Pick<AssetForm, "redevIsSuccessorMember" | "fixedAcquisitionPrice" | "redevActualAcquisitionPrice">,
): number {
  return asset.redevIsSuccessorMember === "yes"
    ? parseAmount(asset.fixedAcquisitionPrice)
    : parseAmount(asset.redevActualAcquisitionPrice);
}
