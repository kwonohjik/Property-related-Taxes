/**
 * content-hash 휘발성 id 정규화 — dedup 복원 anchor
 *
 * form 항목 id가 Date.now()/randomUUID 기반이라, 같은 계산도 입력 시점이 다르면
 * id가 전부 달라져 contentHash가 달라지고 dedup이 무력화되어 이력에 중복 누적된다.
 * computeContentHash/computeInputHash가 휘발성 id를 등장 순서로 정규화하여
 * "계산 내용이 같으면 같은 해시"를 복원하는지 검증한다.
 *
 * Pre-Do 기준(정규화 전): N-1·N-2·N-3·N-6·N-7·N-9 = RED, N-4·N-5·N-8 = GREEN.
 */
import { describe, expect, it } from "vitest";
import { computeContentHash, computeInputHash } from "@/lib/storage/content-hash";

describe("content-hash — 휘발성 id 정규화 (dedup 복원)", () => {
  it("N-1: 항목 id(prefix+timestamp)만 다르고 내용 같으면 동일 contentHash", async () => {
    const a = { heirs: [{ id: "heir-1717200000000-1", name: "김갑동", relation: "child" }] };
    const b = { heirs: [{ id: "heir-1799999999999-1", name: "김갑동", relation: "child" }] };
    expect(await computeContentHash(a, {})).toBe(await computeContentHash(b, {}));
  });

  it("N-2: 자산 assetId(asset-)만 다르고 내용 같으면 동일", async () => {
    const a = { assets: [{ assetId: "asset-1111111111111-1", transferPrice: 500000000 }] };
    const b = { assets: [{ assetId: "asset-2222222222222-1", transferPrice: 500000000 }] };
    expect(await computeContentHash(a, {})).toBe(await computeContentHash(b, {}));
  });

  it("N-3: input·result 교차참조 id가 함께 달라도 동일 (heirId 일관 정규화)", async () => {
    const inA = { heirs: [{ id: "heir-100-1", name: "A" }, { id: "heir-100-2", name: "B" }] };
    const reA = {
      allocations: [
        { heirId: "heir-100-1", amount: 1000 },
        { heirId: "heir-100-2", amount: 2000 },
      ],
    };
    const inB = { heirs: [{ id: "heir-200-1", name: "A" }, { id: "heir-200-2", name: "B" }] };
    const reB = {
      allocations: [
        { heirId: "heir-200-1", amount: 1000 },
        { heirId: "heir-200-2", amount: 2000 },
      ],
    };
    expect(await computeContentHash(inA, reA)).toBe(await computeContentHash(inB, reB));
  });

  it("N-4: 상속인 수/배분이 다르면 다른 hash (과잉 dedup 방지)", async () => {
    const a = { heirs: [{ id: "heir-1-1", name: "A" }] };
    const b = { heirs: [{ id: "heir-1-1", name: "A" }, { id: "heir-1-2", name: "B" }] };
    expect(await computeContentHash(a, {})).not.toBe(await computeContentHash(b, {}));
  });

  it("N-5: 실제 입력값(금액)이 다르면 여전히 다른 hash", async () => {
    const a = { assets: [{ assetId: "asset-1-1", transferPrice: 500000000 }] };
    const b = { assets: [{ assetId: "asset-1-1", transferPrice: 600000000 }] };
    expect(await computeContentHash(a, {})).not.toBe(await computeContentHash(b, {}));
  });

  it("N-6: UUID 형식 id만 달라도 동일", async () => {
    const a = { items: [{ id: "550e8400-e29b-41d4-a716-446655440000", v: 1 }] };
    const b = { items: [{ id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8", v: 1 }] };
    expect(await computeContentHash(a, {})).toBe(await computeContentHash(b, {}));
  });

  it("N-7: 종부세 순수숫자 id(키 기반)만 달라도 동일", async () => {
    const a = { properties: [{ id: "17172000001234", area: 100 }] };
    const b = { properties: [{ id: "17999000005678", area: 100 }] };
    expect(await computeContentHash(a, {})).toBe(await computeContentHash(b, {}));
  });

  it("N-8: 큰 금액(13자리 숫자)은 id로 오인되지 않음", async () => {
    const a = { totalAmount: 1000000000000 };
    const b = { totalAmount: 2000000000000 };
    expect(await computeContentHash(a, {})).not.toBe(await computeContentHash(b, {}));
  });

  it("N-9: computeInputHash도 동일 정규화", async () => {
    const a = { heirs: [{ id: "heir-111-1", name: "A" }] };
    const b = { heirs: [{ id: "heir-222-1", name: "A" }] };
    expect(await computeInputHash(a)).toBe(await computeInputHash(b));
  });

  it("N-10: clientId는 정규화 제외 — 의뢰인이 다르면 다른 hash", async () => {
    // clientId는 dedup의 별도 축이지만, 혹시 input에 포함될 경우 의미를 보존해야 한다.
    const a = { clientId: "client-aaa", amount: 1000 };
    const b = { clientId: "client-bbb", amount: 1000 };
    expect(await computeContentHash(a, {})).not.toBe(await computeContentHash(b, {}));
  });

  it("N-11: result의 id-keyed Record(perHeirSurcharge) 키도 정규화", async () => {
    // 세대생략 §27 할증: result.perHeirSurcharge = { [heir.id]: 할증액 } — id가 '키'.
    const inA = { heirs: [{ id: "heir-1717200000000-1", name: "손녀" }] };
    const reA = { perHeirSurcharge: { "heir-1717200000000-1": 30232198 } };
    const inB = { heirs: [{ id: "heir-1799999999999-1", name: "손녀" }] };
    const reB = { perHeirSurcharge: { "heir-1799999999999-1": 30232198 } };
    expect(await computeContentHash(inA, reA)).toBe(await computeContentHash(inB, reB));
  });

  it("N-12: 서로 다른 수유자에게 배분된 id-keyed Record는 구분 (과잉 dedup 방지)", async () => {
    const inA = { heirs: [{ id: "heir-1717200000000-1", name: "손녀" }] };
    const reA = { perHeirSurcharge: { "heir-1717200000000-1": 30000000 } };
    const inB = { heirs: [{ id: "heir-1717200000000-1", name: "손녀" }] };
    const reB = { perHeirSurcharge: { "heir-1717200000000-1": 40000000 } };
    expect(await computeContentHash(inA, reA)).not.toBe(await computeContentHash(inB, reB));
  });
});
