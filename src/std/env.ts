/** Explicit environment reads: no implicit dotenv loading or writes during checking. */
export const envRuntime = String.raw`
const __arya_envError = (code, message) => Object.assign(new Error(message), { code });
const __arya_envName = name => {
  if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw __arya_envError('ARYA_ENV_NAME', 'Environment names must contain letters, digits, and underscores, starting with a letter or underscore.');
};
const __arya_envRead = name => Object.prototype.hasOwnProperty.call(process.env, name) ? process.env[name] : undefined;
const __arya_env = Object.freeze({
  get: (name, fallback = null) => { __arya_envName(name); return __arya_envRead(name) ?? fallback; },
  require: name => {
    __arya_envName(name);
    const value = __arya_envRead(name);
    if (value === undefined || value.trim() === '') throw __arya_envError('ARYA_ENV_REQUIRED', 'Set the required environment variable ' + name + ' before starting the application.');
    return value;
  },
  int: (name, fallback) => {
    __arya_envName(name);
    const value = __arya_envRead(name) ?? fallback;
    if (!((typeof value === 'string' && /^[+-]?\d+$/.test(value)) || typeof value === 'number') || !Number.isSafeInteger(Number(value))) throw __arya_envError('ARYA_ENV_VALUE', 'Environment variable ' + name + ' must be a safe integer.');
    return Number(value);
  },
  bool: (name, fallback) => {
    __arya_envName(name);
    const value = __arya_envRead(name) ?? fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (['true', '1'].includes(value.toLowerCase())) return true;
      if (['false', '0'].includes(value.toLowerCase())) return false;
    }
    throw __arya_envError('ARYA_ENV_VALUE', 'Environment variable ' + name + ' must be true, false, 1, or 0.');
  }
});`;
