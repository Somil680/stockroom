"use client";
import { useEffect, useRef, useState } from "react";
import { Box, Check, CheckCheck, CircleAlert, LoaderCircle, Minus, Package, Plus, RefreshCw, Search, WifiOff, X } from "lucide-react";
import { BackupPanel } from "@/components/backup-panel";
import { createBackup, mergeConfirmed, readSnapshot, validateProducts, writeSnapshot, type Product, type StockBackup } from "@/lib/backup";
type Pending = { desired: number; version: number; status: "waiting" | "saving" | "error" | "conflict"; mutationId?: string; sent?: number; current?: { quantity: number; version: number } };
export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"count" | "products">("count");
  const [filter, setFilter] = useState<"all" | "stock">("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [online, setOnline] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [snapshot, setSnapshot] = useState<StockBackup | null>(null);
  const [localSavedAt, setLocalSavedAt] = useState<string | null>(null);
  const [storageError, setStorageError] = useState("");
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const generation = useRef(0);
  const confirmedRef = useRef<Product[]>([]);
  const checkingCache = useRef(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [, redraw] = useState(0);
  const pending = useRef(new Map<number, Pending>());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const productsRef = useRef<Product[]>([]);
  const alive = useRef(true);
  const change = () => { if (alive.current) redraw(n => n + 1); };
  function applyProducts(updater: (p: Product[]) => Product[]) {
    productsRef.current = updater(productsRef.current);
    if (alive.current) setProducts(productsRef.current);
  }
  function storeConfirmed(data: Product[]) {
    confirmedRef.current = data;
    const backup = createBackup(data);
    setSnapshot(backup);
    try { writeSnapshot(window.localStorage, backup); setLocalSavedAt(backup.savedAt); setStorageError(""); }
    catch { setStorageError("Browser backup couldn’t be saved. Download a JSON backup instead."); }
  }
  async function load(manual = false) {
    if (lockedRef.current) return;
    const startedAt = generation.current;
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/stock", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Couldn’t load stock. Please try again.");
      const data = validateProducts(await response.json());
      if (!alive.current || lockedRef.current || generation.current !== startedAt) return;
      if (checkingCache.current) {
        const server = new Map(data.map(p => [p.id, p]));
        if (confirmedRef.current.some(p => p.version > (server.get(p.id)?.version ?? 0))) {
          setCloudReady(false); setLoadError("Cloud stock is older than this device’s saved copy. Download your backup, then use Restore to review recovery."); return;
        }
        checkingCache.current = false;
      }
      const confirmed = mergeConfirmed(confirmedRef.current, data);
      storeConfirmed(confirmed);
      applyProducts(old => confirmed.map(p => pending.current.has(p.id) ? (old.find(o => o.id === p.id) ?? p) : p));
      if (alive.current) { setLoadError(""); setCloudReady(true); }
    } catch { if (alive.current && generation.current === startedAt) { setCloudReady(false); setLoadError("Cloud is unavailable. Showing the last available count; no quantities were reset. Retry to continue counting."); } }
    finally { if (alive.current) { setLoading(false); setRefreshing(false); } }
  }
  async function save(id: number) {
    const item = pending.current.get(id);
    if (!item || item.status === "saving" || item.status === "conflict") return;
    if (!navigator.onLine) { item.status = "error"; change(); return; }
    item.status = "saving";
    if (!item.mutationId) { item.mutationId = crypto.randomUUID(); item.sent = item.desired; }
    change();
    try {
      const response = await fetch("/api/stock", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, quantity: item.sent, version: item.version, mutationId: item.mutationId }), signal: AbortSignal.timeout(15000) });
      const result = await response.json() as { quantity: number; version: number; current?: { quantity: number; version: number } };
      if (response.status === 409) { item.status = "conflict"; item.current = result.current; change(); return; }
      if (!response.ok) throw new Error("Not saved");
      item.version = result.version;
      item.mutationId = undefined;
      storeConfirmed(confirmedRef.current.map(p => p.id === id ? { ...p, quantity: result.quantity, version: result.version } : p));
      applyProducts(list => list.map(p => p.id === id ? { ...p, quantity: item.desired, version: result.version } : p));
      if (item.desired !== item.sent) { item.status = "waiting"; change(); void save(id); }
      else { pending.current.delete(id); change(); }
    } catch { item.status = "error"; change(); }
  }
  function update(id: number, quantity: number) {
    if (!cloudReady || !navigator.onLine || lockedRef.current) return;
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 999999) return;
    const p = productsRef.current.find(p => p.id === id);
    if (!p) return;
    let item = pending.current.get(id);
    if (item?.status === "conflict") return;
    if (!item) { item = { desired: quantity, version: p.version, status: "waiting" }; pending.current.set(id, item); }
    else item.desired = quantity;
    applyProducts(list => list.map(p => p.id === id ? { ...p, quantity } : p));
    clearTimeout(timers.current.get(id));
    if (item.status !== "saving") timers.current.set(id, setTimeout(() => { timers.current.delete(id); void save(id); }, 350));
    change();
  }
  function step(id: number, delta: number) {
    setDrafts(d => { const next = { ...d }; delete next[id]; return next; });
    const p = productsRef.current.find(p => p.id === id);
    if (p) update(id, Math.min(999999, Math.max(0, p.quantity + delta)));
  }
  function resolve(id: number) {
    const item = pending.current.get(id);
    if (!item?.current) return;
    const current = item.current;
    storeConfirmed(confirmedRef.current.map(p => p.id === id ? { ...p, ...current } : p));
    applyProducts(list => list.map(p => p.id === id ? { ...p, ...current } : p));
    pending.current.delete(id);
    setDrafts(d => { const next = { ...d }; delete next[id]; return next; });
    change();
  }
  useEffect(() => {
    alive.current = true;
    try {
      const local = readSnapshot(window.localStorage);
      if (local) {
        confirmedRef.current = local.products; checkingCache.current = true;
        applyProducts(() => local.products); setSnapshot(local); setLocalSavedAt(local.savedAt); setLoading(false);
      }
    } catch { setStorageError("Local backup is unreadable or unavailable. It has not been used to change cloud stock."); }
    void load(); setOnline(navigator.onLine);
    const connection = () => { setOnline(navigator.onLine); if (navigator.onLine) { void load(); for (const [id, item] of pending.current) if (item.status === "error") void save(id); } };
    const focus = () => { if (document.visibilityState === "visible") void load(); };
    const unload = (e: BeforeUnloadEvent) => { if (pending.current.size || lockedRef.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("online", connection); window.addEventListener("offline", connection);
    document.addEventListener("visibilitychange", focus); window.addEventListener("beforeunload", unload);
    const interval = setInterval(focus, 10000);
    return () => { alive.current = false; clearInterval(interval); window.removeEventListener("online", connection); window.removeEventListener("offline", connection); document.removeEventListener("visibilitychange", focus); window.removeEventListener("beforeunload", unload); for (const t of timers.current.values()) clearTimeout(t); };
  }, []);
  async function reviewBackup() {
    if (pending.current.size || lockedRef.current || !navigator.onLine) throw new Error("Wait for saved changes and an internet connection before restoring.");
    lockedRef.current = true; setLocked(true); generation.current++;
    const response = await fetch("/api/stock", { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Current cloud stock couldn’t be checked. Nothing will be restored.");
    return validateProducts(await response.json());
  }
  function endReview() { lockedRef.current = false; setLocked(false); generation.current++; void load(); }
  async function restoreBackup(backup: StockBackup, expected: Product[]) {
    if (pending.current.size || !navigator.onLine) throw new Error("Restore needs an internet connection and no pending saves.");
    const response = await fetch("/api/stock/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ backup, expected, mutationId: crypto.randomUUID() }), signal: AbortSignal.timeout(30000) });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Restore failed. Close this preview and refresh before trying again.");
    const refreshed = await fetch("/api/stock", { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!refreshed.ok) throw new Error("Restore was saved, but refresh failed. Close this preview and refresh to check the result.");
    const data = validateProducts(await refreshed.json());
    checkingCache.current = false; storeConfirmed(data); applyProducts(() => data); setDrafts({}); setCloudReady(true); setLoadError("");
  }
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = products.filter(p => words.every(w => p.name.toLowerCase().includes(w)) && (filter === "all" || p.quantity > 0));
  const total = products.reduce((n, p) => n + p.quantity, 0);
  const inStock = products.filter(p => p.quantity > 0).length;
  const unsaved = pending.current.size;
  const errors = [...pending.current.values()].some(p => p.status === "error" || p.status === "conflict");
  const readOnly = !online || !cloudReady || locked;
  return <div className="app-shell">
    <header className="topbar"><div className="topbar-inner"><a className="brand" href="/" aria-label="Stockroom home"><span className="brand-icon"><Box size={23}/></span><span>stockroom<span className="brand-dot">.</span></span></a><div className="shop-label"><span className="live-dot"/> YOUR SHOP</div></div></header>
    <main>
      <section className="intro"><div><div className="eyebrow">KEEP EVERY PIECE IN CHECK</div><h1>Stock counter<span>.</span></h1><p>A quick count. Everything in its place.</p></div><div className={"sync-pill " + (!online || errors || loadError ? "warning" : "")} role="status">{!online ? <WifiOff size={15}/> : unsaved && !errors ? <LoaderCircle size={15} className="spin"/> : errors || loadError ? <CircleAlert size={15}/> : <CheckCheck size={16}/>}<span>{loading ? "Loading stock" : !online ? "Offline · read only" : locked ? "Reviewing backup" : errors ? "Changes need attention" : unsaved ? "Saving changes…" : !cloudReady ? "Saved copy · read only" : "All changes saved"}</span></div></section>
      <section className="overview" aria-label="Stock overview"><div><span className="stat-label">Products</span><strong>{loading ? "—" : products.length.toLocaleString()}<small>in your catalogue</small></strong></div><div><span className="stat-label">Total pieces</span><strong>{loading ? "—" : total.toLocaleString()}<small>current stock</small></strong></div><div className="third-stat"><span className="stat-label">Products in stock</span><strong>{loading ? "—" : inStock.toLocaleString()}<small>with quantity above zero</small></strong></div><span className="overview-icon" aria-hidden="true"><Package size={48} strokeWidth={1}/></span></section>
      <BackupPanel snapshot={snapshot} localSavedAt={localSavedAt} storageError={storageError} canRestore={online && !locked} busy={unsaved > 0} onReview={reviewBackup} onRestore={restoreBackup} onReviewEnd={endReview}/>
      <section className="workspace">
        <div className="workspace-heading"><div className="tabs" role="tablist" aria-label="View"><button role="tab" aria-selected={view === "count"} className={view === "count" ? "active" : ""} onClick={() => setView("count")}>Count stock</button><button role="tab" aria-selected={view === "products"} className={view === "products" ? "active" : ""} onClick={() => setView("products")}>Products</button></div><span className="unit-label">UNIT <b>Pieces</b></span></div>
        <div className="toolbar"><div className="search"><Search size={20}/><input aria-label="Search products" placeholder="Search product name…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={17}/></button>}<span className="search-count">{visible.length}</span></div><button className="refresh" aria-label="Refresh shared stock" onClick={() => void load(true)} disabled={refreshing}><RefreshCw size={18} className={refreshing ? "spin" : ""}/></button></div>
        <div className="list-meta"><div className="filters"><button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>All products</button><button className={filter === "stock" ? "selected" : ""} onClick={() => setFilter("stock")}>In stock</button></div><span>{view === "count" ? "Tap ± or enter a quantity" : "Your product catalogue"}</span></div>
        {!online && <div className="notice"><WifiOff size={17}/> Read-only count from this device. Internet is required to verify or save stock. Keep this page open if changes are still pending.</div>}
        {loadError && <div className="notice"><CircleAlert size={17}/><span>{loadError}</span><button onClick={() => void load(true)}>Retry</button></div>}
        <div className="column-labels"><span>PRODUCT NAME</span><span>{view === "count" ? "QUANTITY · PCS" : "CURRENT STOCK"}</span></div>
        {loading ? <div className="empty"><LoaderCircle className="spin" size={28}/><h2>Getting your products ready</h2><p>Loading shared stock…</p></div> : !visible.length ? <div className="empty"><Search size={30}/><h2>{query ? "No matching products" : filter === "stock" ? "No stock added yet" : "Products couldn’t be loaded"}</h2><p>{query ? "Try a shorter name or a different spelling." : "Your products start at zero. Add quantities as you count."}</p>{query && <button onClick={() => setQuery("")}>Clear search</button>}</div> : <div className="product-list">{visible.map(p => {
          const item = pending.current.get(p.id); const conflict = item?.status === "conflict"; const statusError = item?.status === "error";
          return <article className={"product-row " + (p.quantity > 0 ? "has-stock " : "") + (item ? "pending-row" : "")} key={p.id}>
            <div className="product-info"><div className="product-marker"><Package size={19} strokeWidth={1.6}/></div><div><h2>{p.name}</h2><div className="product-subline"><span className={p.quantity > 0 ? "stock-tag positive" : "stock-tag"}>{p.quantity > 0 ? "In stock" : "Zero stock"}</span><span className="piece-label">Pieces</span></div></div></div>
            <div className="quantity-area">{view === "count" ? <div className="stepper"><button aria-label={`Decrease ${p.name}`} disabled={readOnly || p.quantity === 0 || conflict} onClick={() => step(p.id, -1)}><Minus size={19}/></button><input aria-label={`Quantity for ${p.name}`} inputMode="numeric" pattern="[0-9]*" maxLength={6} disabled={readOnly || conflict} value={drafts[p.id] ?? String(p.quantity)} onFocus={e => e.target.select()} onChange={e => { const value = e.target.value; if (!/^\d{0,6}$/.test(value)) return; setDrafts(d => ({ ...d, [p.id]: value })); if (value !== "") update(p.id, Number(value)); }} onBlur={() => { setDrafts(d => { const next = { ...d }; delete next[p.id]; return next; }); if (item?.status === "waiting") { clearTimeout(timers.current.get(p.id)); void save(p.id); } }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}/><button className="plus" aria-label={`Increase ${p.name}`} disabled={readOnly || p.quantity >= 999999 || conflict} onClick={() => step(p.id, 1)}><Plus size={20}/></button></div> : <span className="read-quantity">{p.quantity.toLocaleString()} <small>pcs</small></span>}
            {item && <div className={"row-status " + (statusError || conflict ? "error" : "")} role="status">{conflict ? <button onClick={() => resolve(p.id)}>Changed elsewhere · load saved value</button> : statusError ? <button onClick={() => void save(p.id)}><CircleAlert size={12}/>Not saved · retry</button> : <><LoaderCircle size={11} className="spin"/> Saving…</>}</div>}</div>
          </article>;
        })}</div>}
        <div className="list-footer"><span>{visible.length} of {products.length} products</span><span><Check size={13}/> Quantities auto-save</span></div>
      </section><footer className="footer"><span>Small counts. A clearer shop.</span><span>Stockroom <span className="brand-dot">●</span></span></footer>
    </main>
  </div>;
}
