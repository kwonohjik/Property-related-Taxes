/**
 * anchor(⑧·④) — 같은 날 퇴거·재입주한 거주 구간 (1세대1주택 리뷰 결정 #37 · S12-7)
 *
 * 거주기간은 「전입일부터 전출일까지」 초일 산입(소령 §154⑥)이라, 「앞 구간 퇴거일 = 다음 구간 입주일」을
 * 그대로 두면 그날이 두 구간에 한 번씩 들어가 합계가 1개월 커진다.
 *
 *   [2019-11-09~2020-05-08] + [2020-05-08~2021-11-07]  → 구간별 6 + 18 = 24개월 (같은 날 두 번)
 *   한 구간 [2019-11-09~2021-11-07]                    → 23개월
 *
 * 그래서 입력 단계(⑧)에서 막고 한 구간으로 합쳐 입력하게 한다 — 계산 합집합(B안)이 아니다.
 * 모든 부정형 단언에 긍정 짝을 둔다.
 */
import { describe, it, expect } from "vitest";
import { collectResidenceIntervalErrors } from "@/lib/calc/residence-interval-validate";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { sumResidenceMonths } from "@/lib/stores/calc-wizard-asset-residence";
import { validateStep3 } from "@/lib/calc/one-house-exemption-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const SAME_DAY = [
  { moveInDate: "2019-11-09", moveOutDate: "2020-05-08" },
  { moveInDate: "2020-05-08", moveOutDate: "2021-11-07" },
];
const UNION = [{ moveInDate: "2019-11-09", moveOutDate: "2021-11-07" }];
const NEXT_DAY = [
  { moveInDate: "2019-11-09", moveOutDate: "2020-05-08" },
  { moveInDate: "2020-05-09", moveOutDate: "2021-11-07" },
];
const COMMON = { acquisitionDate: "2019-11-01", transferDate: "2026-03-20" } as const;

describe("#37 같은 날 퇴거·재입주 — 합산 사실(차단 사유)", () => {
  it("[S37-1] 같은 날 경계는 구간별 6+18=24개월, 한 구간은 23개월 — 이중 산입 확인", () => {
    expect(sumResidenceMonths(SAME_DAY, COMMON.transferDate)).toBe(24);
    expect(sumResidenceMonths(UNION, COMMON.transferDate)).toBe(23);
    // 다음 날 이어 입주한 구간은 구간마다 잘라 센다 — 이 통산 셈법은 별건(해석례 확인 필요)으로 남긴다
    expect(sumResidenceMonths(NEXT_DAY, COMMON.transferDate)).toBe(23);
  });
});

describe("#37 같은 날 퇴거·재입주 — ⑧ 공유 leaf", () => {
  it("[S37-2] 같은 날 경계 → 차단 1건, 입주일 칸에 걸리고 「합쳐서 입력 / 실제 재입주일로 수정」 안내", () => {
    const { result: errs, fieldOf } = collectWithFields(() => collectResidenceIntervalErrors({ periods: SAME_DAY, ...COMMON }));
    expect(errs).toHaveLength(1);
    expect(fieldOf(errs[0])).toBe("residencePeriods.1.moveInDate");
    expect(errs[0]).toContain("같은 날(2020-05-08)");
    expect(errs[0]).toContain("한 구간으로 합쳐서 입력");
    expect(errs[0]).toContain("실제 재입주일이 다르면 그 날짜로 수정");
    expect(errs[0]).not.toContain("다음 날");
  });

  it("[S37-3] 긍정 짝 — 한 구간 / 하루 간격 / 떨어진 구간은 통과", () => {
    for (const periods of [UNION, NEXT_DAY, [
      { moveInDate: "2019-11-09", moveOutDate: "2020-05-08" },
      { moveInDate: "2020-08-01", moveOutDate: "2021-11-07" },
    ]]) {
      expect(collectResidenceIntervalErrors({ periods, ...COMMON })).toHaveLength(0);
    }
  });

  it("[S37-4] 입력 순서가 뒤섞여도 같은 날 경계를 찾는다(정렬 후 비교)", () => {
    const errs = collectResidenceIntervalErrors({ periods: [SAME_DAY[1], SAME_DAY[0]], ...COMMON });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("같은 날(2020-05-08)");
  });

  it("[S37-5] 진짜 겹침은 기존 「겹칩니다」 문구를 유지하되 합쳐 입력 안내로 맞춘다", () => {
    const errs = collectResidenceIntervalErrors({
      periods: [
        { moveInDate: "2019-11-09", moveOutDate: "2020-06-08" },
        { moveInDate: "2020-05-08", moveOutDate: "2021-11-07" },
      ],
      ...COMMON,
    });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("겹칩니다");
    expect(errs[0]).toContain("한 구간으로 합쳐서 입력");
    expect(errs[0]).not.toContain("같은 날(");
  });
});

describe("#37 같은 날 퇴거·재입주 — 판정 메뉴 ② 단계", () => {
  const asset = (over: Partial<AssetForm>): AssetForm =>
    ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: COMMON.acquisitionDate, ...over }) as AssetForm;
  const jForm = (periods: Array<{ moveInDate: string; moveOutDate: string }>) =>
    ({
      ...createInitialOneHouseJudgmentForm(),
      assets: [asset({ residenceInputMode: "interval", residencePeriods: periods })],
      transferDate: COMMON.transferDate,
      contractTotalPrice: "800000000",
      isOneHousehold: true,
      houses: [],
      presaleRights: [],
    }) as unknown as OneHouseJudgmentFormData;
  const errorsOf = (f: OneHouseJudgmentFormData) => validateStep3(f).filter((e) => e.severity === "error").map((e) => e.message);

  it("[S37-6] 판정 메뉴도 같은 leaf로 같은 날 경계를 막는다 / 한 구간은 통과", () => {
    expect(errorsOf(jForm(SAME_DAY)).some((m) => m.includes("같은 날(2020-05-08)"))).toBe(true);
    expect(errorsOf(jForm(UNION)).filter((m) => m.startsWith("거주 구간"))).toHaveLength(0);
  });
});
