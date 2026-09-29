/**
 * 양도세 감면(reductions[]) — **엔진이 필요로 하는데 Zod가 비워 두게 두던 값**을 ⑧과 같은 조건으로 요구한다
 * (2026-09-30 Zod↔엔진 필수 점검).
 *
 * 비우면 400이 아니라 **200 + 다른 세액**이었다 — 엔진·라우터가 빈 값을 조용히 채운다:
 *   - 전용면적: 라우터 `?? 0`(`income-deduction-router.ts`) → 고가주택(면적 기준) 판정이 켜지지 않는다
 *   - 매매계약일·사용승인일: 엔진이 취득일로 대신 읽는다(`new-99.ts`·`new-99-3.ts`) → 기간 판정이 바뀐다
 *   - 임대 계속 여부: `!== false`로 읽어 「계속 임대」가 된다(`rental-97-3.ts`·`rental-97-5.ts`) → 안분이 빠진다
 * ⑧ `lib/calc/transfer-tax-validate-reductions.ts`는 모두 요구한다. 여기 조건은 그 ⑧의 거울이다.
 * 매매계약일은 ⑧·라우터와 같이 자산-수준 `assetContractDate`로 대신할 수 있다.
 */
import { z } from "zod";

type ReductionLike = { type: string } & Record<string, unknown>;

export function refineReductionRequiredInputs(
  reductions: ReadonlyArray<ReductionLike> | undefined,
  assetContractDate: string | undefined,
  ctx: z.RefinementCtx,
  path: (string | number)[],
) {
  (reductions ?? []).forEach((r, i) => {
    const at = (key: string) => [...path, i, key];
    const issue = (key: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: at(key), message });
    const positive = (v: unknown) => typeof v === "number" && v > 0;

    if (r.type === "new_99_3") {
      // 라우터 기본값이 from_builder다(`income-deduction-router.ts`) — 미지정도 1호로 본다.
      if (r.acquisitionType993 === "self_built") {
        if (!r.usageApprovalDate993) issue("usageApprovalDate993", "§99의3 2호 적용: 사용승인일이 필요합니다.");
      } else if (!r.contractDate993 && !assetContractDate) {
        issue("contractDate993", "§99의3 1호 적용: 매매계약일(contractDate993 또는 assetContractDate)이 필요합니다.");
      }
      if (!positive(r.exclusiveAreaSqm993))
        issue("exclusiveAreaSqm993", "§99의3 적용: 전용면적(㎡)이 필요합니다(고가주택 판정).");
    }

    if (r.type === "new_99") {
      if (r.acquisitionType99 === "self_built") {
        if (!r.usageApprovalDate99) issue("usageApprovalDate99", "§99 적용: 자기건설 주택의 사용승인일이 필요합니다.");
      } else if (!r.contractDate99 && !assetContractDate) {
        // 조특법 §99①2호 — 「신축주택취득기간 중에 … 최초로 매매계약을 체결하고 계약금을 납부한 자」
        issue("contractDate99", "§99 적용: 매매계약일(contractDate99 또는 assetContractDate)이 필요합니다.");
      }
      if (!positive(r.exclusiveAreaSqm99))
        issue("exclusiveAreaSqm99", "§99 적용: 전용면적(㎡)이 필요합니다(고가주택 판정).");
    }

    if ((r.type === "rental_97_3" || r.type === "rental_97_5") && r.rentalContinuesToTransfer === undefined) {
      issue(
        "rentalContinuesToTransfer",
        `임대가 양도일까지 계속되었는지(rentalContinuesToTransfer)가 필요합니다 (조특령 ${r.type === "rental_97_5" ? "§97의5②" : "§97의3⑤"}).`,
      );
    }
  });
}
