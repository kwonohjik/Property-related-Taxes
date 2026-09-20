/**
 * 이력 record → 그 세목의 마법사 경로 (P4-2b-3)
 *
 * ## 🔴 두 벌이면 갈라진다 — 실제로 갈라졌다
 *
 * 종전에는 `app/history/HistoryClient.tsx`와 `components/history/HistoryDetailDrawer.tsx`가
 * **각자 리터럴을 들고** 있었고, 드로어 쪽은 **6/8**이었다(`stock_transfer`·`stock_valuation` 누락).
 * 그 결과 주식 2세목은 드로어에서 **「편집」 버튼이 아예 렌더되지 않았고**
 * (`route && …` 가드), 드로어 안의 `stock_valuation` 재개 분기는 `if (!route) return`에
 * 막혀 **도달 불가 dead code**였다.
 *
 * 둘 다 `Partial<Record<…>>`여서 `tsc`는 끝까지 침묵했다.
 *
 * ⇒ 정본을 하나로 모으고 **`Partial`을 벗긴다**. 이제 세목을 더하면 여기서 컴파일이 막힌다.
 *    세목을 더하면서 경로를 안 적는 것이 불가능해야, 같은 결함이 다시 나지 않는다.
 */
import type { LocalTaxType } from "./types";

export const TAX_TYPE_ROUTES: Record<LocalTaxType, string> = {
  transfer: "/calc/transfer-tax",
  acquisition: "/calc/acquisition-tax",
  inheritance: "/calc/inheritance-tax",
  gift: "/calc/gift-tax",
  property: "/calc/property-tax",
  comprehensive_property: "/calc/comprehensive-tax",
  stock_transfer: "/calc/stock-transfer-tax",
  stock_valuation: "/tools/stock-valuation",
  one_house_exemption: "/calc/one-house-exemption",
};
