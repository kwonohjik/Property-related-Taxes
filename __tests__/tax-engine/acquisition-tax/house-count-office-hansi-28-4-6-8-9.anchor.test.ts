/**
 * S03-7 — 「지방세법 시행령」 §28의4⑥8·9호: 2024.1.10.~2027.12.31. 유상승계취득한 60㎡·3억원(수도권 6억원) 이하 오피스텔
 * (8호: 사용승인 신축 최초 유상승계 / 9호: 그 밖의 유상승계 + 취득일부터 60일 이내 임대등록)은 소유주택 수에서 제외한다.
 *
 * 종전에는 오피스텔 행의 「한시 특례」 토글이 ④에서 침묵 소실됐다(주택용 ②1~3호 선택지였고 OfficeAsset에 사실 칸이 없었다).
 * 실측 사례 — 조정·수도권 5억 매매 잔금 2025-06-01, 보유 오피스텔(시가표준액 2억, 취득 2025-03-01):
 *   종전 effectiveCount 2 · 8% · 취득세 40,000,000 → 8호 사실을 갖추면 1주택 1% · 5,000,000.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/acquisition/route";
import { buildAcquisitionTaxBody } from "@/lib/calc/acquisition-tax-api";
import { validateAcquisitionCrossFields } from "@/lib/calc/acquisition-tax-validate";
import { INITIAL_FORM, createOwnedHouseInfo, validateStep, type FormState, type OwnedHouseInfo } from "@/components/calc/acquisition/shared";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { ACQUISITION } from "@/lib/tax-engine/legal-codes";

function baseForm(over: Partial<FormState> = {}): FormState {
  return {
    ...INITIAL_FORM, propertyType: "housing", acquisitionCause: "purchase", acquiredBy: "individual",
    reportedPrice: "500000000", standardValue: "500000000", isRegulatedArea: true, isMetropolitanRegion: true,
    balancePaymentDate: "2025-06-01", houseCountAfter: "1", ...over,
  };
}
const office = (over: Partial<OwnedHouseInfo> = {}): OwnedHouseInfo => ({
  ...createOwnedHouseInfo("o1"), propertyType: "officetel", standardValue: "200000000", acquisitionDate: "2025-03-01", ...over,
});
/** 8호 사실을 모두 갖춘 행(수도권, 전용 50㎡, 취득당시가액 2억, 사용승인 2025-02-01) */
const NEW_BUILD = {
  isHansiBenefit: true, hansiBenefitType: "new_build", isMetropolitanRegion: true,
  officeExclusiveAreaSqm: "50", officeAcquisitionValue: "200000000", officeApprovalDate: "2025-02-01",
};
/** 9호 사실을 모두 갖춘 행(임대등록 2025-04-30 = 취득일 + 60일) */
const LEASE = {
  isHansiBenefit: true, hansiBenefitType: "lease_registered", isMetropolitanRegion: true,
  officeExclusiveAreaSqm: "50", officeAcquisitionValue: "200000000", officeLeaseRegisteredDate: "2025-04-30",
};

function issuesOf(form: FormState): string[] {
  const out: string[] = [];
  for (let s = 0; s <= 6; s++) {
    const a = validateStep(s, form); if (a) out.push(a);
    const b = validateAcquisitionCrossFields(s, form); if (b) out.push(b);
  }
  return out;
}
async function post(form: FormState) {
  const res = await POST(new NextRequest("http://localhost/api/calc/acquisition", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
    body: JSON.stringify(buildAcquisitionTaxBody(form)),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  const d = json?.data;
  return {
    status: res.status, error: json?.error,
    count: d?.houseCountDetail?.effectiveCount as number | undefined,
    reasons: (d?.houseCountDetail?.excludedDetails ?? []).map((x: { reason: string }) => x.reason) as string[],
    rate: d?.appliedRate as number | undefined, tax: d?.acquisitionTax as number | undefined,
  };
}
const withOffice = (o: Partial<OwnedHouseInfo>) => baseForm({ ownedHouses: [office(o)] });

describe("S03-7 ④→⑫→엔진 — 8호 신축 오피스텔 최초 유상승계", () => {
  it("[OH-1] 사실을 갖추면 주택 수에서 빠져 1주택 1% · 5,000,000 (종전 2주택 8% · 40,000,000)", async () => {
    const base = await post(withOffice({}));
    expect([base.count, base.rate, base.tax]).toEqual([2, 0.08, 40_000_000]);
    const r = await post(withOffice(NEW_BUILD));
    expect(r.status).toBe(200);
    expect(r.reasons).toContain("hansi_new_build_office");
    expect([r.count, r.rate, r.tax]).toEqual([1, 0.01, 5_000_000]);
  });

  it("[OH-2] 부정 짝 — 면적 60㎡ 초과 · 수도권 한도 6억 초과 · 사용승인 기간 전 · 취득 기간 밖은 제외하지 않는다", async () => {
    for (const o of [
      { officeExclusiveAreaSqm: "60.01" },
      { officeAcquisitionValue: "600000001" },
      { officeApprovalDate: "2023-12-31" },
      { acquisitionDate: "2028-01-01", officeApprovalDate: "2027-12-31" },
    ]) {
      const r = await post(withOffice({ ...NEW_BUILD, ...o }));
      expect(r.reasons, JSON.stringify(o)).not.toContain("hansi_new_build_office");
      expect(r.tax, JSON.stringify(o)).toBe(40_000_000);
    }
  });

  it("[OH-3] 경계 — 60㎡ · 수도권 6억 · 사용승인 2024-01-10은 제외, 수도권 외는 3억까지", async () => {
    expect((await post(withOffice({ ...NEW_BUILD, officeExclusiveAreaSqm: "60", officeAcquisitionValue: "600000000", officeApprovalDate: "2024-01-10", acquisitionDate: "2024-01-10" }))).reasons).toContain("hansi_new_build_office");
    const nonMetro = { isMetropolitanRegion: false };
    expect((await post(withOffice({ ...NEW_BUILD, ...nonMetro, officeAcquisitionValue: "300000000" }))).reasons).toContain("hansi_new_build_office");
    expect((await post(withOffice({ ...NEW_BUILD, ...nonMetro, officeAcquisitionValue: "300000001" }))).reasons).not.toContain("hansi_new_build_office");
  });
});

describe("S03-7 ④→⑫→엔진 — 9호 유상승계 + 60일 내 임대등록", () => {
  it("[OH-4] 취득일부터 60일 이내 등록이면 제외 · 61일이면 제외하지 않는다 · 취득 전 등록도 제외하지 않는다", async () => {
    const ok = await post(withOffice(LEASE));
    expect(ok.reasons).toContain("hansi_lease_office");
    expect([ok.count, ok.rate, ok.tax]).toEqual([1, 0.01, 5_000_000]);
    expect((await post(withOffice({ ...LEASE, officeLeaseRegisteredDate: "2025-05-01" }))).reasons).not.toContain("hansi_lease_office");
    expect((await post(withOffice({ ...LEASE, officeLeaseRegisteredDate: "2025-02-28" }))).reasons).not.toContain("hansi_lease_office");
  });

  it("[OH-5] 단서 — 임대의무기간 중 임대 외 용도·매각·증여·말소면 제외하지 않는다", async () => {
    const r = await post(withOffice({ ...LEASE, officeLeaseObligationViolated: true }));
    expect(r.reasons).not.toContain("hansi_lease_office");
    expect(r.tax).toBe(40_000_000);
  });

  it("[OH-6] 호별 사실만 싣는다 — 8호 선언에 임대등록일이 있어도, 9호 선언에 사용승인일이 있어도 서로의 요건을 대신하지 못한다", async () => {
    expect((await post(withOffice({ ...NEW_BUILD, officeApprovalDate: "", officeLeaseRegisteredDate: "2025-04-01" }))).status).toBe(400);
    expect((await post(withOffice({ ...LEASE, officeLeaseRegisteredDate: "", officeApprovalDate: "2025-02-01" }))).status).toBe(400);
  });
});

describe("S03-7 ⑧ — 선언을 켰으면 사실을 받는다 / 꺼져 있으면 막지 않는다", () => {
  it("[OH-7] 완전한 선언은 통과, 사실 누락·주택용 유형 잔존은 차단", () => {
    expect(issuesOf(withOffice(NEW_BUILD))).toEqual([]);
    expect(issuesOf(withOffice(LEASE))).toEqual([]);
    expect(issuesOf(withOffice({ ...NEW_BUILD, officeExclusiveAreaSqm: "" })).join()).toContain("전용면적");
    expect(issuesOf(withOffice({ ...NEW_BUILD, officeAcquisitionValue: "" })).join()).toContain("취득당시가액");
    expect(issuesOf(withOffice({ ...NEW_BUILD, officeApprovalDate: "" })).join()).toContain("사용승인일");
    expect(issuesOf(withOffice({ ...LEASE, officeLeaseRegisteredDate: "" })).join()).toContain("임대주택 등록일");
    expect(issuesOf(withOffice({ ...NEW_BUILD, hansiBenefitType: "unsold_apt" })).join()).toContain("⑥8호");
    expect(issuesOf(withOffice({ ...NEW_BUILD, hansiBenefitType: "" })).join()).toContain("⑥9호");
  });

  it("[OH-8] 선언 OFF의 stale 사실과 주택 행은 막지 않는다", () => {
    expect(issuesOf(withOffice({ isHansiBenefit: false, hansiBenefitType: "new_build" }))).toEqual([]);
    expect(issuesOf(baseForm({ ownedHouses: [{ ...office(NEW_BUILD), propertyType: "housing", officeExclusiveAreaSqm: "" }] }))).toEqual([]);
  });
});

describe("S03-7 법령 상수", () => {
  it("[OH-9] 인용 상수는 ⑥8호·⑥9호이고, 결과 legalBasis에 실린다", async () => {
    expect(ACQUISITION.HOUSE_COUNT_OFFICE_HANSI_NEW_BUILD).toBe("지방세법 시행령 §28의4⑥8호");
    expect(ACQUISITION.HOUSE_COUNT_OFFICE_HANSI_LEASE).toBe("지방세법 시행령 §28의4⑥9호");
    const res = await POST(new NextRequest("http://localhost/api/calc/acquisition", {
      method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(buildAcquisitionTaxBody(withOffice(NEW_BUILD))),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = ((await res.json()) as any).data;
    const bases = (d.houseCountDetail.excludedDetails as { legalBasis: string }[]).map((x) => x.legalBasis);
    expect(bases).toContain(ACQUISITION.HOUSE_COUNT_OFFICE_HANSI_NEW_BUILD);
  });
});
