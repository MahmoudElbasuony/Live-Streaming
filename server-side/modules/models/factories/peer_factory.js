const Peer = require('../peer');

class PeerFactory {

    /**
     * Creates new instance of peer 
     * @param {*} peerId peer id
     * @param {*} isSender flag indicates if the peer is send or watcher 
     */
    create(peerId, isSender) {

        if (!peerId)
            peerId = Date.now();
        let newPeer = new Peer(peerId);
        newPeer.isSender = isSender;
        return newPeer;

    }

}

module.exports = PeerFactory;