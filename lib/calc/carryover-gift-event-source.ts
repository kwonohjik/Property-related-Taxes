/**
 * 이월과세 증여 **사건** 서브폼의 출처 — 「당초 증여 때 채무를 인수했다」 토글·등기접수일·산출세액·과세가액이 이 한 벌이다.
 *
 * ④ 전송·⑤ 노출·⑧ 차단이 모두 이 함수로 같은 서브폼을 읽는다(3중 패턴). 무의존 leaf — `carryover-gift-assumed-debt.ts`가 부르고
 * `transfer-tax-api-gb-carryover.ts`·`transfer-tax-api-split-carryover.ts`가 다시 내보낸다(순환 import 방지).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";

/**
 * 일반건물(E2) 사건 출처 — 사건 정보는 한 벌이다. 평소에는 토지 블록(`carryover`)이 정본이고 건물 블록의 같은 칸은 쓰이지 않는다.
 * **건물만** 이월과세면 화면에 토지 블록이 없다 — 사건 정보를 넣을 수 있는 곳은 건물 블록 하나뿐이고 그 편집은 `buildingCarryover`로 간다
 * (`GbBuildingCarryoverCard`·`GeneralBuildingAcquisitionCards` 건물 카드). 토지 쪽만 읽으면 ⑧은 「등기접수일을 입력하세요」로 영구 차단하고 ④는 조용히 미발동한다(2026-09-30 G1).
 *
 * ⚠️ 토지가 이월과세가 아니면 세션 복원(`migrateCarryoverFields`)이 `carryover`를 기본값으로 되돌린다 — 그쪽에 옮겨 쓰는 방식으로는 고칠 수 없다.
 */
export function gbCarryoverEventSource(
  asset: Pick<AssetForm, "acquisitionCause" | "carryover" | "buildingCarryover">,
): CarryoverTaxationForm | undefined {
  if (asset.acquisitionCause === "carryover_gift") return asset.carryover;
  return asset.buildingCarryover ?? asset.carryover;
}

/**
 * 주택 분리 파트(E3 C·A·B) 사건 출처 — 호스트 「이월과세(증여)」(C·B)는 `carryover`, 그 밖(P3 A — 건물 매매·신축 + 토지 이월과세)은 `landCarryover`다.
 * 파트 서브폼도 같은 서브폼이 받는다(UI 설계 §2.1 Q-2).
 */
export function splitCarryoverEventSource(
  asset: Pick<AssetForm, "carryover" | "landCarryover" | "acquisitionCause">,
): CarryoverTaxationForm | undefined {
  return asset.acquisitionCause === "carryover_gift" ? asset.carryover : asset.landCarryover;
}
