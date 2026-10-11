/**
 * #15 ⑤ — 수용 블록이 원시 `hasSeperateLandAcquisitionDate`로 ㎡당 보상가액 칸을 숨기던 것(2026-10-11).
 * stale 분리 입력(상속·증여 호스트 — 끌 토글이 없다)이면 ④·⑧처럼 「분리 없음」으로 읽어 칸을 보여 준다.
 * 숨기면 ⑫가 요구하는 칸을 넣을 수 없는 막다른 길이었다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExpropriationBlock } from "@/components/calc/transfer/ExpropriationBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const building = (over: Partial<AssetForm>): AssetForm =>
  ({
    ...makeDefaultAsset(1), assetKind: "building", acquisitionCause: "inheritance", acquisitionDate: "1983-05-01",
    useEstimatedAcquisition: true, transferCause: "public_expropriation", acquisitionArea: "100", ...over,
  }) as AssetForm;
const mount = (a: AssetForm) => render(<ExpropriationBlock asset={a} onChange={() => {}} transferDate="2025-03-01" />);

describe("수용 블록 — stale 분리 입력", () => {
  it("상속 호스트 stale 분리 → ② 보상가액(원/㎡) 칸이 보인다", () => {
    mount(building({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "1980-01-01" }));
    expect(screen.queryByText("② 보상가액")).not.toBeNull();
  });
  it("부정형 짝 — 매매 호스트의 진짜 분리는 종전대로 ㎡당 칸 대신 토지분 총액 블록", () => {
    mount(building({ acquisitionCause: "purchase", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "1980-01-01" }));
    expect(screen.queryByText("② 보상가액")).toBeNull();
  });
});
