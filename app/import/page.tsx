'use client';
import { useState, useRef } from 'react';
import Header from '@/components/layout/Header';
import { Upload, FileText, CheckCircle2, XCircle, AlertTriangle, ChevronRight, Info } from 'lucide-react';
import Link from 'next/link';

interface ImportResult {
  name: string;
  status: 'imported' | 'skipped' | 'error';
  loan_id?: number;
  error?: string;
}
interface ImportResponse {
  imported: number;
  total: number;
  results: ImportResult[];
}

const SAMPLE_CSV = `Borrower Name,Principal,Interest Amount,Start Date,Week 1,Week 2,Week 3,Week 4,Week 5,Week 6,Week 7,Week 8,Week 9,Week 10
Ravi Kumar,10000,1200,01/01/2026,1000-08/1,1000-15/1,1000-22/1,1000-29/1,,,,,,
Priya Sharma,5000,600,15/01/2026,500-22/1,500-29/1,,,,,,,,`;

export default function ImportPage() {
  const [csv, setCsv] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => setCsv((e.target?.result as string) || '');
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleFile(file);
  };

  const handleImport = async () => {
    if (!csv.trim()) { setError('Please paste CSV data or upload a file'); return; }
    setError('');
    setImporting(true);
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Import failed'); return; }
      setResult(data);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  const reset = () => { setCsv(''); setResult(null); setError(''); };

  return (
    <div className="pb-24">
      <Header title="Import" />
      <div className="p-4 max-w-2xl mx-auto space-y-4">

        {result ? (
          /* Results view */
          <div className="space-y-4">
            <div className={`card p-5 ${result.imported > 0 ? 'border-2 border-emerald-200' : ''}`}>
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle2 className={`w-7 h-7 ${result.imported > 0 ? 'text-emerald-500' : 'text-gray-300'}`} />
                <div>
                  <p className="text-xl font-bold text-gray-900">{result.imported} imported</p>
                  <p className="text-sm text-gray-400">out of {result.total} rows</p>
                </div>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-50">
                <h3 className="font-semibold text-gray-700 text-sm">Details</h3>
              </div>
              {result.results.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    {r.status === 'imported' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : r.status === 'error' ? (
                      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{r.name}</p>
                      {r.error && <p className="text-xs text-red-400">{r.error}</p>}
                    </div>
                  </div>
                  {r.loan_id && (
                    <Link href={`/loans/${r.loan_id}`}
                      className="text-xs flex items-center gap-0.5 font-medium"
                      style={{ color: 'var(--green)' }}>
                      View <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={reset}
                className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl font-medium text-sm hover:bg-gray-50 transition">
                Import More
              </button>
              <Link href="/loans"
                className="flex-1 py-3 rounded-xl font-semibold text-sm text-white text-center transition"
                style={{ background: 'var(--green)' }}>
                View Loans
              </Link>
            </div>
          </div>
        ) : (
          /* Upload view */
          <>
            {/* Format guide */}
            <div className="card p-4 flex gap-3" style={{ background: 'var(--green-light)', borderColor: 'var(--green)' }}>
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--green)' }} />
              <div className="text-xs space-y-1" style={{ color: 'var(--green-dark)' }}>
                <p className="font-bold">Expected CSV format (Notion export)</p>
                <p>Columns: <code className="bg-white/60 px-1 rounded">Borrower Name, Principal, Interest Amount, Start Date, Week 1, Week 2...</code></p>
                <p>Week cell format: <code className="bg-white/60 px-1 rounded">1000-23/3</code> (₹1000 collected on 23rd March) or just <code className="bg-white/60 px-1 rounded">1000</code></p>
                <p>Empty week cells = not yet collected. Interest Amount column is optional.</p>
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="card p-8 text-center border-2 border-dashed border-gray-200 hover:border-gray-300 cursor-pointer transition-colors"
            >
              <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="font-semibold text-gray-600">Drop CSV file here</p>
              <p className="text-sm text-gray-400 mt-1">or click to browse</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium">OR PASTE CSV</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <div>
              <textarea
                value={csv}
                onChange={e => setCsv(e.target.value)}
                rows={8}
                className="input font-mono text-xs resize-none"
                placeholder={SAMPLE_CSV}
              />
              <button
                onClick={() => setCsv(SAMPLE_CSV)}
                className="mt-1.5 text-xs text-gray-400 hover:text-gray-600 transition flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> Load sample data
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={importing || !csv.trim()}
              className="btn-primary w-full justify-center py-3.5 text-base disabled:opacity-50">
              {importing ? 'Importing...' : 'Import Loans'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
