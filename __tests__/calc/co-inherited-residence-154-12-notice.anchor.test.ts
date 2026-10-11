/**
 * G5-4 — 「소득세법 시행령」 §154⑫: 취득 당시 조정대상지역에 있는 공동상속주택의 거주기간은 (2024.2.29. 이후 양도분)
 * 거주한 공동상속인 중 거주기간이 가장 긴 사람의 기간으로 판단한다(그 전 2021.2.17.~2024.2.28.: §155③ 단서에 따라
 * 공동상속주택을 소유한 것으로 보는 사람의 거주기간).
 *
 * 공동상속 여부·다른 공동상속인의 거주기간 입력 칸은 사용자 결정 대기라 만들지 않는다. 이번 범위는
 * (1) 판정은 그대로 두고 「확인 필요」(undetermined)를 먼저 둔다, (2) 「상속인 본인」으로 한정한 안내 문구를 바로잡는다.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { calcForm, judge, runCalc } from "./_one-house-pr11-helpers";

const ID = "154-12-co-inherited-residence-unverified";
const INH = { acquisitionCause: "inheritance", decedentAcquisitionDate: "2010-05-01" };
const inherited = (o: { transfer?: string; residence?: string; regionCode?: string; asset?: Record<string, unknown> } = {}) =>
  judge({ acq: "2022-03-01", transfer: o.transfer ?? "2026-11-16", residence: o.residence ?? "0", regionCode: o.regionCode, asset: { ...INH, ...(o.asset ?? {}) } });

describe("G5-4 판정 메뉴 — 상속·취득 당시 조정·본인 거주 미달 과세에서 §154⑫ 확인 필요를 둔다", () => {
  it("[CI-1] 강남 상속 2022-03-01, 거주 0 → 과세(종전 그대로) + 확인 필요, 문구에 §154⑫", async () => {
    const o = await inherited();
    expect(o.status).toBe(200);
    expect(o.isExempt).toBe(false);
    expect(o.undetermined).toContain(ID);
  });

  it("[CI-2] 부정 짝 — 거주 48개월(충족) · 비조정(목포) · 매매 취득 · 조정 해제 후 상속이면 내지 않는다", async () => {
    expect((await inherited({ residence: "48" })).undetermined).not.toContain(ID);
    const mokpo = await inherited({ regionCode: "4611010100" });
    expect(mokpo.isExempt).toBe(true);
    expect(mokpo.undetermined).not.toContain(ID);
    const bought = await judge({ acq: "2022-03-01", transfer: "2026-11-16" });
    expect(bought.isExempt).toBe(false);
    expect(bought.undetermined).not.toContain(ID);
  });

  it("[CI-3] 신설 전 양도분(2021-02-16)은 규정이 없어 내지 않고, 2021-02-17부터 낸다", async () => {
    expect((await inherited({ transfer: "2021-02-16", asset: { acquisitionDate: "2018-03-01" } })).undetermined).not.toContain(ID);
    expect((await inherited({ transfer: "2021-02-17", asset: { acquisitionDate: "2018-03-01" } })).undetermined).toContain(ID);
  });
});

describe("G5-4 계산기 — 같은 문장이 경고로 나온다", () => {
  const calc = (residence: string, regionCode?: string) =>
    runCalc(
      calcForm({
        acq: "2022-03-01", transfer: "2026-11-16", regionCode,
        asset: { acquisitionCause: "inheritance", decedentAcquisitionDate: "2010-05-01", publishedValueAtInheritance: "300000000", residencePeriodMonthsAsset: residence },
        top: { residencePeriodMonths: residence },
      }),
    );

  it("[CI-4] 거주 0 → 과세 + §154⑫ 경고 / 거주 48 → 비과세 + 경고 없음", async () => {
    const taxed = await calc("0");
    expect(taxed.isExempt).toBe(false);
    expect(taxed.warnings.some((w) => w.includes("§154⑫"))).toBe(true);
    const ok = await calc("48");
    expect(ok.isExempt).toBe(true);
    expect(ok.warnings.some((w) => w.includes("§154⑫"))).toBe(false);
  }, 60_000);
});

describe("G5-4 안내 문구", () => {
  it("[CI-5] ResidencePeriodSection이 거주기간을 「상속인 본인」으로만 한정하지 않고 §154⑫를 알린다", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../components/calc/transfer/ResidencePeriodSection.tsx"), "utf8");
    expect(src).not.toContain("상속인 본인이 거주한 기간입니다");
    expect(src).toContain("제154조제12항");
  });
});
