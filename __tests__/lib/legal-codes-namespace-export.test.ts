/**
 * 게이트 — `legal-codes/*` **namespace 노출 보존** (8개 모듈 전수)
 *
 * ## 왜 필요한가
 *
 * `lib/legal-verification/coverage-collect.ts`가 8개 모듈을 **`import * as`** 로 받아
 * namespace의 모든 문자열 leaf를 순회해 법령 인용 **모수**를 만든다. 그래서 어떤 모듈이
 * 800줄 정책으로 쪼개지면서 `export * from "./sub"` 재수출이 끊기면, 그 조문들이
 * **모수에서 조용히 빠진다**.
 *
 * ## 🔴 기존 게이트로는 잡지 못한다 (2026-08-05 실측 — `transfer` 재수출 제거 실험)
 *
 * | 게이트 | 재수출 제거 후 | 잡히나 |
 * |---|---|---|
 * | `npm run verify:legal` | **338건 그대로** | ❌ manifest 기반이라 namespace와 무관 |
 * | `legal-verification-coverage-complete` | 통과 | ❌ "모수 **안**이 100%"만 본다 — 모수가 줄면 공허하게 참 |
 * | `legal-verification-unverifiable` | 통과 | ❌ 모수 **밖** 목록만 본다 |
 * | `tsc` | 통과 | ❌ 직접 import 호출부가 없는 심볼은 안 잡힌다 |
 *
 * ⇒ **이 파일이 유일한 가드다.**
 *
 * ## 왜 `transfer` 전용에서 8개 전수로 넓혔는가
 *
 * 선행 가드(`legal-codes-transfer-reexport.test.ts`)는 `transfer` 계열만 덮었다. 그런데
 * 800줄 정책은 어느 모듈에나 적용되므로 다음 분리가 어디서 날지 알 수 없다 —
 * `stock`(23심볼)·`transfer`(19심볼)·`common`(11심볼)이 특히 커질 여지가 있다.
 *
 * ## 두 층으로 막는다
 *
 * 1. **심볼 존재** — 각 모듈의 최상위 export 이름을 고정한다. 재수출이 끊기면 이름이 사라진다.
 * 2. **인용 leaf 하한** — 심볼은 살아 있는데 그 **안쪽**이 비는 경우를 잡는다
 *    (예: `TRANSFER`는 남았는데 그 아래 상수 묶음이 통째로 빠지는 경우).
 *
 * > ⚠️ **하한은 「줄지 않는다」만 본다.** 조문을 추가하면 늘어나는 게 정상이므로 상한은 두지
 * > 않는다. 하한을 올릴 때는 실측값으로만 갱신할 것(추정 금지).
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as transfer from "@/lib/tax-engine/legal-codes/transfer";
import * as inheritanceGift from "@/lib/tax-engine/legal-codes/inheritance-gift";
import * as acquisition from "@/lib/tax-engine/legal-codes/acquisition";
import * as property from "@/lib/tax-engine/legal-codes/property";
import * as comprehensive from "@/lib/tax-engine/legal-codes/comprehensive";
import * as stock from "@/lib/tax-engine/legal-codes/stock";
import * as burdenedGift from "@/lib/tax-engine/legal-codes/burdened-gift";
import * as common from "@/lib/tax-engine/legal-codes/common";

/**
 * 모듈별 계약. `symbols`는 2026-08-06 실측 전량이고, `minCitations`는 같은 시점의
 * 문자열 leaf 수다. 둘 다 **줄어들면 실패**한다.
 */
const MODULES: ReadonlyArray<{
  name: string;
  ns: Record<string, unknown>;
  /** coverage-collect가 보는 최상위 export (실측 전량) */
  symbols: readonly string[];
  /** 문자열 leaf 하한 — 실측값. 조문 추가로 늘어나는 것은 정상 */
  minCitations: number;
}> = [
  {
    name: "transfer",
    ns: transfer,
    minCitations: 234,
    symbols: [
      // transfer.ts 본체
      "TRANSFER", "EXEMPTION_PROVISO_CONST", "TEMP_TWO_HOUSE_PROVISO_REASONS",
      "ONE_HOUSE_RESIDENCE", "SURCHARGE_EXCLUSION_WINDOW",
      "SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW", "isWithinSurchargeSuspensionWindow",
      // transfer-nbl.ts (재수출)
      "NBL", "NBL_REVENUE_THRESHOLDS", "getNblRevenueThreshold",
      "ESTIMATED_DEDUCTION_RATE", "estimatedDeductionRate", "isSec163_6Clause4Asset",
      // transfer-house.ts (재수출)
      "MULTI_HOUSE", "INHERITED_HOUSE", "MIXED_USE", "TRANSFER_RENTAL_HOUSING",
      "TRANSFER_REDUCTION_ARTICLE", "REDEVELOPMENT", "LTHD_EXCLUSION_LABEL",
    ],
  },
  {
    name: "inheritance-gift",
    ns: inheritanceGift,
    minCitations: 190,
    symbols: ["INH", "GIFT", "VALUATION", "TAX_CREDIT", "EXEMPTION"],
  },
  {
    name: "acquisition",
    ns: acquisition,
    minCitations: 86,
    symbols: ["ACQUISITION", "ACQUISITION_CONST"],
  },
  {
    name: "property",
    ns: property,
    minCitations: 83,
    symbols: [
      "PROPERTY", "PROPERTY_CAL", "PROPERTY_CONST",
      "PROPERTY_EXEMPT", "PROPERTY_SEPARATE", "PROPERTY_SEPARATE_CONST",
    ],
  },
  {
    name: "comprehensive",
    ns: comprehensive,
    minCitations: 54,
    symbols: [
      "COMPREHENSIVE", "COMPREHENSIVE_CONST", "COMPREHENSIVE_EXCL",
      "COMPREHENSIVE_EXCL_CONST", "COMPREHENSIVE_LAND", "COMPREHENSIVE_LAND_CONST",
    ],
  },
  {
    name: "stock",
    ns: stock,
    minCitations: 109,
    symbols: [
      "STOCK", "STOCK_STX", "STOCK_FOREIGN", "STOCK_EXIT_TAX", "STOCK_EXIT_TAX_CONSTS",
      "STOCK_BASIC_DEDUCTION", "STOCK_FOREIGN_BASIC_DEDUCTION",
      "STOCK_FOREIGN_RESIDENT_MIN_YEARS",
      // 2026-08-12 신설 — §104①12호나목 국외주식 20%
      // (§118의5 §55① 누진은 §118②의 준용 목록에 없다)
      "STOCK_FOREIGN_RATE",
      // 2026-08-31 신설 — §104①12호가목 중소기업 10%.
      // 영 §157의3 **2호**(내국법인 발행·해외 증권시장 상장)로 도달한다.
      "STOCK_FOREIGN_SME_RATE",
      "STOCK_ELECTRONIC_FILING_CREDIT",
      "STOCK_ESTIMATED_EXPENSE_RATE", "STOCK_FLOOR_80_PCT",
      "STOCK_LOSS_GAIN_DISCOUNT_RATE", "STOCK_MAJOR_MARKET_CAP_2024",
      "STOCK_NON_MAJOR_NON_SME_RATE", "STOCK_NON_MAJOR_SME_RATE",
      "STOCK_OTHER_ASSET_RE_RATIO_BLOCK", "STOCK_OTHER_ASSET_RE_RATIO_HEAVY",
      "STOCK_PROGRESSIVE_BOUNDARY", "STOCK_PROGRESSIVE_DEDUCTION",
      "STOCK_PROGRESSIVE_RATE_HIGH", "STOCK_PROGRESSIVE_RATE_LOW",
      "STOCK_SHORT_TERM_RATE", "STOCK_VALUATION_RE_HEAVY_RATIO",
    ],
  },
  {
    name: "burdened-gift",
    ns: burdenedGift,
    minCitations: 18,
    symbols: [
      "BURDENED_GIFT_TRANSFER", "ANNUAL_RENT_CAPITALIZATION_EFFECTIVE_DATE",
      "ANNUAL_RENT_CAPITALIZATION_RATE_AFTER_2009_04_23",
      "REGISTERED_ESTIMATED_DEDUCTION_RATE", "UNREGISTERED_ESTIMATED_DEDUCTION_RATE",
    ],
  },
  {
    name: "common",
    ns: common,
    minCitations: 14,
    symbols: [
      "PENALTY", "PENALTY_CONST", "AMENDMENT_45", "AMENDMENT_48_1_2", "AMENDMENT_48_2",
      "AMENDMENT_REDUCTION_48_2", "CORRECTION_CLAIM_45_2", "REFUND_GAIN_52",
      "REFUND_GAIN_RATE_ANNUAL", "CLAIM_PERIOD_ORDINARY_YEARS",
      "CLAIM_PERIOD_POSTERIOR_MONTHS",
    ],
  },
];

/** `coverage-collect.ts`와 **같은 순회** — 재현하지 않으면 가드가 실제 모수를 지키지 못한다 */
function countCitationLeaves(v: unknown): number {
  if (typeof v === "string") return 1;
  if (v && typeof v === "object") {
    return Object.values(v as Record<string, unknown>).reduce<number>(
      (n, x) => n + countCitationLeaves(x),
      0,
    );
  }
  return 0;
}

describe.each(MODULES)("legal-codes/$name — namespace 노출", ({ name, ns, symbols, minCitations }) => {
  it(`NS-${name}-1: 실측 심볼 ${symbols.length}개가 모두 노출된다`, () => {
    const missing = symbols.filter((s) => !(s in ns));
    expect(
      missing,
      `재수출이 끊겼다 — 누락 심볼: ${missing.join(", ")}. ` +
        `coverage-collect의 법령 인용 모수에서 조용히 빠진다(verify:legal·coverage-complete 모두 못 잡는다).`,
    ).toEqual([]);
  });

  it(`NS-${name}-2: 인용 leaf가 ${minCitations}개 이상이다 (심볼은 남고 안쪽만 비는 경우)`, () => {
    const n = countCitationLeaves(ns);
    expect(
      n,
      `인용 leaf가 ${minCitations} → ${n}으로 줄었다. 조문을 의도적으로 삭제했다면 ` +
        `이 하한을 실측값으로 낮춰 갱신할 것(추정 금지).`,
    ).toBeGreaterThanOrEqual(minCitations);
  });
});

/**
 * 분리된 모듈은 **하위 파일별로** 기여를 확인한다.
 *
 * 심볼 존재·leaf 하한만으로는 "어느 하위 파일이 빠졌는지"까지는 말해주지 못한다.
 * 현재 분리된 것은 `transfer`(3파일)뿐이므로 여기만 파일 단위로 못 박는다 —
 * 다른 모듈이 800줄 정책으로 쪼개지면 같은 형태를 추가할 것.
 *
 * ⚠️ **인용 표기는 파일마다 다르다**(실측): `transfer-nbl`은 `§168조의6`,
 * `transfer-house`는 `§167의3`(「조의」 없음). 추측으로 쓰면 정상 상태에서도 실패한다.
 */
describe("legal-codes/transfer — 하위 파일별 인용 기여", () => {
  const collect = (ns: object): string[] => {
    const out: string[] = [];
    const seen = new WeakSet<object>();
    const walk = (v: unknown) => {
      if (typeof v === "string") return void out.push(v);
      if (!v || typeof v !== "object" || seen.has(v)) return;
      seen.add(v);
      Object.values(v as Record<string, unknown>).forEach(walk);
    };
    Object.values(ns).forEach(walk);
    return out;
  };

  it.each([
    ["transfer-nbl.ts", "§104조의3"],
    ["transfer.ts(본체)", "소득세법 §92"],
    ["transfer-house.ts", "§167의3"],
  ])("NS-SPLIT: %s의 대표 인용이 모수에 들어온다", (file, literal) => {
    const strings = collect(transfer);
    expect(
      strings.some((s) => s.includes(literal)),
      `${file} 인용 없음 — 그 파일의 재수출이 끊겼다`,
    ).toBe(true);
  });
});

describe("가드 자체의 유효성", () => {
  it("NS-META-1: coverage-collect가 legal-codes 디렉터리 전건을 덮는다", () => {
    // ⚠️ 종전에는 `toHaveLength(8)` 이라 **드리프트를 잡는 대신 고정**했다 —
    //    모듈이 추가돼도 이 단언은 그대로 통과하고, 그 모듈의 조문은 모수에서 사라져
    //    uncovered 에도 뜨지 않은 채 게이트가 100% 로 초록불이 됐다(F-39).
    //    ⇒ 디렉터리 열거와 대조해 「새 모듈이 생기면 자동으로 걸리게」 한다.
    const dir = "lib/tax-engine/legal-codes";
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => path.basename(f, ".ts"));
    // `transfer.ts` 가 `export *` 로 재수출하는 모듈은 직접 import 하지 않아도 구제된다.
    const transferSrc = fs.readFileSync(path.join(dir, "transfer.ts"), "utf8");
    const reExported = new Set(
      [...transferSrc.matchAll(/export \* from "\.\/([\w-]+)"/g)].map((m) => m[1]),
    );
    const collectSrc = fs.readFileSync("lib/legal-verification/coverage-collect.ts", "utf8");
    const uncovered = files.filter(
      (m) => !reExported.has(m) && !collectSrc.includes(`legal-codes/${m}"`),
    );
    expect(uncovered).toEqual([]);
  });

  it("NS-META-2: 각 모듈의 심볼 목록이 실제 export 전량이다 (누락 없이 고정했는가)", () => {
    // 표에 적은 목록이 실제보다 적으면, 빠뜨린 심볼의 재수출이 끊겨도 통과한다.
    for (const { name, ns, symbols } of MODULES) {
      const actual = Object.keys(ns).sort();
      expect([...symbols].sort(), `${name}: 표와 실제 export가 다르다`).toEqual(actual);
    }
  });
});
