"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

// ── 타입 ──────────────────────────────────────────────────

interface StockInfo {
  ticker: string;
  name: string;
  price: number;
  change_pct: number;
  market: string;
  exchange: string;
  pre_price?: number | null;
  after_price?: number | null;
}

interface PortfolioInfo {
  cash: number;
  holdings: { ticker: string; quantity: number }[];
}

interface ShortPosition {
  id: number;
  ticker: string;
  name: string;
  market: string;
  exchange: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  margin: number;
  profit: number;
  profit_pct: number;
}

interface MarketStatusInfo {
  is_open: boolean;
  status: "open" | "closed" | "pre" | "after";
  session: "regular" | "pre" | "after" | "closed";
  message: string;
  open_time: string;
  close_time: string;
}

interface MarketStatus {
  KR: MarketStatusInfo;
  US: MarketStatusInfo;
}

interface PendingOrder {
  id: number;
  ticker: string;
  name: string;
  market: string;
  exchange: string;
  trade_type: "BUY" | "SELL";
  quantity: number;
  limit_price: number;
  reserved_cash: number;
  created_at: string;
}

type MainTab = "TRADE" | "SHORT";
type TradeType = "BUY" | "SELL";
type OrderType = "MARKET" | "LIMIT";

// ── 상수 ──────────────────────────────────────────────────

const EXCHANGE_BADGE: Record<string, string> = {
  KOSPI: "bg-blue-500/20 text-blue-400",
  KOSDAQ: "bg-green-500/20 text-green-400",
  NASDAQ: "bg-purple-500/20 text-purple-400",
  NasdaqGS: "bg-purple-500/20 text-purple-400",
  NasdaqGM: "bg-purple-500/20 text-purple-400",
  NYSE: "bg-orange-500/20 text-orange-400",
  ETF: "bg-yellow-500/20 text-yellow-400",
};

// ── Toast 알림 ─────────────────────────────────────────────

interface ToastProps { message: string; type: "success" | "error"; }

function Toast({ message, type }: ToastProps) {
  return (
    <div
      className={`fixed top-6 left-1/2 z-[100] -translate-x-1/2 px-5 py-3 rounded-2xl text-sm font-semibold shadow-xl border ${
        type === "success"
          ? "bg-green-500/90 text-white border-green-400/50"
          : "bg-red-500/90 text-white border-red-400/50"
      }`}
      style={{ animation: "fadeInDown 0.2s ease-out", maxWidth: "90vw", textAlign: "center" }}
    >
      {type === "success" ? "✅ " : "❌ "}{message}
    </div>
  );
}

// ── 서브 컴포넌트 ──────────────────────────────────────────

function MarketStatusBanner({ status }: { status: MarketStatusInfo }) {
  const { is_open: isOpen, session } = status;
  const isPre = session === "pre";
  const isAfter = session === "after";
  const isRegular = session === "regular";

  const colorClass = isRegular ? "bg-green-500/10 border-green-500/30 text-green-400"
    : isPre ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
    : isAfter ? "bg-purple-500/10 border-purple-500/30 text-purple-400"
    : "bg-gray-800 border-gray-700 text-gray-400";

  const dotClass = isRegular ? "bg-green-400 animate-pulse"
    : isPre ? "bg-yellow-400 animate-pulse"
    : isAfter ? "bg-purple-400 animate-pulse"
    : "bg-gray-600";

  return (
    <div className={`rounded-xl px-4 py-2.5 flex items-center justify-between text-xs font-medium border ${colorClass}`}>
      <span>{status.message}</span>
      <span className={`w-2 h-2 rounded-full ml-2 flex-shrink-0 ${dotClass}`} />
    </div>
  );
}

// ── 거래 Bottom Sheet ──────────────────────────────────────

interface TradeSheetProps {
  stock: StockInfo;
  usdKrw: number | null;
  myInfo: PortfolioInfo | null;
  marketStatus: MarketStatusInfo | null;
  onClose: () => void;
  onTradeSuccess: (updatedInfo: PortfolioInfo) => void;
  onOrdersChange: () => void;
  onToast: (msg: string, type: "success" | "error") => void;
}

function TradeBottomSheet({ stock, usdKrw, myInfo: initialMyInfo, marketStatus, onClose, onTradeSuccess, onOrdersChange, onToast }: TradeSheetProps) {
  const [tradeType, setTradeType] = useState<TradeType>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [quantity, setQuantity] = useState(1);
  const [limitPrice, setLimitPrice] = useState<number>(Math.round(
    stock.market === "US" && usdKrw ? stock.price * usdKrw : stock.price
  ));
  const [loading, setLoading] = useState(false);
  // 거래 성공 후 즉시 반영용 로컬 myInfo
  const [myInfo, setMyInfo] = useState<PortfolioInfo | null>(initialMyInfo);

  const isUS = stock.market === "US";
  const isTradeAllowed = marketStatus?.is_open ?? false;
  const heldQty = myInfo?.holdings.find(h => h.ticker === stock.ticker)?.quantity ?? 0;

  // 세션별 가격 선택 (프리/애프터마켓)
  const session = marketStatus?.session ?? "regular";
  const sessionPriceUsd = isUS
    ? (session === "pre" && stock.pre_price ? stock.pre_price
      : session === "after" && stock.after_price ? stock.after_price
      : stock.price)
    : null;
  const sessionLabel = session === "pre" ? "프리마켓" : session === "after" ? "애프터마켓" : "현재가";

  const unitPriceKrw = isUS && usdKrw ? (sessionPriceUsd ?? stock.price) * usdKrw : stock.price;
  const execPrice = orderType === "LIMIT" ? limitPrice : unitPriceKrw;
  const totalKrw = execPrice * quantity;
  const cashShort = myInfo ? Math.max(0, (tradeType === "BUY" ? totalKrw : 0) - myInfo.cash) : 0;

  const handleQuickQty = (type: "all" | "half" | "third") => {
    if (!myInfo) return;
    if (tradeType === "BUY") {
      const maxQty = Math.floor(myInfo.cash / execPrice);
      if (type === "all") setQuantity(Math.max(1, maxQty));
      else if (type === "half") setQuantity(Math.max(1, Math.floor(maxQty / 2)));
      else setQuantity(Math.max(1, Math.floor(maxQty / 3)));
    } else {
      if (type === "all") setQuantity(Math.max(1, heldQty));
      else if (type === "half") setQuantity(Math.max(1, Math.floor(heldQty / 2)));
      else setQuantity(Math.max(1, Math.floor(heldQty / 3)));
    }
  };

  const handleTrade = async () => {
    setLoading(true);
    try {
      const endpoint = tradeType === "BUY" ? "/trade/buy" : "/trade/sell";
      const body: Record<string, unknown> = { ticker: stock.ticker, quantity, market: stock.market };
      if (orderType === "LIMIT") body.limit_price = limitPrice;
      const res = await api.post(endpoint, body);

      const isPending = res.data.order_type === "pending";

      // 포트폴리오 즉시 갱신 (시장가 체결 또는 매수 예약금 차감 반영)
      const portfolioRes = await api.get("/portfolio/me");
      const updated: PortfolioInfo = portfolioRes.data;
      setMyInfo(updated);
      onTradeSuccess(updated);

      // 미체결 주문 목록도 갱신
      if (isPending) onOrdersChange();

      onToast(res.data.message, "success");
      setQuantity(1);
      if (isPending) setOrderType("MARKET"); // 지정가 → 시장가로 초기화
    } catch (e: any) {
      onToast(e.response?.data?.detail || "거래 실패", "error");
    } finally { setLoading(false); }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center" style={{ animation: "slideUp 0.22s ease-out" }}>
        <div className="w-full max-w-md bg-gray-900 border-t border-gray-700 rounded-t-3xl px-4 pt-5 pb-10 space-y-3 shadow-2xl"
          style={{ maxHeight: "90vh", overflowY: "auto" }}>
          <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-1" />

          {/* 헤더 */}
          <div className="flex justify-between items-start">
            <div>
              <div className="font-bold text-white text-base">{stock.name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex flex-col">
                  <span className="text-sm text-gray-400">
                    {isUS
                      ? `$${(sessionPriceUsd ?? stock.price).toFixed(2)}`
                      : `${stock.price.toLocaleString()}원`}
                    {isUS && session !== "regular" && (
                      <span className={`ml-1 text-xs px-1.5 py-0.5 rounded font-semibold ${
                        session === "pre" ? "bg-yellow-500/20 text-yellow-400" : "bg-purple-500/20 text-purple-400"
                      }`}>{sessionLabel}</span>
                    )}
                  </span>
                  {isUS && session !== "regular" && stock.price !== (sessionPriceUsd ?? stock.price) && (
                    <span className="text-xs text-gray-600">정규장 ${stock.price.toFixed(2)}</span>
                  )}
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${EXCHANGE_BADGE[stock.exchange] ?? "bg-gray-600 text-gray-300"}`}>
                  {stock.exchange}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* 거래 후 즉시 반영된 보유 수량 */}
              {heldQty > 0 && (
                <div className="text-right">
                  <div className="text-xs text-gray-500">보유</div>
                  <div className="text-sm font-semibold text-white">{heldQty}주</div>
                </div>
              )}
              {marketStatus && (
                <div className={`text-xs font-medium px-2 py-0.5 rounded-lg ${
                  session === "pre" ? "bg-yellow-500/20 text-yellow-400"
                  : session === "after" ? "bg-purple-500/20 text-purple-400"
                  : marketStatus.is_open ? "bg-green-500/20 text-green-400"
                  : "bg-gray-700 text-gray-400"
                }`}>
                  {session === "pre" ? "● 프리마켓"
                    : session === "after" ? "● 애프터마켓"
                    : marketStatus.is_open ? "● 거래 가능"
                    : "● 마감"}
                </div>
              )}
              <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">✕</button>
            </div>
          </div>

          {marketStatus && !marketStatus.is_open && (
            <div className="bg-gray-700/50 rounded-xl px-4 py-2.5 text-xs text-gray-400 text-center">
              {marketStatus.message}
              <span className="text-gray-500 ml-1">개장: {marketStatus.open_time} ~ {marketStatus.close_time}</span>
            </div>
          )}

          {/* 매수/매도 탭 */}
          <div className="flex gap-2">
            <button onClick={() => { setTradeType("BUY"); setQuantity(1); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tradeType === "BUY" ? "bg-red-500 text-white" : "bg-gray-700 text-gray-400"}`}>
              매수
            </button>
            <button onClick={() => { setTradeType("SELL"); setQuantity(1); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tradeType === "SELL" ? "bg-blue-500 text-white" : "bg-gray-700 text-gray-400"}`}>
              매도
            </button>
          </div>

          {/* 시장가 / 지정가 */}
          <div className="flex gap-1 bg-gray-800 p-1 rounded-xl">
            <button onClick={() => setOrderType("MARKET")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${orderType === "MARKET" ? "bg-gray-600 text-white" : "text-gray-500"}`}>
              시장가
            </button>
            <button onClick={() => setOrderType("LIMIT")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${orderType === "LIMIT" ? "bg-gray-600 text-white" : "text-gray-500"}`}>
              지정가
            </button>
          </div>

          {orderType === "LIMIT" && (
            <div className="bg-gray-800 rounded-xl px-4 py-3">
              <div className="text-xs text-gray-400 mb-1.5">지정 가격 (원화)</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setLimitPrice(p => Math.max(1, p - (p >= 10000 ? 100 : 10)))}
                  className="bg-gray-700 text-white w-9 h-9 rounded-lg font-bold text-base">−</button>
                <input type="number" value={limitPrice}
                  onChange={(e) => setLimitPrice(Math.max(1, parseInt(e.target.value) || 1))}
                  className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-center font-bold outline-none text-sm" />
                <button onClick={() => setLimitPrice(p => p + (p >= 10000 ? 100 : 10))}
                  className="bg-gray-700 text-white w-9 h-9 rounded-lg font-bold text-base">+</button>
              </div>
              <div className="text-xs text-gray-500 mt-1.5 text-center">
                {sessionLabel} {isUS ? `$${(sessionPriceUsd ?? stock.price).toFixed(2)} (≈${Math.round(unitPriceKrw).toLocaleString()}원)` : `${stock.price.toLocaleString()}원`}
                {(limitPrice < unitPriceKrw * 0.9 || limitPrice > unitPriceKrw * 1.1) &&
                  <span className="text-yellow-500 ml-1">⚠ 현재가와 10% 이상 차이</span>}
              </div>
            </div>
          )}

          {/* 빠른 수량 */}
          <div className="flex gap-2">
            {([{ label: "1/3", type: "third" as const }, { label: "1/2", type: "half" as const }, { label: "전량", type: "all" as const }]).map((btn) => (
              <button key={btn.type} onClick={() => handleQuickQty(btn.type)} disabled={!isTradeAllowed}
                className="flex-1 py-2 rounded-xl text-xs font-semibold bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors disabled:opacity-40">
                {btn.label}
              </button>
            ))}
          </div>

          {/* 수량 */}
          <div className="flex items-center gap-3">
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={!isTradeAllowed}
              className="bg-gray-700 hover:bg-gray-600 text-white w-11 h-11 rounded-xl font-bold text-xl disabled:opacity-40">−</button>
            <input type="number" min={1} value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={!isTradeAllowed}
              className="flex-1 bg-gray-700 text-white rounded-xl px-4 py-2.5 text-center font-bold outline-none text-lg disabled:opacity-40" />
            <button onClick={() => setQuantity(quantity + 1)} disabled={!isTradeAllowed}
              className="bg-gray-700 hover:bg-gray-600 text-white w-11 h-11 rounded-xl font-bold text-xl disabled:opacity-40">+</button>
          </div>

          {/* 금액 요약 */}
          <div className="bg-gray-700/50 rounded-xl px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">{orderType === "LIMIT" ? "지정가 총액" : "예상 금액"}</span>
              <span className="text-white font-bold">{totalKrw.toLocaleString()}원</span>
            </div>
            {isUS && usdKrw && orderType === "MARKET" && (
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-xs">{sessionLabel} 달러</span>
                <span className="text-gray-400 text-xs">${((sessionPriceUsd ?? stock.price) * quantity).toFixed(2)}</span>
              </div>
            )}
            {myInfo && (
              <div className="flex justify-between items-center pt-1 border-t border-gray-600/50">
                <span className="text-gray-500 text-xs">보유 현금</span>
                <span className={`text-xs font-semibold ${cashShort > 0 ? "text-red-400" : "text-gray-400"}`}>
                  {myInfo.cash.toLocaleString()}원
                  {cashShort > 0 && ` (${cashShort.toLocaleString()}원 부족)`}
                </span>
              </div>
            )}
            {tradeType === "SELL" && heldQty < quantity && (
              <div className="text-xs text-red-400 text-right">보유 수량 초과 ({heldQty}주 보유 중)</div>
            )}
          </div>

          <button onClick={handleTrade}
            disabled={loading || !isTradeAllowed || (tradeType === "BUY" && cashShort > 0) || (tradeType === "SELL" && heldQty < quantity)}
            className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
              !isTradeAllowed ? "bg-gray-700 text-gray-500 cursor-not-allowed"
              : tradeType === "BUY" ? "bg-red-500 hover:bg-red-400 text-white"
              : "bg-blue-500 hover:bg-blue-400 text-white"
            } disabled:opacity-60`}>
            {loading ? "처리 중..."
              : !isTradeAllowed ? "장 마감 (거래 불가)"
              : orderType === "LIMIT" ? `${tradeType === "BUY" ? "매수" : "매도"} 지정가 주문`
              : `${tradeType === "BUY" ? "매수" : "매도"} 확인`}
          </button>
        </div>
      </div>
    </>
  );
}

// ── 공매도 Bottom Sheet ────────────────────────────────────

interface ShortSheetProps {
  stock: StockInfo;
  usdKrw: number | null;
  myInfo: PortfolioInfo | null;
  marketStatus: MarketStatusInfo | null;
  onClose: () => void;
  onSuccess: () => void;
  onToast: (msg: string, type: "success" | "error") => void;
}

function ShortBottomSheet({ stock, usdKrw, myInfo, marketStatus, onClose, onSuccess, onToast }: ShortSheetProps) {
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);

  const isUS = stock.market === "US";
  const isShortAllowed = marketStatus?.is_open ?? false;
  const unitPriceKrw = isUS && usdKrw ? stock.price * usdKrw : stock.price;
  const total = unitPriceKrw * qty;
  const margin = total * 0.3;
  const cashShort = myInfo ? Math.max(0, margin - myInfo.cash) : 0;

  const handleQuickQty = (type: "all" | "half" | "third") => {
    if (!myInfo) return;
    const maxQty = Math.floor(myInfo.cash / (unitPriceKrw * 0.3));
    if (type === "all") setQty(Math.max(1, maxQty));
    else if (type === "half") setQty(Math.max(1, Math.floor(maxQty / 2)));
    else setQty(Math.max(1, Math.floor(maxQty / 3)));
  };

  const handleShortOpen = async () => {
    setLoading(true);
    try {
      const res = await api.post("/short/open", { ticker: stock.ticker, quantity: qty, market: stock.market });
      onToast(res.data.message, "success");
      onSuccess();
      onClose();
    } catch (e: any) {
      onToast(e.response?.data?.detail || "공매도 실패", "error");
    } finally { setLoading(false); }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center" style={{ animation: "slideUp 0.22s ease-out" }}>
        <div className="w-full max-w-md bg-gray-900 border-t border-orange-500/40 rounded-t-3xl px-4 pt-5 pb-10 space-y-3 shadow-2xl"
          style={{ maxHeight: "90vh", overflowY: "auto" }}>
          <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-1" />

          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base">{stock.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded-md bg-orange-500/20 text-orange-400 font-medium">SHORT</span>
              </div>
              <div className="text-sm text-gray-400 mt-0.5">
                {isUS ? `$${stock.price.toFixed(2)}` : `${stock.price.toLocaleString()}원`}
                {isUS && usdKrw && <span className="text-gray-600 ml-1">≈ {Math.round(unitPriceKrw).toLocaleString()}원</span>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {marketStatus && (
                <div className={`text-xs font-medium px-2 py-0.5 rounded-lg ${
                  marketStatus.is_open ? "bg-green-500/20 text-green-400" : "bg-gray-700 text-gray-400"
                }`}>
                  {marketStatus.is_open ? "● 거래 가능" : "● 마감"}
                </div>
              )}
              <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">✕</button>
            </div>
          </div>

          {marketStatus && !marketStatus.is_open && (
            <div className="bg-gray-700/50 rounded-xl px-4 py-2.5 text-xs text-gray-400 text-center">{marketStatus.message}</div>
          )}

          <div className="flex gap-2">
            {([{ label: "1/3", type: "third" as const }, { label: "1/2", type: "half" as const }, { label: "최대", type: "all" as const }]).map((btn) => (
              <button key={btn.type} onClick={() => handleQuickQty(btn.type)} disabled={!isShortAllowed}
                className="flex-1 py-2 rounded-xl text-xs font-semibold bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors disabled:opacity-40">
                {btn.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => setQty(Math.max(1, qty - 1))} disabled={!isShortAllowed}
              className="bg-gray-700 text-white w-11 h-11 rounded-xl font-bold text-xl disabled:opacity-40">−</button>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={!isShortAllowed} className="flex-1 bg-gray-700 text-white rounded-xl px-4 py-2.5 text-center font-bold outline-none text-lg disabled:opacity-40" />
            <button onClick={() => setQty(qty + 1)} disabled={!isShortAllowed}
              className="bg-gray-700 text-white w-11 h-11 rounded-xl font-bold text-xl disabled:opacity-40">+</button>
          </div>

          <div className="bg-gray-700/50 rounded-xl px-4 py-3 space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-gray-400">공매도 금액</span><span className="text-white font-semibold">{total.toLocaleString()}원</span></div>
            <div className="flex justify-between"><span className="text-orange-400">필요 증거금 (30%)</span><span className={`font-semibold ${cashShort > 0 ? "text-red-400" : "text-orange-400"}`}>{margin.toLocaleString()}원</span></div>
            <div className="flex justify-between text-gray-600"><span>목표 (10% 하락 시)</span><span className="text-blue-400">+{(total * 0.1).toLocaleString()}원</span></div>
            {myInfo && (
              <div className="flex justify-between pt-1 border-t border-gray-600/50">
                <span className="text-gray-500">보유 현금</span>
                <span className={`font-semibold ${cashShort > 0 ? "text-red-400" : "text-gray-400"}`}>
                  {myInfo.cash.toLocaleString()}원
                  {cashShort > 0 && ` (${cashShort.toLocaleString()}원 부족)`}
                </span>
              </div>
            )}
          </div>

          <button onClick={handleShortOpen} disabled={loading || !isShortAllowed || cashShort > 0}
            className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
              !isShortAllowed ? "bg-gray-700 text-gray-500 cursor-not-allowed"
              : "bg-orange-500 hover:bg-orange-400 text-white"
            } disabled:opacity-60`}>
            {loading ? "처리 중..." : !isShortAllowed ? "장 마감 (거래 불가)" : "📉 공매도 진입"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────

export default function TradePage() {
  const router = useRouter();
  const [mainTab, setMainTab] = useState<MainTab>("TRADE");

  const [query, setQuery] = useState("");
  const [market, setMarket] = useState<"ALL" | "KR" | "US">("ALL");
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [popular, setPopular] = useState<StockInfo[]>([]);
  const [selected, setSelected] = useState<StockInfo | null>(null);
  const [popularLoading, setPopularLoading] = useState(true);
  const [myInfo, setMyInfo] = useState<PortfolioInfo | null>(null);
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [usdKrw, setUsdKrw] = useState<number | null>(null);

  const [shortSelected, setShortSelected] = useState<StockInfo | null>(null);
  const [shortPositions, setShortPositions] = useState<ShortPosition[]>([]);
  const [shortLoading, setShortLoading] = useState(false);
  const [shortStocks, setShortStocks] = useState<StockInfo[]>([]);
  const [shortQuery, setShortQuery] = useState("");

  // 미체결 주문
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // Toast 상태
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const currentMarketStatus: MarketStatusInfo | null = selected
    ? (selected.market === "KR" ? marketStatus?.KR : marketStatus?.US) ?? null
    : null;

  const shortMarketStatus: MarketStatusInfo | null = shortSelected
    ? (shortSelected.market === "KR" ? marketStatus?.KR : marketStatus?.US) ?? null
    : null;

  const fetchMarketStatus = useCallback(async () => {
    try { const res = await api.get("/stock/market-status?market=ALL"); setMarketStatus(res.data); } catch {}
  }, []);

  const fetchMyInfo = useCallback(async () => {
    try { const res = await api.get("/portfolio/me"); setMyInfo(res.data); } catch {}
  }, []);

  const fetchShortPositions = useCallback(async () => {
    try { const res = await api.get("/short/positions"); setShortPositions(res.data); } catch {}
  }, []);

  const fetchPendingOrders = useCallback(async () => {
    try { const res = await api.get("/trade/orders"); setPendingOrders(res.data); } catch {}
  }, []);

  const handleCancelOrder = async (orderId: number) => {
    setCancellingId(orderId);
    try {
      await api.delete(`/trade/orders/${orderId}`);
      showToast("주문이 취소되었습니다", "success");
      fetchPendingOrders();
      fetchMyInfo(); // 예약금 환불 반영
    } catch (e: any) {
      showToast(e.response?.data?.detail || "취소 실패", "error");
    } finally { setCancellingId(null); }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/"); return; }
    fetchMyInfo();
    api.get("/stock/exchange-rate").then((res) => setUsdKrw(res.data.usd_krw)).catch(() => {});
    fetchMarketStatus();
    fetchShortPositions();
    fetchPendingOrders();
    const interval = setInterval(fetchMarketStatus, 60_000);
    // 30초마다 미체결 주문 갱신 (체결 여부 확인)
    const orderInterval = setInterval(() => { fetchPendingOrders(); fetchMyInfo(); }, 30_000);
    return () => { clearInterval(interval); clearInterval(orderInterval); };
  }, [router, fetchMarketStatus, fetchMyInfo, fetchShortPositions, fetchPendingOrders]);

  useEffect(() => {
    setPopularLoading(true);
    api.get(`/stock/popular?market=${market}`)
      .then((res) => setPopular(res.data))
      .finally(() => setPopularLoading(false));
  }, [market]);

  // 키보드 닫고 sheet 열기 (모바일 키보드 겹침 방지)
  const openSheet = useCallback((stock: StockInfo) => {
    (document.activeElement as HTMLElement)?.blur();
    // blur 후 키보드가 내려갈 시간 살짝 대기
    setTimeout(() => setSelected(stock), 100);
  }, []);

  const openShortSheet = useCallback((stock: StockInfo) => {
    (document.activeElement as HTMLElement)?.blur();
    setTimeout(() => setShortSelected(stock), 100);
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    (document.activeElement as HTMLElement)?.blur();
    const res = await api.get(`/stock/search?q=${encodeURIComponent(query)}&market=${market}`);
    setStocks(res.data);
  };

  const handleShortSearch = async () => {
    if (!shortQuery.trim()) return;
    (document.activeElement as HTMLElement)?.blur();
    const res = await api.get(`/stock/search?q=${encodeURIComponent(shortQuery)}&market=${market}`);
    setShortStocks(res.data);
  };

  const handleShortClose = async (positionId: number) => {
    setShortLoading(true);
    try {
      const res = await api.post(`/short/close/${positionId}`);
      const profit = res.data.profit;
      showToast(
        `청산 완료 (${profit >= 0 ? "+" : ""}${profit.toLocaleString()}원, ${res.data.profit_pct.toFixed(2)}%)`,
        profit >= 0 ? "success" : "error"
      );
      fetchMyInfo(); fetchShortPositions();
    } catch (e: any) {
      showToast(e.response?.data?.detail || "청산 실패", "error");
    } finally { setShortLoading(false); }
  };

  const displayList = query && stocks.length > 0 ? stocks : popular;
  const shortDisplayList = shortQuery && shortStocks.length > 0 ? shortStocks : popular;

  return (
    <>
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}

      <main className="max-w-md mx-auto px-4 py-6 space-y-4" style={{ background: "#0f0f0f", minHeight: "100vh" }}>
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-gray-400 text-sm hover:text-white">← 홈</Link>
          <h1 className="font-bold text-lg text-white">💹 거래하기</h1>
          {myInfo && (
            <div className="text-right">
              <div className="text-xs text-gray-500">보유 현금</div>
              <div className="text-xs font-semibold text-yellow-400">{myInfo.cash.toLocaleString()}원</div>
            </div>
          )}
        </div>

        {marketStatus && (
          <div className="space-y-1.5">
            <MarketStatusBanner status={marketStatus.KR} />
            <MarketStatusBanner status={marketStatus.US} />
          </div>
        )}

        {/* 메인 탭 */}
        <div className="flex gap-2 bg-gray-800 p-1 rounded-2xl">
          <button onClick={() => setMainTab("TRADE")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${mainTab === "TRADE" ? "bg-yellow-400 text-gray-900" : "text-gray-400"}`}>
            📈 일반 거래
          </button>
          <button onClick={() => setMainTab("SHORT")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${mainTab === "SHORT" ? "bg-orange-500 text-white" : "text-gray-400"}`}>
            📉 공매도
          </button>
        </div>

        {/* ── 일반 거래 탭 ── */}
        {mainTab === "TRADE" && (
          <>
            <div className="flex gap-2">
              {(["ALL", "KR", "US"] as const).map((m) => (
                <button key={m} onClick={() => { setMarket(m); setStocks([]); setQuery(""); setSelected(null); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    market === m ? "bg-yellow-400 text-gray-900" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}>
                  {m === "ALL" ? "전체" : m === "KR" ? "🇰🇷 한국" : "🇺🇸 미국"}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="종목명, 티커 검색..."
                className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 text-sm outline-none placeholder-gray-500 border border-gray-700 focus:border-yellow-400 transition-colors"
              />
              <button onClick={handleSearch} className="bg-yellow-400 text-gray-900 px-5 rounded-xl font-bold text-sm hover:bg-yellow-300 transition-colors">검색</button>
            </div>

            {/* 미체결 주문 목록 */}
            {pendingOrders.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2 font-medium">⏳ 미체결 주문 ({pendingOrders.length}건)</p>
                <div className="space-y-2">
                  {pendingOrders.map((o) => (
                    <div key={o.id} className="bg-gray-800 border border-yellow-500/20 rounded-2xl px-4 py-3 flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            o.trade_type === "BUY" ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"
                          }`}>{o.trade_type === "BUY" ? "매수" : "매도"}</span>
                          <span className="text-sm font-semibold text-white">{o.name}</span>
                          <span className="text-xs text-gray-500">{o.quantity}주</span>
                        </div>
                        <div className="text-xs text-yellow-400 mt-0.5 font-medium">
                          지정가 {o.limit_price.toLocaleString()}원
                        </div>
                        {o.trade_type === "BUY" && o.reserved_cash > 0 && (
                          <div className="text-xs text-gray-600 mt-0.5">예약금 {o.reserved_cash.toLocaleString()}원 대기 중</div>
                        )}
                      </div>
                      <button
                        onClick={() => handleCancelOrder(o.id)}
                        disabled={cancellingId === o.id}
                        className="text-xs text-gray-400 hover:text-red-400 border border-gray-600 hover:border-red-400/50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                      >
                        {cancellingId === o.id ? "취소 중…" : "취소"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">
                {query && stocks.length > 0 ? "🔍 검색 결과" : "🔥 인기 종목"}
              </p>
              {popularLoading ? (
                <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="bg-gray-800 rounded-2xl p-4 animate-pulse h-16" />)}</div>
              ) : displayList.length === 0 ? (
                <div className="bg-gray-800 rounded-2xl p-6 text-center text-gray-500 text-sm">검색 결과가 없어요</div>
              ) : (
                <div className="space-y-2">
                  {displayList.map((s) => {
                    const mStatus = s.market === "KR" ? marketStatus?.KR : marketStatus?.US;
                    return (
                      <button key={s.ticker} onClick={() => openSheet(s)}
                        className={`w-full rounded-2xl p-4 flex justify-between items-center transition-all border ${
                          selected?.ticker === s.ticker ? "bg-yellow-400/10 border-yellow-400/50" : "bg-gray-800 border-transparent hover:border-gray-600"
                        }`}>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-white">{s.name}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${EXCHANGE_BADGE[s.exchange] ?? "bg-gray-600 text-gray-300"}`}>{s.exchange}</span>
                            {mStatus && <span className={`w-1.5 h-1.5 rounded-full ${mStatus.is_open ? "bg-green-400" : "bg-gray-600"}`} />}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{s.ticker}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-white">
                            {s.market === "US" ? `$${s.price.toFixed(2)}` : `${s.price.toLocaleString()}원`}
                          </div>
                          {s.market === "US" && usdKrw && <div className="text-xs text-gray-500">≈ {(s.price * usdKrw).toLocaleString()}원</div>}
                          <div className={`text-xs font-semibold mt-0.5 ${s.change_pct >= 0 ? "text-red-400" : "text-blue-400"}`}>
                            {s.change_pct >= 0 ? "▲" : "▼"} {Math.abs(s.change_pct).toFixed(2)}%
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── 공매도 탭 ── */}
        {mainTab === "SHORT" && (
          <>
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 text-xs text-orange-300 space-y-1">
              <div className="font-bold text-orange-400 mb-1">📉 공매도란?</div>
              <div>주식을 빌려서 팔고 → 나중에 싸게 사서 갚아 차익 실현</div>
              <div>주가가 <span className="text-blue-400 font-semibold">내릴수록 이익</span>, 올라가면 손실</div>
              <div className="text-orange-400 font-semibold">⚠️ 증거금 30% 필요 · 손실 이론상 무한대</div>
            </div>

            {shortPositions.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2 font-medium">📋 오픈 포지션</p>
                <div className="space-y-2">
                  {shortPositions.map((p) => (
                    <div key={p.id} className="bg-gray-800 border border-orange-500/20 rounded-2xl p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-white">{p.name}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded-md bg-orange-500/20 text-orange-400 font-medium">SHORT</span>
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{p.quantity}주 · 진입가 {p.entry_price.toLocaleString()}원</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500">현재가</div>
                          <div className="text-sm font-bold text-white">{p.current_price.toLocaleString()}원</div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className={`text-sm font-bold ${p.profit >= 0 ? "text-blue-400" : "text-red-400"}`}>
                          {p.profit >= 0 ? "+" : ""}{p.profit.toLocaleString()}원 ({p.profit_pct >= 0 ? "+" : ""}{p.profit_pct.toFixed(2)}%)
                        </div>
                        <button onClick={() => handleShortClose(p.id)} disabled={shortLoading}
                          className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-50">
                          청산하기
                        </button>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">증거금 {p.margin.toLocaleString()}원 예치 중</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">📉 공매도 종목 선택</p>
              <div className="flex gap-2 mb-3">
                <input
                  value={shortQuery}
                  onChange={(e) => setShortQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleShortSearch()}
                  placeholder="종목명, 티커 검색..."
                  className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 text-sm outline-none placeholder-gray-500 border border-gray-700 focus:border-orange-400 transition-colors"
                />
                <button onClick={handleShortSearch} className="bg-orange-500 text-white px-5 rounded-xl font-bold text-sm hover:bg-orange-400 transition-colors">검색</button>
              </div>
              <div className="space-y-2">
                {shortDisplayList.map((s) => {
                  const mStatus = s.market === "KR" ? marketStatus?.KR : marketStatus?.US;
                  return (
                    <button key={s.ticker} onClick={() => openShortSheet(s)}
                      className={`w-full rounded-2xl p-3 flex justify-between items-center transition-all border ${
                        shortSelected?.ticker === s.ticker ? "bg-orange-500/10 border-orange-500/50" : "bg-gray-800 border-transparent hover:border-gray-600"
                      }`}>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-white">{s.name}</span>
                          {mStatus && <span className={`w-1.5 h-1.5 rounded-full ${mStatus.is_open ? "bg-green-400" : "bg-gray-600"}`} />}
                        </div>
                        <div className="text-xs text-gray-400">{s.ticker}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-white">
                          {s.market === "US" ? `$${s.price.toFixed(2)}` : `${s.price.toLocaleString()}원`}
                        </div>
                        <div className={`text-xs font-semibold ${s.change_pct >= 0 ? "text-red-400" : "text-blue-400"}`}>
                          {s.change_pct >= 0 ? "▲" : "▼"} {Math.abs(s.change_pct).toFixed(2)}%
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>

      {/* 거래 Bottom Sheet */}
      {mainTab === "TRADE" && selected && (
        <TradeBottomSheet
          stock={selected}
          usdKrw={usdKrw}
          myInfo={myInfo}
          marketStatus={currentMarketStatus}
          onClose={() => setSelected(null)}
          onTradeSuccess={(updated) => setMyInfo(updated)}
          onOrdersChange={fetchPendingOrders}
          onToast={showToast}
        />
      )}

      {/* 공매도 Bottom Sheet */}
      {mainTab === "SHORT" && shortSelected && (
        <ShortBottomSheet
          stock={shortSelected}
          usdKrw={usdKrw}
          myInfo={myInfo}
          marketStatus={shortMarketStatus}
          onClose={() => setShortSelected(null)}
          onSuccess={() => { fetchMyInfo(); fetchShortPositions(); }}
          onToast={showToast}
        />
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeInDown {
          from { transform: translate(-50%, -16px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
