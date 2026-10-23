/**
 * PHD(§164⑦) 플래그 × 환산이 아닌 취득가액 방식 — ④⑤⑧ 파이프라인 anchor 공용 픽스처.
 * 계획서: docs/00-pm/phd-appraisal-dead-end.plan.md (§1 재현 · §8 격자)
 *
 * 대표 셀(단건): 취득 2003-01-10 · 양도 2026-03-01 · 양도가 10억 · 2주택(일반과세) · 감정가액 3억 · 취득시 기준시가 2억/양도시 4억(직접 입력) ·
 * PHD 11칸(최초공시 2005-04-30 · 최초 개별주택가격 1억 · 토지 100㎡ · 취득시 ㎡당 100만/건물 6천만 · 최초시 110만/6,100만 · 양도시 주택 4억 · ㎡당 240만/건물 1.6억).
 */
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { buildMultiBody, postMulti } from "./_helpers/single-multi-route-parity";

export type PhdPath = "single" | "companion" | "multi";

export const PHD_TRANSFER_DATE = "2026-03-01";

/** 취득가액 산정 방식 — 플래그 조합(우선순위 매매사례 > 감정 > 환산 > 실거래가) */
export const PHD_METHODS: [string, Partial<AssetForm>][] = [
  ["actual", { useEstimatedAcquisition: false, isAppraisalAcquisition: false, isSalesCaseAcquisition: false }],
  ["est", { useEstimatedAcquisition: true, isAppraisalAcquisition: false, isSalesCaseAcquisition: false }],
  ["app", { useEstimatedAcquisition: false, isAppraisalAcquisition: true, isSalesCaseAcquisition: false }],
  ["sales", { useEstimatedAcquisition: false, isAppraisalAcquisition: false, isSalesCaseAcquisition: true }],
  ["est+app", { useEstimatedAcquisition: true, isAppraisalAcquisition: true, isSalesCaseAcquisition: false }],
  ["est+sales", { useEstimatedAcquisition: true, isAppraisalAcquisition: false, isSalesCaseAcquisition: true }],
  ["app+sales", { useEstimatedAcquisition: false, isAppraisalAcquisition: true, isSalesCaseAcquisition: true }],
  ["all3", { useEstimatedAcquisition: true, isAppraisalAcquisition: true, isSalesCaseAcquisition: true }],
];
/** 방식 → 환산인가(우선순위 파생 — 테스트 기대값. 구현과 독립적으로 쓴다) */
export const phdMethodIsEstimated = (id: string): boolean => id === "est" || id === "est+app" ? id === "est" : id === "est+sales" ? false : false;

export const PHD_ELEVEN: Partial<AssetForm> = {
  phdFirstDisclosureDate: "2005-04-30",
  phdFirstDisclosureHousingPrice: "100000000",
  phdLandPricePerSqmAtAcq: "1000000",
  phdLandPricePerSqmAtFirst: "1100000",
  phdLandPricePerSqmAtTransfer: "2400000",
  phdBuildingStdPriceAtAcq: "60000000",
  phdBuildingStdPriceAtFirst: "61000000",
  phdBuildingStdPriceAtTransfer: "160000000",
  phdTransferHousingPrice: "400000000",
  acquisitionArea: "100",
  transferArea: "100",
};
export const PHD_STATES: [string, Partial<AssetForm>][] = [
  ["off", { usePreHousingDisclosure: false }],
  ["flag", { usePreHousingDisclosure: true }],
  ["full", { usePreHousingDisclosure: true, ...PHD_ELEVEN }],
];
export const PHD_STD: [string, Partial<AssetForm>][] = [
  ["std", { standardPriceAtAcq: "200000000", standardPriceAtTransfer: "400000000" }],
  ["nostd", { standardPriceAtAcq: "", standardPriceAtTransfer: "" }],
];
export const PHD_SHARE: [string, Partial<AssetForm>][] = [
  ["s100", { ownershipNumerator: "100", ownershipDenominator: "100" }],
  ["s50", { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" }],
];

/** 방식 무관 공통 금액 — 감정가액·실거래가 취득가액(fixed)·매매사례가액 모두 3억 */
export const PHD_BASE_ASSET: Partial<AssetForm> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2003-01-10",
  actualSalePrice: "1000000000",
  addressJibun: "서울특별시 테스트구 1",
  fixedAcquisitionPrice: "300000000",
  similarSalesValue: "300000000",
  standardPriceAtAcq: "200000000",
  standardPriceAtTransfer: "400000000",
  ownershipNumerator: "100",
  ownershipDenominator: "100",
};

export function phdForm(assetOver: Partial<AssetForm> = {}, formOver: Partial<TransferFormData> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = PHD_TRANSFER_DATE;
  f.contractTotalPrice = "1000000000";
  f.isOneHousehold = false;
  f.householdHousingCount = "2";
  f.householdNoOtherHousesConfirmed = true;
  f.householdNoPresaleRightsConfirmed = true;
  Object.assign(f.assets[0], PHD_BASE_ASSET, assetOver);
  Object.assign(f, formOver);
  return f;
}

/** 함께 양도 — 첫 자산이 PHD 호스트, 둘째 자산은 환산(기본) 또는 `secondOver` */
export function phdBundledForm(firstOver: Partial<AssetForm> = {}, secondOver: Partial<AssetForm> = {}): TransferFormData {
  const base = (id: number, over: Partial<AssetForm>) =>
    ({
      ...makeDefaultAsset(id),
      addressJibun: "서울 강남구 테스트동 1-1",
      assetId: `asset-fixed-${id}`, // makeDefaultAsset 의 Date.now() id — 본문·응답 해시가 비결정이 되지 않게 고정
      ...PHD_BASE_ASSET,
      useEstimatedAcquisition: true,
      standardPriceAtTransfer: "1000000001",
      ...over,
    }) as AssetForm;
  return {
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    assets: [base(1, firstOver), base(2, { acquisitionDate: "2021-06-01", ...secondOver })],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1000000000",
    totalTransferExpense: "0",
    householdHousingCount: "2",
    isOneHousehold: false,
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
  } as unknown as TransferFormData;
}

export function allPhdIssues(form: TransferFormData) {
  const out: { step: number; field?: string; message: string; assetIndex?: number }[] = [];
  for (let s = 0; s <= 5; s++) for (const i of collectStepIssues(s, form)) out.push({ step: s, field: i.field, message: i.message, assetIndex: i.assetIndex });
  return out;
}

async function captureSingleBody(form: TransferFormData): Promise<Record<string, unknown>> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
    }),
  );
  try {
    await callTransferTaxAPI(form);
  } catch {
    /* 본문만 본다 */
  }
  vi.unstubAllGlobals();
  return cap.body!;
}

const sha = (v: unknown) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex").slice(0, 16);

export interface PhdRow {
  id: string;
  /** ⑧ 이슈 수(전 단계) */
  issues: number;
  issueMsgs: string[];
  /** 다건 «단건 전용» 차단 사유(경로 무관 — 첫 자산 기준) */
  multiBlock: string | null;
  status: number;
  /** ④ 본문에 PHD 키 */
  phdKey: boolean;
  /** ④ 본문(첫 자산) 취득시 기준시가 전송 여부 */
  stdKey: boolean;
  totalTax?: number;
  /** 응답 JSON 의 첫 `estimatedDeduction`(개산공제 — 증상 B 는 0) */
  estDed?: number;
  bodySha: string;
  respSha: string;
  fieldErrors: string;
  json: unknown;
}

/** 폼 → ⑧ 전 단계 + ④ 본문 + route(⑫⑭+엔진). 다건은 다건 ④⑬ → 다건 route. */
export async function runPhdCell(path: PhdPath, id: string, form: TransferFormData): Promise<PhdRow> {
  const issues = allPhdIssues(form);
  const multiBlock = validateMultiSupportedMode(form as never);
  let body: Record<string, unknown>;
  let status: number;
  let json: unknown;
  if (path === "multi") {
    body = await buildMultiBody([form]);
    ({ status, json } = await postMulti(body));
  } else {
    body = await captureSingleBody(form);
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body }),
      }),
    );
    status = res.status;
    json = await res.json();
  }
  const top = path === "multi" ? ((body.properties as Record<string, unknown>[])[0] ?? {}) : body;
  const j = json as { data?: { result?: { totalTax?: number }; totalTax?: number; aggregated?: { properties?: { determinedTax?: number }[] } }; error?: { fieldErrors?: unknown } };
  const props = j?.data?.aggregated?.properties;
  const total = j?.data?.result?.totalTax ?? j?.data?.totalTax ?? (props ? props.reduce((s, p) => s + (p.determinedTax ?? 0), 0) : undefined);
  const ed = /"estimatedDeduction":(\d+)/.exec(JSON.stringify(json));
  return {
    id,
    issues: issues.length,
    issueMsgs: issues.map((i) => i.message),
    multiBlock,
    status,
    phdKey: top.preHousingDisclosure !== undefined,
    stdKey: top.standardPriceAtAcquisition !== undefined,
    totalTax: total,
    estDed: ed ? Number(ed[1]) : undefined,
    bodySha: sha(body),
    respSha: sha(json),
    json,
    fieldErrors: Object.keys(((j?.error as { fieldErrors?: Record<string, unknown> } | undefined)?.fieldErrors) ?? {}).sort().join(","),
  };
}

// ─── 격자 ───────────────────────────────────────────────────────────────────────

export interface PhdCell {
  id: string;
  path: PhdPath;
  /** 방식 id(`PHD_METHODS` 키 · 별개 취득이면 `land-building` 파트 조합) */
  method: string;
  phd: string;
  acqDate: string;
  separate: boolean;
  /** 대조군(겸용·이월과세·비주택·상속·컴패니언 둘째) — 변화 0 이어야 한다 */
  control: boolean;
  form: TransferFormData;
}

const PATHS: PhdPath[] = ["single", "companion", "multi"];
const DATES = ["2003-01-10", "2010-01-10"];

function placeCell(path: PhdPath, assetOver: Partial<AssetForm>, secondOver: Partial<AssetForm> = {}): TransferFormData {
  return path === "companion" ? phdBundledForm(assetOver, secondOver) : phdForm(assetOver);
}

/** 주택 비별개 취득 격자 — 경로 3 × 취득일 2 × 방식 8 × PHD 4(공동주택 라벨 포함) × 기준시가 2 × 지분 2 = 768셀 */
export function mainGrid(): PhdCell[] {
  const out: PhdCell[] = [];
  for (const path of PATHS)
    for (const date of DATES)
      for (const [mn, mo] of PHD_METHODS)
        for (const [pn, po] of PHD_STATES)
          for (const ht of pn === "full" ? (["individual", "apartment"] as const) : (["individual"] as const))
            for (const [sn, so] of PHD_STD)
              for (const [hn, ho] of PHD_SHARE) {
                const over = { acquisitionDate: date, ...mo, ...po, phdHousingType: ht, ...so, ...ho };
                out.push({
                  id: [path, date, mn, pn + (ht === "apartment" ? "-apt" : ""), sn, hn].join("|"),
                  path, method: mn, phd: pn, acqDate: date, separate: false, control: false,
                  form: placeCell(path, over),
                });
              }
  return out;
}

const PARTS = ["actual", "estimated", "appraisal"] as const;
/** 별개 취득(토지·건물 취득일 다름) — 파트 모드 3×3 × 자산 전체 레거시 환산 잔재 2 × PHD 3 × 기준시가 2 × 경로 3 = 324셀 */
export function separateGrid(): PhdCell[] {
  const out: PhdCell[] = [];
  const sep: Partial<AssetForm> = {
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2001-05-01",
    landAcquisitionPrice: "150000000",
    buildingAcquisitionPrice: "150000000",
    standardPricePerSqmAtAcq: "1000000",
    acquisitionArea: "100",
    transferArea: "100",
    buildingStandardPriceAtAcq: "60000000",
    landStandardPriceAtTransfer: "240000000",
    buildingStandardPriceAtTransfer: "160000000",
  };
  for (const path of PATHS)
    for (const lm of PARTS)
      for (const bm of PARTS)
        for (const raw of [false, true])
          for (const [pn, po] of PHD_STATES)
            for (const [sn, so] of PHD_STD) {
              const over = { ...sep, landAcqMode: lm, buildingAcqMode: bm, useEstimatedAcquisition: raw, ...po, ...so };
              out.push({
                id: ["SEP", path, `L-${lm}`, `B-${bm}`, raw ? "rawEst" : "rawOff", pn, sn].join("|"),
                path, method: `${lm}/${bm}`, phd: pn, acqDate: "2003-01-10", separate: true, control: false,
                form: placeCell(path, over),
              });
            }
  return out;
}

/** 대조군 — 술어 적용 밖(겸용·이월과세·비주택·상속·증여 토지·컴패니언 둘째)이라 **바이트 동일**해야 하는 셀 */
export function controlGrid(): PhdCell[] {
  const out: PhdCell[] = [];
  const add = (id: string, path: PhdPath, over: Partial<AssetForm>, second: Partial<AssetForm> = {}) =>
    out.push({ id: "CTRL|" + id, path, method: id, phd: over.usePreHousingDisclosure ? "flag" : "off", acqDate: String(over.acquisitionDate ?? "2003-01-10"), separate: false, control: true, form: placeCell(path, over, second) });
  for (const path of PATHS)
    for (const [mn, mo] of PHD_METHODS.filter(([n]) => ["actual", "est", "app", "sales"].includes(n)))
      for (const [pn, po] of PHD_STATES) {
        const b = { ...mo, ...po };
        add(`land|${path}|${mn}|${pn}`, path, { ...b, assetKind: "land" });
        add(`mixed|${path}|${mn}|${pn}`, path, { ...b, isMixedUseHouse: true, hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2003-01-10" });
        add(`inherit|${path}|${mn}|${pn}`, path, { ...b, acquisitionCause: "inheritance" });
        add(`gift|${path}|${mn}|${pn}`, path, { ...b, acquisitionCause: "gift" });
        add(`carryover|${path}|${mn}|${pn}`, path, { ...b, acquisitionCause: "carryover_gift" });
        add(`landInherit|${path}|${mn}|${pn}`, path, { ...b, landAcquisitionCause: "inheritance", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2001-05-01" });
      }
  // 함께 양도 — 둘째 이후 자산의 PHD 잔재(첫 자산은 환산 · PHD OFF)
  for (const [mn, mo] of PHD_METHODS)
    for (const [pn, po] of PHD_STATES)
      add(`second|${mn}|${pn}`, "companion", { usePreHousingDisclosure: false }, { ...mo, ...po });
  // 환산 대조 — 환산 + PHD 3상태(기준선과 바이트 동일해야 한다)는 mainGrid 의 est 행이 담당
  return out;
}

export const phdAllCells = (): PhdCell[] => [...mainGrid(), ...separateGrid(), ...controlGrid()];

export const rowTsv = (c: PhdCell, r: PhdRow) =>
  [r.id, r.issues, r.multiBlock ? "BLOCK" : "-", r.status, r.phdKey ? 1 : 0, r.stdKey ? 1 : 0, r.totalTax ?? "", r.estDed ?? "", r.bodySha, r.respSha, r.fieldErrors, c.control ? "ctrl" : ""].join("\t");
