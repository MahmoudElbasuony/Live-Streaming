const Config = {
    SignalingServer: {
        Port: 8000,
        Host: 'localhost',
        SignInUrl : 'api/auth/signalingserver/signin',
        ServerKey : 'ss123456',
    },
    RTCConfig: {
        iceServers: [

            { urls: ["stun:stun.l.google.com:19302"] }
        ]
    }
}

module.exports = Config;