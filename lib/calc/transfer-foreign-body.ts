/**
 * 국외 부동산 폼 → `POST /api/calc/transfer/foreign` body — **순수 변환**(④의 본체, 호출은 U2).
 *
 * U1에서는 ⑧ 검증(`transfer-tax-validate-foreign.ts`)이 이 빌더의 결과에 서버 ⑩ refine을 그대로 돌린다 — 그래서 UI 통과 ↔ API 차단 모순이
 * 구조적으로 생기지 않는다. U2의 ④ 호출이 같은 함수를 쓴다(복제 금지).
 *
 * 화면 기본값 fallback(자산 종류 `land` · 처리 방법 `credit`)은 initial·normalize·이 빌더·⑧이 같은 값이다(3중 패턴).
 * **환율은 어떤 fallback도 없다** — 칸이 비면 0으로 읽혀 ⑩ refine(`asset-money`)이 막는다(영 §178의5① 항목별 기준환율).
 * 자산 id는 엔진·오류 메시지에 그대로 실리므로 읽을 수 있는 「국외자산 N」 라벨을 쓴다(한 건 안에서 유일).
 */
import { parseDecimal } from "@/lib/calc/number-parse";
import type { ForeignRealEstateBaseInput } from "@/lib/api/transfer-foreign-schema";
import {
  FOREIGN_ASSET_KIND_DEFAULT,
  FOREIGN_TAX_METHOD_DEFAULT,
  type ForeignMoneyRowForm,
} from "@/lib/stores/calc-wizard-form-foreign";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";

type Body = ForeignRealEstateBaseInput;
type BodyMoney = Body["assets"][number]["transfer"];

/** 엔진 id·오류 메시지에 쓰는 자산 라벨 — 화면 카드 제목과 같다 */
export function foreignAssetLabel(index: number): string {
  return `국외자산 ${index + 1}`;
}

/** 외국납부세액 body 항목 k → 화면의 (자산, 행) — ⑧이 서버 오류 경로를 입력칸으로 되돌리는 데 쓴다 */
export interface ForeignTaxItemOrigin {
  assetIndex: number;
  rowIndex: number;
}

export interface ForeignBodyBuild {
  body: Body;
  taxItemOrigins: ForeignTaxItemOrigin[];
}

/** 빈 칸 → NaN(0으로 읽지 않는다) — 거주 연수는 정수 필수라 비어 있으면 엔진 술어가 막는다 */
function years(v: string): number {
  return v.trim() === "" ? Number.NaN : parseDecimal(v);
}

function money(currency: string, amount: string, date: string, rate: string): BodyMoney {
  return { amountForeign: parseDecimal(amount), currency, date, exchangeRate: parseDecimal(rate) };
}

const rowMoney = (currency: string, r: ForeignMoneyRowForm): BodyMoney =>
  money(currency, r.amountForeign, r.date, r.exchangeRate);

export function buildForeignRealEstateBody(form: TransferFormData): ForeignBodyBuild {
  const taxItemOrigins: ForeignTaxItemOrigin[] = [];
  const assets: Body["assets"] = form.foreignAssets.map((a, i) => ({
    id: foreignAssetLabel(i),
    // 「부동산에 관한 권리」는 v1 body에 없다 — ⑧이 먼저 막는다(타입만 좁힌다)
    kind: (a.kind || FOREIGN_ASSET_KIND_DEFAULT) as "land" | "building",
    transferDate: a.transferDate,
    acquisitionDate: a.acquisitionDate,
    transfer: money(a.currency, a.transferAmount, a.transferDate, a.transferRate),
    acquisition: money(a.currency, a.acquisitionAmount, a.acquisitionDate, a.acquisitionRate),
    capitalExpenditures: a.capitalRows.map((r) => rowMoney(a.currency, r)),
    transferCosts: a.costRows.map((r) => rowMoney(a.currency, r)),
  }));

  // 토글이 꺼져 있으면 숨은 납부 내역을 보내지 않는다(D-4 — 값은 폼에 남아 있다)
  const taxItems: NonNullable<Body["foreignTax"]>["items"] = [];
  if (form.foreignTaxEnabled) {
    form.foreignAssets.forEach((a, assetIndex) =>
      a.taxRows.forEach((r, rowIndex) => {
        taxItems.push({ assetId: foreignAssetLabel(assetIndex), ...rowMoney(a.currency, r) });
        taxItemOrigins.push({ assetIndex, rowIndex });
      }),
    );
  }

  return {
    body: {
      domesticResidenceYears: years(form.foreignResidenceYears),
      assets,
      ...(form.foreignTaxEnabled
        ? { foreignTax: { method: form.foreignTaxMethod || FOREIGN_TAX_METHOD_DEFAULT, items: taxItems } }
        : {}),
    },
    taxItemOrigins,
  };
}
