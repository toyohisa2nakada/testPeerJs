/**
 * smartphoneで画面一杯のカメラ画像を表示する。
 * 
 * このスクリプト内で、div id=smartphone_camera_contentを作成し、その下にcanvasを配置する。
 * camera.jsで作成するvideo_canvasは使用しない。
 */

export const smartphone_camera = {
    _params: {
        // 画面一杯に表示するdiv要素のid、このdivの下にcanvasを配置する。
        content_elem_id: "smartphone_camera_content",
        // カメラ選択ボタンのクラス属性、以下のcreate_camera_device_buttonsがfalseの場合は、ボタンは表示されない。
        button_elem_class: "smartphone_camera_button",
        // カメラ選択ボタンの表示/非表示
        create_camera_device_buttons: false,

        // カメラの解像度
        // default_camera_resolution: [8192, 6114],
        // default_camera_resolution: [4096, 3072],
        // default_camera_resolution: [2048, 1536],
        default_camera_resolution: [1024, 768],
        // default_camera_resolution: [256, 192],

        // recognition canvasの長い方の辺の長さ
        // スマホの場合、例えばカメラの解像度を1024,768と指定しても、
        // 縦持ち、横持ちでの関係で勝手に 768,1024に変えられることがある。
        // そこに対応するために、recognition canvasは長い方の辺の長さだけを
        // 設定して、カメラの実際に設定された解像度から長辺が以下の数値になるように
        // アスペクト比を保持しながら変換する。
        // default_recognition_canvas_long_side: 1024,
        default_recognition_canvas_long_side: 512,
        // default_recognition_canvas_long_side: 256,
        // default_recognition_canvas_long_side: 128,
    },
    _elems: {
        content: undefined,
        canvas: undefined,
    },
    _settings: {
        camera: undefined,
        canvas: undefined,
    },
    _camera: undefined,
    _wrapped_canvas: undefined,

    // html全体のセットアップ
    _html_setup: function () {
        // htmlのセットアップ
        const head_elem = document.getElementsByTagName("head")[0];
        [
            document.createElement("style"),
            e => e.innerHTML = `html,body{height:100%;margin:0;}
            #${this._params.content_elem_id}{height:100vh;}
            .${this._params.button_elem_class}{height:40px}`,
            e => head_elem.appendChild(e),
        ].a2e();
        [
            document.createElement("meta"),
            e => e.setAttribute("name", "viewport"),
            e => e.setAttribute("content", "width=device-width, initial-scale=1.0"),
            e => head_elem.appendChild(e),
        ].a2e();
    },
    _paint_sample: function () {
        const { canvas } = this._elems;
        const { ctx } = this._wrapped_canvas ??
            { ctx: this._elems.canvas.getContext("2d", { willReadFrequently: true }) };
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ff0000";
        [...Array(5).keys()].forEach(i => {
            ctx.beginPath();
            ctx.moveTo(i * 100, 0);
            ctx.lineTo(i * 100, 100);
            ctx.stroke();
        });
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
    },
    // html要素のセットアップ
    _elem_setup: function () {
        this._elems.content = [
            document.createElement("div"),
            e => e.id = this._params.content_elem_id,
            e => document.body.appendChild(e),
        ].a2e();

        // 画面一杯のキャンバス
        this._elems.canvas = [
            document.createElement("canvas"),
            e => e.width = document.body.clientWidth,
            e => e.height = document.body.clientHeight,
            e => e.style.position = "absolute",
            e => e.style.left = "0",
            e => e.style.top = "0",
            // e => e.style.zIndex = "-1",
            e => this._elems.content.appendChild(e),
        ].a2e();
        // this._elems.ctx = this._elems.canvas.getContext("2d");
        this._settings.canvas = {
            aspectRatio: this._elems.canvas.width / this._elems.canvas.height,
            wh_css: [this._elems.canvas.width, this._elems.canvas.height],
        };
    },
    // カメラデバイスを選択するボタンの配置
    _camera_device_buttons_setup: function (devices) {
        devices.forEach(d => {
            [document.createElement("button"),
            e => e.textContent = d.label,
            e => e.classList.add(this._params.button_elem_class),
            e => e.style.position = "relative",
            e => e.style.zIndex = "2",
            e => this._elems.content.appendChild(e),
            ].a2e().addEventListener("click", async e => {
                await this.reset_camera_device(d.deviceId);
            });
        });
    },
    _debug_str_p: [64, 96],
    _debug_str: "debug",
    render: function () {
        this._camera.render();
        const video = this._camera?.get_video();
        const { ctx } = this._wrapped_canvas;

        ctx.clearRect(0, 0, ...this._settings.canvas.wh);
        ctx.drawImage(video, 0, 0, ...this._settings.camera.wh, 0, 0, ...this._settings.canvas.recognition_canvas_wh);
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#00ff00";
        ctx.strokeRect(0, 0, ...this._settings.canvas.recognition_canvas_wh);

        // 描画テスト
        /*
        const c = this._debug_str_p;
        ctx.fillStyle = "blue";
        ctx.font = "32px Arial";
        ctx.fillText(this._debug_str, ...c);
        ctx.beginPath();
        ctx.arc(...c, 1, 0, 2 * Math.PI);
        ctx.fill();
        */
    },
    get_imageData: function () {
        return this._camera?.get_recognition_imageData();
    },
    get_output_canvas: function () {
        return {
            elem: this._elems.canvas,
            ctx: this._wrapped_canvas.ctx,
            settings: this._settings.canvas,
        };
    },
    // get_output_ctx: function () {
    //     return this._elems.ctx;
    // },
    recognition_canvas: function () {
        return this._camera.recognition_canvas();
    },
    add_html_element: function (elem) {
        elem.style.position = "relative";
        elem.style.zIndex = "2";
        this._elems.content.appendChild(elem);
    },
    get_camera_devices: function () {
        return this._camera.devices();
    },
    reset_camera_device: async function (deviceId) {
        // cameraの解像度とcanvasの解像度
        //
        // 最初はdevicePixelRatioを考慮して画面に収まらないカメラの解像度の場合、
        // recognition canvasのサイズを表示用canvasと同じ密度にしていた。
        // しかしopencv.jsによるvideoからrecognition canvasへのリサイズが思った以上に
        // 負荷がかかり、また相対的に、canvas.widthとcanvas.style.widthの違いによる
        // 描画のオーバーヘッドがないことから、基本はvideoのサイズとrecognition canvasの
        // サイズを一緒にし、そのrecognition canvasに合わせた密度の表示用キャンバスとした。
        const update_canvas_reso = async (video_settings, canvas_settings, canvas_elem) => {
            const pxr = window.devicePixelRatio;
            // const cam = [0, 0];
            const cam = video_settings.wh;
            const cav = [0, 0];
            if (canvas_settings.aspectRatio <= video_settings.aspectRatio) {
                // cam[0] = Math.round(Math.min(video_settings.wh[0], canvas_settings.wh_css[0] * pxr));
                // cam[1] = Math.round(cam[0] / video_settings.aspectRatio);
                cav[0] = cam[0];
                cav[1] = Math.round(cav[0] / canvas_settings.aspectRatio);
            } else {
                // cam[1] = Math.round(Math.min(video_settings.wh[1], canvas_settings.wh_css[1] * pxr));
                // cam[0] = Math.round(cam[1] * video_settings.aspectRatio);
                cav[1] = cam[1];
                cav[0] = Math.round(cav[1] * canvas_settings.aspectRatio);
            }
            const dxy = cav.map((e, i) => (e - cam[i]) / 2);

            // await this._camera.set_recognition_canvas_resolution(cam);
            canvas_elem.style.width = `${canvas_settings.wh_css[0]}px`;
            canvas_elem.style.height = `${canvas_settings.wh_css[1]}px`;
            canvas_elem.width = cav[0];
            canvas_elem.height = cav[1];

            // setting情報の更新
            this._settings.camera.aspectRatio = cam[0] / cam[1];
            this._settings.camera.width = cam[0];
            this._settings.camera.height = cam[1];
            this._settings.camera.wh = cam;
            this._settings.canvas.aspectRatio = cav[0] / cav[1];
            this._settings.canvas.wh = cav;
            this._settings.canvas.wh_css_ratio = this._settings.canvas.wh[0] / this._settings.canvas.wh_css[0];
            this._settings.canvas.camera_wh = this._settings.camera.wh;
            this._settings.canvas.camera_wh_css = this._settings.camera.wh.map(e => e / this._settings.canvas.wh_css_ratio);
            this._settings.canvas.recognition_canvas_wh = this._camera.recognition_canvas_wh();
        };
        const video_info = await this._camera.reset_video(deviceId);
        await update_canvas_reso(video_info.settings, this._settings.canvas, this._elems.canvas);


        // recognition canvasのセット
        const video2recog_canvas_ratio = this._params.default_recognition_canvas_long_side /
            Math.max(...video_info.settings.wh);
        this._settings.canvas.recognition_canvas_wh = video_info.settings.wh.map(e => e * video2recog_canvas_ratio);
        await this._camera.set_recognition_canvas_resolution(this._settings.canvas.recognition_canvas_wh);

        // css ratio のセット
        this._wrapped_canvas?.set_settings({ wh_css_ratio: this._settings.canvas.wh[0] / this._settings.canvas.wh_css[0] })

        return video_info;
    },
    init: async function () {
        [Array, "a2e"].reduce((a, e) => {
            a.prototype[e] = function () { return this.reduce((e, f) => { f(e); return e; }); };
            Object.defineProperty(a.prototype, e, { enumerable: false });
        });

        // htmlのセットアップ
        this._html_setup();
        await new Promise(resolve => {
            setTimeout(() => { this._elem_setup(); resolve(); }, 0);
        });
        this._paint_sample();


        // camera準備
        const { camera } = await import(`./camera.js`);
        this._camera = camera;
        // cameraの中でcamera._reset_videoが呼ばれ、ここからcamera.reset_videoを呼び出すので
        // _reset_videoは2回呼び出される。iPhoneでなぜか1回のreset_videoで適切にcanvasの
        // 解像度が設定されない。androidの方はよく確認していないので分からない。
        this._settings.camera = (await camera.init({
            video_controller_elem: [
                document.createElement("div"),
                e => e.style.display = "none",
                e => document.body.appendChild(e),
            ].a2e(),
            video_resolution: this._params.default_camera_resolution,
            use_video_canvas: false,
        })).settings;
        const video_info = await this.reset_camera_device(this._settings.camera.deviceId);
        if (this._params.create_camera_device_buttons === true) {
            this._camera_device_buttons_setup(camera.devices());
        }

        // ブラウザの表示拡大縮小の抑制
        document.addEventListener("touchmove", e => e.preventDefault(), { passive: false });

        this._wrapped_canvas = this._camera.create_wrapped_canvas(this._elems.canvas);
        const magnifications = this._settings.camera.wh.map((e, i) => e / this._settings.canvas.recognition_canvas_wh[i]);

        this._wrapped_canvas.set_zoom_range(
            this._settings.canvas.recognition_canvas_wh,
            this._settings.camera.wh,
            [magnifications.map(e => e * this._camera._params.zoom_range[0]), magnifications.map(e => e * this._camera._params.zoom_range[1])]);
        this._wrapped_canvas.set_zoom({ magnifications });
        this._wrapped_canvas.add_ev_handlers(this.get_ev_handlers.bind(this))
        this._wrapped_canvas.set_settings({ wh_css_ratio: this._settings.canvas.wh[0] / this._settings.canvas.wh_css[0] })

        // document.body.addEventListener("keyup", e => {
        //     this._wrapped_canvas.set_zoom({ pin: this._debug_str_p.map(e => e * 4), d_magnifications: [2, 2] })
        // });

        return video_info;
    },
    get_ev_handlers: function () {
        let prev_delta = undefined;
        let prev_scale = undefined;
        const handler = (name, ev) => {
            if (name === "pinchstart") {
                prev_delta = undefined;
                prev_scale = undefined;
            } else if (name === "pinchmove") {
                const { wh_css_ratio } = this._settings.canvas;
                this._wrapped_canvas.set_lt({
                    d_lt: ev.userData.delta0.map((e, i) => wh_css_ratio * (e - (prev_delta?.[i] ?? 0))),
                });
                this._wrapped_canvas.set_zoom({
                    pin: ev.userData.center0.map(e => e * wh_css_ratio),
                    d_magnifications: [...Array(2).keys()].map(_ => ev.scale / (prev_scale ?? 1)),
                });
                prev_delta = ev.userData.delta0;
                prev_scale = ev.scale;
                this._debug_str = JSON.stringify(ev.userData.center0.map(e => e * wh_css_ratio));
            }
        };
        return ["pinchstart", "pinchmove", "pinchend"].map(
            evname => [evname, ev => handler(evname, ev)]
        );
    },
    // 表示用キャンバス上のタッチイベントを登録する。
    add_ev_handlers: function (get_ev_f) {
        return this._wrapped_canvas.add_ev_handlers(get_ev_f);
    },
}
