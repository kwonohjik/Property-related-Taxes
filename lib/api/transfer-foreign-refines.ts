/**
 * ⑩ 국외 부동산 Zod refine — 엔진이 던지는 검증과 **같은 함수**를 부른다(복제 금지).
 *
 * 엔진 쪽 정본: `lib/tax-engine/foreign-realestate/input-asserts.ts`(날짜·과세기간·id·외국납부세액) · `fx.ts`의 `tryToKrw`(환율·외화액).
 * 엔진은 첫 오류에서 던지지만 Zod는 refine마다 독립으로 돌아 한 번에 여러 칸을 알린다. 이슈의 `path`·`params.engineCode`는 엔진 오류의
 * `details.path`·`code`와 같다(⑧↔⑫ 패리티 테스트가 격자로 고정: `__tests__/api/transfer-foreign.parity.test.ts`).
 *
 * refine은 `FOREIGN_RE_REFINES`에 id를 붙여 모았다 — 뮤테이션 테스트가 하나씩 빼서 그 id가 지키는 행이 실제로 빨개지는지 확인한다.
 * 어떤 refine도 다른 refine이 소유한 오류를 대신 막지 않는다(소유 1:1).
 */
import type { z } from "zod";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { tryToKrw } from "@/lib/tax-engine/foreign-realestate/fx";
import {
  assertAcquisitionNotAfterTransfer,
  assertAssetsPresent,
  assertDomesticResidenceYears,
  assertForeignTaxAssetId,
  assertSameTaxYear,
  assertSupportedTransferDate,
  assertUniqueAssetIds,
  assertValidDate,
} from "@/lib/tax-engine/foreign-realestate/input-asserts";
import type { ForeignRealEstateBaseInput } from "./transfer-foreign-schema";

type Ctx = z.RefinementCtx;

/** `"assets[0].transfer.exchangeRate"` → `["assets", 0, "transfer", "exchangeRate"]` (엔진 `details.path` 표기 → Zod 이슈 경로) */
export function engineErrorPathToZodPath(path: string): (string | number)[] {
  return [...path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)].map((m) => (m[2] !== undefined ? Number(m[2]) : m[1]));
}

function report(ctx: Ctx, e: TaxCalculationError): void {
  const path = typeof e.details?.path === "string" ? engineErrorPathToZodPath(e.details.path) : [];
  ctx.addIssue({ code: "custom", path, message: e.message, params: { engineCode: e.code } });
}

/** 엔진의 `assert*`를 부르고 던진 `TaxCalculationError`를 이슈로 바꾼다. 다른 예외는 그대로 던진다(숨기지 않는다). */
function check(ctx: Ctx, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    if (e instanceof TaxCalculationError) report(ctx, e);
    else throw e;
  }
}

type Data = ForeignRealEstateBaseInput;
type Money = Data["assets"][number]["transfer"];

/** 자산 1건의 외화 항목들과 엔진 경로 — `convertItem`이 쓰는 경로와 같다 */
function assetMoneyItems(a: Data["assets"][number], i: number): { item: Money; path: string }[] {
  const p = `assets[${i}]`;
  return [
    { item: a.transfer, path: `${p}.transfer` },
    { item: a.acquisition, path: `${p}.acquisition` },
    ...a.capitalExpenditures.map((item, j) => ({ item, path: `${p}.capitalExpenditures[${j}]` })),
    ...a.transferCosts.map((item, j) => ({ item, path: `${p}.transferCosts[${j}]` })),
  ];
}

/** `convertItem`과 같은 순서: 날짜 → 환산(환율·외화액) */
function checkMoneyItem(ctx: Ctx, item: Money, path: string, what: "date" | "money"): void {
  if (what === "date") {
    check(ctx, () => assertValidDate(toOptionalDate(item.date), `${path}.date`));
    return;
  }
  const r = tryToKrw(item.amountForeign, item.exchangeRate, path);
  if ("error" in r) report(ctx, r.error);
}

/** 날짜가 모두 유효한 자산 인덱스만 — 날짜 이슈는 `asset-dates` refine이 소유한다 */
function datedAssets(d: Data): { transferDate: Date; acquisitionDate: Date; index: number }[] {
  return d.assets.flatMap((a, index) => {
    const transferDate = toOptionalDate(a.transferDate);
    const acquisitionDate = toOptionalDate(a.acquisitionDate);
    return transferDate && acquisitionDate ? [{ transferDate, acquisitionDate, index }] : [];
  });
}

export interface ForeignRealEstateRefine {
  /** 뮤테이션 테스트가 가리키는 이름 */
  id: string;
  run: (d: Data, ctx: Ctx) => void;
}

export const FOREIGN_RE_REFINES: readonly ForeignRealEstateRefine[] = [
  { id: "residence-years", run: (d, ctx) => check(ctx, () => assertDomesticResidenceYears(d.domesticResidenceYears)) },
  { id: "assets-present", run: (d, ctx) => check(ctx, () => assertAssetsPresent(d.assets.length)) },
  { id: "asset-ids-unique", run: (d, ctx) => check(ctx, () => assertUniqueAssetIds(d.assets.map((a) => a.id))) },
  {
    // 양도일·취득일·항목별 일자 — 잘못된 문자열은 route의 `toDate`가 던지기 전에 여기서 막는다
    id: "asset-dates-valid",
    run: (d, ctx) =>
      d.assets.forEach((a, i) => {
        check(ctx, () => assertValidDate(toOptionalDate(a.transferDate), `assets[${i}].transferDate`));
        check(ctx, () => assertValidDate(toOptionalDate(a.acquisitionDate), `assets[${i}].acquisitionDate`));
        assetMoneyItems(a, i).forEach(({ item, path }) => checkMoneyItem(ctx, item, path, "date"));
      }),
  },
  {
    // 환율 > 0(미입력·0 불가) · 소수 4자리 이하 · 외화액 ≥ 0 · 원화 환산 안전 정수 범위 — 엔진 `toKrw`와 같은 함수
    id: "asset-money",
    run: (d, ctx) => d.assets.forEach((a, i) => assetMoneyItems(a, i).forEach(({ item, path }) => checkMoneyItem(ctx, item, path, "money"))),
  },
  {
    id: "acquisition-not-after-transfer",
    run: (d, ctx) => datedAssets(d).forEach((a) => check(ctx, () => assertAcquisitionNotAfterTransfer(a, a.index))),
  },
  {
    // 법 §118의5·§118의7 현행 문언 시행일(2020-01-01) 이전 양도 — 엔진과 같은 술어(`isForeignRealEstateSupportedTransferDate`)
    id: "transfer-date-supported",
    run: (d, ctx) => datedAssets(d).forEach((a) => check(ctx, () => assertSupportedTransferDate(a.transferDate, a.index))),
  },
  {
    // 과세기간(양도일 연도) 동일 — 날짜가 하나라도 깨졌으면 `asset-dates-valid`가 알린다
    id: "same-tax-year",
    run: (d, ctx) => {
      const dated = datedAssets(d);
      if (dated.length === d.assets.length && dated.length > 0) check(ctx, () => assertSameTaxYear(dated));
    },
  },
  {
    // 외국납부세액 — 자산 id 소속·항목별 납부일·환율(양도일 환율로 대체하지 않는다). 방법(credit|expense)은 enum(⑨)이 막는다 — 엔진 `assertForeignTaxMethod`와 같은 값 집합.
    id: "foreign-tax-items",
    run: (d, ctx) => {
      const ft = d.foreignTax;
      if (!ft || ft.items.length === 0) return; // 엔진 `prepareForeignTax`: 항목이 없으면 §118의6 미적용
      const ids = d.assets.map((a) => a.id);
      ft.items.forEach((item, i) => {
        const path = `foreignTax.items[${i}]`;
        check(ctx, () => assertForeignTaxAssetId(item.assetId, ids, path));
        checkMoneyItem(ctx, item, path, "date");
        checkMoneyItem(ctx, item, path, "money");
      });
    },
  },
];

/** route·테스트가 쓰는 refine 부착 — `refines`를 넘기면 그 목록만 건다(뮤테이션 테스트 전용). */
export function addForeignRealEstateRefines<S extends z.ZodType<Data>>(
  schema: S,
  refines: readonly ForeignRealEstateRefine[] = FOREIGN_RE_REFINES,
) {
  return schema.superRefine((d, ctx) => {
    for (const r of refines) r.run(d, ctx);
  });
}

