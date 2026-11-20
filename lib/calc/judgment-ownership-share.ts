/**
 * 판정 메뉴 「공동명의(지분)」 — 결정 Q-24(2026-11 리뷰 D-48 · PR-20b).
 *
 * 판정 메뉴는 양도 자산 1건 구조라(#65) 지분은 「나머지 지분은 다른 사람 소유」인 공동명의만 받는다 — 같은 물건을 여러 번 나눠 취득한 경우는
 * 계산기(지분 분할)에서만 다룬다. 그래서 토글을 켜는 것 자체가 계산기의 「나머지 지분은 타인 소유」 선언(`ownershipRemainderThirdParty`)이다.
 *
 * - 판정: 「예상 양도가액」은 주택 전체 가액이라(§156① — 타인 소유부분 포함) 지분은 비과세·고가주택 판정을 바꾸지 않는다. ④ 판정 본문은 그대로다.
 * - 핸드오프: 계산기로 자산을 통째로 넘기므로(`toTransferFormPatch` — S11-7) 지분·선언이 함께 넘어가 계산기가 전체 가액에 지분율을 적용한다
 *   (종전에는 늘 100%로 넘어가 공유자도 주택 전체 세액이 나왔다).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isFractionalRatioStr } from "@/lib/calc/transfer-tax-api-helpers";
import { ownershipRatioError } from "@/lib/calc/transfer-tax-api-asset-basics";

type ShareFields = Pick<AssetForm, "ownershipNumerator" | "ownershipDenominator" | "ownershipRemainderThirdParty">;

/** 공동명의로 선언했는가 — 토글 상태(계산기 「나머지 지분은 타인 소유」 선언과 같은 칸). */
export function judgmentOwnershipShareOn(asset: Partial<ShareFields> | undefined): boolean {
  return asset?.ownershipRemainderThirdParty === "yes";
}

/** 토글 patch — 끄면 100%·선언 해제(stale 지분이 핸드오프로 새지 않게), 켜면 지분율을 새로 받는다. */
export function judgmentOwnershipSharePatch(on: boolean): ShareFields {
  return on
    ? { ownershipRemainderThirdParty: "yes", ownershipNumerator: "", ownershipDenominator: "100" }
    : { ownershipRemainderThirdParty: "", ownershipNumerator: "100", ownershipDenominator: "100" };
}

/** ⑧ — 공동명의면 100% 미만 지분율이 필요하다(계산기 ⑧과 같은 형식 규칙 `ownershipRatioError`). */
export function judgmentOwnershipShareError(asset: Partial<ShareFields> | undefined): string | null {
  if (!judgmentOwnershipShareOn(asset)) return null;
  const n = asset?.ownershipNumerator ?? "";
  const d = asset?.ownershipDenominator ?? "100";
  if (n.trim() === "") return "공동명의 주택의 본인 지분율(%)을 입력하세요.";
  const format = ownershipRatioError(n, d);
  if (format) return format;
  if (!isFractionalRatioStr(n, d)) return "공동명의 지분율은 100% 미만으로 입력하세요 — 혼자 소유하면 공동명의를 끄세요.";
  return null;
}
