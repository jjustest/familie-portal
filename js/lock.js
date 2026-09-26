// Forælder-lås: kræver fingeraftryk (eller telefonens skærmlås) før forælder-handlinger.
// Bruger WebAuthn (platform-godkender). Fallback: forælderens kodeord.
//
// Bemærk: Låsen beskytter mod at børn bruger en forælders telefon. Selve rettighederne
// håndhæves stadig af databasen (RLS) – et barns konto kan aldrig give point.

const UNLOCK_MINUTES = 5;
let unlockedUntil = 0;
let ctx; // { $, db, state, toast }

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const credKey = () => `webauthn:${ctx.state.session?.user.id}`;

function getCred() {
  try { return localStorage.getItem(credKey()); } catch { return null; }
}
function setCred(v) {
  try { v ? localStorage.setItem(credKey(), v) : localStorage.removeItem(credKey()); } catch { /* ignore */ }
}

async function platformAvailable() {
  try {
    return !!window.PublicKeyCredential &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

/** Tjek at "user verified"-flaget er sat i authenticatorData */
function userVerified(authData) {
  const flags = new Uint8Array(authData)[32];
  return (flags & 0x04) !== 0;
}

async function registerFingerprint() {
  const u = ctx.state.session.user;
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: rand(32),
      rp: { name: 'Just/Nordtorp', id: location.hostname },
      user: { id: new TextEncoder().encode(u.id).slice(0, 64), name: u.email, displayName: ctx.state.me?.name ?? u.email },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
      attestation: 'none',
    },
  });
  setCred(b64u(cred.rawId));
  return true;
}

async function verifyFingerprint() {
  const id = getCred();
  const res = await navigator.credentials.get({
    publicKey: {
      challenge: rand(32),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: unb64u(id), transports: ['internal', 'hybrid'] }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  return userVerified(res.response.authenticatorData);
}

/**
 * Kaldes før forælder-handlinger. Returnerer true hvis låst op.
 * Kun forældre kan låse op; alle andre får false.
 */
export async function requireParent() {
  if (ctx.state.me?.role !== 'parent') return false;
  if (Date.now() < unlockedUntil) return true;
  return new Promise(resolve => openUnlock(resolve));
}

export function lockNow() {
  unlockedUntil = 0;
}

let pending = null;

async function openUnlock(resolve) {
  pending = resolve;
  const dlg = ctx.$('#unlock-dialog');
  const hasPlatform = await platformAvailable();
  const hasCred = !!getCred();
  ctx.$('#unlock-bio').hidden = !hasPlatform;
  ctx.$('#unlock-bio').textContent = hasCred ? '👆 Brug fingeraftryk' : '👆 Opsæt fingeraftryk';
  ctx.$('#unlock-intro').textContent = hasPlatform
    ? (hasCred ? 'Bekræft at det er dig, før du ændrer point og forælder-info.'
               : 'Første gang: tilknyt dit fingeraftryk til denne telefon. Derefter skal det bruges til forælder-ting.')
    : 'Denne enhed har ikke fingerlæser. Skriv dit kodeord for at fortsætte.';
  ctx.$('#unlock-error').textContent = '';
  ctx.$('#unlock-form').reset();
  ctx.$('#unlock-pw-wrap').open = !hasPlatform;
  dlg.showModal();
}

function finish(ok) {
  if (ok) unlockedUntil = Date.now() + UNLOCK_MINUTES * 60e3;
  const dlg = ctx.$('#unlock-dialog');
  if (dlg.open) dlg.close();
  const r = pending; pending = null;
  r?.(ok);
}

export function initLock(c) {
  ctx = c;
  const dlg = ctx.$('#unlock-dialog');
  dlg.addEventListener('cancel', e => { e.preventDefault(); finish(false); });
  ctx.$('#unlock-cancel').addEventListener('click', () => finish(false));

  ctx.$('#unlock-bio').addEventListener('click', async () => {
    ctx.$('#unlock-error').textContent = '';
    try {
      const ok = getCred() ? await verifyFingerprint() : await registerFingerprint();
      if (ok) finish(true);
      else ctx.$('#unlock-error').textContent = 'Fingeraftrykket blev ikke bekræftet.';
    } catch (err) {
      console.warn('[lås]', err);
      if (err?.name === 'NotAllowedError') ctx.$('#unlock-error').textContent = 'Annulleret eller ikke genkendt. Prøv igen, eller brug kodeord.';
      else if (err?.name === 'InvalidStateError' || /credential/i.test(err?.message ?? '')) {
        setCred(null);
        ctx.$('#unlock-error').textContent = 'Fingeraftrykket skal sættes op igen. Tryk på knappen igen.';
        ctx.$('#unlock-bio').textContent = '👆 Opsæt fingeraftryk';
      } else ctx.$('#unlock-error').textContent = 'Fingeraftryk virker ikke her. Brug kodeord.';
      ctx.$('#unlock-pw-wrap').open = true;
    }
  });

  ctx.$('#unlock-form').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = e.target.password.value;
    try {
      await ctx.db.signIn(ctx.state.session.user.email, pw);
      finish(true);
    } catch {
      ctx.$('#unlock-error').textContent = 'Forkert kodeord.';
    }
  });

  // Lås igen, når appen lægges i baggrunden
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') lockNow();
  });
}

export function resetFingerprint() {
  setCred(null);
  lockNow();
}
