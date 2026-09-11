/**
 * canvasにpointerを描画する
 */
export const CanvasPointer = {
    _pointers: {},
    _build_pointer: function (uuid) {
        this._pointers[uuid] = {
            set: function (info) {
                Object.assign(this, info);
            },
        };
        return this._pointers[uuid];
    },
    get_pointer: function (uuid) {
// console.log(`${uuid} -- ${JSON.stringify(Object.keys(this._pointers))}`)
        return this._pointers[uuid];
    },
    get_pointer_safe: function (uuid) {
        return this._pointers.hasOwnProperty(uuid) ?
            this.get_pointer(uuid) : this._build_pointer(uuid);
    },
    update_visibility: function (t) {
        t ??= Date.now();
        Object.values(this._pointers).filter(p => p.expiration_ms < t).forEach(p => p.visibility = false);
    },
    draw: function (ctx) {
        Object.values(this._pointers).filter(p => p.visibility).forEach(p => {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.arc(...p.pt, 10, 0, Math.PI * 2);
            ctx.stroke();
        })
    }
}