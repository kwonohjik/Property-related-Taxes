/**
 * 국외자산 부동산 계산 결과의 클라이언트 래핑 — API는 `{ data: ForeignRealEstateResult }`(mode 없음)만 준다.
 * 결과 store(`TransferAPIResult`)가 국내 3종과 한 유니온으로 다루도록 `mode: "foreign"`을 여기서 붙인다(④).
 */
import type { ForeignRealEstateResult } from "@/lib/tax-engine/foreign-realestate";

export type ForeignTransferResult = { mode: "foreign"; result: ForeignRealEstateResult };
