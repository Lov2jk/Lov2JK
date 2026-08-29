const encoder = new TextEncoder();

export const now = () => new Date().toISOString();
export const cleanText = (value, max = 500) => String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);
export const randomToken = (bytes = 32) => {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};
export const sha256 = async value => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};
export async function secureEqual(left, right) {
  const [a, b] = await Promise.all([sha256(left), sha256(right)]);
  const av = encoder.encode(a);
  const bv = encoder.encode(b);
  if (typeof crypto.subtle.timingSafeEqual === 'function') return crypto.subtle.timingSafeEqual(av, bv);
  let difference = 0;
  for (let index = 0; index < av.length; index += 1) difference |= av[index] ^ bv[index];
  return difference === 0;
}
export function normalizeEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('A valid email address is required.');
  return email;
}
export function normalizeIndianMobile(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (!/^[6-9]\d{9}$/.test(digits)) throw new Error('Enter a valid 10-digit Indian mobile number.');
  return digits;
}
export function normalizePincode(value) {
  const pincode = String(value ?? '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(pincode)) throw new Error('Enter a valid 6-digit PIN code.');
  return pincode;
}
export function safeUrl(value, { allowEmpty = true, hosts = [] } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw && allowEmpty) return '';
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('Only secure HTTPS links are allowed.');
  if (hosts.length && !hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw new Error('This link uses an unsupported website.');
  return url.href.slice(0, 1000);
}
export function parseCookie(request, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return request.headers.get('cookie')?.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))?.[1] || '';
}

export async function passwordVerify(password, user) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(user.password_salt), iterations: Number(user.password_iterations) }, key, 256);
  const actual = [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return secureEqual(actual, user.password_hash);
}

export async function passwordHash(password, salt = randomToken(18), iterations = 100000) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, key, 256);
  const hash = [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return { hash, salt, iterations };
}
