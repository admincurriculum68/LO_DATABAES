import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Undo2 } from 'lucide-react';
import { DialogContext } from '../lib/dialogContext';

// กล่องยืนยันกลางของระบบ ใช้ <dialog> ของเบราว์เซอร์ จึงกักโฟกัสไว้ในกล่องและปิดด้วย Esc ได้เอง
// ต่างจาก window.confirm ตรงที่บอกได้ชัดว่าจะเกิดอะไรกับข้อมูล ปุ่มที่ลบหรือเปลี่ยนข้อมูลจำนวนมากเป็นสีแดง
// และเบราว์เซอร์ไม่สามารถเลือกซ่อนกล่องนี้ได้เหมือนกล่องของระบบ
export default function DialogProvider({ children }) {
    const dialogRef = useRef(null);
    const inputRef = useRef(null);
    const resolverRef = useRef(null);
    const [request, setRequest] = useState(null);
    const [value, setValue] = useState('');

    const open = useCallback(options => new Promise(resolve => {
        resolverRef.current?.(options.kind === 'prompt' ? null : false);
        resolverRef.current = resolve;
        setValue(options.defaultValue || '');
        setRequest(options);
    }), []);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!request || !dialog) return;
        if (!dialog.open) dialog.showModal();
        if (request.kind === 'prompt') inputRef.current?.focus();
    }, [request]);

    const finish = useCallback(result => {
        const resolve = resolverRef.current;
        resolverRef.current = null;
        if (dialogRef.current?.open) dialogRef.current.close();
        setRequest(null);
        resolve?.(result);
    }, []);

    const cancelResult = request?.kind === 'prompt' ? null : false;

    const api = useMemo(() => ({
        confirm: options => open({ kind: 'confirm', ...options }),
        prompt: options => open({ kind: 'prompt', ...options }),
        undo: (message, onUndo) => toast(t => (
            <span className="flex items-center gap-3">
                <span className="text-sm">{message}</span>
                <button
                    type="button"
                    onClick={async () => { toast.dismiss(t.id); await onUndo(); }}
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-indigo-300 bg-white px-3 text-sm font-bold text-indigo-800 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                >
                    <Undo2 className="h-4 w-4" aria-hidden="true" />เลิกทำ
                </button>
            </span>
        ), { duration: 8000 }),
    }), [open]);

    const submit = event => {
        event.preventDefault();
        if (request?.kind === 'prompt') {
            if (!value.trim()) { inputRef.current?.focus(); return; }
            finish(value.trim());
            return;
        }
        finish(true);
    };

    return (
        <DialogContext.Provider value={api}>
            {children}
            <dialog
                ref={dialogRef}
                onCancel={event => { event.preventDefault(); finish(cancelResult); }}
                aria-labelledby="app-dialog-title"
                aria-describedby={request?.message ? 'app-dialog-message' : undefined}
                className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50"
            >
                {request && (
                    <form onSubmit={submit} className="space-y-5 p-6">
                        <div className="flex items-start gap-3">
                            {request.tone === 'danger' && (
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
                                    <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                                </span>
                            )}
                            <div className="min-w-0 space-y-1.5">
                                <h2 id="app-dialog-title" className="text-lg font-bold text-slate-950">{request.title}</h2>
                                {request.message && <p id="app-dialog-message" className="whitespace-pre-line text-sm leading-6 text-slate-700">{request.message}</p>}
                            </div>
                        </div>
                        {request.kind === 'prompt' && (
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-bold text-slate-800">{request.inputLabel || 'ข้อความ'}</span>
                                <textarea
                                    ref={inputRef}
                                    rows={3}
                                    value={value}
                                    onChange={event => setValue(event.target.value)}
                                    placeholder={request.placeholder}
                                    className="w-full rounded-xl border border-field p-3 text-sm leading-6 placeholder:text-slate-600 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                />
                            </label>
                        )}
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button type="button" autoFocus={request.kind !== 'prompt'} onClick={() => finish(cancelResult)} className="btn-secondary">
                                {request.cancelLabel || 'ยกเลิก'}
                            </button>
                            <button type="submit" className={request.tone === 'danger' ? 'btn-danger' : 'btn-primary'}>
                                {request.confirmLabel || 'ยืนยัน'}
                            </button>
                        </div>
                    </form>
                )}
            </dialog>
        </DialogContext.Provider>
    );
}
