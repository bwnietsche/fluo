/* Caixa Verde — armazenamento
   Modo nuvem: Supabase Auth + tabela vaults (1 linha por usuário, dados cifrados com AES-256-GCM no navegador).
   Modo demo:  localStorage, sem conta.
   Economia de requisições: 1 leitura ao entrar, escrita agrupada (debounce 2,5 s) + ao sair da tela. */
(() => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = u8 => btoa(String.fromCharCode(...new Uint8Array(u8)));
  const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rnd = n => crypto.getRandomValues(new Uint8Array(n));

  async function deriveKey(secret, saltB64) {
    const base = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: ub64(saltB64), iterations: 310000, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt", "wrapKey", "unwrapKey"]);
  }
  async function seal(key, bytes) { const iv = rnd(12); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes); return b64(iv) + "." + b64(ct); }
  async function open(key, s) { const [iv, ct] = s.split("."); return crypto.subtle.decrypt({ name: "AES-GCM", iv: ub64(iv) }, key, ub64(ct)); }
  async function wrap(dataKey, secret, salt) { const raw = await crypto.subtle.exportKey("raw", dataKey); return seal(await deriveKey(secret, salt), raw); }
  async function unwrap(s, secret, salt) {
    const raw = await open(await deriveKey(secret, salt), s);
    return crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]);
  }
  const newRecoveryCode = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const r = rnd(20); let s = ""; r.forEach((x, i) => { s += a[x % a.length]; if (i % 4 === 3 && i < 19) s += "-"; }); return s; };

  const cfg = window.CV_CONFIG || {};
  const cloudReady = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const sb = cloudReady ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true } }) : null;

  let mode = null, dataKey = null, version = 0, user = null, timer = null, pending = null, onStatus = () => {};
  const LOCAL = "caixaverde.demo";
  const KEYCACHE = "caixaverde.k"; // chave dos dados guardada só nesta sessão do navegador

  async function cacheKey() { try { sessionStorage.setItem(KEYCACHE, b64(await crypto.subtle.exportKey("raw", dataKey))); } catch (e) {} }
  async function restoreKey() { try { const s = sessionStorage.getItem(KEYCACHE); if (s) dataKey = await crypto.subtle.importKey("raw", ub64(s), "AES-GCM", true, ["encrypt", "decrypt"]); } catch (e) {} return !!dataKey; }

  async function pull() {
    const { data, error } = await sb.from("vaults").select("*").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  const Store = {
    cloudReady,
    get mode() { return mode; },
    get user() { return user; },
    onStatus(fn) { onStatus = fn; },

    startDemo() {
      mode = "demo"; user = { email: "modo demonstração" };
      try { localStorage.setItem("caixaverde.mode", "demo"); return JSON.parse(localStorage.getItem(LOCAL)); } catch (e) { return null; }
    },

    /* sessão já aberta (ex.: recarregou a página) */
    async resume() {
      let demo = false; try { demo = localStorage.getItem("caixaverde.mode") === "demo"; } catch (e) {}
      if (demo) { const st = this.startDemo(); if (st) return { state: st }; }
      if (!sb) return null;
      const { data } = await sb.auth.getSession();
      if (!data.session) return null;
      user = data.session.user;
      if (!(await restoreKey())) return { needPassword: true, email: user.email };
      const row = await pull(); if (!row) return { needPassword: true, email: user.email };
      mode = "cloud"; version = row.version;
      return { state: JSON.parse(dec.decode(await open(dataKey, row.data))) };
    },

    async signUp(email, password, initialState) {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.session) return { confirmEmail: true };
      user = data.session.user;
      return this.createVault(password, initialState);
    },

    async createVault(password, initialState) {
      dataKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      const rec = newRecoveryCode(), kdf_salt = b64(rnd(16)), rec_salt = b64(rnd(16));
      const row = { user_id: user.id, version: 1, kdf_salt, rec_salt,
        key_pw: await wrap(dataKey, password, kdf_salt), key_rec: await wrap(dataKey, rec, rec_salt),
        data: await seal(dataKey, enc.encode(JSON.stringify(initialState))) };
      const { error } = await sb.from("vaults").insert(row);
      if (error) throw error;
      mode = "cloud"; version = 1; await cacheKey();
      return { recoveryCode: rec, state: initialState };
    },

    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      user = data.user;
      const row = await pull();
      if (!row) return { noVault: true };
      try { dataKey = await unwrap(row.key_pw, password, row.kdf_salt); }
      catch (e) { return { needRecovery: true }; } // senha trocada por e-mail: pedir código de recuperação
      mode = "cloud"; version = row.version; await cacheKey();
      return { state: JSON.parse(dec.decode(await open(dataKey, row.data))) };
    },

    /* esqueceu a senha: e-mail do Supabase troca a senha de login; o código de recuperação reabre o cofre */
    inRecovery: false,
    async recover(code, newPassword) {
      if (this.inRecovery) { const { error } = await sb.auth.updateUser({ password: newPassword }); if (error) throw error; this.inRecovery = false; }
      const { data: s } = await sb.auth.getUser(); user = s.user;
      const row = await pull();
      dataKey = await unwrap(row.key_rec, code.trim().toUpperCase(), row.rec_salt);
      const kdf_salt = b64(rnd(16));
      const { error } = await sb.from("vaults").update({ kdf_salt, key_pw: await wrap(dataKey, newPassword, kdf_salt) }).eq("user_id", user.id);
      if (error) throw error;
      mode = "cloud"; version = row.version; await cacheKey();
      return { state: JSON.parse(dec.decode(await open(dataKey, row.data))) };
    },

    async resetPasswordEmail(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) throw error;
    },

    async changePassword(newPassword) {
      const { error } = await sb.auth.updateUser({ password: newPassword });
      if (error) throw error;
      const kdf_salt = b64(rnd(16));
      await sb.from("vaults").update({ kdf_salt, key_pw: await wrap(dataKey, newPassword, kdf_salt) }).eq("user_id", user.id);
    },

    /* agenda gravação (agrupa várias mudanças numa requisição só) */
    save(state) {
      if (mode === "demo") { try { localStorage.setItem(LOCAL, JSON.stringify(state)); } catch (e) {} return; }
      if (mode !== "cloud") return;
      pending = state; onStatus("busy");
      clearTimeout(timer); timer = setTimeout(() => this.flush(), 2500);
    },
    async flush() {
      if (mode !== "cloud" || !pending) return;
      const state = pending; pending = null; clearTimeout(timer);
      try {
        const data = await seal(dataKey, enc.encode(JSON.stringify(state)));
        const { data: rows, error } = await sb.from("vaults")
          .update({ data, version: version + 1, updated_at: new Date().toISOString() })
          .eq("user_id", user.id).eq("version", version).select("version");
        if (error) throw error;
        if (!rows.length) { onStatus("conflict"); return; } // outro aparelho salvou antes
        version = rows[0].version; onStatus("ok");
      } catch (e) { pending = pending || state; onStatus("err"); }
    },
    async reload() { const row = await pull(); version = row.version; return JSON.parse(dec.decode(await open(dataKey, row.data))); },

    async signOut() {
      await this.flush();
      try { sessionStorage.removeItem(KEYCACHE); localStorage.removeItem("caixaverde.mode"); } catch (e) {}
      if (sb && mode === "cloud") await sb.auth.signOut();
      mode = null; dataKey = null; user = null;
    },
    async deleteAccount() {
      if (mode === "demo") { try { localStorage.removeItem(LOCAL); } catch (e) {} return; }
      await sb.from("vaults").delete().eq("user_id", user.id);
      await this.signOut();
    },
  };

  // link "esqueci a senha" do e-mail abre o app numa sessão de recuperação
  if (sb) sb.auth.onAuthStateChange(ev => { if (ev === "PASSWORD_RECOVERY") { Store.inRecovery = true; Store.onRecoveryLink?.(); } });

  addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") Store.flush(); });
  window.Store = Store;
})();
