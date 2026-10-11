/**
 * 세대 보유 주택 목록 입력 경로 유무 — §155④⑤ 합가 전 구성 「모름」 처리의 예외 판정 (1h-G1-12 · 결정 #27).
 *
 * 증여세 마법사의 부담부증여 양도세 섹션에는 세대 보유 주택 목록 입력 칸이 없다. 고칠 수 없는 항목으로 불이익을
 * 주지 않으려고(2026-10-05 Q-10) 그 화면만 합가 전 구성 「모름」을 불성립으로 보지 않는다.
 *
 * 종전에는 양도 형태(`transferType === "burdened_gift"`)로 그 화면을 짐작했는데, 목록 입력 칸이 있는 양도세 계산기
 * (부담부증여 모드)도 같은 양도 형태라 예외가 계산기까지 번졌다. 이제는 화면이 직접 싣는 표식
 * (`burdenedGiftInfo.houseRosterInputUnavailable`)을 본다 — 표식이 빠지면 「불성립 + 확인 필요」 쪽으로만 실패한다.
 *
 * 비과세 판정(`transfer-tax.ts`)과 중과 배제(`transfer-tax-judgment-steps.ts`)가 **이 한 술어**를 공유한다 —
 * 두 판정의 결론이 엇갈리지 않게 한다.
 */
import type { TransferTaxInput } from "../types/transfer.types";

export function hasNoMergeRosterInputPath(
  input: Pick<TransferTaxInput, "transferType" | "burdenedGiftInfo">,
): boolean {
  return input.transferType === "burdened_gift" && input.burdenedGiftInfo?.houseRosterInputUnavailable === true;
}
