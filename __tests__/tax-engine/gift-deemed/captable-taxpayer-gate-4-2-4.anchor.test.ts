import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import type { CapShareholder, CapitalIncreaseAllocationInput } from "@/lib/tax-engine/gift-deemed/types";

/**
 * cap-table 경로의 「상증법」§4의2④ 납세의무 게이트.
 *
 *   §4의2④ — 영리법인이 증여받은 재산·이익에 **법인세가 부과**되는 경우
 *            「**해당 법인의 주주등**에 대해서는」 증여세를 부과하지 아니한다
 *            (§45의3~§45의5에 따른 경우는 제외).
 *
 * 🔑 **cap-table은 목(目) 표를 쓰지 않는다.** 단건 경로가 `statuteFixesShareholderStatus`로
 *    「이 목은 이익을 얻는 자가 주주인가」를 판정하는 것은 **명부가 없어서**다. 1호 가목
 *    (실권주 배정)이 「사안 의존」인 이유도 배정받은 자가 기존 주주인지 제3자인지 단건 입력만으로는
 *    알 수 없기 때문이다. cap-table에는 그 사실이 **입력에 이미 있다** — `preShares`다.
 *    ⇒ 행별 토글을 새로 만들면 두 개의 진실이 생기고 사용자가 명부와 모순되게 답할 수 있다.
 *
 * 픽스처(저가 ㉮12,000 / ㉰10,000 · ㉯ 11,000) — 한 실행 안에 긍정 짝이 들어 있다:
 *   갑 preShares 200,000 전량 실권            → 증여자 (delta −200,000,000)
 *   을 preShares 100,000 + 재배정 100,000     → **기존 주주** 수증자 100,000,000
 *   병 preShares **0** + 직접배정 100,000     → **주주등이 아닌 자** 수증자 100,000,000
 */

const SH: Record<"갑" | "을" | "병", CapShareholder> = {
  갑: { id: "갑", name: "갑", preShares: 200_000, entitledShares: 200_000, subscribedShares: 0, reallocatedShares: 0, relatedTo: ["을", "병"] },
  을: { id: "을", name: "을", preShares: 100_000, entitledShares: 100_000, subscribedShares: 200_000, reallocatedShares: 100_000, relatedTo: ["갑"] },
  병: { id: "병", name: "병", preShares: 0, entitledShares: 0, subscribedShares: 100_000, reallocatedShares: 100_000, relatedTo: ["갑"] },
};

function run(extra: Partial<CapitalIncreaseAllocationInput> = {}, rows: CapShareholder[] = [SH.갑, SH.을, SH.병]) {
  return calcCapitalIncreaseAllocation({
    direction: "low",
    preIssuePrice: 12_000,
    newSharePrice: 10_000,
    shareholders: rows.map((r) => ({ ...r, relatedTo: [...(r.relatedTo ?? [])] })),
    ...extra,
  });
}
const totalOf = (r: ReturnType<typeof run>, id: string) =>
  r.perBeneficiary.find((b) => b.beneficiaryId === id)?.total;
const reasonOf = (r: ReturnType<typeof run>, id: string) =>
  r.perBeneficiary.find((b) => b.beneficiaryId === id)?.byDonor[0]?.excludedReason;

describe("[CT42] cap-table §4의2④ — 법인세가 부과된 영리법인의 주주등", () => {
  it("[CT42-0] 기준선 — 게이트 미지정이면 을·병 각 100,000,000", () => {
    const r = run();
    expect(r.perShareAfter).toBe(11_000);
    expect(totalOf(r, "을")).toBe(100_000_000);
    expect(totalOf(r, "병")).toBe(100_000_000);
  });

  it("[CT42-1] 법인세 부과 + 증자 전 주주(을) → 과세분 0 · 사유에 §4의2④", () => {
    const r = run({ issuerGainCorporateTaxed: true });
    expect(totalOf(r, "을")).toBe(0);
    expect(reasonOf(r, "을")).toContain("§4의2④");
  });

  // 긍정 짝 ① — 같은 실행 안의 제3자. 「주주등이 아닌 자」라 §4의2④가 미치지 않는다.
  //   일괄 배제 구현이었다면 여기서도 0이 됐을 것이다.
  it("[CT42-2] 긍정 짝 — 증자 전 보유가 0인 제3자(병)는 배제되지 않는다", () => {
    const r = run({ issuerGainCorporateTaxed: true });
    expect(totalOf(r, "병")).toBe(100_000_000);
    expect(reasonOf(r, "병")).toBeUndefined();
  });

  // 긍정 짝 ② — 요건(법인세 부과)이 없으면 주주여도 배제하지 않는다.
  it("[CT42-3] 긍정 짝 — 법인세가 부과되지 않았으면 주주(을)도 종전 금액", () => {
    expect(totalOf(run({ issuerGainCorporateTaxed: false }), "을")).toBe(100_000_000);
  });

  // 「상증법」§31①은 증여재산가액을 **과세대상 가액**으로 한정 정의한다 ⇒ 제외되면 그 이름이
  //   성립하지 않는다. 그러나 **이익 자체가 부정되는 것은 아니다** — 그 금액은 「법인세법 시행령」
  //   §89⑥이 §39·§29②를 준용해 계산하는 익금으로 그대로 쓰인다. ⇒ 검증내역은 보존해야 한다.
  it("[CT42-4] 금액 보존 — byShareholder·zero-sum은 게이트와 무관하게 불변", () => {
    const base = run();
    const gated = run({ issuerGainCorporateTaxed: true });
    expect(gated.byShareholder).toEqual(base.byShareholder);
    expect(gated.reconciliation).toEqual({ totalGain: 200_000_000, totalLoss: 200_000_000, balanced: true });
  });

  // ①③(수증자 자신이 영리법인)과 ④(그 법인의 주주등)는 **수범자가 다르다**. 한 행에 둘이 겹칠 수
  //   있고 그때 표시는 ①③이 우선이다 — 수증자가 애초에 납세의무자가 아니라는 쪽이 더 앞선 사유다.
  it("[CT42-5] ①③과 겹치면 사유는 영리법인 수증자가 우선", () => {
    const r = run({ issuerGainCorporateTaxed: true }, [SH.갑, { ...SH.을, isCorporate: true }, SH.병]);
    expect(totalOf(r, "을")).toBe(0);
    expect(reasonOf(r, "을")).toContain("영리법인");
  });

  // 고가(§39①2호)는 이익을 얻는 자가 **신주 인수를 포기한 주주**다 ⇒ 정의상 증자 전 주주이고
  //   preShares > 0이 성립한다. 저가에서만 도는 게이트가 되지 않도록 방향을 따로 고정한다.
  it("[CT42-6] 고가에서도 포기자(주주)는 배제된다 — 나목 몫(taxableForfeit) 경로", () => {
    const high = (gate: boolean) =>
      calcCapitalIncreaseAllocation({
        direction: "high",
        preIssuePrice: 10_000,
        newSharePrice: 20_000,
        issuerGainCorporateTaxed: gate,
        shareholders: [
          { id: "갑", name: "갑", preShares: 100_000, entitledShares: 100_000, subscribedShares: 200_000, reallocatedShares: 100_000, relatedTo: ["병"] },
          { id: "병", name: "병", preShares: 100_000, entitledShares: 100_000, subscribedShares: 0, reallocatedShares: 0, relatedTo: ["갑"] },
        ],
      });
    // 🔴 기준선을 **같은 테스트에서** 고정한다 — 「0이다」만 단언하면 원래 0이었던 경우와
    //    구별되지 않아 게이트가 아무 일도 하지 않아도 초록이다(구별력 0).
    const base = high(false);
    expect(base.byShareholder.filter((b) => b.delta > 0).map((b) => b.id)).toEqual(["병"]); // 포기자가 이익
    expect(totalOf(base, "병")).toBe(500_000_000);

    const gated = high(true);
    expect(totalOf(gated, "병")).toBe(0);
    expect(reasonOf(gated, "병")).toContain("§4의2④");
  });

  // ⑫ — leaf 직접호출 anchor는 Zod층을 지나가지 않는다. 라우트가 받는 스키마에서 이 필드가
  //   조용히 strip되면 게이트는 엔진에 **도달하지 못한다**(TypeScript 미감지).
  it("[CT42-7] ⑫ Zod가 issuerGainCorporateTaxed를 보존한다", () => {
    const parsed = deemedGiftInputSchema.safeParse({
      type: "capital_increase_allocation",
      direction: "low",
      preIssuePrice: 12_000,
      newSharePrice: 10_000,
      issuerGainCorporateTaxed: true,
      shareholders: [SH.갑, SH.을, SH.병].map((r) => ({ ...r, relatedTo: [...(r.relatedTo ?? [])] })),
    });
    if (parsed.success && parsed.data.type === "capital_increase_allocation") {
      expect(parsed.data.issuerGainCorporateTaxed).toBe(true);
    } else {
      expect.unreachable(`파싱 실패: ${JSON.stringify(parsed.success ? parsed.data : parsed.error.issues)}`);
    }
  });
});
