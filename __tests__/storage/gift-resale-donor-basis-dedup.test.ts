/**
 * §101② 증여자 직접양도 기준 계산 — 수증자 기준 이력 덮어쓰기 방지 anchor.
 *
 * 같은 물건·같은 양도일을 수증자 기준과 증여자 기준으로 차례로 계산하면 종전엔 이력 키가 같아
 * 두 번째 저장이 첫 record를 update했다(2026-11-27 probe 실측 — record 1건).
 * 계획서: docs/00-pm/transfer-history-101-2-donor-key.plan.md
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createCalculationRepository, resetLocalDB } from "@/lib/storage";
import { extractBusinessKey } from "@/lib/storage/business-key";
import { generateTitle } from "@/lib/storage/title-generator";
import {
  GIFT_RESALE_DONOR_CALC_HREF,
  isGiftResaleDonorBasisEntry,
} from "@/lib/calc/gift-resale-101-2-donor-basis";

const addr = "서울특별시 종로구 세종대로 1";
// 수증자: 증여 취득 2026.2.1. / 증여자: 매매 취득 2019.5.1. — 주소·양도일은 같다
const donee = {
  assets: [{ addressRoad: addr, acquisitionCause: "gift", acquisitionDate: "2026-02-01" }],
  transferDate: "2026-04-05",
};
const donor = {
  assets: [{ addressRoad: addr, acquisitionCause: "purchase", acquisitionDate: "2019-05-01" }],
  transferDate: "2026-04-05",
  giftResaleDonorBasis: true,
};

function record(inputData: Record<string, unknown>, tax: number) {
  return {
    taxType: "transfer" as const,
    title: generateTitle("transfer", inputData, "2026-11-27T00:00:00.000Z"),
    inputData,
    resultData: { mode: "single", result: { determinedTax: tax } },
    taxLawVersion: "2026-04-05",
    linkedCalculationId: null,
    clientId: null,
  };
}

describe("§101② 증여자 기준 계산 — 이력 키 분리", () => {
  beforeEach(async () => {
    await resetLocalDB();
  });

  it("수증자 기준과 증여자 기준의 businessKey가 다르다", () => {
    const a = extractBusinessKey("transfer", donee);
    const b = extractBusinessKey("transfer", donor);
    expect(a).toBe(`addr:${addr}|2026.04.05`);
    expect(b).toBe(`addr:${addr}|2026.04.05|101-2-donor`);
  });

  it("차례로 자동 저장하면 record 2건이 공존한다(수증자 기준 이력 보존)", async () => {
    const repo = createCalculationRepository("user-101-2");
    const r1 = await repo.saveOrUpdateByBusinessKey(record(donee, 36_250_000));
    const r2 = await repo.saveOrUpdateByBusinessKey(record(donor, 13_704_000));
    expect(r1.created).toBe(true);
    expect(r2.created).toBe(true);
    expect(r2.id).not.toBe(r1.id);
    const all = await repo.list();
    expect(all).toHaveLength(2);
    const doneeRec = await repo.get(r1.id);
    expect((doneeRec!.resultData as { result: { determinedTax: number } }).result.determinedTax).toBe(36_250_000);
  });

  it("같은 증여자 기준을 다시 계산하면 그 record만 갱신한다(같은 물건 1건 규칙 유지)", async () => {
    const repo = createCalculationRepository("user-101-2");
    await repo.saveOrUpdateByBusinessKey(record(donee, 36_250_000));
    const r2 = await repo.saveOrUpdateByBusinessKey(record(donor, 13_704_000));
    const r3 = await repo.saveOrUpdateByBusinessKey(record(donor, 13_000_000));
    expect(r3.created).toBe(false);
    expect(r3.id).toBe(r2.id);
    expect(await repo.list()).toHaveLength(2);
  });

  it("증여자 기준 수정신고는 수증자 기준 수정신고와 키가 다르다", () => {
    const a = extractBusinessKey("transfer", { ...donee, amendmentMode: true });
    const b = extractBusinessKey("transfer", { ...donor, amendmentMode: true });
    expect(a).toBe(`addr:${addr}|2026.04.05|amend`);
    expect(b).toBe(`addr:${addr}|2026.04.05|101-2-donor|amend`);
  });

  it("이력 제목에 «증여자 기준»이 붙는다", () => {
    expect(generateTitle("transfer", donor, "2026-11-27T00:00:00.000Z")).toBe(
      `양도소득세 (증여자 기준) — ${addr} (양도 2026.04.05)`,
    );
    expect(generateTitle("transfer", donee, "2026-11-27T00:00:00.000Z")).not.toContain("증여자 기준");
  });

  it("판정 화면 2호 링크는 증여자 기준 진입 신호를 싣는다", () => {
    const search = GIFT_RESALE_DONOR_CALC_HREF.slice(GIFT_RESALE_DONOR_CALC_HREF.indexOf("?"));
    expect(new URLSearchParams(search).get("new")).toBe("1");
    expect(isGiftResaleDonorBasisEntry(search)).toBe(true);
    expect(isGiftResaleDonorBasisEntry("?new=1")).toBe(false);
  });
});
