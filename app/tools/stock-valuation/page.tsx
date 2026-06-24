"use client";

/**
 * 주식 평가 — 독립 도구 페이지.
 * 세금 계산 없이 상장·비상장주식 가치 평가만 수행(상속·증여 평가 입력용).
 * 상속세및증여세법 §63·시행령 §54 기준. 평가 결과는 계산 이력에 자동 저장.
 */
import { StockValuationTool } from "@/components/calc/tools/StockValuationTool";

export default function StockValuationPage() {
  return <StockValuationTool />;
}
