/*
得られるipが以下のような形式の場合、
28808bee-1536-4f71-966d-7e93b25b3dee.local

このアドレスはipv6のmDNSという、DNSサーバを必要としないローカルエリアネットワークの名前解決のアドレスである。
このアドレスは android ではwebrtcとしての接続は可能であるが、ブラウザのアドレスバーに入力して接続することはできない。

原因は、chromeの設定でローカルのアドレスを非公開としているため

対策は、chrome://flags/#enable-webrtc-hide-local-ips-with-mdns をchromeのアドレスにセットして、
anonymize local IPs exposed by WebRTCをDefault(enable)から Disabledに変える。

*/

const _load_script = function (fname) {
    return new Promise((resolve, reject) => {
        const sc = document.createElement("script");
        sc.type = "text/javascript";
        sc.src = fname;
        sc.onload = () => resolve();
        sc.onerror = (e) => reject(e);
        const s = document.getElementsByTagName("script")[0];
        s.parentNode.insertBefore(sc, s);
    });
};

// QRコード作成ライブラリ
await _load_script("https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js");


// 要素を作ってプロパティを設定する。デバッグ用
[Array, "a2e"].reduce((a, e) => {
    a.prototype[e] = function () { return this.reduce((e, f) => { f(e); return e; }); };
    Object.defineProperty(a.prototype, e, { enumerable: false });
});

export const local_qrcode = {
    // URL、localhostの部分がipアドレスの数値になるものの元
    _testurl: undefined,
    _url_string: undefined,
    _init: async function (params = {}) {
        if (this._testurl !== undefined) {
            return;
        }
        this._testurl = window.location.href;

        // URLオブジェクトを作成
        const url = new URL(this._testurl);
        // プロトコル部分の抽出
        const proto = url.protocol.replace(':', '');  // 例: "http"
        // ポート番号の抽出（ポート指定がなければ ""）
        const port = (url.port && url.port !== "80" && url.port !== "443") ? `:${url.port}` : "";
        // パス部分（例: /dir1/dir2/index.html）
        const pathname = url.pathname;
        // path（ディレクトリパス）と filename に分割
        const lastSlashIndex = pathname.lastIndexOf('/');
        const path = pathname.slice(0, lastSlashIndex + 1); // 例: "/dir1/dir2/"
        const filename = pathname.slice(lastSlashIndex + 1); // 例: "index.html"（なければ ""）

        const is_local = url.hostname === "localhost" || url.hostname === "127.0.0.1";

        // ipは、WebRTCを使って取得する。参考: https://stackoverflow.com/questions/20194722/can-you-get-a-users-local-lan-ip-address-via-javascript
        const ip = is_local ? await new Promise(async (resolve, reject) => {
            const pc = new RTCPeerConnection({ iceServers: [] });
            pc.createDataChannel("");
            const offer = await pc.createOffer(/*pc.setLocalDescription.bind(pc), () => { }*/);
            pc.setLocalDescription(offer);

            pc.onicecandidate = (ice) => {
                if (ice?.candidate && ice.candidate.candidate) {
                    try {
                        // const ip = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7})/.exec(ice.candidate.candidate)[1];
                        const ip = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7}|([a-f0-9-]+\.local))/.exec(ice.candidate.candidate)[1];
                        pc.onicecandidate = () => { };
                        resolve(ip);

                    } catch (err) {
                        resolve(undefined);
                    }
                }
            }
        }) : url.hostname;

        // localhostがipの数値になったURLを再構成する。
        if (ip !== undefined) {
            this._url_string = proto + "://" + (params.host ?? ip) + port + path + (params.filename ?? filename);
            // console.log(this._url_string)
        }
    },
    inject: async function ({ elem, filename, host }) {
        await this._init({ filename, host });
        if (this._url_string === undefined) {
            return;
        }
        // QRコードの作成
        const qr = new QRious({
            element: elem,
            value: this._url_string,
        });
    },
    url: async function () {
        await this._init();
        if (this._url_string === undefined) {
            return "could not find local ip address";
        }
        return this._url_string;
    },
};


