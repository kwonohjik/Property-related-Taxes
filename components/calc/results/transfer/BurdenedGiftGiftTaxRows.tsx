"use client";

/**
 * 부담부증여 증여세(수증자 자진납부) 행 묶음 — `<table><tbody>` 안에서 쓰는 `<tr>` 조각.
 *
 * `BurdenedGiftDetailCard`(단건)와 `MixedUseBurdenedGiftDetailCard`(겸용주택)가 같은 행을 그린다.
 * 증여세는 물건 단위이고 겸용 4부분 구조와 무관하므로 한 곳에 둔다(복제하면 두 카드가 갈린다).
 */
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

// ⚠️ `Record<string, string>`이라 키 커버리지 가드가 없다 — `DonorRelation` 확장 시 함께 볼 것.
const RELATION_LABEL: Record<string, string> = {
  spouse: "배우자",
  lineal_descendant: "직계비속(성년 수증자)",
  lineal_ascendant_adult: "직계존속(성년 수증자)",
  lineal_ascendant_minor: "직계존속(미성년 수증자)",
  other_relative: "기타 친족",
  none: "비친족",
};

type GiftTax = NonNullable<TransferBurdenedGiftBreakdown["giftTax"]>;

const fmt = (n: number) => n.toLocaleString("ko-KR");

export function BurdenedGiftGiftTaxRows({ giftTax }: { giftTax: GiftTax }) {
  return (
    <>
    <tr className="border-t border-fuchsia-300">
      <td className="py-1 pr-2 font-semibold text-fuchsia-900 dark:text-fuchsia-200">
        증여세 (수증자 자진납부) — 상증법 §53·§56·§69
      </td>
      <td />
    </tr>
    <tr>
      <td className="py-1 pr-2 pl-3">
        {"  └ 증여재산공제 ("}
        {RELATION_LABEL[giftTax.donorRelation] ?? "기타"}
        {")"}
      </td>
      <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(giftTax.deduction)}</td>
    </tr>
    <tr>
      <td className="py-1 pr-2 pl-3">{"  └ 증여세 과세표준"}</td>
      <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(giftTax.taxBase)}</td>
    </tr>
    <tr>
      <td className="py-1 pr-2 pl-3">{"  └ 증여세 산출세액"}</td>
      <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(giftTax.computedTax)}</td>
    </tr>
    {giftTax.priorGiftCredit !== undefined &&
      giftTax.priorGiftCredit > 0 && (
        <tr>
          <td className="py-1 pr-2 pl-3">{"  └ §58 기납부세액공제"}</td>
          <td className="text-right font-mono tabular-nums whitespace-nowrap">
            -{fmt(giftTax.priorGiftCredit)}
          </td>
        </tr>
      )}
    <tr>
      <td className="py-1 pr-2 pl-3">{"  └ 신고세액공제 (3%)"}</td>
      <td className="text-right font-mono tabular-nums whitespace-nowrap">-{fmt(giftTax.filingCredit)}</td>
    </tr>
    <tr className="font-semibold bg-fuchsia-100/70 dark:bg-fuchsia-900/40">
      <td className="py-1 pr-2">증여세 결정세액 (수증자 부담)</td>
      <td className="text-right font-mono tabular-nums whitespace-nowrap">{fmt(giftTax.finalTax)}</td>
    </tr>
    </>
  );
}
