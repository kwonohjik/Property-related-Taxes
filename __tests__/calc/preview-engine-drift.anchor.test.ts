/**
 * anchor: **미리보기가 엔진과 갈리던 축** 정정 (UI 리뷰 보통 #11·#13·#14·#15·#27·#29).
 *
 * 여섯 건이 한 모양이다 — 화면의 안내·배지가 엔진과 **다른 계산**을 해서, 사용자가 초록
 * 신호를 보고 넘어간 뒤 계산 결과에서 뒤집힌다(메모리 `feedback_ui_engine_dual_truth_avoidance`).
 *
 * | 축 | 화면이 쓰던 것 | 엔진이 쓰는 것 |
 * |---|---|---|
 * | §97의5 3개월 (#29) | `setMonth` — 말일 **오버플로** | `date-fns addMonths` — 말일 **clamp** |
 * | §99의4 보유 (#27) | 월 단위 뺄셈 | `calculateHoldingPeriod` (일·초일불산입) |
 * | 토지출자 §166③ (#14) | 언제나 `권리가액 + 청산금` | `computeSalePriceTotal` (수령은 **−**) |
 * | §154① 단서 (#15) | 정규화 없는 `provisoReason` | `provisoGate` → `effectiveProvisoReason` |
 */
import { describe, it, expect } from "vitest";
import { addMonths } from "date-fns";
import { calculateHoldingPeriod } from "@/lib/tax-engine/tax-utils";
import { computeSalePriceTotal } from "@/lib/tax-engine/redevelopment-settlement";
import { RENTAL_97_5_REGISTRATION_MONTHS } from "@/lib/tax-engine/transfer-reductions";
import { buildResidenceReqInput } from "@/lib/calc/transfer-tax-api-residence";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

describe("§97의5 3개월 기한 — 말일 clamp (#29)", () => {
  it("🔑 P-1: 2018-11-30 + 3개월은 2019-02-28이다 (오버플로 금지)", () => {
    const deadline = addMonths(new Date("2018-11-30"), RENTAL_97_5_REGISTRATION_MONTHS);
    expect(deadline.toISOString().slice(0, 10)).toBe("2019-02-28");
    // 종전 `setMonth` 방식은 2019-03-02가 되어 2019-03-01 등록을 「3개월 내」로 통과시켰다.
    const legacy = new Date("2018-11-30");
    legacy.setMonth(legacy.getMonth() + 3);
    expect(legacy.getTime()).toBeGreaterThan(deadline.getTime());
  });

  it("P-2: 2019-03-01 등록은 기한 초과다 — 엔진 판정과 같은 방향", () => {
    const deadline = addMonths(new Date("2018-11-30"), RENTAL_97_5_REGISTRATION_MONTHS);
    expect(new Date("2019-03-01").getTime()).toBeGreaterThan(deadline.getTime());
  });

  it("P-3: 말일이 아닌 취득일은 종전과 결과가 같다 (축을 바꾼 게 아니다)", () => {
    const deadline = addMonths(new Date("2018-10-15"), RENTAL_97_5_REGISTRATION_MONTHS);
    expect(deadline.toISOString().slice(0, 10)).toBe("2019-01-15");
  });
});

describe("§99의4 보유기간 — 일(day)까지 본다 (#27)", () => {
  it("🔑 Q-1: 2020-03-31 → 2023-03-01은 3년이 아니다", () => {
    // 종전 월 단위 뺄셈: (2023-2020)*12 + (2-2) = 36 → 「3년」 → 추징 경고가 사라졌다.
    const legacyMonths = (2023 - 2020) * 12 + (2 - 2);
    expect(Math.floor(legacyMonths / 12)).toBe(3);
    expect(calculateHoldingPeriod(new Date("2020-03-31"), new Date("2023-03-01")).years).toBe(2);
  });

  it("Q-2: 3년을 실제로 채우면 3년이다", () => {
    expect(calculateHoldingPeriod(new Date("2020-03-31"), new Date("2023-04-30")).years).toBe(3);
  });
});

describe("토지 출자 §166③ 미리보기 — 청산금 방향 (#14)", () => {
  it("🔑 R-1: 수령은 권리가액 − 청산금, 납부는 + 청산금", () => {
    expect(computeSalePriceTotal(1_000_000_000, 200_000_000, "pay")).toBe(1_200_000_000);
    expect(computeSalePriceTotal(1_000_000_000, 200_000_000, "receive")).toBe(800_000_000);
  });

  it("R-2: 두 방향의 차이는 청산금의 2배다 — 미리보기가 그만큼 어긋났었다", () => {
    const pay = computeSalePriceTotal(1_000_000_000, 200_000_000, "pay");
    const receive = computeSalePriceTotal(1_000_000_000, 200_000_000, "receive");
    expect(pay - receive).toBe(400_000_000);
  });
});

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionDate: "2019-03-01",
    ...over,
  }) as AssetForm;

const form = (over: Record<string, unknown> = {}): TransferFormData =>
  ({
    transferDate: "2024-06-01",
    assets: [asset()],
    isOneHousehold: true,
    householdHousingCount: "1",
    residencePeriodMonths: "0",
    temporaryTwoHouseSpecial: false,
    provisoReason: "overseas_migration",
    provisoDepartureDate: "2023-01-01",
    ...over,
  }) as unknown as TransferFormData;

describe("Step4 거주요건 안내 — ④와 같은 게이트를 통과한 사유만 쓴다 (#15)", () => {
  it("🔑 S-1: 카드가 숨겨지는 3주택 세대에서는 사유를 쓰지 않는다", () => {
    // `provisoGate`는 1주택 또는 (2주택 + 일시적 2주택 특례)에서만 mode를 준다.
    expect(buildResidenceReqInput(form({ householdHousingCount: "3" })).oneHouseExemptionProviso)
      .toBeUndefined();
  });

  it("🔑 S-2: 일시적 2주택 화이트리스트 밖 사유도 버린다", () => {
    const f = form({
      householdHousingCount: "2",
      temporaryTwoHouseSpecial: true,
      // 화이트리스트는 `TEMP_TWO_HOUSE_PROVISO_REASONS` = 임대5년거주·수용·부득이 3종뿐이다.
      provisoReason: "overseas_migration",
    });
    expect(buildResidenceReqInput(f).oneHouseExemptionProviso).toBeUndefined();
  });

  it("S-3: 1주택 세대에서는 종전대로 사유가 전달된다 (축을 죽인 게 아니다)", () => {
    const p = buildResidenceReqInput(form()).oneHouseExemptionProviso;
    expect(p?.reason).toBe("overseas_migration");
  });

  it("S-5: 일시적 2주택 화이트리스트 **안**의 사유는 종전대로 전달된다", () => {
    const f = form({
      householdHousingCount: "2",
      temporaryTwoHouseSpecial: true,
      provisoReason: "expropriation",
      provisoExpropriationDate: "2023-05-01",
    });
    expect(buildResidenceReqInput(f).oneHouseExemptionProviso?.reason).toBe("expropriation");
  });

  it("S-4: 비주택 자산에서도 버린다 — §154①은 주택 판정이다", () => {
    const f = form({ assets: [asset({ assetKind: "land" })] });
    expect(buildResidenceReqInput(f).oneHouseExemptionProviso).toBeUndefined();
  });
});
