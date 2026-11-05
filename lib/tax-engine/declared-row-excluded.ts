/**
 * NH-12 — 특례 주택(§155⑥⑦⑧) 선언이 가리키는 명부 행이 **이미 주택 수에서 빠진 행**인가.
 *
 * 한 주택은 한 번만 반영한다 — 조특법 §99의4 등(소유주택이 아닌 것으로 봄)이나 소득세법 시행령 §155②③ 상속주택 제외로 이미 뺀 행을
 * 다시 §155⑥⑦⑧의 「각각 1개씩」 상대방으로 쓰면 그 한 채가 주택 수와 특례 양쪽에서 두 번 쓰인다. `houseId`가 없는 선언(직접 API·레거시
 * 기록)은 어느 행인지 몰라 대조하지 않는다.
 *
 * 비과세 술어(`transfer-tax-exemption-holding.ts`)와 §89② 예외(`transfer-tax-89-2-exclusion.ts`)가 **같은 이 leaf**를 쓴다.
 */
import type { TransferTaxInput } from "./types/transfer.types";

export function declaredRowAlreadyExcluded(
  input: Pick<TransferTaxInput, "knownHouseExclusionHouseIds">,
  houseId: string | undefined,
): boolean {
  return houseId !== undefined && (input.knownHouseExclusionHouseIds ?? []).includes(houseId);
}
