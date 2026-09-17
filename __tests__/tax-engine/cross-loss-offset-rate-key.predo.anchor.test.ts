/**
 * Pre-Do anchor — **크로스 통산의 통합 `rateKey` 축** (PR-1)
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────
 * `offsetLossesCore`는 `rateKey` 문자열이 같으면 「같은 세율」로 본다(영 §167의2①1호).
 * 그런데 생산자가 둘이고 **규약이 다르다**:
 *   · 부동산 `loss-offset-rate-key.ts` — `prog:{호}` · `rate:{값}` · `solo:{자산}`
 *   · 주식·기타자산 `stock-transfer-rate-calc.ts` — `other_asset_progressive` 등
 *
 * **둘 다 §55① 기본누진인데 문자열이 달라** 그대로 이어 붙이면 §167의2①**1호가 죽고
 * 2호(안분)로 떨어진다** — PR #1643이 부동산 «내부»에서 고친 것과 같은 병의 크로스판이다.
 *
 * 계획서: `docs/00-pm/cross-engine-102-2-loss-offset.plan.md` §6 Q-1 (가) · §7 C-1·C-2
 */
import { describe, it, expect } from "vitest";
import {
  crossLossOffsetRateKey,
  CROSS_PROG_BASIC,
  CROSS_PROG_NBL,
} from "@/lib/tax-engine/cross-loss-offset-rate-key";

describe("§102② 크로스 통산 — 통합 세율축", () => {
  // ── 🔴 C-1: 같은 표는 같은 키 ────────────────────────────────────────
  it("C-1 🔴: §55① 기본누진 — 부동산 1호와 기타자산이 **같은 키**다", () => {
    expect(crossLossOffsetRateKey("real_estate", "prog:104-1-1")).toBe(CROSS_PROG_BASIC);
    expect(crossLossOffsetRateKey("other_asset", "other_asset_progressive")).toBe(CROSS_PROG_BASIC);
  });

  it("C-1b 🔴: 기본 +10%p — 부동산 8호와 기타자산 9호가 **같은 키**다", () => {
    // 이 저장소는 이미 둘을 한 표로 계산한다 — `comparative-104-5-cross.ts:102`가
    // `clause8TaxBase + clause9TaxBase`를 **하나의 `nbl89Brackets`**로 넣는다.
    expect(crossLossOffsetRateKey("real_estate", "prog:104-1-8")).toBe(CROSS_PROG_NBL);
    expect(crossLossOffsetRateKey("other_asset", "other_asset_progressive_nbl")).toBe(CROSS_PROG_NBL);
  });

  // ── 🔴 C-2: 다른 표는 다른 키 (거짓 병합 방지) ──────────────────────
  it("C-2 🔴: §55① 기본누진과 +10%p는 **다른 키**다", () => {
    expect(crossLossOffsetRateKey("real_estate", "prog:104-1-1")).not.toBe(
      crossLossOffsetRateKey("real_estate", "prog:104-1-8"),
    );
    expect(crossLossOffsetRateKey("other_asset", "other_asset_progressive")).not.toBe(
      crossLossOffsetRateKey("other_asset", "other_asset_progressive_nbl"),
    );
  });

  it("C-2b 🔴: 중과 +20%p·+30%p는 서로도, 기본누진과도 다르다", () => {
    const keys = [
      crossLossOffsetRateKey("real_estate", "prog:104-1-1"),
      crossLossOffsetRateKey("real_estate", "prog:104-7-1"),
      crossLossOffsetRateKey("real_estate", "prog:104-7-3"),
    ];
    expect(new Set(keys).size).toBe(3);
  });

  // ── 🔴 C-2c: 주식 그룹(§102①2호)은 크로스 대상이 아니다 ────────────
  it("C-2c 🔴: 주식 그룹 키는 **null** — §102① 본문 후단(호 간 합산 금지)", () => {
    // 법 §102① 「… 결손금은 **다른 호의 소득금액과 합산하지 아니한다**」
    for (const k of ["10", "20", "30", "20_25"]) {
      expect(crossLossOffsetRateKey("other_asset", k), `주식 키 ${k}`).toBeNull();
    }
  });

  it("C-2d 🔴: 비과세·범위 밖도 null이다", () => {
    expect(crossLossOffsetRateKey("other_asset", "exempt_or_out_of_scope")).toBeNull();
  });

  // ── 🟢 C-2e: 부동산 단일세율·호 불명은 **출처를 붙여 그대로** 산다 ──
  /**
   * 기타자산에는 대응이 없으므로 병합할 상대가 없다. 그렇다고 버리면 **부동산 내부 통산이
   * 크로스 경로에서 사라진다** — 키를 유지하되 출처를 붙여 충돌만 막는다.
   */
  it("C-2e 🟢: 단일세율·호 불명 키는 유지되고 서로 충돌하지 않는다", () => {
    const a = crossLossOffsetRateKey("real_estate", "rate:0.7");
    const b = crossLossOffsetRateKey("real_estate", "rate:0.6");
    const c = crossLossOffsetRateKey("real_estate", "solo:P1");
    expect(a).not.toBeNull();
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("C-2f 🟢: 같은 단일세율은 같은 키다 (부동산 내부 1호 보존)", () => {
    expect(crossLossOffsetRateKey("real_estate", "rate:0.7")).toBe(
      crossLossOffsetRateKey("real_estate", "rate:0.7"),
    );
  });

  // ── 🟢 C-2g: 모르는 키는 **묶지 않는다**(안전측) ────────────────────
  it("C-2g 🟢: 미지의 키는 자기만의 키가 된다 — 조용히 병합하지 않는다", () => {
    const x = crossLossOffsetRateKey("real_estate", "unknown:zzz");
    const y = crossLossOffsetRateKey("real_estate", "unknown:www");
    expect(x).not.toBeNull();
    expect(x).not.toBe(y);
  });
});
