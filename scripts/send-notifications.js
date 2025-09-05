const admin = require('firebase-admin');

// --- 環境変数からサービスアカウントキーを読み込む ---
const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!serviceAccountKey) {
    console.error('FATAL ERROR: FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set.');
    process.exit(1);
}

let serviceAccount;
try {
    serviceAccount = JSON.parse(serviceAccountKey);
} catch (e) {
    console.error('FATAL ERROR: Could not parse FIREBASE_SERVICE_ACCOUNT_KEY. Make sure it is a valid JSON string.');
    process.exit(1);
}

// --- Firebase Admin SDKの初期化 ---
try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://live-stream-summarizer-2971a-default-rtdb.firebaseio.com`
    });
} catch (e) {
    console.error('FATAL ERROR: Failed to initialize Firebase Admin SDK.', e);
    process.exit(1);
}

const db = admin.database();
const ref = db.ref('fcmTokens');

// --- メイン処理 ---
async function sendNotifications() {
    console.log('Starting notification sending process...');

    // 1. Realtime Databaseから全トークンを取得
    let allTokens = [];
    try {
        const snapshot = await ref.once('value');
        if (snapshot.exists()) {
            const tokensObject = snapshot.val();
            allTokens = Object.keys(tokensObject);
        } else {
            console.log('No tokens found in the database. Exiting.');
            return;
        }
    } catch (error) {
        console.error('Error fetching tokens from Realtime Database:', error);
        process.exit(1);
    }

    if (allTokens.length === 0) {
        console.log('Token list is empty. Exiting.');
        return;
    }

    console.log(`Found ${allTokens.length} tokens. Preparing to send notifications.`);

    // 2. 通知ペイロードの作成
    const message = {
        notification: {
            title: 'サイトが更新されました',
            body: '新しいライブ配信の要約が追加されました。タップして確認します。'
        },
        webpush: {
            notification: {
                icon: 'https://aegisfleet.github.io/live-stream-summarizer/images/favicon.png'
            },
            fcm_options: {
                link: 'https://aegisfleet.github.io/live-stream-summarizer/'
            }
        }
    };

    // 3. 全トークンに通知を送信
    try {
        const response = await admin.messaging().sendToDevice(allTokens, message);
        console.log(`Successfully sent message to ${response.successCount} devices.`);

        // 4. 無効なトークンをクリーンアップ
        if (response.failureCount > 0) {
            console.log(`Found ${response.failureCount} invalid tokens that need cleanup.`);
            const tokensToRemove = {};
            response.results.forEach((result, index) => {
                const error = result.error;
                if (error) {
                    const token = allTokens[index];
                    console.error(`Failure sending notification to token: ${token}`, error);
                    // Canonical registration token logic is not handled here, but for production apps it should be.
                    if (error.code === 'messaging/registration-token-not-registered') {
                        tokensToRemove[token] = null; // For multi-path update
                    }
                }
            });

            if (Object.keys(tokensToRemove).length > 0) {
                console.log(`Removing ${Object.keys(tokensToRemove).length} invalid tokens from the database.`);
                await ref.update(tokensToRemove);
            }
        }
    } catch (error) {
        console.error('Error sending messages:', error);
    }

    console.log('Notification process finished.');
}

// スクリプトを実行
sendNotifications();