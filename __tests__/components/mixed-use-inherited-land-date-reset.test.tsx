/**
 * 겸용 × 상속·증여 — 토지 취득일 칸이 없으므로 매매에서 넣은 토지 날짜를 비운다(원인 전환 · 세션 복원 — 2026-10-24).
 * 남으면 소비처(`landAcquisitionDate || acquisitionDate`)가 숨은 토지 날짜로 계산했고, 1985.1.1.을 사이에 두면 ⑫가 고칠 칸 없는 400을 냈다.
 * 부재 단언에는 같은 시드의 긍정 짝을 둔다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const base = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    acquisitionCause: "purchase",
    acquisitionDate: "1990-03-15",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "1983-03-15",
    ...over,
  }) as AssetForm;

function pick(a: AssetForm, value: string) {
  const onChange = vi.fn();
  const { container } = render(<CompanionAcquisitionCauseSection asset={a} onChange={onChange} transferDate="2024-08-20" isNewConstruction={false} />);
  const input = container.querySelector(`input[type="radio"][value="${value}"]`) as HTMLInputElement | null;
  expect(input, `취득원인 라디오 ${value}`).not.toBeNull();
  fireEvent.click(input!);
  return onChange.mock.calls.at(-1)?.[0] as Partial<AssetForm>;
}

describe("원인 전환 — 겸용이면 숨은 토지 날짜를 비운다", () => {
  it("겸용 매매 → 상속: landAcquisitionDate \"\" · 분리 OFF", () => {
    const patch = pick(base(), "inheritance");
    expect(patch.acquisitionCause).toBe("inheritance");
    expect(patch.landAcquisitionDate).toBe("");
    expect(patch.hasSeperateLandAcquisitionDate).toBe(false);
  });

  it("겸용 매매 → 증여도 같다", () => {
    expect(pick(base(), "gift").landAcquisitionDate).toBe("");
  });

  it("🔴 짝: 겸용이 아닌 주택은 토지 날짜를 건드리지 않는다(분리 원인 모드가 쓰는 값)", () => {
    const patch = pick(base({ isMixedUseHouse: false }), "inheritance");
    expect(patch.acquisitionCause).toBe("inheritance");
    expect("landAcquisitionDate" in patch).toBe(false);
  });
});

describe("세션 복원 — 겸용 × 상속·증여면 토지 날짜를 비운다", () => {
  it("겸용 상속 · 분리 ON · 토지 1983 잔재 → \"\" · 분리 OFF", () => {
    const a = migrateAsset(base({ acquisitionCause: "inheritance" }) as unknown as Record<string, unknown>) as AssetForm;
    expect(a.landAcquisitionDate).toBe("");
    expect(a.hasSeperateLandAcquisitionDate).toBe(false);
  });

  it("🔴 짝: 겸용 매매 · 분리 ON은 토지 날짜를 지킨다", () => {
    const a = migrateAsset(base() as unknown as Record<string, unknown>) as AssetForm;
    expect(a.landAcquisitionDate).toBe("1983-03-15");
  });
});
