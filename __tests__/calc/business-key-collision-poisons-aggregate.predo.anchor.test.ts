/**
 * Pre-Do anchor — **키 충돌이 합산 [다시 불러오기]를 오염시킨다** (계획서 §1-4)
 *
 * PR #1644가 만든 staleness 감지 장치가 **오염을 실어 나르는 경로**가 된다.
 * 실측(착수 전):
 *   A를 합산 편입 → 무관한 B가 A의 record를 덮음(created:false, 같은 id)
 *   → 배너 "source_changed" → [다시 불러오기] → A 슬롯 100 → **999(=B)**
 *   → 라벨은 "양도 1번" 그대로라 **사용자는 여전히 A라고 믿는다**
 *
 * ⇒ 합산 «세액»이 엉뚱한 물건으로 계산된다. 이 결함이 L3인 이유다.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { calculationRepository, resetLocalDB } from "@/lib/storage";
import {
  buildPropertyFromSingleRecord,
  reloadPropertyFromSource,
} from "@/lib/calc/transfer-multi-load-entry";

function input(title: string, price: number) {
  return {
    taxType: "transfer" as const,
    title,
    // 🔑 주소 없음 + 같은 양도일 = 충돌 조건
    inputData: {
      assets: [{ assetKind: "land", addressJibun: "", transferPrice: price }],
      transferDate: "2026-06-03",
    },
    resultData: { mode: "single", result: { determinedTax: price, localIncomeTax: 0 } },
    taxLawVersion: "2026",
    linkedCalculationId: null,
    clientId: null,
  };
}
const priceOf = (p: { form: { assets: unknown[] } }) =>
  (p.form.assets[0] as { transferPrice?: number }).transferPrice;

describe("§키 충돌 → 합산 오염", () => {
  beforeEach(async () => { await resetLocalDB(); });

  // 🔴 R-1
  it("R-1: 편입된 A의 원본을 무관한 B가 덮지 못한다", async () => {
    const { id: idA } = await calculationRepository.saveOrUpdateByBusinessKey(input("물건 A", 100));
    const pA = buildPropertyFromSingleRecord((await calculationRepository.get(idA))!, "양도 1번");
    expect(priceOf(pA)).toBe(100);

    const { id: idB, created } = await calculationRepository.saveOrUpdateByBusinessKey(input("물건 B", 999));
    expect(created, "무관한 물건은 새 record여야 한다").toBe(true);
    expect(idB).not.toBe(idA);

    const reloaded = await reloadPropertyFromSource(pA);
    expect(priceOf(reloaded), "A 슬롯에 B가 들어오면 합산 세액이 엉뚱한 물건으로 계산된다").toBe(100);
    expect(reloaded.propertyLabel).toBe("양도 1번");
  });
});
