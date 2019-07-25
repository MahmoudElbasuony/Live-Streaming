class Peer {
    constructor(id) {
        this.id = id;
        this.isSender = false;
        this.connections = []; // { socket, rtConnection , tracks : [] , channels : []  }
        this.receivers = []; // [ { id, socket, rtConnection } ]
    }



    _buildConnectionFilter(socket, rtcConnection) {
        let filter = null;
        if (socket && rtcConnection)
            filter = c => c.socket === socket && c.rtcConnection === rtcConnection;
        else if (socket && !rtcConnection)
            filter = c => c.socket === socket;
        else if (!socket && rtcConnection)
            filter = c => c.rtcConnection === rtcConnection;
        return filter;
    }

    /**
     * add connection to current peer 
     * @param {*} socket 
     * @param {*} rtcConnection 
     */
    addConnection(socket, rtcConnection) {
        this.connections.push({ socket, rtcConnection , tracks : [] , channels : [] });
    }

    /**
     * destroy some connection of the current peer
     * if it was the last connection for this peer then will dispose the peer itself
     * @param {*} socket 
     * @param {*} rtcConnection 
     */
    destroyConnection(socket, rtcConnection) {
        const filter = this._buildConnectionFilter(socket, rtcConnection);

        if (filter) {
            const conIndex = this.connections.findIndex(filter);
            if (conIndex >= 0) {
                let connection = this.connections[conIndex];
                connection.socket.close();
                connection.rtcConnection.close();
                this.connections.splice(conIndex, 1);
            }
        }
        else {
            this.end();
        }
    }


    /** reterive peer connection { socket, rtConnection , tracks : [] , channels : []  }*/ 
    getPeerConnection(socket, rtcConnection) {
        return this.connections.find(this._buildConnectionFilter(socket, rtcConnection))
    }

    /**
     * ends all peer connections [ rtc or socket ]
     */
    end() {

        if (this.connections.length) {
            this.connections.forEach(c => {
                this.destroyConnection(c);
            });
        }
    }

    /** returns the peer identifier  */
    toString() {
        return this.id;
    }
}

module.exports = Peer;