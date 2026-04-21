'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/layout/Header';
import { Plus, Search, Phone, MapPin, FileText, Edit2, Trash2, X, ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';

interface Customer {
  id: string; name: string; phone: string | null; address: string | null;
  notes: string | null; total_loans: number; active_loans: number;
  total_principal: number; total_interest: number; created_at: string;
}

function fmt(n: number) {
  const v = n || 0;
  if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L';
  if (v >= 1000) return '₹' + (v / 1000).toFixed(0) + 'K';
  return '₹' + v.toLocaleString('en-IN');
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--glass-border)' }}>
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <h2 className="font-bold text-[17px]" style={{ color: 'var(--text)' }}>{title}</h2>
          <button onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/5">
            <X className="w-5 h-5" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <div className="p-5 pb-8">{children}</div>
      </div>
    </div>
  );
}

function CustomerForm({ initial, onSave, onCancel, saving }: {
  initial?: Partial<Customer>; onSave: (d: Partial<Customer>) => void;
  onCancel: () => void; saving: boolean;
}) {
  const [form, setForm] = useState({
    name: initial?.name || '', phone: initial?.phone || '',
    address: initial?.address || '', notes: initial?.notes || '',
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form); }} className="space-y-3.5">
      {[
        { key: 'name', label: 'Full Name *', type: 'text', placeholder: 'e.g. Ravi Kumar', required: true },
        { key: 'phone', label: 'Phone', type: 'tel', placeholder: '98765 43210' },
        { key: 'address', label: 'Address', type: 'text', placeholder: 'Street, City' },
      ].map(({ key, label, type, placeholder, required }) => (
        <div key={key}>
          <label className="section-label block mb-1.5">{label}</label>
          <input value={(form as any)[key]} onChange={set(key)} type={type}
            required={required} className="input" placeholder={placeholder} />
        </div>
      ))}
      <div>
        <label className="section-label block mb-1.5">Notes</label>
        <textarea value={form.notes} onChange={set('notes')} rows={2}
          className="input resize-none" placeholder="Guarantor, purpose…" />
      </div>
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn-ghost flex-1 justify-center py-3">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-3 text-sm disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchCustomers = () => {
    setLoading(true);
    fetch('/api/customers').then(r => r.json()).then(setCustomers).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { fetchCustomers(); }, []);

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  );

  const handleAdd = async (data: Partial<Customer>) => {
    setSaving(true);
    const res = await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (res.ok) { setShowAdd(false); fetchCustomers(); }
    setSaving(false);
  };

  const handleEdit = async (data: Partial<Customer>) => {
    if (!editCustomer) return;
    setSaving(true);
    const res = await fetch(`/api/customers/${editCustomer.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (res.ok) { setEditCustomer(null); fetchCustomers(); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/customers/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null);
    fetchCustomers();
  };

  const totalPrincipal = customers.reduce((s, c) => s + (c.total_principal || 0), 0);
  const activeCount = customers.filter(c => c.active_loans > 0).length;

  return (
    <div className="pb-28 min-h-screen" style={{ background: 'var(--bg)' }}>
      <Header title="Borrowers" />

      <div className="p-4 space-y-4">

        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: 'Total', value: customers.length, color: 'var(--text)' },
            { label: 'Active', value: activeCount, color: 'var(--green)' },
            { label: 'Capital Out', value: fmt(totalPrincipal), color: 'var(--purple)' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card p-3.5 text-center">
              <p className="text-xl font-black" style={{ color }}>{value}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Search + Add */}
        <div className="flex gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="input pl-10" placeholder="Search by name or phone…" />
          </div>
          <button onClick={() => setShowAdd(true)} className="btn-primary px-4 whitespace-nowrap">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        {/* Customer list */}
        {loading ? (
          <div className="card overflow-hidden">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b last:border-0 animate-pulse"
                style={{ borderColor: 'var(--glass-border)' }}>
                <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ background: 'var(--glass-bg-2)' }} />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 rounded w-32" style={{ background: 'var(--glass-bg-2)' }} />
                  <div className="h-3 rounded w-24" style={{ background: 'var(--glass-bg-2)' }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <Users className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--muted-2)' }} />
            <p className="font-semibold text-sm" style={{ color: 'var(--muted)' }}>
              {search ? 'No results' : 'No borrowers yet'}
            </p>
            <p className="text-sm mt-1 mb-4" style={{ color: 'var(--muted-2)' }}>
              {search ? 'Try a different name' : 'Add your first borrower to get started'}
            </p>
            {!search && (
              <button onClick={() => setShowAdd(true)} className="btn-primary mx-auto text-sm">
                <Plus className="w-4 h-4" /> Add Borrower
              </button>
            )}
          </div>
        ) : (
          <div className="card overflow-hidden">
            {filtered.map(c => (
              <div key={c.id} className="border-b last:border-0" style={{ borderColor: 'var(--glass-border)' }}>
                <div className="flex items-center gap-3 px-4 py-3.5">
                  {/* Avatar — link to detail */}
                  <Link href={`/customers/${c.id}`} className="avatar flex-shrink-0 text-base font-bold" style={{ width: 40, height: 40 }}>
                    {c.name[0].toUpperCase()}
                  </Link>

                  {/* Info — link to detail */}
                  <Link href={`/customers/${c.id}`} className="flex-1 min-w-0">
                    <p className="font-semibold text-[15px] truncate" style={{ color: 'var(--text)' }}>{c.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {c.phone && (
                        <span className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                          <Phone className="w-3 h-3" />{c.phone}
                        </span>
                      )}
                      {c.address && (
                        <span className="text-xs flex items-center gap-1 truncate" style={{ color: 'var(--muted)' }}>
                          <MapPin className="w-3 h-3" />{c.address}
                        </span>
                      )}
                    </div>
                  </Link>

                  {/* Right side */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <Link href={`/customers/${c.id}`} className="text-right mr-1 block">
                      <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{fmt(c.total_principal)}</p>
                      <p className="text-[11px]">
                        {c.active_loans > 0
                          ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>{c.active_loans} active</span>
                          : <span style={{ color: 'var(--muted)' }}>no loans</span>}
                      </p>
                    </Link>
                    <Link href={`/customers/${c.id}`}
                      className="p-1.5 rounded-lg transition-colors hover:bg-white/5">
                      <ChevronRight className="w-4 h-4" style={{ color: 'var(--muted-2)' }} />
                    </Link>
                    <button onClick={() => setEditCustomer(c)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-white/5">
                      <Edit2 className="w-3.5 h-3.5" style={{ color: 'var(--muted-2)' }} />
                    </button>
                    <button onClick={() => setDeleteId(c.id)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-white/5">
                      <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--muted-2)' }} />
                    </button>
                  </div>
                </div>

                {c.notes && (
                  <div className="mx-4 mb-2.5 -mt-1 rounded-lg px-3 py-1.5 flex items-start gap-1.5"
                    style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
                    <FileText className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: 'var(--amber)' }} />
                    <p className="text-xs" style={{ color: '#fbbf24' }}>{c.notes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="Add Borrower" onClose={() => setShowAdd(false)}>
          <CustomerForm onSave={handleAdd} onCancel={() => setShowAdd(false)} saving={saving} />
        </Modal>
      )}
      {editCustomer && (
        <Modal title="Edit Borrower" onClose={() => setEditCustomer(null)}>
          <CustomerForm initial={editCustomer} onSave={handleEdit} onCancel={() => setEditCustomer(null)} saving={saving} />
        </Modal>
      )}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--glass-border)' }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.2)' }}>
              <Trash2 className="w-7 h-7" style={{ color: 'var(--red)' }} />
            </div>
            <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--text)' }}>Delete borrower?</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
              All loans and payment records will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="btn-ghost flex-1 justify-center py-3">
                Cancel
              </button>
              <button onClick={handleDelete}
                className="flex-1 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:brightness-110"
                style={{ background: 'var(--red)', boxShadow: '0 4px 16px var(--glow-red)' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
