/**
 * 다주택 중과 **한시 유예 경과조치**(§167의3①12의2 나·다목 · §167의10①12의2 나·다목)
 * 입력이 의미를 갖는 범위 — ⑤ UI · ④ 전송 · ⑧ validate **공용 단일 소스**.
 *
 * ## 왜 뽑았나 (2026-09-05 · 코드리뷰 Q03)
 *
 * 세 게이트가 서로 달랐다:
 *
 * | 층 | 종전 조건 |
 * |---|---|
 * | ⑤ 위젯 노출 | `!hideGracePeriod && isOneHousehold && 주택수≥2 && (houses>0 ‖ 분양권>0)` |
 * | ④ 전송 | `housesPayload && form.gracePeriod` — 즉 `isHousingLike(주자산) && (houses>0 ‖ 분양권>0)` |
 * | ⑧ validate | `!graceHidden && **houses.length > 0** && form.gracePeriod` |
 *
 * 두 갈래로 갈라졌다:
 *
 * 1. **분양권·입주권만 있고 보유 주택이 0건**이면 ⑤는 열리고 ④는 보내는데 ⑧이 **검증하지
 *    않는다** — 매매계약일을 비운 채 계산하면 ⑫ Zod가 `contractDate`를 요구해 **400**이 난다.
 * 2. **한시배제 창 안**(`isMultiHouseSurchargeSuppressed`)에서는 ⑤가 숨고 ⑧이 건너뛰는데
 *    ④에는 그 게이트가 **없다** — 창 밖에서 입력해 둔 값이 남아 있으면 그대로 전송돼
 *    같은 400이 난다.
 *
 * ⇒ 한 술어를 세 층이 공유한다. 조건을 복제하면 같은 방식으로 다시 갈라진다
 *   (memory `feedback_shared_predicate_argument_parity`).
 *
 * ⚠️ 한시배제 창 안에서 이 입력이 **증명 가능한 no-op**이라는 점이 ⑧이 건너뛰던 근거였다 —
 *    `checkGracePeriodExemption`의 가목 우선 게이트가 `gracePeriod` 내용과 무관하게
 *    `suspended: true`를 낸다. 그래서 「창 안 = 범위 밖」은 이 술어에서도 유지한다.
 */

import { isMultiHouseSurchargeSuppressed } from "./transfer-tax-api-helpers";
import { isHousingLike } from "./housing-like-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

export function gracePeriodInScope(
  form: Pick<
    TransferFormData,
    "transferDate" | "assets" | "isOneHousehold" | "householdHousingCount" | "houses" | "presaleRights"
  >,
): boolean {
  const primary = form.assets?.[0];
  if (!primary) return false;
  // ④가 `housesPayload`로 이미 요구하던 조건 — 양도 물건이 주택 계열이 아니면 중과 축 자체가 없다.
  if (!isHousingLike(primary.assetKind)) return false;
  // 한시배제 창 안 = 증명 가능한 no-op (위 ⚠️).
  if (isMultiHouseSurchargeSuppressed(form.transferDate, primary.acquisitionDate)) return false;
  if (!form.isOneHousehold) return false;
  if ((parseInt(form.householdHousingCount || "1", 10) || 0) < 2) return false;
  return (form.houses?.length ?? 0) > 0 || (form.presaleRights?.length ?? 0) > 0;
}
