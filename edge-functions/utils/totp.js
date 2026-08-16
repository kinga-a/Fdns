// edge-functions/utils/totp.js
// RFC 6238 TOTP 实现

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32decode(secret) {
    secret = secret.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
    let bits = '';
    for (const char of secret) {
        bits += BASE32_CHARS.indexOf(char).toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }
    return new Uint8Array(bytes);
}

function hmacSha1(key, message) {
    return crypto.subtle.importKey(
        'raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
    ).then(cryptoKey => 
        crypto.subtle.sign('HMAC', cryptoKey, message)
    ).then(signature => new Uint8Array(signature));
}

export async function generateTOTP(secret, timeStep = 30, digits = 6, offset = 0) {
    const key = base32decode(secret);
    const counter = Math.floor(Date.now() / 1000 / timeStep) + offset;
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setBigUint64(0, BigInt(counter), false);

    const hmac = await hmacSha1(key, buf);
    const offsetByte = hmac[hmac.length - 1] & 0x0f;
    const code = ((hmac[offsetByte] & 0x7f) << 24 |
                  (hmac[offsetByte + 1] & 0xff) << 16 |
                  (hmac[offsetByte + 2] & 0xff) << 8 |
                  (hmac[offsetByte + 3] & 0xff)) >>> 0;

    return String(code % (10 ** digits)).padStart(digits, '0');
}

export async function verifyTOTP(secret, token, window = 1) {
    for (let i = -window; i <= window; i++) {
        if (await generateTOTP(secret, 30, 6, i) === token) {
            return true;
        }
    }
    return false;
}

export function generateSecret(length = 32) {
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => BASE32_CHARS[b % 32]).join('');
}

export function getOtpauthURI(username, secret, issuer = 'DNSManager') {
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
}

export function generateBackupCodes(count = 8) {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    return Array.from({ length: count }, () => 
        Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    );
}
