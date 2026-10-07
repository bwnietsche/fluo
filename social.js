/* Fluo — amigos por @ e divisões compartilhadas, cifradas de ponta a ponta (servidor: supabase/friends.sql).
   Cada pessoa tem um par de chaves ECDH P-256: a pública fica no perfil (@), a privada fica DENTRO do cofre cifrado dela.
   Cada divisão enviada a um amigo é cifrada com AES-GCM usando uma chave derivada (ECDH + HKDF) que só os dois conseguem calcular. */
(() => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = u8 => btoa(String.fromCharCode(...new Uint8Array(u8)));
  const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const EC = { name: "ECDH", namedCurve: "P-256" };
  const bare = j => { const c = { ...j }; delete c.key_ops; delete c.ext; return c; };
  const db = () => window.Store?.client || null;
  const memo = new Map();

  async function newKeys() {
    const k = await crypto.subtle.generateKey(EC, true, ["deriveBits"]);
    return { priv: await crypto.subtle.exportKey("jwk", k.privateKey), pub: await crypto.subtle.exportKey("jwk", k.publicKey) };
  }
  async function sharedKey(privJwk, theirPubJwk, myUid, theirUid) {
    const id = myUid + ">" + theirUid + ">" + JSON.stringify(theirPubJwk);
    if (memo.has(id)) return memo.get(id);
    const priv = await crypto.subtle.importKey("jwk", bare(privJwk), EC, false, ["deriveBits"]);
    const pub = await crypto.subtle.importKey("jwk", bare(theirPubJwk), EC, false, []);
    const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256);
    const hk = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode([myUid, theirUid].sort().join(":")), info: enc.encode("fluo-share-v1") }, hk, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    memo.set(id, key); return key;
  }
  async function seal(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    return b64(iv) + "." + b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj))));
  }
  async function open(key, s) {
    const [iv, ct] = s.split(".");
    return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: ub64(iv) }, key, ub64(ct))));
  }
  const rpc = async (fn, args) => { const { data, error } = await db().rpc(fn, args); if (error) throw error; return data; };

  window.Social = {
    available: () => !!db() && !!window.Store?.user,
    newKeys, sharedKey, seal, open,
    async profile() { const { data, error } = await db().from("profiles").select("handle,pub").eq("user_id", Store.user.id).maybeSingle(); if (error) throw error; return data; },
    setHandle: (handle, pub) => rpc("set_handle", { p_handle: handle, p_pub: pub }),
    friends: async () => (await rpc("my_friends")) || [],
    request: handle => rpc("request_friend", { p_handle: handle }),
    respond: (id, accept) => rpc("respond_friend", { p_id: id, p_accept: accept }),
    remove: id => rpc("remove_friend", { p_id: id }),
    /* envia (ou atualiza) uma divisão para um amigo; deleted=true avisa que ela foi removida */
    async send(sid, toUid, theirPub, keys, obj, deleted) {
      const payload = deleted ? "x.x" : await seal(await sharedKey(keys.priv, theirPub, Store.user.id, toUid), obj);
      const { error } = await db().from("shares").upsert({ id: sid, from_user: Store.user.id, to_user: toUid, payload, deleted: !!deleted, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    /* divisões que amigos enviaram para mim, já decifradas */
    async inbox(keys, friends) {
      const { data, error } = await db().from("shares").select("id,from_user,payload,deleted").eq("to_user", Store.user.id);
      if (error) throw error;
      const by = Object.fromEntries(friends.filter(f => f.status === "accepted").map(f => [f.uid, f])), out = [];
      for (const r of data || []) {
        const f = by[r.from_user]; if (!f || r.deleted) continue;
        try { out.push({ sid: r.id, uid: f.uid, handle: f.handle, ...(await open(await sharedKey(keys.priv, f.pub, Store.user.id, f.uid), r.payload)) }); } catch (e) { /* chave trocada ou conteúdo inválido: ignora */ }
      }
      return out;
    },
  };
})();
