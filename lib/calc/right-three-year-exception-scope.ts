/**
 * 「§89② 3년 초과 예외 선언 카드가 **화면에 있는가**」 — ⑤ 렌더 · ⑧ 검증 공용 술어.
 *
 * ## 왜 필요한가 — 카드는 스스로 사라지는데 ⑧은 선택을 무게이트로 검증했다 (2026-09-07)
 *
 * ⑤ `RightThreeYearExceptionSection`은 **두 조건**에서만 뜬다:
 *   1. 주 자산이 §154① 비과세 판정 대상(`isOneHouseExemptionAsset` — 주택·재개발APT).
 *      카드가 그 섹션(`Step4.tsx:523`) 안에 있다.
 *   2. 세대 보유 권리 중 **취득일부터 3년을 넘겨** 양도한 것이 하나라도 있다
 *      (엔진 술어 `isRightThreeYearExceeded` 공용).
 *
 * 반면 ⑧(`transfer-tax-validate.ts`)은 `rightThreeYearExceptionKind`만 보고 필수값을
 * 요구했다. 그래서 「신축주택이 완성된 뒤 양도했다」나 「경매·공매」를 고른 **뒤**
 *
 *   · 양도일을 3년 **이내**로 고치거나
 *   · 세대 보유 권리 행을 지우거나
 *   · 자산 종류를 주택 → 토지 등으로 바꾸면
 *
 * 카드는 사라진 채 `rightThreeYearExceptionKind`만 남아 「신축주택 완성일을 입력하세요」로
 * 계산이 **영구 차단**됐다 — 그 값을 채우거나 선택을 해제할 컨트롤이 화면 어디에도 없어
 * 세션 초기화 외에 탈출 수단이 없었다.
 *
 * ## ④는 건드리지 않았다 — 소비 조건이 이미 좁다
 *
 * ④ `buildRightThreeYearExceptionPayload`는 무게이트지만, 엔진은 이 선언을 **§89② 배제
 * 경로 안에서만** 읽는다(`transfer-tax-89-2-exclusion.ts:363`) — 권리가 없으면 그 경로에
 * 진입하지 않고, 3년 이내면 그 앞의 `withinDeadline`에서 이미 `exception_met`으로 빠진다.
 * 즉 카드가 사라지는 세 경로 모두 payload가 **소비되지 않는다**.
 */
import { isOneHouseExemptionAsset } from "@/lib/calc/housing-like-asset";
import { isRightThreeYearExceeded } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/**
 * ⑤ §89② 3년 초과 예외 카드의 노출 조건.
 *
 * ⚠️ 취득일이 빈 권리 행은 「입력 중」이라 판정 대상이 아니다(종전 ⑤ 동작 그대로).
 */
export function rightThreeYearExceptionVisible(form: TransferFormData): boolean {
  if (!isOneHouseExemptionAsset(form.assets?.[0]?.assetKind)) return false;
  if (!form.transferDate) return false;
  const transferDate = new Date(form.transferDate);
  return (form.presaleRights ?? []).some(
    (r) =>
      r.acquisitionDate &&
      isRightThreeYearExceeded({
        rightAcquisitionDate: new Date(r.acquisitionDate),
        transferDate,
      }),
  );
}
