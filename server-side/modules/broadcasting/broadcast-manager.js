/**
     {{{{{{ Please Look at ReadMe first before any code review to know some important termonolgies used in this code .}}}}}}
**/


const PeerFactory = require('../models/factories/peer_factory');
const SignalingServer = require('../signaling/signaling_server');

/**
 * Broadcast manager is responsible for maintaing the list of connecting peers and know how to broadcast messages to them .
 * any connection will be converted to Peer [see Peer.ts]
 * @param {*} http_server 
 * the http server used to initialize the signaling server , 
 * signaling server uses websocket server which in turn needs http server to establish websocket connection 
 * @param {*} config  
 * configuration of this app [ from common/config.js ]
 */
function BroadCastManager(http_server, config) {


    const _peers = [];
    let _genericConnections = [];      // will hold entity with structure like => [ {socket} ] .
    let _peerFactory = null;           // // peer factory resposible for creating appropriate Peer . 
    let _signalingServer = null;       // singaling server used hand in hand to establish webrtc connection  .


    /**
     * Initializes broadcast manager on demand 
     * @param {*} config 
     * Application configuration 
     */
    function init(config) {

        _config = config; // application global configuartion

        _signalingServer = new SignalingServer(this);

        _peerFactory = new PeerFactory();
    }


    /**
     * will get the current maintained peers list 
     */
    this.getPeers = () => {
        return _peers;
    }

    /**
     * will get specific peer with some id 
     * [ Note ] : there may be multi peer instances with same id but with different socket , 
     * and also may be many instances with same id but one is is  broadcaster  and other will be viewer 
     * one user can act as a broadcaster and watcher at the same time .
     * @param isSender  is this peer act as sender or not ? this paramter is optional 
     * and if null or undefiend will lead to get any instance matching this id .
     * @param peerId peer id to search with 
     */
    this.getPeer = (peerId, isSender) => {
        if (isSender != undefined)
            return _peers.find(p => p.id == peerId && p.isSender === isSender);
        else
            return _peers.find(p => p.id == peerId);
    }

    /**
     * create new peer instance with some id and indicator the specify if this peer is sender or viewer 
     * @param peerId is peer id 
     * @param isSender flag indicating if the peer is watcher or broadcaster 
     */
    this.createPeer = (peerId, isSender) => {
        let peer = this.getPeer(peerId, isSender);
        if (!peer) {
            peer = _peerFactory.create(peerId, isSender);
            _peers.push(peer);
        }
        return peer;
    }

    /**
     * generic connection is any web socket connection only without rtc or any identity no peers created it is just 
     * maitaining a socket in a list for different purposes .
     */
    this.createGenericConnection = (socket) => {
        let newCon = { socket };
        _genericConnections.push(newCon);
        return newCon;
    }

    /**
  * destroy the generic connection whenever there is a signal indicating that it is the time to destroy it 
  * and also remove it from the maintained list of generic connections .
  */
    this.destroyGenericConnection = (socket) => {
        let conIndx = _genericConnections.findIndex(c => c.socket === socket);
        if (conIndx >= 0) {
            _genericConnections[conIndx].socket.close();
            _genericConnections.splice(conIndx, 1);
        }
    }

    /**
     * attach the rtc connection to the peer connection list 
     * @param peerId peer id to attach rtc connection to it 
     * @param socket is connection socket 
     * @param rtcConnection is the rtc connection we need to attach to the peer 
     * @param isSender flag indicates if this is a viewer or broadcaster 
     * [Note] : socket + peerId => is the more accurate selector for the peer connection 
     * actually it is the socket is the accurate selector but id required to identify the connection.
     */
    this.addPeerConnection = (peerId, socket, rtcConnection, isSender) => {
        let peer = this.getPeer(peerId, isSender);
        if (!peer) {
            peer = this.createPeer(peerId, isSender);
        }
        peer.addConnection(socket, rtcConnection);
    }


    /**
     * destroys rtc connection and disposes it and
     * and if that was the last connection for peer it will dispose the peer 
     * @param peerId is peer id 
     * @param socket is peer connection socket 
     * @param rtcConnection is rtc connection 
     * [Note] you can destroy with peerId + ( socket or rtcConnection )
     */
    this.destroyPeerConnection = (peerId, socket, rtcConnection) => {
        let peer = this.getPeer(peerId);
        if (peer) {
            peer.destroyConnection(socket, rtcConnection);
            if (!peer.connections.length) {
                this.destroyPeer(peer);
            }

        }
    }

    /**
     * Notify the subscribers for the current publisher peer that the broadcast has been ended 
     * @param peerId is broadcaster id 
     */
    this.notifyBroadcastEndedFor = (peerId) => {
        let peer = this.getPeer(peerId, true); // here issender parameter is always true
        if (peer) {
            peer.receivers.forEach(rec => {
                if (rec.socket && rec.socket.readyState === rec.socket.OPEN) {
                    rec.socket.send(JSON.stringify({ broadCastEnded: true, broadCastOwnerId: peerId }));
                }
            });
        }
    }

 
 
 
    /**
     * get rtc connection for the peer 
     * @param peerId peer id 
     * @param socket is connection socket and it is very important to indicate which connection to retreive its 
     * corresponding rtc connection
     * @isSender indicates if the peer is sender or watcher 
     */
    this.getPeerRtcConnection = (peerId, socket, isSender) => {
        let peer = _peers.find(p => p.id == peerId && p.isSender === isSender);
        if (peer) {
            let connection = peer.getPeerConnection(socket);
            if (connection) {
                return connection.rtcConnection;
            }
        }
    }

    /**
     * attach the track in current peer tracks[] there may be audio tracks or videos tracks or both of them 
     * [Note] : each connection has list of tracks may be user opened many broadcast as the same time so has many connection 
     * and hence each connection has it own tracks list 
     * @param peerId peer id 
     * @param socket connection socket 
     * @param track track to attach to peer tracks 
     */
    this.addPeerTrack = (peerId, socket, track) => {
        let peer = _peers.find(p => p.id == peerId);
        if (peer) {
            let connection = peer.getPeerConnection(socket);
            if (connection) {
                connection.tracks.push(track);
            }
        }
    }

    /**
     * attach data channel to the peer connection defined by socket and id 
     * @param peerId peer id .
     * @param socket connection socket .
     * @param channel data channel you want to attach .
     */
    this.addPeerDataChannel = (peerId, socket, channel) => {
        let peer = _peers.find(p => p.id == peerId);
        if (peer) {
            let connection = peer.getPeerConnection(socket);
            if (connection) {
                connection.channels.push(channel);
            }
        }
    }

    /**
     * destroys the peer and its related connections 
     * @param peer peer to destroy 
     */
    this.destroyPeer = (peer) => {
        if (peer) {
            const peerIndx = _peers.findIndex(p => p === peer);
            if (peerIndx >= 0) {
                peer.end(); // end will closes all sockets and rtc connection that are opened later 
                _peers.splice(peerIndx, 1);
            }
        }
    }


    /**
     * let the watcher or viewer to unsubscribe from some publisher leads to remove the publsiher from 
     * receivers list of subscriber and also remove the subscriber from the receivers list of publisher 
     * @param subscriber the subscriber that want unsubscribe , the structure of  subscriber will be   : { id, socket } 
     * @param publisherPeerId  publisher peer id that the subscriber want to unsubscribe from 
     **/
    this.unSubscribe = (subscriber, publisherPeerId) => {
        let publisherPeer = this.getPeer(publisherPeerId, true); // get the publsiher peer 
        if (publisherPeer) {

            let subscriberPeer = this.getPeer(subscriber.id, false); // get the subscriber peer 
            if (subscriberPeer) {
                // remove publisher from recevivers list of subscriber
                subscriberPeer.receivers.splice(subscriberPeer.receivers.indexOf(publisherPeer));
                let subscriberConnectionIndx = publisherPeer.receivers.findIndex(c => c.socket === subscriber.socket && c.id === subscriber.id);
                if (subscriberConnectionIndx >= 0) {
                    // remove subscriber from the receivers list of publsiher 
                    publisherPeer.receivers.splice(subscriberConnectionIndx, 1);
                    console.log(`peer with id ${subscriber.id} has left broadcast from ${publisherPeerId}`);
                }
                this.sendViewersInfo(publisherPeerId);
                this.cleanUpPeersReceivers();
            }
        }
    }


    /**
     * let the watcher or viewer to subscribe to some publisher leads to adds the publsiher to 
     * receivers list of subscriber and also adds the subscriber to the receivers list of publisher 
     * @param subscriber the subscriber that want subscribe ,  the structure of  subscriber will be  : { id, socket } 
     * @param publisherPeerId  publisher peer id that the subscriber want to unsubscribe from 
     **/
    this.subscribe = (subscriber, publisherPeerId) => {
        let publisherPeer = this.getPeers().find(p => p.id == publisherPeerId && p.isSender);
        if (publisherPeer && publisherPeer.isSender) {

            let subscriberPeer = this.getPeer(subscriber.id, false);
            if (subscriberPeer && !subscriberPeer.isSender) {
                // adds subscriber to recevivers list of publisher
                publisherPeer.receivers.push(subscriber);

                // adds all publisher connections to subscriber receivers list 
                publisherPeer.connections.forEach(c => {
                    subscriberPeer.receivers.push({ id: publisherPeerId, socket: c.socket, rtConnection: c.rtConnection });
                });
                console.log(`peer with id ${subscriber.id} has joined broadcast from ${publisherPeerId}`);
                this.cleanUpPeersReceivers();
                this.sendViewersInfo(publisherPeerId);
            }
        }
        else {
            throw `Publisher with id ${publisherPeerId} not found`;
        }
    }


    /**
     * broadcast informations to live owner related to current live e.g :  what is the number of video viewers now .
     * @param publisherPeerId publisher id to send info to its connections 
     */
    this.sendViewersInfo = (publisherPeerId) => {

        let publisherPeer = this.getPeer(publisherPeerId, true);
        if (publisherPeer) {
            // send info to all the connections of the publsiher 
            publisherPeer.connections.forEach(con => {
                if (con.rtcConnection && con.rtcConnection.connectionState === 'connected') {
                    let viewersCount = publisherPeer.receivers.filter(function (r) { return r.socket && r.socket.readyState === r.socket.OPEN }).length;
                    con.socket.send(JSON.stringify({ viewersInfo: { count: viewersCount } }));
                }
            });
        }
    }

    /**
     * Cleans up the maintained list of peers 
     * for example if some peer has a receiver that its connection [ socket / rtc ] is closed 
     * so we need to remove this from receivers list 
     */
    this.cleanUpPeersReceivers = () => {

        _peers.forEach(p => {

            p.receivers.filter(r => /*(r.socket && r.socket.readyState !== r.socket.OPEN) ||*/
                (r.rtcConnection && r.rtcConnection.readyState !== r.rtcConnection.OPEN)).forEach(r => {

                    let receiverIndx = p.receivers.findIndex(rc => rc === r);
                    if (receiverIndx >= 0) {
                        p.receivers.splice(receiverIndx, 1);
                        console.log(`some peer session with id ${r.id} has been left broadcast because he is offline`);
                    }

                });

        });
    }

    /**
     * broadcast generic message on all data channels of the sender receivers ,
     *  its structure not defined so it is open to broadcast any object .
     * @param senderPeerId sender peer id who sends this message .
     * @param dataObj is object we want to broadcast as message .
     * @param includeSelf is a flag indicates if message will be sent to the send too .
     */
    this.broadCastMessageToReceivers = (senderPeerId, dataObj, includeSelf) => {
        if (senderPeerId && dataObj) {
            let peer = this.getPeer(senderPeerId);
            if (peer) {
                peer.receivers.forEach(r => {
                    let receiverPeer = this.getPeer(r.id);
                    if (receiverPeer) {
                        receiverPeer.connections.forEach(rpc => {
                            rpc.channels.forEach(rpcc => {
                                if (rpcc.readyState === "open") {
                                    dataObj.senderId = senderPeerId;
                                    rpcc.send(JSON.stringify(dataObj));
                                }
                            })
                        });
                    }

                });

                if (includeSelf)
                    peer.connections.forEach(pc => {
                        pc.channels.forEach(pcc => {
                            if (pcc.readyState === "open") {
                                dataObj.senderId = senderPeerId;
                                pcc.send(JSON.stringify(dataObj));
                            }
                        })
                    });

            }
        }
    }

    /**
     * start broadcast manager by initializing it , signing the live persistent manager first before starting the  signaling server .
     * signing live persistent manager is just checking the identity of this app with web api server 
     * if the sign in process succeeded then singaling server starts it work by listening to requests 
     * and accepting web sockets connection which may be in turn  will be upgraded to rtc connection .
     */
    this.start = async () => {
        try {
            init.call(this, config);
           // await _livePersistentManager.signInSignalingServer();
            _signalingServer.start(http_server, config.SignalingServer.Port, config.SignalingServer.Host);
        }
        catch (e) {
            console.log(e);
        }
    }

};


module.exports = BroadCastManager;
