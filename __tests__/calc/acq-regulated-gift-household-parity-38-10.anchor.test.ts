/**
 * anchor — 「취득 당시 조정대상지역」 표시 정합 (결정 #38-10)
 *
 * 증여받은 주택의 「취득 당시」는 엔진 `resolveWasRegulatedAtAcquisition`이 **후보일·결합 방식**으로 정한다
 * (`one-house/gift-household-basis.ts`): 계속 같은 세대 확인 → [세대 보유 시작일, 증여일] 둘 다 지정 중일 때만 / 별도 세대 → [증여일] /
 * 미확인 → [증여일, 증여자 취득일] 하나라도. 종전 계산기의 Step4 자동 판정·⑤ §155⑳ 카드·⑧·④ boolean은 단일 기준일(증여일 또는 시작일)만 읽어
 * 거울상(시작일에만 지정 중)·통산 시 반대 방향(시작일엔 비지정·증여일엔 지정 중)·미확인에서 엔진과 반대 값을 「자동」이라며 보였다.
 *
 * **엔진 정답은 ④가 실제로 보낸 본문**(captureBody → Zod `propertySchema` → `buildTransferEngineInput`)에서 뽑는다 — 화면 leaf를 정답으로 쓰지 않는다.
 * 서울 마포(1144010100) — 2017-08-03 지정 · 2023-01-05 해제.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | P-1 | 이월과세 격자 | ④ boolean · ⑤⑧ 실효값 · Step4 자동 판정 · Step4 거주요건 입력이 모두 엔진과 같다(시작일 × 증여일 × 증여자 취득일 × 답) |
 * | P-2 | 일반 증여 격자 | 같은 5개 값이 엔진과 같다(예·아니오 × 시작일 × 증여일) |
 * | P-3 | 구별력 | 격자에 「단일 기준일이면 엔진과 갈리는 칸」이 실제로 있다(공허한 일치가 아니다) |
 * | P-4 | 게이트 | 다건 임베드·2번째 자산·용도변경 주택은 basis를 만들지 않는다 — 엔진도 증여 세대 사실을 받지 않는다 |
 */
import { describe, it, expect } from "vitest";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { buildTransferEngineInput } from "@/app/api/calc/transfer/engine-input";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import {
  calcEffectiveWasRegulatedAtAcquisition,
  calcGiftHouseholdBasis,
  calcResidenceJudgmentDate,
  regulatedVerdictForAcquisition,
  regulatedVerdictForDisplay,
} from "@/lib/calc/effective-regulated-at-acquisition";
import { buildResidenceReqInput } from "@/lib/calc/transfer-tax-api";
import { resolveWasRegulatedAtAcquisition } from "@/lib/tax-engine/transfer-tax-exemption-holding";
import { carryoverGiftHouseholdBasis } from "@/lib/tax-engine/one-house/gift-household-basis";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { captureBody } from "./_one-house-pr3a-calc-route";

const MAPO = "1144010100";
const PRIMARY = { isPrimary: true } as const;

const baseForm = (asset: AssetForm): TransferFormData =>
  ({
    ...createDefaultTransferFormData(),
    assets: [asset],
    transferDate: "2026-02-16",
    contractTotalPrice: "900000000",
    isOneHousehold: true,
    householdHousingCount: "1",
  }) as TransferFormData;

const carryoverAsset = (sh: "" | "yes" | "no", start: string, gift: string, donorAcq: string): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    addressJibun: "서울 마포구 테스트동 1-1",
    regionCode: MAPO,
    acquisitionCause: "carryover_gift",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: gift,
      donorAcquisitionDate: donorAcq,
      donorRelation: "spouse",
      giftDateValuation: "600000000",
      donorAcquisitionPrice: "200000000",
      donorSameHousehold: sh,
      donorHouseholdHoldingStartDate: start,
    },
  }) as AssetForm;

const generalGiftAsset = (sh: "yes" | "no", start: string, gift: string, donorAcq: string): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    addressJibun: "서울 마포구 테스트동 1-1",
    regionCode: MAPO,
    acquisitionCause: "gift",
    acquisitionDate: gift,
    fixedAcquisitionPrice: "600000000",
    donorAcquisitionDate: donorAcq,
    giftDonorRelation: "lineal",
    giftSameHousehold: sh,
    giftHouseholdHoldingStartDate: start,
  }) as AssetForm;

/** ④ 본문 → ⑫ Zod → ⑭ 엔진 입력에서 **엔진이 실제로 쓰는** 취득 당시 조정대상지역을 뽑는다. */
async function engineTruth(form: TransferFormData): Promise<{ truth: boolean; bodyBoolean: boolean }> {
  const body = await captureBody(form);
  const parsed = propertySchema.safeParse(body);
  if (!parsed.success) throw new Error("④ 본문이 ⑫를 통과하지 못했다: " + JSON.stringify(parsed.error.issues.slice(0, 3)));
  const data = parsed.data;
  const input = buildTransferEngineInput(
    data,
    toDate(data.transferDate, "transferDate"),
    toDate(data.acquisitionDate, "acquisitionDate"),
    toOptionalDate(data.assetContractDate),
  );
  const basis = input.carryoverTaxation ? carryoverGiftHouseholdBasis(input.carryoverTaxation, true) : input.giftHouseholdBasis;
  const truth = resolveWasRegulatedAtAcquisition({
    regionCode: input.regionCode,
    regionInDesignatedDistrict: input.regionInDesignatedDistrict,
    acquisitionDate: input.acquisitionDate,
    wasRegulatedAtAcquisition: input.wasRegulatedAtAcquisition,
    giftHouseholdBasis: basis,
  } as never);
  return { truth, bodyBoolean: data.wasRegulatedAtAcquisition };
}

/** 화면 쪽 네 갈래가 읽는 값. */
function screenValues(form: TransferFormData) {
  const a = form.assets[0];
  const date = calcResidenceJudgmentDate(a);
  const basis = calcGiftHouseholdBasis(a, PRIMARY);
  return {
    // ⑤ §155⑳ 카드·⑧ — 실효값
    effective: calcEffectiveWasRegulatedAtAcquisition(a, false, form.regionCode, PRIMARY),
    // Step4 ② 자동 판정 카드
    verdict: regulatedVerdictForAcquisition({ regionCode: a.regionCode, date, giftHouseholdBasis: basis })?.isRegulated,
    // Step4 거주요건 입력(`residenceShortfall`)이 읽는 엔진 입력 — Step4는 취득일이 있을 때만 이 빌더를 부른다(이월과세 카드는 취득일 칸이 없다).
    //   이월과세는 가상의 취득일(= 증여 등기접수일)을 채운 사본으로 같은 빌더를 시험한다.
    residenceInput: resolveWasRegulatedAtAcquisition(
      buildResidenceReqInput(
        a.acquisitionDate ? form : { ...form, assets: [{ ...a, acquisitionDate: a.carryover?.giftRegistryDate ?? "" } as AssetForm] },
      ),
    ),
    // 종전 — 단일 기준일 판정(구별력 확인용)
    singleDate: regulatedVerdictForDisplay({ regionCode: a.regionCode, date })?.isRegulated,
  };
}

type Cell = { sh: "" | "yes" | "no"; start: string; gift: string; donorAcq: string };
const nonRegStart = "2016-01-01"; // 지정 전
const regStart = "2018-01-10"; // 지정 중
const regGift = "2022-06-01"; // 지정 중
const nonRegGift = "2023-06-01"; // 해제 뒤

const carryoverCells: Cell[] = [];
for (const gift of [regGift, nonRegGift])
  for (const donorAcq of ["2010-01-01", "2018-01-01"]) {
    carryoverCells.push({ sh: "no", start: "", gift, donorAcq });
    carryoverCells.push({ sh: "", start: "", gift, donorAcq });
    for (const start of [nonRegStart, regStart]) {
      if (start < donorAcq) continue; // ⑧이 막는 범위 밖 시작일
      carryoverCells.push({ sh: "yes", start, gift, donorAcq });
    }
  }
const generalCells: Cell[] = [];
for (const gift of [regGift, nonRegGift])
  for (const donorAcq of ["2010-01-01", "2018-01-01"]) {
    generalCells.push({ sh: "no", start: "", gift, donorAcq });
    for (const start of [nonRegStart, regStart]) {
      if (start < donorAcq) continue;
      generalCells.push({ sh: "yes", start, gift, donorAcq });
    }
  }

describe("P-1 이월과세 — 화면 값이 ④가 보낸 본문에서 엔진이 읽는 값과 같다", () => {
  for (const c of carryoverCells) {
    it(`[P-1] ${c.sh || "미답"} 시작일=${c.start || "-"} 증여일=${c.gift} 증여자취득=${c.donorAcq}`, async () => {
      const form = baseForm(carryoverAsset(c.sh, c.start, c.gift, c.donorAcq));
      const { truth, bodyBoolean } = await engineTruth(form);
      const s = screenValues(form);
      expect(s.verdict, "Step4 자동 판정").toBe(truth);
      expect(s.effective, "⑤⑧ 실효값").toBe(truth);
      expect(bodyBoolean, "④ boolean").toBe(truth);
      expect(s.residenceInput, "Step4 거주요건 입력").toBe(truth);
    });
  }
});

describe("P-2 일반 증여 — 같은 값이다", () => {
  for (const c of generalCells) {
    it(`[P-2] ${c.sh} 시작일=${c.start || "-"} 증여일=${c.gift} 증여자취득=${c.donorAcq}`, async () => {
      const form = baseForm(generalGiftAsset(c.sh as "yes" | "no", c.start, c.gift, c.donorAcq));
      const { truth, bodyBoolean } = await engineTruth(form);
      const s = screenValues(form);
      expect(s.verdict, "Step4 자동 판정").toBe(truth);
      expect(s.effective, "⑤⑧ 실효값").toBe(truth);
      expect(bodyBoolean, "④ boolean").toBe(truth);
      expect(s.residenceInput, "Step4 거주요건 입력").toBe(truth);
    });
  }
});

describe("P-3 구별력 — 단일 기준일이면 엔진과 갈리는 칸이 실제로 있다", () => {
  it("[P-3a] 이월과세 거울상(시작일 지정 중 · 증여일 해제 뒤) · 일반 증여 반대 방향(시작일 비지정 · 증여일 지정 중)", async () => {
    const mirror = baseForm(carryoverAsset("yes", regStart, nonRegGift, "2010-01-01"));
    const m = await engineTruth(mirror);
    expect(m.truth).toBe(false);
    expect(screenValues(mirror).singleDate, "종전 단일 기준일(세대 보유 시작일)은 엔진과 반대").toBe(true);

    const reverse = baseForm(generalGiftAsset("yes", nonRegStart, regGift, "2010-01-01"));
    const r = await engineTruth(reverse);
    expect(r.truth).toBe(false);
    expect(screenValues(reverse).singleDate, "종전 단일 기준일(증여일)은 엔진과 반대").toBe(true);
  });
  it("[P-3b] 미답(미확인) 이월과세 — 증여자 취득일에만 지정 중이면 엔진은 해당, 단일 기준일은 미해당", async () => {
    const f = baseForm(carryoverAsset("", "", nonRegGift, "2018-01-01"));
    const e = await engineTruth(f);
    expect(e.truth).toBe(true);
    expect(screenValues(f).singleDate).toBe(false);
    expect(screenValues(f).verdict).toBe(true);
  });
  it("[P-3c] 긍정 짝 — 증여일·시작일이 같은 쪽이면 격자 전체가 갈리지 않는다(셋 모두 지정 중)", async () => {
    const f = baseForm(carryoverAsset("yes", regStart, regGift, "2010-01-01"));
    const e = await engineTruth(f);
    expect(e.truth).toBe(true);
    expect(screenValues(f).singleDate).toBe(true);
    expect(screenValues(f).verdict).toBe(true);
  });
});

describe("P-4 게이트 — 엔진이 증여 세대 사실을 받지 않는 위치(2번째 이후 자산)는 basis를 만들지 않는다", () => {
  const reverse = () => generalGiftAsset("yes", nonRegStart, regGift, "2010-01-01");
  it("[P-4a] 2번째 자산이면 basis 없음(단일 기준일) · 첫 자산이면 있다(짝) — 다건 임베드도 #38-3 이후 첫 자산은 같다", () => {
    expect(calcGiftHouseholdBasis(reverse(), PRIMARY)).toBeDefined();
    expect(calcGiftHouseholdBasis(reverse(), { isPrimary: false })).toBeUndefined();
    expect(calcEffectiveWasRegulatedAtAcquisition(reverse(), false, undefined, { isPrimary: false })).toBe(true);
    expect(calcEffectiveWasRegulatedAtAcquisition(reverse(), false, undefined, PRIMARY)).toBe(false);
    // scope 인자를 안 주는 호출부도 종전 그대로
    expect(calcEffectiveWasRegulatedAtAcquisition(reverse(), false)).toBe(true);
  });
  it("[P-4b] 용도변경 주택은 엔진이 용도변경일을 먼저 보므로 basis를 만들지 않는다", () => {
    const a = { ...reverse(), hasNonHousingConversion: true, residentialUseStartDate: "2022-07-01" } as AssetForm;
    expect(calcGiftHouseholdBasis(a, PRIMARY)).toBeUndefined();
  });
  it("[P-4c] 답이 없거나 ⑧이 막는 사실(시작일 범위 밖)은 싣지 않는다 — ④와 같다", () => {
    expect(calcGiftHouseholdBasis({ ...reverse(), giftSameHousehold: "" } as AssetForm, PRIMARY)).toBeUndefined();
    expect(calcGiftHouseholdBasis({ ...reverse(), giftHouseholdHoldingStartDate: regGift } as AssetForm, PRIMARY)).toBeUndefined();
  });
});
