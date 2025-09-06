// Cloudflare Worker Script (Fixed Crypto-Key header)

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return handleOptions(request);
        }

        const url = new URL(request.url);
        let response;

        try {
            if (url.pathname === '/subscribe' && request.method === 'POST') {
                response = await handleSubscribe(request, env);
            } else if (url.pathname === '/send-notification' && request.method === 'POST') {
                response = await handleSendNotification(request, env);
            } else {
                response = new Response('Not Found', { status: 404 });
            }
        } catch (e) {
            console.error(`Internal Server Error: ${e.stack}`);
            response = new Response(`Internal Server Error: ${e.message}`, { status: 500 });
        }
        
        const newHeaders = new Headers(response.headers);
        const cors = corsHeaders();
        for (const key in cors) {
            newHeaders.set(key, cors[key]);
        }

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
        });
    },
};

/**
 * 購読情報をKVに保存
 */
async function handleSubscribe(request, env) {
    const subscription = await request.json();
    if (!subscription || !subscription.endpoint) {
        return new Response('Invalid subscription', { status: 400 });
    }
    const key = btoa(subscription.endpoint).replace(/=/g, '');
    await env.PUSH_SUBSCRIPTIONS.put(key, JSON.stringify(subscription));
    return new Response(JSON.stringify({ success: true }), { status: 201 });
}

/**
 * 全ての購読者へ通知を送信
 */
async function handleSendNotification(request, env) {
    const authKey = request.headers.get('Authorization');
    if (authKey !== `Bearer ${env.AUTH_KEY}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    const notificationPayload = await request.json();
    const vapidDetails = {
        subject: `https://aegisfleet.github.io`,
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
    };
    
    const list = await env.PUSH_SUBSCRIPTIONS.list();
    const promises = [];

    for (const key of list.keys) {
        const subscriptionString = await env.PUSH_SUBSCRIPTIONS.get(key.name);
        if (subscriptionString) {
            const subscription = JSON.parse(subscriptionString);
            promises.push(
                triggerPushMsg(subscription, JSON.stringify(notificationPayload), vapidDetails)
                .catch(err => {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        console.log(`Subscription ${key.name} is gone. Deleting.`);
                        return env.PUSH_SUBSCRIPTIONS.delete(key.name);
                    }
                    console.error(`Failed to send to ${key.name}:`, JSON.stringify(err, Object.getOwnPropertyNames(err)));
                })
            );
        }
    }

    await Promise.all(promises);
    return new Response(JSON.stringify({ success: true, sent: promises.length }));
}

function handleOptions(request) {
    if (
        request.headers.get('Origin') !== null &&
        request.headers.get('Access-Control-Request-Method') !== null &&
        request.headers.get('Access-Control-Request-Headers') !== null
    ) {
        return new Response(null, { headers: corsHeaders() });
    } else {
        return new Response(null, { headers: { Allow: 'POST, OPTIONS' } });
    }
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': 'https://aegisfleet.github.io',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

// VAPID & Web Push Protocol Logic
async function triggerPushMsg(subscription, payload, vapidDetails) {
    const { endpoint } = subscription;
    const origin = new URL(endpoint).origin;

    const token = await getVapidToken(origin, vapidDetails);

    const headers = {
        'TTL': 60,
        'Authorization': `WebPush ${token}`,
        'Content-Encoding': 'aesgcm',
        'Crypto-Key': `p256ecdsa=${vapidDetails.publicKey}`
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: payload,
    });

    if (!response.ok) {
        const responseBody = await response.text();
        console.error(`Push subscription failed for endpoint: ${endpoint}`);
        console.error(`Status: ${response.status}, Body: ${responseBody}`);
        const error = new Error(`Push subscription failed with status code: ${response.status}. Body: ${responseBody}`);
        error.statusCode = response.status;
        throw error;
    }
}

async function getVapidToken(audience, vapidDetails) {
    const header = { "alg": "ES256", "typ": "JWT" };
    const payload = {
        "aud": audience,
        "exp": Math.floor(Date.now() / 1000) + (12 * 60 * 60),
        "sub": "mailto:example@example.com",
    };

    const b64Header = urlsafeBase64Encode(JSON.stringify(header));
    const b64Payload = urlsafeBase64Encode(JSON.stringify(payload));
    const signingInput = `${b64Header}.${b64Payload}`;
    
    const { x, y } = getPublicKeyXY(vapidDetails.publicKey);

    const privateKeyJwk = {
        kty: 'EC',
        crv: 'P-256',
        d: vapidDetails.privateKey,
        x: x,
        y: y,
    };

    const privateKey = await crypto.subtle.importKey(
        'jwk',
        privateKeyJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        new TextEncoder().encode(signingInput)
    );
    
    const b64Signature = urlsafeBase64Encode(signature);
    return `${signingInput}.${b64Signature}`;
}

function urlsafeBase64Encode(data) {
    const base64 = typeof data === 'string'
        ? btoa(unescape(encodeURIComponent(data)))
        : btoa(String.fromCharCode.apply(null, new Uint8Array(data)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function urlsafeBase64Decode(base64) {
    const processed = base64.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(processed);
    const buffer = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
        buffer[i] = decoded.charCodeAt(i);
    }
    return buffer;
}

function getPublicKeyXY(publicKey_b64) {
    const decoded = urlsafeBase64Decode(publicKey_b64);
    // The first byte (0x04) indicates uncompressed key.
    // The next 32 bytes are the x-coordinate, and the following 32 are the y-coordinate.
    const x = decoded.slice(1, 33);
    const y = decoded.slice(33, 65);
    return {
        x: urlsafeBase64Encode(x),
        y: urlsafeBase64Encode(y)
    };
}
