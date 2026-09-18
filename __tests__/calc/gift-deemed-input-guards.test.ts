/**
 * 입력 가드 — 「미입력은 검증 오류로 차단」 정책의 구멍 6개 (W13 · RC-F·RC-G·RC-H·RC-L·SC-H·SC-N).
 *
 * 공통 실패 형태는 하나다: **화면에서 비어 있거나 존재하지 않는 값이 ⑧을 통과해 조용히 0이 되거나
 * 조용히 무시된다.** 저장소 정책(자동 안분 fallback 금지 · 미입력은 검증 오류로 차단)의 정면 위반이고,
 * 결과는 0원인데 사유가 없거나 **원인과 무관한 사유**가 표시된다.
 *
 * ⚠️ `parseAmount("") === 0`이라 `<= 0`·`< 0` 형태의 검사는 **공란을 통과시킨다**.
 *    0·음수가 적법한 필드는 «원문자열의 공백»만 막아야 한다(RC-F).
 */
import { describe, it, expect } from "vitest";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";

function rcForm(patch: Partial<DeemedFormState> = {}): DeemedFormState {
  return {
    ...INITIAL_DEEMED,
    type: "related_corp",
    giftDate: "2025-12-31",
    rcEnterpriseSize: "small",
    rcTotalSalesStr: "100000000000",
    rcPreTaxAdjOperatingIncomeStr: "10000000000",
    rcTaxableIncomeStr: "10000000000",
    rcCorporateTaxNetStr: "2000000000",
    rcShareholders: [
      { id: "gap", name: "갑", relation: "self", directRatioPctStr: "20", isCorporate: false, dividendFromBeneficiaryStr: "" },
      { id: "A", name: "A법인", relation: "other", directRatioPctStr: "50", isCorporate: true, dividendFromBeneficiaryStr: "" },
      { id: "byung", name: "병", relation: "other", directRatioPctStr: "30", isCorporate: false, dividendFromBeneficiaryStr: "" },
    ],
    rcIntermediaryCorps: [
      { id: "i1", corpShareholderId: "A", stakeInBeneficiaryPctStr: "50", distributableProfitStr: "",
        owners: [{ individualId: "gap", ratioPctStr: "80", dividendIncomeStr: "" }] },
    ],
    rcSalesPartners: [
      { id: "sD", name: "D법인", salesAmountStr: "80000000000", isRelated: true,
        exclusionType: "", beneficiaryStakePctStr: "", intermediaryCorpShareholderId: "", rulingStakes: [] },
      { id: "sE", name: "기타", salesAmountStr: "20000000000", isRelated: false,
        exclusionType: "", beneficiaryStakePctStr: "", intermediaryCorpShareholderId: "", rulingStakes: [] },
    ],
    ...patch,
  } as unknown as DeemedFormState;
}

describe("RC-F — 0·음수가 적법한 필드는 «공란»만 막는다", () => {
  it("[G-F0] 긍정 짝 — 완성된 폼은 통과한다", () => {
    expect(validateDeemedInput(rcForm())).toBeNull();
  });

  it("[G-F1] 세무조정 후 영업손익 공란은 차단된다 (종전: 통과 → 증여의제이익 0원, 사유 없음)", () => {
    expect(validateDeemedInput(rcForm({ rcPreTaxAdjOperatingIncomeStr: "" }))).toContain(
      "세무조정 후 영업손익",
    );
  });

  it("[G-F2] 법인세 순세액 공란도 차단된다 (종전: `< 0` 검사를 그대로 지나갔다)", () => {
    expect(validateDeemedInput(rcForm({ rcCorporateTaxNetStr: "" }))).toContain("법인세 순세액");
  });

  it("[G-F3] 0과 음수는 **적법한 값**이라 통과해야 한다 — 공란 차단이 이 경로를 막으면 안 된다", () => {
    expect(validateDeemedInput(rcForm({ rcCorporateTaxNetStr: "0" }))).toBeNull();
    expect(validateDeemedInput(rcForm({ rcPreTaxAdjOperatingIncomeStr: "-5000000000" }))).toBeNull();
  });
});

describe("RC-H — 고아 참조는 화면에서 「미선택」인데 통과했다", () => {
  it("[G-H1] 간접출자법인 소유주가 현재 개인 주주가 아니면 차단한다", () => {
    const f = rcForm();
    (f.rcIntermediaryCorps[0].owners[0] as unknown as Record<string, string>).individualId = "삭제된주주";
    expect(validateDeemedInput(f)).toContain("개인 주주가 아닙니다");
  });

  it("[G-H2] 법인주주를 개인으로 뒤집으면 그를 가리키던 소유주 참조도 고아가 된다", () => {
    // 「비어있지 않음」만 보던 종전 술어로는 이 상태가 통과했다.
    const f = rcForm();
    (f.rcIntermediaryCorps[0].owners[0] as unknown as Record<string, string>).individualId = "A";
    expect(validateDeemedInput(f)).toContain("개인 주주가 아닙니다");
  });

  it("[G-H3] §⑭3호 주주 참조도 같은 집합으로 본다", () => {
    const f = rcForm();
    (f.rcSalesPartners[0] as unknown as Record<string, unknown>).rulingStakes = [
      { shareholderId: "사라진주주", ratioPctStr: "15" },
    ];
    expect(validateDeemedInput(f)).toContain("개인 주주가 아닙니다");
  });

  it("[G-H4] 긍정 짝 — 정상 id는 통과한다", () => {
    const f = rcForm();
    (f.rcSalesPartners[0] as unknown as Record<string, unknown>).rulingStakes = [
      { shareholderId: "gap", ratioPctStr: "15" },
    ];
    expect(validateDeemedInput(f)).toBeNull();
  });
});

describe("RC-L — 같은 값을 두 곳에서 받고 교차검증이 없었다", () => {
  it("[G-L1] 법인주주 직접지분(50%)과 간접출자법인 수혜법인 지분(40%)이 다르면 차단한다", () => {
    // 엔진은 섹션3 값만 쓰고, 화면의 「지분합계 100%」 배지는 섹션2 값만 본다.
    expect(
      validateDeemedInput(
        rcForm({
          rcIntermediaryCorps: [
            { id: "i1", corpShareholderId: "A", stakeInBeneficiaryPctStr: "40", distributableProfitStr: "",
              owners: [{ individualId: "gap", ratioPctStr: "80", dividendIncomeStr: "" }] },
          ],
        } as unknown as Partial<DeemedFormState>),
      ),
    ).toContain("다릅니다");
  });

  it("[G-L2] 긍정 짝 — 같으면 통과한다 (0.01%p 톨러런스는 R-4와 같다)", () => {
    expect(validateDeemedInput(rcForm())).toBeNull();
  });
});

describe("RC-G — ④가 언마운트 빈 행을 보내 ⑫에서 400이 나던 경로", () => {
  it("[G-G1] 법인주주를 없애면 남은 간접출자 빈 행이 ④에서 걸러진다", () => {
    // 폼은 그 행을 **의도적으로 보존**한다(주주 유형을 되돌리면 복구된다). ④가 거른다.
    const f = rcForm({
      rcShareholders: [
        { id: "gap", name: "갑", relation: "self", directRatioPctStr: "20", isCorporate: false, dividendFromBeneficiaryStr: "" },
        { id: "byung", name: "병", relation: "other", directRatioPctStr: "80", isCorporate: false, dividendFromBeneficiaryStr: "" },
      ],
      rcIntermediaryCorps: [
        { id: "i1", corpShareholderId: "", stakeInBeneficiaryPctStr: "", distributableProfitStr: "", owners: [] },
      ],
    } as unknown as Partial<DeemedFormState>);
    expect(validateDeemedInput(f)).toBeNull(); // ⑧은 섹션 게이트가 닫혀 건너뛴다
    const input = buildDeemedGiftInput(f) as unknown as Record<string, unknown>;
    expect(input.intermediaryCorps).toEqual([]); // ④가 걸렀다
    expect(deemedGiftInputSchema.safeParse(JSON.parse(JSON.stringify(input))).success).toBe(true);
  });

  it("[G-G2] 긍정 짝 — 정상 행은 ④를 그대로 통과한다", () => {
    const input = buildDeemedGiftInput(rcForm()) as unknown as Record<string, unknown>;
    expect((input.intermediaryCorps as unknown[]).length).toBe(1);
  });
});

// ── §45의5 ──────────────────────────────────────────────────────────────
function scForm(patch: Partial<DeemedFormState> = {}): DeemedFormState {
  return {
    ...INITIAL_DEEMED,
    type: "specific_corp",
    giftDate: "2025-12-31",
    scCounterparty: "ruling_shareholder",
    scTransactionType: "gratuitous",
    scTransactionBenefit: "1000000000",
    scMode: "roster",
    scCorporateTaxMode: "direct",
    scTotalShares: "50000",
    scShareholders: [
      { id: "1", name: "갑", relation: "lineal_descendant", shares: "30000", isDonor: false },
      { id: "2", name: "을", relation: "lineal_descendant", shares: "20000", isDonor: false },
    ],
    ...patch,
  } as unknown as DeemedFormState;
}

describe("SC-H — 주식수 정합 (§45의3의 R-4·R-7과 비대칭이었다)", () => {
  it("[G-S0] 긍정 짝 — 합계가 총수와 같으면 통과한다", () => {
    expect(validateDeemedInput(scForm())).toBeNull();
  });

  it("[G-S1] 한 주주의 주식수가 발행주식 총수를 넘으면 **그 행을 짚어** 차단한다 (실측 지분율 120%)", () => {
    // ⚠️ 행별 상한은 합계 상한에 **수학적으로 포섭**된다(주식수가 음수일 수 없으므로 한 행이
    //    총수를 넘으면 합계도 넘는다). 따라서 이 가드의 값은 「어느 행인지 짚어 주는 메시지」에
    //    있고, anchor도 그것을 단언해야 구별력이 생긴다 — 「발행주식 총수」만 보면 합계 메시지도
    //    통과해 뮤테이션이 살아남는다(실측).
    const f = scForm();
    (f.scShareholders![0] as unknown as Record<string, string>).shares = "60000";
    expect(validateDeemedInput(f)).toBe("주주 1의 주식수가 발행주식 총수(50,000주)를 초과합니다");
  });

  it("[G-S2] 합계가 총수를 넘으면 차단한다 (실측 Σ가 특정법인의 이익의 160%)", () => {
    const f = scForm();
    (f.scShareholders![0] as unknown as Record<string, string>).shares = "40000";
    (f.scShareholders![1] as unknown as Record<string, string>).shares = "40000";
    expect(validateDeemedInput(f)).toContain("합계");
  });

  it("[G-S3] ⑫Zod에도 같은 관문이 있다 — ⑧은 클라이언트라 우회 가능하다", () => {
    const f = scForm();
    (f.scShareholders![0] as unknown as Record<string, string>).shares = "60000";
    const parsed = deemedGiftInputSchema.safeParse(
      JSON.parse(JSON.stringify(buildDeemedGiftInput(f))),
    );
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    // 같은 이유로 **path**까지 본다 — 어느 행인지 짚지 못하면 행별 관문의 값이 없다.
    expect(parsed.error.issues.some((i) => i.path.join(".") === "shareholders.0.shares")).toBe(true);
  });
});

describe("SC-N — single 지분율 미입력이 「1억원 미만」이라는 비진단적 사유로 나왔다", () => {
  const single = (ratio: string) =>
    scForm({ scMode: "single", scRatioPct: ratio } as unknown as Partial<DeemedFormState>);

  it("[G-N1] 지분율 미입력은 차단된다", () => {
    expect(validateDeemedInput(single(""))).toContain("주식보유비율");
  });

  it("[G-N2] 100% 초과도 차단된다", () => {
    expect(validateDeemedInput(single("120"))).toContain("100% 이하");
  });

  it("[G-N3] 긍정 짝 — 정상 비율은 통과한다", () => {
    expect(validateDeemedInput(single("40"))).toBeNull();
  });
});
