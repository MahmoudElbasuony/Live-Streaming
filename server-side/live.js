const config = require('./modules/common/config');
const BroadcastManager = require('./modules/broadcasting/broadcast-manager');
const express = require('express');
const app = express();
const path = require('path');


// this will be used to serve POC files only 
// Remove it on production 
app.use(express.static(path.resolve('client-side')));

// use express http server for broadcasting stuff
const http_server = app.listen(config.SignalingServer.Port, config.SignalingServer.Host, () => {
    const url = http_server.address();
    console.log(`http server listening to : ${url.address} : ${url.port}`);
    const broadCastManager = new BroadcastManager(http_server, config);
    // set up broadcast manager 
    broadCastManager.start();

});






