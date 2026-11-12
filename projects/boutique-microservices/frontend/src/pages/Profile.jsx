import { useEffect, useState } from 'react';
import { api } from '../api.js';

const EMPTY = { fullName: '', phone: '', address: '' };

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [saving, setSaving] = useState(false);

  const load = (p) => {
    setProfile(p);
    setForm({ fullName: p.fullName || '', phone: p.phone || '', address: p.address || '' });
  };

  useEffect(() => {
    api('/users/me').then((d) => load(d.profile)).catch((err) => setStatus({ type: 'error', message: err.message }));
  }, []);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setStatus({ type: '', message: '' });
    try {
      const { profile: saved } = await api('/users/me', { method: 'PUT', body: form });
      load(saved);
      setStatus({ type: 'success', message: 'Profile saved' });
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return status.message ? <p className="alert error">{status.message}</p> : <p className="muted">Loading profile…</p>;

  return (
    <section className="narrow">
      <h1>Your profile</h1>
      {status.message && <p className={`alert ${status.type}`}>{status.message}</p>}
      <form className="card form" onSubmit={save}>
        <label>
          Email
          <input value={profile.email} disabled />
        </label>
        <label>
          Full name
          <input value={form.fullName} onChange={update('fullName')} maxLength={200} autoComplete="name" />
        </label>
        <label>
          Phone
          <input value={form.phone} onChange={update('phone')} maxLength={30} autoComplete="tel" />
        </label>
        <label>
          Shipping address
          <textarea value={form.address} onChange={update('address')} maxLength={500} rows={3} autoComplete="street-address" />
        </label>
        <button type="submit" className="button" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
      </form>
    </section>
  );
}
