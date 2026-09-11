
import * as firestore from "./firestore.js";

const RTC_params = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};
/*
 * 接続要求側 (接続のofferを送る側, offer送信後にanswerの書き込みを待つ)
 */
export async function connect(params) {
    const pc = new RTCPeerConnection(RTC_params);
    pc.addEventListener('iceconnectionstatechange', () => {
        params.print_debug_console?.(`ice ${pc.iceConnectionState}`);

        // if (pc.iceConnectionState === 'connected') {
        //     console.log('✅ ICE接続成功！DataChannel開放間近...');
        // }
    });
    const show_connected_ip = async () => {
        const stats = await pc.getStats();
        let activePair = null;
        let localCandidate = null;
        let remoteCandidate = null;

        stats.forEach(report => {
            if (report.type === "candidate-pair" && report.state === "succeeded") {
                activePair = report;
            }
        });

        if (!activePair) {
            console.log("Succeeded candidate-pair not found.");
            return;
        }

        const localId = activePair.localCandidateId;
        const remoteId = activePair.remoteCandidateId;

        stats.forEach(report => {
            if (report.id === localId) {
                localCandidate = report;
            }
            if (report.id === remoteId) {
                remoteCandidate = report;
            }
        });

        if (localCandidate && remoteCandidate) {
            console.log("Local IP:", localCandidate.ip || localCandidate.address);
            console.log("Remote IP:", remoteCandidate.ip || remoteCandidate.address);
        } else {
            console.log("Candidate details not found.");
        }
    }
    return new Promise(async (resolve, reject) => {
        await firestore.clear({ docname: params.room_id })
        const channel = pc.createDataChannel("default");
        channel.onopen = () => {
            params.print_debug_console?.(`channel open`);
            show_connected_ip();
            // console.log("opened");
            firestore.clear({ docname: params.room_id })
            resolve(channel);
        }
        channel.onclose = () => {
            params.print_debug_console?.(`channel closed`);
            console.log("closed");
        }
        channel.onerror = (error) => {
            params.print_debug_console?.(`channel error ${error}`);
        }

        pc.onicecandidate = async e => {
            // console.log("connect", JSON.stringify(e))
            if (e.candidate === null) {
                // console.log("all ice candidate received");
                await firestore.save(params.room_id, {
                    offer: JSON.stringify(pc.localDescription)
                })
                params.on_sender_ready?.();
                params.print_debug_console?.(`pc st. af. ice ${pc.signalingState}`);
            }
        }
        try {
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer);
        } catch (err) {
            reject(err);
        }

        firestore.listen({
            docname: params.room_id,
            listener: async (docid, docdata) => {
                params.print_debug_console?.(`firestore listened ${docid} ${JSON.stringify(docdata.answer ?? "").substring(0, 10)}`)
                // params.print_debug_console?.(`  ${JSON.stringify(docdata)}`)
                if (docdata.answer === undefined) {
                    return;
                }
                const answer = JSON.parse(docdata.answer);
                try {
                    params.print_debug_console?.(`pc st. be. r. ${pc.signalingState}`);
                    await pc.setRemoteDescription(answer);
                    params.print_debug_console?.(`pc st. af. r. ${pc.signalingState}`);
                } catch (err) {
                    reject(err);
                }
            },
            print_debug_console: params.print_debug_console,
        });
    })
}

/*
 * 接続受け入れ側 (answerを返す側、ただofferを待つ処理があるので先にlistenしていても良い)
 * firestoreのコレクションで接続要求(offer)の書き込みを監視する。
 * 1つのofferは1つのfirestoreのドキュメントで管理される。ドキュメントの中には、offer,answer,created_dateのフィールドが作られる。
 * connectionが確立した時点で、そのドキュメントは削除される。
 * ドキュメントの名前は、ルームIDのように接続する端末間で共有する合言葉とする。ただデフォルトではlistenはどのルームIDでも受け付けるとする。
 */
export async function listen(params) {
    const pc = new RTCPeerConnection(RTC_params);
    let room_id = params?.room_id;
    return new Promise(async (resolve, reject) => {
        let timer_id = undefined;
        firestore.listen({
            docname: params?.room_id,
            listener: async (docid, docdata) => {
                // console.log(docid)
                // console.log(docdata.created_date)
                if (params?.connection_expiry !== undefined && docdata.created_date < params?.connection_expiry) {
                    console.log("古い", docid)
                    firestore.clear({ docname: docid, clear_listen: false });
                    return;
                }
                // console.log(docdata.created_date)
                // console.log(params?.connection_expiry)
                if (room_id !== undefined && room_id !== docid) {
                    console.log("2つ目の接続は無視、接続完了後に再度listenを呼ぶ")
                    return;
                }
                if (docdata.answer !== undefined) {
                    console.log("すでに回答済の接続要求は無視");
                    return;
                }
                room_id = docid;

                // room_id取得後、その接続が完了するまで次のリクエストは待機させる。
                // 接続エラーで処理が停止するのを防ぐため、タイムアウトが設定されている場合はタイマーを開始する。
                // タイムアウト発生後は次の要求を受け付けられるようになる。
                timer_id = params?.timeout === undefined ? undefined : setTimeout(() => {
                    console.log("timeout " + room_id)
                    firestore.clear({ docname: room_id });
                    reject();
                }, params?.timeout);

                console.log("listening ", room_id)
                const offer = JSON.parse(docdata.offer);
                await pc.setRemoteDescription(offer)
                const answer = await pc.createAnswer()
                await pc.setLocalDescription(answer);
            }
        })
        pc.onicecandidate = e => {
            // console.log(room_id, JSON.stringify(e.caididate)?.substring(0, 10))
            if (e.candidate === null) {
                firestore.update(room_id, {
                    answer: JSON.stringify(pc.localDescription)
                })
            }
        }
        pc.ondatachannel = e => {
            clearTimeout(timer_id);
            e.channel.addEventListener("close", () => {
                console.log("onclose")
            })
            firestore.clear({ docname: room_id });
            resolve(e.channel);
        }
    });
}
