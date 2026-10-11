/**
 * 결정 #46 (G6-11) — 매매특약에 따라 잔금청산 전에 주택을 멸실한 양도 (판정 메뉴 전용).
 *
 * 양도물건은 양도일(잔금청산일) 현황으로 판정한다(기획재정부 재산세제과-1543, 2022.12.20. 회신일 이후 계약분부터).
 * 입력은 「멸실 여부」 토글과 「매매계약일」뿐이다. 주택으로 보면 비과세·부분과세가 나오는 세대만 과세로 바뀌고
 * 확인 필요(예외 결정례) 고지가 붙는다. 그 밖에는 변화 없음.
 */
import { describe, it, expect } from "vitest";
import { judge } from "./_one-house-pr11-helpers";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { buildCaseForm } from "./one-house-rulings/harness";

const UNMET = "154-1-demolished-before-balance";
const NOTICE = "154-1-demolished-before-balance-unverified";

/** 2002.9.5. 취득 · 거주 0 · 강남(조정) — 2017.8.3. 이전 취득이라 보유 2년만으로 비과세인 사안(F045 구성 케이스). */
const j = (
  over: { contract?: string; on?: boolean; acq?: string; transfer?: string; price?: string; asset?: Record<string, unknown> } = {},
) =>
  judge({
    acq: over.acq ?? "2002-09-05",
    transfer: over.transfer ?? "2023-06-15",
    asset: over.asset,
    top: {
      ...(over.price ? { contractTotalPrice: over.price } : {}),
      demolishedBeforeBalance: over.on ?? true,
      demolishedBeforeBalanceContractDate: over.contract ?? "2023-02-15",
    },
  });

describe("#46 판정 메뉴 — 잔금 전 멸실 특약", () => {
  it("[DB-1] 2023.2.15. 계약 · 잔금 전 멸실 · 2023.6.15. 잔금 → 비과세에서 과세로, 적용 안 된 특례 + 확인 필요 고지(종전: 비과세 + 고지 0건)", async () => {
    const o = await j();
    expect(o.status).toBe(200);
    expect(o.isExempt).toBe(false);
    expect(o.isPartialExempt).toBe(false);
    expect(o.unmetExceptions).toContain(UNMET);
    expect(o.undetermined).toContain(NOTICE);
    expect(o.unmetReasons[UNMET].join(" ")).toContain("재산세제과-1543");
    expect(o.validationErrors).toEqual([]);
  }, 60_000);

  it("[DB-2] 긍정 짝 — 토글을 끄면 종전대로 비과세, 고지 없음", async () => {
    const o = await j({ on: false });
    expect(o.isExempt).toBe(true);
    expect(o.unmetExceptions).not.toContain(UNMET);
    expect(o.undetermined).not.toContain(NOTICE);
  }, 60_000);

  it("[DB-3] 경계 ±1일 — 계약 2022.12.19.은 변화 없음(비과세) / 2022.12.20.(당일 포함)부터 과세", async () => {
    const before = await j({ contract: "2022-12-19" });
    expect(before.isExempt).toBe(true);
    expect(before.unmetExceptions).not.toContain(UNMET);
    expect(before.undetermined).not.toContain(NOTICE);
    const same = await j({ contract: "2022-12-20" });
    expect(same.isExempt).toBe(false);
    expect(same.unmetExceptions).toContain(UNMET);
    const after = await j({ contract: "2022-12-21" });
    expect(after.isExempt).toBe(false);
  }, 60_000);

  it("[DB-4] 부정 짝 — 주택으로 봐도 어차피 과세(보유 2년 미만)면 사유·고지를 붙이지 않는다", async () => {
    const o = await j({ acq: "2023-01-01", contract: "2023-02-15", transfer: "2023-06-15" });
    expect(o.isExempt).toBe(false);
    expect(o.unmetExceptions).not.toContain(UNMET);
    expect(o.undetermined).not.toContain(NOTICE);
  }, 60_000);

  it("[DB-5] 고가주택(15억) 부분과세도 과세로 — 토글을 끄면 부분과세", async () => {
    const off = await j({ on: false, price: "1500000000" });
    expect(off.isPartialExempt).toBe(true);
    const on = await j({ price: "1500000000" });
    expect(on.isExempt).toBe(false);
    expect(on.isPartialExempt).toBe(false);
    expect(on.unmetExceptions).toContain(UNMET);
  }, 60_000);

  it("[DB-6] 조합원입주권 양도에는 칸이 없다 — 남은 stale 선언은 본문에 싣지 않는다", () => {
    const form = buildCaseForm({
      id: "p", docNo: "-", docDate: "-", basis: "era", today: "2023-06-15", summary: "-", bucket: "match",
      form: {
        transferDate: "2023-06-15",
        asset: { assetKind: "right_to_move_in", redevSubject: "right", acquisitionDate: "2002-09-05" },
        demolishedBeforeBalance: true,
        demolishedBeforeBalanceContractDate: "2023-02-15",
      },
    });
    expect(buildOneHouseExemptionApiBody(form)).not.toHaveProperty("demolishedBeforeBalance");
  });
});

describe("#46 ⑧·④·계산기 인계", () => {
  const form = (patch: Record<string, unknown>) =>
    buildCaseForm({
      id: "p", docNo: "-", docDate: "-", basis: "era", today: "2023-06-15", summary: "-", bucket: "match",
      form: {
        isOneHousehold: true, transferDate: "2023-06-15", contractTotalPrice: "900000000",
        asset: { assetKind: "housing", acquisitionDate: "2002-09-05" },
        demolishedBeforeBalance: true,
        ...patch,
      },
    });

  it("[DB-7] ⑧ — 토글을 켜고 계약일이 없으면 차단 / 양도일보다 뒤여도 차단 / 정상 입력은 오류 없음", () => {
    const errs = (f: ReturnType<typeof form>) =>
      validateAllSteps(f).filter((e) => e.severity === "error" && e.field === "demolishedBeforeBalanceContractDate");
    expect(errs(form({ demolishedBeforeBalanceContractDate: "" }))).toHaveLength(1);
    expect(errs(form({ demolishedBeforeBalanceContractDate: "2023-06-16" }))).toHaveLength(1);
    expect(errs(form({ demolishedBeforeBalanceContractDate: "2023-02-15" }))).toHaveLength(0);
    // 토글 OFF면 stale 계약일이 있어도 요구·전송하지 않는다
    expect(errs(form({ demolishedBeforeBalance: false, demolishedBeforeBalanceContractDate: "" }))).toHaveLength(0);
  });

  it("[DB-8] ⑧ 경고 — 2022.12.20. 이후 계약이면 계산기로 넘기면 주택으로 다시 판정됨을 알린다 / 이전 계약은 경고 없음", () => {
    const warns = (f: ReturnType<typeof form>) =>
      validateAllSteps(f).filter((e) => e.severity === "warning" && e.field === "demolishedBeforeBalance");
    expect(warns(form({ demolishedBeforeBalanceContractDate: "2023-02-15" }))).toHaveLength(1);
    expect(warns(form({ demolishedBeforeBalanceContractDate: "2022-12-19" }))).toHaveLength(0);
  });

  it("[DB-9] 계산기 인계 patch에는 판정 메뉴 전용 키가 실리지 않는다", () => {
    const patch = toTransferFormPatch(form({ demolishedBeforeBalanceContractDate: "2023-02-15" })) as Record<string, unknown>;
    expect(patch).not.toHaveProperty("demolishedBeforeBalance");
    expect(patch).not.toHaveProperty("demolishedBeforeBalanceContractDate");
  });

  it("[DB-10] ④ — 선언 시에만 본문에 싣고 초기 폼은 꺼짐", () => {
    const init = createInitialOneHouseJudgmentForm();
    expect(init.demolishedBeforeBalance).toBe(false);
    expect(buildOneHouseExemptionApiBody(init)).not.toHaveProperty("demolishedBeforeBalance");
    expect(buildOneHouseExemptionApiBody(form({ demolishedBeforeBalanceContractDate: "2023-02-15" })))
      .toHaveProperty("demolishedBeforeBalance", { contractDate: "2023-02-15" });
  });
});
