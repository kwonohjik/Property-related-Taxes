/**
 * anchor — 다주택 중과 판정 메뉴 P2: 계산기 ⑧의 중과 축 검증을 leaf(`transfer-tax-validate-surcharge-axis.ts`)로 옮겼다.
 *
 * 동작 불변은 착수 시 실측했다 — 변경 전·후 `collectStep1Issues`를 표적 코퍼스 9,792폼(행 사실 33종 × 양도 주택 12종 ×
 * 유예 4종 × 양도일 3종 × 행 1·2개)과 e2e 오류 이동 케이스 380폼에 돌려 출력이 바이트 단위로 같았다(메시지 56종).
 * 이 anchor는 그 뒤를 지킨다: 계산기가 **세 leaf를 실제로 부르는가**(다주택 중과 판정 메뉴 ⑧이 같은 leaf를 부르므로
 * 한쪽만 고치면 두 메뉴가 갈라진다).
 */
import { describe, it, expect } from "vitest";
import { collectStep1Issues } from "@/lib/calc/transfer-tax-validate-step1";
import {
  collectGracePeriodIssues,
  collectSellingHouseSurchargeIssues,
  houseRowSurchargeAxisIssue,
} from "@/lib/calc/transfer-tax-validate-surcharge-axis";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeHouse } from "./one-house-rulings/harness";

const row = (over: Partial<HouseEntry> = {}) =>
  makeHouse("h1", { region: "capital", acquisitionDate: "2018-01-01", officialPrice: "300000000", ...over });

function form(over: Partial<TransferFormData> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01" };
  return { ...f, transferDate: "2024-06-01", filingDate: "2024-08-31", householdHousingCount: "3", ...over };
}
const messages = (f: TransferFormData) => collectStep1Issues(f).map((i) => i.message);

describe("P2 계산기 ⑧ ⊇ 중과 축 leaf", () => {
  it("[SA-1] 명부 행 — leaf의 첫 오류가 계산기 행 오류다", () => {
    const h = row({ isDayCareCenter: true, dayCareOperationYears: "6" });
    const leaf = houseRowSurchargeAxisIssue(h, "보유 주택 1", "2024-06-01", undefined);
    expect(leaf).toMatch(/^보유 주택 1: 어린이집: 사용하지 않게 된 날/);
    expect(messages(form({ houses: [h] }))).toContain(leaf);
  });

  it("[SA-2] 양도 주택 — leaf 오류가 같은 순서로 계산기에 있다", () => {
    const f = form({
      houses: [row()],
      sellingHouseExclusion: { isEmployeeHousing: true, isUnavoidableReason: true, isLitigationHousing: true },
    });
    const leaf = collectSellingHouseSurchargeIssues(f).map((i) => i.message);
    expect(leaf.length).toBeGreaterThanOrEqual(3);
    const calc = messages(f);
    const at = leaf.map((m) => calc.indexOf(m));
    expect(at.every((x) => x >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("[SA-3] 한시 유예 — leaf 오류가 계산기에 있다", () => {
    const f = form({ houses: [row()], transferDate: "2026-07-01", gracePeriod: { isLandPermitTarget: true } as never });
    const leaf = collectGracePeriodIssues(f).map((i) => i.message);
    expect(leaf.length).toBeGreaterThan(0);
    for (const m of leaf) expect(messages(f)).toContain(m);
  });
});
