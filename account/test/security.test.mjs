import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, normalizeEmail, normalizeIndianMobile, normalizePincode, passwordHash, passwordVerify, randomToken, secureEqual } from '../src/security.js';

test('normalizes Indian contact details', () => {
  assert.equal(normalizeEmail(' Buyer@Example.COM '), 'buyer@example.com');
  assert.equal(normalizeIndianMobile('+91 93635 29266'), '9363529266');
  assert.equal(normalizePincode('600 122'), '600122');
});

test('rejects invalid contact details', () => {
  assert.throws(() => normalizeEmail('not-email'));
  assert.throws(() => normalizeIndianMobile('12345'));
  assert.throws(() => normalizePincode('60012'));
});

test('security tokens are random and comparisons are correct', async () => {
  const a = randomToken();
  const b = randomToken();
  assert.notEqual(a, b);
  assert.equal(await secureEqual(a, a), true);
  assert.equal(await secureEqual(a, b), false);
});

test('cleans user-facing text', () => assert.equal(cleanText(' <b>Hello</b> ', 20), 'bHello/b'));

test('verifies an existing CRM-compatible PBKDF2 password', async () => {
  const encoder = new TextEncoder();
  const salt = 'test-salt';
  const iterations = 1000;
  const key = await crypto.subtle.importKey('raw', encoder.encode('correct-password'), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, key, 256);
  const password_hash = [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const user = { password_hash, password_salt: salt, password_iterations: iterations };
  assert.equal(await passwordVerify('correct-password', user), true);
  assert.equal(await passwordVerify('wrong-password', user), false);
});

test('creates a CRM-compatible owner password hash', async () => {
  const hashed = await passwordHash('A-new-secure-password-123');
  assert.equal(await passwordVerify('A-new-secure-password-123', { password_hash: hashed.hash, password_salt: hashed.salt, password_iterations: hashed.iterations }), true);
  assert.equal(await passwordVerify('wrong-password', { password_hash: hashed.hash, password_salt: hashed.salt, password_iterations: hashed.iterations }), false);
});
