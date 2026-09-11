
import { Peer } from "peerjs";
export const marker_receiver = {
    _params: {
        // qr_pos_margin: 60,
        // qr_size: 160,
        qr_pos_margin: 60,
        qr_size: 180,
    },
    _draw_qr_marker: function ({ ctx, x, y, w }) {

        // 中心に四角を描画するので、wは偶数に丸める。
        const w1 = w & -2;

        // 背景の白を描画
        ctx.fillStyle = "rgb(255,255,255,1)";
        ctx.fillRect(x, y, w1, w1);

        const [
            // 黒枠の幅
            frame_width_ratio,
            // 中心の四角の幅
            center_rect_width_ratio,
            // 黒枠の外のマージン
            frame_margin_ratio,
        ]
            // 市販のQRコードのマークをまねたもの。
            = [0.1, 0.4, 0.1];

        // 二値化を考えて、四角形が作りやすそうなもの。
        // = [0.3, 0.0, 0.0];


        // strokeRectは幅が偶数の場合、その数値を2nとすると、
        // 描画位置の外側にn、内側にn-1の幅になる。
        // 奇数の場合は、外側内側に薄い色が使われるようで、
        // qr codeには適さない可能性があるので、線幅は偶数にする。
        const line_w = (w1 * frame_width_ratio) & -2;

        const margin = (w1 * frame_margin_ratio) & -2;


        ctx.lineWidth = line_w;
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.strokeRect(
            x + margin + line_w / 2
            , y + margin + line_w / 2
            , w1 - line_w - 2 * margin
            , w1 - line_w - 2 * margin);

        const center_rect_width = (w1 * center_rect_width_ratio) & -2;
        ctx.fillStyle = "rgba(0,20,0,1)";
        ctx.fillRect(
            x + w1 / 2 - center_rect_width / 2
            , y + w1 / 2 - center_rect_width / 2
            , center_rect_width
            , center_rect_width);

        // markerの中心を返す。
        return [x + w1 / 2, y + w1 / 2];
    },
    _init_canvas: function (canvas_elem) {
        // this._canvas_elem = canvas_elem;
        // this._canvas_wh = [canvas_elem.width, canvas_elem.height];
        // this._ctx = canvas_elem.getContext("2d", { willReadFrequently: true });
        this._canvas.elem = canvas_elem;
        this._canvas.wh = [canvas_elem.width, canvas_elem.height];
        this._canvas.ctx = canvas_elem.getContext("2d", { willReadFrequently: true });
        // this._canvas.ctx.globalCompositeOperation = "destination-over";
        const { x, y } = canvas_elem.getBoundingClientRect();
        this._canvas.lt = [x, y];
    },
    _canvas: {
        elem: undefined,
        ctx: undefined,
        wh: undefined,
        lt: undefined,
    },
    _event_target_elem: undefined,
    // canvasの四隅に配置したマーカーが作る四角形、canvasからのx,y軸のズレと、幅と高さ
    _marker_frame: {
        offset: undefined,
        wh: undefined,
    },
    _webrtc_init: async function ({ handler }) {
        const webrtc = await import("./libs/webrtc/webrtc.js");
        while (true) {
            try {
                const channel = await webrtc.listen({ connection_expiry: Date.now() - 1 * 10 * 1000, timeout: 10 * 1000 });
                console.log("connected", JSON.stringify(channel));
                channel.onmessage = e => {
                    console.log(e);
                    const data = JSON.parse(e.data);
                    handler(data, channel);
                }
            } catch (error) {
                // timeoutなので何も処理をせずに再度listenにはいる。
                // タイムアウト処理を入れないと、中途半端に接続処理が行われた場合の自動初期化ができなくなる。
            }
        }
    },
    _comm_init: async function ({ handler }) {
        const comm_client = (await import("./libs/CommClient.mjs")).CommClient;
        comm_client.params.avaiable = true;
        comm_client.init(`qr_code_receiver`, {
            server_cmd: e => {
                if (e.type === "opened") {
                    comm_client.send({ cmd: "set_type", type: "camera", data: "opened" });
                }
            },
            text: e => {
                handler(e, comm_client);
            },
        });
        return comm_client;
    },
    _websocket_handler: function (e, channel) {
        console.log(e);
        const data = JSON.parse(e.data);
        Object.keys(data).forEach(evname => {
            const [offsetX, offsetY] = data[evname].offset_ratios === undefined ? this._canvas.lt.map(e => e - 1)
                : data[evname].offset_ratios.map(
                    (e, i) => e * this._marker_frame.wh[i] + this._marker_frame.offset[i]);
            // console.log("-------------")
            // console.log(data[evname].offset_ratios)
            // console.log([offsetX, offsetY])
            // console.log(evname);

            const ev = new this.CustomPointerEvent(evname, {
                bubbles: true,
                cancelable: true,
                pointerId: 1,
                pointerType: evname,
                // offsetには直接セットできない。clientに入れると結果的に同じ値がoffsetにも入る。
                clientX: offsetX + this._canvas.lt[0],
                clientY: offsetY + this._canvas.lt[1],
                // クライアントで画面をタッチしているとき、イベントのbuttons(ポインタデバイスのどのボタンをおしているか)を 1: 主ボタンにセットする
                // MouseEvent.buttons https://developer.mozilla.org/ja/docs/Web/API/MouseEvent/buttons
                buttons: data[evname].touching ? 1 : 0,
            });
            ev.userData = {
                color: data[evname].color,
                uuid: data[evname].uuid,
                offsets: [offsetX, offsetY],
                channel,
            };

            // test
            // const pev = new Proxy(ev, {
            //     get(target, property, receiver) {
            //         if (property === 'offsetX') {
            //             console.log(this);
            //             return target.userData.offsets[0];
            //         }
            //         return Reflect.get(target, property, receiver);
            //     }
            // })
            this._event_target_elem.dispatchEvent(ev);
        });
    },
    init: async function ({ canvas_elem, event_target_elem }) {
        // PointerEventをプログラムで生成して発火させるとき、本来はclientXとclientYの値を設定すれば、ブラウザが自動的にoffsetXとoffsetYを計算してくれるはずです。ところが、なぜか自動計算が適切に行われず、期待する値がoffsetXに入ってくれません。offsetXは読み取り専用なので、直接値を設定することもできないのが問題でした。
        // そこで、イベントオブジェクトにuserDataというプロパティを追加し、そこに自分で計算した正しいoffsetXの値をセットしておくことにしました。その後、Proxyを使ってoffsetXへのアクセスを横取りし、ブラウザの自動計算された値ではなく、userDataから正しい値を取得して返すようにします。この方法を使えば、たとえブラウザの自動計算が正しく機能しなくても、リスナー側で常に正しいoffsetXの値を得ることができます。
        class CustomPointerEvent extends PointerEvent {
            constructor(type, eventInitDict) {
                super(type, eventInitDict);
            }
            get offsetX() {
                return this.userData?.offsets[0] ?? this.offsetX;
            }
            get offsetY() {
                return this.userData?.offsets[1] ?? this.offsetY;
            }
        }
        this.CustomPointerEvent = CustomPointerEvent;

        this._init_canvas(canvas_elem);
        this._event_target_elem = event_target_elem ?? canvas_elem;
        this._marker_points_x = [this._params.qr_pos_margin, this._canvas.wh[0] - this._params.qr_pos_margin - this._params.qr_size];
        this._marker_points_y = [this._params.qr_pos_margin, this._canvas.wh[1] - this._params.qr_pos_margin - this._params.qr_size];
        this._marker_points = this._marker_points_x.map(x => this._marker_points_y.map(y => [x, y])).flat();
        this._marker_frame.offset = [this._marker_points_x[0] + this._params.qr_size / 2, this._marker_points_y[0] + this._params.qr_size / 2];
        this._marker_frame.wh = [this._marker_points_x[1] - this._marker_points_x[0], this._marker_points_y[1] - this._marker_points_y[0]];
        // console.log(this._marker_frame.wh[1],this._marker_frame.offset[1])
        // console.log(this._canvas.lt[1])

        const websocket = async () => {
            await this._comm_init({ handler: this._websocket_handler.bind(this), });
        }
        const webrtc = async () => {
            await this._webrtc_init({ handler: this._websocket_handler.bind(this), });
        }
        // await webrtc();

        {
            console.log("PeerJSを使ったWebRTCの接続待ち");
            const peer = new Peer("screen-painter-nakada");
            peer.on("open", id => {
                console.log("Peer ID:", id);
            });
            peer.on("connection", conn => {
                console.log("接続要求");
                conn.on("open", () => {
                    console.log("接続成功");
                });
                conn.on("data", data => {
                    console.log("受信:", data);
                    this._websocket_handler(JSON.parse(data), conn);
                });
            });
        }
    },
    render: function () {
        this._marker_points?.forEach(([x, y]) => {
            const center = this._draw_qr_marker({ ctx: this._canvas.ctx, x, y, w: this._params.qr_size });
        });
    },

};

