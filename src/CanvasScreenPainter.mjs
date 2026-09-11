/**
 * スクリーンペインターのマーカーを認識する
 */
import { Peer } from "peerjs";
export const CanvasScreenPainter = {
    params: {
        module_name: "CanvasScreenPainter",

        recognition_result_visibility: false,
        pointer_visibility: true,

        threshold_min_value: 120,
        threshold_range: 10,
        threshold_loop: false,

        adaptive_threshold: false,
        gray_not_blue_channel: true,

        rect_simple__length_min: 10,
        rect_simple__length_max: 30,
        rect_simple__aspect_min: 0.4,
        rect_simple__aspect_max: 1.4,

        // rectangle score
        rect_score_limit: 0.4,

        comm_enabled: true,

        names: {
        },
        details: {
        },

        disables: [
            "module_name",
        ],
        hiddens: [
            "module_name",
            "pointer_visibility",
            "threshold_min_value", "threshold_range", "threshold_loop",
            "adaptive_threshold", "gray_not_blue_channel",
            // "rect_simple__length_min", "rect_simple__length_max",
            "rect_simple__aspect_min", "rect_simple__aspect_max",
            "rect_score_limit",
            "comm_enabled",
        ],
    },
    _recognize_ret: undefined,
    _viewpoint_element: {
        elem: undefined,
        wh: undefined,
    },

    _load_script: function (fname) {
        return new Promise((resolve, reject) => {
            const sc = document.createElement("script");
            sc.type = "text/javascript";
            sc.src = fname;
            sc.onload = () => resolve();
            sc.onerror = (e) => reject(e);
            const s = document.getElementsByTagName("script")[0];
            s.parentNode.insertBefore(sc, s);
        });
    },
    _utils: {
        // 2つの辞書型データの同じキーの値を足し合わせたデータを作成する。
        pls: (e0, e1) => [...Object.keys(e0)].reduce((a, k) => ({ ...a, [[k]]: Array.isArray(e0[k]) ? e0[k].map((e0, i) => e0 + e1[k][i]) : e0[k] + e1[k] }), {}),

        // 辞書型データのすべてのキーの値について指定された値で割る。
        div: (e, v) => [...Object.keys(e)].reduce((a, k) => ({ ...a, [[k]]: Array.isArray(e[k]) ? e[k].map(e => e / v) : e[k] / v }), {}),

        // ユークリッド距離
        dis: (p0, p1) => Math.sqrt(Math.pow(p0[0] - p1[0], 2) + Math.pow(p0[1] - p1[1], 2)),

        // 2つの値がほぼ等しいかの比較
        isclose: (v0, v1, rel_tol = 0.2) => Math.abs(v0 - v1) < Math.max(Math.abs(v0), Math.abs(v1)) * rel_tol,

        // 4つの点をy軸のプラスが上の数学系の座標系で左下、右下、右上、左上というatan2の出力(-pi～pi)の昇順となるようにソートする。
        sort_points: (points) => {
            const center = points.reduce((a, e) => [a[0] + e[0], a[1] + e[1]]).map(e => e / points.length);
            const with_radians = points.map(e => ({ r: Math.atan2(e[1] - center[1], e[0] - center[0]), p: e }));
            return with_radians.sort((e0, e1) => e0.r - e1.r).map(e => e.p);
        },

        // combination (https://qiita.com/kamekame85/items/8ec7350a263f99d8441d)
        // 関数内でthis.comb_unbindを使用するため、_util.comb_unbindか、comb_unbind.bindで使う必要がある。
        comb_unbind: function (ar, n) {
            return n === 1 ? ar.map(x => [x])
                : ar.flatMap((x, i) =>
                    this.comb_unbind(ar.slice(i + 1), n - 1).map(y => [x].concat(y)))
        },

        // 辺の長さが side_in_range の範囲内、アスペクト比が　aspect_in_range の範囲内
        // 横縦のそれぞれの2辺の長さが誤差20% (この数値は isclose関数で定義されている) 以内
        is_rect_simple: function ({ points, side_lengths }) {
            const { dis, isclose } = CanvasScreenPainter._utils;

            side_lengths ??= points.map((e, i) => dis(e, points[(i + 1) % points.length]));

            // 長方形と判定するときの1辺の長さの許容範囲、単位はピクセル
            const side_in_range = side => side >= CanvasScreenPainter.params.rect_simple__length_min
                && side <= CanvasScreenPainter.params.rect_simple__length_max;

            // 長方形と判定するときの縦を1としたとき横の辺の比率の許容範囲
            // (x/y: この式はMediaStreamTrack.getSettings.aspectRatioの計算式から引用)
            const aspect_in_range = aspect => aspect >= CanvasScreenPainter.params.rect_simple__aspect_min
                && aspect <= CanvasScreenPainter.params.rect_simple__aspect_max;

            // 長方形かどうかのおおまかな判定
            // side_length: 各辺の長さ（反時計回りに格納されている）
            return side_lengths.every(side_in_range)
                && aspect_in_range(side_lengths[0] / side_lengths[1])
                && isclose(side_lengths[0], side_lengths[2])
                && isclose(side_lengths[1], side_lengths[3]);
        },

        // 2点を通る直線の傾き(dy/dx)を求める。
        // slope: function (p0, p1) {
        //     const dx = p1[0] - p0[0];
        //     return dx === 0 ? Number.MAX_VALUE : (p1[1] - p0[1]) / dx;
        // },

        // 2つの直線のなす角(radians)
        // line_angle: function (m0, m1) {
        //     const denom = 1 + m0 * m1;
        //     return denom === 0 ? Math.PI / 2 : Math.atan((m0 - m1) / denom);
        // },

        // 2点を通る直線の角度(radians)
        // line_angle: function (p0, p1) {
        //     return Math.atan((p1[1] - p0[1]) / (p1[0] - p0[0]));
        // },

        // 2つのベクトルのなす角を求める。
        vec_angle: function (vec0, vec1) {
            const vlen = vec => Math.sqrt(vec.map(e => Math.pow(e, 2)).reduce((a, e) => a + e));
            const numer = vec0.reduce((a, e, i) => a + e * vec1[i], 0);
            const denom = vlen(vec0) * vlen(vec1);
            return denom === 0 ? Number.MAX_VALUE : Math.acos(numer / denom);
        },


        // 4つの点から長方形っぽさをスコアとして表す。
        // 点数が低いほど、より長方形っぽいとする。
        rect_score: function ({ points, side_lengths }) {
            const { dis, vec_angle } = CanvasScreenPainter._utils;

            // 各辺の長さ
            side_lengths ??= points.map((e, i) => dis(e, points[(i + 1) % points.length]));

            // pointsから2つの点を指定してベクトルを得る。向きは、i0からi1方向とする。
            const vec = (i0, i1) => points[i0].map((e, i) => points[i1][i] - e);

            // 2つのベクトルの平均
            const vec_ave = (vec0, vec1) => [(vec0[0] + vec1[0]) / 2, (vec0[1] + vec1[1]) / 2];

            const factors = {
                // 縦、横のそれぞれの2つの辺の差分(長い辺の方からの割合)
                diff_length_horizontal: Math.abs(side_lengths[0] - side_lengths[2]) / Math.max(side_lengths[0], side_lengths[2]),
                diff_length_vertical: Math.abs(side_lengths[1] - side_lengths[3]) / Math.max(side_lengths[1], side_lengths[3]),

                // 2つの横辺のなす角 (90度を1としたときの割合)
                horizontal_length_angle: vec_angle(vec(0, 1), vec(3, 2)) / Math.PI / 2,
                // 2つの縦辺のなす角 (90度を1としたときの割合)
                virtical_length_angle: vec_angle(vec(1, 2), vec(0, 3)) / Math.PI / 2,

                // 2つの横辺、2つの縦辺のそれぞれの平均傾きから求められる水平線と垂直線のなす角と90度との差分
                horizontal_vertical_length_angle: Math.abs(Math.PI / 2 - vec_angle(
                    vec_ave(vec(0, 1), vec(3, 2)), vec_ave(vec(1, 2), vec(0, 3)))) / Math.PI / 2,
            };

            return { score: Object.values(factors).reduce((a, e) => a + e), factors };
        },

        // 簡易uuid生成
        create_uuid: function () {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },
    },
    // this._(パラメータ名)に値をセットする汎用関数
    set_params: function (params) {
        Object.keys(params).forEach(k => {
            this["_" + k] = params[k];
        });
    },
    init: async function ({ brush_color, print_debug_console } = {}) {
        // 配列から1つの要素を選択する。
        [Array, "choice"].reduce((a, e) => {
            a.prototype[e] = function () {
                return this[Math.floor(this.length * Math.random())];
            };
            Object.defineProperty(a.prototype, e, { enumerable: false });
        });

        this._print_debug_console = print_debug_console;

        if (typeof cv === "undefined") {
            await this._load_script(`../webcamera/opencv.4.9.0.js`);
        }
        // console.log("cv", cv);

        const { create_uuid } = this._utils;

        // クライアントID
        this._uuid = create_uuid();

        // スマホでこのアプリを起動したときに、スマホ撮影画像の中心位置を固定画像の同じ位置にアフィン変換した
        // ものをwebsocketで送り続ける。コメントアウトするとwebsocket通信は行わない。
        if (this.params.comm_enabled) {
            const websocket = async () => {
                this._comm_client = (await import("./libs/CommClient.mjs")).CommClient;
                this._comm_client.params.avaiable = true;
                this._comm_client.init(`CanvasScreenPainter`, {
                    server_cmd: e => {
                        if (e.type === "opened") {
                            this._comm_client.send({ cmd: "set_type", type: "camera", data: "opened" });
                        }
                    },
                    text: e => { },
                });
            }
            const webrtc = async () => {
                const webrtc = await import("./libs/webrtc/webrtc.js");
                const room_id = `room_${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`
                console.log("before connect ", room_id)
                this._comm_client = await webrtc.connect({ room_id, print_debug_console: this._print_debug_console });
                const send0 = this._comm_client.send.bind(this._comm_client);
                this._comm_client.send = function (data) {
                    return send0(JSON.stringify(data));
                }
                this._comm_client.onmessage = e => {
                    // alert(JSON.stringify(e));
                    // this._print_debug_console?.(`vibrate ${e.data}`)
                    navigator.vibrate(e.data === "explosion" ? 200 : 10);
                }
                console.log("connected");
                this._print_debug_console?.("webrtc connected")
            }
            // await webrtc();

            const peer = new Peer();
            peer.on("open", id => {
                console.log("スマホ Peer ID:", id);
                const conn = peer.connect("screen-painter-nakada");
                conn.on("open", () => {
                    console.log("接続成功");
                    this._comm_client = conn;
                    const send0 = this._comm_client.send.bind(this._comm_client);
                    this._comm_client.send = function (data) {
                        return send0(JSON.stringify(data));
                    }
                    this._comm_client.send("スマホから接続しました");
                });
            });
        }

        this._clear_color = false;
        this._brush_color = (brush_color ?? [
            '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff',
            '#ff7f00', '#00ff7f', '#7fff00', '#ffff7f', '#ff7fff', '#00ffff', '#c0c0c0',
        ].choice());
        // this._sound_id = (sound ?? [
        //     "koka", "papa", "heavy", "peen", "nya",
        // ].choice());
        console.log(`selected color ${this._brush_color}`);
    },
    // apploxPolyで発見された四角形を時系列方向にクラスタリングする
    _rect_cluster_mgr: {
        _params: {
            // 1画像から得られる四角形がclusterに保存されているミリ秒
            // rect_expiration_msec: 500, // 手振れに強い（指でなぞるのに最適）
            // rect_expiration_msec: 100, // スマホを動かすのに最適
            rect_expiration_msec: 50, // さらにスマホを動かすのにすぐに反応するように
            // フレーム発見の判断基準となる上記の期間中に四角形が現れている割合
            rect_observation_rate: 0.2,

            // 同じクラスターに属する条件：四角形の中心位置の誤差の最小値
            // min_center_distance_ratio: 1.0, // 手振れに強い（指でなぞるのに最適）
            // min_center_distance_ratio: 2.0, // スマホを動かすのに最適
            min_center_distance_ratio: 3.0, // さらにスマホを動かすのにすぐに反応するように
            // 同じクラスターに属する条件：四角形の平均の辺の長さの最小値
            min_sz_ratio: 1.4,

            // 画面と判定されるための4つのマーカーが連続して発見される最小のミリ秒
            // このミリ秒以上、連続してマーカーが4つだけ観測されたら、その4つは画面の隅を表しているとする。
            // min_ms_for_four_markers: 0,//100,
        },
        // -----------------------------------------------
        // ここで1つのクラス
        _cluster_fmt: function ({ tm, rect, params }) {

            // -----------------------------------------------
            // ここからはユーティリティ関数
            const { pls, div, dis, isclose } = CanvasScreenPainter._utils;

            // -----------------------------------------------
            // ここからはクラスのメンバ変数
            this.tm_to_rects = [{ tm, rects: [rect] }];
            this.center_and_sz = undefined;

            // -----------------------------------------------
            // ここからはクラスのメンバ関数
            this.update_ave = () => {

                const rects = this.tm_to_rects.map(e => e.rects).reduce((a, e) => a.concat(e), []);

                this.center_and_sz = div(
                    rects.map(e => ({ center: e.center, sz: e.sz })).reduce((a, e) => pls(a, e), { center: [0, 0], sz: 0 })
                    , rects.length);
            }
            this.update = (tm) => {
                const before_length = this.tm_to_rects.length;
                this.tm_to_rects = this.tm_to_rects.filter(e => e.tm + params.rect_expiration_msec > tm);
                if (this.tm_to_rects.length !== before_length) {
                    this.update_ave();
                }
            };
            this.contains = (rect) => {
                const ret = this.center_and_sz !== undefined
                    && dis(rect.center, this.center_and_sz.center) < this.center_and_sz.sz * params.min_center_distance_ratio
                    && isclose(rect.sz, this.center_and_sz.sz, this.center_and_sz.sz * params.min_sz_ratio);
                return ret;
            };
            this.add = (tm, rect) => {
                const push = (ar, e) => { ar.push(e); return e; }
                const m = this.tm_to_rects.find(e => e.tm === tm) ?? push(this.tm_to_rects, { tm, rects: [] });
                m.rects.push(rect);
                this.update_ave();
            };

            // -----------------------------------------------
            // ここからはコンストラクタ
            this.update_ave();
        },
        _clusters: [],
        _image_timestamps: [],
        // _four_markers_elapsed_ms: { start: undefined, end: undefined },
        update: function ({ tm, rects }) {
            const { sort_points, comb_unbind, rect_score } = CanvasScreenPainter._utils;
            const comb = comb_unbind.bind(CanvasScreenPainter._utils);

            this._image_timestamps = this._image_timestamps.filter(t => t + this._params.rect_expiration_msec > tm);
            this._image_timestamps.push(tm);

            // 古い四角形の削除
            this._clusters.forEach(c => c.update(tm));
            this._clusters = this._clusters.filter(c => c.tm_to_rects.length > 0);

            rects.forEach(rect => {
                const cluster = this._clusters.find(c => c.contains(rect));
                if (cluster === undefined) {
                    this._clusters.push(
                        new this._cluster_fmt({ tm, rect, params: this._params })
                    );
                } else {
                    cluster.add(tm, rect);
                }
            });

            const min_pages = this._image_timestamps.length * this._params.rect_observation_rate;
            const markers = this._clusters.filter(e => e.tm_to_rects.length >= min_pages);
            let display = undefined;

            // 4以上n以下、ではないときは、外部画面の判定を実施しない。
            if (!(markers.length >= 4 && markers.length <= 9)) {
                return { markers, display };
            }

            const rect_rank = comb(markers, 4).map(mks => {
                // 最後の観測値でdisplayの四角形を作る。
                const cluster_representations = mks.map(e => e.tm_to_rects[e.tm_to_rects.length - 1].rects[0].center);
                // clusterの平均値でdisplayの四角形を作る。
                // const cluster_representations = markers.map(e=>e.center_and_sz.center);

                const points = sort_points(cluster_representations);

                return { rect_score: rect_score({ points }), points };
            });

            const rank = rect_rank.filter(e => e.rect_score.score < CanvasScreenPainter.params.rect_score_limit).
                sort((e0, e1) => e0.rect_score.score - e1.rect_score.score)[0];
            if (rank === undefined) {
                return { markers, display };
            }
            const { points } = rank;

            const src_points = new cv.Mat(4, 2, cv.CV_32FC1);
            points.forEach((e, i) => {
                src_points.data32F[i * 2 + 0] = e[0];
                src_points.data32F[i * 2 + 1] = e[1];
            })
            const dst_points = cv.matFromArray(4, 2, cv.CV_32FC1, [[0, 0], [1, 0], [1, 1], [0, 1]].flat());
            const to_delete = [src_points, dst_points];

            const affine_matrix_mat = cv.estimateAffine2D(src_points, dst_points);
            to_delete.push(affine_matrix_mat);

            const affine = {
                mat: [...Array(6).keys()].map(i => affine_matrix_mat.data64F[i]),
                tr: function (p) {
                    const p1 = [...p, 1];
                    return [this.mat.slice(0, 3).reduce((a, e, i) => a + e * p1[i], 0),
                    this.mat.slice(3).reduce((a, e, i) => a + e * p1[i], 0)];
                },
                equals: function (t) {
                    return t !== undefined && this.mat.length === t.mat.length &&
                        this.mat.every((e, i) => e === t.mat[i]);
                },
            }

            to_delete.forEach(e => e.delete());
            display = { points, affine };
            return { markers, display };
        },
    },
    // adaptiveThreshold -> canny -> findContours -> approxPolyDP
    _apploxPoly: function (imageData) {
        if (this.params.threshold_loop === true) {
            this.params.threshold_min_value = ((this.params.threshold_min_value - 180 + 1) % 76) + 180;
        }
        // if (this._best_threshold.fixed === true) {
        //     this.params.threshold_min_value = this._best_threshold.value;
        // } else {
        //     this.params.threshold_min_value = ((this.params.threshold_min_value - 180 + 1) % 76) + 180;
        // }
        const { threshold_min_value, threshold_range } = this.params;
        const to_delete = [];
        const src = cv.matFromImageData(imageData);
        to_delete.push(src);

        // 緑成分のみ削除
        // const channels = new cv.MatVector();
        // to_delete.push(channels);
        // cv.split(src, channels);
        // const rgb_type = 1; // 0:blue, 1:green, 2:red
        // const channel = channels.get(rgb_type);
        // channel.setTo(new cv.Scalar(0));
        // channels.set(rgb_type, channel);
        // cv.merge(channels, src);


        let channel = undefined;

        if (this.params.gray_not_blue_channel) {
            // グレースケールでその後の処理をする
            channel = new cv.Mat();
            cv.cvtColor(src, channel, cv.COLOR_RGBA2GRAY);
        } else {
            // 青成分のみを抽出する
            const rgb_type = 2;
            const channels = new cv.MatVector();
            to_delete.push(channels);

            cv.split(src, channels);
            channel = channels.get(rgb_type);
        }
        to_delete.push(channel);


        // const dst = new cv.Mat();
        // to_delete.push(dst);
        // if (this.params.adaptive_threshold) {
        //     cv.adaptiveThreshold(channel, dst, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 101, 0);
        // } else {
        //     cv.threshold(channel, dst, threshold_min_value, 255, cv.THRESH_BINARY);
        // }
        const dst = channel.clone();
        to_delete.push(dst);


        // const m = cv.Mat.ones(13,13,cv.CV_8U);
        // cv.erode(dst,dst,m);

        // cv.cvtColor(dst, dst, cv.COLOR_GRAY2RGBA, 0);
        // this._recognize_ret = {
        // src, dst,
        // to_delete: () => to_delete.forEach(e => e.delete()),
        // }
        // return;

        // https://docs.opencv.org/3.4/d7/de1/tutorial_js_canny.html
        cv.Canny(dst, dst, threshold_min_value, threshold_min_value + threshold_range, 3);

        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        to_delete.push(contours, hierarchy);
        cv.findContours(dst, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

        const { dis, is_rect_simple } = this._utils;

        // rect変数の作成
        const create_rect = (points, side_lengths) => ({
            // 頂点
            points,
            // 辺長
            side_lengths,
            // 重心
            center: points.reduce((a, e) => [a[0] + e[0], a[1] + e[1]], [0, 0]).map(e => e / points.length),
            // 平均辺長
            sz: side_lengths.reduce((a, e) => a + e, 0) / side_lengths.length,
        });


        // 要素は{points:Array(4),side_lengths:Array(4)}
        const rects = [];
        for (let i = 0; i < contours.size(); i += 1) {
            const contour = contours.get(i);
            const epsilon = 0.1 * cv.arcLength(contour, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(contour, approx, epsilon, true);

            if (approx.size().height === 4) {

                // convex hull
                // 四角形を見つけてから凸法をするのは、星のように内部に入り組んだ四角形を除外するため
                const hull = new cv.Mat();
                cv.convexHull(approx, hull);

                // 頂点 convexhullのデフォルトの反時計回り(y軸逆転すると時計回り)、右上から配列0番目に入る。
                //   display(opencv)の座標系  数学の座標系
                //   -x --- +x               -x --- +x
                // -y +0-----+1            +y +3----+2
                //    |      |                |     |   (atan2の出力(-pi～pi)の昇順(だと思われる))
                // +y +3-----+2            -y +0----+1
                // (https://docs.opencv.org/3.4/dc/dcf/tutorial_js_contour_features.html)
                const points = [...Array(hull.size().height).keys()].map(i => [hull.data32S[i * 2], hull.data32S[i * 2 + 1]]);

                // 各辺の長さ 4要素の浮動小数点配列
                const side_lengths = points.map((e, i) => dis(e, points[(i + 1) % points.length]));

                // 長さの範囲内で、かつ、おおよそ長方形であるかのチェック
                if (is_rect_simple({ side_lengths })) {
                    rects.push(create_rect(points, side_lengths));
                }
                hull.delete();
            } else {
                // console.log(approx.size())
            }
            approx.delete();
            contour.delete();
        }

        const { markers, display } = this._rect_cluster_mgr.update({
            tm: Date.now(),
            rects,
            rectangle_checker: this._rectangle_checker
        });

        const lines = new cv.Mat();
        to_delete.push(lines);
        // 線分の検出
        // cv.HoughLinesP(dst, lines, 1, Math.PI / 180, 2, 0, 0);
        cv.cvtColor(dst, dst, cv.COLOR_GRAY2RGBA, 0);

        // 輪郭(contour)の描画
        const contour_color = new cv.Scalar(255, 0, 0, 255);
        cv.drawContours(dst, contours, -1, contour_color, 1, cv.LINE_8, hierarchy, 100);

        this._recognize_ret = {
            src, dst, lines, rects, markers, display,
            to_delete: () => to_delete.forEach(e => e.delete()),
        };
        return this._recognize_ret;
    },
    _dft: function (imageData) {
        const to_delete = [];
        const src = cv.matFromImageData(imageData);
        const dst = new cv.Mat();
        to_delete.push(src, dst);

        // srcをグレースケール化
        cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY);

        // dftに適したサイズに画像を拡大する。
        const optimalRows = cv.getOptimalDFTSize(src.rows);
        const optimalCols = cv.getOptimalDFTSize(src.cols);
        const s0 = cv.Scalar.all(0);
        const padded = new cv.Mat();
        to_delete.push(padded);
        cv.copyMakeBorder(src, padded, 0, optimalRows - src.rows, 0,
            optimalCols - src.cols, cv.BORDER_CONSTANT, s0);

        // use cv.MatVector to distribute space for real part and imaginary part
        let plane0 = new cv.Mat();
        padded.convertTo(plane0, cv.CV_32F);
        let planes = new cv.MatVector();
        let complexI = new cv.Mat();
        let plane1 = new cv.Mat.zeros(padded.rows, padded.cols, cv.CV_32F);
        planes.push_back(plane0);
        planes.push_back(plane1);
        cv.merge(planes, complexI);

        to_delete.push(planes, plane0, plane1);
        to_delete.push(complexI);

        // in-place dft transform
        cv.dft(complexI, complexI);

        // compute log(1 + sqrt(Re(DFT(img))**2 + Im(DFT(img))**2))
        cv.split(complexI, planes);

        // dftの結果の複素数を実部、虚部に分けて大きさを求める。
        const mag0 = new cv.Mat();
        const [real, cmpl] = [planes.get(0), planes.get(1)];
        to_delete.push(mag0, real, cmpl);
        cv.magnitude(real, cmpl, mag0);

        const m1 = new cv.Mat.ones(mag0.rows, mag0.cols, mag0.type());
        to_delete.push(m1);
        cv.add(mag0, m1, mag0);
        cv.log(mag0, mag0);

        // x,y===0,0は0Hzの波ではない成分なので、そこを除外する。
        const high_values = [];
        const top_n = 20;
        for (let y = 1; y < mag0.rows / 2; y += 1) {
            for (let x = 1; x < mag0.cols / 2; x += 1) {
                const value = mag0.data32F[y * mag0.cols + x];
                if (high_values.length < top_n || high_values[high_values.length - 1].value < value) {
                    high_values.push({ x, y, value });
                    high_values.sort((e0, e1) => e1.value - e0.value);
                    high_values.splice(top_n)
                }
            }
        }
        console.log(`top${top_n} freq spec values`, high_values);


        // crop the spectrum, if it has an odd number of rows or columns
        let rect = new cv.Rect(0, 0, mag0.cols & -2, mag0.rows & -2);
        const mag1 = mag0.roi(rect);
        to_delete.push(mag1);

        // The pixel value of cv.CV_32F type image ranges from 0 to 1.
        cv.normalize(mag1, mag1, 0, 255, cv.NORM_MINMAX);

        const mag2 = new cv.Mat();
        to_delete.push(mag2);
        cv.convertScaleAbs(mag1, mag2);
        cv.cvtColor(mag2, dst, cv.COLOR_GRAY2RGBA);

        // 振幅スペクトルを画像化したあとで、画素値の大きなところを抽出する。
        // console.log("---------------------------");
        // [...dst.data]
        //     .filter((e, i) => i % 4 === 0)
        //     .map((e, i) => [i % dst.cols, Math.trunc(i / dst.cols), e])
        //     .filter(e => e[2] >= 220)
        //     .forEach(e => { console.log(`x:${e[0]}Hz,y:${e[1]}Hz,pixel:${e[2]}`) })

        this._recognize_ret = {
            src, dst,
            to_delete: () => to_delete.forEach(e => e.delete()),
        };
        return this._recognize_ret;
    },

    // websocketによる送信
    _send: function ({ ev_name, offset }) {
        const offset_ratios = this._affine?.tr(offset);
        return this._comm_client?.send({
            cmd: "text",
            to_id: "qr_code_receiver",
            data: JSON.stringify({
                [[ev_name]]: {
                    uuid: this._uuid,
                    offset_ratios,
                    color: this._clear_color ? "clear" : this._brush_color,
                    touching: this._is_pointer_down(),
                    // sound_id: this._sound_id,
                },
            }),
        });
    },
    // 登録済みのリスナーを登録解除するためのメソッド
    _ev_remover: undefined,
    get_ev_handlers: function (remover) {
        // return undefined;
        this._ev_remover = remover;
        // canvas上のイベントをサーバに送信するときに以下の変換テーブルを使用する。
        const tr_evname = {
            panstart: "touchstart",
            panmove: "touchmove",
            panend: "touchend",
        }
        // 発火イベントの送信
        const handler = (name, ev) => {
            // this._print_debug_console?.(`${name}`)
            if (this._comm_client === undefined || this._affine === undefined || Object.keys(tr_evname).includes(name) === false) {
                return;
            }
            this._send({ ev_name: tr_evname[name], offset: [ev.center.x, ev.center.y] });
        };
        return ["tap", "panstart", "panmove", "panend"].map(
            evname => [evname, ev => handler(evname, ev)]
        );
    },
    set_viewpoint_element: function (canvas, ctx, wh) {
        // 描画用canvasの諸データ保存
        this._viewpoint_element = {
            elem: canvas, ctx,
            wh,
        };

        // 既に登録済みのhanlderを削除して新たにイベントリスナーを登録する。
        this._ev_remover?.({ reset: false });
        return this;
    },
    _is_pointer_down: (function () {
        let is_pointer_down = false;
        document.addEventListener("pointerdown", () => { is_pointer_down = true; });
        document.addEventListener("pointerup", () => { is_pointer_down = false; });
        return function () {
            return is_pointer_down;
        }
    })(),
    // ディスプレイの四角形が認識される、認識が外れるときにそれぞれ、
    // pointerenter, pointerleave のイベントをサーバに送信する。
    // また、pointerenter後は、スマホ画面の中心をpointermoveしているとイベントを発火する。
    // この処理のために、スマートフォンの画面をタッチして発生する本来のpointerイベントは、
    // タッチイベントに変換してサーバに送信する。
    _pointer_event_mgr: {
        _pointer_entering: false,
        _pointer_position_ratio: [0.5, 0.5],
        _wh: undefined,
        _send: undefined,
        _pointermove_prev_affine: undefined,
        fire: function (name) {
            return this._send({
                ev_name: name,
                offset: this._pointer_position_ratio.map((e, i) => e * this._wh[i]),
            });
        },
        update: function (affine, wh, send) {
            this._wh = wh;
            this._send = send;
            if (affine !== undefined) {
                if (this._pointer_entering === false) {
                    if (this.fire("pointerenter")) {
                        this._pointer_entering = true;
                        this._pointermove_prev_affine = affine;
                    }
                }
                if (affine.equals(this._pointermove_prev_affine) === false) {
                    this.fire("pointermove");
                    this._pointermove_prev_affine = affine;
                }
            } else if (this._pointer_entering === true) {
                this.fire("pointerleave");
                this._pointer_entering = false;
                this._pointermove_prev_affine = undefined;
            }
        },
    },
    update_viewpoint: function (factors, dt, effective_pixels) {
        const { dst, lines, rects, markers, display, to_delete } = this._recognize_ret;
        const { ctx, wh } = this._viewpoint_element;

        if (this.params.recognition_result_visibility) {
            ctx.putImageData(
                new ImageData(new Uint8ClampedArray(dst.data), dst.cols, dst.rows)
                , 0, 0);
        }

        // marker countの描画
        // ctx.font = "16px Arial";
        // ctx.fillStyle = "skyblue";
        // ctx.fillText(`marker count ${markers.length}`, wh[0] / 2, wh[1] / 2);
        // ctx.beginPath();
        // ctx.arc(wh[0] / 2, wh[1] / 2, 1, 0, Math.PI * 2);
        // ctx.fill();

        // 四角形の描画
        // 4点のポイントの場合
        ctx.strokeStyle = "yellow";
        ctx.lineWidth = 2;
        rects?.forEach(rect => {
            ctx.beginPath();
            ctx.moveTo(...rect.points[0]);
            rect.points.slice(1).forEach(p => ctx.lineTo(...p));
            ctx.closePath();
            ctx.stroke();
            ctx.fillText(Math.min(...rect.side_lengths).toFixed(1), ...rect.points[2].map(e => e + 2));
        })
        // // 中心と平均辺長の場合
        ctx.strokeStyle = "green";
        ctx.lineWidth = 4;
        markers?.map(e => e.center_and_sz).forEach(({ center, sz }) => {
            ctx.strokeRect(...center.map(e => e - sz / 2), sz, sz);
        });

        // 認識用のcanvasと、video表示用のcanvasの両方に外部画面の四角形を描画する。
        if (display !== undefined) {
            ctx.strokeStyle = this._brush_color;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(...display.points[0]);
            display.points.slice(1).forEach(p => ctx?.lineTo(...p));
            ctx.closePath();
            ctx.stroke();
            if (this.params.pointer_visibility) {
                ctx.beginPath();
                ctx.arc(...this._pointer_event_mgr._pointer_position_ratio.map(
                    (e, i) => e * wh[i]),
                    10, 0, Math.PI * 2
                );
                ctx.stroke();
            }

            this._affine = display.affine;
        } else {
            this._affine = undefined;
        }
        this._pointer_event_mgr.update(this._affine, wh, this._send.bind(this));


        // lineの描画
        ctx.strokeStyle = "red";
        ctx.lineWidth = 1;
        for (let i = 0; i < lines?.rows ?? 0; i += 1) {
            const pt0 = [lines.data32S[i * 4 + 0], lines.data32S[i * 4 + 1]];
            const pt1 = [lines.data32S[i * 4 + 2], lines.data32S[i * 4 + 3]];
            ctx.beginPath();
            ctx.moveTo(...pt0);
            ctx.lineTo(...pt1);
            ctx.stroke();
        }
        to_delete?.();
    },
    recognize: async function (data) {
        return this._apploxPoly(data.imageData);
        // return this._dft(data.imageData);
    },
};
