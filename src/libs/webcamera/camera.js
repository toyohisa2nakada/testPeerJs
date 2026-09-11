/**
 * ActiveCamera
 */

export const camera = {
    // 動画の設定
    _resolutions: [
        [3840, 2160],    //0 4k
        [2880, 3840],    //1 rog test
        [1920, 1080],    //2 fhd
        [1280, 720],     //3 hd
        [1024, 768],     //4 xga
        [640, 480],      //5 vga
        [640, 360],      //6 vga相当のaspect=1.778(4k,fhd,hd)

        // [512,512],       //7 dft test用

        [320, 180],      //7 vgaの1/2相当のaspect=1.778(4k,fhd,hdと同じ)
        [160, 90],       //8 vgaの1/4相当のaspect=1.778(4k,fhd,hdと同じ)
        [80, 45],        //9 vgaの1/8相当のaspect=1.778(4k,fhd,hdと同じ)
    ],
    _params: {
        // 画面表示時のプレビュー画面の解像度
        init_video_resolution_index: -1,
        // 画面表示時の処理画面の解像度 (-1のときプレビュー画面の解像度と同じ)
        init_canvas_resolution_index: -1,
        // 最初に選択するカメラのfacing mode
        init_facingMode: "environment",
        // 配信用のvideo_canvasを使用する。
        use_video_canvas: true,
        // 最大、最小ズーム設定
        // video_canvasで最初に表示される画像からの倍率とする。
        // recognition canvasからvideo_canvasへの拡大、縮小のことは無視するとする。
        zoom_range: [1, 50],
    },

    // ダブルバッファー対応のcanvasデータ
    _canvas2: undefined,
    // 画像認識処理をするためのcanvas
    _recognition_canvas: undefined,
    // 公開用のcanvas
    _video_canvas: undefined,
    // opencvによる画像処理をカプセル化したモジュール
    _videoImage: undefined,
    // videoエレメント、複数を保持できるのは、PCで複数のカメラを使用することの対応
    _videos: [],
    // cameraデバイス一覧
    _devices: undefined,

    // htmlエレメント
    _elements: {
        // video選択の
        video_selects: [],
    },

    _hammer: undefined,
    _video_recognition_canvas_on_update: undefined,

    // 拡大縮小、移動を考慮したイベントとctxを作成する。
    create_wrapped_canvas: function (canvas, get_ev_f) {
        const settings = {
            // タッチイベントはcssの座標系で送られるので、それをcanvasの仮想座標系(wh)に変換するために使用する。
            // 仮想(wh) / css
            wh_css_ratio: 1.0,
            // recognition canvasからvideo canvasへの倍率
            // recognitionの一部を拡大してvideo canvasへ描画することも対応する。
            magnifications: [1.0, 1.0],
            magnifications_range: [[1, 1], [10, 10]],
            // lt1_0にrecog canvasの左上箇所を移動して、それから拡大する。
            // lt1_0: [0, 0],
            // lt1_0_range: [[-128, -128], [0, 0]],
            lt: [0, 0],
            org_wh: [0, 0],
            dst_wh: [0, 0],
        };
        const nor_lt = (lt) => lt.map((e, i) =>
            Math.min(0, Math.max(settings.dst_wh[i] - settings.org_wh[i] * settings.magnifications[i], e)));

        // ltは、video canvasの仮想位置
        const set_lt = ({ lt, d_lt }) => {
            settings.lt = nor_lt(lt ?? settings.lt.map((e, i) => e + d_lt[i]));
        };
        const set_zoom_range = (org_wh, dst_wh, magnifications_range) => {
            settings.org_wh = org_wh;
            settings.dst_wh = dst_wh;
            settings.magnifications_range = magnifications_range;
        };
        // pinは、video canvasの仮想位置
        const set_zoom = ({ pin, magnifications, d_magnifications }) => {
            pin ??= [0, 0];
            const rng = settings.magnifications_range;
            magnifications ??= settings.magnifications.map((e, i) => e * d_magnifications[i]);
            magnifications = magnifications.map((e, i) => Math.min(rng[1][i], Math.max(rng[0][i], e)))
            d_magnifications = settings.magnifications.map((e, i) => magnifications[i] / e);
            settings.magnifications = magnifications;

            settings.lt = nor_lt(settings.lt.map((e, i) => (e - pin[i]) * d_magnifications[i] + pin[i]));
        };
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.userData = { zoom_enabled: true };
        [
            // ctxのメソッド名、位置変換、幅変換を行う引数の番号
            { name: "moveTo", tr_pt_idx: [0, 1], tr_wh_idx: [] },
            { name: "lineTo", tr_pt_idx: [0, 1], tr_wh_idx: [] },
            { name: "fillText", tr_pt_idx: [1, 2], tr_wh_idx: [] },
            { name: "strokeRect", tr_pt_idx: [0, 1], tr_wh_idx: [2, 3] },
            { name: "arc", tr_pt_idx: [0, 1], tr_wh_idx: [2] },
            { name: "drawImage", tr_pt_idx: [5, 6], tr_wh_idx: [7, 8] },
        ].forEach(({ name, tr_pt_idx, tr_wh_idx }) => {
            const org = ctx[name].bind(ctx);
            ctx[name] = (...params) => {
                if (ctx.userData.zoom_enabled === false) {
                    org(...params);
                } else {
                    const { magnifications, lt } = settings;

                    org(...params.map((e, i) =>
                        tr_pt_idx.includes(i) ?
                            (e * magnifications[i - tr_pt_idx[0]] + lt[(i - tr_pt_idx[0]) % lt.length]) :
                            // e * magnifications[i - tr_pt_idx[0]] + lt1_0[i - tr_pt_idx[0]] :
                            tr_wh_idx.includes(i) ?
                                e * magnifications[(i - tr_wh_idx[0]) % magnifications.length] :
                                e)
                    );
                }
            }
        });

        if (this._hammer === undefined) {
            this._hammer = new Hammer(canvas);
            this._hammer.get("pan").set({ direction: Hammer.DIRECTION_ALL });
            this._hammer.get('pinch').set({ enable: true });
        }
        // この関数は、何度か実行される。
        // その実行の都度、handler_infoを保持しておくことにより、
        // 追加されたハンドラを実行単位で削除することが出来る。
        const add_ev_handlers = (get_ev_f) => {
            if (get_ev_f === undefined) {
                return;
            }
            const remover = ({ reset } = {}) => {
                handler_info.forEach(info => {
                    this._hammer.off(...info);
                });
                if (reset === true) {
                    add_ev_handlers(get_ev_f);
                }
            };
            const canvas_boundingClientRect = canvas.getBoundingClientRect();
            const create_wrapper = handler => {
                return ev => {
                    if (ev.userData === undefined) {
                        ev.userData = {
                            center0: [ev.center.x - canvas_boundingClientRect.x, ev.center.y - canvas_boundingClientRect.y],
                            delta0: [ev.deltaX, ev.deltaY],
                        };

                        const { wh_css_ratio, lt, magnifications } = settings;
                        ["deltaX", "deltaY"].forEach((e, i) => {
                            ev[e] = ev[e] * wh_css_ratio / magnifications[i];
                        });
                        // ev.center0_debug = [ev.center.y, lt1_0[1], magnifications.map(e => e.toFixed(2)).join(","),
                        //     canvas_boundingClientRect];
                        ["x", "y"].forEach((e, i) => {
                            ev.center[e] = ((ev.center[e] - canvas_boundingClientRect[e]) * wh_css_ratio - lt[i]) / magnifications[i];
                        })
                    }

                    handler(ev);
                };
            }
            // handler_info: [[evname,handler],...]
            const handler_info = (get_ev_f?.(remover) ?? []).map(
                ([evname, handler]) => [evname, create_wrapper(handler)]);
            handler_info.forEach(info => {
                this._hammer.on(...info);
            });

        };
        add_ev_handlers(get_ev_f);

        const set_settings = (params) => {
            Object.keys(params).forEach(k => settings[k] = params[k]);
        }
        return { ctx, set_settings, set_lt, set_zoom, set_zoom_range, add_ev_handlers };
    },

    set_params: function (params) {
        Object.keys(params).filter(k => params[k] !== undefined).forEach(k => {
            this._params[k] = params[k];
        });
    },
    init: async function ({ video_controller_elem, video_resolution, recognition_canvas_resolution, facingMode, use_video_canvas, video_recognition_canvas_on_update }) {
        this._video_recognition_canvas_on_update = video_recognition_canvas_on_update;

        // 配列の最初でオブジェクトを指定して、そのあとの関数で値をセットする。Object.keysで一覧に現れないように
        // enumerable:falseとしている。
        // [document.createElement("div"),e=>e.style.cssText="display:inline-block"].a2e() のようにして使用する。
        [Array, "a2e"].reduce((a, e) => {
            a.prototype[e] = function () { return this.reduce((e, f) => { f(e); return e; }); };
            Object.defineProperty(a.prototype, e, { enumerable: false });
        });

        // selectエレメントのoptionを選択する。optionがない場合は、追加する。
        [HTMLSelectElement, "set"].reduce((a, e) => {
            a.prototype[e] = function (value, textContent, find_next_element_during_add_f) {
                const a = Array.from(this.options);
                const i = a.findIndex(e => e.value == value);
                if (i >= 0) {
                    this.selectedIndex = i;
                } else {
                    let i1 = find_next_element_during_add_f === undefined ? -1 : find_next_element_during_add_f(a);
                    i1 = i1 == -1 ? a.length : i1;
                    this.add([
                        document.createElement("option"), e => e.value = value, e => e.textContent = textContent,
                    ].a2e(), this.options[i1]);
                    this.selectedIndex = i1;
                }
                this.dispatchEvent(new Event("change"));
            };
            Object.defineProperty(a.prototype, e, { enumerable: false });
        });

        // 動画ソースのサイズ変換等をopencvを使って行うモジュールの読み込み
        this._videoImage = (await import("./VideoImage.mjs")).VideoImage;
        await this._videoImage.init();

        // this._paramsのアップデート
        if (facingMode !== undefined) {
            // this._params.init_facingMode = facingMode;
            this.set_params({ init_facingMode: facingMode });
        }
        if (use_video_canvas !== undefined) {
            // this._params.use_video_canvas = use_video_canvas;
            this.set_params({ use_video_canvas });
        }

        // resolutionが指定されている場合
        const resolutions = [
            [video_resolution, "init_video_resolution_index"],
            [recognition_canvas_resolution, "init_canvas_resolution_index"]];
        resolutions.filter(e => e[0] !== undefined).forEach(([reso, pname]) => {
            let index = this._resolutions.findIndex(e => e[0] === reso[0] && e[1] === reso[1]);
            if (index === -1) {
                index = this._resolutions.findIndex(e => e[0] === reso[0] ? e[1] < reso[1] : e[0] < reso[0]);
                this._resolutions.splice(index, 0, reso);
            }
            // this._params[pname] = index;
            this.set_params({ [[pname]]: index });
        });

        video_controller_elem.appendChild([
            document.createElement("div"),
            e => e.id = "video_selector",
        ].a2e());
        video_controller_elem.appendChild([
            document.createElement("div"),
            e => e.id = "video_panel",
        ].a2e());
        if (this._params.use_video_canvas) {
            video_controller_elem.appendChild([
                document.createElement("canvas"),
                e => e.id = "video_canvas",
                // test_waterSurfaceModuleのためにzIndexの設定を解除、ActiveCameraで試していないので、戻す可能性あり
                // 2025.10.28
                // e => e.style.zIndex = 1,
                e => e.style.position = "absolute",
                e => e.style.display = "block",
            ].a2e());
        }
        video_controller_elem.appendChild([
            document.createElement("canvas"),
            e => e.id = "recognition_canvas",
        ].a2e());
        video_controller_elem.appendChild([
            document.createElement("div"),
            e => e.id = "canvas_settings",
        ].a2e());

        // -------------------------------------
        // -------------------------------------

        // 画像処理を実施するcanvasの設定
        this._recognition_canvas = document.getElementById("recognition_canvas");
        this._recognition_canvas.userData = {
            ctx: this._recognition_canvas.getContext("2d", { willReadFrequently: true }),
        };
        // canvasのダブルバッファー
        // requestAnimationFrameによって呼ばれる関数(Aとする)をasyncとしてAの中で
        // awaitをコールすると、Aの途中でシステム側の描画処理が実行されることがあるので
        // 予期しない結果となることがある。そこでこのダブルバッファーではAの中で
        // 描画結果をバッファリングし、requestAnimationFrameによってAがコールされた
        // ときはバッファリングされているものを描画したいcanvasにコピーする。
        // 実際にはバッファリングしているものと描画しているものの2つのバッファが必要なため、実際に描画される
        // canvasと合わせて3つのバッファが必要になる。このcanvas2はそのうち2つを表し、上の変数のcanvasが
        // 実際に描画される3つ目のバッファとなる。
        this._canvas2 = {
            cur_i: 0,
            bak_i: 1,
            cur_ctx: function () {
                return this.ctx[this.cur_i];
            },
            cur_canvas: function () {
                return this.canvas[this.cur_i];
            },
            bak_ctx: function () {
                return this.ctx[this.bak_i];
            },
            bak_canvas: function () {
                return this.canvas[this.bak_i];
            },
            reverse: function () {
                this.cur_i = (this.cur_i + 1) % 2;
                this.bak_i = (this.bak_i + 1) % 2;
            },
            canvas: Array.from(Array(2), e => document.createElement("canvas")),
            update: function (canvas) {
                this.canvas.forEach(e => { e.width = canvas.width; e.height = canvas.height; });
            },
        };
        this._canvas2.ctx = this._canvas2.canvas.map(e => e.getContext("2d", { willReadFrequently: true }));



        // カメラデバイスを表示するHTMLエレメントの生成
        const add_video_element = () => {
            const panel = document.getElementById("video_panel");
            const vno = panel.children.length;
            panel.appendChild([
                document.createElement("video"),
                e => e.id = `video${vno}`,
                e => e.style.visibility = "hidden",
                // file test
                e => e.controls = true,
                e => e.setAttribute("muted", "true"),
                e => e.setAttribute("autoplay", "true"),
                e => e.setAttribute("playsinline", "true"),
            ].a2e());
            panel.appendChild([
                document.createElement("div"),
                e => e.classList.add("video_console"),
            ].a2e());
            panel.appendChild([
                document.createElement("div"),
                e => e.classList.add("video_settings"),
            ].a2e());

            return vno;
        };
        const set_camera_settings_elements = async (vno) => {
            const el = document.querySelector(`#video_panel > .video_settings`);
            Array.from(el?.children).forEach(e => el.removeChild(e));

            // waitFor.finished()が呼ばれるまで、await waitFor.wait()で処理を止める。
            // dispatchEventで発生させたイベントの処理までが終わることを保証する。
            const waitFor = {
                _waiting: true,
                wait: async function () {
                    while (this._waiting) {
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                },
                finished: function () {
                    this._waiting = false;
                }
            }

            el?.appendChild([
                document.createElement("select"),
                e => e.id = `video${vno}_resolutions`,
                ...this._resolutions.map(e => e.join("x")).map(
                    ei => (ej => ej.appendChild([
                        document.createElement("option"),
                        ej => ej.value = ei,
                        ej => ej.textContent = ei,
                    ].a2e()))
                ),
                e => e.addEventListener("change", async e => {
                    // const [w, h] = e.target.value.split("x");

                    await this.set_camera_resolution(e.target.value.split("x"));

                    waitFor.finished();
                }),
            ].a2e());

            const r = [this._videos[vno].settings.width, this._videos[vno].settings.height];
            const t = r.join("x");
            // select elementの選択を設定されたものに変更する。ただし、changeイベントは発行しない。
            // changeイベントを発行すると、なんだかんだでvideo_canvasのサイズが0になってしまう。
            // 詳細は調べていないが、とにかく、javascriptからselectの選択を変更したときは、
            // changeイベントを発行させない方が無難。
            // 2024.01.21
            document.getElementById(`video${vno}_resolutions`).set(t, t,
                a => a.findIndex(e => {
                    const [x, y] = e.value.split("x").map(e => Number(e));
                    return x == r[0] ? y < r[1] : x < r[0];
                })
            );

            // スマートフォンで縦横がPCと逆になる場合、自動で選ばれた解像度を、recognition canvas
            // にも設定できるように tihs._resolutions に入れておく。
            // 2024.03.26
            if (this._resolutions.find(e => e[0] === r[0] && e[1] === r[1]) === undefined) {
                this._resolutions.push(r);
            }

            await waitFor.wait();
        };
        const add_canvas_settings_elements = (vno) => {
            const el = document.getElementById("canvas_settings");
            el.appendChild([
                document.createElement("div"),
                e => e.id = `video${vno}`,
                e => e.classList.add(`video${vno}`),
            ].a2e());
        };
        const set_canvas_settings_elements = (vno, settings) => {
            const el = document.querySelector(`#canvas_settings > .video${vno}`);
            Array.from(el?.children).forEach(e => el.removeChild(e));

            el?.appendChild([
                document.createElement("div"),
                e => e.classList.add(`video${vno}`),
                e => e.textContent = `video${vno}`,

                e => e.appendChild([
                    document.createElement("select"),
                    ei => ei.id = `canvas_video${vno}_resolutions`,
                    ...this._resolutions.map(e => e.join("x")).map(
                        ei => (ej => ej.appendChild([
                            document.createElement("option"),
                            ej => ej.value = ei,
                            ej => ej.textContent = ei,
                        ].a2e()))
                    ),
                    ei => ei.addEventListener("change", async ej => {
                        this.set_recognition_canvas_resolution(ej.target.value.split("x").map(e => Number(e)));
                    }),
                ].a2e()),
            ].a2e());

            const r = this._videos[vno].recognition_canvas_wh;
            const t = (this._params.init_canvas_resolution_index === -1
                ? r : this._resolutions[this._params.init_canvas_resolution_index]).join("x");
            document.getElementById(`canvas_video${vno}_resolutions`).set(t, t,
                a => a.findIndex(e => {
                    const [x, y] = e.value.split("x").map(e => Number(e));
                    return x == r[0] ? y < r[1] : x < r[0];
                }));
        };


        // ブラウザで初めてカメラデバイスを使用するときに、先に許可を得てからでないと
        // カメラデバイス一覧を取得できないため、1つ目のカメラのみ、カメラの
        // セットアップ(reset_video)とタブの生成(createTabs)の間で
        // カメラデバイスの取得(enumerateDevices)を実行する。
        const vno = add_video_element();
        add_canvas_settings_elements(vno);
        const init_recognition_canvas_wh = this._resolutions[this._params.init_canvas_resolution_index];
        this._videos.push(await this._reset_video(document.getElementById(`video${vno}`), undefined, init_recognition_canvas_wh));
        await set_camera_settings_elements(vno, this._videos[vno].settings);
        set_canvas_settings_elements(vno, this._videos[vno].settings);


        // カメラ一覧の取得
        // navigator.mediaDevices.getUserMedia によりユーザの許可を得た後でないと、
        // デバイス一覧は取得できない。
        this._devices = (await navigator.mediaDevices.enumerateDevices())
            .filter((d) => d.kind == "videoinput")
            .sort((a, b) => a.deviceId === this._videos[0].settings.deviceId
                ? -1 : (b.deviceId === this._videos[0].settings.deviceId ? 1 : 0));

        this._elements.video_selects.push(document.getElementById("video_selector").appendChild([
            document.createElement("select"),
            ...this._devices.map(ei => (ej => ej.appendChild([
                document.createElement("option"),
                ej => ej.value = ei.deviceId,
                ej => ej.textContent = ei.label,
            ].a2e()))),
            e => e.addEventListener("change", async e => {
                await this._reset_video(this._videos[0], e.target.value);
            }),
        ].a2e()));

        // canvas位置、サイズの初期設定
        this._set_canvas_size(this._recognition_canvas, this._videos.map(e => e.recognition_canvas_wh));
        this._canvas2.update(this._recognition_canvas);
        const vrect = this._videos[0].getBoundingClientRect();

        // 配信画像を作成するフレーム
        if (this._params.use_video_canvas) {
            this._video_canvas = document.getElementById("video_canvas");
            const wrapped_canvas_info = this.create_wrapped_canvas(this._video_canvas);
            this._video_canvas.userData = {
                ctx: wrapped_canvas_info.ctx,
                wrapped_canvas_info,
            };
            this._set_canvas_pos(this._video_canvas, [vrect.left, vrect.top]);
            this._set_canvas_size(this._video_canvas, this._videos.map(e => e.settings.wh));
            this._draw_info(this._video_canvas);
            const magnifications = this._video_canvas.userData.wh.map((e, i) => e / this._recognition_canvas.userData.wh[i]);
            this._video_canvas.userData.wrapped_canvas_info.set_zoom_range(
                this._recognition_canvas.userData.wh,
                this._video_canvas.userData.wh,
                [magnifications.map(e => e * this._params.zoom_range[0]), magnifications.map(e => e * this._params.zoom_range[1])]);
            this._video_canvas.userData.wrapped_canvas_info.set_zoom({ magnifications });
        }

        return this._videos[0];
    },
    // videoの解像度の変更
    set_camera_resolution: async function (wh) {
        // 複数のカメラを同時に処理するとき、カメラの番号をvnoで指定する。
        // ただし 2024.04.30現在、複数カメラは対応していないので、処理の名残としてvno=0を固定でセットする。
        const vno = 0;
        const p0 = this._videos[vno].srcObject.getVideoTracks()[0].getConstraints();
        await this._videos[vno].srcObject.getVideoTracks()[0].applyConstraints({
            width: { ideal: wh[0] },
            height: { ideal: wh[1] },
        });
        this._videos[vno].settings = this._get_video_settings(this._videos[vno]);
        this._videos[vno].recognition_canvas_wh ??= [this._videos[vno].settings.width, this._videos[vno].settings.height];
        this._set_canvas_size(this._recognition_canvas, this._videos.map(e => e.recognition_canvas_wh));
        this._canvas2.update(this._recognition_canvas);
        if (this._video_canvas !== undefined) {
            this._set_canvas_size(this._video_canvas, this._videos.map(e => e.settings.wh));
            this._draw_info(this._video_canvas);
            const magnifications = this._video_canvas.userData.wh.map((e, i) => e / this._recognition_canvas.userData.wh[i]);
            this._video_canvas.userData.wrapped_canvas_info.set_zoom_range(
                this._recognition_canvas.userData.wh,
                this._video_canvas.userData.wh,
                [magnifications.map(e => e * this._params.zoom_range[0]), magnifications.map(e => e * this._params.zoom_range[1])]);
            this._video_canvas.userData.wrapped_canvas_info.set_zoom({ magnifications });
        }
        this._video_recognition_canvas_on_update?.();
    },
    // recognition canvasの解像度の変更
    set_recognition_canvas_resolution: function (wh) {
        const vno = 0;
        this._videos[vno].recognition_canvas_wh = wh;
        this._set_canvas_size(this._recognition_canvas, this._videos.map(e => e.recognition_canvas_wh));
        this._canvas2.update(this._recognition_canvas);
        const magnifications = this._video_canvas?.userData.wh.map((e, i) => e / this._recognition_canvas.userData.wh[i]);
        this._video_canvas?.userData.wrapped_canvas_info.set_zoom_range(
            wh, this._video_canvas.userData.wh,
            [magnifications.map(e => e * this._params.zoom_range[0]), magnifications.map(e => e * this._params.zoom_range[1])]);
        this._video_canvas?.userData.wrapped_canvas_info.set_zoom({ magnifications });
        this._video_recognition_canvas_on_update?.();
    },
    // 使用するカメラデバイスを選択する。
    set_device: function ({ deviceId, label, device_index, video_element_index }) {
        if (deviceId === undefined && label === undefined && device_index === undefined) {
            return;
        }
        device_index ??= this._devices.findIndex(e => {
            return e.deviceId === deviceId || e.label === label;
        });
        video_element_index ??= 0;
        this._elements.video_selects[video_element_index].selectedIndex = device_index;
        this._reset_video(this._videos[video_element_index], this._devices[device_index].deviceId);
    },
    // get_video_canvas_ctx: function () {
    //     return this._video_canvas.userData.ctx;
    // },
    // get_recognition_canvas_ctx: function () {
    //     return this._recognition_canvas.userData.ctx;
    // },
    get_recognition_wh: function () {
        return [this._recognition_canvas.width, this._recognition_canvas.height];
    },
    // 最後にrenderしたカメラの映像データを取得する。
    // 出力: ImageData, https://developer.mozilla.org/ja/docs/Web/API/ImageData
    get_recognition_imageData: function () {
        return this._recognition_canvas.userData.imageData;
    },
    get_video: function () {
        return this._videos[0];
    },
    render: function () {
        // 現在の描画用のctxにvideoの画像をコピー
        const ctx0 = this._canvas2.cur_ctx();
        this._videos.reduce((w, v) => {
            const wh0 = [v.settings.width, v.settings.height];
            if (wh0[0] != 0 && wh0[1] != 0) {
                const imageData = this._videoImage.imageDataFromMat(
                    this._videoImage.resize_mat(
                        this._videoImage.capture_mat(v, wh0), v.recognition_canvas_wh
                    )
                );
                ctx0.putImageData(imageData, w, 0);
            }
            return w + v.recognition_canvas_wh[0];
        }, 0);

        // 1つ前の描画結果を描画用のcanvasにコピー
        this._recognition_canvas.userData.ctx.drawImage(this._canvas2.bak_canvas(), 0, 0);
        this._recognition_canvas.userData.imageData = this._canvas2.bak_ctx().getImageData(0, 0
            , this._recognition_canvas.width, this._recognition_canvas.height);
        // this._video_canvas?.userData.drawImage();
        this._video_canvas?.userData.ctx.clearRect(0, 0, ...this._videos[0].settings.wh);
        this._video_canvas?.userData.ctx.drawImage(this._videos[0], 0, 0, ...this._videos[0].settings.wh,
            0, 0, ...this._recognition_canvas.userData.wh
        );

        // 付加情報の描画
        if (this._video_canvas !== undefined) {
            this._draw_info(this._video_canvas);
        }

        this._canvas2.reverse();
    },
    video_canvas: function () {
        return this._video_canvas;
    },
    video_canvas_ctx: function () {
        return this._video_canvas?.userData.ctx;
    },
    video_canvas_wh: function () {
        return this._video_canvas?.userData.wh;
    },
    video_canvas_pos: function () {
        return this._get_canvas_pos(this._video_canvas);
    },
    recognition_canvas: function () {
        return this._recognition_canvas;
    },
    recognition_canvas_wh: function () {
        return this._recognition_canvas.userData.wh;
    },
    recognition_canvas_pos: function () {
        return this._get_canvas_pos(this._recognition_canvas);
    },
    canvas2_bak: function () {
        return [this._canvas2.bak_canvas()
            , this._canvas2.bak_ctx().getImageData(0, 0, this._recognition_canvas.width, this._recognition_canvas.height)]
    },
    devices: function () {
        return this._devices;
    },
    reset_video: async function (deviceId) {
        return await this._reset_video(this._videos[0], deviceId);
    },

    // canvasの位置、サイズの変更と、このindex.htmlで実行する描画(CanvasXXXコンポーネントからの描画もある)
    _draw_info: function (canvas) {
        // 枠の表示
        const ctx = canvas.userData.ctx;
        ctx.userData.zoom_enabled = false;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${[25, 25, 112, 0.5]}`;
        ctx.lineWidth = 15;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);

        // カラーバーを表示してみるテスト
        Colors.getColors(10).forEach((e, i) => {
            ctx.fillStyle = `rgb(${e})`;
            ctx.fillRect(20 + 20 * i, 20, 20, 20);
        });

        ctx.userData.zoom_enabled = true;
    },
    _set_canvas_size: function (canvas, whs) {
        canvas.width = whs.reduce((a, e) => a + e[0], 0);
        canvas.height = whs.reduce((a, e) => Math.max(a, e[1]), 0);
        Object.assign(canvas.userData ?? {}, { wh: [canvas.width, canvas.height] });
    },
    _set_canvas_pos: function (canvas, p) {
        ["left", "top"].forEach((e, i) => { canvas.style[e] = Math.round(p[i]) + "px"; });
    },
    _get_canvas_pos: function (canvas) {
        const rect = canvas.getBoundingClientRect();
        return [rect.left + window.scrollX, rect.top + window.scrollY];
    },
    // 表示中の動画設定を取得する。
    _get_video_settings: function (video) {
        const settings = video.srcObject?.getTracks().filter(e => e.kind === "video")[0].getSettings() ??
            { width: video.videoWidth || video.width, height: video.videoHeight || video.height };
        settings.wh = ["width", "height"].map(e => Number(settings[e]));
        settings.aspectRatio ??= settings.wh[0] / settings.wh[1];
        const to_log_video_settings = ["aspectRatio", "width", "height", "frameRate"];
        const camera_parameters = Object.entries(settings).filter(e => to_log_video_settings.includes(e[0])).join(",");
        video.parentElement.querySelector(".video_console").textContent = camera_parameters
            + `, (debug clientWidth,Height) ${document.body.clientWidth},${document.body.clientHeight}`;
        return settings;
    },
    // videoタグに表示するカメラを切り替える。videoエレメントとデバイスidを指定する内部関数
    _reset_video: async function (video, deviceId, init_recognition_canvas_wh) {
        video.srcObject?.getTracks().forEach(e => e.stop());
        video.srcObject = null;


        const resos = this._resolutions;
        const reso0 = resos[this._params.init_video_resolution_index];
        const video_opt = {};
        if (reso0 !== undefined) {
            video_opt.width = { ideal: reso0[0], max: Math.max(...resos.map(e => e[0])), min: Math.min(...resos.map(e => e[0])) };
            video_opt.height = { ideal: reso0[1], max: Math.max(...resos.map(e => e[1])), min: Math.min(...resos.map(e => e[1])) };
            video_opt.facingMode = this._params.init_facingMode;
        }

        console.log("request video:" + JSON.stringify(video_opt));
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { ...video_opt, deviceId: { exact: deviceId } },
            zoom: true,
        });
        video.srcObject = stream;
        await video.play();

        video.settings = this._get_video_settings(video);
        video.recognition_canvas_wh ??= (init_recognition_canvas_wh ?? [video.settings.width, video.settings.height]);

        return video;
    },
}
