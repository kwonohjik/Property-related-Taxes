/**
 * Pre-Do anchor — 이력 「편집」(재계산) 진입: 다건 record는 **다건 마법사**로
 *
 * 계획서: `docs/00-pm/history-resume-multi-record-misroute.plan.md`
 *
 * ## 종전 결함 (Playwright probe 실측, 2026-09-16)
 *
 * 다건 record를 「편집」하면 **단건 마법사**로 갔다. `updateFormData`는 단순 merge인데
 * 다건 `inputData`에는 `assets`가 없어 **아무것도 덮이지 않고**, 직전 단건 세션의 입력이
 * 그대로 남았다. 그 위에 다건 record의 **정정 플래그가 주입**됐다 —
 * `MultiTransferFormData`가 `AmendmentBlock` 재사용을 위해 단건과 필드명을 **의도적으로**
 * 맞춰 뒀기 때문이다(그 설계는 옳다. 결함은 「그 폼을 단건 store에 부어도 되는가」 쪽이다).
 *
 * 경정청구 모드는 당초 결정세액을 차감한다 ⇒ **세액이 바뀐다**. 표시만의 문제가 아니었다.
 *
 * 2차 경로도 실측했다: 오염된 폼으로 저장한 이력은 `checkRealEstateRecalc`에서
 * `kind:"multi"`로 분류돼(§104⑤ 크로스) **남의 자산으로 재계산**된다.
 *
 * ## 안전망은 0건이었다
 *
 * 「편집」의 **동작**을 단언하는 테스트가 없었다 — 기존 E2E는 라벨만 본다.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  isMultiTransferInput,
  resumeTransferRecord,
} from "@/lib/calc/transfer-resume-entry";
import { useCalcWizardStore } from "@/lib/stores/calc-wizard-store";
import { useMultiTransferStore } from "@/lib/stores/multi-transfer-tax-store";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { useBuildingStdSnapshotStore } from "@/lib/stores/building-std-snapshot-store";
import type { CalculationRecord } from "@/lib/storage/types";

function rec(partial: Partial<CalculationRecord>): CalculationRecord {
  return {
    id: "r1",
    userId: "local-user",
    taxType: "transfer",
    title: "t",
    taxLawVersion: "2026",
    linkedCalculationId: null,
    clientId: null,
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
    ...partial,
  } as unknown as CalculationRecord;
}

/** 단건 이력 — `assets`를 가진다 */
const SINGLE = rec({
  id: "rec-single",
  inputData: {
    assets: [{ assetKind: "land", addressJibun: "단건 소재지 ANCHOR" }],
    transferDate: "2026-03-03",
    contractTotalPrice: "900000000",
  },
  resultData: { mode: "single", result: { determinedTax: 1 } },
});

/** 다건 이력 — `__multiTransfer` + `properties[].form`. 경정청구 플래그를 달고 있다. */
const MULTI = rec({
  id: "rec-multi",
  clientId: "client-A",
  inputData: {
    __multiTransfer: true,
    taxYear: 2026,
    properties: [
      {
        propertyId: "mp1",
        propertyLabel: "양도 1번",
        completionPercent: 100,
        form: { assets: [{ assetKind: "land" }], transferDate: "2026-04-20" },
      },
      {
        propertyId: "mp2",
        propertyLabel: "양도 2번",
        completionPercent: 100,
        form: { assets: [{ assetKind: "apartment" }], transferDate: "2026-08-08" },
      },
    ],
    activePropertyIndex: 0,
    activeStep: "settings",
    amendmentMode: true,
    correctionKind: "refund_claim",
    originalDeterminedTax: "999999999",
    statutoryFilingDeadline: "2027-05-31",
  },
  resultData: { determinedTax: 30_000_000, properties: [{ propertyId: "mp1" }] },
});

/** 구 stub 다건 — `properties[].form`이 없다(B0 이전 저장분) */
const STUB = rec({
  id: "rec-stub",
  inputData: {
    __multiTransfer: true,
    taxYear: 2026,
    properties: [{ propertyId: "sp1", propertyLabel: "양도 1번", completionPercent: 100 }],
  },
  resultData: { determinedTax: 1, properties: [{ propertyId: "sp1" }] },
});

function routerMock() {
  const pushed: string[] = [];
  return { pushed, router: { push: (href: string) => pushed.push(href) } as never };
}

beforeEach(() => {
  useCalcWizardStore.getState().reset();
  useMultiTransferStore.getState().reset();
  useProfessionalStore.getState().clearActiveClient();
  useBuildingStdSnapshotStore.setState({ snapshots: {} });
});

describe("판별자 — 「이 record는 다건 입력인가」", () => {
  it("`__multiTransfer` 플래그", () => {
    expect(isMultiTransferInput(MULTI.inputData)).toBe(true);
  });

  it("플래그 이전 저장분도 `properties` 배열로 잡는다 — 안전측 superset", () => {
    expect(isMultiTransferInput({ properties: [{ form: {} }], taxYear: 2026 })).toBe(true);
  });

  it("단건은 false", () => {
    expect(isMultiTransferInput(SINGLE.inputData)).toBe(false);
  });

  it("null·비객체도 false", () => {
    expect(isMultiTransferInput(null)).toBe(false);
    expect(isMultiTransferInput("x")).toBe(false);
  });
});

describe("R-1. 단건 record → 단건 마법사", () => {
  it("단건 store에 hydrate하고 단건 라우트로 보낸다", async () => {
    const { router, pushed } = routerMock();
    const reason = await resumeTransferRecord(SINGLE, router);

    expect(reason).toBeNull();
    expect(pushed).toEqual(["/calc/transfer-tax"]);
    const { formData, currentStep } = useCalcWizardStore.getState();
    expect(formData.assets[0].addressJibun).toBe("단건 소재지 ANCHOR");
    expect(formData.transferDate).toBe("2026-03-03");
    expect(currentStep).toBe(0);
  });

  it("assets는 migrate를 통과한다 — 2026-09-07에 한 번 빠졌던 축", async () => {
    const { router } = routerMock();
    await resumeTransferRecord(SINGLE, router);
    // migrateAsset이 채우는 신규 필드 디폴트가 들어와야 한다(원본 record엔 없다)
    expect(useCalcWizardStore.getState().formData.assets[0]).toHaveProperty("assetId");
    expect(useCalcWizardStore.getState().formData.assets[0]).toHaveProperty("transferCause");
  });

  it("다건 store는 건드리지 않는다", async () => {
    const { router } = routerMock();
    await resumeTransferRecord(SINGLE, router);
    expect(useMultiTransferStore.getState().form.properties).toHaveLength(0);
  });
});

describe("R-2. 다건 record → 다건 마법사 (종전 결함)", () => {
  it("🔴 다건 store에 properties를 hydrate하고 다건 라우트로 보낸다", async () => {
    const { router, pushed } = routerMock();
    const reason = await resumeTransferRecord(MULTI, router);

    expect(reason).toBeNull();
    expect(pushed).toEqual(["/calc/transfer-tax/multi"]);
    const { form } = useMultiTransferStore.getState();
    expect(form.properties).toHaveLength(2);
    expect(form.properties.map((p) => p.form.transferDate)).toEqual(["2026-04-20", "2026-08-08"]);
    expect(form.taxYear).toBe(2026);
    expect(form.activeStep).toBe("list");
  });

  it("🔴 단건 store가 오염되지 않는다 — 다건 키도, 정정 플래그도 넘어가지 않는다", async () => {
    const { router } = routerMock();
    await resumeTransferRecord(MULTI, router);

    const f = useCalcWizardStore.getState().formData as unknown as Record<string, unknown>;
    expect(f.__multiTransfer).toBeUndefined();
    expect(f.properties).toBeUndefined();
    expect(f.taxYear).toBeUndefined();
    expect(f.activeStep).toBeUndefined();
    // 🔑 종전에는 이 셋이 주입돼 **세액이 바뀌었다**(경정청구는 당초 결정세액을 차감한다)
    expect(f.amendmentMode).toBe(false);
    expect(f.correctionKind).toBe("amend");
    expect(f.originalDeterminedTax).toBe("");
  });
});

describe("R-3. 「편집」은 정정 플래그를 그대로 복원한다", () => {
  /**
   * ⚠️ **합산 진입(`enterMultiAggregate`)과 반대 규칙**이다.
   *    합산은 **새 확정신고**라 기본값에서 시작하고, 편집은 **그 신고서를 다시 여는 것**이라
   *    저장된 상태를 그대로 복원한다. 두 진입의 의미가 다르므로 규칙도 달라야 한다.
   */
  it("수정신고·경정청구 상태로 저장된 다건 record는 그 상태로 열린다", async () => {
    const { router } = routerMock();
    await resumeTransferRecord(MULTI, router);

    const { form } = useMultiTransferStore.getState();
    expect(form.amendmentMode).toBe(true);
    expect(form.correctionKind).toBe("refund_claim");
    expect(form.originalDeterminedTax).toBe("999999999");
    expect(form.statutoryFilingDeadline).toBe("2027-05-31");
  });
});

describe("R-4. 구 stub 다건 → 차단하고 사유를 말한다", () => {
  it("어느 store도 바꾸지 않고, 이동하지 않고, 사유를 돌려준다", async () => {
    const { router, pushed } = routerMock();
    const reason = await resumeTransferRecord(STUB, router);

    expect(reason).toBeTruthy();
    expect(reason).toContain("편집");
    expect(pushed).toHaveLength(0);
    expect(useMultiTransferStore.getState().form.properties).toHaveLength(0);
    expect(useCalcWizardStore.getState().formData.assets[0].addressJibun ?? "").toBe("");
  });
});

describe("R-5. 공통 부수효과 — 드로어에도 함께 적용된다", () => {
  it("의뢰인을 자동 활성화한다", async () => {
    const { router } = routerMock();
    await resumeTransferRecord(MULTI, router);
    expect(useProfessionalStore.getState().activeClientId).toBe("client-A");
  });

  it("건물 기준시가 스냅샷을 복원한다", async () => {
    const withSnap = rec({
      ...SINGLE,
      id: "rec-snap",
      inputData: {
        ...(SINGLE.inputData as Record<string, unknown>),
        buildingStdSnapshots: { "asset-1": { foo: 1 } },
      },
    });
    const { router } = routerMock();
    await resumeTransferRecord(withSnap, router);
    expect(useBuildingStdSnapshotStore.getState().snapshots).toHaveProperty("asset-1");
  });
});

/**
 * ── OH-34 레거시 표식 — 저장 당시 스칼라가 명부와 어긋난 이력의 **세액 보존** ──
 *
 * P7-2 이후 비과세·장특 표2 판정도 명부를 쓴다(계획서 OH-33). 그래서 「선언 1채 + 명부 2행」으로
 * 저장된 이력을 그대로 재계산하면 3채가 되어 **세액이 달라진다**. 조용히 바꾸지 않는다 —
 * 복원 시 표식을 붙여 저장 당시 값으로 계산하고, 「목록 기준으로 전환」을 누를 때만 명부로 센다.
 *
 * 🔑 **술어 anchor(HC-10·HC-11)는 이 배선을 증명하지 않는다.** `resumeTransferRecord`가
 *    표식을 실제로 쓰는지는 store 를 보고 확인해야 한다
 *    (`feedback_library_anchor_does_not_prove_component_uses_it`).
 */
const house = (acquisitionDate: string) => ({
  id: `h-${acquisitionDate}`,
  region: "capital" as const,
  acquisitionDate,
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
});

const legacyRec = (householdHousingCount: string, otherHouses: string[]) =>
  rec({
    id: `rec-legacy-${householdHousingCount}-${otherHouses.length}`,
    inputData: {
      assets: [{ assetKind: "housing", addressJibun: "레거시 주택" }],
      transferDate: "2026-03-03",
      isOneHousehold: true,
      householdHousingCount,
      houses: otherHouses.map(house),
    },
    resultData: { mode: "single", result: { determinedTax: 1 } },
  });

describe("R-4. OH-34 — 복원 시 레거시 표식", () => {
  const flag = () => useCalcWizardStore.getState().formData.legacyHouseCountPrecedence;

  it("[R-4a] 🔑 선언 1채 + 명부 2행(파생 3채) → 표식이 켜진다", async () => {
    const { router } = routerMock();
    await resumeTransferRecord(legacyRec("1", ["2018-01-01", "2019-01-01"]), router);
    expect(flag()).toBe(true);
    // 저장 당시 스칼라는 그대로 남아 있어야 계산의 근거가 된다
    expect(useCalcWizardStore.getState().formData.householdHousingCount).toBe("1");
  });

  it("[R-4b] 정합하면(선언 3 = 1 + 2행) 표식이 꺼진다", async () => {
    const { router } = routerMock();
    await resumeTransferRecord(legacyRec("3", ["2018-01-01", "2019-01-01"]), router);
    expect(flag()).toBe(false);
  });

  it("[R-4c] 명부가 비면 표식이 꺼진다 — D-4 간이 입력은 원래 스칼라가 정본", async () => {
    const { router } = routerMock();
    await resumeTransferRecord(legacyRec("5", []), router);
    expect(flag()).toBe(false);
  });

  /**
   * 🔴 이것이 이 절의 핵심이다. `updateFormData`는 **단순 merge** 라
   * 「어긋나면 켠다」만 구현하면 깨끗한 record 가 **직전 폼의 표식을 물려받는다**.
   */
  it("[R-4d] 🔴 어긋난 이력 → 깨끗한 이력을 연달아 열면 표식이 꺼져 있어야 한다", async () => {
    const { router } = routerMock();
    await resumeTransferRecord(legacyRec("1", ["2018-01-01", "2019-01-01"]), router);
    expect(flag()).toBe(true); // 선행 조건
    await resumeTransferRecord(legacyRec("3", ["2018-01-01", "2019-01-01"]), router);
    expect(flag()).toBe(false);
  });

  it("[R-4e] 주택 양도가 아니면 표식을 붙이지 않는다 (F1)", async () => {
    const { router } = routerMock();
    const r = rec({
      id: "rec-legacy-right",
      inputData: {
        assets: [{ assetKind: "right_to_move_in", addressJibun: "입주권" }],
        transferDate: "2026-03-03",
        householdHousingCount: "1",
        houses: [house("2018-01-01"), house("2019-01-01")],
      },
      resultData: { mode: "single", result: { determinedTax: 1 } },
    });
    await resumeTransferRecord(r, router);
    expect(flag()).toBe(false);
  });
});
