/*
 htmlのvideoタグから画像を取得し、リサイズ等の処理を実施する。
*/
export const VideoImage = {
    load_script: function (fname) {
        return new Promise((resolve, reject) => {
            const sc = document.createElement("script");
            sc.type = "text/javascript";
            sc.src = fname;
            sc.onload = e => resolve();
            sc.onerror = e => reject(e);
            const s = document.getElementsByTagName("script")[0];
            s.parentNode.insertBefore(sc, s);
        });
    },
    init: async function () {
        // このmjsファイルのパスを取得して同階層にあるopencvを読み込む
        // const folder = import.meta.url.match(/^https?:\/\/[^\/]+(\/(?:[^?#]*\/)*)([^?#]+)/)[1];
        // await this.load_script(`${folder}opencv.4.9.0.js`);
        await this.load_script("https://activecamera.pecode.com/libs/webcamera/opencv.4.9.0.js");
        // console.log(`loaded opencv ${cv}`);
        return 0;
    },
    // { id: {cap:,src:,dst}} unknownはvideo idが無い場合のdstバッファ用として使用する。
    caps: { "unknown": { dst: undefined } },
    // videoからmat形式で画像を取得する。取得したmatは同じメモリ領域を使いまわすため、deleteの必要はない。
    capture_mat: function (video, wh0) {
        // videoのwidth,heightにサイズを指定していないとVideoCapture.readが実行されない。
        if (video.width === undefined || video.width != wh0[0] || video.height === undefined || video.height != wh0[1]) {
            video.width = wh0[0]
            video.height = wh0[1];
            const src = new cv.Mat(wh0[1], wh0[0], cv.CV_8UC4);
            src.video_id = video.id;
            this.caps[video.id] = { cap: new cv.VideoCapture(video), src: src, dst: src };
        }
        // let src = new cv.Mat(wh0[1], wh0[0], cv.CV_8UC4);
        const src = this.caps[video.id].src;
        this.caps[video.id].cap.read(src);
        return src;
    },
    // videoからimageDataの形式で画像を取得する。
    capture: function (video, wh0) {
        const src = this.capture_mat(video, wh0);
        return this.imageDataFromMat(src);
        // const imageData = new ImageData(new Uint8ClampedArray(src.data), src.cols, src.rows);
        // return imageData;
    },
    // mat形式の画像(src)をwh1のサイズにリサイズする。
    resize_mat: function (src, wh1) {
        let dst = undefined;
        if ([src.cols, src.rows].every((e, i) => e == wh1[i])) {
            dst = src;
        } else {
            const id = src.video_id ?? "unknown";
            if (this.caps[id].dst === undefined || this.caps[id].dst.cols !== wh1[0] || this.caps[id].dst.rows !== wh1[1]) {
                this.caps[id].dst = new cv.Mat();
            }
            dst = this.caps[id].dst;
            const dsize = new cv.Size(...wh1);
            cv.resize(src, dst, dsize, 0, 0, cv.INTER_AREA);
        }
        return dst;
    },
    // imageData形式の画像(imageData)をwh1([w,h])のサイズにリサイズする。
    resize: function (imageData, wh1) {
        let src = cv.matFromImageData(imageData);
        const dst = this.resize_mat(src, wh1)
        const dst_imageData = new ImageData(new Uint8ClampedArray(dst.data), dst.cols, dst.rows);
        src.delete();
        return dst_imageData;
    },
    // matからimageDataに変換する。
    imageDataFromMat: function (src) {
        return new ImageData(new Uint8ClampedArray(src.data), src.cols, src.rows);
    },
    // imageDataからmatに変換する。mat使用後にdeleteを呼び出す必要がある。
    // matFromImageData: function (imageData){
    //     const mat = new cv.Mat(imageData.height,imageData.width,cv.CV_8UC4);
    //     mat.data.set(new Uint8Array(imageData.data));
    //     return mat;
    // },

    /*
    buffers: {
    },
    // 最後に追加する
    push: function (id, imageData) {
        this.buffers[id] ??= [];
        this.buffers[id].push(imageData);
    },
    // 最後の要素を取得して、配列からその要素を削除する。
    pop: function (id) {
        return this.buffers[id]?.pop();
    },
    // 最初の要素を取得して、配列からその要素を削除する。
    shift: function (id) {
        return this.buffers[id]?.shift();
    },
    // 指定された要素を取得する。要素は削除されない。
    get: function (id, idx) {
        return this.buffers[id][idx];
    },
    // 指定位置に要素をセットする。
    set: function (id, idx, imageData) {
        this.buffers[id] ??= [];
        this.buffers[id][idx] = imageData;
    },
    // 最初の要素を取得する。要素の削除は行われない。
    first: function (id) {
        return this.length(id) === 0 ? undefined : this.get(id, 0);
    },
    // 最後の要素を取得する。要素の削除は行われない。
    last: function (id) {
        return this.length(id) === 0 ? undefined : this.get(id, this.length(id) - 1);
    },
    // 要素数を取得する。
    length: function (id) {
        return this.buffers[id]?.length ?? 0;
    },
    // 配列をクリアする。
    clear: function (id) {
        this.buffers[id] = [];
    },
    */
};
