// Firebase configuration (YOUR CONFIG HERE)
const firebaseConfig = {
    apiKey: "AIzaSyC39GR4yzRJnIFSveVpyg6QnxmSj2lDJ3A",
    authDomain: "webrtc-connection-a16c9.firebaseapp.com",
    projectId: "webrtc-connection-a16c9",
    storageBucket: "webrtc-connection-a16c9.firebasestorage.app",
    messagingSenderId: "962691839124",
    appId: "1:962691839124:web:8eb5e41c693a99398ff081",
    measurementId: "G-BQ6S9V5F2G"
};

// Firebase SDKs のインポート (HTMLの<script type="module">でインポートしてください)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase と Firestore の初期化
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Firestore Collection and Document names
const collectionName = 'webrtc_sdp_collection';

// ログ出力関数
function log(message) {
    console.log(message);
}

/**
 * document のすべてのフィールドを上書き
 */
export async function save(docname, data) {
    try {
        await setDoc(doc(db, collectionName, docname), {
            ...data,
            created_date: Date.now()
        });
        log(`saved to Firestore ${JSON.stringify(data)}`);
    } catch (e) {
        log('Error saving Offer to Firestore: ' + e.message);
        console.error('Error saving Offer to Firestore:', e);
    }
}

/**
 * documentの特定のフィールドを更新
 */
export async function update(docname, data) {
    try {
        await updateDoc(doc(db, collectionName, docname), {
            ...data,
            created_date: Date.now()
        });
        log(`updated to Firestore. ${JSON.stringify(data)}`);
    } catch (e) {
        log('Error saving Answer to Firestore: ' + e.message);
        console.error('Error saving Answer to Firestore:', e);
    }
}

/**
 * 
 */
export function listen({ docname, listener, print_debug_console }) {
    log(`Listening for ${docname}...`);
    print_debug_console?.(`listening ${docname}`)

    // console.log("listening ", docname)

    listening.push(onSnapshot(
        docname === undefined ? collection(db, collectionName) : doc(db, collectionName, docname),
        (snapshot) => {
            print_debug_console?.(`fstore snap.size ${snapshot.size}`)
            // console.log(snapshot.data())
            if (snapshot.size === undefined) {
                print_debug_console?.(`fstore snap.exists ${snapshot.exists()}`)
                if (snapshot.exists()) {
                    listener(snapshot.id, snapshot.data())
                }
            } else {
                snapshot.forEach(doc => {
                    // console.log(doc)
                    listener(doc.id, doc.data())
                })
            }
            // const data = snapshot.data();
            // listener(data);
        }, (error) => {
            log(`Firestore listener error: ${error.message}`);
            console.error('Firestore listener error:', error);
        }
    ));
}
const listening = [];

/**
 * Firestore のセッションデータをクリアする関数
 */
export async function clear({ docname, clear_listen = true } = {}) {
    // console.log("clear", docname)
    log('Clearing Firestore session data initiated.');
    try {
        // listenしているハンドラの削除
        if (clear_listen) {
            listening.forEach(e => e());
            listening.length = 0;
        }
        // メインのセッションドキュメントを削除
        if (docname !== undefined) {
            await deleteDoc(doc(db, collectionName, docname));
        }
        log('Main Firestore session document deleted.');

    } catch (e) {
        log('Error clearing Firestore data: ' + e.message);
        console.error('Error clearing Firestore data:', e);
    }
}
