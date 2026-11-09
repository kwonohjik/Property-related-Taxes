/**
 * anchor — 기준시가 자동조회가 전용면적을 함께 받아도 조회한 기준시가가 버려지지 않는다 (리뷰 NH-28 · 계획서 `std-price-lookup-exclusive-area-stale-spread-nh28.plan.md`).
 *
 * 조회 필드는 `onChange(가격)` → `onExclusiveArea(면적)`을 같은 틱에 연달아 부르고, 패널의 갱신 함수는 렌더 시점의 `reductions`를 펼쳐 보냈다 —
 * 둘째 호출이 첫째 변경이 없는 옛 배열 위에 면적만 얹어 기준시가가 옛 값으로 남았다. 기존 `new993-stdprice-autolookup`은 `onUpdate`를 `vi.fn()`으로
 * 모의해 이 덮어쓰기를 볼 수 없다 → 여기서는 **상태 있는 부모 + 실제 패널**로 조회 후 `asset.reductions[0]`을 읽는다.
 * 4폼(§99의3 · §99 · §98의8 · §99의2) × 3시점(취득시 · 5년 · 양도시) = 12칸 + 대조(전용면적 없는 응답) 12칸.
 */
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnifiedReductionPanel } from "@/components/calc/transfer/UnifiedReductionPanel";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Form = { id: string; sfx: string; prefix: string };
const FORMS: Form[] = [
  { id: "new_99_3", sfx: "993", prefix: "new993" },
  { id: "new_99", sfx: "99", prefix: "new99" },
  { id: "unsold_98_8", sfx: "988", prefix: "unsold988" },
  { id: "unsold_99_2", sfx: "992", prefix: "unsold992" },
];
const POINTS = [
  { label: "취득시", slug: "acq", key: (f: Form) => `standardPriceAtAcquisition${f.sfx}`, old: "80,000,000" },
  { label: "5년 시점", slug: "5y", key: (f: Form) => (f.sfx === "993" ? "standardPriceAt5Years" : `standardPriceAt5Years${f.sfx}`), old: "150,000,000" },
  { label: "양도시", slug: "transfer", key: (f: Form) => `standardPriceAtTransfer${f.sfx}`, old: "200,000,000" },
] as const;

const holder: { asset?: AssetForm } = {};
const current = () => holder.asset!.reductions?.[0] as unknown as Record<string, string>;

function Harness({ form }: { form: Form }) {
  const base = getReductionDefault(form.id as never) as unknown as Record<string, unknown>;
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    addressJibun: "경기도 수원시 영통구 영통동 957-6",
    acquisitionDate: "2003-11-28",
    reductions: [
      {
        ...base,
        [POINTS[0].key(form)]: POINTS[0].old,
        [POINTS[1].key(form)]: POINTS[1].old,
        [POINTS[2].key(form)]: POINTS[2].old,
        [`exclusiveAreaSqm${form.sfx}`]: "59",
      },
    ] as never,
  } as AssetForm);
  useEffect(() => {
    holder.asset = asset;
  }, [asset]);
  return <UnifiedReductionPanel asset={asset} transferDate="2026-02-16" onChange={(patch) => setAsset((a) => ({ ...a, ...patch }))} />;
}

function mockLookup(withArea: boolean) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => (withArea ? { price: 300_000_000, priceType: "apart_housing_price", exclusiveArea: 84.96 } : { price: 300_000_000, priceType: "apart_housing_price" }),
  }) as unknown as typeof fetch;
}

describe("NH-28 — 조회 응답에 전용면적이 있어도 기준시가가 반영된다 (4폼 × 3시점)", () => {
  const cells = FORMS.flatMap((f) => POINTS.map((p) => [f.id, p.label, f, p] as const));
  it.each(cells)("%s · %s 조회 → 기준시가 300,000,000 + 전용면적 84.96", async (_id, _label, f, p) => {
    mockLookup(true);
    render(<Harness form={f} />);
    fireEvent.click(screen.getByTestId(`${f.prefix}-stdprice-${p.slug}-lookup-btn`));
    await waitFor(() => expect(current()[p.key(f)]).toBe("300000000"));
    expect(current()[`exclusiveAreaSqm${f.sfx}`]).toBe("84.96");
  });

  it("세 시점을 이어서 조회해도 앞선 조회값이 지워지지 않는다 (§99의3)", async () => {
    mockLookup(true);
    const f = FORMS[0];
    render(<Harness form={f} />);
    for (const p of POINTS) {
      fireEvent.click(screen.getByTestId(`${f.prefix}-stdprice-${p.slug}-lookup-btn`));
      await waitFor(() => expect(current()[p.key(f)]).toBe("300000000"));
    }
    for (const p of POINTS) expect(current()[p.key(f)]).toBe("300000000");
    expect(current()[`exclusiveAreaSqm${f.sfx}`]).toBe("84.96");
  });
});

describe("NH-28 대조 — 전용면적 없는 응답은 종전에도 기준시가만 반영된다", () => {
  const cells = FORMS.flatMap((f) => POINTS.map((p) => [f.id, p.label, f, p] as const));
  it.each(cells)("%s · %s 조회 → 기준시가 300,000,000 · 전용면적 59 그대로", async (_id, _label, f, p) => {
    mockLookup(false);
    render(<Harness form={f} />);
    fireEvent.click(screen.getByTestId(`${f.prefix}-stdprice-${p.slug}-lookup-btn`));
    await waitFor(() => expect(current()[p.key(f)]).toBe("300000000"));
    expect(current()[`exclusiveAreaSqm${f.sfx}`]).toBe("59");
  });
});

describe("NH-28 — 부모가 밖에서 reductions를 바꾸면 다음 갱신은 그 새 값 위에서 이뤄진다 (ref 재동기화)", () => {
  it("재렌더로 받은 새 asset 위에 조회 결과가 얹힌다 — 옛 asset 값이 되살아나지 않는다", async () => {
    mockLookup(false);
    const f = FORMS[0];
    const mk = (acq: string, y5: string) =>
      ({
        ...makeDefaultAsset(1),
        assetKind: "housing",
        addressJibun: "경기도 수원시 영통구 영통동 957-6",
        acquisitionDate: "2003-11-28",
        reductions: [{ ...(getReductionDefault("new_99_3") as unknown as Record<string, unknown>), standardPriceAtAcquisition993: acq, standardPriceAt5Years: y5, exclusiveAreaSqm993: "59" }],
      }) as unknown as AssetForm;
    const patches: Array<Partial<AssetForm>> = [];
    const onChange = (patch: Partial<AssetForm>) => patches.push(patch);
    const { rerender } = render(<UnifiedReductionPanel asset={mk("80,000,000", "150,000,000")} transferDate="2026-02-16" onChange={onChange} />);
    rerender(<UnifiedReductionPanel asset={mk("11,111,111", "22,222,222")} transferDate="2026-02-16" onChange={onChange} />);
    fireEvent.click(screen.getByTestId(`${f.prefix}-stdprice-acq-lookup-btn`));
    await waitFor(() => expect(patches.length).toBeGreaterThan(0));
    const next = patches[patches.length - 1].reductions?.[0] as unknown as Record<string, string>;
    expect(next.standardPriceAtAcquisition993).toBe("300000000");
    expect(next.standardPriceAt5Years).toBe("22,222,222"); // 새 asset의 값 — 옛 asset의 150,000,000이 아니다
  });
});
