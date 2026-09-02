/**
 * anchor: **§9-7 — 일부양도 취득시 기준시가 위젯이 곱하는 면적**
 *
 * ── 무엇이 틀렸었나 ────────────────────────────────────────────────────────
 * ⑤ `CompanionAcqPurchaseBlock`의 **취득시** `StandardPriceInput`이
 * `area={props.acquisitionArea}`(취득 **전체** 면적)를 곱해 총액을 파생했다.
 * **양도시** 칸은 `transferArea`(양도분)를 곱하므로, 일부양도에서 **분자만 부풀었다**.
 *
 * ── 왜 B4-1로 안 고쳐졌나 (계획서 표기가 틀렸다) ────────────────────────────
 * `transfer-partial-area-apportionment.plan.md` §1.1은 「`land` 일괄 (축 A 토지) … ✅ **B4-1 정정**」
 * 이라 기록하지만 **이 경로는 닿지 않았다**:
 *
 *   · B4-1이 고친 것 = 엔진 `acquisitionArea`(`resolveAcqAreaForStdPrice`)
 *   · 그 값을 소비하는 곳 = **split 경로뿐** (`transfer-tax-split-gain.ts:54`
 *     `standardPricePerSqmAtAcquisition × acquisitionArea`)
 *   · 비-split **일괄** 경로의 환산 분자 = **총액** `standardPriceAtAcquisition`
 *     → 그 총액을 만드는 것이 바로 ⑤ 위젯이다
 *
 * ④ body 실측(정정 전): `standardPriceAtAcquisition=200,000,000`(전체 200㎡) ·
 * `standardPriceAtTransfer=300,000,000`(양도분 100㎡) · `acquisitionArea=100`(B4-1 ✅).
 * ⇒ **면적은 고쳐졌는데 총액은 안 고쳐진** 상태였다.
 *
 * ── 근거 ────────────────────────────────────────────────────────────────
 * 「소득세법 시행령」 §176의2②2호의 「취득당시의 기준시가」는 **양도자산의** 것이고,
 * 일부양도에서는 양도한 부분이 그 자산이다(조심 2018부0572 — 「**각 필지의** 취득 당시 기준시가」).
 * ④가 이미 같은 논거로 `acquisitionArea`를 양도분으로 해결한다.
 *
 * ⇒ 두 층이 **같은 술어**(`usesTransferAreaForAcqStdPrice`)를 공유하게 했다.
 */
import { describe, it, expect } from "vitest";
import {
  usesTransferAreaForAcqStdPrice,
  resolveAcqAreaForStdPrice,
} from "@/lib/calc/transfer-tax-api-helpers";
import { calculateEstimatedAcquisitionPrice } from "@/lib/tax-engine/tax-utils";

describe("[§9-7] ⑤↔④ 술어 공유 — 취득시 기준시가에 곱할 면적", () => {
  it("S97-1: partial에서만 양도분 면적을 쓴다", () => {
    expect(usesTransferAreaForAcqStdPrice("partial")).toBe(true);
    expect(usesTransferAreaForAcqStdPrice("same")).toBe(false);
    // 미지정은 same으로 취급(③ normalize 기본값)
    expect(usesTransferAreaForAcqStdPrice(undefined)).toBe(false);
  });

  it("S97-2: 감환지·증환지는 전체(의제) 면적 그대로 — 이중 안분 금지 (BR4)", () => {
    // reduction: UI가 이미 `acquisitionArea`에 의제취득면적을 넣는다
    expect(usesTransferAreaForAcqStdPrice("reduction")).toBe(false);
    // increase: 증가분이 별개 자산으로 분리되므로 당초분은 전체 면적이 맞다
    expect(usesTransferAreaForAcqStdPrice("increase")).toBe(false);
  });

  it("S97-3: ④ `resolveAcqAreaForStdPrice`가 같은 술어를 쓴다 (단일 소스)", () => {
    const asset = { acquisitionArea: "200", transferArea: "100" };
    for (const scenario of ["partial", "same", "reduction", "increase", undefined]) {
      const usesTransfer = usesTransferAreaForAcqStdPrice(scenario);
      const resolved = resolveAcqAreaForStdPrice({ ...asset, areaScenario: scenario });
      expect(resolved).toBe(usesTransfer ? 100 : 200);
    }
  });
});

describe("[§9-7] 세액 영향 — 분자만 부풀면 환산취득가가 과대 계상된다", () => {
  const ACQ_AREA_FULL = 200;
  const TRANSFER_AREA = 100;
  const ACQ_PER_SQM = 1_000_000;
  const TR_PER_SQM = 3_000_000;
  const TRANSFER_PRICE = 500_000_000;

  /** 위젯 산식 — `StandardPriceInput`이 `floor(단가 × 면적)`으로 총액을 파생한다 */
  const derive = (perSqm: number, area: number) => Math.floor(perSqm * area);

  const denominator = derive(TR_PER_SQM, TRANSFER_AREA); // 양도시 칸은 늘 양도분

  it("S97-4: 정정 후 — 분자가 양도분 기준이라 비율이 단가비(1/3)가 된다", () => {
    const numerator = derive(ACQ_PER_SQM, TRANSFER_AREA);
    expect(numerator).toBe(100_000_000);
    expect(numerator / denominator).toBeCloseTo(1 / 3, 10);

    const converted = calculateEstimatedAcquisitionPrice(TRANSFER_PRICE, numerator, denominator);
    expect(TRANSFER_PRICE - converted).toBe(333_333_334);
  });

  it("S97-5: 🔴 정정 전 — 전체면적을 곱하면 환산취득가가 2배로 부푼다", () => {
    const numeratorOld = derive(ACQ_PER_SQM, ACQ_AREA_FULL);
    expect(numeratorOld).toBe(200_000_000);

    const convertedOld = calculateEstimatedAcquisitionPrice(TRANSFER_PRICE, numeratorOld, denominator);
    const convertedNew = calculateEstimatedAcquisitionPrice(
      TRANSFER_PRICE,
      derive(ACQ_PER_SQM, TRANSFER_AREA),
      denominator,
    );

    // 분자가 2배가 되면 환산취득가도 거의 2배가 되어 양도차익이 그만큼 줄어든다(과소과세 방향).
    // ⚠️ **정확히 2배는 아니다** — `applyRatio`의 원 미만 절사 때문에 1원이 어긋난다
    //    (333,333,333 vs 166,666,666 × 2 = 333,333,332). 관계식이 아니라 실측값을 고정한다.
    expect(convertedNew).toBe(166_666_666);
    expect(convertedOld).toBe(333_333_333);
    expect(convertedOld - convertedNew * 2).toBe(1);

    expect(TRANSFER_PRICE - convertedOld).toBe(166_666_667);
  });

  it("S97-6: 양도차익 차이 = 166,666,667원 (엔진 실측 총세액 27,827,432 → 79,199,706)", () => {
    const gainNew =
      TRANSFER_PRICE -
      calculateEstimatedAcquisitionPrice(TRANSFER_PRICE, derive(ACQ_PER_SQM, TRANSFER_AREA), denominator);
    const gainOld =
      TRANSFER_PRICE -
      calculateEstimatedAcquisitionPrice(TRANSFER_PRICE, derive(ACQ_PER_SQM, ACQ_AREA_FULL), denominator);
    expect(gainNew - gainOld).toBe(166_666_667);
  });
});
