/** Fixed, versioned cryptographic formats backed by Node's crypto implementation. */
export const securityRuntime = String.raw`
const __arya_securityError = (code, message) => Object.assign(new Error(message), { code });
const __arya_securityText = (value, label, maximum = 1048576, minimum = 0) => {
  if (typeof value !== 'string' || value.length > maximum || __arya_securityBuffer.byteLength(value, 'utf8') > maximum || __arya_securityBuffer.byteLength(value, 'utf8') < minimum) {
    throw __arya_securityError('ARYA_SECURITY_INPUT', label + ' must be UTF-8 text of ' + minimum + ' to ' + maximum + ' bytes.');
  }
  return value;
};
const __arya_securityDecode = (value, length) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]*$/.test(value)) return null;
  const bytes = __arya_securityBuffer.from(value, 'base64url');
  return bytes.toString('base64url') === value && (length === undefined || bytes.length === length) ? bytes : null;
};
const __arya_securityKey = value => {
  const key = typeof value === 'string' && value.length === 43 ? __arya_securityDecode(value, 32) : null;
  if (!key) throw __arya_securityError('ARYA_SECURITY_KEY', 'Use a 32-byte base64url key from security.generateKey().');
  return key;
};
const __arya_securityEqual = (left, right) => {
  __arya_securityText(left, 'Left value');
  __arya_securityText(right, 'Right value');
  const a = __arya_securityBuffer.from(left, 'utf8'), b = __arya_securityBuffer.from(right, 'utf8');
  return a.length === b.length && __arya_securityCrypto.timingSafeEqual(a, b);
};
const __arya_securityHmac = (key, text) => {
  const bytes = __arya_securityKey(key);
  try { return __arya_securityCrypto.createHmac('sha256', bytes).update(__arya_securityText(text, 'Message'), 'utf8').digest('hex'); }
  finally { bytes.fill(0); }
};
const __arya_securityRecord = (value, fields) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw __arya_securityError('ARYA_SECURITY_INPUT', 'Security options must be plain records.');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || fields && !fields.includes(key) || !descriptor || !('value' in descriptor)) throw __arya_securityError('ARYA_SECURITY_INPUT', 'Security options contain an unknown field or accessor.');
  }
  return value;
};
const __arya_securityProfile = (options = {}) => {
  __arya_securityRecord(options, ['profile']);
  const profile = Object.hasOwn(options, 'profile') ? options.profile : 'standard';
  if (profile === 'standard') return 131072;
  if (profile === 'strong') return 262144;
  throw __arya_securityError('ARYA_SECURITY_INPUT', 'Password profile must be standard or strong.');
};
const __arya_securityPasswordPrefix = cost => 'arya$scrypt$v1$' + cost + '$8$1$';
const __arya_securityPasswordParts = encoded => {
  if (typeof encoded !== 'string') throw __arya_securityError('ARYA_SECURITY_INPUT', 'Password hash must be text.');
  if (encoded.length > 100) return null;
  const match = /^arya\$scrypt\$v1\$(16384|32768|65536|131072|262144)\$8\$1\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/.exec(encoded);
  if (!match) return null;
  const salt = __arya_securityDecode(match[2], 16), expected = __arya_securityDecode(match[3], 32);
  return salt && expected ? {cost: Number(match[1]), salt, expected} : null;
};
const __arya_securityDerive = (password, salt, cost) => new Promise((resolve, reject) => {
  __arya_securityCrypto.scrypt(password, salt, 32, { N: cost, r: 8, p: 1, maxmem: 128 * cost * 8 + 16 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
});
const __arya_securityHashPassword = async (password, options) => {
  __arya_securityText(password, 'Password', 1024, 1);
  const cost = __arya_securityProfile(options);
  const salt = __arya_securityCrypto.randomBytes(16);
  const key = await __arya_securityDerive(password, salt, cost);
  try { return __arya_securityPasswordPrefix(cost) + salt.toString('base64url') + '$' + key.toString('base64url'); }
  finally { key.fill(0); }
};
const __arya_securityVerifyPassword = async (password, encoded) => {
  __arya_securityText(password, 'Password', 1024, 1);
  const parts = __arya_securityPasswordParts(encoded);
  if (!parts) return false;
  const actual = await __arya_securityDerive(password, parts.salt, parts.cost);
  try { return __arya_securityCrypto.timingSafeEqual(actual, parts.expected); }
  finally { actual.fill(0); parts.expected.fill(0); }
};
const __arya_securityPasswordNeedsUpgrade = (encoded, options) => {
  const cost = __arya_securityProfile(options), parts = __arya_securityPasswordParts(encoded);
  return !parts || parts.cost < cost;
};
const __arya_securityVerifyPasswordAndUpgrade = async (password, encoded, options) => {
  const cost = __arya_securityProfile(options);
  if (!await __arya_securityVerifyPassword(password, encoded)) return Object.freeze({ok: false, upgraded: false, hash: null});
  const upgraded = __arya_securityPasswordParts(encoded).cost < cost;
  const hash = upgraded ? await __arya_securityHashPassword(password, {profile: cost === 262144 ? 'strong' : 'standard'}) : encoded;
  return Object.freeze({ok: true, upgraded, hash});
};
const __arya_securityEncrypt = (key, text) => {
  const bytes = __arya_securityKey(key);
  try {
    __arya_securityText(text, 'Plaintext');
    const iv = __arya_securityCrypto.randomBytes(12);
    const cipher = __arya_securityCrypto.createCipheriv('aes-256-gcm', bytes, iv, { authTagLength: 16 });
    const encrypted = __arya_securityBuffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return 'arya$aes256gcm$v1$' + iv.toString('base64url') + '$' + cipher.getAuthTag().toString('base64url') + '$' + encrypted.toString('base64url');
  } finally { bytes.fill(0); }
};
const __arya_securityDecrypt = (key, encoded) => {
  const bytes = __arya_securityKey(key);
  const fail = () => __arya_securityError('ARYA_SECURITY_DECRYPT', 'Unable to authenticate encrypted data.');
  let pending, plaintext;
  try {
    if (typeof encoded !== 'string' || encoded.length > 1398200) throw fail();
    const parts = encoded.split('$');
    if (parts.length !== 6 || parts[0] !== 'arya' || parts[1] !== 'aes256gcm' || parts[2] !== 'v1') throw fail();
    const iv = __arya_securityDecode(parts[3], 12), tag = __arya_securityDecode(parts[4], 16), encrypted = __arya_securityDecode(parts[5]);
    if (!iv || !tag || !encrypted || encrypted.length > 1048576) throw fail();
    const decipher = __arya_securityCrypto.createDecipheriv('aes-256-gcm', bytes, iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    pending = decipher.update(encrypted);
    plaintext = __arya_securityBuffer.concat([pending, decipher.final()]);
    return plaintext.toString('utf8');
  } catch { throw fail(); }
  finally { bytes.fill(0); pending?.fill(0); plaintext?.fill(0); }
};
const __arya_securityKeyId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
const __arya_securityContext = context => {
  __arya_securityRecord(context, ['account', 'purpose']);
  if (!Object.hasOwn(context, 'account') || !Object.hasOwn(context, 'purpose')) throw __arya_securityError('ARYA_SECURITY_INPUT', 'Encryption requires account and purpose context.');
  const account = __arya_securityText(context.account, 'Account context', 256, 1);
  const purpose = __arya_securityText(context.purpose, 'Purpose context', 128, 1);
  if (!account.isWellFormed() || !purpose.isWellFormed()) throw __arya_securityError('ARYA_SECURITY_INPUT', 'Encryption context must contain well-formed Unicode.');
  return {account, purpose};
};
const __arya_securityAAD = (keyId, context) => {
  const fields = [__arya_securityBuffer.from('arya$aes256gcm$v2$', 'ascii')];
  for (const value of [keyId, context.account, context.purpose]) {
    const bytes = __arya_securityBuffer.from(value, 'utf8'), length = __arya_securityBuffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    fields.push(length, bytes);
  }
  return __arya_securityBuffer.concat(fields);
};
const __arya_securityEnvelope = encoded => {
  if (typeof encoded !== 'string' || encoded.length > 1398400) return null;
  const parts = encoded.split('$');
  if (parts.length !== 7 || parts[0] !== 'arya' || parts[1] !== 'aes256gcm' || parts[2] !== 'v2' || !__arya_securityKeyId(parts[3])) return null;
  const iv = __arya_securityDecode(parts[4], 12), tag = __arya_securityDecode(parts[5], 16), encrypted = __arya_securityDecode(parts[6]);
  return iv && tag && encrypted && encrypted.length <= 1048576 ? {keyId: parts[3], iv, tag, encrypted} : null;
};
const __arya_securityKeyring = options => {
  __arya_securityRecord(options, ['active', 'keys']);
  if (!Object.hasOwn(options, 'active') || !Object.hasOwn(options, 'keys') || !__arya_securityKeyId(options.active)) throw __arya_securityError('ARYA_SECURITY_KEY', 'A keyring requires a valid active key ID and keys record.');
  const active = options.active, entries = Object.entries(__arya_securityRecord(options.keys));
  if (entries.length < 1 || entries.length > 32) throw __arya_securityError('ARYA_SECURITY_KEY', 'A keyring must contain 1 to 32 keys.');
  const keys = new Map();
  for (const [id, value] of entries) {
    if (!__arya_securityKeyId(id)) throw __arya_securityError('ARYA_SECURITY_KEY', 'Key IDs must use 1 to 64 ASCII letters, digits, hyphens, or underscores, starting with a letter or digit.');
    const bytes = __arya_securityKey(value); bytes.fill(0);
    keys.set(id, value);
  }
  if (!keys.has(active)) throw __arya_securityError('ARYA_SECURITY_KEY', 'The active key ID must exist in the keyring.');
  const encrypt = (text, suppliedContext) => {
    __arya_securityText(text, 'Plaintext');
    const context = __arya_securityContext(suppliedContext), bytes = __arya_securityKey(keys.get(active));
    try {
      const iv = __arya_securityCrypto.randomBytes(12);
      const cipher = __arya_securityCrypto.createCipheriv('aes-256-gcm', bytes, iv, {authTagLength: 16});
      cipher.setAAD(__arya_securityAAD(active, context));
      const encrypted = __arya_securityBuffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return 'arya$aes256gcm$v2$' + active + '$' + iv.toString('base64url') + '$' + cipher.getAuthTag().toString('base64url') + '$' + encrypted.toString('base64url');
    } finally { bytes.fill(0); }
  };
  const open = (encoded, suppliedContext) => {
    const context = __arya_securityContext(suppliedContext), fail = () => __arya_securityError('ARYA_SECURITY_DECRYPT', 'Unable to authenticate encrypted data.');
    let bytes, pending, plaintext;
    try {
      const envelope = __arya_securityEnvelope(encoded);
      if (!envelope || !keys.has(envelope.keyId)) throw fail();
      bytes = __arya_securityKey(keys.get(envelope.keyId));
      const decipher = __arya_securityCrypto.createDecipheriv('aes-256-gcm', bytes, envelope.iv, {authTagLength: 16});
      decipher.setAAD(__arya_securityAAD(envelope.keyId, context));
      decipher.setAuthTag(envelope.tag);
      pending = decipher.update(envelope.encrypted);
      plaintext = __arya_securityBuffer.concat([pending, decipher.final()]);
      return {keyId: envelope.keyId, text: plaintext.toString('utf8')};
    } catch { throw fail(); }
    finally { bytes?.fill(0); pending?.fill(0); plaintext?.fill(0); }
  };
  return Object.freeze({
    encrypt,
    decrypt: (encoded, context) => open(encoded, context).text,
    rotate: (encoded, context) => {
      const opened = open(encoded, context), rotated = opened.keyId !== active;
      return Object.freeze({encrypted: rotated ? encrypt(opened.text, context) : encoded, rotated});
    },
  });
};
const __arya_security = Object.freeze({
  randomToken: (bytes = 32) => {
    if (!Number.isSafeInteger(bytes) || bytes < 16 || bytes > 1024) throw __arya_securityError('ARYA_SECURITY_INPUT', 'Token size must be an integer from 16 to 1024 bytes.');
    return __arya_securityCrypto.randomBytes(bytes).toString('base64url');
  },
  uuid: () => __arya_securityCrypto.randomUUID(),
  generateKey: () => __arya_securityCrypto.randomBytes(32).toString('base64url'),
  hash: text => __arya_securityCrypto.createHash('sha256').update(__arya_securityText(text, 'Message'), 'utf8').digest('hex'),
  hmac: __arya_securityHmac,
  verifyHmac: (key, text, signature) => {
    const expected = __arya_securityHmac(key, text);
    if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return false;
    return __arya_securityEqual(expected, signature);
  },
  timingSafeEqual: __arya_securityEqual,
  hashPassword: __arya_securityHashPassword,
  verifyPassword: __arya_securityVerifyPassword,
  passwordNeedsUpgrade: __arya_securityPasswordNeedsUpgrade,
  verifyPasswordAndUpgrade: __arya_securityVerifyPasswordAndUpgrade,
  keyring: __arya_securityKeyring,
  encrypt: __arya_securityEncrypt,
  decrypt: __arya_securityDecrypt,
});`;
