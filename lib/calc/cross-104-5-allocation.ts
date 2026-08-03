/**
 * §104⑤ 크로스 — **§103② 기본공제 배분 2안 비교** (C-3d-2)
 *
 * 계획서: `docs/00-pm/cross-104-5-c3d-recalc.plan.md` **W-2**
 *
 * ── 왜 2안인가 ─────────────────────────────────────────────────────────
 * 부동산과 기타자산은 **같은 §103②1호 그룹**이라 기본공제 250만원은 **합쳐서 연 1회**다.
 * 그런데 두 마법사가 분리돼 있어 각자 250만원을 쓸 수 있다(R-2).
 *
 * 정본 `allocateBasicDeduction`의 **`MAX_BENEFIT`은 부동산 안에서만** 도는 배분이라
 * (`transfer-tax-aggregate-helpers.ts:329`) **크로스에는 배분기가 없다**. 양쪽 자산을 한 풀에
 * 놓고 정렬하려면 과세표준 산정 단계를 손봐야 하는데 그건 조정 레이어로 불가능하다.
 *
 * ⇒ **실현 가능한 근사**: 한쪽에 **전액 몰아준** 두 경우를 각각 계산해 **세액이 작은 쪽**을 쓴다.
 *   250만원은 작아 한 자산에 다 들어가는 것이 보통이라 이 둘로 대부분 커버된다.
 *   각 엔진 **안에서는** 여전히 `MAX_BENEFIT`이 돌아 그쪽 최적 자산에 배정된다.
 *
 * ⚠️ **부분 배분**(예: 100만/150만)은 후보에 넣지 않는다 — 조합이 폭발하고, 누진 구조상
 *   한쪽에 몰아주는 것이 대체로 유리하다. 화면이 그 한계를 적어야 한다.
 * ⚠️ **완전 최적은 아니다** — 그건 두 엔진을 한 풀로 묶어야 가능하다(구조적 한계).
 */
import { recalcRealEstate, recalcOtherAsset } from "./cross-104-5-recalc";
import { extractRealEstateSide, extractOtherAssetSide } from "./cross-104-5-adapter";
import { callCross1045API, type CrossCalcResponse } from "./cross-104-5-api";
import { BASIC_DEDUCTION_LIMIT } from "./cross-104-5-history";
import type { CalculationRecord } from "@/lib/storage/types";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** 기본공제를 어느 쪽에 전액 몰아줄 것인가 */
export type AllocationSide = "real_estate" | "other_asset";

export interface AllocationCandidate {
  side: AllocationSide;
  realEstate: AggregateTransferResult;
  otherAsset: StockTransferResult;
  cross: CrossCalcResponse;
}

export interface AllocationOutcome {
  /** 채택 — 세액이 가장 작은 후보 */
  best: AllocationCandidate;
  /** 성공한 후보 전부(비교 표시용) */
  candidates: AllocationCandidate[];
  /** 실패한 후보의 사유 — 하나가 실패해도 나머지로 진행한다(계획서 X-6) */
  failures: { side: AllocationSide; reason: string }[];
}

/** 후보별 두 엔진에 주입할 「이미 쓴 기본공제」 */
function usedFor(side: AllocationSide): { realEstate: number; otherAsset: number } {
  // 몰아주는 쪽은 기사용액 0(= 전액 사용 가능), 반대쪽은 한도만큼 쓴 것으로 본다.
  return side === "real_estate"
    ? { realEstate: 0, otherAsset: BASIC_DEDUCTION_LIMIT }
    : { realEstate: BASIC_DEDUCTION_LIMIT, otherAsset: 0 };
}

async function runCandidate(args: {
  side: AllocationSide;
  realEstateRecord: CalculationRecord;
  otherAssetRecord: CalculationRecord;
  taxYear: number;
}): Promise<AllocationCandidate> {
  const { side, realEstateRecord, otherAssetRecord, taxYear } = args;
  const used = usedFor(side);

  // 두 엔진은 서로 독립이라 **병렬**로 부른다(계획서 R-2 — 지연 완화).
  const [realEstate, otherAsset] = await Promise.all([
    recalcRealEstate(realEstateRecord, { annualBasicDeductionUsed: used.realEstate }),
    recalcOtherAsset(otherAssetRecord, { realEstateGroupBasicDeductionUsed: used.otherAsset }),
  ]);

  const reSide = extractRealEstateSide(realEstate as unknown as Record<string, unknown>);
  const oaSide = extractOtherAssetSide(otherAsset as unknown as Record<string, unknown>);
  if (!reSide.ok) throw new Error(reSide.reason);
  if (!oaSide.ok) throw new Error(oaSide.reason);

  const cross = await callCross1045API({
    taxYear,
    realEstate: reSide.side,
    otherAsset: oaSide.side,
  });

  return { side, realEstate, otherAsset, cross };
}

/**
 * 두 배분안을 계산해 **세액이 작은 쪽**을 고른다.
 *
 * - 후보는 **병렬**로 돈다. 라우트별 호출은 각 2회라 rate limit에 여유가 있다(계획서 X-4).
 * - 한쪽이 실패해도 **나머지를 채택**하고 사유를 `failures`에 남긴다(X-6).
 * - 둘 다 실패하면 **throw** — 호출자가 현행(감지·경고)으로 돌아간다.
 *
 * ⚠️ **감면 판정은 하지 않는다.** 재계산으로 `reductionAmount`가 드러날 수 있으므로(X-3)
 *   호출자가 `best.realEstate.reductionAmount`를 보고 크로스 제공 여부를 다시 정한다.
 */
export async function pickBestAllocation(args: {
  realEstateRecord: CalculationRecord;
  otherAssetRecord: CalculationRecord;
  taxYear: number;
}): Promise<AllocationOutcome> {
  const sides: AllocationSide[] = ["real_estate", "other_asset"];
  const settled = await Promise.allSettled(
    sides.map((side) => runCandidate({ ...args, side })),
  );

  const candidates: AllocationCandidate[] = [];
  const failures: AllocationOutcome["failures"] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") candidates.push(r.value);
    else {
      failures.push({
        side: sides[i],
        reason: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  });

  if (candidates.length === 0) {
    throw new Error(
      failures.map((f) => f.reason).join(" / ") || "배분안을 계산하지 못했습니다.",
    );
  }

  // 세액이 작은 쪽 = 납세자에게 유리 (`MAX_BENEFIT`과 같은 방향).
  // 동률이면 먼저 온 후보(부동산 우선) — 결정적 순서를 위해 `<`가 아니라 `<=`를 쓰지 않는다.
  const best = candidates.reduce((a, b) =>
    b.cross.calculatedTax < a.cross.calculatedTax ? b : a,
  );

  return { best, candidates, failures };
}
