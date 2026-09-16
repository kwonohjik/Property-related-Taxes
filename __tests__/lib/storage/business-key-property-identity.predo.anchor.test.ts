/**
 * Pre-Do anchor — **계산 이력 dedup 키가 물건을 유일 식별하지 못한다**
 *
 * 서로 다른 물건이 같은 `businessKey`를 갖고 뒤가 앞을 덮어써, 완성된 신고서가 사라진다.
 * 실측(계획서 §1-1): 마법사 왕복 2회 → 이력 1건. 제목까지 동일해 화면에 단서가 없다.
 *
 * 축이 둘이다 — 어느 한쪽만 막아서는 닫히지 않는다:
 *   A. 식별 강화 — 키가 동·호를 봐야 한다 (같은 지번 두 세대가 지금은 같은 키다)
 *   B. 안전 폴백 — 식별자가 없으면 키를 만들지 않는다 (`addr:|날짜` 금지)
 *
 * 계획서: `docs/00-pm/business-key-property-identity.plan.md`
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createCalculationRepository, resetLocalDB } from "@/lib/storage";
import { extractBusinessKey } from "@/lib/storage/business-key";
import { generateTitle } from "@/lib/storage/title-generator";

const UID = "bk-identity";
const JIBUN = "서울 강남구 대치동 316";

function transferInput(over: Record<string, unknown> = {}) {
  return { assets: [{ addressRoad: "", addressJibun: "", ...over }], transferDate: "2026-06-03" };
}
function unit(dong: string, ho: string) {
  return { assets: [{ addressJibun: JIBUN, addressDong: dong, addressHo: ho }], transferDate: "2026-06-03" };
}
function rec(inputData: Record<string, unknown>, result: Record<string, unknown>) {
  return {
    taxType: "transfer" as const,
    title: generateTitle("transfer", inputData, "2026-06-03"),
    inputData,
    resultData: result,
    taxLawVersion: "2026-01-01",
    linkedCalculationId: null,
    clientId: null,
  };
}

describe("축 B — 식별자가 없으면 키를 만들지 않는다", () => {
  beforeEach(async () => { await resetLocalDB(); });

  // 🔴 K-1 — 사용자 관점의 최종 단언
  it("K-1: 주소 없는 두 물건·같은 양도일 → 이력 2건 (덮어쓰기 없음)", async () => {
    const repo = createCalculationRepository(UID);
    const a = await repo.saveOrUpdateByBusinessKey(rec(transferInput({ transferPrice: 1_000_000_000 }), { totalTax: 111 }));
    const b = await repo.saveOrUpdateByBusinessKey(rec(transferInput({ transferPrice: 2_000_000_000 }), { totalTax: 222 }));
    const all = await repo.list({ taxType: "transfer" });
    expect(b.id, "두 번째 물건이 첫 물건의 record를 재사용하면 안 된다").not.toBe(a.id);
    expect(all).toHaveLength(2);
    expect(all.map((r) => (r.resultData as { totalTax: number }).totalTax).sort()).toEqual([111, 222]);
  });

  // 🔴 K-4
  it("K-4: 주소 없음 → null (양도·취득)", () => {
    expect(extractBusinessKey("transfer", transferInput())).toBeNull();
    expect(extractBusinessKey("acquisition", { road: "", jibun: "", acquisitionDate: "2026-03-01" })).toBeNull();
  });

  // 🔴 K-5
  it("K-5: 성명·주민번호 없음 → null (상속)", () => {
    expect(extractBusinessKey("inheritance", { decedentName: "", decedentResidentNumber: "", deathDate: "2026-02-01" })).toBeNull();
  });

  // 🔴 K-7
  it("K-7: 회사명 없음 → null (주식평가)", () => {
    expect(extractBusinessKey("stock_valuation", { stockItems: [{ companyName: "" }], valuationDate: "2026-06-03" })).toBeNull();
  });

  // ✅ 유지 — 축 B가 정상 경로를 망가뜨리지 않는다
  it("K-8: 주소가 있으면 종전대로 키를 만든다 (회귀 방어)", () => {
    expect(extractBusinessKey("transfer", { assets: [{ addressRoad: "서울로1" }], transferDate: "2024-05-01" }))
      .toBe("addr:서울로1|2024.05.01");
  });
});

describe("축 A — 키가 동·호를 본다", () => {
  // 🔴 K-2
  it("K-2: 같은 지번·다른 동·호 → 키 2종", () => {
    const a = extractBusinessKey("transfer", unit("101동", "501"));
    const b = extractBusinessKey("transfer", unit("102동", "1201"));
    expect(a).not.toBe(b);
  });

  // ✅ 유지 — 중간 저장 dedup은 살아 있어야 한다
  it("K-3: 같은 지번·같은 동·호 → 키 1종", () => {
    expect(extractBusinessKey("transfer", unit("101동", "501")))
      .toBe(extractBusinessKey("transfer", unit("101동", "501")));
  });

  // 🔴 K-2b — 취득·재산도 같은 함수를 쓴다 (필드명만 다르다)
  it("K-2b: 취득·재산도 동·호로 갈린다 (dong/ho 스펠링)", () => {
    const acq = (d: string, h: string) => extractBusinessKey("acquisition", { jibun: JIBUN, dong: d, ho: h, acquisitionDate: "2026-03-01" });
    expect(acq("101동", "501")).not.toBe(acq("102동", "1201"));
    const prop = (d: string, h: string) => extractBusinessKey("property", { jibun: JIBUN, dong: d, ho: h });
    expect(prop("101동", "501")).not.toBe(prop("102동", "1201"));
  });

  // 🔴 K-6
  it("K-6: 제목에 동·호가 노출된다 (두 세대를 화면에서 구분할 수 있다)", () => {
    const t1 = generateTitle("transfer", unit("101동", "501"), "2026-06-03");
    const t2 = generateTitle("transfer", unit("102동", "1201"), "2026-06-03");
    expect(t1).not.toBe(t2);
    expect(t1).toContain("101동");
    expect(t1).toContain("501");
  });
});
