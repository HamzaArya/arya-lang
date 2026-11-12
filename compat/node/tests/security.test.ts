import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, createHmac, scrypt } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from '../src/compiler.js';
import { analyze, standardCompletions } from '../src/language-service.js';

async function library(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'arya-security-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  const output = join(root, 'main.mjs');
  await writeFile(output, compile('use std "security" as security\nexport const tools = security').code);
  return (await import(pathToFileURL(output).href)).tools;
}

async function vectors() {
  return JSON.parse(await readFile('fixtures/security/arya-secure-v1.json','utf8'));
}

test('security generates URL-safe entropy and agrees with SHA-256 and HMAC vectors', async t => {
  const security = await library(t);
  const tokens = new Set(Array.from({length:64}, () => security.randomToken()));
  assert.equal(tokens.size, 64);
  for (const token of tokens) { assert.match(token, /^[A-Za-z0-9_-]{43}$/); assert.equal(Buffer.from(token, 'base64url').length, 32); }
  for (const size of [16, 1024]) assert.equal(Buffer.from(security.randomToken(size), 'base64url').length, size);
  assert.match(security.uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(security.hash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(security.hash(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  const key = Buffer.alloc(32, 0x0b), encoded = key.toString('base64url');
  const expected = createHmac('sha256', key).update('Arya سلام').digest('hex');
  assert.equal(security.hmac(encoded, 'Arya سلام'), expected);
  assert.equal(security.verifyHmac(encoded, 'Arya سلام', expected), true);
  assert.equal(security.verifyHmac(encoded, 'changed', expected), false);
  for (const signature of [expected.toUpperCase(), expected + '0', null, '', 'z'.repeat(64)]) assert.equal(security.verifyHmac(encoded, 'Arya سلام', signature), false);
  assert.equal(security.timingSafeEqual('سلام', 'سلام'), true);
  for (const [a,b] of [['a','b'],['a','aa'],['é','e'],['','a']]) assert.equal(security.timingSafeEqual(a,b), false);
  assert.equal(security.timingSafeEqual('', ''), true);
  assert.ok(Object.isFrozen(security));
});

test('password hashes have independent salts, interoperate with scrypt, and never truncate Unicode passwords', async t => {
  const security = await library(t), password = '  سلام 🔐\0passphrase  ';
  const first = await security.hashPassword(password), second = await security.hashPassword(password);
  assert.notEqual(first, second);
  assert.match(first, /^arya\$scrypt\$v1\$131072\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
  assert.equal(await security.verifyPassword(password, first), true);
  assert.equal(await security.verifyPassword(password.trim(), first), false);
  assert.equal(await security.verifyPassword('wrong', first), false);
  const parts = first.split('$');
  const derived = await new Promise<Buffer>((resolve, reject) => scrypt(password, Buffer.from(parts[6], 'base64url'), 32, {N:131072,r:8,p:1,maxmem:256*1024*1024}, (error, result) => error ? reject(error) : resolve(result)));
  assert.equal(derived.toString('base64url'), parts[7]);
  for (const encoded of ['', first + 'x', first.replace('$v1$', '$v2$'), first.replace('$131072$', '$999999999$'), first.replace('$8$', '$1$'), first.replace(parts[6], '!'.repeat(22)), 'x'.repeat(10000)]) {
    assert.equal(await security.verifyPassword(password, encoded), false);
  }
  await assert.rejects(security.hashPassword(''), {code:'ARYA_SECURITY_INPUT'});
  await assert.rejects(security.hashPassword('🔐'.repeat(257)), {code:'ARYA_SECURITY_INPUT'});
  await assert.rejects(security.verifyPassword(password, null), {code:'ARYA_SECURITY_INPUT'});
});

test('AES-GCM authenticates every envelope field and interoperates with Node crypto', async t => {
  const security = await library(t), key = security.generateKey(), text = 'Private سلام 🔐\0data';
  const encoded = security.encrypt(key, text);
  assert.notEqual(encoded, security.encrypt(key, text));
  assert.equal(security.decrypt(key, encoded), text);
  assert.equal(security.decrypt(key, security.encrypt(key, '')), '');
  const parts = encoded.split('$'), bytes = Buffer.from(key, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', bytes, Buffer.from(parts[3], 'base64url'));
  decipher.setAuthTag(Buffer.from(parts[4], 'base64url'));
  assert.equal(Buffer.concat([decipher.update(Buffer.from(parts[5], 'base64url')), decipher.final()]).toString('utf8'), text);
  const iv = Buffer.alloc(12, 4), cipher = createCipheriv('aes-256-gcm', bytes, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  assert.equal(security.decrypt(key, ['arya','aes256gcm','v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('$')), text);
  for (let i = 0; i < parts.length; i++) {
    const changed = [...parts]; changed[i] = (changed[i][0] === 'A' ? 'B' : 'A') + changed[i].slice(1);
    assert.throws(() => security.decrypt(key, changed.join('$')), {code:'ARYA_SECURITY_DECRYPT',message:'Unable to authenticate encrypted data.'});
  }
  for (const input of ['', encoded + '$', encoded + '=', null, 'x'.repeat(1398201)]) assert.throws(() => security.decrypt(key, input), {code:'ARYA_SECURITY_DECRYPT'});
  assert.throws(() => security.decrypt(security.generateKey(), encoded), {code:'ARYA_SECURITY_DECRYPT'});
  const maximum = 'x'.repeat(1048576);
  assert.equal(security.decrypt(key, security.encrypt(key, maximum)), maximum);
});

test('security validates bounds and canonical keys without disclosing supplied secrets', async t => {
  const security = await library(t);
  for (const size of [-1,0,15,1025,1.5,NaN,Infinity,'32',null]) assert.throws(() => security.randomToken(size), {code:'ARYA_SECURITY_INPUT'});
  for (const key of ['', 'secret-do-not-echo', Buffer.alloc(31).toString('base64url'), Buffer.alloc(33).toString('base64url'), Buffer.alloc(32).toString('base64'), 'A'.repeat(42)+'B', null]) {
    for (const operation of [() => security.encrypt(key,'data'), () => security.decrypt(key,'data'), () => security.hmac(key,'data')]) {
      assert.throws(operation, (error: any) => error.code === 'ARYA_SECURITY_KEY' && !error.message.includes('secret-do-not-echo'));
    }
  }
  for (const input of [null, 42, {}, 'é'.repeat(524289)]) assert.throws(() => security.hash(input), {code:'ARYA_SECURITY_INPUT'});
  assert.throws(() => security.encrypt(security.generateKey(), 'x'.repeat(1048577)), {code:'ARYA_SECURITY_INPUT'});
  assert.throws(() => security.timingSafeEqual(null, 'x'), {code:'ARYA_SECURITY_INPUT'});
});

test('security checking is passive, typed, discoverable, and selectively emitted', () => {
  const source = 'use std "security" as safe\nconst key: string = safe.generateKey()\nconst encoded: string = await safe.hashPassword("example")\nconst valid: boolean = await safe.verifyPassword("example", encoded)\nconst body: string = safe.decrypt(key, safe.encrypt(key, "hello"))';
  assert.deepEqual(analyze(source, 'file:///security.arya').diagnostics, []);
  assert.throws(() => compile('use std "security" as safe\nconst wrong: string = safe.verifyPassword("a", "b")'), /Expected string/);
  assert.throws(() => compile('use std "security" as safe\nconst token: string = safe.randomToken("32")'), /Expected number/);
  const completionSource = 'use std "security" as safe\nsafe.';
  const labels = standardCompletions(completionSource, completionSource.length).map(item => item.label);
  for (const method of ['hashPassword','verifyPassword','randomToken','encrypt','decrypt','verifyHmac']) assert.ok(labels.includes(method));
  const code = compile(source).code;
  assert.match(code, /node:crypto/);
  assert.doesNotMatch(code, /node:test|__arya_testing|__arya_mysql/);
  assert.doesNotMatch(compile('print(1)').code, /node:crypto|node:test|__arya_security/);
});

test('Arya Secure public vectors verify across password profiles and encryption formats', async t => {
  const security = await library(t), data = await vectors();
  for (const vector of data.passwords) {
    assert.equal(await security.verifyPassword(vector.password, vector.hash),true,vector.name);
    assert.equal(security.passwordNeedsUpgrade(vector.hash),vector.cost < 131072);
    assert.equal(security.passwordNeedsUpgrade(vector.hash,{profile:'strong'}),vector.cost < 262144);
  }
  for (const vector of data.encryption) {
    const fields = vector.encrypted.split('$'), bytes = Buffer.from(vector.key,'base64url');
    const cipher = createCipheriv('aes-256-gcm',bytes,Buffer.from(vector.nonce,'base64url'));
    if (vector.version === 'v2') cipher.setAAD(Buffer.from(vector.aadHex,'hex'));
    const encrypted = Buffer.concat([cipher.update(vector.plaintext,'utf8'),cipher.final()]);
    assert.equal(encrypted.toString('base64url'),fields.at(-1));
    assert.equal(cipher.getAuthTag().toString('base64url'),fields.at(-2));
    const actual = vector.version === 'v1' ? security.decrypt(vector.key,vector.encrypted) : security.keyring({active:vector.keyId,keys:{[vector.keyId]:vector.key}}).decrypt(vector.encrypted,vector.context);
    assert.equal(actual,vector.plaintext,vector.name);
  }
  for (const vector of data.digests) assert.equal(security.hash(vector.text),vector.sha256);
  for (const vector of data.macs) assert.equal(security.hmac(vector.key,vector.text),vector.hmacSha256);
});

test('password upgrade helper authenticates before replacing hashes and never downgrades a stronger profile', async t => {
  const security = await library(t), data = await vectors();
  const legacy = data.passwords.find((v: any) => v.name === 'legacy');
  const standard = data.passwords.find((v: any) => v.name === 'standard');
  const strong = data.passwords.find((v: any) => v.name === 'strong');
  const upgraded = await security.verifyPasswordAndUpgrade(legacy.password,legacy.hash);
  assert.deepEqual({ok:upgraded.ok,upgraded:upgraded.upgraded},{ok:true,upgraded:true});
  assert.match(upgraded.hash,/^arya\$scrypt\$v1\$131072\$8\$1\$/);
  assert.equal(security.passwordNeedsUpgrade(upgraded.hash),false);
  assert.equal(await security.verifyPassword(legacy.password,upgraded.hash),true);
  assert.notEqual(upgraded.hash.split('$')[6],legacy.salt);
  assert.ok(Object.isFrozen(upgraded));
  assert.deepEqual(await security.verifyPasswordAndUpgrade('wrong',legacy.hash),{ok:false,upgraded:false,hash:null});
  assert.deepEqual(await security.verifyPasswordAndUpgrade(legacy.password,'invalid'),{ok:false,upgraded:false,hash:null});
  assert.equal(security.passwordNeedsUpgrade('invalid'),true);
  assert.deepEqual(await security.verifyPasswordAndUpgrade(standard.password,standard.hash),{ok:true,upgraded:false,hash:standard.hash});
  assert.deepEqual(await security.verifyPasswordAndUpgrade(strong.password,strong.hash),{ok:true,upgraded:false,hash:strong.hash});
  const policy = {profile:'strong'};
  const pending = security.verifyPasswordAndUpgrade(standard.password,standard.hash,policy);
  policy.profile = 'standard'; // An in-flight verification retains its original target policy.
  const stronger = await pending;
  assert.match(stronger.hash,/^arya\$scrypt\$v1\$262144\$8\$1\$/);
  assert.equal(stronger.upgraded,true);
  assert.equal(security.passwordNeedsUpgrade(stronger.hash,{profile:'strong'}),false);
  assert.equal(await security.verifyPassword(standard.password,stronger.hash),true);
  for (const options of [null,[],{profile:'weak'},{profile:'toString'},{profile:undefined},{cost:1},{profile:42}]) {
    await assert.rejects(security.hashPassword('password',options),{code:'ARYA_SECURITY_INPUT'});
    assert.throws(() => security.passwordNeedsUpgrade(standard.hash,options),{code:'ARYA_SECURITY_INPUT'});
    await assert.rejects(security.verifyPasswordAndUpgrade('password',standard.hash,options),{code:'ARYA_SECURITY_INPUT'});
  }
  for (const cost of ['1','8192','1048576','0131072','Infinity']) assert.equal(await security.verifyPassword(standard.password,standard.hash.replace('$131072$','$'+cost+'$')),false);
});

test('keyring rotation retains old readers, authenticates first, and survives configuration mutation', async t => {
  const security = await library(t), oldKey = security.generateKey(), newKey = security.generateKey();
  const context = {account:'tenant:1/user:42',purpose:'oauth:github'};
  const original = security.keyring({active:'old',keys:{old:oldKey}});
  const encoded = original.encrypt('credential',context);
  assert.match(encoded,/^arya\$aes256gcm\$v2\$old\$/);
  const options = {active:'new',keys:{old:oldKey,new:newKey}};
  const rotated = security.keyring(options);
  options.active = 'old'; options.keys.new = oldKey; options.keys.old = newKey;
  assert.equal(rotated.decrypt(encoded,context),'credential');
  const result = rotated.rotate(encoded,context);
  assert.equal(result.rotated,true); assert.ok(Object.isFrozen(result));
  assert.match(result.encrypted,/^arya\$aes256gcm\$v2\$new\$/);
  assert.equal(rotated.decrypt(result.encrypted,context),'credential');
  assert.deepEqual(rotated.rotate(result.encrypted,context),{encrypted:result.encrypted,rotated:false});
  const retired = security.keyring({active:'new',keys:{new:newKey}});
  assert.equal(retired.decrypt(result.encrypted,context),'credential');
  assert.throws(() => retired.decrypt(encoded,context),{code:'ARYA_SECURITY_DECRYPT'});
  assert.throws(() => original.decrypt(result.encrypted,context),{code:'ARYA_SECURITY_DECRYPT'});
  assert.ok(Object.isFrozen(rotated));
  const bytes = Buffer.from(newKey,'base64url'), parts = result.encrypted.split('$');
  const fields = [Buffer.from('arya$aes256gcm$v2$','ascii')];
  for (const text of ['new',context.account,context.purpose]) {
    const value = Buffer.from(text,'utf8'), length = Buffer.alloc(4); length.writeUInt32BE(value.length); fields.push(length,value);
  }
  const decipher = createDecipheriv('aes-256-gcm',bytes,Buffer.from(parts[4],'base64url'));
  decipher.setAAD(Buffer.concat(fields)); decipher.setAuthTag(Buffer.from(parts[5],'base64url'));
  assert.equal(Buffer.concat([decipher.update(Buffer.from(parts[6],'base64url')),decipher.final()]).toString('utf8'),'credential');
  const maximum = 'x'.repeat(1048576);
  assert.equal(retired.decrypt(retired.encrypt(maximum,context),context),maximum);
  assert.equal(retired.decrypt(retired.encrypt('',context),context),'');
});

test('keyrings reject account/purpose swaps, key ID substitution, tampering, and legacy downgrade attempts', async t => {
  const security = await library(t), key = security.generateKey();
  const vault = security.keyring({active:'one',keys:{one:key,two:key}}), context = {account:'ab',purpose:'c'};
  const encrypted = vault.encrypt('private',context);
  for (const altered of [{account:'a',purpose:'bc'},{account:'other',purpose:'c'},{account:'ab',purpose:'other'}]) {
    assert.throws(() => vault.decrypt(encrypted,altered),{code:'ARYA_SECURITY_DECRYPT'});
    assert.throws(() => vault.rotate(encrypted,altered),{code:'ARYA_SECURITY_DECRYPT'});
  }
  assert.throws(() => vault.decrypt(encrypted.replace('$one$','$two$'),context),{code:'ARYA_SECURITY_DECRYPT'});
  for (const value of [security.encrypt(key,'private'),encrypted.replace('$v2$','$v1$'),encrypted+'=',encrypted+'$',null,'x'.repeat(1398401)]) {
    assert.throws(() => vault.decrypt(value,context),{code:'ARYA_SECURITY_DECRYPT'});
    assert.throws(() => vault.rotate(value,context),{code:'ARYA_SECURITY_DECRYPT'});
  }
  const parts = encrypted.split('$');
  for (const index of [4,5,6]) {
    const changed = [...parts]; changed[index] = (changed[index][0] === 'A'?'B':'A')+changed[index].slice(1);
    assert.throws(() => vault.decrypt(changed.join('$'),context),{code:'ARYA_SECURITY_DECRYPT'});
    assert.throws(() => vault.rotate(changed.join('$'),context),{code:'ARYA_SECURITY_DECRYPT'});
  }
});

test('keyrings require bounded plain configuration/context and do not evaluate accessors or disclose keys', async t => {
  const security = await library(t), key = security.generateKey(), context = {account:'42',purpose:'api'};
  const options = [null,[],{}, {active:'one',keys:{}},{active:'one',keys:{two:key}},{active:'bad$id',keys:{one:key}}, {active:'one',keys:{one:key},extra:true}, {active:'one',keys:{one:'private-invalid-key'}}, {active:'one',keys:Object.fromEntries(Array.from({length:33},(_,i)=>['key'+i,key]))}];
  for (const value of options) assert.throws(() => security.keyring(value), (error: any) => /^ARYA_SECURITY_(INPUT|KEY)$/.test(error.code) && !error.message.includes(key) && !error.message.includes('private-invalid-key'));
  let reads = 0;
  assert.throws(() => security.keyring({active:'one',keys:{get one() {reads++; return key;}}}),{code:'ARYA_SECURITY_INPUT'});
  const vault = security.keyring({active:'one',keys:{one:key}}), encrypted = vault.encrypt('text',context);
  for (const value of [undefined,null,[],{}, {account:'42'},{purpose:'api'}, {account:'',purpose:'api'}, {account:'a'.repeat(257),purpose:'api'}, {account:'42',purpose:'🔐'.repeat(33)}, {account:'42',purpose:'api',extra:true},{account:'\ud800',purpose:'api'},{get account(){reads++; return '42';},purpose:'api'}]) {
    assert.throws(() => vault.encrypt('text',value),{code:'ARYA_SECURITY_INPUT'});
    assert.throws(() => vault.decrypt(encrypted,value),{code:'ARYA_SECURITY_INPUT'});
  }
  assert.equal(reads,0);
  assert.throws(() => vault.encrypt('x'.repeat(1048577),context),{code:'ARYA_SECURITY_INPUT'});
});

test('Arya Secure upgrades and keyring APIs have static contracts, aliases, and passive editor hints', () => {
  const prefix = 'use std "security" as arya\n';
  const source = prefix + 'const vault = arya.keyring({active: "current", keys: {current: arya.generateKey()}})\nconst context = {account: "42", purpose: "oauth"}\nconst encrypted: string = vault.encrypt("secret", context)\nconst rotated = vault.rotate(encrypted, context)\nconst value: string = vault.decrypt(rotated.encrypted, context)\nconst result = await arya.verifyPasswordAndUpgrade("password", "stored", {profile: "strong"})\nconst accepted: boolean = result.ok';
  assert.doesNotThrow(() => compile(source));
  assert.deepEqual(analyze(source,'file:///secure.arya').diagnostics,[]);
  const completion = prefix+'const vault = arya.keyring({active: "current", keys: {}})\nconst copy = vault\ncopy.';
  assert.deepEqual(standardCompletions(completion,completion.length).map(item=>item.label),['encrypt','decrypt','rotate']);
  for (const body of ['const vault = arya.keyring({active: "one",keys: {}})\nconst result: string = vault.encrypt("text", {account: "42"})','const value: boolean = arya.passwordNeedsUpgrade(42)','const hash: string = await arya.hashPassword("password", {profile: false})']) assert.throws(() => compile(prefix+body),/Expected/);
});

test('Arya Secure example checks and executes rotation and hash-upgrade flows', () => {
  const cli = resolve('dist/cli.cjs'), file = resolve('fixtures/examples/security/main.arya');
  for (const command of ['check','run']) {
    const result = spawnSync(process.execPath,[cli,command,file],{encoding:'utf8',timeout:20000});
    assert.ifError(result.error); assert.equal(result.status,0,result.stdout+result.stderr);
    if (command === 'run') { assert.match(result.stdout,/Rotated credential: true/); assert.match(result.stdout,/Password accepted: true/); }
  }
});
