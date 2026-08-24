/**
 * anchor — F16 · A-8(V-10) 컴패니언 전용 안분 키 필드 + ⑧↔⑩ 교차 매트릭스.
 *
 * ## 결함 (계획서 D-5)
 *
 * 컴패니언에서 `standardPriceAtTransfer`는 **두 역할을 겸했다**:
 *   ① §166⑥ 일괄양도 **안분 키**(사용자가 자산 카드에 입력한 「양도시 기준시가」)
 *   ② §97①1호나목 **환산 분모**(이월과세 general 환산에서는 **증여자**의 양도시 기준시가)
 *
 * ④ `buildAssetPayload`의 `...cp.topLevelOverrides`가 명시 키 뒤에 있어 ②가 ①을 덮어썼다.
 * ⇒ 사용자가 입력한 안분 키가 payload에서 **증여자 기준시가로 치환**되어 일괄 안분이 통째로
 *   어긋났다. ⑧은 `[]`, ⑫는 success=true — **오류 없이 조용히 틀린 세액**이다.
 *
 * ⛔ 「스프레드 순서만 바꾼다」는 금지다(계획서 A-8) — `standardPriceAtAcquisition:`의 `purchase`
 *    게이트가 환산 **분자**를 `undefined`로 지워 지금보다 나빠진다. 정정은 **전용 필드 분리**이고,
 *    주 자산이 이미 폼-전역 `standardPriceAtTransferForApportion`으로 쓰는 것과 **같은 방식**이다.
 *
 * ## 수정 전/후 실측 (아래 EST 픽스처, route POST · `makeMockRates`)
 *   안분 키 400,000,000(사용자) · 환산 분모 222,222,222(증여자)
 *   · 수정 전(= 안분 키가 증여자 값으로 치환): 컴패니언 양도가액 327,272,727 · 합산 결정세액 295,471,818
 *   · 수정 후(= 전용 키 유지):                컴패니언 양도가액 514,285,714 · 합산 결정세액 290,610,000
 *   ⇒ D-5의 세액 크기(계획서 V-2) = **4,861,818**
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-helpers";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => vi.unstubAllGlobals());

// ─── 폼 픽스처 ───────────────────────────────────────────────────

const CARRYOVER_FULL: CarryoverTaxationForm = {
  giftRegistryDate: "2021-06-01",
  donorAcquisitionDate: "2005-01-01",
  donorAcquisitionCause: "purchase" as const,
  useEstimatedAcquisition: false,
  estimationMode: null,
  donorStandardPriceAtAcquisition: "",
  donorStandardPriceAtTransfer: "",
  donorAcquisitionPrice: "100,000,000",
  giftTaxAmount: "30,000,000",
  giftTaxCalculated: "",
  giftTaxBase: "",
  donorCapitalExpenditure: "",
  giftDateValuation: "300,000,000",
  donorRelation: "spouse" as const,
  donorDeceased: false,
  exclusionDeclared: {
    expropriationWithin2Years: false,
    oneHouseExemptionApplies: false,
    isFamilyBusinessInheritedAsset: false,
  },
};

/** 일반 기준시가 환산(§97①1호나목) — 증여자 축 기준시가 2개 */
const CARRYOVER_ESTIMATED: CarryoverTaxationForm = {
  ...CARRYOVER_FULL,
  useEstimatedAcquisition: true,
  estimationMode: "general" as const,
  donorStandardPriceAtAcquisition: "111,111,111",
  donorStandardPriceAtTransfer: "222,222,222",
  donorAcquisitionPrice: "",
};

/** 사용자가 자산 카드에 입력한 §166⑥ 안분 키 */
const USER_APPORTION_KEY = 400_000_000;
/** 증여자의 양도시 기준시가 — §97①1호나목 환산 분모 */
const DONOR_STD_AT_TRANSFER = 222_222_222;

function bundledForm(carryover: CarryoverTaxationForm): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2024-03-01";
  f.contractTotalPrice = "1,800,000,000";
  f.bundledSaleMode = "apportioned";
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "land",
    landNature: "standalone",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-01-01",
    fixedAcquisitionPrice: "500,000,000",
    standardPriceAtTransfer: "1,000,000,000",
  } as AssetForm;
  f.assets.push({
    ...makeDefaultAsset(2),
    assetKind: "housing",
    acquisitionCause: "carryover_gift",
    acquisitionDate: "2021-06-01",
    standardPriceAtTransfer: "400,000,000",
    carryover,
  } as AssetForm);
  return f;
}

function captureBody(form: TransferFormData) {
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

async function companionPayload(form: TransferFormData) {
  const cap = captureBody(form);
  await cap.run();
  const body = cap.get() as { companionAssets?: Record<string, unknown>[] } | null;
  return { body, companion: body?.companionAssets?.[0] };
}

describe("F16 A-8 — §166⑥ 안분 키 ↔ §97①1호나목 환산 분모 역할 분리", () => {
  it("④ payload가 두 역할을 **동시에** 싣는다 (한쪽이 다른 쪽을 덮지 않는다)", () => {
    const asset = {
      ...makeDefaultAsset(2),
      assetKind: "housing" as const,
      acquisitionCause: "carryover_gift" as const,
      acquisitionDate: "2021-06-01",
      standardPriceAtTransfer: "400,000,000",
      carryover: CARRYOVER_ESTIMATED,
    };
    const payload = buildAssetPayload(asset as never, "apportioned", "2024-03-01") as Record<
      string,
      unknown
    >;

    // ② 환산 분모 — topLevelOverrides가 증여자 축으로 덮어쓴다(의도된 override)
    expect(payload.standardPriceAtTransfer).toBe(DONOR_STD_AT_TRANSFER);
    expect(payload.standardPriceAtAcquisition).toBe(111_111_111);
    expect(payload.useEstimatedAcquisition).toBe(true);

    // ① 안분 키 — 🔴 종전에는 이 값이 payload 어디에도 남지 않았다
    expect(payload.standardPriceAtTransferForApportion).toBe(USER_APPORTION_KEY);
  });

  it("④ 비-이월과세 자산은 두 키가 같은 값이다 (역할 분리가 기존 동작을 바꾸지 않는다)", () => {
    const asset = {
      ...makeDefaultAsset(2),
      assetKind: "housing" as const,
      acquisitionCause: "gift" as const,
      acquisitionDate: "2021-06-01",
      standardPriceAtTransfer: "400,000,000",
      fixedAcquisitionPrice: "300,000,000",
    };
    const payload = buildAssetPayload(asset as never, "apportioned", "2024-03-01") as Record<
      string,
      unknown
    >;
    expect(payload.standardPriceAtTransfer).toBe(USER_APPORTION_KEY);
    expect(payload.standardPriceAtTransferForApportion).toBe(USER_APPORTION_KEY);
  });

  it("⑧↔⑫ — 환산 모드 컴패니언이 안분 키를 유지한 채 Zod를 통과한다", async () => {
    const form = bundledForm(CARRYOVER_ESTIMATED);
    expect(collectStepIssues(0, form)).toEqual([]);

    const { body, companion } = await companionPayload(form);
    expect(companion!.standardPriceAtTransferForApportion).toBe(USER_APPORTION_KEY);
    expect(companion!.standardPriceAtTransfer).toBe(DONOR_STD_AT_TRANSFER);

    const parsed = propertySchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(parsed.data!.companionAssets![0]!.standardPriceAtTransferForApportion).toBe(
      USER_APPORTION_KEY,
    );
  });

  it("⑩ 안분 키 필수 검사는 **실제로 안분에 쓰이는 값**을 본다 (전용 키 ?? 구필드)", () => {
    const base = {
      propertyType: "land",
      transferPrice: 1_800_000_000,
      transferDate: "2024-03-01",
      acquisitionPrice: 500_000_000,
      acquisitionDate: "2010-01-01",
      acquisitionCause: "purchase",
      expenses: 0,
      useEstimatedAcquisition: false,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      isNonBusinessLand: false,
      isOneHousehold: false,
      reductions: [] as unknown[],
      annualBasicDeductionUsed: 0,
      totalSalePrice: 1_800_000_000,
      standardPriceAtTransferForApportion: 1_000_000_000,
    };
    const companion = {
      assetId: "c1",
      assetLabel: "주택",
      assetKind: "housing" as const,
      directExpenses: 0,
      reductions: [] as unknown[],
      acquisitionCause: "gift" as const,
      acquisitionDate: "2021-06-01",
      fixedAcquisitionPrice: 300_000_000,
    };

    // 전용 키만 — 통과
    expect(
      propertySchema.safeParse({
        ...base,
        companionAssets: [{ ...companion, standardPriceAtTransferForApportion: 400_000_000 }],
      }).success,
    ).toBe(true);

    // 구필드만 — 직접 호출자 하위호환으로 통과 (⑭ 안분도 같은 fallback을 쓴다)
    expect(
      propertySchema.safeParse({
        ...base,
        companionAssets: [{ ...companion, standardPriceAtTransfer: 400_000_000 }],
      }).success,
    ).toBe(true);

    // 둘 다 없음 — 차단
    const none = propertySchema.safeParse({ ...base, companionAssets: [companion] });
    expect(none.success).toBe(false);
    expect(
      none.error!.issues.some(
        (i) =>
          i.path.join(".") === "companionAssets.0.standardPriceAtTransferForApportion" &&
          i.message === "apportioned 모드: 양도시 기준시가 필수",
      ),
    ).toBe(true);
  });
});

// ─── ⑧↔⑩ 교차 매트릭스 ─────────────────────────────────────────

/**
 * 🔑 금지되는 것은 **「⑧ 통과 ↔ ⑩ 400」** 한 방향이다 — 사용자가 화면에서 끝까지 채웠는데
 *    서버가 거부하면 통과 경로가 없다(dead-end).
 *    반대 방향(⑧ 차단 ↔ ⑩ 통과)은 허용된다 — ⑧이 더 좁은 것은 화면 안내가 더 친절한 것뿐이고,
 *    실제로 그런 케이스가 있다: 환산 모드(`estimationMode`)는 **폼 전용 축**이라 payload에
 *    존재하지 않으므로 ⑩이 볼 수 없다(아래 EST-* 케이스).
 */
type Case = { name: string; over: Partial<CarryoverTaxationForm>; eight: "PASS" | "BLOCK" };

const CASES: Case[] = [
  { name: "완전입력(실가)", over: {}, eight: "PASS" },
  { name: "환산 general 완전입력", over: CARRYOVER_ESTIMATED, eight: "PASS" },
  { name: "증여 등기접수일 없음", over: { giftRegistryDate: "" }, eight: "BLOCK" },
  { name: "증여자 취득일 없음", over: { donorAcquisitionDate: "" }, eight: "BLOCK" },
  { name: "증여 당시 평가액 0", over: { giftDateValuation: "" }, eight: "BLOCK" },
  { name: "증여자 취득가액 0(환산 미사용)", over: { donorAcquisitionPrice: "" }, eight: "BLOCK" },
  { name: "관계 other", over: { donorRelation: "other" }, eight: "BLOCK" },
  { name: "사망 선언 + 관계 미선택", over: { donorDeceased: true, donorRelation: "" }, eight: "BLOCK" },
  {
    name: "가업상속공제 §97의2④",
    over: {
      exclusionDeclared: {
        ...CARRYOVER_FULL.exclusionDeclared,
        isFamilyBusinessInheritedAsset: true,
      },
    },
    eight: "BLOCK",
  },
  { name: "증여 등기일 >= 양도일", over: { giftRegistryDate: "2024-06-01" }, eight: "BLOCK" },
  { name: "증여자 취득일 >= 증여 등기일", over: { donorAcquisitionDate: "2022-01-01" }, eight: "BLOCK" },
  { name: "관계 lineal + 사망(§97의2① 배제)", over: { donorRelation: "lineal", donorDeceased: true }, eight: "PASS" },
  // EST-* — ⑧만 차단(환산 모드는 폼 전용 축이라 ⑩이 볼 수 없다)
  {
    name: "EST 환산 분모 없음",
    over: { ...CARRYOVER_ESTIMATED, donorStandardPriceAtTransfer: "" },
    eight: "BLOCK",
  },
  {
    name: "EST 모드 미선택",
    over: { ...CARRYOVER_ESTIMATED, estimationMode: null },
    eight: "BLOCK",
  },
];

describe("F16 A-3 — 컴패니언 이월과세 ⑧↔⑩ 교차 매트릭스", () => {
  it.each(CASES)("$name", async ({ over, eight }) => {
    const form = bundledForm({ ...CARRYOVER_FULL, ...over });
    const issues = collectStepIssues(0, form);
    const eightPass = issues.length === 0;
    expect(eightPass).toBe(eight === "PASS");

    const { body } = await companionPayload(form);
    const parsed = propertySchema.safeParse(body);

    // 🔴 금지 방향 — 화면은 통과시켰는데 서버가 400
    expect(eightPass && !parsed.success).toBe(false);

    if (eight === "PASS") expect(parsed.success).toBe(true);
  });

  it("⑧이 막는 항목은 ⑩도 같은 사유로 막는다 (EST-* 제외)", async () => {
    const serverAlsoBlocks = CASES.filter((c) => c.eight === "BLOCK" && !c.name.startsWith("EST"));
    expect(serverAlsoBlocks.length).toBe(9); // 대조군 — 케이스가 줄면 알아채야 한다

    for (const c of serverAlsoBlocks) {
      const form = bundledForm({ ...CARRYOVER_FULL, ...c.over });
      const { body } = await companionPayload(form);
      const parsed = propertySchema.safeParse(body);
      expect(parsed.success, `${c.name}: ⑩이 통과시켰다`).toBe(false);
      expect(
        parsed.error!.issues.every((i) => i.path[0] === "companionAssets"),
        `${c.name}: 컴패니언 경로가 아닌 오류`,
      ).toBe(true);
      vi.unstubAllGlobals();
    }
  });
});
