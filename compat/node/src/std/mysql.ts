/** Emitted into JavaScript programs; mysql2 is resolved from the user's application. */
export const mysqlRuntime = String.raw`
const __arya_mysqlError = (code, message, cause) => {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.code = code;
  if (typeof cause?.code === 'string') error.driverCode = cause.code;
  if (typeof cause?.sqlState === 'string') error.sqlState = cause.sqlState;
  return error;
};
const __arya_mysql = Object.freeze({
  connect: async (options = {}) => {
    const fail = message => { throw __arya_mysqlError('ARYA_MYSQL_CONFIG', message); };
    if (!options || typeof options !== 'object' || Array.isArray(options)) fail('mysql.connect expects a connection options object.');
    for (const key of ['host', 'user', 'database', 'socketPath']) {
      if (options[key] !== undefined && (typeof options[key] !== 'string' || !options[key].trim())) fail('MySQL ' + key + ' must be a nonempty string.');
    }
    if (options.password !== undefined && typeof options.password !== 'string') fail('MySQL password must be a string.');
    for (const [key, minimum, maximum] of [['port', 1, 65535], ['connectionLimit', 1, Number.MAX_SAFE_INTEGER], ['queueLimit', 0, Number.MAX_SAFE_INTEGER], ['connectTimeout', 1, 2147483647]]) {
      if (options[key] !== undefined && (!Number.isSafeInteger(options[key]) || options[key] < minimum || options[key] > maximum)) fail('MySQL ' + key + ' must be an integer from ' + minimum + ' to ' + maximum + '.');
    }
    if (options.multipleStatements === true) fail('Multiple SQL statements are disabled. Use separate prepared calls inside db.transaction.');
    if (options.namedPlaceholders === true) fail('Use positional ? placeholders and a parameter list.');
    let driver;
    try { const module = await import('mysql2/promise'); driver = module.default ?? module; }
    catch (error) { throw __arya_mysqlError('ARYA_MYSQL_DRIVER', 'Cannot load the MySQL driver. Run npm install mysql2 in your application project.', error); }
    let pool;
    try {
      pool = driver.createPool({
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 100,
        connectTimeout: 10000,
        supportBigNumbers: true,
        bigNumberStrings: true,
        ...options,
        multipleStatements: false,
        namedPlaceholders: false
      });
      const connection = await pool.getConnection();
      connection.release();
    } catch (error) {
      try { await pool?.end(); } catch { /* Preserve the connection failure. */ }
      throw __arya_mysqlError('ARYA_MYSQL_CONNECT', 'Cannot connect to MySQL. Check the server, credentials, database, and TLS options.', error);
    }

    const context = new __arya_AsyncLocalStorage();
    const pending = new Set();
    let closing = false, closePromise;
    const track = (set, action, rejected = () => {}) => {
      const operation = Promise.resolve().then(action);
      set.add(operation);
      operation.then(() => set.delete(operation), error => { set.delete(operation); rejected(error); });
      return operation;
    };
    const open = () => {
      if (context.getStore()) throw __arya_mysqlError('ARYA_MYSQL_TRANSACTION', 'Use the transaction handle inside db.transaction; the pool cannot be used or closed there.');
      if (closing) throw __arya_mysqlError('ARYA_MYSQL_CLOSED', 'This MySQL pool is closing or closed. Create a new connection with mysql.connect.');
    };
    const validate = (sql, parameters) => {
      if (typeof sql !== 'string' || !sql.trim() || !Array.isArray(parameters)) throw __arya_mysqlError('ARYA_MYSQL_ARGUMENTS', 'Database queries expect nonempty SQL text and a parameter list. Use ? placeholders for values.');
      for (const value of parameters) {
        if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'bigint' || (typeof value === 'number' && Number.isFinite(value)) || __arya_mysqlBuffer.isBuffer(value) || (value instanceof Date && Number.isFinite(value.getTime()))) continue;
        throw __arya_mysqlError('ARYA_MYSQL_ARGUMENTS', 'SQL parameters must be null, text, booleans, finite numbers, bigint, valid dates, or buffers. Serialize JSON explicitly.');
      }
    };
    const session = (target, run) => {
      const execute = async (sql, parameters = []) => {
        validate(sql, parameters);
        try { return (await target.execute(sql, parameters))[0]; }
        catch (error) { throw __arya_mysqlError('ARYA_MYSQL_QUERY', 'MySQL query failed. Inspect error.driverCode and error.sqlState for details.', error); }
      };
      const rows = async (sql, parameters = []) => {
        const result = await execute(sql, parameters);
        if (!Array.isArray(result)) throw __arya_mysqlError('ARYA_MYSQL_RESULT', 'This query returned a statement result. Use execute for INSERT, UPDATE, or DELETE.');
        return result;
      };
      const one = async (sql, parameters = []) => (await rows(sql, parameters))[0] ?? null;
      const scalar = async (sql, parameters = []) => {
        const row = await one(sql, parameters);
        return row === null ? null : Object.values(row)[0] ?? null;
      };
      return {
        execute: (sql, parameters) => run(() => execute(sql, parameters)),
        rows: (sql, parameters) => run(() => rows(sql, parameters)),
        one: (sql, parameters) => run(() => one(sql, parameters)),
        scalar: (sql, parameters) => run(() => scalar(sql, parameters))
      };
    };
    const run = action => {
      try { open(); } catch (error) { return Promise.reject(error); }
      return track(pending, action);
    };
    const transaction = callback => run(async () => {
      if (typeof callback !== 'function') throw __arya_mysqlError('ARYA_MYSQL_ARGUMENTS', 'db.transaction expects a function receiving a transaction handle.');
      let connection;
      try { connection = await pool.getConnection(); }
      catch (error) { throw __arya_mysqlError('ARYA_MYSQL_TRANSACTION', 'Cannot acquire a MySQL transaction connection.', error); }
      const queries = new Set();
      const scope = {};
      let accepting = true, failed = false, queryFailure, reusable = true;
      const scoped = Object.freeze(session(connection, action => {
        if (!accepting) return Promise.reject(__arya_mysqlError('ARYA_MYSQL_TRANSACTION_CLOSED', 'This transaction has finished. Use its handle only inside the transaction callback.'));
        if (context.getStore() !== scope) return Promise.reject(__arya_mysqlError('ARYA_MYSQL_TRANSACTION', 'Use this transaction handle only from its own callback.'));
        return track(queries, action, error => { if (!failed) { failed = true; queryFailure = error; } });
      }));
      try {
        try { await connection.beginTransaction(); }
        catch (error) { throw __arya_mysqlError('ARYA_MYSQL_TRANSACTION', 'Cannot begin the MySQL transaction.', error); }
        const result = await context.run(scope, () => callback(scoped));
        accepting = false;
        await Promise.allSettled([...queries]);
        if (failed) throw queryFailure;
        try { await connection.commit(); }
        catch (error) { throw __arya_mysqlError('ARYA_MYSQL_TRANSACTION', 'MySQL commit failed; the commit outcome may be unknown. Do not retry automatically.', error); }
        return result;
      } catch (error) {
        accepting = false;
        await Promise.allSettled([...queries]);
        try { await connection.rollback(); }
        catch { reusable = false; connection.destroy(); }
        throw error;
      } finally {
        accepting = false;
        if (reusable) connection.release();
      }
    });
    const ping = () => run(async () => {
      let connection;
      try { connection = await pool.getConnection(); await connection.ping(); return true; }
      catch (error) { throw __arya_mysqlError('ARYA_MYSQL_CONNECT', 'MySQL health check failed.', error); }
      finally { connection?.release(); }
    });
    const close = () => {
      if (context.getStore()) return Promise.reject(__arya_mysqlError('ARYA_MYSQL_TRANSACTION', 'Close the pool after the transaction callback has finished.'));
      if (!closePromise) {
        closing = true;
        closePromise = (async () => {
          await Promise.allSettled([...pending]);
          try { return await pool.end(); }
          catch (error) { throw __arya_mysqlError('ARYA_MYSQL_CLOSE', 'Cannot close the MySQL pool cleanly.', error); }
        })();
      }
      return closePromise;
    };
    return Object.freeze({ ...session(pool, run), transaction, ping, close });
  }
});`;
