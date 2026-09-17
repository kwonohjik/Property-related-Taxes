/**
 * stock-actual-acquisition.ts — **실가 취득가액의 단일 소스** (무의존 leaf)
 *
 * 법 §97①1호 「실지거래가액」을 두 방식으로 받는다:
 *   · `per_share` — 1주당 취득가액 × 양도 주식수
 *   · `total`     — **취득가액 합계를 그대로** (양도측 `transferTotalPrice`와 같은 규약)
 *
 * ## 왜 leaf인가 — 읽는 곳이 셋이다
 *
 * `perShareAcquisitionPrice`를 **실가 경로에서** 읽는 지점은 세 파일이다:
 *   · `stock-acquisition-basis.ts` STEP 3   — 취득가액 본체
 *   · `exempt-informational-acquisition.ts` — 비과세 표시용 echo
 *   · `stock-carryover.ts`                  — §97의2① 증여 당시 평가액 echo
 * 셋 중 하나만 고치면 total 모드에서 **그 자리만 0**이 된다. 그래서 한 곳에 둔다.
 *
 * ## 🔒 `acquisitionMode`를 함께 본다
 *
 * 이 두 필드는 **실가 모드 전용**이다. 사용자가 환산·매매사례로 되돌려도 폼 값은 남으므로
 * (`acquisitionMode`만 바뀐다) 모드 게이트가 없으면 **환산 경로가 조용히 오염**된다.
 * anchor AT-8이 그 자리를 지킨다.
 */
import type { StockTransferInput } from "./types/stock-transfer.types";

/** 실가 + 합계 직접 입력 모드인가 */
export function isActualTotalMode(input: StockTransferInput): boolean {
  return input.acquisitionMode === "actual" && input.acquisitionActualInputMode === "total";
}

/** 실가 취득가액 **총액**. `total` 모드면 입력값 그대로(나눗셈 없음). */
export function actualAcquisitionTotal(input: StockTransferInput): number {
  if (isActualTotalMode(input)) return input.acquisitionTotalPrice ?? 0;
  return (input.perShareAcquisitionPrice ?? 0) * input.shareCount;
}

/**
 * 실가 취득가액의 **1주당 값** — 표시용 echo.
 *
 * ⚠️ **총액이 정본이다.** `total` 모드에서 이 값은 `floor(합계 ÷ 주식수)`라 곱해도 총액으로
 *   돌아오지 않을 수 있다 — 세액 계산에는 `actualAcquisitionTotal`을 쓸 것.
 */
export function actualAcquisitionPerShare(input: StockTransferInput): number {
  if (isActualTotalMode(input)) {
    return input.shareCount > 0 ? Math.floor((input.acquisitionTotalPrice ?? 0) / input.shareCount) : 0;
  }
  return input.perShareAcquisitionPrice ?? 0;
}
