/*
 Google Cloud Run上に作成したWebSocketサーバのクライアントモジュール

 websocket server endpoint
 wss://websocket-server-k3mkqlja4q-uc.a.run.app/ws/{client_id:str}

 html end point (websocket clientの簡易HTMLを返す)
 https://websocket-server-k3mkqlja4q-uc.a.run.app/

 サーバのプログラムは、ActiveCamera/cloud_run にある。
*/
export const CommClient = {
    debug_log: function (str) {
        // console.log(str);
    },
    params: {
        avaiable: true,
        client_id: "",
        client_status: "",
        server_url: "",

        get_server_status: function () {
            CommClient.params.server_status = "";
            CommClient.send({ cmd: "server_cmd", type: "get_status" });
        },
        server_status: "",

        names: {
            avaiable: "有効化",
            get_server_status: "サーバの状態を取得",
        },
        details: {
            avaiable: "リモート操作のための通信を有効化します。",
            client_id: "このアプリを識別するIDです。デバッグのために使用し、変更することはできません。",
            client_status: "通信の状態を表示します。",
            server_url: "サーバのアドレスを表示します。",
            server_status: "「サーバの状態を取得」ボタンを押すと、サーバの状態がここに表示されます。",
        },
        onChanges: {
            avaiable: function (e) {
                this.object.init();
            },
        },
        disables: [
            "client_id",
            "client_status",
            "server_url",
            "server_status",
        ],
    },
    defulat_message_handlers: {
        "server_cmd": function (e) {
            this.params.server_status = e.data ?? e.type;
        },
        "set_type": function (e) {
            const obj_i = this.client.connected_clients.findIndex(ei => ei.id === e.from_id);
            if (obj_i !== -1) {
                this.client.connected_clients.splice(obj_i, 1);
            }
            if (e.data === "opened") {
                this.client.connected_clients.push({ id: e.from_id, type: e.type });
            }
        },
    },

    // websocketがクローズしたときに自動的に再接続するwebsocket
    // 引数で指定されたlistenersのうち、closeについてはハックしてwebsocketから直接ではなく、この関数が接続のリトライ後に発行する。
    // この関数だけでライブラリ化しているので、この関数単体で再利用可能である。
    create_websocket: function (url, listeners) {
        const sys_listeners = {
            open: e => {
                this.debug_log(`websocket open ${e}`);
                retry_count = 0;
                sys_user_listeners.open?.(e);
            },
            close: e => {
                this.debug_log(`websocket close ${e}`);
                // if (false === retry() && "close" in listeners) {
                // listeners.close();
                if (false === retry()) {
                    sys_user_listeners.close?.(e);
                }
            },
        };
        const sys_user_listeners = Object.keys(sys_listeners).map(e => ({ [e]: listeners[e] })).reduce((a, e) => Object.assign(a, e));
        const registered_listeners = Object.assign(
            Object.entries(listeners).filter(([k, v]) => !(k in sys_listeners)).reduce((a, e) => ({ ...a, [e[0]]: e[1] }), {}),
            sys_listeners);
        let ws = undefined;
        const max_retry_count = 10;
        const retry_interval_ms = 1000;
        let retry_count = 0;
        const retry = () => {
            if (retry_count >= max_retry_count) {
                return false;
            }
            retry_count += 1;
            this.debug_log("websocket retrying... " + retry_count);
            setTimeout(() => {
                uninit();
                init();
            }, retry_interval_ms);
            return true;
        };
        const uninit = () => {
            Object.entries(registered_listeners).forEach(([k, v]) => {
                ws?.removeEventListener(k, v);
            })
            ws?.close();
            ws = undefined;
            return true;
        }
        const init = () => {
            ws = new WebSocket(url);
            Object.entries(registered_listeners).forEach(([k, v]) => {
                ws.addEventListener(k, v);
            })
            return true;
        };
        init();
        return {
            send: (v) => {
                this.debug_log(`websocket sending cmd="${v.cmd}" ` + (v.data?.slice(0, 5).concat("...") ?? ""));
                if (ws?.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ ...v, "from_id": this.params.client_id }));
                    return true;
                }
                return false;
            },
            readyState: () => {
                return ws.readyState;
            },
            readStateToString: () => {
                return [
                    "connecting",
                    "open",
                    "closing",
                    "closed",
                ][ws.readyState]
            },
            close: () => {
                uninit();
                retry_count = 0;
            },
        };
    },
    // 排他処理
    // semaphore.request() から semaphore.finished() の間は、
    // 必ず処理が重ならないことを補償する。処理が重なるとは例えば
    //  console.log("1");
    //  await f();
    //  console.log("2");
    // のイベント処理があるとしてイベントが複数回発生したときに、
    // 1122と表示されるようなことである。awaitで待っている間に、
    // 次のイベントが発火してしまうことに起因する。
    //  await semaphore.request();
    //  console.log("1");
    //  await f();
    //  console.log("2");
    //  semaphore.finished();
    // とすると複数のイベントがほぼ同時に発生しても、1212と出力される。
    semaphore: {
        _executing: false,
        request: async function () {
            while (this._executing) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            this._executing = true;
        },
        finished: function () {
            this._executing = false;
        }
    },

    client: {
        message_handlers: undefined,
        close_listener: undefined,
        sock: undefined,
        connected_clients: [],
    },
    // プログラム内ではlistenerとhandlerを次のように使い分ける(2022.10.04)
    //  listener: websocketのaddEventListenerに直接セットするコールバック関数のこと。
    //  hander:   websocketのmessage listenerから呼ばれるコールバック関数で、cmd プロパティの値ごとに関数を設定する。
    //  handler_lock: handlerの処理を排他的に実施する場合にtrueを指定する。 
    init: async function (client_id, message_handlers, close_listener, handler_lock = false) {
        this.params.object = this;
        this.params.client_id = client_id ?? this.params.client_id;
        this.client.message_handlers = message_handlers ?? this.client.message_handlers;
        this.client.close_listener = close_listener ?? this.client.close_listener;
        this.params.server_url = `wss://websocket-server-k3mkqlja4q-uc.a.run.app/ws/${this.params.client_id}`;
        this.semaphore = handler_lock === false ? undefined : this.semaphore;

        // waitFor.finished()が呼ばれるまで、await waitFor.wait()で処理を止める。
        // websocketのopenまたはerrorイベントの発火まで本関数が戻らないことを保証する。
        const waitFor = {
            _waiting: true,
            _return_state: undefined,
            wait: async function () {
                while (this._waiting) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                return this._return_state;
            },
            finished: function (return_state) {
                this._return_state = return_state;
                this._waiting = false;
            }
        }

        if (this.params.avaiable) {
            this.client.sock = this.create_websocket(this.params.server_url, {
                "message": async e => {
                    await this.semaphore?.request();
                    e = JSON.parse(e.data);
                    this.debug_log(`websocket receive cmd="${e.cmd}" ` + (e.data?.slice(0, 5).concat("...") ?? ""));
                    this.defulat_message_handlers[e.cmd]?.call(this, e);
                    await this.client.message_handlers[e.cmd]?.(e);
                    this.params.client_status = this.readStateToString();
                    this.semaphore?.finished();
                },
                "close": e => {
                    this.client.close_listener?.();
                    this.params.client_status = this.readStateToString();
                },
                ...["open", "error"].reduce((a, e) => ({
                    ...a, [e]: e => {
                        waitFor.finished(e.type==="open");
                        this.params.client_status = this.readStateToString();
                    }
                }), {}),
            });
            Object.assign(this, this.client.sock);
        } else {
            this.client.sock?.close();
            this.client.sock = undefined;
            this.client.close_listener?.();
            Object.assign(this, {
                send: () => { },
                readyState: () => -1,
                readStateToString: () => "websocket unavaiable",
                close: () => { },
            });
            this.params.client_status = this.readStateToString();
        }
        await waitFor.wait();
    },

    get_clients: function (type) {
        return this.client.connected_clients.filter(e => (type === undefined || e.type === type));
    },
};
