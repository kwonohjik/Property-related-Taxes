/**
 * cross-102-2-apply.ts — **크로스 §102② 통산 결과를 두 엔진 주입 인자로** (PR-4 축 3)
 *
 * 계획서: `docs/00-pm/cross-engine-102-2-loss-offset.plan.md` **§5.2**
 *
 * ## 왜 「계산」과 「주입」이 갈려 있나
 *
 * PR-3(`cross-102-2-loss-offset.ts`)이 **통산 자체**를 끝냈다. 그런데 크로스 §104⑤ API가 받는
 * 것은 **과세표준과 산출세액**이라(`cross-104-5-api.ts:13~17`), 통산이 양도소득금액을 바꿔도
 * 세액은 한 원도 안 바뀐다 — 과세표준은 기본공제 배분(§103②)을, 산출세액은 세율표를 거쳐야
 * 나오기 때문이다. 그 둘을 크로스 레이어가 직접 계산하면 **엔진의 절반을 다시 짜는 것**이고
 * dual truth가 된다.
 *
 * ⇒ 이 파일은 통산 결과를 **엔진이 먹을 수 있는 모양**으로만 바꾼다. 계산은 엔진이 다시 한다.
 *
 * ## 주입 형태가 엔진마다 다른 이유
 *
 * - **부동산**은 자산이 여럿이라 §167의2①의 1호·2호 배분을 **엔진이 직접** 해야
 *   `lossOffsetFromSame`/`FromOther`가 정합하다. 그 둘은 표시용이 아니라 **감면 안분의 입력**
 *   이다(`transfer-tax-aggregate.ts:221`). ⇒ **외부 행**을 통째로 넘긴다.
 * - **기타자산**은 크로스 경로가 단건이라 배분할 것이 없다. ⇒ **통산 후 income** 한 숫자.
 *
 * 🔑 두 경로가 같은 답인 근거는 **같은 배열·같은 순서**다 — 여기서도 엔진에서도
 *   `[부동산…, 기타자산]` 순으로 코어를 돌린다. 코어는 결정적이라 결과가 일치한다.
 *   ⚠️ 순서가 어긋나면 floor 잔액 흡수가 갈려 1원이 틀어진다(anchor W-7이 고정).
 */
import {
  buildCrossLossRows,
  computeCrossLossOffset,
  type CrossLossOutcome,
} from "./cross-102-2-loss-offset";
import type { CrossLossExternalAsset } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

export interface CrossLossInjection {
  /** 부동산 다자산 엔진의 `crossLossOffsetExternal`로 그대로 들어간다 */
  realEstateExternalRows: CrossLossExternalAsset[];
  /** 기타자산 단건 엔진의 `crossLossOffsetIncome`으로 그대로 들어간다 */
  otherAssetIncome: number;
  /** 화면 표시용 — 어느 자산이 얼마를 흡수했는가 */
  outcome: CrossLossOutcome;
}

export type CrossInjectionResult =
  | { ok: true; injection: CrossLossInjection }
  | { ok: false; reason: string };

/**
 * 두 엔진의 **1패스** 결과 → 주입 인자.
 *
 * 🔒 `buildCrossLossRows`의 **건너뛰기 계약을 그대로 승계**한다 — 자산별 내역이 없거나
 *   주식 그룹(§102①2호)이면 `ok: false`이고, 호출자는 통산 없이 현행 경로로 간다.
 */
export function buildCrossInjection(
  realEstate: Pick<AggregateTransferResult, "properties"> | null | undefined,
  otherAsset: StockTransferResult | null | undefined,
): CrossInjectionResult {
  const rows = buildCrossLossRows(realEstate, otherAsset);
  if (!rows.ok) return { ok: false, reason: rows.reason };

  const outcome = computeCrossLossOffset(rows.rows);

  const oaRow = rows.rows.find((r) => r.source === "other_asset");
  const oaOut = outcome.assets.find((a) => a.source === "other_asset");
  if (!oaRow || !oaOut) {
    // `buildCrossLossRows`는 기타자산 행을 반드시 하나 넣는다 — 여기 오면 계약이 깨진 것이다.
    return { ok: false, reason: "기타자산 행을 찾지 못해 크로스 통산을 건너뜁니다." };
  }

  return {
    ok: true,
    injection: {
      realEstateExternalRows: [
        // 🔑 **통산 «전»** 값을 넘긴다 — 엔진이 자기 자산과 함께 처음부터 다시 배분한다.
        { id: oaRow.id, income: oaRow.income, rateKey: oaRow.rateKey, exempt: oaRow.exempt },
      ],
      otherAssetIncome: oaOut.incomeAfterOffset,
      outcome,
    },
  };
}
