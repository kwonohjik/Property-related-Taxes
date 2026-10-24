/**
 * anchor — 배율 초과 분리 카드·⑧ 메시지의 주택 종류 판정 `resolveHousingKind` (계획서 phd-appraisal-dead-end §9.6, 2026-10-24)
 *
 * 표시 문자열만 바꾼다 — ④ 본문은 이 판정과 무관해야 한다(바이트 불변).
 *   K1 판정 표 — 신호 4종(PHD 라디오 apartment · 주택 구분 명시 · 동·호 · 없음)과 우선순위
 *   K2 이름 3종(개별 · 공동 · 모름=병기)
 *   K3 ④ 본문 불변 — 같은 폼에서 표시 축(phdHousingType)만 달라도 body가 같다
 */
import { describe, it, expect, vi } from "vitest";
import {
  housingConvertedPriceName,
  housingDisclosedPriceName,
  housingFirstDisclosureDateNote,
  resolveHousingKind,
} from "@/lib/calc/phd-housing-term";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

describe("K1 resolveHousingKind", () => {
  const k = (o: Partial<AssetForm>) => resolveHousingKind(o as AssetForm);
  it("신호 없음 — 기본값(PHD 라디오 individual · 주택 구분 land)·필드 없음·undefined 자산은 모름", () => {
    const d = makeDefaultAsset(1);
    expect(d.phdHousingType).toBe("individual");
    expect(d.inheritanceAssetKind).toBe("land");
    expect(resolveHousingKind(d)).toBe("unknown");
    expect(k({ phdHousingType: undefined })).toBe("unknown");
    expect(resolveHousingKind(undefined)).toBe("unknown");
  });
  it("PHD 라디오 apartment / 주택 구분 명시 / 동·호 둘 다", () => {
    expect(k({ phdHousingType: "apartment" })).toBe("apartment");
    expect(k({ inheritanceAssetKind: "house_apart" })).toBe("apartment");
    expect(k({ inheritanceAssetKind: "house_individual" })).toBe("individual");
    expect(k({ addressDong: "101동", addressHo: "1204호" })).toBe("apartment");
  });
  it("동 또는 호 한쪽·공백뿐이면 신호가 아니다", () => {
    expect(k({ addressHo: "1204호" })).toBe("unknown");
    expect(k({ addressDong: "101동" })).toBe("unknown");
    expect(k({ addressDong: " ", addressHo: " " })).toBe("unknown");
  });
  it("우선순위 — PHD 라디오 apartment > 주택 구분 명시 > 동·호", () => {
    expect(k({ phdHousingType: "apartment", inheritanceAssetKind: "house_individual" })).toBe("apartment");
    expect(k({ inheritanceAssetKind: "house_individual", addressDong: "1동", addressHo: "1호" })).toBe("individual");
    expect(k({ phdHousingType: "individual", addressDong: "1동", addressHo: "1호" })).toBe("apartment");
  });
});

describe("K2 이름 3종", () => {
  it("개별 · 공동 · 모름(병기)", () => {
    expect(housingConvertedPriceName("individual")).toBe("환산 개별주택가격");
    expect(housingConvertedPriceName("apartment")).toBe("환산 공동주택가격");
    expect(housingConvertedPriceName("unknown")).toBe("환산 개별주택가격(공동주택은 환산 공동주택가격)");
    expect(housingDisclosedPriceName("individual")).toBe("개별주택가격");
    expect(housingDisclosedPriceName("apartment")).toBe("공동주택가격");
    expect(housingDisclosedPriceName("unknown")).toBe("개별주택가격(공동주택은 공동주택가격)");
    expect(housingFirstDisclosureDateNote("individual")).toBe("(2005-04-30)");
    expect(housingFirstDisclosureDateNote("apartment")).toBe("");
    expect(housingFirstDisclosureDateNote("unknown")).toBe("(개별주택은 2005-04-30)");
  });
});

describe("K3 ④ 본문 불변", () => {
  async function body(over: Partial<AssetForm>): Promise<string> {
    const cap: { body?: string } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        cap.body = String(init?.body);
        return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
      }),
    );
    const f = createDefaultTransferFormData();
    const form: TransferFormData = {
      ...f,
      transferDate: "2023-02-16",
      assets: [
        {
          ...makeDefaultAsset(1),
          assetKind: "housing",
          acquisitionCause: "purchase",
          acquisitionDate: "2000-03-01",
          transferPrice: "1000000000",
          acquisitionPrice: "300000000",
          addressJibun: "서울 테스트동 1",
          buildingFootprintArea: "53",
          appurtenantLandZone: "metropolitan_residential",
          acquisitionArea: "212",
          transferArea: "212",
          standardPriceAtAcq: "300000000",
          ...over,
        } as AssetForm,
      ],
    };
    await callTransferTaxAPI(form);
    vi.unstubAllGlobals();
    return cap.body!;
  }
  it("PHD 라디오(표시 축)가 apartment · individual · 없음이어도 body가 같다", async () => {
    const a = await body({ phdHousingType: "apartment" });
    const b = await body({ phdHousingType: "individual" });
    const c = await body({ phdHousingType: undefined });
    expect(a.length).toBeGreaterThan(100);
    expect(a).toBe(b);
    expect(a).toBe(c);
  });
});
