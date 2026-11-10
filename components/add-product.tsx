"use client";
import { useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Plus } from "lucide-react";
export function AddProduct({ disabled, onAdd }: { disabled: boolean; onAdd: (name: string, creationId: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const submission = useRef<{ name: string; id: string } | null>(null);
  const submitting = useRef(false);
  const toggle = useRef<HTMLButtonElement>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || disabled || !name.trim()) return;
    submitting.current = true; setBusy(true); setError(""); setMessage("");
    if (submission.current?.name !== name) submission.current = { name, id: crypto.randomUUID() };
    try {
      await onAdd(name, submission.current.id);
      setMessage(`Added ${name.trim()}. Initial stock is 0 pieces.`);
      setName(""); setOpen(false); submission.current = null;
      setTimeout(() => toggle.current?.focus(), 0);
    } catch (error) { setError(error instanceof Error ? error.message : "Couldn’t add product. Please retry."); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <section className="add-product" aria-label="Add a product">
    <button ref={toggle} className="add-product-toggle" type="button" disabled={disabled || busy} aria-expanded={open} aria-controls={open ? "add-product-form" : undefined} onClick={() => { setOpen(!open); setError(""); setMessage(""); }}><Plus size={17}/> Add product</button>
    {open && <form id="add-product-form" onSubmit={submit}>
      <label htmlFor="new-product-name">Product name</label>
      <input id="new-product-name" autoFocus maxLength={160} required value={name} disabled={busy} placeholder="e.g. Paint shade · 1 L" onChange={e => { setName(e.target.value); setError(""); }}/>
      <p>Starts at 0 pieces. Use the quantity counter after adding it.</p>
      {error && <p className="backup-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" disabled={busy} onClick={() => { setOpen(false); setError(""); toggle.current?.focus(); }}>Cancel</button><button className="confirm-restore" type="submit" disabled={disabled || busy || !name.trim()}>{busy && <LoaderCircle className="spin" size={16}/>} {busy ? "Adding…" : "Save product"}</button></div>
    </form>}
    {message && <p className="add-product-success" role="status">{message}</p>}
  </section>;
}
