/*
lil_gui (https://lil-gui.georgealways.com/)
画面右上にフローティングのメニューを表示するライブラリ

以下の仕様のデータによってlil_guiにメニューを登録する処理をlil_guiに追加する。
*/
export const lil_gui_lib = {
    init: async function ({ libs_backup_folder } = {}) {
        libs_backup_folder ??= "../libs_backup";

        // tippyのスタイルをここで定義する。
        // https://atomiks.github.io/tippyjs/v6/themes/
        const style_tag = document.createElement("style");
        style_tag.innerText = `
        .tippy-box[data-theme~='my_tippy']{
            background-color: gray;
            color: white;
        }
        .tippy-box[data-theme~='my_tippy'][data-placement^='top'] > .tippy-arrow::before {
            border-top-color: gray;
        }
        .tippy-box[data-theme~='my_tippy'][data-placement^='bottom'] > .tippy-arrow::before {
            border-bottom-color: gray;
        }
        .tippy-box[data-theme~='my_tippy'][data-placement^='left'] > .tippy-arrow::before {
            border-left-color: gray;
        }
        .tippy-box[data-theme~='my_tippy'][data-placement^='right'] > .tippy-arrow::before {
            border-right-color: gray;
        }
        `;
        document.getElementsByTagName("head")[0].appendChild(style_tag);

        // 吹き出しのライブラリ tippy をロードする。
        // https://atomiks.github.io/tippyjs/

        // await this.load_script("https://unpkg.com/@popperjs/core@2");   // -> redirect to "popper.min.js"
        // await this.load_script("https://unpkg.com/tippy.js@6");         // -> redirect to "tippy-bundle.umd.min.js"
        // 上記のエラーのため下を使う
// console.log(`${libs_backup_folder}/lil_gui.backup/popper.min.js`)
        await this.load_script(`${libs_backup_folder}/lil_gui.backup/popper.min.js`);
        await this.load_script(`${libs_backup_folder}/lil_gui.backup/tippy-bundle.umd.min.js`);

        return this;
    },
    set: async function (gui) {
        gui.add_all = this.add_all;
    },
    add_all: function ({ params = undefined, folder = undefined, enable_onchange = true }) {
        folder = folder ?? this;

        // メニュー全体に対するonChangeをコールするメソッドを、paramsの中に埋め込んでおく。
        params.gui_on_change = (property, value) => {
            this._onChange({ object: params, property: property, value: value, controller: this.controllersRecursive().filter(c => c.object === params && c.property === property)?.[0] });
        };
        Object.keys(params).filter(e => typeof (params[e]) !== "object" && e !== "gui_on_change").forEach(e => {
            let el = undefined;
            if (params.dropdowns !== undefined) {
                el = folder.add(params, e, params.dropdowns[e]);
            } else {
                el = folder.add(params, e);
            }
            el = el.listen();
            if (params.hiddens?.includes(e)) {
                el.hide();
            }
            if (params.disables?.includes(e)) {
                el = el.disable();
            }
            if (enable_onchange && params.onChanges !== undefined) {
                el = el.onChange(params.onChanges[e]?.bind(params));
            }
            if (params.names?.[e] !== undefined) {
                el = el.name(params.names[e]);
            }
            if (params.details?.[e] !== undefined) {
                el.domElement.firstElementChild.style.setProperty("pointer-events", "auto", "important");
                tippy(el.domElement.firstElementChild, {
                    content: params.details[e],
                    trigger: "click",
                    placement: "top",
                    theme: "my_tippy",
                });
            }
        });
        return this;
    },
    load_script: function (fname) {
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
};
