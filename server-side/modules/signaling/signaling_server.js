/**
     {{{{{{ Please Look at ReadMe first before any code review to know some important termonolgies used in this code .}}}}}}
**/



const ws = require('ws');
const {
    EventEmitter
} = require('events');
const {
    getValueFromQueryString
} = require('../common/helpers/url_helper');
const util = require('util');
const {
    RTCPeerConnection
} = require('wrtc');

function SignalingServer(broadCastManager) {

    let _httpserver = null;
    let _wsserver = null;
    let _broadCastManager = broadCastManager;
 

    // initialize this object as event emitter 
    EventEmitter.call(this);



    // starts web socket server given some http server 
    function startWSServer(httpserver) {
        let wss = new ws.Server({
            server: httpserver
        });
        const url = wss.address();
        console.log(`websocket server started at  : ${url.address} : ${url.port}`)
        return wss;
    }


    // indicator that specify if the signaling serve has already started or not 
    this.isStarted = false;


    /**
     * Starts the signaling server 
     * @param httpServer http server required to start web socket server
     * @param port port used for signaling server
     * @param host host used for signaling server
     */
    this.start = (httpserver, port, host) => {

        _httpserver = httpserver;

        let _this = this;


        //////////////////////// Validation  Before Starting \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\

        if (_this.isStarted)
            return console.warn('singaling server already started ');

        // only port numbers 0 to 1023 are reserved for privileged services and designated as well-known ports
        if (typeof (port) !== 'number' || (port < 1023))
            return console.error(`port should be valid number greater than 1023 !`);
        if (!host)
            return console.error(`host required`);


        // start websocket server 
        _wsserver = startWSServer(httpserver);
        // register all related web socket server events 
        registerWSServerEvents(_wsserver);


        // on upgarding from http connection to websocket connection 
        _httpserver.on("upgrade", (request, socket) => {
            // get the peer identifier from the query string 
            let peerId = getValueFromQueryString(request.url, 'peerId');
            // if not provided then close the request 
            if (!peerId)
                socket.close();
        });


    }

    /** Websocket server events registeration  */
    function registerWSServerEvents(wss) {
        if (!wss)
            return;
        // on new web socket connection 
        wss.on("connection", onWSNewConnection);
        // on start listening for requests 
        wss.on("listening", onWSLisenting);
        // on any error
        wss.on("error", onWSError);
    }

    /** on new websocket connection  */
    function onWSNewConnection(socket, request) {

        console.log(`new connection`);

        registerSocketEvents(socket, request);

        // initialization request to setup an environment for the connected peer 
        // if it was a watcher or a publisher 

        let peerId = getValueFromQueryString(request.url, 'peerId');
        let isSender = getValueFromQueryString(request.url, 'isSender') === "true" ? true : false;
        // indicates which publsiher you want to watch to 
        let broadCastOwnerId = getValueFromQueryString(request.url, 'broadCastOwnerId');

         // here we create or get the peer that will act as watcher or publisher 
         let peer = getOrCreatePeer(peerId, socket, isSender, broadCastOwnerId);
         // if it was as publsiher peer 
         if (isSender) {
             console.log(`new peer connected with id : ${peer.id} as broadcaster`);
         } else {
             console.log(`new peer connected with id : ${peer.id} as viewer`);
         }
       
    }

    /** on web socket server start listening */
    function onWSLisenting() {
        console.log(`webcoket start listening to : ${_wsserver.address().address}`);
        _this.isStarted = true;
    }


    /**  on any error in web socket server */
    function onWSError(err) {
        console.log(err.message);
    }

    /**  socket level event registeration */
    async function registerSocketEvents(socket, request) {

        let peerId = getValueFromQueryString(request.url, 'peerId');
        // indicates if the connection peer is watcher or publisher .
        let isSender = getValueFromQueryString(request.url, 'isSender') === "true" ? true : false;
        // indicates if the connection for live [ watching or broadcasting ] or it is just a generic web socket connection 

        // on socket connection close 
        socket.on("close", (code, reason) => onSocketClose(socket, code, reason, peerId, isSender));
        // on socket connection error 
        socket.on("message", msg => onSocketMessage(peerId, socket, request, msg, isSender));
    }

    /**
     * On socket message event handler 
     * @param {*} peerId peer id 
     * @param {*} socket peer connection socket 
     * @param {*} request request 
     * @param {*} msg     message the peer has sent
     * @param {*} isSender  is watcher or publisher peer
     */
    async function onSocketMessage(peerId, socket, request, msg, isSender) {
        try {
            let data = JSON.parse(msg);
            if (data) {

                const {
                    candidate,
                    sdp
                } = data;
                if (candidate || sdp)
                    await handleRtcMessages(peerId, sdp, candidate, socket, isSender);
                else
                    await handleGenericMessages(data, peerId, socket, request, isSender);

            }
        } catch (e) {
            console.error(e);
        }
    }

    /**  on socket connection close event handler
     */
    async function onSocketClose(socket, code, reason, peerId, isSender) {


        // else it is a socket connection for webrtc protocol 
        // get the peer of that connection 
        const peer = _broadCastManager.getPeer(peerId, isSender);

        if (peer) {

            console.log(`websocket connection closed with code ${code}  and reason ${reason}`);


            if (isSender) {
                // and then notify them that the broadcast has been ended for some peer  
                _broadCastManager.notifyBroadcastEndedFor(peerId);
            }

            // then cleanup the receivers for each peer regarding this peer 
            _broadCastManager.cleanUpPeersReceivers();
            // destroy this peer connection [Note: it will remove this peer if that was the last connection for him ]
            _broadCastManager.destroyPeerConnection(peerId, socket, isSender);


        }
    }


    /**
     * Creates rtc peer connection and registers its events 
     */
    function getOrCreatePeer(peerId, socket, isSender, broadCastOwnerId) {

        // get peer or create it if it is not existing
        let peer = _broadCastManager.getPeer(peerId, isSender) || _broadCastManager.createPeer(peerId, isSender);
        // create rtc connection 
        let peer_connection = new RTCPeerConnection(_config.RTCConfig);
        // attahc rtc connection events handlers 
        peer_connection.onicecandidate = evt => onIceCandidate(evt, socket);
        peer_connection.ondatachannel = evt => onDataChannel(evt, peerId, socket);
        peer_connection.onconnectionstatechange = evt => onRtcConnectionStateChange(peerId, socket, peer_connection, peer.isSender, evt);
        peer_connection.ontrack = evt => onAddTrack(peerId, socket, evt);
        // after creating rtc connection attach it to current peer 
        _broadCastManager.addPeerConnection(peerId, socket, peer_connection, isSender);
        // if it was a watcher peer then bind tracks from the publsiher to it 
        if (!isSender)
            bindTracksToViewer(broadCastOwnerId, peerId, isSender);
        return peer;
    }


    /**
     * attachs all tracks from the first rtc connection of the publisher to all of its receivers rtc connections 
     * [ publisher => subscribers  ]
     */
    function bindTracksToViewer(broadCastOwnerId, peerId, isSender) {

        let broadcastOwnerPeer = _broadCastManager.getPeer(broadCastOwnerId, true);
        let receiverPeer = _broadCastManager.getPeer(peerId, false);

        if (receiverPeer && broadcastOwnerPeer) {
            if (broadcastOwnerPeer.connections.length) {
                let firstBroadcastOwnerConnection = broadcastOwnerPeer.connections[0];

                if (receiverPeer.connections.length) {
                    receiverPeer.connections.forEach(con => {
                        let receiverRTCConnection = con.rtcConnection;
                        if (receiverRTCConnection) {
                            firstBroadcastOwnerConnection.tracks.forEach(track => {
                                receiverRTCConnection.addTrack(track.clone());
                            });
                        }
                    });
                }
            }
        }

    }

    /**
     * handles events of web rtc protocol 
     */
    async function handleRtcMessages(peerId, sdp, candidate, socket, isSender) {

        let peer_connection = _broadCastManager.getPeerRtcConnection(peerId, socket, isSender);
        if (candidate) {
            //console.log(`candidate  : ${candidate.candidate}`);
            await peer_connection.addIceCandidate(candidate);
        } else if (sdp) {
            //console.log(`sdp  : ${sdp.sdp}`);
            await peer_connection.setRemoteDescription(sdp);
            await peer_connection.setLocalDescription(await peer_connection.createAnswer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            }));
            socket.send(JSON.stringify({
                sdp: peer_connection.localDescription
            }));
        }

    }

    /**
     * handles event when rtc connection state changed 
     */
    async function onRtcConnectionStateChange(peerId, socket, peer_connection, isSender, event) {
        switch (peer_connection.connectionState) {
            case "connected":
                // The connection has become fully connected
                break;
            case "disconnected":
            case "failed":
            case "closed":
                if (isSender)
                    _broadCastManager.notifyBroadcastEndedFor(peerId);
                _broadCastManager.destroyPeerConnection(peerId, socket, peer_connection);
                break;
        }
    }

    /////////////////////// WebRTC protocol event handlers \\\\\\\\\\\\\\\\\\\\\\\\\\\

    /**
     * handles when receiving the current peer ice candicates from stun server not remote peer 
     */
    function onIceCandidate(evt, socket) {

        if (!evt || !evt.candidate) return;

        socket.send(JSON.stringify({
            candidate: evt.candidate
        }));

    }

    /**
     * handles event when new track is added to current peer connection from remote peer 
     */
    function onAddTrack(peerId, socket, evt) {
        _broadCastManager.addPeerTrack(peerId, socket, evt.track);
    }

    /**
     * handles event when new data channel created 
     */
    function onDataChannel(evt, peerId, socket) {

        // get data channel 
        let data_channel = evt.channel;

        // attach it to current peer 
        _broadCastManager.addPeerDataChannel(peerId, socket, data_channel);

        if (!data_channel)
            return console.error('data channel not created !');

        // handler for any error 
        data_channel.onerror = _ => {
            console.error(`data channel : an error in channel occured`);
        };

        // when data channel opened 
        data_channel.onopen = _ => {
            console.log(`data channel : channel opened`);
        };

        // when data channel closed 
        data_channel.onclose = _ => {
            console.log(`data channel : channel closed`);
        };

        // on data channel received message from the remote peer 
        data_channel.onmessage = msgEvt => {

            try {
                let data = JSON.parse(msgEvt.data);
                if (data) {
                    if (peerId) {
                        // then broadcast it to the receivers of current sender peer 
                        _broadCastManager.broadCastMessageToReceivers(peerId, data, true);
                    }
                }
            } catch (e) {
                console.log(`invalid received data !`);
            }
        };
    }

    /**
     * handles event of receiving custom messages on web socket connection 
     */
    async function handleGenericMessages(dataObj, peerId, socket, request, isSender) {

        let {
            view
        } = dataObj;

        if (view) { // if it is live view related message

            if (view.leave) { // if it was a leaving view request 

                // this will unsubscribe the current peer from watching the live video 
                // [Note] : here the live owner or broadcaster may act as watcher and receiver at the same time 
                // may be open tab for broadcasting and one tab for watching 
                // or may be logged from two different devices  so we needed here a coket to identify here 
                // which peer connection to unsubscribe 
                _broadCastManager.unSubscribe({
                    id: peerId,
                    socket
                }, view.broadcastOwnerPeerId);
                
            } else { // else it was a view request from watcher to watch live video 

                try {
                    // subscribe this peer with specified broadcaster 
                    _broadCastManager.subscribe({
                        id: peerId,
                        socket
                    }, view.broadcastOwnerPeerId);
                    // and send message to watcher that he is ready now to watch live video from selected publisher 
                    socket.send(JSON.stringify({
                        broadCastReady: true,
                        broadCastReadyMessage: `ready now to receive broadcast from publisher : ${view.broadcastOwnerPeerId}`
                    }));
                } catch (e) {
                    // failed to subscribe to selected live video 
                    socket.send(JSON.stringify({
                        broadCastReady: false,
                        broadCastReadyMessage: e
                    }));
                }
            }

        }


    }

};


util.inherits(SignalingServer, EventEmitter);

module.exports = SignalingServer;