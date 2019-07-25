let ws_connection = null,
    peer_connection = null,
    data_channel = null,
    wsUrl = null,
    connectBtn = null,
    disconnectBtn = null,
    sendBtn = null,
    msgInput = null,
    videoElem,
    broadcasterId = null,
    id = Date.now(),
    mediaStream = null,
    configuration = {
        iceServers: [{
            urls: ["stun:stun.l.google.com:19302"]
        }]
    };

$(_ => {

    connectBtn = $("#connectBtn");
    disconnectBtn = $('#disConnectBtn');
    sendBtn = $("#sendBtn");
    msgInput = $("#msgInput");
    videoElem = $("#video")[0];

    $("#id").val(id);
    connectBtn.click(connect);
    disconnectBtn.click(disconnect);
    sendBtn.click(sendMessage);

});



function connect() {

    let isSender = $('#isSender').prop('checked');
    broadcasterId = $('#broadcaster').val();
    if (!isSender && !broadcasterId)
        return alert(`please provide us broadcaster id to receive from `);


    if (!ws_connection || ws_connection.readyState === ws_connection.CLOSED || ws_connection.readyState === ws_connection.CLOSING) {

        wsUrl = `ws://localhost:8000?peerId=${$("#id").val()}&isSender=${isSender}&broadCastOwnerId=${broadcasterId}`;


        // initialize web socket signaling server
        initWSConnection()
            // initialize Rtc connection
            .then(wsconnection => {
                if (isSender) {
                    getMediaStream(stream => {
                        initPeerConnection(wsconnection, stream);
                    }, error => console.error(error));
                } else {
                    onViewBroadcast(); // with assumption that the broadcaster will be online 
                }

            })
            .catch(err => console.log(err));

    } else {
        console.log(`already connected `);
    }
}

function disconnect() {
    if (ws_connection && ws_connection.readyState === ws_connection.OPEN) {
        if (peer_connection && peer_connection.readyState === peer_connection.OPEN) {
            onCancelView();
            ws_connection.close();
            peer_connection.close();
        }
    }
}

function sendMessage() {
    if (!data_channel || data_channel.readyState !== 'open')
        return console.error('connect first !');

    data_channel.send(JSON.stringify({
        'msg': msgInput.val()
    }));
}

function getMediaStream(successCallback, errorCallback) {
    return navigator.getUserMedia({
        audio: true,
        video: true
    }, successCallback, errorCallback);
}


function initWSConnection() {

    return new Promise((resolve, reject) => {

        ws_connection = new WebSocket(wsUrl);

        ws_connection.onerror = _ => {
            console.error(`an error occured`);
            reject('an error occured');
        };

        ws_connection.onopen = _ => {
            console.log(`connection opened`);
            resolve(ws_connection);
        };

        ws_connection.onclose = _ => {
            console.log(`connection closed`);
        };

        ws_connection.onmessage = msgEvt => {
            try {
                let data = JSON.parse(msgEvt.data);
                if (data) {

                    const {
                        candidate,
                        sdp
                    } = data;
                    if (candidate) {
                        peer_connection.addIceCandidate(candidate);
                    } else if (sdp) {
                        peer_connection.setRemoteDescription(sdp);
                    } else
                        handleGenericMessages(data);


                }
            } catch (e) {
                console.log(`invalid received data !`);
            }
        };

    });
}

function handleGenericMessages(data) {
    let {
        broadCastEnded,
        broadCastOwnerId,
        broadCastReady,
        broadCastReadyMessage
    } = data;
    if (broadCastEnded) {
        if (videoElem.srcObject) {
            stopTracks();
            return alert(` broadcast from peer ${broadCastOwnerId} has been ended !`);
        }
    } else if (broadCastReady === true) {
        initPeerConnection(ws_connection);
    } else if (broadCastReady === false) {
        if (ws_connection.readyState === ws_connection.OPEN)
            ws_connection.close();
        return alert(broadCastReadyMessage);
    }

}

function initPeerConnection(wsconnection, stream) {

    if (!wsconnection || wsconnection.readyState !== wsconnection.OPEN)
        return console.error('connect to signaling server first !');

    peer_connection = new RTCPeerConnection(configuration);
    // if broker server called createChannel() then the following line will be usefull and uncomment it 
    // peer_connection.ondatachannel = evt => onDataChannel(evt);
    peer_connection.onicecandidate = evt => onIceCandidate(evt, wsconnection);

    if (stream)
        bindMediaStreamToConnection(peer_connection, stream);
    else
        peer_connection.ontrack = evt => {
            if (mediaStream) {
                mediaStream.addTrack(evt.track.clone());
            } else {
                mediaStream = new MediaStream();
                videoElem.srcObject = mediaStream;
                videoElem.play();
            }

        }


    peer_connection.onconnectionstatechange = function (event) {
        switch (peer_connection.connectionState) {
            case "connected":
                console.log('rtc connected');
                // The connection has become fully connected
                break;
            case "disconnected":
            case "failed":
                console.error('rtc disconnected');
                // One or more transports has terminated unexpectedly or in an error
                break;
            case "closed":
                console.log('rtc closed');
                // The connection has been closed
                break;
        }
    };

    data_channel = peer_connection.createDataChannel("chatting");
    data_channel.onopen = _ => console.log('data channel opend !');
    data_channel.onclose = _ => console.log('data channel closed');
    data_channel.onmessage = evt => onDataChannelMessage(evt.data);

    peer_connection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        })
        .then(offer => {
            peer_connection.setLocalDescription(offer).then(_ => {
                wsconnection.send(JSON.stringify({
                    sdp: peer_connection.localDescription
                }));
            })
        });






}



function onCancelView() {

    if (ws_connection && ws_connection.readyState === ws_connection.OPEN) {
        ws_connection.send(JSON.stringify({
            view: {
                leave: true,
                broadcastOwnerPeerId: broadcasterId
            }
        }));
        ws_connection.close();
        if (peer_connection && peer_connection.readyState === peer_connection.OPEN)
            peer_connection.close();

        stopTracks();
    }
}

function stopTracks() {
    if (videoElem.srcObject)
        videoElem.srcObject.getTracks().forEach(track => track.stop())
}

window.onunload = onCancelView;

function onViewBroadcast() {
    if (ws_connection && ws_connection.readyState === ws_connection.OPEN) {
        ws_connection.send(JSON.stringify({
            view: {
                leave: false,
                broadcastOwnerPeerId: broadcasterId
            }
        }));
    }
}


function onIceCandidate(evt, wsconnection) {

    if (!evt || !evt.candidate) return;
    console.log(evt.candidate.candidate);
    wsconnection.send(JSON.stringify({
        candidate: evt.candidate
    }));

}


function onDataChannelMessage(dataStr) {

    try {
        let data = JSON.parse(dataStr);
        if (data) {
            const {
                senderId,
                msg
            } = data;
            if (msg) {
                $("body").append(`<div>${senderId == id ? 'You' : senderId} : ${msg}</div>`);
            }
        }
    } catch (e) {
        console.log(`invalid received data !`);
    }
}

function bindMediaStreamToConnection(rtcConnection, stream) {
    if (stream) {
        stream.getTracks().forEach(track => {
            rtcConnection.addTrack(track);
        });
        videoElem.srcObject = stream;
        videoElem.muted = true;
        videoElem.play();
        // peer_connection.addStream(stream);

    }

}