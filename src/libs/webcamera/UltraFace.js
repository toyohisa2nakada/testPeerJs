/*
3Dスイカゲームでフロントカメラで顔の位置を検出して、3D空間の視点を変更することを試みる。
モバイルで動作可能としたいため onnxのモデルを検索する。

onnx model zoo というモデルを公開しているポータルサイトをチェックした。
https://github.com/onnx/models?tab=readme-ov-file#body_analysis


軽量なモデルと説明されているUltrafaceを試す。
https://github.com/onnx/models/tree/main/validated/vision/body_analysis/ultraface


モデルは画像サイズが小さい320x240の以下の2つを試した。
version-RFB-320
version-RFB-320-int8
どちらも入力データはfloat32のようである。

version-RFB-320は読み込み時に大量のワーニングが出るが動作する。
そしてversion-RFB-320-int8よりも速い。
*/

export const UltraFace = {
    _model: undefined,
    _params: {
        // UltraFaceの入力画像はたぶん固定
        wh: [320, 240],
    },

    // スクリプトの動的読み込み
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

    // モデルの読み込み: fname 読み込み機械学習ファイル名
    _load_model: async function (fname) {
        console.log("loading ort.min.js");
        await this._load_script("https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js");
        console.log(`loading ${fname}`);
        return await ort.InferenceSession.create(fname);
    },

    init: async function () {
        const folder = import.meta.url.match(/^https?:\/\/[^\/]+(\/(?:[^?#]*\/)*)([^?#]+)/)[1];
        // folder += folder.endsWith("/") ? "" : "/";
        // モデル名にint8とあるものは、動作しなかった。原因不明。
        // version-RFB-320は読み込み時に大量のワーニングが出るが動作はする。
        // デバッグに支障をきたすので、console.errorを一時的に上書きして出力を抑制する。
        const bk = console.error;
        console.error = function(){};
        this._model = await this._load_model(`${folder}version-RFB-320.onnx`);
        console.error = bk;
    },
    // faceのbboxは320x240ピクセルにおけるbbox位置の比率で表される。
    // この関数は、その比率の値を、320x240に切り取る前の画像（通常はキャンバスサイズ）
    // の比率に変換する計算を行う。切り抜きはpredict無いで行われている中心部分を抜き出す
    // ことを前提としている。
    rescale_ratio: function (faces, wh) {
        const padding = wh.map((e,i) => Math.trunc((e - this._params.wh[i]) / 2));
        faces.forEach(face => {
            face.bbox = face.bbox.map((e, i) =>
                (this._params.wh[i % 2] * e + padding[i % 2]) / wh[i % 2]);
        });
        return faces;
    },
    // 入力 ImageData [横,縦,チャネル4], 入力データがモデルの入力の 320x240 よりも大きい場合、
    // 320x240の部分が抽出される。
    // 出力 2つのクラス(0大きいボックス, 1小さいbox)のスコアとbox
    predict: async function (imageData) {
        const data = new Uint8ClampedArray(this._params.wh.reduce((a, e) => a * e) * 4);
        const x0_w = [Math.trunc((imageData.width - this._params.wh[0]) / 2), this._params.wh[0]];
        const y0_h = [Math.trunc((imageData.height - this._params.wh[1]) / 2), this._params.wh[1]];
        for (let y = y0_h[0]; y < y0_h[0] + y0_h[1]; y += 1) {
            for (let x = x0_w[0]; x < x0_w[0] + x0_w[1]; x += 1) {
                const p0 = y * imageData.width + x;
                const p1 = (y - y0_h[0]) * x0_w[1] + (x - x0_w[0]);
                for (let ch = 0; ch < 4; ch += 1) {
                    data[p1 * 4 + ch] = imageData.data[p0 * 4 + ch];
                }
            }
        }
        return await this._predict(data);
    },
    // 入力 [チャネル3,縦240,横320]の Uint8ClampedArray
    // 出力 2つのクラス(0大きいボックス, 1小さいbox)のスコアとbox
    _predict: async function (data) {
        const float32array = new Float32Array(this._params.wh[0] * this._params.wh[1] * 3);
        for (let y = 0; y < this._params.wh[1]; y += 1) {
            for (let x = 0; x < this._params.wh[0]; x += 1) {
                const pi = y * this._params.wh[0] + x;
                for (let i = 0; i < 3; i += 1) {
                    float32array[pi + i * this._params.wh[0] * this._params.wh[1]] = (data[pi * 4 + i] - 127) / 128;
                }
            }
        }
        const tensor = new ort.Tensor("float32", float32array, [1, 3, this._params.wh[1], this._params.wh[0]]);
        const result = await this._model.run({ [this._model.inputNames?.[0]]: tensor });

        // The model outputs two arrays (1 x 4420 x 2) and (1 x 4420 x 4) of scores(多分2クラスのそれぞれのscore) and boxes(corner-form).
        let max = [{ index: -1, score: 0 }, { index: -1, score: 0 }];
        for (const i in [...Array(4420).keys()]) {
            for (let j = 0; j < 2; j += 1) {
                if (result.scores.data[i * 2 + j] > max[j].score) {
                    max[j].score = result.scores.data[i * 2 + j];
                    max[j].index = Number(i);
                }
            }
        }
        for (let j = 0; j < 2; j += 1) {
            max[j].bbox = result.boxes.data.slice(max[j].index * 4, (max[j].index + 1) * 4);
        }
        return max;
    }

}