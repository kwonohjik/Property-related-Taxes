/**
 * 국외주식 이월과세 §97의2① — **폼 술어** (④ API 변환 · ⑤ 위젯 · ⑧ validate 공유 단일 소스)
 *
 * 세 지점이 같은 이 함수를 쓴다 — 한 곳이라도 다른 조건을 쓰면 「화면은 ON인데 body는 미전송」
 * 또는 「숨은 값이 ⑧을 막는」 어긋남이 생긴다(3중 패턴).
 *
 * 🔑 **raw `acquisitionCause`를 읽는다.** 국내의 `effectiveSingleAcquisitionCause`는 `lotsMode==="split"`이면
 *    「매매」로 파생하는데, 국외는 분할 모드가 없다. 국내에서 split을 쓰다 해외로 시장을 바꾸면
 *    `lotsMode:"split"` 잔존값이 남아 effective 함수를 쓰면 화면은 ON인데 body는 미전송이 된다.
 *    (ForeignStockIdentityBlock은 `handleLotsModeToggle`을 부르지 않는다.)
 *
 * 서버 ⑫는 같은 조건을 `isForeignCarryoverDeclared(data.acquisitionCause)`로 쓴다
 * (`foreign-stock-carryover-required.ts` — 시장은 이미 `foreign_stock` 갈래로 정해져 있다).
 */
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { isForeignCarryoverDeclared } from "./foreign-stock-carryover-required";

export function isForeignCarryoverForm(
  form: Pick<StockTransferFormData, "marketType" | "acquisitionCause">,
): boolean {
  return form.marketType === "foreign_stock" && isForeignCarryoverDeclared(form.acquisitionCause);
}
