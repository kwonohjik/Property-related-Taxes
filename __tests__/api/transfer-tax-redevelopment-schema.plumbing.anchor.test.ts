/**
 * anchor — ⑫ `redevelopmentSchema` **필드 집합 보존** (T1-02)
 *
 * ## 왜 필요한가 — 안전망이 0이었다
 *
 * 스키마에서 필드를 하나 지워도 회귀가 **0/14314**였다(2026-08-26 실측 · `landStdPriceAtAcq` 제거).
 * 이 스키마를 실제로 태우는 테스트가 한 건도 없었기 때문이다 — import하는 곳은
 * `lib/api/transfer-tax-schema.ts` 뿐이고, `redevelopment`를 body에 넣는 route 테스트들은
 * 결과 객체의 키 존재/부재만 볼 뿐 스키마 통과 후의 **필드 생존**을 보지 않는다.
 *
 * 아이러니하게도 문제의 필드들에는 코드에 「★★★ 침묵 stripping 차단」 주석이 달려 있는데,
 * 정작 그 회귀를 잡는 테스트가 없었다. Zod는 **모르는 키를 조용히 버린다** — 400도, 타입 에러도,
 * 테스트 실패도 나지 않고 엔진 입력에서만 사라진다(memory `feedback_api_zod_schema_sync`).
 *
 * 리뷰 실측: `landStdPriceAtAcq`가 strip되면 §166③ 환산 분자가 사라져 인가전 취득가액
 * 200,000,000 → 0, 총납부세액 57,995,960 → 123,486,000 (Δ +65,490,040).
 *
 * ## 왜 필드별 세액 anchor 26개를 만들지 않는가
 *
 * strip은 **키가 사라지는 것**이라 값이 아니라 **키 집합**을 보면 한 번에 전부 걸린다.
 * 세액 anchor는 그 필드가 실제로 산식에 들어가는 경로에서만 반응하므로, 조합 폭발 없이
 * 26개 optional 필드를 동시에 지키려면 집합 대조가 정확한 도구다.
 *
 * ⚠️ 이 anchor는 **필드가 살아남는지**만 본다. 그 값이 옳게 쓰이는지는 각 분기의 세액 anchor가
 *    맡는다 — 둘을 섞으면 어느 쪽이 깨졌는지 구별할 수 없다.
 */
import { describe, it, expect } from "vitest";
import { redevelopmentSchema } from "@/lib/api/transfer-tax-redevelopment-schema";

/**
 * §166 축 전 필드를 담은 payload — 새 필드를 스키마에 넣으면 **여기에도 넣어야** 한다.
 * (넣지 않으면 이 anchor는 그 필드를 보호하지 못한다 — 아래 T1-02-03이 그 사실을 드러낸다.)
 */
const FULL_PAYLOAD = {
  subject: "right",
  approvalLawBasis: "urban_renovation_art_74",
  approvalDate: "2018-10-23",
  rightsValue: 300_000_000,
  settlementDirection: "pay",
  settlementAmount: 90_000_000,
  settlementSaleDate: "2023-03-02",
  preApprovalExpenses: 5_000_000,
  postApprovalExpenses: 3_000_000,
  originalAssetType: "land",
  acquisitionStdPrice: 80_000_000,
  managementDisposalStdPrice: 150_000_000,
  firstDisclosureDate: "2005-01-01",
  firstDisclosureHousingPrice: 90_000_000,
  firstDisclosureStdPrice: 85_000_000,
  landArea: 100,
  landPricePerSqmAtAcq: 500_000,
  buildingStdPriceAtAcq: 30_000_000,
  landPricePerSqmAtFirst: 700_000,
  buildingStdPriceAtFirst: 40_000_000,
  landStdPriceAtAcq: 100_000_000,
  landStdPriceAtApproval: 150_000_000,
  housingStdPriceAtAcq: 120_000_000,
  housingStdPriceAtApproval: 180_000_000,
  managementDisposalHousingPrice: 160_000_000,
  acquisitionHousingPrice: 110_000_000,
  isSuccessorMember: false,
  completionDate: "2021-05-01",
  receiveOnlyMode: false,
  exemptionEligibleAtApproval: true,
  priorHouseResidenceMonths: 24,
  newHouseResidenceMonths: 12,
  priorResidenceStartDate: "2005-01-01",
  priorResidenceEndDate: "2007-01-01",
  newResidenceStartDate: "2021-06-01",
  newResidenceEndDate: "2022-06-01",
  priorHouseHoldingMonths: 60,
  otherHouseAcquisitionDate: "2021-01-01",
  acquisitionRounding: "floor",
} as const;

describe("T1-02 · ⑫ redevelopmentSchema 필드 집합 보존", () => {
  it("T1-02-01: 전 필드 payload가 스키마를 통과한다", () => {
    const parsed = redevelopmentSchema.safeParse(FULL_PAYLOAD);
    if (!parsed.success) {
      throw new Error(`스키마 거부: ${JSON.stringify(parsed.error.issues, null, 2)}`);
    }
    expect(parsed.success).toBe(true);
  });

  it("T1-02-02: 🔑 입력 키가 하나도 소실되지 않는다 (침묵 stripping 차단)", () => {
    const parsed = redevelopmentSchema.parse(FULL_PAYLOAD) as Record<string, unknown>;
    const inputKeys = Object.keys(FULL_PAYLOAD).sort();
    const survived = Object.keys(parsed).sort();
    const dropped = inputKeys.filter((k) => !survived.includes(k));
    // 종전: 스키마에서 필드를 지워도 전건 통과 — 여기서 그 필드가 `dropped`로 잡힌다.
    expect(dropped, `스키마가 조용히 버린 필드: ${dropped.join(", ")}`).toEqual([]);
  });

  it("T1-02-03: 🔑 스키마의 모든 키가 이 픽스처에 있다 — 새 필드가 무방비로 추가되는 것을 막는다", () => {
    // 스키마가 아는 키 전부를 얻기 위해 빈 객체를 파싱하지 않고 shape을 직접 읽는다.
    const shapeKeys = Object.keys(
      (redevelopmentSchema as unknown as { _def: { innerType?: { shape: object }; shape?: object } })
        ._def.innerType?.shape ??
        (redevelopmentSchema as unknown as { _def: { shape: object } })._def.shape,
    ).sort();
    const fixtureKeys = Object.keys(FULL_PAYLOAD).sort();
    const missing = shapeKeys.filter((k) => !fixtureKeys.includes(k));
    expect(
      missing,
      `스키마에는 있는데 이 anchor 픽스처에 없는 필드(보호되지 않음): ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
