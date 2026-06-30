/**
 * 겸용주택 PHD + 1990.8.30. 이전 취득 토지 환산 결선 (effect→store 미러링 제거 회귀 가드)
 *
 * 과거 MixedUsePreHousingDisclosureSection의 useEffect가 pre1990 환산 ㎡당 가액을
 * phdLandPricePerSqmAtAcq에 주입했다. 제거 후에는 API 변환이 헬퍼로 직접 도출해야 한다.
 * 본 테스트는 phdLandPricePerSqmAtAcq·mixedAcqLandPricePerSqm 둘 다 비어 있어도
 * API body의 PHD landPricePerSqmAtAcquisition이 0이 아닌 환산값임을 보장한다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { derivePre1990PhdLandPricePerSqmAtAcq } from "@/lib/calc/transfer-pre1990-phd-bridge";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(() => vi.unstubAllGlobals());

function captureBody(form: ReturnType<typeof createDefaultTransferFormData>) {
  let captured: Record<string, unknown> | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      captured = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  return { run: () => callTransferTaxAPI(form), get: () => captured };
}

function mixedPre1990PhdForm() {
  const form = createDefaultTransferFormData();
  form.transferDate = "2024-05-01";
  form.contractTotalPrice = "1,500,000,000";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "housing",
    isMixedUseHouse: true,
    useEstimatedAcquisition: true,
    acquisitionDate: "1988-03-01", // < 1990-08-30
    // pre1990 토지등급 환산 입력
    pre1990Enabled: true,
    pre1990GradeMode: "number",
    pre1990Grade_current: "120",
    pre1990Grade_prev: "118",
    pre1990Grade_atAcq: "100",
    pre1990PricePerSqm_1990: "150,000",
    // 겸용 면적
    residentialFloorArea: "60",
    nonResidentialFloorArea: "40",
    mixedUseTotalLandArea: "200",
    // PHD §164⑤ 입력
    usePreHousingDisclosure: true,
    phdFirstDisclosureDate: "1995-01-01",
    phdFirstDisclosureHousingPrice: "300,000,000",
    phdBuildingStdPriceAtAcq: "100,000,000",
    phdLandPricePerSqmAtFirst: "2,000,000",
    phdLandPricePerSqmAtTransfer: "3,000,000",
    mixedTransferHousingPrice: "500,000,000",
    // ★ 취득시 토지 ㎡당 가액은 비워둠 — 과거 useEffect가 채우던 자리
    phdLandPricePerSqmAtAcq: "",
    mixedAcqLandPricePerSqm: "",
  };
  return form;
}

describe("[MIX-PRE1990-PHD] effect→store 미러링 제거 결선", () => {
  it("phdLandPricePerSqmAtAcq 빈 상태여도 API body PHD에 환산 ㎡당 가액이 도출 전달됨", async () => {
    const form = mixedPre1990PhdForm();
    const derived = derivePre1990PhdLandPricePerSqmAtAcq(form.assets[0], form.transferDate);
    expect(derived).not.toBeNull();
    expect(derived!).toBeGreaterThan(0);

    const { run, get } = captureBody(form);
    await run();
    const body = get()! as { mixedUse?: { preHousingDisclosure?: { landPricePerSqmAtAcquisition?: number } } };
    const phd = body.mixedUse?.preHousingDisclosure;
    expect(phd).toBeDefined();
    expect(phd!.landPricePerSqmAtAcquisition).toBe(derived);
  });

  it("pre1990 미활성 + 두 입력 모두 비면 PHD 토지가액 fallback 없음(0) — 도출값이 유일 공급원임을 입증", async () => {
    const form = mixedPre1990PhdForm();
    form.assets[0] = { ...form.assets[0], pre1990Enabled: false };
    const { run, get } = captureBody(form);
    await run();
    const body = get()! as { mixedUse?: { preHousingDisclosure?: unknown } };
    // landSqmAtAcq=0 → PHD 페이로드 가드(positive) 미충족 → preHousingDisclosure 미전송
    expect(body.mixedUse?.preHousingDisclosure).toBeUndefined();
  });
});
