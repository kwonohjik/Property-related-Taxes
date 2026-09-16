/**
 * Pre-Do anchor — `version(8)` businessKey 재계산 마이그레이션 (계획서 §6 · Q-1 (b))
 *
 * 키 형식이 바뀌면 기존 record는 구 형식이라 매칭되지 않아 **이력에 중복 항목**이 생긴다
 * (설계서 §6.1 배포 전환 동작). 일괄 재계산으로 그것을 막는다.
 *
 * 🔴 재계산이 **record를 지우거나 늘려서는 안 된다** — 이미 §1의 충돌로 합쳐진 이력은
 *    재계산하면 두 record가 같은 키가 된다. 그때도 **그냥 둔다**(중복 키 허용).
 *    `saveOrUpdateByBusinessKey`가 `find`로 첫 건만 잡을 뿐 소실은 없다.
 *
 * 선례: `nbl-sigungu-code-recovery` — upgrade 본체가 아니라 **순수 코어**를 단언한다.
 */
import { describe, expect, it } from "vitest";
import { recomputeRecordBusinessKey } from "@/lib/storage/migrations/business-key-recompute";

const JIBUN = "서울 강남구 대치동 316";
function legacy(over: Record<string, unknown> = {}) {
  return {
    taxType: "transfer",
    businessKey: `addr:${JIBUN}|2026.06.03`, // 동·호가 없던 구 형식
    inputData: { assets: [{ addressJibun: JIBUN, addressDong: "101동", addressHo: "501" }], transferDate: "2026-06-03" },
    ...over,
  };
}

describe("§version(8) businessKey 재계산", () => {
  // 🔴 M-1
  it("M-1: 구 형식 record가 새 키(동·호 포함)를 갖는다", () => {
    const r = legacy();
    const changed = recomputeRecordBusinessKey(r);
    expect(changed).toBe(true);
    expect(r.businessKey).toContain("101동");
    expect(r.businessKey).not.toBe(`addr:${JIBUN}|2026.06.03`);
  });

  /**
   * ⚠️ **M-2·M-3은 구별력 0이다 — 실측으로 확인했다.**
   *
   * 뮤테이션 4종(재계산 건너뛰기 · delete 대신 빈 문자열 · 충돌 회피 접미 부여 · …) 중
   * **어느 것도 M-2·M-3을 빨갛게 만들지 못했다**(각각 M-1·M-4·M-5가 잡았다).
   * 이 함수는 record **하나**만 보므로 「다른 record를 지운다」를 지역 편집으로 만들 수 없다.
   *
   * ⇒ 두 항목은 **검증된 가드가 아니라 «의도 문서»**다. 마이그레이션이 나중에 일괄 삭제·병합을
   *    하도록 바뀌면 그때 비로소 안전망이 된다. 「통과했으니 지켜진다」고 읽지 말 것.
   *    [[feedback_mutation_zero_discrimination_is_not_proof]]
   */
  // 🟡 M-2 (구별력 0 — 의도 문서)
  it("M-2: 재계산이 중복 키를 만들어도 record를 지우지 않는다", () => {
    // §1의 충돌로 이미 만들어진 이력 — 주소가 같고 동·호가 없다
    const a = legacy({ inputData: { assets: [{ addressJibun: JIBUN }], transferDate: "2026-06-03" } });
    const b = legacy({ inputData: { assets: [{ addressJibun: JIBUN }], transferDate: "2026-06-03" } });
    recomputeRecordBusinessKey(a);
    recomputeRecordBusinessKey(b);
    expect(a.businessKey, "같은 키가 되는 것은 허용한다").toBe(b.businessKey);
    // 「지우지 않는다」 = 어느 쪽도 비어 있지 않다
    expect(a.inputData).toBeTruthy();
    expect(b.inputData).toBeTruthy();
  });

  // 🟡 M-3 (구별력 0 — 의도 문서)
  it("M-3: 재계산 전후 record «건수»가 같다", () => {
    const records = [legacy(), legacy({ inputData: { assets: [{ addressJibun: "다른 지번 9" }], transferDate: "2026-06-03" } })];
    const before = records.length;
    for (const r of records) recomputeRecordBusinessKey(r);
    expect(records.length).toBe(before);
    expect(records.every((r) => r.inputData)).toBe(true);
  });

  // 🔴 M-4
  it("M-4: 주소 없는 구 record는 businessKey가 지워진다 → content 폴백", () => {
    const r = legacy({
      businessKey: "addr:|2026.06.03",
      inputData: { assets: [{ addressJibun: "" }], transferDate: "2026-06-03" },
    });
    expect(recomputeRecordBusinessKey(r)).toBe(true);
    expect(r.businessKey).toBeUndefined();
  });

  // ✅ 유지 — 바꿀 것이 없으면 건드리지 않는다
  it("M-5: 이미 현행 키면 false를 반환한다 (불필요한 쓰기 방지)", () => {
    const r = legacy();
    recomputeRecordBusinessKey(r);
    expect(recomputeRecordBusinessKey(r)).toBe(false);
  });

  // ✅ 유지 — 키를 못 뽑는 세목은 건드리지 않는다
  it("M-6: 증여 등 키 없는 세목은 undefined 유지 · 변경 없음", () => {
    const r = { taxType: "gift", businessKey: undefined, inputData: { donorName: "홍길동" } };
    expect(recomputeRecordBusinessKey(r)).toBe(false);
    expect(r.businessKey).toBeUndefined();
  });
});
