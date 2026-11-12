// Deterministic PUBLIC test material. Never use these keys, salts, or nonces in applications.
import {createHash, createHmac, scryptSync, webcrypto} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';

const base64 = bytes => Buffer.from(bytes).toString('base64url');
const vectors = {name:'Arya Secure', revision:1, warning:'PUBLIC TEST MATERIAL ONLY: fixed keys, salts, and nonces must never be used in applications.', passwords:[], encryption:[], digests:[], macs:[]};
for (const [name, cost, password, fill] of [
  ['legacy',16384,'migration example',0],
  ['standard',131072,'Arya سلام 🔐\0passphrase',1],
  ['strong',262144,'strong profile example',2],
]) {
  const salt = Buffer.from(Array.from({length:16}, (_,i) => (i + fill * 16)));
  const derived = scryptSync(password, salt, 32, {N:cost,r:8,p:1,maxmem:128*cost*8+16*1024*1024});
  vectors.passwords.push({name,password,cost,salt:base64(salt),hash:`arya$scrypt$v1$${cost}$8$1$${base64(salt)}$${base64(derived)}`});
}
const aad = (keyId, context) => {
  const fields = [Buffer.from('arya$aes256gcm$v2$', 'ascii')];
  for (const text of [keyId,context.account,context.purpose]) {
    const bytes = Buffer.from(text,'utf8'), length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length); fields.push(length,bytes);
  }
  return Buffer.concat(fields);
};
for (const [name, version, plaintext, keyId, context] of [
  ['v1-empty','v1','',null,null],
  ['v1-unicode','v1','Arya سلام 🔐\0credential',null,null],
  ['v2-unicode','v2','private credential 🔐','key-2026',{account:'tenant:1/user:سلام',purpose:'oauth:github'}],
  ['v2-empty','v2','','key-2026',{account:'user:42',purpose:'api-token'}],
]) {
  const key = Buffer.from(Array.from({length:32}, (_,i) => i)), nonce = Buffer.from(Array.from({length:12}, (_,i) => i));
  const additionalData = version === 'v2' ? aad(keyId,context) : Buffer.alloc(0);
  const imported = await webcrypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt']);
  const result = Buffer.from(await webcrypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData,tagLength:128},imported,Buffer.from(plaintext,'utf8')));
  const cipher = result.subarray(0,-16), tag = result.subarray(-16);
  const header = ['arya','aes256gcm',version,...(version==='v2'?[keyId]:[])];
  vectors.encryption.push({name,version,key:base64(key),nonce:base64(nonce),keyId,context,plaintext,aadHex:additionalData.toString('hex'),encrypted:[...header,base64(nonce),base64(tag),base64(cipher)].join('$')});
}
for (const text of ['', 'abc', 'Arya سلام 🔐']) vectors.digests.push({text,sha256:createHash('sha256').update(text,'utf8').digest('hex')});
const key = Buffer.alloc(32,0x0b), text = 'Arya سلام';
vectors.macs.push({key:base64(key),text,hmacSha256:createHmac('sha256',key).update(text,'utf8').digest('hex')});
await mkdir('fixtures/security',{recursive:true});
await writeFile('fixtures/security/arya-secure-v1.json',JSON.stringify(vectors,null,2)+'\n');
console.log('Wrote fixtures/security/arya-secure-v1.json using Node scrypt and Web Crypto AES-GCM.');
